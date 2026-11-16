#!/usr/bin/env python3
"""Run timing batches sequentially; select concurrency by medians, then confirm independently."""
import argparse,json,subprocess,sys
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--variants',required=True);p.add_argument('--rsbuild',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
script=Path(__file__).with_name('run.py')
def run(name,args):
    dest=a.output/name
    if (dest/'results.json').exists():
        previous=json.loads((dest/'results.json').read_text())
        if previous.get('completed') is True:return previous
    resume=['--resume'] if dest.exists() else []
    subprocess.run([sys.executable,str(script),'--variants',a.variants,'--rsbuild',a.rsbuild,'--output',str(dest),*resume,*args],check=True)
    return json.loads((dest/'results.json').read_text())
run('main',['--audit'])
run('embedding-off',['--embedding','off','--audit'])
scan=run('workers',['--names','before310','before399','fallback','no-fallback','--groups','js-ts','supported','--workers','1','2','4','6','8','12','18'])
selected={}
for group,data in scan['groups'].items():
    candidates={int(k.split(':')[1]):v['medianMs'] for k,v in data['statistics'].items() if k.startswith('no-fallback:')}
    selected[group]=min(candidates,key=candidates.get)
(a.output/'selected.json').write_text(json.dumps(selected,indent=2)+'\n')
for group,workers in selected.items():
    run('confirmation-'+group,['--names','before310','before399','fallback','no-fallback','--groups',group,'--workers',str(workers),'--audit'])
