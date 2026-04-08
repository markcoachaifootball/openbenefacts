#!/usr/bin/env python3
"""
Lightweight data fetcher for Irish nonprofit sources
"""

import sys
import urllib.request
import json
from pathlib import Path
from time import sleep

OUTPUT_DIR = Path("/sessions/amazing-exciting-turing/mnt/Documents/openbenefacts/openbenefacts_data")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def fetch_json(url, timeout=60):
    """Fetch JSON from URL with basic error handling"""
    print(f"Fetching: {url}")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=timeout) as response:
            data = response.read()
            return json.loads(data)
    except Exception as e:
        print(f"  Error: {e}")
        return None

def main():
    print("\n" + "="*60)
    print("IRISH NONPROFIT DATA SOURCES - BASIC FETCH")
    print("="*60)

    # Test CKAN API endpoints
    queries = [
        "revenue charities",
        "tax exempt charities",
        "primary schools",
        "post-primary schools",
        "public participation networks",
        "sport ireland funding",
        "arts council funding",
    ]

    found_packages = {}

    for query in queries:
        print(f"\nSearching for: {query}")
        url = f"https://data.gov.ie/api/3/action/package_search?q={query}&rows=10"

        data = fetch_json(url, timeout=60)

        if data and data.get('success'):
            packages = data.get('result', {}).get('results', [])
            print(f"  Found {len(packages)} package(s)")

            for pkg in packages:
                pkg_name = pkg.get('name')
                pkg_title = pkg.get('title')
                resources = pkg.get('resources', [])
                csv_resources = [r for r in resources if r.get('format', '').upper() == 'CSV']

                print(f"    - {pkg_title} ({pkg_name})")
                print(f"      Resources: {len(resources)} total, {len(csv_resources)} CSV")

                if pkg_name not in found_packages:
                    found_packages[pkg_name] = {
                        'title': pkg_title,
                        'resources': resources
                    }

        sleep(2)

    # Try CRO API
    print(f"\nFetching CRO company data...")
    cro_url = "https://opendata.cro.ie/api/3/action/datastore_search?resource_id=563161e1-efc3-44a2-a353-1cf480dea3a0&limit=100"
    cro_data = fetch_json(cro_url, timeout=60)

    if cro_data and cro_data.get('success'):
        records = cro_data.get('result', {}).get('records', [])
        print(f"  Found {len(records)} CRO records")

    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY - Found packages:")
    print(f"{'='*60}")

    for name, info in found_packages.items():
        print(f"  {name}")
        print(f"    Title: {info['title']}")
        print(f"    Resources: {len(info['resources'])}")

if __name__ == "__main__":
    main()
