import pandas as pd

file_path = "2025 INT Robot Sales List V3.2.xlsx"
xl = pd.ExcelFile(file_path)

print("Accessories sheet columns:")
df_acc = xl.parse("Accessories")
print(df_acc.columns)
print(df_acc.head(10))

print("\nExpansion card:")
df_ext = xl.parse("Expansion Card")
print(df_ext.head(10))

print("\nSCARA Robot columns:")
df_sc = xl.parse("SCARA Robot")
print(df_sc.columns)

print("\n6-Axis Robot columns:")
df_6ax = xl.parse("6-Axis Robot")
print(df_6ax.columns)
