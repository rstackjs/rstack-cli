#!/usr/bin/env python3
"""Compare two built Rstack CLIs on an immutable Rsbuild checkout."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import re
import statistics
import subprocess
import tarfile
import tempfile
import time


def run(args, cwd=None):
    return subprocess.check_output(args, cwd=cwd, text=True).strip()


def digest(data):
    return hashlib.sha256(data).hexdigest()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--before', type=Path, required=True)
parser.add_argument('--after', type=Path, required=True)
parser.add_argument('--rsbuild', type=Path, required=True)
parser.add_argument('--commit', default='ad8388c5befec29f5ccf765857faf126c1f05d5d')
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--runs', type=int, default=7)
parser.add_argument('--warmups', type=int, default=2)
parser.add_argument('--workers', type=int, default=4)
parser.add_argument('--exclude', action='append', default=[])
parser.add_argument('--resume-audit', action='store_true', help='Preserve completed timings and finish output audits')
parser.add_argument('--file-list', type=Path, help='JSON array of already-discovered relative file paths')
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
selected = json.loads(args.file_list.read_text()) if args.file_list else None
if selected is not None:
    assert selected and len(set(selected)) == len(selected)
    assert all(not Path(p).is_absolute() and '..' not in Path(p).parts for p in selected)
    (args.output / 'files.json').write_text(json.dumps(selected, indent=2) + '\n')
patterns = selected if selected is not None else ['.']
node = run(['which', 'node'])
archive = subprocess.check_output(['git', 'archive', args.commit], cwd=args.rsbuild)
roots = {'before': args.before.resolve(), 'after': args.after.resolve()}
previous = json.loads((args.output / 'results.json').read_text()) if args.resume_audit else None
workspace = Path(previous['workspace']) if previous else Path(tempfile.mkdtemp(prefix='rstack-rsbuild-bench-'))
inputs = {}
for label, root in roots.items():
    target = workspace / label
    if previous:
        assert target.is_dir()
        inputs[label] = target
        continue
    target.mkdir()
    with tarfile.open(fileobj=io.BytesIO(archive)) as files:
        files.extractall(target)
    modules = target / 'node_modules'
    modules.mkdir()
    (modules / 'rstack').symlink_to(root / 'packages/rstack', target_is_directory=True)
    # The same heading-case implementation is used by both configurations.
    (modules / 'heading-case').symlink_to(args.after.resolve() / 'node_modules/heading-case', target_is_directory=True)
    inputs[label] = target

report = {
    'rsbuildCommit': run(['git', 'rev-parse', args.commit], args.rsbuild),
    'beforeCommit': run(['git', 'rev-parse', 'HEAD'], args.before),
    'afterCommit': run(['git', 'rev-parse', 'HEAD'], args.after),
    'afterDiffSha256': digest(subprocess.check_output(['git', 'diff', 'HEAD', '--', 'packages/rstack', 'pnpm-workspace.yaml', 'pnpm-lock.yaml'], cwd=args.after)),
    'archiveSha256': digest(archive),
    'node': run([node, '--version']),
    'pnpm': {label: run(['pnpm', '--version'], root) for label, root in roots.items()},
    'platform': platform.platform(),
    'cpu': run(['sysctl', '-n', 'machdep.cpu.brand_string']),
    'logicalCpus': os.cpu_count(),
    'memoryBytes': int(run(['sysctl', '-n', 'hw.memsize'])),
    'workspace': str(workspace),
    'versions': {},
    'workers': args.workers,
    'exclude': args.exclude,
    'warmupsPerVariant': args.warmups,
    'samples': [],
    'commands': {},
    'inputSelection': {'fileList': str(args.file_list.resolve()) if args.file_list else None, 'count': len(selected) if selected is not None else None},
    'builtDistSha256': {},
}
for label, root in roots.items():
    built_hash = hashlib.sha256()
    for file in sorted((root / 'packages/rstack/dist').rglob('*')):
        if file.is_file():
            built_hash.update(str(file.relative_to(root / 'packages/rstack')).encode())
            built_hash.update(file.read_bytes())
    report['builtDistSha256'][label] = built_hash.hexdigest()
    report['versions'][label] = {
        name: json.loads((root / subpath / 'package.json').read_text())['version']
        for name, subpath in {
            'rstack': Path('packages/rstack'),
            'prettier': Path('node_modules/prettier'),
            'swc': Path('packages/rstack/node_modules/@swc-next') / ('parser' if label == 'before' else 'formatter-prettier-plugin'),
        }.items()
    }

if previous:
    for field in ['rsbuildCommit', 'beforeCommit', 'afterCommit', 'archiveSha256', 'node', 'pnpm', 'workers', 'versions', 'builtDistSha256', 'inputSelection']:
        assert report[field] == previous[field], f'Cannot resume with changed {field}'
    report = previous


def measure(label, phase, index, mode='--check'):
    command = [node, str(roots[label] / 'packages/rstack/bin/rs.js'), 'fmt', *patterns, *('!' + name for name in args.exclude), mode, '--no-cache', '--parallel-workers', str(args.workers)]
    if phase != 'output-audit':
        report['commands'][label] = command if selected is None else [*command[:3], '<each path in files.json as one argument>', *command[3 + len(patterns):]]
    start = time.perf_counter_ns()
    result = subprocess.run(command, cwd=inputs[label], capture_output=True, text=True,
                            env={**os.environ, 'NO_COLOR': '1'})
    elapsed = (time.perf_counter_ns() - start) / 1e6
    sample = {'label': label, 'phase': phase, 'iteration': index, 'wallMs': elapsed,
              'exitCode': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}
    counts = re.findall(r'(?:Checked|of) (\d+) files|\((\d+) files(?:,|\))', result.stdout + result.stderr)
    sample['fileCount'] = int(next(value for value in counts[-1] if value)) if counts else None
    report['samples'].append(sample)
    print(f'{phase} {index} {label}: {elapsed:.2f} ms, exit {result.returncode}', flush=True)
    (args.output / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
    # --check returns 1 for formatting differences; 2 is an actual error.
    if result.returncode not in (0, 1):
        print(result.stdout, result.stderr, flush=True)
    if selected is not None:
        assert sample['fileCount'] == len(selected), f'Coverage mismatch: {sample}'
        assert result.returncode in (0, 1), f'Formatting error: {sample}'
        if phase in ('output-audit', 'idempotence-audit'):
            assert result.returncode == 0, f'Output/idempotence audit failed: {sample}'
    return sample


for phase, count in ([] if previous else [('warmup', args.warmups), ('measure', args.runs)]):
    for index in range(count):
        for label in (['before', 'after'] if index % 2 == 0 else ['after', 'before']):
            measure(label, phase, index + 1)

report['mediansMs'] = {
    label: statistics.median(s['wallMs'] for s in report['samples'] if s['label'] == label and s['phase'] == 'measure')
    for label in roots
}
report['afterChangePercent'] = (report['mediansMs']['after'] / report['mediansMs']['before'] - 1) * 100
report['beforeOverAfter'] = report['mediansMs']['before'] / report['mediansMs']['after']
# --check must not change any tracked input; audit writes only after all timings.
# Resume is valid only while both copies still contain the original input.
with tarfile.open(fileobj=io.BytesIO(archive)) as files:
    originals = {f.name: files.extractfile(f).read() for f in files if f.isfile()}
for label, target in inputs.items():
    for name, content in originals.items():
        assert (target / name).read_bytes() == content, f'--check modified {label}/{name}'

for label in roots:
    measure(label, 'output-audit', 1, '--write')
    measure(label, 'idempotence-audit', 1)
differences = []
patches = []
for name, original in originals.items():
    before = (inputs['before'] / name).read_bytes()
    after = (inputs['after'] / name).read_bytes()
    if selected is not None and name not in selected:
        assert before == after == original, f'Unselected file modified: {name}'
    if before != after or before != original:
        differences.append({'path': name, 'beforeChanged': before != original,
                            'afterChanged': after != original, 'outputsDiffer': before != after,
                            'inputSha256': digest(original), 'beforeSha256': digest(before), 'afterSha256': digest(after)})
    if before != after:
        import difflib
        patches.extend(difflib.unified_diff(before.decode().splitlines(keepends=True), after.decode().splitlines(keepends=True), fromfile='before/' + name, tofile='after/' + name, n=0))
report['outputAudit'] = differences
(args.output / 'output.diff').write_text(''.join(patches))
(args.output / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({key: report[key] for key in ['workspace', 'mediansMs', 'afterChangePercent', 'beforeOverAfter']}, indent=2))
