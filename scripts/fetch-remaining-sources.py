#!/usr/bin/env python3
"""
Fetch remaining Irish nonprofit data sources from data.gov.ie, CRO, and legacy sources
"""

import requests
import pandas as pd
import json
import time
from pathlib import Path
from urllib.parse import urljoin
import csv
from io import StringIO

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "openbenefacts_data"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Session with retry logic
session = requests.Session()
session.headers.update({
    'User-Agent': 'Mozilla/5.0 (compatible; OpenBenefacts/1.0)'
})

def safe_request(url, timeout=30, **kwargs):
    """Make a request with error handling"""
    try:
        print(f"  Requesting: {url}")
        response = session.get(url, timeout=timeout, **kwargs)
        response.raise_for_status()
        return response
    except requests.exceptions.RequestException as e:
        print(f"  ERROR: {type(e).__name__}: {e}")
        return None

def fetch_datagov_csv(query, filename_prefix):
    """
    Search data.gov.ie and download CSV files
    """
    print(f"\n{'='*60}")
    print(f"Fetching: {query}")
    print(f"{'='*60}")

    # Try CKAN API search
    ckan_url = f"https://data.gov.ie/api/3/action/package_search?q={query}&rows=20"
    response = safe_request(ckan_url)

    if not response:
        print(f"CKAN API search failed for: {query}")
        return None

    try:
        data = response.json()
        packages = data.get('result', {}).get('results', [])

        if not packages:
            print(f"No packages found for: {query}")
            return None

        print(f"Found {len(packages)} package(s)")

        all_data = []

        for pkg in packages:
            pkg_name = pkg.get('name', 'unknown')
            pkg_title = pkg.get('title', 'Unknown')
            print(f"\n  Package: {pkg_title} ({pkg_name})")

            resources = pkg.get('resources', [])

            for resource in resources:
                resource_name = resource.get('name', 'unknown')
                resource_url = resource.get('url', '')
                resource_format = resource.get('format', '').upper()

                if not resource_url:
                    continue

                # Prefer CSV files
                if 'CSV' in resource_format or resource_url.endswith('.csv'):
                    print(f"    Resource: {resource_name} ({resource_format})")
                    print(f"    URL: {resource_url}")

                    csv_response = safe_request(resource_url)
                    if csv_response and csv_response.text:
                        try:
                            # Try to parse as CSV
                            df = pd.read_csv(StringIO(csv_response.text))
                            print(f"    Loaded {len(df)} records, {len(df.columns)} columns")

                            # Add source info
                            df['_source'] = pkg_title
                            df['_source_url'] = resource_url
                            all_data.append(df)
                        except Exception as e:
                            print(f"    Failed to parse CSV: {e}")

        if all_data:
            # Combine all dataframes
            combined_df = pd.concat(all_data, ignore_index=True, sort=False)
            filename = OUTPUT_DIR / f"{filename_prefix}.csv"
            combined_df.to_csv(filename, index=False)
            print(f"\n✓ Saved {len(combined_df)} records to {filename.name}")
            return combined_df

    except Exception as e:
        print(f"Error processing CKAN response: {e}")

    return None

def fetch_cro_api():
    """
    Fetch CRO company data via API
    """
    print(f"\n{'='*60}")
    print(f"Fetching: CRO Company Changes")
    print(f"{'='*60}")

    url = "https://opendata.cro.ie/api/3/action/datastore_search?resource_id=563161e1-efc3-44a2-a353-1cf480dea3a0&limit=5000"
    response = safe_request(url)

    if not response:
        return None

    try:
        data = response.json()
        records = data.get('result', {}).get('records', [])

        if records:
            df = pd.DataFrame(records)
            filename = OUTPUT_DIR / "cro_company_changes.csv"
            df.to_csv(filename, index=False)
            print(f"✓ Saved {len(df)} records to {filename.name}")
            return df
        else:
            print("No records found in CRO API")
    except Exception as e:
        print(f"Error processing CRO response: {e}")

    return None

def fetch_benefacts_legacy():
    """
    Try to fetch from legacy Benefacts sources
    """
    print(f"\n{'='*60}")
    print(f"Fetching: Benefacts Legacy Data")
    print(f"{'='*60}")

    urls = [
        "https://benefactslegacy.com/data/",
        "https://benefactslegacy.ie/data/data-on-state-funding/",
        "https://bfphil.madeincontext.com/data-services/open-datasets/"
    ]

    for url in urls:
        print(f"\nTrying: {url}")
        response = safe_request(url)

        if response and response.status_code == 200:
            print(f"  Page loaded successfully ({len(response.text)} bytes)")

            # Try to find CSV links in the page
            import re
            csv_links = re.findall(r'href=["\']([^"\']*\.csv[^"\']*)["\']', response.text, re.IGNORECASE)

            if csv_links:
                print(f"  Found {len(csv_links)} CSV link(s)")
                for csv_link in csv_links[:3]:  # Try first 3
                    full_url = urljoin(url, csv_link)
                    print(f"    Downloading: {full_url}")
                    csv_response = safe_request(full_url)
                    if csv_response and csv_response.text:
                        try:
                            df = pd.read_csv(StringIO(csv_response.text))
                            filename = OUTPUT_DIR / f"benefacts_legacy_{csv_link.split('/')[-1]}"
                            df.to_csv(filename, index=False)
                            print(f"    ✓ Saved {len(df)} records")
                        except Exception as e:
                            print(f"    Failed to parse: {e}")
            else:
                print(f"  No CSV links found in page")
        else:
            print(f"  Page not accessible")

def fetch_direct_sources():
    """
    Try direct URLs and common patterns for specific datasets
    """
    print(f"\n{'='*60}")
    print(f"Fetching: Direct Data Sources")
    print(f"{'='*60}")

    sources = {
        "revenue_tax_exempt_charities": [
            "https://data.gov.ie/dataset/charities/resource/63bfced9-8f36-4b5c-be82-2b2e82f0f8ae",
            "https://data.gov.ie/dataset/charities",
        ],
        "primary_schools": [
            "https://data.gov.ie/dataset/?q=primary+schools",
            "https://data.gov.ie/api/3/action/package_search?q=primary+schools&rows=10",
        ],
        "post_primary_schools": [
            "https://data.gov.ie/api/3/action/package_search?q=post-primary+schools&rows=10",
        ],
        "ppn_networks": [
            "https://data.gov.ie/api/3/action/package_search?q=public+participation+networks&rows=10",
        ],
        "sport_ireland_funding": [
            "https://data.gov.ie/api/3/action/package_search?q=sport+ireland+funding&rows=10",
        ],
        "arts_council_funding": [
            "https://data.gov.ie/api/3/action/package_search?q=arts+council+funding&rows=10",
        ],
    }

    for source_name, urls in sources.items():
        print(f"\n{source_name}:")
        for url in urls:
            response = safe_request(url)
            if response:
                print(f"  ✓ {url} - OK")
            else:
                print(f"  ✗ {url} - FAILED")

def main():
    print("\n" + "="*60)
    print("IRISH NONPROFIT DATA SOURCES DOWNLOADER")
    print("="*60)
    print(f"Output directory: {OUTPUT_DIR}")

    # Fetch from data.gov.ie using CKAN API
    datasets = [
        ("revenue charities", "revenue_commissioners_tax_exempt"),
        ("primary schools", "education_primary_schools"),
        ("post-primary schools", "education_post_primary_schools"),
        ("public participation networks", "ppn_networks"),
        ("sport ireland funding", "sport_ireland_funding"),
        ("arts council funding", "arts_council_funding"),
    ]

    results = {}
    for query, prefix in datasets:
        results[prefix] = fetch_datagov_csv(query, prefix)
        time.sleep(1)  # Rate limiting

    # Fetch CRO data
    results['cro_changes'] = fetch_cro_api()

    # Try legacy Benefacts sources
    fetch_benefacts_legacy()

    # Try direct sources
    fetch_direct_sources()

    # Print summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")

    for name, df in results.items():
        if df is not None:
            print(f"✓ {name}: {len(df)} records, {len(df.columns)} columns")
        else:
            print(f"✗ {name}: Failed or no data")

    # List all files in output directory
    print(f"\n{'='*60}")
    print("Files saved to output directory:")
    print(f"{'='*60}")

    csv_files = list(OUTPUT_DIR.glob("*.csv"))
    for f in sorted(csv_files):
        size_mb = f.stat().st_size / (1024*1024)
        print(f"  {f.name:<50} {size_mb:>8.2f} MB")

    print(f"\nTotal files: {len(csv_files)}")

if __name__ == "__main__":
    main()
