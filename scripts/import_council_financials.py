#!/usr/bin/env python3
"""Import parsed council AFS data into Supabase.

Usage:
    python3 scripts/import_council_financials.py [--batch-results PATH]

Reads batch_results.json (from run_batch_parse.py) and upserts into
the council_income_expenditure, council_balance_sheet, and
council_division_expenditure tables.

Requires: SUPABASE_URL and SUPABASE_SERVICE_KEY env vars
(service key, not anon key — needs write access).
"""

import json
import os
import sys
from pathlib import Path

try:
    from supabase import create_client
except ImportError:
    print("pip install supabase")
    sys.exit(1)

BATCH_RESULTS_DEFAULT = Path(__file__).resolve().parent.parent.parent / "openbenefacts-scrapers" / "batch_results.json"

DIVISION_MAP = {
    "housing_building": ("A", "Housing & Building"),
    "roads_transport": ("B", "Roads Transportation & Safety"),
    "water_services": ("C", "Water Services"),
    "development_mgmt": ("D", "Development Management"),
    "environmental": ("E", "Environmental Services"),
    "recreation_amenity": ("F", "Recreation & Amenity"),
    "agriculture": ("G", "Agriculture, Education, Health & Welfare"),
    "miscellaneous": ("H", "Miscellaneous Services"),
}

IE_FIELDS = [
    "total_gross_expenditure", "total_income", "total_net_expenditure",
    "rates", "local_property_tax",
    "surplus_deficit_before_transfers", "transfers_from_to_reserves",
    "overall_surplus_deficit", "general_reserve_opening", "general_reserve_closing",
    "total_net_expenditure_prior", "rates_prior", "local_property_tax_prior",
    "surplus_deficit_before_transfers_prior", "transfers_from_to_reserves_prior",
    "overall_surplus_deficit_prior", "general_reserve_opening_prior",
    "general_reserve_closing_prior",
]

BS_FIELDS = [
    "fixed_assets_operational", "fixed_assets_infrastructural",
    "fixed_assets_community", "fixed_assets_non_operational",
    "fixed_assets_total", "work_in_progress", "long_term_debtors",
    "current_assets_total", "current_liabilities_total", "net_current_assets",
    "loans_payable", "creditors_long_term_total", "net_assets",
    "capitalisation_account", "general_revenue_reserve", "total_reserves",
]


def classify_status(r):
    ie_pop = r.get("ie_populated", 0)
    bs_pop = r.get("bs_populated", 0)
    if ie_pop >= 14 and bs_pop >= 10:
        return "OK"
    elif ie_pop >= 5 or bs_pop >= 5:
        return "PARTIAL"
    return "FAIL"


def safe_int(val):
    """Convert to int, handling floats and None."""
    if val is None:
        return None
    try:
        return int(round(float(val)))
    except (ValueError, TypeError):
        return None


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Import council AFS data to Supabase")
    parser.add_argument("--batch-results", type=Path, default=BATCH_RESULTS_DEFAULT)
    parser.add_argument("--dry-run", action="store_true", help="Print stats without writing")
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.")
        print("(Use the service_role key, not the anon key.)")
        sys.exit(1)

    sb = create_client(url, key)

    with open(args.batch_results) as f:
        data = json.load(f)

    results = data["results"]
    print(f"Loaded {len(results)} parsed records")

    # Fetch council slug→id mapping
    councils_resp = sb.table("councils").select("id, slug").execute()
    slug_to_id = {c["slug"]: c["id"] for c in councils_resp.data}
    print(f"Found {len(slug_to_id)} councils in database")

    ie_rows, bs_rows, div_rows = [], [], []
    skipped = 0

    for r in results:
        slug = r.get("council", "")
        year = r.get("year")
        council_id = slug_to_id.get(slug)

        if not council_id:
            skipped += 1
            continue

        status = classify_status(r)
        ie_data = r.get("income_expenditure") or {}
        bs_data = r.get("balance_sheet") or {}

        # I&E row
        ie_row = {
            "council_id": council_id,
            "year": year,
            "source_status": status,
            "is_ocr": r.get("is_ocr", False),
        }
        for field in IE_FIELDS:
            ie_row[field] = safe_int(ie_data.get(field))
        ie_rows.append(ie_row)

        # BS row
        bs_row = {"council_id": council_id, "year": year}
        has_bs = False
        for field in BS_FIELDS:
            val = safe_int(bs_data.get(field))
            bs_row[field] = val
            if val is not None:
                has_bs = True
        if has_bs:
            bs_rows.append(bs_row)

        # Division rows
        divisions = ie_data.get("divisions")
        if divisions and isinstance(divisions, dict):
            for div_key, div_data in divisions.items():
                if div_key not in DIVISION_MAP or not isinstance(div_data, dict):
                    continue
                code, name = DIVISION_MAP[div_key]
                div_rows.append({
                    "council_id": council_id,
                    "year": year,
                    "division_code": code,
                    "division_name": name,
                    "gross_expenditure": safe_int(div_data.get("gross_expenditure")),
                    "income": safe_int(div_data.get("income")),
                    "net_expenditure": safe_int(div_data.get("net_expenditure")),
                    "net_expenditure_prior": safe_int(div_data.get("net_expenditure_prior")),
                })

    print(f"\nReady to upsert:")
    print(f"  I&E rows:      {len(ie_rows)}")
    print(f"  BS rows:       {len(bs_rows)}")
    print(f"  Division rows: {len(div_rows)}")
    print(f"  Skipped:       {skipped} (no matching council slug)")

    if args.dry_run:
        print("\n--dry-run: no data written")
        return

    # Upsert in batches
    BATCH = 50

    print("\nUpserting I&E...")
    for i in range(0, len(ie_rows), BATCH):
        batch = ie_rows[i:i + BATCH]
        sb.table("council_income_expenditure").upsert(
            batch, on_conflict="council_id,year"
        ).execute()
    print(f"  {len(ie_rows)} rows done")

    print("Upserting Balance Sheets...")
    for i in range(0, len(bs_rows), BATCH):
        batch = bs_rows[i:i + BATCH]
        sb.table("council_balance_sheet").upsert(
            batch, on_conflict="council_id,year"
        ).execute()
    print(f"  {len(bs_rows)} rows done")

    print("Upserting Divisions...")
    for i in range(0, len(div_rows), BATCH):
        batch = div_rows[i:i + BATCH]
        sb.table("council_division_expenditure").upsert(
            batch, on_conflict="council_id,year,division_code"
        ).execute()
    print(f"  {len(div_rows)} rows done")

    print("\nImport complete!")


if __name__ == "__main__":
    main()
