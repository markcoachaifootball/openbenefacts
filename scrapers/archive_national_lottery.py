#!/usr/bin/env python3
"""
Monthly archival scraper: National Lottery Good Causes Funding
Downloads National Lottery grant data from data.gov.ie and web sources,
archives it, and cross-references with Supabase organisations.

Data sources:
  - data.gov.ie CKAN API: Search for "national lottery" or "lottery"
  - Primary: https://www.lottery.ie/good-causes
  - Annual Reports: https://www.lottery.ie/about-us/news-and-reports

Run monthly via cron or scheduled task:
  python3 scrapers/archive_national_lottery.py
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


def search_ckan_for_lottery():
    """Search data.gov.ie CKAN API for lottery-related datasets."""
    try:
        print("  Searching data.gov.ie for lottery datasets...")
        api_resp = requests.get(
            "https://data.gov.ie/api/3/action/package_search",
            params={
                "q": "lottery",
                "rows": 20,
            },
            timeout=30,
        )
        if api_resp.status_code == 200:
            results = api_resp.json().get("result", {})
            packages = results.get("results", [])
            print(f"  Found {len(packages)} lottery-related datasets")
            return packages
    except Exception as e:
        print(f"  CKAN search failed: {e}")
    return []


def fetch_lottery_resources_from_package(package):
    """Extract downloadable resources from a CKAN package."""
    resources = []
    try:
        for resource in package.get("resources", []):
            if resource.get("format", "").upper() in ("CSV", "XLSX", "XLS", "JSON"):
                resources.append({
                    "url": resource["url"],
                    "format": resource.get("format", ""),
                    "name": resource.get("name", ""),
                    "package_title": package.get("title", ""),
                })
    except Exception as e:
        pass
    return resources


def download_lottery_resource(dest, resource_url):
    """Download a lottery data resource."""
    try:
        print(f"  Downloading {resource_url}...")
        resp = requests.get(resource_url, timeout=120, stream=True)
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
    return False


def parse_lottery_csv(csv_path):
    """Parse lottery grant CSV file."""
    records = []
    try:
        with open(csv_path, "r", encoding="utf-8-sig", errors="replace") as f:
            reader = csv.DictReader(f)
            if not reader.fieldnames:
                return records

            for row in reader:
                # Try common column name variants
                recipient = (row.get("Recipient") or row.get("Organisation") or
                           row.get("recipient_name") or row.get("Recipient Name") or "").strip()
                amount_str = (row.get("Amount") or row.get("amount") or
                            row.get("Grant Amount") or row.get("Funding") or "").strip()
                programme = (row.get("Programme") or row.get("programme") or
                           row.get("Category") or row.get("Scheme") or "").strip()
                year_str = (row.get("Year") or row.get("year") or
                          row.get("Date") or row.get("date") or "").strip()

                if recipient and amount_str:
                    try:
                        # Clean amount (remove €, commas, etc.)
                        amount = float(amount_str.replace("€", "").replace(",", "").strip())
                    except ValueError:
                        amount = None

                    year = None
                    if year_str:
                        try:
                            # Try to extract year
                            year = int(year_str[-4:]) if year_str[-4:].isdigit() else None
                        except (ValueError, IndexError):
                            pass

                    records.append({
                        "recipient_name": recipient,
                        "amount": amount,
                        "programme": programme,
                        "year": year,
                    })
    except Exception as e:
        print(f"  Parse error: {e}")

    print(f"  Parsed {len(records)} lottery grant records")
    return records


def cross_reference_with_supabase(grants, headers):
    """Cross-reference grant recipients with Supabase organisations."""
    print(f"  Cross-referencing {len(grants)} grants with Supabase...")
    matched = []
    unmatched = []

    for grant in grants:
        try:
            resp = requests.get(
                f"{SUPABASE_URL}/rest/v1/organisations",
                headers=headers,
                params={
                    "select": "id,name,charity_number",
                    "name": f"ilike.*{grant['recipient_name']}*",
                },
                timeout=30,
            )
            if resp.status_code == 200:
                orgs = resp.json()
                if orgs:
                    best = next((o for o in orgs if o["name"].lower() == grant["recipient_name"].lower()), orgs[0])
                    grant["matched_org_id"] = best["id"]
                    grant["matched_org_name"] = best["name"]
                    grant["matched_charity_number"] = best.get("charity_number")
                    matched.append(grant)
                else:
                    unmatched.append(grant)
            else:
                unmatched.append(grant)
        except Exception as e:
            unmatched.append(grant)

    print(f"  Matched: {len(matched)}, Unmatched: {len(unmatched)}")
    return matched, unmatched


def main():
    print(f"=== National Lottery Good Causes Archive — {TIMESTAMP} ===\n")
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)

    # Search CKAN for lottery datasets
    packages = search_ckan_for_lottery()
    all_grants = []

    # Attempt to download resources from packages
    if packages:
        for i, package in enumerate(packages[:5]):  # Limit to first 5 packages
            resources = fetch_lottery_resources_from_package(package)
            for resource in resources:
                dest = ARCHIVE_DIR / f"national_lottery_resource_{i}_{TIMESTAMP}.csv"
                if download_lottery_resource(dest, resource["url"]):
                    records = parse_lottery_csv(dest)
                    all_grants.extend(records)

    # If no CKAN data, archive the URL for manual inspection
    if not all_grants:
        print("\n  No lottery data found in CKAN — archiving source URLs for manual review")
        source_urls = [
            "https://www.lottery.ie/good-causes",
            "https://www.lottery.ie/about-us/news-and-reports",
        ]
        url_list = [{"url": url, "type": "web_page"} for url in source_urls]
        json_path = ARCHIVE_DIR / f"national_lottery_sources_{TIMESTAMP}.json"
        with open(json_path, "w") as f:
            json.dump(url_list, f, indent=2)
        print(f"  Saved source URLs to {json_path.name} for manual processing")
        return

    # Cross-reference if Supabase key is available
    if SUPABASE_KEY:
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        }
        matched, unmatched = cross_reference_with_supabase(all_grants, headers)
        all_grants = matched + unmatched
    else:
        print("\n⚠ SUPABASE_SERVICE_KEY not set — no cross-referencing with organisations")

    # Save combined CSV
    csv_path = ARCHIVE_DIR / f"national_lottery_grants_{TIMESTAMP}.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        fieldnames = [
            "recipient_name", "amount", "programme", "year",
            "matched_org_id", "matched_org_name", "matched_charity_number",
        ]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for grant in all_grants:
            writer.writerow({
                "recipient_name": grant.get("recipient_name", ""),
                "amount": grant.get("amount", ""),
                "programme": grant.get("programme", ""),
                "year": grant.get("year", ""),
                "matched_org_id": grant.get("matched_org_id", ""),
                "matched_org_name": grant.get("matched_org_name", ""),
                "matched_charity_number": grant.get("matched_charity_number", ""),
            })
    print(f"  Saved {len(all_grants)} grants to {csv_path.name}")

    # Save as JSON
    json_path = ARCHIVE_DIR / f"national_lottery_grants_{TIMESTAMP}.json"
    with open(json_path, "w") as f:
        json.dump(all_grants, f, indent=2)
    print(f"  Saved {json_path.name}")

    # Write summary
    summary = {
        "timestamp": TIMESTAMP,
        "date": datetime.now().isoformat(),
        "total_grants": len(all_grants),
        "total_amount_distributed": sum(g.get("amount") or 0 for g in all_grants),
        "matched_with_charities": sum(1 for g in all_grants if g.get("matched_org_id")),
    }
    summary_path = ARCHIVE_DIR / f"national_lottery_summary_{TIMESTAMP}.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\n✓ Archive complete. Summary saved to {summary_path.name}")


if __name__ == "__main__":
    main()
