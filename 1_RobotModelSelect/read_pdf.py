import sys
import PyPDF2

pdf_path = "19120306-CY_A03_Inovance Robot Selection Guide_EN 20251120_Web.pdf"
try:
    reader = PyPDF2.PdfReader(pdf_path)
    text = ""
    for i in range(10, 30): # pages 10 to 30 usually have tables
        if i < len(reader.pages):
            text += reader.pages[i].extract_text() + "\n"
    
    with open("pdf_out.txt", "w", encoding="utf-8") as f:
        f.write(text)
    print("PDF read to pdf_out.txt")
except Exception as e:
    print(e)
