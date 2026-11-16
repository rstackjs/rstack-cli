#!/usr/bin/env python3
"""Validate samples and generate tables without selecting individual fast runs."""
import json,statistics
from pathlib import Path
root=Path(__file__).resolve().parent
lines=['# Measurements','', 'CLI wall times in milliseconds. Ranges include all seven valid samples; invalid samples remain in raw JSON.','']
for name in ['main','embedding-off','workers','confirmation-js-ts','confirmation-supported']:
    report=json.loads((root/name/'results.json').read_text())
    lines += [f'## {name}', '', '| Scope | Variant | Workers | Median | Range | Exit |', '| --- | --- | ---: | ---: | --- | --- |']
    for group,data in report['groups'].items():
        for cell,expected in data['statistics'].items():
            variant,workers=cell.split(':');workers=int(workers)
            samples=[s for s in report['samples'] if s['valid'] and s['phase']=='measure' and s['group']==group and s['variant']==variant and s['workers']==workers]
            assert len(samples)==7 and all(s['files']==data['files'] for s in samples)
            times=[s['wallMs'] for s in samples];assert statistics.median(times)==expected['medianMs']
            lines.append(f"| {group} ({data['files']}) | {variant} | {workers} | {expected['medianMs']:.2f} | {min(times):.2f}–{max(times):.2f} | {expected['exitCodes']} |")
    lines+=['','### All samples','', '| Scope | Variant | Workers | Samples 1–7 |', '| --- | --- | ---: | --- |']
    for group,data in report['groups'].items():
        for cell in data['statistics']:
            variant,workers=cell.split(':');samples=[s['wallMs'] for s in report['samples'] if s['valid'] and s['phase']=='measure' and s['group']==group and s['variant']==variant and s['workers']==int(workers)]
            lines.append(f"| {group} | {variant} | {workers} | {', '.join(f'{s:.2f}' for s in samples)} |")
    lines+=['']
(root/'MEASUREMENTS.md').write_text('\n'.join(lines)+'\n')
print('Validated all medians/counts and wrote MEASUREMENTS.md')
