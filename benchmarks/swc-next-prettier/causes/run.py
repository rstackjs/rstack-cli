#!/usr/bin/env python3
"""Interleave uninstrumented CLI diagnostic variants on identical fixed input."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import statistics
import subprocess
import tarfile
import tempfile
import time

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--variants', type=Path, required=True)
p.add_argument('--rsbuild', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
p.add_argument('--names', nargs='+', required=True)
p.add_argument('--groups', nargs='+', default=['js-ts-fallback', 'other'])
a = p.parse_args()
root = Path(__file__).resolve().parents[1]
variants = json.loads(a.variants.read_text())
commit = 'ad8388c5befec29f5ccf765857faf126c1f05d5d'
archive = subprocess.check_output(['git', 'archive', commit], cwd=a.rsbuild)
workspace = Path(tempfile.mkdtemp(prefix='rstack-cause-input-'))
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
    originals = {f.name: tar.extractfile(f).read() for f in tar if f.isfile()}
    tar.extractall(workspace)
(workspace / 'node_modules').mkdir()
(workspace / 'node_modules/heading-case').symlink_to(Path(variants['after']['root']) / 'node_modules/heading-case')
node = subprocess.check_output(['which', 'node'], text=True).strip()
a.output.mkdir(parents=True, exist_ok=True)
report = {'commit': commit, 'archiveSha256': hashlib.sha256(archive).hexdigest(), 'variants': {n:variants[n] for n in a.names},
          'node': subprocess.check_output([node, '--version'], text=True).strip(),
          'pnpm': subprocess.check_output(['pnpm', '--version'], text=True).strip(), 'workers': 4,
          'workspace': str(workspace), 'warmups': 2, 'runs': 7, 'samples': [], 'groups': {}}
def save(): (a.output / 'results.json').write_text(json.dumps(report, indent=2) + '\n')
def invoke(name, group, files, phase, iteration, mode='--check'):
    link = workspace / 'node_modules/rstack'
    link.unlink(missing_ok=True)
    pkg = Path(variants[name]['root']) / 'packages/rstack'
    link.symlink_to(pkg)
    command = [node, str(pkg / 'bin/rs.js'), 'fmt', *files, mode, '--no-cache', '--parallel-workers', '4']
    start = time.perf_counter_ns()
    result = subprocess.run(command, cwd=workspace, capture_output=True, text=True, env={**os.environ, 'NO_COLOR': '1'})
    elapsed = (time.perf_counter_ns()-start)/1e6
    counts = re.findall(r'(?:Checked|of) (\d+) files|\((\d+) files(?:,|\))', result.stdout+result.stderr)
    count = int(next(v for v in counts[-1] if v)) if counts else None
    sample = {'variant':name, 'group':group, 'phase':phase, 'iteration':iteration, 'wallMs':elapsed,
              'exitCode':result.returncode, 'files':count, 'stdout':result.stdout, 'stderr':result.stderr}
    report['samples'].append(sample); save()
    assert count == len(files) and result.returncode in [0,1], sample
    print(group,phase,iteration,name,round(elapsed,2),result.returncode,flush=True)
    return result
for group in a.groups:
    files = json.loads((root / 'results-groups' / group / 'files.json').read_text()) if group != 'supported' else sorted(json.loads((root/'results-groups/js-ts/files.json').read_text())+json.loads((root/'results-groups/other/files.json').read_text()))
    report['groups'][group] = {'files':len(files),'filesSha256':hashlib.sha256('\n'.join(files).encode()).hexdigest(),
                               'command':['node','<variant>/packages/rstack/bin/rs.js','fmt','<manifest paths>','--check','--no-cache','--parallel-workers','4']}
    (a.output/f'{group}.files.json').write_text(json.dumps(files,indent=2)+'\n')
    for phase,count in [('warmup',2),('measure',7)]:
        for i in range(count):
            order = a.names[i%len(a.names):]+a.names[:i%len(a.names)]
            if i%2: order=list(reversed(order))
            for name in order: invoke(name,group,files,phase,i+1)
    for path,data in originals.items(): assert (workspace/path).read_bytes()==data,path
    report['groups'][group]['mediansMs'] = {n:statistics.median(s['wallMs'] for s in report['samples'] if s['group']==group and s['variant']==n and s['phase']=='measure') for n in a.names}
    report['groups'][group]['outputs'] = {}
    for name in a.names:
        result=invoke(name,group,files,'output',1,'--write'); assert result.returncode==0
        result=invoke(name,group,files,'idempotence',1); assert result.returncode==0
        h=hashlib.sha256(); changed=[]
        for path in files:
            data=(workspace/path).read_bytes();h.update(path.encode());h.update(data)
            if data!=originals[path]:changed.append(path)
        report['groups'][group]['outputs'][name]={'sha256':h.hexdigest(),'changed':changed}
        for path,data in originals.items():
            if path not in files: assert (workspace/path).read_bytes()==data,path
            else: (workspace/path).write_bytes(data)
    save()
print(json.dumps(report['groups'],indent=2))
