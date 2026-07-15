import pandas as pd

file_path = "2025 INT Robot Sales List V3.2.xlsx"
xl = pd.ExcelFile(file_path)
df = xl.parse("6-Axis Robot")
models = df['Model'].dropna().unique()
print("6-Axis Models:", models)
