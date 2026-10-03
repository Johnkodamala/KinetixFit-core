import json, sys
name = sys.argv[1]
r = json.load(open(f'sweep/{name}/{name}-report.json'))
print(f'=== {name}')
for p in r:
    kinds, detail = {}, []
    for i in p['issues']:
        if i['t'] == 'overlapping-controls' and ('nav-item-btn' in i['a'] or 'nav-item-btn' in i['b']): continue
        kinds[i['t']] = kinds.get(i['t'], 0) + 1
        if i['t'] not in ('overlapping-controls', 'small-tap-target', 'ellipsis(info)'): detail.append({k: v for k, v in i.items() if k != 't'} | {'type': i['t']})
    print(f"  {p['route']:24} {p['scroll']['height']:>5}px {p['shots']} shots  {kinds if kinds else 'clean'}")
    for d in detail[:6]: print('       ', d)
