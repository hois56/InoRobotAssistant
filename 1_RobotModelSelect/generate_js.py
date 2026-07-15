import pandas as pd
import json
import math

file_path = "2025 INT Robot Sales List V3.2.xlsx"
xl = pd.ExcelFile(file_path)

products = []
filters = {}

# We'll use these exact column names for filters if they exist
filter_fields = ['Type', 'Payload(kg)', 'Manipulator Length(mm)', 'Z axis Length(mm)', 'Cable']

for sheet in ['SCARA Robot', '6-Axis Robot']:
    df = xl.parse(sheet)
    # Forward fill important columns
    cols_to_ffill = ['Series', 'Model', 'Payload(kg)', 'Manipulator Length(mm)']
    if 'Z axis Length(mm)' in df.columns:
        cols_to_ffill.append('Z axis Length(mm)')
        
    for col in cols_to_ffill:
        if col in df.columns:
            df[col] = df[col].ffill()
            
    # Iterate over rows and create products
    for _, row in df.iterrows():
        model = row.get('Model')
        if pd.isna(model) or 'Model' in str(model): continue
        if type(model) == str and 'Series' in model: continue
        
        code = row.get('Code', '')
        if pd.isna(code): code = ''
        
        # specs
        specs = {}
        specs['Type'] = 'SCARA' if 'SCARA' in sheet else '6-Axis'
        for f in ['Payload(kg)', 'Manipulator Length(mm)', 'Z axis Length(mm)', 'Cable']:
            if f in row and not pd.isna(row[f]):
                val = str(row[f]).strip()
                specs[f] = val
        
        products.append({
            'id': str(code),
            'name': str(model) + (" - " + str(specs.get('Cable', ''))) if specs.get('Cable') else str(model),
            'image': 'robot.png', # We'll just keep the existing image or use something else later
            'specs': specs
        })

# Now collect unique values for filters
for p in products:
    for k, v in p['specs'].items():
        if k not in filters:
            filters[k] = set()
        filters[k].add(v)

# Assign a nice label for each filter
filter_labels = {
    'Type': 'Robot Type',
    'Payload(kg)': 'Payload (kg)',
    'Manipulator Length(mm)': 'Manipulator Length (mm)',
    'Z axis Length(mm)': 'Z Axis Length (mm)',
    'Cable': 'Cable Length'
}

filters_data = []
for k, values_set in filters.items():
    options = []
    for v in sorted(list(values_set)):
        # clean up any strange values
        if '\ufffd' in v:
            v_clean = v.replace('\ufffd', '')
        else:
            v_clean = v
        options.append({'id': v_clean, 'label': v_clean})
    filters_data.append({
        'id': k,
        'label': filter_labels.get(k, k),
        'options': options
    })

data_js_content = f"""const filtersData = {json.dumps(filters_data, indent=4)};

const productsData = {json.dumps(products, indent=4)};
"""

with open("data.js", "w", encoding="utf-8") as f:
    f.write(data_js_content)

print("data.js generated successfully")
