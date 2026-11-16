#!/usr/bin/env python3
"""Instrument separate CLI copies; accumulated worker times are not wall time."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--variants',type=Path,required=True)
p.add_argument('--matrix',type=Path,required=True)
p.add_argument('--output',type=Path,required=True)
p.add_argument('--names',nargs='+',default=['before399','native399','after'])
p.add_argument('--groups',nargs='+',default=['js-ts-fallback','other'])
a=p.parse_args();variants=json.loads(a.variants.read_text());report=json.loads(a.matrix.read_text());workspace=Path(report['workspace'])
root=Path(__file__).resolve().parent
summary={}
for name in a.names:
    source=Path(variants[name]['root']);target=source.parent/(name+'-trace-'+a.output.name)
    shutil.copytree(source,target,symlinks=True)
    dist=target/'packages/rstack/dist'
    shutil.copy2(root/'trace-prettier.mjs',dist/'trace-prettier.js')
    file=dist/'format.js';s=file.read_text().replace('from "prettier";', 'from "./trace-prettier.js";',1)
    if name.startswith('after'):
        s+='''\nconst route = getPrettierPlugins;
getPrettierPlugins = async (...args) => { const start = performance.now(); try { return await route(...args); } finally { globalThis.__fmtTrace.routeCalls++; globalThis.__fmtTrace.routeMs += performance.now()-start; } };\n'''
    file.write_text(s)
    for f in dist.glob('*.js'):
        s=f.read_text()
        if 'await getFormatModule()' in s:
            s=s.replace('await getFormatModule()', 'await (async () => { const start=performance.now(); const module=await getFormatModule(); globalThis.__fmtTrace.moduleWaitMs += performance.now()-start; return module; })()');f.write_text(s)
    for group in a.groups:
        out=a.output/name/group;out.mkdir(parents=True)
        files=json.loads((a.matrix.parent/f'{group}.files.json').read_text())
        link=workspace/'node_modules/rstack';link.unlink();link.symlink_to(target/'packages/rstack')
        command=['node',str(target/'packages/rstack/bin/rs.js'),'fmt',*files,'--check','--no-cache','--parallel-workers','4']
        result=subprocess.run(command,cwd=workspace,capture_output=True,text=True,env={**os.environ,'NO_COLOR':'1','RSTACK_TRACE_DIR':str(out.resolve())})
        assert result.returncode in [0,1], result.stderr
        summary[name+':'+group]={'exitCode':result.returncode,'stdout':result.stdout,'stderr':result.stderr,'workers':[json.loads(f.read_text()) for f in out.glob('*.json')]}
        assert sum(w['calls'] for w in summary[name+':'+group]['workers'])==len(files)
(a.output/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
