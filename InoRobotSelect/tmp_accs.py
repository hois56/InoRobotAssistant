import json

data = open('data.js', encoding='utf-8').read()
import re
match = re.search(r'const accessoriesList = (\[.*?\]);', data, re.DOTALL)
accs = json.loads(match.group(1))

for a in accs:
    typ = a['type'].lower()
    desc = a['description'].lower()
    if 'homing' in typ or 'homing' in desc:
        print(f"HOMING: {a['type']} | {a['description']}")
    if 'brake release' in typ or 'brake release' in desc:
        print(f"BRAKE: {a['type']} | {a['description']}")
    if 'forklift' in typ or 'forklift' in desc or 'fork lift' in typ or 'fork lift' in desc:
        print(f"FORKLIFT: {a['type']} | {a['description']}")
    if 'telescopic' in typ or 'telescopic' in desc:
        print(f"TELESCOPIC: {a['type']} | {a['description']}")
    if 'simulation' in typ or 'simulation' in desc:
        print(f"SIMULATION: {a['type']} | {a['description']}")
    if 'battery' in typ or 'battery' in desc:
        print(f"BATTERY: {a['type']} | {a['description']}")
