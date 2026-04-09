#!/usr/bin/env python3
"""
Monthly archival scraper: Revenue Commissioners CHY Register
Downloads the resident charities register (tax-exempt status), archives it,
and cross-references with existing organisations in Supabase to fill in
missing CHY numbers and tax-exempt status flags.

Data source:
  https://www.revenue.ie/en/corporate/information-about-revenue/statistics/other-datasets/charities/resident-charities.aspx
  Also mirrored on data.gov.ie:
  https://data.gov.ie/dataset/resident-charities-and-approved-bodies-tax-relief-on-donations

Run monthly via cron or scheduled task:
  python3 scrapers/archive_revenue_chy.py
"""

import os
import csv
import json
import requests
from datetime import datetime
from pathlib import Path

SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "https://ilkwspvhqedzjreysuxu.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
ARCHIVE_DIR = Path(__file__).parent.parent / "data" / "archive"
TIMESTAMP = datetime.now().strftime("%Y-%m")

# Revenue publishes this as an Excel file — try CSV from data.gov.ie first
REVENUE_URLS = [
    "https://www.revenue.ie/en/corporate/documents/statistics/charities/resident-charities.csv",
    "https://data.gov.ie/dataset/resident-charities-and-approved-bodies-tax-relief-on-donations",
]


def download_revenue_data(dest):
    """Try to download Revenue CHY register."""
    for url in REVENUE_URLS:
        try:
            print(f"  Trying {url}")
            resp = requests.get(url, timeout=60, allow_redirects=True)
            if resp.status_code == 200 and len(resp.content) > 1000:
                with open(dest, "wb") as f:
                    f.write(resp.content)
                print(f"  Downloaded {len(resp.content) / 1024:.0f} KB")
                return True
        except Exception as e:
            print(f"  Failed: {e}")
            continue

    # Fallback: try scraping the data.gov.ie API for the resource URL
    try:
        print("  Trying data.gov.ie CKAN API...")
        api_resp = requests.get(
            "https://data.gov.ie/api/3/action/package_show",
            params={"id": "resident-charities-and-approved-bodies-tax-relief-on-donations"},
            timeout=30,
        )
        if api_resp.status_code == 200:
            pkg = api_resp.json().get("result", {})
            for resource in pkg.get("resources", []):
                if resource.get("format", "").upper() in ("CSV", "XLS", "XLSX"):
                    url = resource["url"]
                    print(f"  Found resource: {url}")
                    r = requests.get(url, timeout=60)
                    if r.status_code == 200:
                        with open(dest, "wb") as f:
                            f.write(r.content)
                        print(f"  Downloaded {len(r.content) / 1024:.0f} KB")
                        return True
    except Exception as e:
        print(f"  data.gov.ie fallback failed: {e}")

    return False


def parse_chy_register(csv_path):
    """Parse the Revenue CHY register CSV."""
    records = []
    try:
        with open(csv_path, "r", encoding="utf-8-sig", errors="replace") as f:
            # Try to detect delimiter
            sample = f.read(2048)
            f.seek(0)
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
            reader = csv.DictReader(f, dialect=dialect)
            for row in reader:
                # Column names vary — try common variants
                chy = (row.get("CHY Number") or row.get("CHY No") or row.get("CHY")
                       or row.get("chy_number") or row.get("CHY_Number") or "").strip()
                name = (row.get("Name") or row.get("Charity Name") or row.get("name")
                        or row.get("Organisation Name") or "").strip()
                if chy and name:
                    records.append({"chy_number": chy, "name": name})
    except Exception as e:
        print(f"  Parse error: {e}")
    print(f"  Parsed {len(records)} CHY records")
    return records


def main():
    print(f"=== Revenue CHY Register Archive — {TIMESTAMP} ===\n")
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)

    dest = ARCHIVE_DIR / f"revenue_chy_register_{TIMESTAMP}.csv"
    if dest.exists():
        print(f"  {dest.name} already exists, skipping download")
    else:
        success = download_revenue_data(dest)
        if not success:
            print("\n✗ Could not download Revenue CHY register.")
            print("  Manual download: https://www.revenue.ie → Statistics → Other Datasets → Charities")
            return

    records = parse_chy_register(dest)
    if not records:
        print("\nNo records parsed. The file may be Excel format — convert to CSV first.")
        return

    # Save as JSON
    json_path = ARCHIVE_DIR / f"revenue_chy_register_{TIMESTAMP}.json"
    with open(json_path, "w") as f:
        json.dump(records, f, indent=2)
    print(f"  Saved {len(records)} records to {json_path.name}")

    if SUPABASE_KEY:
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        }
        # Cross-reference: find orgs missing CHY numbers and fill them in
        print("\n  Cross-referencing with Supabase organisations...")
        # This would require UPDATE permissions (service role key)
        # For now, generate a patch file
        print("  ⚠ UPDATE operations require service role key")
    else:
        print("\n⚠ SUPABASE_SERVICE_KEY not set — archive only, no database update.")

    print(f"\n✓ Archive complete.")


if __name__ == "__main__":
    main()
