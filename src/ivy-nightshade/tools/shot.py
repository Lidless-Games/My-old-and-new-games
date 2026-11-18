#!/usr/bin/env python3
"""Headless screenshot + console capture.
usage: shot.py <html> <out.png> [--wait ms] [--keys "Key:holdms,Key:holdms,..."] [--query "?x=1"] [--eval "js"]
Keys use Playwright names (ArrowRight, Space, Shift, Enter, KeyE...). 'wait:ms' entries just wait.
Prints console errors/logs. Exit code 1 if page errors occurred."""
import sys, argparse, os
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser()
ap.add_argument('html'); ap.add_argument('out')
ap.add_argument('--wait', type=int, default=800)
ap.add_argument('--keys', default='')
ap.add_argument('--query', default='')
ap.add_argument('--eval', default='')
a = ap.parse_args()
url = 'file://' + os.path.abspath(a.html) + a.query
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': 960, 'height': 540})
    pg.on('console', lambda m: print(f'[console.{m.type}]', m.text) if m.type in ('error', 'warning', 'log') else None)
    pg.on('pageerror', lambda e: (errs.append(str(e)), print('[pageerror]', e)))
    pg.goto(url); pg.wait_for_timeout(a.wait)
    for item in [k for k in a.keys.split(',') if k.strip()]:
        name, _, ms = item.strip().partition(':'); ms = int(ms or 100)
        if name == 'wait': pg.wait_for_timeout(ms); continue
        combo = name.split('+')
        for c in combo: pg.keyboard.down(c)
        pg.wait_for_timeout(ms)
        for c in reversed(combo): pg.keyboard.up(c)
    if a.eval:
        print('[eval]', pg.evaluate(a.eval))
    pg.wait_for_timeout(200)
    pg.screenshot(path=a.out)
    b.close()
print('saved', a.out)
sys.exit(1 if errs else 0)
