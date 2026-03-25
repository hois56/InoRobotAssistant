import pandas as pd
import json

file_path = "2025 INT Robot Sales List V3.2.xlsx"
xl = pd.ExcelFile(file_path)

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
            
    grouped = df.groupby('Model')
    
    for model, group in grouped:
        if pd.isna(model) or 'Model' in str(model): continue
        if type(model) == str and 'Series' in model: continue
        model = str(model)
        first_row = group.iloc[0]
        robot_type = 'SCARA' if 'SCARA' in sheet else '6-Axis'
        
        specs = {}
        specs['Type'] = robot_type
        
        val_payload = first_row.get('Payload(kg)')
        if pd.notna(val_payload):
            specs['Payload(kg)'] = str(val_payload).strip()
            
        val_length = first_row.get('Manipulator Length(mm)')
        if pd.notna(val_length):
            specs['Manipulator Length(mm)'] = str(val_length).strip()
            
        if robot_type == 'SCARA':
            val_z = first_row.get('Z axis Length(mm)')
            if pd.notna(val_z):
                try: 
                    specs['Z axis Length(mm)'] = str(int(float(val_z))).strip()
                except:
                    specs['Z axis Length(mm)'] = str(val_z).strip()
            
            # SCARA Clean Type: 4~35kg
            payload_num = 0
            try: payload_num = float(specs.get('Payload(kg)', 0))
            except: pass
            if 4 <= payload_num <= 35:
                # Add duplicate with clean type
                specs['Clean Type'] = 'No'
            else:
                specs['Clean Type'] = 'No'
                    
        if robot_type == '6-Axis':
            parts = model.split('-')
            if len(parts) >= 2 and 'H' in parts[1]:
                specs['Hollow Wrist'] = 'Yes'
                specs['Clean Type'] = 'Yes'
            else:
                specs['Hollow Wrist'] = 'No'
                specs['Clean Type'] = 'No'
        
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
        
        products.append({
            'id': model,
            'name': model,
            'image': 'robot.png',
            'specs': specs.copy(),
            'cables': cables
        })

        if robot_type == 'SCARA' and 4 <= payload_num <= 35:
            specs['Clean Type'] = 'Yes'
            products.append({
                'id': model + "-CLEAN",
                'name': model + " (Clean Type)",
                'image': 'robot.png',
                'specs': specs.copy(),
                'cables': cables
            })

for p in products:
    for k, v in p['specs'].items():
        if k not in filters_dict:
            filters_dict[k] = set()
        if v:
            filters_dict[k].add(str(v))

def sort_spec_val(val):
    try:
        return (0, float(val))
    except:
        return (1, val)

filter_labels = {
    'Type': '로봇 타입',
    'Payload(kg)': '가반 하중(kg)',
    'Manipulator Length(mm)': '리치(mm)',
    'Z axis Length(mm)': 'Z축 길이(mm)',
    'Hollow Wrist': '중공형',
    'Clean Type': '클린 타입'
}

filters_data = []
for k in ['Type', 'Payload(kg)', 'Manipulator Length(mm)', 'Z axis Length(mm)', 'Hollow Wrist', 'Clean Type']:
    if k in filters_dict:
        options = []
        # sort values numerically if possible
        sorted_vals = sorted(list(filters_dict[k]), key=sort_spec_val)
        for v in sorted_vals:
            options.append({'id': v, 'label': v})
        filters_data.append({
            'id': k,
            'label': filter_labels.get(k, k),
            'options': options
        })

# Sort products numerically as well by payload, then reach
def sort_key(p):
    ptype = p['specs'].get('Type', '')
    payload = 0
    try: payload = float(p['specs'].get('Payload(kg)', '0'))
    except: pass
    reach = 0
    try: reach = float(p['specs'].get('Manipulator Length(mm)', '0'))
    except: pass
    return (ptype, payload, reach)

products.sort(key=sort_key)

# Parse Accessories
accessories = []
df_acc = xl.parse("Accessories")
df_acc['Type'] = df_acc['Type'].ffill()
for _, row in df_acc.iterrows():
    acc_code = str(row.get('Code', '')).strip()
    if pd.isna(acc_code) or acc_code == 'nan': continue
    
    desc = str(row.get('Description', '')).replace('\n', ' ').replace('\ufffd', '').strip()
    type_name = str(row.get('Type', '')).replace('\n', ' ').strip()
    accessories.append({
        'code': acc_code,
        'type': type_name,
        'description': desc
    })

data_js_content = f"""const filtersData = {json.dumps(filters_data, indent=4)};

const productsData = {json.dumps(products, indent=4)};

const accessoriesList = {json.dumps(accessories, indent=4)};
"""

with open("data.js", "w", encoding="utf-8") as f:
    f.write(data_js_content)

print("data.js rewritten successfully with accessories!")
