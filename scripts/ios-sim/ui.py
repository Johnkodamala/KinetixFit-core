#!/usr/bin/env python3
# Real taps on the simulator via idb (brew install facebook/fb/idb-companion; pip3 install fb-idb).
#   ui.py list              on-screen native elements: type, label, centre (WebView content isn't listed —
#                           use tap-el.sh for that)
#   ui.py tap "<label>"     tap the first element with that label (exact, then substring)
#   ui.py tapxy X Y         tap a point (iOS points);  ui.py type "text"  types into the focused field
# System sheets (Apple Health, notifications) run in another process: find their buttons with a screenshot + tapxy.
import json, os, shutil, subprocess, sys
IDB = shutil.which('idb') or os.path.expanduser('~/Library/Python/3.12/bin/idb')
name = os.environ.get('SIM_NAME', 'iPhone 17')
devs = json.loads(subprocess.run(['xcrun', 'simctl', 'list', 'devices', 'available', '-j'], capture_output=True, text=True).stdout)['devices']
SIM = next((d['udid'] for rt in devs.values() for d in rt if d['name'] == name and d['state'] == 'Booted'), None)
if not SIM: sys.exit(f'{name} is not booted')
def idb(*a): return subprocess.run([IDB, *a, '--udid', SIM], capture_output=True, text=True, timeout=60).stdout
def elements():
    out = idb('ui', 'describe-all'); return json.loads(out[out.index('['):])
cmd = sys.argv[1] if len(sys.argv) > 1 else ''
if cmd == 'list':
    for e in elements():
        label = (e.get('AXLabel') or '').strip(); f = e['frame']
        if label or e['type'] in ('Button', 'Switch', 'TextField'):
            print(f"{e['type']:<12} {label[:70]!r:<74} ({round(f['x'] + f['width'] / 2)}, {round(f['y'] + f['height'] / 2)})")
elif cmd == 'tap':
    want = sys.argv[2]; els = elements()
    hit = next((e for e in els if (e.get('AXLabel') or '').strip() == want), None) \
        or next((e for e in els if want.lower() in (e.get('AXLabel') or '').lower()), None)
    if not hit: sys.exit(f'not found: {want}')
    f = hit['frame']; x, y = round(f['x'] + f['width'] / 2), round(f['y'] + f['height'] / 2)
    idb('ui', 'tap', str(x), str(y)); print(f'tapped {want!r} at ({x}, {y})')
elif cmd == 'tapxy': idb('ui', 'tap', sys.argv[2], sys.argv[3])
elif cmd == 'type': idb('ui', 'text', sys.argv[2])
else: print(open(__file__).read().split('\nimport')[0])
