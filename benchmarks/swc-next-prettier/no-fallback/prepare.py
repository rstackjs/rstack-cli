#!/usr/bin/env python3
"""Snapshot built CLIs; the only diagnostic substitution is the old peer version."""
import argparse, hashlib, json, shutil, subprocess
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--before',type=Path,required=True)
p.add_argument('--fallback',type=Path,required=True)
p.add_argument('--after',type=Path,required=True)
p.add_argument('--output',type=Path,required=True)
a=p.parse_args(); variants={}
for name,source in [('before310',a.before),('before399',a.before),('fallback',a.fallback),('no-fallback',a.after)]:
    source=source.resolve(); target=a.output.resolve()/name; pkg=target/'packages/rstack'; original=source/'packages/rstack'
    pkg.mkdir(parents=True,exist_ok=False)
    for item in ['bin','dist']:shutil.copytree(original/item,pkg/item)
    for item in [*original.glob('binding*'),*original.glob('*.node'),original/'package.json']:shutil.copy2(item,pkg/item.name)
    (pkg/'node_modules').mkdir()
    for item in (original/'node_modules').iterdir():
        if item.name.startswith('@'):
            (pkg/'node_modules'/item.name).mkdir()
            for child in item.iterdir():(pkg/'node_modules'/item.name/child.name).symlink_to(child.resolve())
        else:(pkg/'node_modules'/item.name).symlink_to(item.resolve())
    if name=='before399':
        link=pkg/'node_modules/prettier';link.unlink();link.symlink_to((a.after/'node_modules/prettier').resolve())
    (target/'node_modules').mkdir();(target/'node_modules/rstack').symlink_to(pkg)
    (target/'node_modules/heading-case').symlink_to((a.after/'node_modules/heading-case').resolve())
    h=hashlib.sha256()
    for f in sorted((pkg/'dist').rglob('*')):
        if f.is_file():h.update(str(f.relative_to(pkg)).encode());h.update(f.read_bytes())
    variants[name]={'root':str(target),'distSha256':h.hexdigest(),'formatSha256':hashlib.sha256((pkg/'dist/format.js').read_bytes()).hexdigest(),
        'prettier':json.loads((pkg/'node_modules/prettier/package.json').read_text())['version']}
variants['no-fallback']['sourceBase']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=a.after,text=True).strip()
patch=subprocess.check_output(['git','diff','HEAD','--','packages/rstack/src/fmt'],cwd=a.after)
(a.output/'runtime.patch').write_bytes(patch);variants['no-fallback']['runtimePatchSha256']=hashlib.sha256(patch).hexdigest()
(a.output/'variants.json').write_text(json.dumps(variants,indent=2)+'\n')
