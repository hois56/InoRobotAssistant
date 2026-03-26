import pandas as pd
import json
import re

model_file = "temp_model.xlsx"
spec_file = "temp_spec.xlsx"

model_xl = pd.ExcelFile(model_file)
spec_xl = pd.ExcelFile(spec_file)

# ============================================================
# 1) Parse spec data from Robot_spec.xlsx
# ============================================================
spec_data = {}  # model_name -> { spec_key: spec_value, ... }

# --- 6-Axis specs ---
df_6ax = spec_xl.parse("6-Axis").dropna(how='all')
df_6ax = df_6ax.set_index("Spec / Model")
for col in df_6ax.columns:
    model = col.strip()
    vals = {}
    for idx, val in df_6ax[col].items():
        if pd.notna(val):
            vals[str(idx).strip()] = str(val).strip()
    spec_data[model] = vals

# --- SCARA specs ---
for sheet_name in ["SCARA", "SCARA (CS)", "SCARA (Clean)"]:
    if sheet_name not in spec_xl.sheet_names:
        continue
    df_sc = spec_xl.parse(sheet_name).dropna(how='all')
    df_sc = df_sc.set_index("Spec / Model")
    for col in df_sc.columns:
        model = col.strip()
        vals = {}
        for idx, val in df_sc[col].items():
            if pd.notna(val):
                vals[str(idx).strip()] = str(val).strip()
        spec_data[model] = vals

print(f"Loaded specs for {len(spec_data)} models: {list(spec_data.keys())}")

# ============================================================
# 2) Parse model data from Robot_model.xlsx
# ============================================================
products = []
all_model_names = set()

# Helper: extract Payload and ManipulatorLength/ZaxisLength from model name
def parse_model_name(model_name, robot_type):
    """Parse model name to extract Payload and Manipulator Length specs."""
    info = {}
    # Use spec data if available for reach
    if model_name in spec_data:
        sd = spec_data[model_name]
        # 6-axis: Maximum reach (mm)
        if "Maximum reach (mm)" in sd:
            info["Manipulator Length(mm)"] = sd["Maximum reach (mm)"]
        # SCARA: Arm length J1+J2 (mm)
        elif "Arm length J1+J2 (mm)" in sd:
            info["Manipulator Length(mm)"] = sd["Arm length J1+J2 (mm)"]
    else:
        # Try to find matching spec by similar model name (CS4->CS3, CS7->CS6 mapping)
        cs_map = {
            "IR-CS4-40Z15S-INT": "IR-CS3-40Z15S-INT",
            "IR-CS7-50Z20S-INT": "IR-CS6-50Z20S-INT",
            "IR-CS7-60Z20S-INT": "IR-CS6-60Z20S-INT",
            "IR-CS7-70Z20S-INT": "IR-CS6-70Z20S-INT",
        }
        mapped = cs_map.get(model_name, None)
        if mapped and mapped in spec_data:
            sd = spec_data[mapped]
            spec_data[model_name] = sd  # cache for later use
            if "Arm length J1+J2 (mm)" in sd:
                info["Manipulator Length(mm)"] = sd["Arm length J1+J2 (mm)"]
        elif robot_type == "SCARA":
            # Fallback: extract reach from model name
            m2 = re.search(r'-(\d+)Z', model_name)
            if m2:
                reach_val = int(m2.group(1)) * 10
                info["Manipulator Length(mm)"] = str(reach_val)

    # Extract payload from model name pattern
    parts = model_name.replace("IR-", "").split("-")
    if len(parts) >= 1:
        ppart = parts[0]
        payload_str = re.sub(r'^[A-Z]+', '', ppart)
        payload_str = payload_str.replace('H', '')
        try:
            payload = int(payload_str)
            info["Payload(kg)"] = str(payload)
        except:
            pass

    # Extract Z axis from model for SCARA
    if robot_type == "SCARA":
        m = re.search(r'Z(\d+)', model_name)
        if m:
            z_val = int(m.group(1)) * 10
            info["Z axis Length(mm)"] = str(z_val)

    return info

# Determine SCARA subtypes
def get_scara_subtype(model_name):
    """Returns 'Clean', 'CS', 'Standard', 'TS', 'GS'"""
    if 'C-INT' in model_name:
        return 'Clean'
    elif model_name.startswith('IR-CS'):
        return 'CS'
    elif model_name.startswith('IR-TS'):
        return 'TS'
    elif model_name.startswith('IR-GS'):
        return 'GS'
    return 'Standard'

def is_hollow_wrist(model_name):
    parts = model_name.replace("IR-", "").split("-")
    if len(parts) >= 1 and 'H' in parts[0] and not parts[0].startswith('S'):
        return True
    return False

for sheet in ['SCARA Robot', '6-Axis Robot']:
    df = model_xl.parse(sheet)
    df['Model'] = df['Model'].ffill()
    df['Series'] = df['Series'].ffill()
    robot_type = 'SCARA' if 'SCARA' in sheet else '6-Axis'

    grouped = df.groupby('Model')

    for model, group in grouped:
        if pd.isna(model) or 'Model' in str(model):
            continue
        if type(model) == str and 'Series' in model:
            continue
        model = str(model).strip()
        if model in all_model_names:
            continue
        all_model_names.add(model)

        # Build specs
        specs = {"Type": robot_type}
        model_info = parse_model_name(model, robot_type)
        if "Payload(kg)" in model_info:
            specs["Payload(kg)"] = model_info["Payload(kg)"]
        if "Manipulator Length(mm)" in model_info:
            specs["Manipulator Length(mm)"] = model_info["Manipulator Length(mm)"]

        if robot_type == "SCARA":
            if "Z axis Length(mm)" in model_info:
                specs["Z axis Length(mm)"] = model_info["Z axis Length(mm)"]
            subtype = get_scara_subtype(model)
            if subtype == 'Clean':
                specs["Clean Type"] = "Yes"
            elif subtype == 'CS':
                specs["Clean Type"] = "No"
                specs["Ceiling Mount"] = "Yes"
            else:
                specs["Clean Type"] = "No"
        else:
            if is_hollow_wrist(model):
                specs["Hollow Wrist"] = "Yes"
                specs["Clean Type"] = "Yes"
            else:
                specs["Hollow Wrist"] = "No"
                specs["Clean Type"] = "No"

        # Build cables
        cables = []
        for _, row in group.iterrows():
            code = str(row.get('Code', '')).strip()
            if code == 'nan' or code == '-':
                code = '-'
            cable = str(row.get('Cable', '')).strip()
            if cable == 'nan' or cable == '':
                continue
            # Clean cable text
            cable = cable.replace('\ufffd', '')
            cables.append({'code': code, 'cable': cable})

        # Build detail specs from spec_data
        details = {}
        if model in spec_data:
            details = spec_data[model].copy()

        products.append({
            'id': model,
            'name': model,
            'image': 'robot.png',
            'specs': specs,
            'cables': cables,
            'detailSpecs': details
        })

# ============================================================
# 3) Build filters from products
# ============================================================
filters_dict = {}
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
    'Clean Type': '클린 타입',
    'Ceiling Mount': '천장 설치'
}

filters_data = []
for k in ['Type', 'Payload(kg)', 'Manipulator Length(mm)', 'Z axis Length(mm)', 'Hollow Wrist', 'Clean Type', 'Ceiling Mount']:
    if k in filters_dict:
        options = []
        sorted_vals = sorted(list(filters_dict[k]), key=sort_spec_val)
        for v in sorted_vals:
            options.append({'id': v, 'label': v})
        filters_data.append({
            'id': k,
            'label': filter_labels.get(k, k),
            'options': options
        })

# ============================================================
# 4) Sort products
# ============================================================
def sort_key(p):
    ptype = p['specs'].get('Type', '')
    payload = 0
    try:
        payload = float(p['specs'].get('Payload(kg)', '0'))
    except:
        pass
    reach = 0
    try:
        reach = float(p['specs'].get('Manipulator Length(mm)', '0'))
    except:
        pass
    return (ptype, payload, reach, p['name'])

products.sort(key=sort_key)

# ============================================================
# 5) Parse Accessories
# ============================================================
accessories = []
df_acc = model_xl.parse("Accessories")
df_acc['Type'] = df_acc['Type'].ffill()
for _, row in df_acc.iterrows():
    acc_code = str(row.get('Code', '')).strip()
    if pd.isna(acc_code) or acc_code == 'nan' or acc_code == '-':
        continue
    desc = str(row.get('Description', '')).replace('\n', ' ').replace('\ufffd', '').strip()
    type_name = str(row.get('Type', '')).replace('\n', ' ').strip()
    accessories.append({
        'code': acc_code,
        'type': type_name,
        'description': desc
    })

# ============================================================
# 6) Write data.js
# ============================================================
data_js_content = f"""const filtersData = {json.dumps(filters_data, indent=4, ensure_ascii=False)};

const productsData = {json.dumps(products, indent=4, ensure_ascii=False)};

const accessoriesList = {json.dumps(accessories, indent=4, ensure_ascii=False)};
"""

with open("data.js", "w", encoding="utf-8") as f:
    f.write(data_js_content)

print(f"\ndata.js generated successfully!")
print(f"Total products: {len(products)}")
print(f"Total filters: {len(filters_data)}")
print(f"Total accessories: {len(accessories)}")
print(f"\nProducts list:")
for p in products:
    print(f"  {p['id']} - Payload:{p['specs'].get('Payload(kg)','?')}kg Reach:{p['specs'].get('Manipulator Length(mm)','?')}mm DetailSpecs:{len(p.get('detailSpecs',{}))}")
