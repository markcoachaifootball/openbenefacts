#!/bin/bash
# Download the Charities Regulator public register (XLSX) and convert to CSV
# The register includes trustee names, roles, and start dates
#
# Run: bash scripts/download_charities_register.sh

set -e

DATA_DIR="$(dirname "$0")/../openbenefacts_data"
mkdir -p "$DATA_DIR"

XLSX_URL="https://www.charitiesregulator.ie/media/5rrnldzg/public-register-of-charities.xlsx"
XLSX_FILE="$DATA_DIR/public-register-of-charities.xlsx"
CSV_FILE="$DATA_DIR/charities_register.csv"

echo "=== Charities Register Download ==="
echo ""

# Download the XLSX
echo "Downloading from Charities Regulator..."
curl -L -o "$XLSX_FILE" "$XLSX_URL"
echo "Downloaded: $(du -h "$XLSX_FILE" | cut -f1)"

# Convert XLSX to CSV using Python
echo ""
echo "Converting XLSX to CSV..."
python3 -c "
import sys
try:
    import openpyxl
except ImportError:
    print('Installing openpyxl...')
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'openpyxl', '--break-system-packages', '-q'])
    import openpyxl

import csv

wb = openpyxl.load_workbook('$XLSX_FILE', read_only=True)
ws = wb.active

with open('$CSV_FILE', 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    for row in ws.iter_rows(values_only=True):
        writer.writerow([str(cell) if cell is not None else '' for cell in row])

wb.close()
print(f'Converted to CSV: $CSV_FILE')
"

# Show stats
LINES=$(wc -l < "$CSV_FILE")
echo ""
echo "CSV has $LINES rows (including header)"
echo ""

# Show header columns
echo "Columns:"
head -1 "$CSV_FILE" | tr ',' '\n' | nl
echo ""
echo "Done! Now run: node scripts/import_directors.cjs"
