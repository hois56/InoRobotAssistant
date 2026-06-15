import base64
from pathlib import Path

project_dir = Path(__file__).resolve().parent
assets_path = project_dir / 'assets.js'
resources_dir = project_dir / 'Resources'

# 1. Get existing Logo_PNG (preserve it)
with open(assets_path, 'r', encoding='utf-8') as f:
    lines = [f.readline() for _ in range(2)]
    logo_line = lines[1].strip()

# 2. Convert latest Excel to base64
excel_path = resources_dir / 'InoRobot_IO_Map_0614.xlsx'
with open(excel_path, 'rb') as f:
    excel_base64 = base64.b64encode(f.read()).decode('utf-8')

# 3. Read other resources
def read_resource(name):
    path = resources_dir / name
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def js_template(value):
    return value.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')

remote_io = read_resource('Remote_IO_Mapping.dat')
robots_6_axis = read_resource('Robot_model_6_axis.csv')
robots_scara = read_resource('Robot_model_SCARA.csv')
robots_torque = read_resource('Robot_model_Torque.csv')

# 4. Construct new assets.js
with open(assets_path, 'w', encoding='utf-8') as f:
    f.write('const Assets = {};\n')
    f.write(logo_line + '\n')
    f.write(f"Assets.IO_Map_Excel = '{excel_base64}';\n")
    f.write(f"Assets.RemoteIO = `{js_template(remote_io)}`;\n")
    f.write(f"Assets.Robots_6_axis = `{js_template(robots_6_axis)}`;\n")
    f.write(f"Assets.Robots_SCARA = `{js_template(robots_scara)}`;\n")
    f.write(f"Assets.Robots_Torque = `{js_template(robots_torque)}`;\n")

print("assets.js reconstructed successfully.")
