#!/usr/bin/env python3
"""
Monthly archival scraper: Department of Education School Registers
Downloads primary and post-primary school registers from data.gov.ie,
archives them, and cross-references with Supabase organisations to identify
schools registered as charities.

Data sources:
  - data.gov.ie CKAN API: "primary-schools-list" and "post-primary-schools-list"
  - Primary: https://data.gov.ie/dataset/primary-schools-list
  - Post-Primary: https://data.gov.ie/dataset/post-primary-schools-list

Run monthly via cron or scheduled task:
  python3 scrapers/archive_dept_education.py
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


def fetch_dataset_from_ckan(dataset_id):
    """Fetch a dataset from data.gov.ie CKAN API and return download URLs."""
    try:
        print(f"  Fetching CKAN metadata for {dataset_id}...")
        api_resp = requests.get(
            "https://data.gov.ie/api/3/action/package_show",
            params={"id": dataset_id},
            timeout=30,
        )
        if api_resp.status_code == 200:
            pkg = api_resp.json().get("result", {})
            urls = []
            for resource in pkg.get("resources", []):
                if resource.get("format", "").upper() in ("CSV", "XLSX", "XLS"):
                    urls.append({
                        "url": resource["url"],
                        "format": resource.get("format", "CSV"),
                        "name": resource.get("name", ""),
                    })
            return urls
    except Exception as e:
        print(f"  CKAN fetch failed: {e}")
    return []


def download_school_data(dest, dataset_id):
    """Download school register from data.gov.ie."""
    urls = fetch_dataset_from_ckan(dataset_id)
    if not urls:
        return False

    for resource in urls:
        try:
            url = resource["url"]
            print(f"  Downloading {resource['name']} ({resource['format']})...")
            resp = requests.get(url, timeout=120, stream=True)
            if resp.status_code == 200:
                with open(dest, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                size = dest.stat().st_size
                print(f"  Downloaded {dest.name} ({size / 1024:.0f} KB)")
                return True
        except Exception as e:
            print(f"  Download failed: {e}")
            continue

    return False


def parse_schools_csv(csv_path, school_type):
    """Parse school register CSV (primary or post-primary)."""
    records = []
    try:
        with open(csv_path, "r", encoding="utf-8-sig", errors="replace") as f:
            reader = csv.DictReader(f)
            if not reader.fieldnames:
                return records

            for row in reader:
                # Column names vary — try common variants
                roll = (row.get("Roll Number") or row.get("RollNo") or
                       row.get("roll_number") or row.get("Roll") or "").strip()
                name = (row.get("School Name") or row.get("Name") or
                       row.get("school_name") or "").strip()
                address = (row.get("Address") or row.get("address") or "").strip()
                county = (row.get("County") or row.get("county") or "").strip()
                enrolment = (row.get("Enrolment") or row.get("enrolment") or
                           row.get("Number of Pupils") or "").strip()

                if roll and name:
                    try:
                        enrol_count = int(enrolment) if enrolment and enrolment.isdigit() else None
                    except (ValueError, TypeError):
                        enrol_count = None

                    records.append({
                        "roll_number": roll,
                        "name": name,
                        "address": address,
                        "county": county,
                        "type": school_type,
                        "enrolment_count": enrol_count,
                    })
    except Exception as e:
        print(f"  Parse error: {e}")

    print(f"  Parsed {len(records)} {school_type} school records")
    return records


def cross_reference_with_supabase(schools, headers):
    """Cross-reference school names with Supabase organisations."""
    print(f"  Cross-referencing {len(schools)} schools with Supabase...")
    matched = []
    unmatched = []

    for school in schools:
        # Search for organisations by name (case-insensitive partial match)
        try:
            resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/organisations",
                headers=headers,
                params={
                    "select": "id,name,charity_number",
                    "name": f"ilike.*{school['name']}*",
                },
                timeout=30,
            )
            if resp.status_code == 200:
                orgs = resp.json()
                if orgs:
                    # Best match: exact or first match
                    best = next((o for o in orgs if o["name"].lower() == school["name"].lower()), orgs[0])
                    school["matched_org_id"] = best["id"]
                    school["matched_org_name"] = best["name"]
                    school["matched_charity_number"] = best.get("charity_number")
                    matched.append(school)
                else:
                    unmatched.append(school)
            else:
                unmatched.append(school)
        except Exception as e:
            unmatched.append(school)

    print(f"  Matched: {len(matched)}, Unmatched: {len(unmatched)}")
    return matched, unmatched


def main():
    print(f"=== Department of Education School Registers Archive — {TIMESTAMP} ===\n")
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)

    # Download primary schools
    primary_dest = ARCHIVE_DIR / f"dept_education_primary_{TIMESTAMP}.csv"
    primary_records = []
    if primary_dest.exists():
        print(f"  {primary_dest.name} already exists, parsing...")
        primary_records = parse_schools_csv(primary_dest, "primary")
    else:
        success = download_school_data(primary_dest, "primary-schools-list")
        if success:
            primary_records = parse_schools_csv(primary_dest, "primary")
        else:
            print("\n✗ Could not download primary schools data")

    # Download post-primary schools
    postprimary_dest = ARCHIVE_DIR / f"dept_education_post_primary_{TIMESTAMP}.csv"
    postprimary_records = []
    if postprimary_dest.exists():
        print(f"  {postprimary_dest.name} already exists, parsing...")
        postprimary_records = parse_schools_csv(postprimary_dest, "post-primary")
    else:
        success = download_school_data(postprimary_dest, "post-primary-schools-list")
        if success:
            postprimary_records = parse_schools_csv(postprimary_dest, "post-primary")
        else:
            print("\n✗ Could not download post-primary schools data")

    # Combine records
    all_schools = primary_records + postprimary_records
    if not all_schools:
        print("\nNo school records parsed.")
        return

    # Cross-reference if Supabase key is available
    if SUPABASE_KEY:
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        }
        matched, unmatched = cross_reference_with_supabase(all_schools, headers)
        all_schools = matched + unmatched
    else:
        print("\n⚠ SUPABASE_SERVICE_KEY not set — no cross-referencing with organisations")

    # Save combined CSV
    csv_path = ARCHIVE_DIR / f"dept_education_schools_{TIMESTAMP}.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        fieldnames = [
            "roll_number", "name", "address", "county", "type", "enrolment_count",
            "matched_org_id", "matched_org_name", "matched_charity_number",
        ]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for school in all_schools:
            writer.writerow({
                "roll_number": school.get("roll_number", ""),
                "name": school.get("name", ""),
                "address": school.get("address", ""),
                "county": school.get("county", ""),
                "type": school.get("type", ""),
                "enrolment_count": school.get("enrolment_count", ""),
                "matched_org_id": school.get("matched_org_id", ""),
                "matched_org_name": school.get("matched_org_name", ""),
                "matched_charity_number": school.get("matched_charity_number", ""),
            })
    print(f"  Saved {len(all_schools)} schools to {csv_path.name}")

    # Save as JSON
    json_path = ARCHIVE_DIR / f"dept_education_schools_{TIMESTAMP}.json"
    with open(json_path, "w") as f:
        json.dump(all_schools, f, indent=2)
    print(f"  Saved {json_path.name}")

    # Write summary
    summary = {
        "timestamp": TIMESTAMP,
        "date": datetime.now().isoformat(),
        "total_schools": len(all_schools),
        "primary_schools": len(primary_records),
        "post_primary_schools": len(postprimary_records),
        "matched_with_charities": sum(1 for s in all_schools if s.get("matched_org_id")),
    }
    summary_path = ARCHIVE_DIR / f"dept_education_summary_{TIMESTAMP}.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\n✓ Archive complete. Summary saved to {summary_path.name}")


if __name__ == "__main__":
    main()
