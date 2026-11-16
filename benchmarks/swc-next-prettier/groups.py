#!/usr/bin/env python3
"""Run fixed JS/TS, other-language, SWC and fallback file subsets sequentially."""
import argparse
import csv
import json
import os
from pathlib import Path
import re
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--before', required=True)
parser.add_argument('--after', required=True)
parser.add_argument('--rsbuild', required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent
rows = list(csv.DictReader((root / 'results-supported/inventory.tsv').open(), delimiter='\t'))
supported = [row for row in rows if row['inferredParser']]
def is_js_ts(row):
    return bool(re.search(r'\.(?:[cm]?[jt]s|[jt]sx)$', row['path'], re.I))
groups = {
    'js-ts': [row['path'] for row in supported if is_js_ts(row)],
    'other': [row['path'] for row in supported if not is_js_ts(row)],
    'js-ts-swc': [row['path'] for row in supported if is_js_ts(row) and row['formatter'] == 'swc'],
    'js-ts-fallback': [row['path'] for row in supported if is_js_ts(row) and row['formatter'] == 'prettier'],
}
assert set(groups['js-ts']).isdisjoint(groups['other'])
assert set(groups['js-ts']) | set(groups['other']) == {row['path'] for row in supported}
assert set(groups['js-ts-swc']).isdisjoint(groups['js-ts-fallback'])
assert set(groups['js-ts-swc']) | set(groups['js-ts-fallback']) == set(groups['js-ts'])
assert 'e2e/cases/wasm/wasm-source-import/src/index.js' not in groups['js-ts']
for group, files in groups.items():
    folder = args.output / group
    folder.mkdir(parents=True, exist_ok=True)
    manifest = folder / 'files.json'
    manifest.write_text(json.dumps(sorted(files), indent=2) + '\n')
    print(f'{group}: {len(files)} files', flush=True)
    existing = json.loads((folder / 'results.json').read_text()) if (folder / 'results.json').exists() else {}
    if 'outputAudit' in existing:
        continue
    subprocess.run([
        sys.executable, str(root / 'bench.py'), '--before', args.before,
        '--after', args.after, '--rsbuild', args.rsbuild, '--output', str(folder),
        '--file-list', str(manifest), *(['--resume-audit'] if 'mediansMs' in existing else []),
    ], check=True)
# Inventory and AST audits occur after every group's timing has finished.
for group in groups:
    subprocess.run(['node', str(root / 'audit.mjs'), args.before, args.after, str(args.output / group)],
                   check=True, env={**os.environ, 'RSBUILD_REPO': args.rsbuild})

summary = {}
for group, files in groups.items():
    result = json.loads((args.output / group / 'results.json').read_text())
    audit = json.loads((args.output / group / 'audit.json').read_text())
    assert audit['total'] == audit['beforeSupportedCount'] == len(files)
    assert audit['byFormatter']['unsupported'] == 0
    expected_swc = len(groups['js-ts-swc']) if group == 'js-ts' else len(files) if group == 'js-ts-swc' else 0
    assert audit['byFormatter']['swc'] == expected_swc
    for label in ['before', 'after']:
        samples = [sample for sample in result['samples'] if sample['phase'] == 'measure' and sample['label'] == label]
        assert len(samples) == 7
        assert all(sample['fileCount'] == len(files) and sample['exitCode'] in [0, 1] for sample in samples)
    summary[group] = {
        'files': len(files), 'mediansMs': result['mediansMs'],
        'afterChangePercent': result['afterChangePercent'],
        'beforeOverAfter': result['beforeOverAfter'],
        'changedFiles': len(result['outputAudit']),
        'formatters': audit['byFormatter'],
    }
(args.output / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
