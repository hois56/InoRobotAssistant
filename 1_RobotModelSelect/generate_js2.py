import pandas as pd
import json

file_path = "2025 INT Robot Sales List V3.2.xlsx"
xl = pd.ExcelFile(file_path)

# First group by Type => Models
products = []
filters_dict = {}

for sheet in ['SCARA Robot', '6-Axis Robot']:
    df = xl.parse(sheet)
    cols_to_ffill = ['Series', 'Model', 'Payload(kg)', 'Manipulator Length(mm)']
    if 'Z axis Length(mm)' in df.columns:
        cols_to_ffill.append('Z axis Length(mm)')
        
    for col in cols_to_ffill:
        if col in df.columns:
            df[col] = df[col].ffill()
            
    # Group by Model to collect cables
    grouped = df.groupby('Model')
    
    for model, group in grouped:
        if pd.isna(model) or 'Model' in str(model): continue
        if type(model) == str and 'Series' in model: continue
        model = str(model)
        
        # Take the first row for base specs
        first_row = group.iloc[0]
        
        robot_type = 'SCARA' if 'SCARA' in sheet else '6-Axis'
        
        specs = {}
        specs['Type'] = robot_type
        
        # Payload
        val_payload = first_row.get('Payload(kg)')
        if pd.notna(val_payload):
            specs['Payload(kg)'] = str(val_payload).strip()
            
        # Manipulator Length
        val_length = first_row.get('Manipulator Length(mm)')
        if pd.notna(val_length):
            specs['Manipulator Length(mm)'] = str(val_length).strip()
            
        # Z axis Length
        if robot_type == 'SCARA':
            val_z = first_row.get('Z axis Length(mm)')
            if pd.notna(val_z):
                try: # try converting to int string if possible
                    specs['Z axis Length(mm)'] = str(int(float(val_z))).strip()
                except:
                    specs['Z axis Length(mm)'] = str(val_z).strip()
        
        # Hollow Wrist
        if robot_type == '6-Axis':
            # Typical naming: IR-R4H-54S-INT -> H signifies Hollow
            # Let's extract base name before the dash, e.g., IR-R4H
            parts = model.split('-')
            if len(parts) >= 2 and 'H' in parts[1]:
                specs['Hollow Wrist'] = 'Yes'
            else:
                specs['Hollow Wrist'] = 'No'
        
        # Collect cables
        cables = []
        for _, row in group.iterrows():
            code = str(row.get('Code', '')).strip()
            if code == 'nan': code = ''
            cable = str(row.get('Cable', '')).strip()
            if '\ufffd' in cable:
                cable = cable.replace('\ufffd', '')
            if cable != 'nan' and cable != '':
                cables.append({
                    'code': code,
                    'cable': cable
                })
        
        # Unique ID is just the model name
        products.append({
            'id': model,
            'name': model,
            'image': 'robot.png',
            'specs': specs,
            'cables': cables
        })

# Process filters map from products
for p in products:
    for k, v in p['specs'].items():
        if k not in filters_dict:
            filters_dict[k] = set()
        if v:
            filters_dict[k].add(str(v))

filter_labels = {
    'Type': 'Robot Type',
    'Payload(kg)': 'Payload (kg)',
    'Manipulator Length(mm)': 'Manipulator Length (mm)',
    'Z axis Length(mm)': 'Z Axis Length (mm)',
    'Hollow Wrist': 'Hollow Wrist'
}

filters_data = []
for k in ['Type', 'Payload(kg)', 'Manipulator Length(mm)', 'Z axis Length(mm)', 'Hollow Wrist']:
    if k in filters_dict:
        options = []
        for v in sorted(list(filters_dict[k])):
            options.append({'id': v, 'label': v})
        filters_data.append({
            'id': k,
            'label': filter_labels.get(k, k),
            'options': options
        })

# Sort products by type and payload
def sort_key(p):
    ptype = p['specs'].get('Type', '')
    payload = 0
    try: payload = float(p['specs'].get('Payload(kg)', '0'))
    except: pass
    return (ptype, payload)

products.sort(key=sort_key)

data_js_content = f"""const filtersData = {json.dumps(filters_data, indent=4)};

const productsData = {json.dumps(products, indent=4)};
"""

with open("data.js", "w", encoding="utf-8") as f:
    f.write(data_js_content)

print("data.js rewritten successfully!")
