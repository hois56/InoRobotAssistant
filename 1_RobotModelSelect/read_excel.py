import pandas as pd

file_path = "2025 INT Robot Sales List V3.2.xlsx"
xl = pd.ExcelFile(file_path)

for sheet in ['SCARA Robot', '6-Axis Robot']:
    df = xl.parse(sheet)
    print(f"\n--- Sheet: {sheet} ---")
    print("Columns:", df.columns.tolist())
    print("Head:\n", df.head(5).to_string())
