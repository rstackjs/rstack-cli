#!/usr/bin/env python3
"""Create isolated copies of built CLI artifacts for one-variable diagnostic controls."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--before', type=Path, required=True)
p.add_argument('--after', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
a.output.mkdir(parents=True, exist_ok=True)
roots = {'before': a.before.resolve(), 'after': a.after.resolve()}
variants = {}
for name, base, prettier in [
    ('before310', 'before', 'before'), ('before399', 'before', 'after'),
    ('native310', 'before', 'before'), ('native399', 'before', 'after'),
    ('after', 'after', 'after'), ('after-onepass', 'after', 'after'),
    ('after-no-plugin-load', 'after', 'after'), ('after-old-fallback', 'after', 'after'),
]:
    root = a.output.resolve() / name
    if root.exists(): raise RuntimeError(f'Refusing to overwrite {root}')
    pkg = root / 'packages/rstack'
    pkg.mkdir(parents=True)
    original = roots[base] / 'packages/rstack'
    for item in ['dist', 'bin']:
        shutil.copytree(original / item, pkg / item)
    for item in original.glob('binding*'):
        shutil.copy2(item, pkg / item.name)
    for item in original.glob('*.node'):
        shutil.copy2(item, pkg / item.name)
    shutil.copy2(original / 'package.json', pkg / 'package.json')
    (pkg / 'node_modules').mkdir()
    for dependency in (original / 'node_modules').iterdir():
        if dependency.name.startswith('@'):
            (pkg / 'node_modules' / dependency.name).mkdir()
            for scoped in dependency.iterdir():
                (pkg / 'node_modules' / dependency.name / scoped.name).symlink_to(scoped.resolve())
        else:
            (pkg / 'node_modules' / dependency.name).symlink_to(dependency.resolve())
    link = pkg / 'node_modules/prettier'
    link.unlink()
    link.symlink_to((roots[prettier] / 'node_modules/prettier').resolve())
    (root / 'node_modules').mkdir()
    (root / 'node_modules/rstack').symlink_to(pkg)
    (root / 'node_modules/heading-case').symlink_to((a.after / 'node_modules/heading-case').resolve())
    file = pkg / 'dist/format.js'
    text = file.read_text()
    if name.startswith('native'):
        text = text.replace('defaultFmtPlugins = [\n    swcNextPlugin,\n    fmtOptionsPlugin', 'defaultFmtPlugins = [\n    fmtOptionsPlugin')
        assert text != file.read_text()
    if name == 'after-onepass':
        text = text.replace('let plugins = await getPrettierPlugins(options, path), parser', 'let source = readSource();\n    let plugins = await getPrettierPlugins(options, path, source), parser')
        start = text.index('    let source = readSource();', text.index("status: 'unsupported'"))
        end = text.index('    let formatted =', start)
        text = text[:start] + text[end:]
    if name == 'after-no-plugin-load':
        # Used only for fallback/other subsets. No SWC parse is invoked in those scopes.
        text = text.replace('import * as __rspack_external__swc_next_formatter_prettier_plugin_746c4306 from "@swc-next/formatter-prettier-plugin";', 'const __rspack_external__swc_next_formatter_prettier_plugin_746c4306 = { parsers: { "swc-ts": {} } };')
    if name == 'after-old-fallback':
        # Diagnostic: keep the new selection path but put the old AST adapter on fallback.
        old = (a.output / 'before399/packages/rstack/dist/format.js').read_text()
        (pkg / 'dist/old-adapter.js').write_text(old + '\nexport { swcNextPlugin as oldPlugin };\n')
        target = pkg / 'node_modules/@swc-next/parser'
        target.symlink_to((a.before / 'packages/rstack/node_modules/@swc-next/parser').resolve())
        text = 'import { oldPlugin } from "./old-adapter.js";\n' + text
        text = text.replace('defaultPlugins = isSwcParser || isSwcDefault ? defaultFmtPlugins : [\n        fmtOptionsPlugin', 'defaultPlugins = isSwcParser || isSwcDefault ? defaultFmtPlugins : [\n        oldPlugin, fmtOptionsPlugin')
        assert 'oldPlugin, fmtOptionsPlugin' in text
    if name not in ['before310', 'before399', 'after']:
        assert text != file.read_text(), f'Patch did not apply: {name}'
    file.write_text(text)
    variants[name] = {'root': str(root), 'base': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=roots[base], text=True).strip(),
                      'prettier': json.loads((link / 'package.json').read_text())['version'],
                      'formatSha256': hashlib.sha256(text.encode()).hexdigest()}
(a.output / 'variants.json').write_text(json.dumps(variants, indent=2) + '\n')
print(json.dumps(variants, indent=2))
