import urllib.request
import re

content = open('data.js', encoding='utf-8').read()
match = re.search(r'const accessoriesList = (\[.*?\]);', content, re.DOTALL)
import json
accs = json.loads(match.group(1))
for a in accs:
    typ = a['type'].lower()
    desc = a['description'].lower()
    if 'arm' in typ or 'body' in typ or 'arm' in desc or 'body' in desc:
        print(f"TYPE: {a['type']} \nDESC: {a['description']}\n")
