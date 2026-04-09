#!/usr/bin/env python3
"""
Monthly archival scraper: Charities Regulator
Downloads the register of charities and annual returns CSVs,
stamps them with the current month, and stores them locally.
Then upserts new/changed records into Supabase.

Data sources:
  - Register of Charities: https://www.charitiesregulator.ie/media/d52jwriz/register-of-charities.csv
  - Annual Returns: https://www.charitiesregulator.ie/media/wtgnl1gb/charity-annual-reports.csv

Run monthly via cron or scheduled task:
  python3 scrapers/archive_charities_regulator.py
"""

import os
import csv
import json
import requests
from datetime import datetime
from pathlib import Path

# ── Configuration ──
SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "https://ilkwspvhqedzjreysuxu.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")  # Use service role key for writes
ARCHIVE_DIR = Path(__file__).parent.parent / "data" / "archive"
TIMESTAMP = datetime.now().strftime("%Y-%m")

SOURCES = {
    "register": {
        "url": "https://www.charitiesregulator.ie/media/d52jwriz/register-of-charities.csv",
        "filename": f"charities_register_{TIMESTAMP}.csv",
    },
    "annual_returns": {
        "url": "https://www.charitiesregulator.ie/media/wtgnl1gb/charity-annual-reports.csv",
        "filename": f"charities_annual_returns_{TIMESTAMP}.csv",
    },
}


def download_csv(url, dest):
    """Download a CSV file with progress indication."""
    print(f"  Downloading {url}")
    resp = requests.get(url, stream=True, timeout=120)
    resp.raise_for_status()
    size = 0
    with open(dest, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)
            size += len(chunk)
    print(f"  Saved {dest.name} ({size / 1024 / 1024:.1f} MB)")
    return dest


def parse_annual_returns(csv_path):
    """Parse the annual returns CSV into financial records."""
    records = []
    with open(csv_path, "r", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                rcn = row.get("Registered Charity Number", "").strip()
                year_str = row.get("Financial Period End", "")
                if not rcn or not year_str:
                    continue
                # Extract year from date
                year = None
                for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
                    try:
                        year = datetime.strptime(year_str.strip(), fmt).year
                        break
                    except ValueError:
                        continue
                if not year:
                    continue

                def parse_euro(val):
                    if not val:
                        return None
                    cleaned = val.replace("€", "").replace("\ufffd", "").replace(",", "").strip()
                    try:
                        return float(cleaned)
                    except ValueError:
                        return None

                records.append({
                    "rcn": rcn,
                    "year": year,
                    "gross_income": parse_euro(row.get("Gross Income", "")),
                    "gross_expenditure": parse_euro(row.get("Gross Expenditure", "")),
                    "total_assets": parse_euro(row.get("Total Assets", "")),
                    "employees": int(row.get("Employees", "0") or "0") if row.get("Employees", "").strip().isdigit() else None,
                })
            except Exception as e:
                continue  # Skip malformed rows
    print(f"  Parsed {len(records)} financial records")
    return records


def lookup_org_ids(rcns, headers):
    """Batch-lookup org_ids from RCN numbers via Supabase."""
    print(f"  Looking up {len(rcns)} RCNs in Supabase...")
    mapping = {}
    rcn_list = list(rcns)
    batch_size = 200
    for i in range(0, len(rcn_list), batch_size):
        batch = rcn_list[i:i + batch_size]
        filter_str = ",".join(batch)
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/organisations",
            headers=headers,
            params={
                "select": "id,charity_number",
                "charity_number": f"in.({filter_str})",
            },
            timeout=30,
        )
        if resp.status_code == 200:
            for org in resp.json():
                mapping[org["charity_number"]] = org["id"]
    print(f"  Matched {len(mapping)} RCNs to org_ids")
    return mapping


def upsert_financials(records, rcn_to_org_id, headers):
    """Insert new financial records into Supabase (skip duplicates)."""
    rows = []
    for r in records:
        org_id = rcn_to_org_id.get(r["rcn"])
        if not org_id:
            continue
        rows.append({
            "org_id": org_id,
            "year": r["year"],
            "gross_income": r["gross_income"],
            "gross_expenditure": r["gross_expenditure"],
            "total_assets": r["total_assets"],
            "employees": r["employees"],
        })

    print(f"  Inserting {len(rows)} financial records...")
    inserted = 0
    skipped = 0
    batch_size = 500
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/financials",
            headers={**headers, "Prefer": "resolution=ignore-duplicates"},
            json=batch,
            timeout=30,
        )
        if resp.status_code in (200, 201):
            inserted += len(batch)
        else:
            skipped += len(batch)
            # Individual insert fallback for failed batches
            for row in batch:
                r2 = requests.post(
                    f"{SUPABASE_URL}/rest/v1/financials",
                    headers={**headers, "Prefer": "resolution=ignore-duplicates"},
                    json=[row],
                    timeout=10,
                )
                if r2.status_code in (200, 201):
                    inserted += 1
                    skipped -= 1

    print(f"  Inserted: {inserted}, Skipped (duplicates): {skipped}")
    return inserted


def main():
    print(f"=== Charities Regulator Archive — {TIMESTAMP} ===\n")

    # Create archive directory
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Download CSVs
    for name, source in SOURCES.items():
        dest = ARCHIVE_DIR / source["filename"]
        if dest.exists():
            print(f"  {source['filename']} already exists, skipping download")
        else:
            download_csv(source["url"], dest)

    # 2. Parse annual returns
    returns_path = ARCHIVE_DIR / SOURCES["annual_returns"]["filename"]
    records = parse_annual_returns(returns_path)
    if not records:
        print("\nNo records parsed. Check CSV format.")
        return

    # 3. Upsert into Supabase (if service key available)
    if not SUPABASE_KEY:
        print("\n⚠ SUPABASE_SERVICE_KEY not set — archiving CSV only, no database update.")
        print("  To enable database updates, set: export SUPABASE_SERVICE_KEY=your_service_role_key")

        # Save parsed records as JSON for manual import
        json_path = ARCHIVE_DIR / f"charities_annual_returns_{TIMESTAMP}.json"
        with open(json_path, "w") as f:
            json.dump(records, f, indent=2)
        print(f"  Saved parsed records to {json_path.name}")
        return

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }

    # Get unique RCNs and look up org_ids
    unique_rcns = set(r["rcn"] for r in records)
    rcn_to_org_id = lookup_org_ids(unique_rcns, headers)

    # Upsert financial records
    inserted = upsert_financials(records, rcn_to_org_id, headers)

    # Write summary
    summary = {
        "timestamp": TIMESTAMP,
        "date": datetime.now().isoformat(),
        "records_parsed": len(records),
        "unique_rcns": len(unique_rcns),
        "matched_orgs": len(rcn_to_org_id),
        "records_inserted": inserted,
    }
    summary_path = ARCHIVE_DIR / f"archive_summary_{TIMESTAMP}.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\n✓ Archive complete. Summary saved to {summary_path.name}")


if __name__ == "__main__":
    main()
