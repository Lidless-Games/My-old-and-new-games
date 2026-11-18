#!/usr/bin/env python3
"""Concatenate src/*.js into dist/ivy-nightshade.html (single self-contained file)."""
import os, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
ORDER = ['config.js', 'core.js', 'i18n.js', 'rhythm.js', 'art.js', 'player.js', 'stealth.js',
         'traps.js', 'ghosts.js', 'levels.js', 'ui.js', 'game.js', 'main.js']
parts = []
for f in ORDER:
    p = os.path.join(ROOT, 'src', f)
    if not os.path.exists(p):
        print('missing', f, file=sys.stderr); continue
    parts.append(f'// ===== {f} =====\n' + open(p, encoding='utf-8').read())
js = '\n'.join(parts).replace('</script>', '<\\/script>')
html = f'''<!DOCTYPE html>
<html lang="hu"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Ivy Nightshade</title>
<meta name="author" content="Lidless">
<!-- © 2026 Lidless. Licensed under CC BY-NC 4.0 (https://creativecommons.org/licenses/by-nc/4.0/) -->
<style>html,body{{margin:0;height:100%;background:#000;overflow:hidden}}
body{{display:flex;align-items:center;justify-content:center}}
canvas{{display:block;image-rendering:auto;touch-action:none}}</style>
</head><body><canvas id="game" width="960" height="540"></canvas>
<script>
{js}
</script></body></html>'''
os.makedirs(os.path.join(ROOT, '..', '..', 'ivy-nightshade'), exist_ok=True)
out = os.path.join(ROOT, '..', '..', 'ivy-nightshade', 'index.html')
open(out, 'w', encoding='utf-8').write(html)
print('built', out, len(html), 'bytes')
