import json

data = open('data.js', encoding='utf-8').read()
import re
match = re.search(r'const accessoriesList = (\[.*?\]);', data, re.DOTALL)
accs = json.loads(match.group(1))

with open('accs.txt', 'w', encoding='utf-8') as f:
    for a in accs:
        f.write(f"{a['type']} - {a['description']}\n")
