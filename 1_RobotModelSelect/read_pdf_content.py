import fitz  # PyMuPDF
import sys

pdf_path = "Inovance Robot Selection Guide_EN 20251120.pdf"

import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

try:
    doc = fitz.open(pdf_path)
    print(f"Total pages: {len(doc)}")
    
    # Extract first 30 pages to get more robot data
    for page_num in range(min(30, len(doc))):
        page = doc[page_num]
        text = page.get_text()
        print(f"--- Page {page_num + 1} ---")
        print(text)  # Print full page
        print("\n")
    
    doc.close()
except Exception as e:
    print(f"Error: {e}")
