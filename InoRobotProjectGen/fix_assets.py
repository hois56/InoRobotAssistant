import base64
import os

assets_path = r'c:\Users\hois5\OneDrive\Desktop\made_C#\InoRobotAssistant\InoRobotProjectGen\assets.js'
resources_dir = r'c:\Users\hois5\OneDrive\Desktop\made_C#\InoRobotAssistant\InoRobotProjectGen\Resources'

# 1. Get existing Logo_PNG (preserve it)
with open(assets_path, 'r', encoding='utf-8') as f:
    lines = [f.readline() for _ in range(2)]
    logo_line = lines[1].strip()

# 2. Convert latest Excel to base64
excel_path = os.path.join(resources_dir, 'InoRobot_IO_Map_V24.C4.02.xlsx')
with open(excel_path, 'rb') as f:
    excel_base64 = base64.b64encode(f.read()).decode('utf-8')

# 3. Read other resources
def read_resource(name):
    path = os.path.join(resources_dir, name)
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

remote_io = read_resource('Remote_IO_Mapping.dat')
robots_6_axis = read_resource('Robot_model_6_axis.csv')
robots_scara = read_resource('Robot_model_SCARA.csv')
robots_torque = read_resource('Robot_model_Torque.csv')

# 4. Construct new assets.js
with open(assets_path, 'w', encoding='utf-8') as f:
    f.write('const Assets = {};\n')
    f.write(logo_line + '\n')
    f.write(f"Assets.IO_Map_Excel = '{excel_base64}';\n")
    f.write(f"Assets.RemoteIO = `{remote_io}`;\n")
    f.write(f"Assets.Robots_6_axis = `{robots_6_axis}`;\n")
    f.write(f"Assets.Robots_SCARA = `{robots_scara}`;\n")
    f.write(f"Assets.Robots_Torque = `{robots_torque}`;\n")

print("assets.js reconstructed successfully.")
