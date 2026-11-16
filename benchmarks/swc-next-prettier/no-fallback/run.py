#!/usr/bin/env python3
"""Cold-process CLI matrix with unchanged inputs, cache disabled and interleaved cells."""
import argparse, difflib, hashlib, io, json, os, re, statistics, subprocess, tarfile, tempfile, time
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--variants',type=Path,required=True);p.add_argument('--rsbuild',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
p.add_argument('--names',nargs='+',default=['before310','before399','fallback','no-fallback'])
p.add_argument('--groups',nargs='+',default=['js-ts','js-ts-fallback','supported'])
p.add_argument('--workers',type=int,nargs='+',default=[4]);p.add_argument('--embedding',choices=['original','off'],default='original')
p.add_argument('--audit',action='store_true');p.add_argument('--audit-only',action='store_true');p.add_argument('--resume',action='store_true');a=p.parse_args();root=Path(__file__).resolve().parents[1]
variants=json.loads(a.variants.read_text());commit='ad8388c5befec29f5ccf765857faf126c1f05d5d'
archive=subprocess.check_output(['git','archive',commit],cwd=a.rsbuild)
previous=json.loads((a.output/'results.json').read_text()) if a.resume else None
workspace=Path(previous['workspace']) if previous else Path(tempfile.mkdtemp(prefix='rstack-no-fallback-input-',dir='/tmp'))
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
    originals={f.name:tar.extractfile(f).read() for f in tar if f.isfile()};tar.extractall(workspace)
if a.embedding=='off':
    originals['rstack.config.ts']=originals['rstack.config.ts'].replace(b'define.fmt({',b"define.fmt({\n  embeddedLanguageFormatting: 'off',",1)
    (workspace/'rstack.config.ts').write_bytes(originals['rstack.config.ts'])
(workspace/'node_modules').mkdir(exist_ok=True)
heading=workspace/'node_modules/heading-case'
if not heading.exists():heading.symlink_to(Path(variants['no-fallback']['root'])/'node_modules/heading-case')
a.output.mkdir(parents=True,exist_ok=a.resume);node=subprocess.check_output(['which','node'],text=True).strip()
def competitors():
    active=[]
    rows=subprocess.check_output(['ps','-axo','pid,ppid,args'],text=True).splitlines()[1:]
    processes={int(parts[0]):(int(parts[1]),parts[2]) for row in rows if len(parts:=row.strip().split(None,2))==3}
    other_roots={pid for pid,(_,command) in processes.items() if 'codex exec' in command and '--cd /Users/bytedance/Documents/demos/parcel-native-plugin-demo' in command}
    def under_other_task(pid):
        seen=set()
        while pid in processes and pid not in seen:
            if pid in other_roots:return True
            seen.add(pid);pid=processes[pid][0]
        return False
    for row in rows:
        parts=row.strip().split(None,2)
        if len(parts)!=3 or int(parts[0])==os.getpid():continue
        command=parts[2]
        executable=command.split()[0]
        active_other=under_other_task(int(parts[0])) and ('bench' in command or executable.endswith(('/parcel','/rspack','/node','/python3','/Python'))) and not any(x in command for x in ['node_repl','mcp/launch.mjs','codex exec'])
        if active_other or executable.endswith(('/rustc','/cargo','/clang','/clang++')) or (executable.endswith(('/node','/python3','/Python')) and ('parcel-native-plugin-demo' in command or 'styled-components' in command)):
            active.append({'pid':int(parts[0]),'command':command[:240]})
    return active

def wait_for_competitors():
    # Never signal other tasks; defer our timing while their build/benchmark runs.
    while True:
        active=competitors()
        if not active:return
        print('Deferred timing for other workload',active,flush=True)
        time.sleep(10)

def environment():
    rows=[]
    ps=subprocess.check_output(['ps','-axo','pid,pcpu,comm'],text=True)
    for line in ps.splitlines()[1:]:
        fields=line.split(None,2)
        if len(fields)==3 and float(fields[1])>=15:rows.append({'pid':int(fields[0]),'cpu':float(fields[1]),'process':fields[2]})
    return {'time':time.time(),'loadAverage':os.getloadavg(),'busyProcesses':rows,'competingWorkloads':competitors()}
report={'commit':commit,'archiveSha256':hashlib.sha256(archive).hexdigest(),'configSha256':hashlib.sha256(originals['rstack.config.ts']).hexdigest(),
    'workspace':str(workspace),'variants':{n:variants[n] for n in a.names},'node':subprocess.check_output([node,'--version'],text=True).strip(),
    'pnpm':subprocess.check_output(['pnpm','--version'],text=True).strip(),'embedding':a.embedding,'workers':a.workers,'warmups':2,'runs':7,'samples':[],'groups':{},'environment':[]}
if previous:
    assert previous['variants']==report['variants'] and previous['embedding']==a.embedding and previous['workers']==a.workers
    report=previous
def save():(a.output/'results.json').write_text(json.dumps(report,indent=2)+'\n')
def invoke(name,workers,group,files,phase,iteration,mode='--check'):
    if phase in ['warmup','measure']:
        for path,content in originals.items():
            assert (workspace/path).read_bytes()==content, f'Input changed before sample: {path}'
    link=workspace/'node_modules/rstack';link.unlink(missing_ok=True);pkg=Path(variants[name]['root'])/'packages/rstack';link.symlink_to(pkg)
    command=[node,str(pkg/'bin/rs.js'),'fmt',*files,mode,'--no-cache','--parallel-workers',str(workers)]
    start=time.perf_counter_ns();result=subprocess.run(command,cwd=workspace,capture_output=True,text=True,env={**os.environ,'NO_COLOR':'1'});elapsed=(time.perf_counter_ns()-start)/1e6
    counts=re.findall(r'(?:Checked|of) (\d+) files|\((\d+) files(?:,|\))',result.stdout+result.stderr);count=int(next(v for v in counts[-1] if v)) if counts else None
    conflict=competitors() if phase in ['warmup','measure'] else []
    sample={'competingWorkloadsAfter':conflict,'valid':not conflict,'variant':name,'workers':workers,'group':group,'phase':phase,'iteration':iteration,'wallMs':elapsed,'exitCode':result.returncode,'files':count,'stdout':result.stdout,'stderr':result.stderr}
    report['samples'].append(sample);save();assert count==len(files) and result.returncode in [0,1,2],sample
    print(group,phase,iteration,name,workers,round(elapsed,2),result.returncode,flush=True)
    if conflict:
        print('Retained contaminated sample; waiting before retry',flush=True)
        wait_for_competitors()
        return invoke(name,workers,group,files,phase,iteration,mode)
    return result
for group in a.groups:
    files=json.loads((root/'results-groups'/group/'files.json').read_text()) if group!='supported' else sorted(json.loads((root/'results-groups/js-ts/files.json').read_text())+json.loads((root/'results-groups/other/files.json').read_text()))
    data=report['groups'].setdefault(group, {'files':len(files),'manifestSha256':hashlib.sha256('\n'.join(files).encode()).hexdigest(),'command':[node,'<variant>/packages/rstack/bin/rs.js','fmt','<manifest paths>','--check','--no-cache','--parallel-workers','<workers>']})
    (a.output/f'{group}.files.json').write_text(json.dumps(files,indent=2)+'\n');cells=[(n,w) for w in a.workers for n in a.names]
    for phase,count in ([] if a.audit_only else [('warmup',2),('measure',7)]):
        for i in range(count):
            wait_for_competitors()
            report['environment'].append({'group':group,'phase':phase,'iteration':i+1,**environment()})
            order=cells[i%len(cells):]+cells[:i%len(cells)]
            if i%2:order=list(reversed(order))
            for name,workers in order:
                if any(s.get('valid',True) and s['group']==group and s['phase']==phase and s['iteration']==i+1 and s['variant']==name and s['workers']==workers for s in report['samples']):continue
                wait_for_competitors()
                invoke(name,workers,group,files,phase,i+1)
                report['environment'].append({'group':group,'phase':phase,'iteration':i+1,'afterVariant':name,'workers':workers,**environment()})
                save()
    for path,content in originals.items():assert (workspace/path).read_bytes()==content,path
    data['statistics']={}
    for name,workers in cells:
        samples=[s for s in report['samples'] if s['valid'] and s['group']==group and s['phase']=='measure' and s['variant']==name and s['workers']==workers];times=[s['wallMs'] for s in samples]
        if not times:continue
        data['statistics'][f'{name}:{workers}']={'medianMs':statistics.median(times),'minMs':min(times),'maxMs':max(times),'exitCodes':sorted(set(s['exitCode'] for s in samples))}
    if a.audit:
        data['outputs']={}
        for name in a.names:
            write=invoke(name,a.workers[0],group,files,'write',1,'--write');check=invoke(name,a.workers[0],group,files,'idempotence',1)
            output=Path(tempfile.mkdtemp(prefix=f'rstack-audit-{name}-'));h=hashlib.sha256();changed=[];diff=[]
            for path in files:
                content=(workspace/path).read_bytes();h.update(path.encode());h.update(content)
                if content!=originals[path]:
                    changed.append(path);dest=output/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(content)
                    diff.extend(difflib.unified_diff(originals[path].decode().splitlines(True),content.decode().splitlines(True),fromfile='original/'+path,tofile=name+'/'+path))
            data['outputs'][name]={'sha256':h.hexdigest(),'changed':changed,'changedOutputRoot':str(output),'writeExitCode':write.returncode,'idempotenceExitCode':check.returncode}
            (a.output/f'{group}-{name}.diff').write_text(''.join(diff))
            for path,content in originals.items():
                if path not in files:assert (workspace/path).read_bytes()==content,path
                else:(workspace/path).write_bytes(content)
    save()
report['completed']=True;save()
print(json.dumps({k:v['statistics'] for k,v in report['groups'].items()},indent=2))
