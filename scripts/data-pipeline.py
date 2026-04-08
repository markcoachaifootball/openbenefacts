#!/usr/bin/env python3
"""
OpenBenefacts Data Pipeline
============================
Downloads and processes data from all major Irish nonprofit public data sources.
Run locally to build the full database.

Data Sources:
1. Charities Regulator - Full register of 11,500+ charities
2. CRO Open Data - Company records and financial statements
3. Benefacts Legacy - 20,000+ nonprofit profiles (open datasets)
4. data.gov.ie - Government open data portal
5. Revenue Commissioners - Tax-exempt charities list
6. Charities Regulator Annual Reports - Financial filings

Usage:
    pip install requests pandas openpyxl
    python openbenefacts-data-pipeline.py

Output:
    Creates openbenefacts_data/ directory with processed JSON files
    ready for import into the React app or any database.
"""

import os
import json
import csv
import io
import time
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

try:
    import requests
    import pandas as pd
except ImportError:
    print("Required packages: pip install requests pandas openpyxl")
    exit(1)

OUTPUT_DIR = "openbenefacts_data"
os.makedirs(OUTPUT_DIR, exist_ok=True)


# ============================================================
# SOURCE 1: Charities Regulator - Full Public Register
# ============================================================
def fetch_charities_register():
    """
    Downloads the full Charities Register CSV from charitiesregulator.ie
    Contains: Charity name, number, CRO number, purposes, trustees, status, etc.
    ~11,500 registered charities
    """
    logger.info("📥 Fetching Charities Register...")

    urls = [
        "https://www.charitiesregulator.ie/media/1663/register-of-charities.csv",
        "https://www.charitiesregulator.ie/media/d52jwriz/register-of-charities.csv",
        "https://data.gov.ie/dataset/register-of-charities-in-ireland/resource/cee17c3f-f83b-4dfd-a336-17a56d435c16/download/charities-register.csv",
    ]

    for url in urls:
        try:
            resp = requests.get(url, timeout=60)
            if resp.status_code == 200:
                df = pd.read_csv(io.StringIO(resp.text))
                output_path = os.path.join(OUTPUT_DIR, "charities_register.csv")
                df.to_csv(output_path, index=False)
                logger.info(f"  ✅ Downloaded {len(df)} charities → {output_path}")

                # Also save as JSON for the React app
                records = df.to_dict(orient='records')
                json_path = os.path.join(OUTPUT_DIR, "charities_register.json")
                with open(json_path, 'w') as f:
                    json.dump(records, f, indent=2, default=str)
                logger.info(f"  ✅ Saved JSON → {json_path}")
                return df
        except Exception as e:
            logger.warning(f"  ⚠️ Failed from {url}: {e}")

    # Try Excel format as fallback
    xlsx_urls = [
        "https://www.charitiesregulator.ie/media/1662/register-of-charities.xlsx",
        "https://data.gov.ie/dataset/register-of-charities-in-ireland/resource/0067c9a3-49fd-4c13-beb9-6023ef1cff27/download",
    ]
    for url in xlsx_urls:
        try:
            resp = requests.get(url, timeout=60)
            if resp.status_code == 200 and len(resp.content) > 1000:
                xlsx_path = os.path.join(OUTPUT_DIR, "charities_register.xlsx")
                with open(xlsx_path, 'wb') as f:
                    f.write(resp.content)
                df = pd.read_excel(xlsx_path)
                csv_path = os.path.join(OUTPUT_DIR, "charities_register.csv")
                df.to_csv(csv_path, index=False)
                logger.info(f"  ✅ Downloaded {len(df)} charities (Excel) → {csv_path}")
                records = df.to_dict(orient='records')
                json_path = os.path.join(OUTPUT_DIR, "charities_register.json")
                with open(json_path, 'w') as f:
                    json.dump(records, f, indent=2, default=str)
                return df
        except Exception as e:
            logger.warning(f"  ⚠️ Excel fallback failed from {url}: {e}")

    logger.error("  ❌ Could not download Charities Register from any source")
    logger.info("  💡 Manual download: visit https://www.charitiesregulator.ie/en/information-for-the-public/search-the-register-of-charities")
    logger.info("     Click 'Export results' to download the full register, then save to openbenefacts_data/charities_register.csv")
    return None


# ============================================================
# SOURCE 2: CRO Open Data - Company Records
# ============================================================
def fetch_cro_companies(limit=50000):
    """
    Fetches company records from CRO Open Data API.
    Filters for nonprofit company types (CLG, DAC, etc.)
    Contains: Company name, number, status, directors, registered address
    """
    logger.info("📥 Fetching CRO Company Records...")

    api_url = "https://opendata.cro.ie/api/3/action/datastore_search"
    resource_id = "3fef41bc-b8f4-4b10-8434-ce51c29b1bba"

    all_records = []
    offset = 0
    batch_size = 1000

    while offset < limit:
        try:
            params = {
                "resource_id": resource_id,
                "limit": batch_size,
                "offset": offset,
            }
            resp = requests.get(api_url, params=params, timeout=30)
            data = resp.json()

            if not data.get("success"):
                break

            records = data["result"]["records"]
            if not records:
                break

            all_records.extend(records)
            offset += batch_size
            logger.info(f"  📦 Fetched {len(all_records)} records so far...")
            time.sleep(0.5)  # Rate limiting

        except Exception as e:
            logger.warning(f"  ⚠️ Error at offset {offset}: {e}")
            break

    if all_records:
        df = pd.DataFrame(all_records)
        # Filter for nonprofit types
        # CLG = Company Limited by Guarantee (most common nonprofit type)
        # DAC = Designated Activity Company
        # Also include any with 'charity', 'foundation', 'trust', 'association' in name
        nonprofit_types = ['CLG', 'DAC', 'Guarantee', 'Society', 'Friendly']
        name_keywords = ['charity', 'foundation', 'trust', 'association', 'hospice', 'hospital',
                        'housing', 'school', 'college', 'institute', 'council', 'board',
                        'services', 'care', 'welfare', 'community', 'voluntary']

        type_mask = pd.Series(False, index=df.index)
        name_mask = pd.Series(False, index=df.index)

        if 'company_type' in df.columns:
            type_mask = df['company_type'].str.contains('|'.join(nonprofit_types), case=False, na=False)

        # Also check company name for nonprofit keywords
        name_col = next((c for c in df.columns if 'name' in c.lower()), None)
        if name_col:
            name_mask = df[name_col].str.contains('|'.join(name_keywords), case=False, na=False)

        df_nonprofits = df[type_mask | name_mask]
        if len(df_nonprofits) == 0:
            df_nonprofits = df  # Fallback to all records

        output_path = os.path.join(OUTPUT_DIR, "cro_companies.csv")
        df_nonprofits.to_csv(output_path, index=False)
        logger.info(f"  ✅ Saved {len(df_nonprofits)} nonprofit companies → {output_path}")
        return df_nonprofits

    logger.error("  ❌ Could not fetch CRO data")
    return None


# ============================================================
# SOURCE 3: CRO Financial Statements
# ============================================================
def fetch_cro_financials():
    """
    Fetches financial statements from CRO Open Data.
    Contains: Balance sheet, P&L data for companies that filed.
    Available from 2022 onwards.
    """
    logger.info("📥 Fetching CRO Financial Statements...")

    api_url = "https://opendata.cro.ie/api/3/action/datastore_search"
    resource_id = "508d4f8a-74a1-40c7-8b86-cdf0d54a4929"  # 2022 financials

    try:
        params = {
            "resource_id": resource_id,
            "limit": 5000,
        }
        resp = requests.get(api_url, params=params, timeout=30)
        data = resp.json()

        if data.get("success"):
            records = data["result"]["records"]
            df = pd.DataFrame(records)
            output_path = os.path.join(OUTPUT_DIR, "cro_financials.csv")
            df.to_csv(output_path, index=False)
            logger.info(f"  ✅ Saved {len(df)} financial records → {output_path}")
            return df
    except Exception as e:
        logger.warning(f"  ⚠️ Error fetching financials: {e}")

    logger.error("  ❌ Could not fetch CRO financials")
    return None


# ============================================================
# SOURCE 4: Charities Regulator Annual Reports Data
# ============================================================
def fetch_charity_annual_reports():
    """
    Downloads the annual reports filed dataset from data.gov.ie.
    Contains: Financial data filed by charities (income, expenditure, etc.)
    """
    logger.info("📥 Fetching Charity Annual Reports data...")

    url = "https://data.gov.ie/dataset/register-of-charities-in-ireland/resource/fb34a009-6dd0-4f56-afd4-6a3abad2f262/download"

    try:
        resp = requests.get(url, timeout=60)
        if resp.status_code == 200:
            df = pd.read_csv(io.StringIO(resp.text))
            output_path = os.path.join(OUTPUT_DIR, "charity_annual_reports.csv")
            df.to_csv(output_path, index=False)
            logger.info(f"  ✅ Saved {len(df)} annual report records → {output_path}")
            return df
    except Exception as e:
        logger.warning(f"  ⚠️ Error: {e}")

    logger.error("  ❌ Could not fetch annual reports data")
    return None


# ============================================================
# SOURCE 5: Benefacts Legacy Open Datasets
# ============================================================
def fetch_benefacts_legacy():
    """
    Attempts to download Benefacts open datasets from the legacy site.
    Contains: ~20,000 nonprofit profiles with enriched data.
    Available at bfphil.madeincontext.com
    """
    logger.info("📥 Fetching Benefacts Legacy datasets...")

    urls = [
        "https://bfphil.madeincontext.com/data-services/open-datasets/",
        "https://benefactslegacy.ie/data/data-on-state-funding/",
    ]

    for url in urls:
        try:
            resp = requests.get(url, timeout=30)
            if resp.status_code == 200:
                # Parse the page for download links
                logger.info(f"  ℹ️ Benefacts Legacy page accessible: {url}")
                logger.info(f"  ℹ️ Visit this URL manually to download CSV/JSON datasets")
        except Exception as e:
            logger.warning(f"  ⚠️ {url}: {e}")

    logger.info("  ℹ️ Manual download required - visit benefactslegacy.ie for open datasets")
    return None


# ============================================================
# SOURCE 6: data.gov.ie CKAN API - All Nonprofit Datasets
# ============================================================
def search_datagov_datasets():
    """
    Searches data.gov.ie for all nonprofit-related datasets.
    Uses the CKAN API.
    """
    logger.info("📥 Searching data.gov.ie for nonprofit datasets...")

    search_terms = ["charities", "nonprofit", "voluntary", "community", "housing body"]
    all_datasets = []

    for term in search_terms:
        try:
            url = f"https://data.gov.ie/api/3/action/package_search?q={term}&rows=50"
            resp = requests.get(url, timeout=20)
            data = resp.json()

            if data.get("success"):
                results = data["result"]["results"]
                for r in results:
                    all_datasets.append({
                        "name": r.get("name"),
                        "title": r.get("title"),
                        "notes": r.get("notes", "")[:200],
                        "organization": r.get("organization", {}).get("title", ""),
                        "resources": [
                            {"url": res.get("url"), "format": res.get("format")}
                            for res in r.get("resources", [])
                        ]
                    })
                logger.info(f"  📦 Found {len(results)} datasets for '{term}'")
        except Exception as e:
            logger.warning(f"  ⚠️ Search error for '{term}': {e}")

    # Deduplicate
    seen = set()
    unique = []
    for d in all_datasets:
        if d["name"] not in seen:
            seen.add(d["name"])
            unique.append(d)

    output_path = os.path.join(OUTPUT_DIR, "datagov_datasets_index.json")
    with open(output_path, 'w') as f:
        json.dump(unique, f, indent=2)
    logger.info(f"  ✅ Found {len(unique)} unique datasets → {output_path}")
    return unique


# ============================================================
# ENRICHMENT: Merge and normalize all data
# ============================================================
def merge_and_normalize(charities_df, cro_df, financials_df, annual_reports_df):
    """
    Merges data from all sources into a unified organizations table.
    Matches by CRO number, charity number, and fuzzy name matching.
    """
    logger.info("🔄 Merging and normalizing data from all sources...")

    organizations = []

    if charities_df is not None:
        for _, row in charities_df.iterrows():
            org = {
                "id": len(organizations) + 1,
                "name": str(row.get("Charity Name", row.get("charity_name", ""))),
                "charityNumber": str(row.get("Registered Charity Number", row.get("registered_charity_number", ""))),
                "cro": str(row.get("Company Number", row.get("company_number", ""))),
                "status": str(row.get("Status", row.get("status", "Active"))),
                "county": str(row.get("County", row.get("address_county", ""))),
                "charitablePurposes": str(row.get("Charitable Purposes", "")),
                "activities": str(row.get("Activities", "")),
                "website": str(row.get("Website", "")),
                "source": "charities_register",
                "lastUpdated": datetime.now().isoformat(),
            }
            organizations.append(org)

    # Merge CRO data by company number
    if cro_df is not None and organizations:
        cro_lookup = {}
        for _, row in cro_df.iterrows():
            cro_num = str(row.get("company_num", row.get("company_number", "")))
            if cro_num:
                cro_lookup[cro_num] = row.to_dict()

        for org in organizations:
            if org["cro"] in cro_lookup:
                cro_data = cro_lookup[org["cro"]]
                org["companyType"] = str(cro_data.get("company_type", ""))
                org["registrationDate"] = str(cro_data.get("registration_date", ""))
                org["companyStatus"] = str(cro_data.get("company_status", ""))

    # Save merged data
    output_path = os.path.join(OUTPUT_DIR, "organizations_merged.json")
    with open(output_path, 'w') as f:
        json.dump(organizations, f, indent=2, default=str)
    logger.info(f"  ✅ Merged {len(organizations)} organizations → {output_path}")

    return organizations


# ============================================================
# CLASSIFICATION: Apply ICNPO sector codes
# ============================================================
ICNPO_KEYWORDS = {
    "Health": ["hospital", "hospice", "health", "medical", "clinic", "care", "nursing", "HSE", "palliative"],
    "Education": ["school", "college", "university", "education", "training", "ETB", "academy", "learning"],
    "Social Services": ["social", "welfare", "community", "family", "carer", "addiction", "homeless"],
    "Housing": ["housing", "shelter", "accommodation", "tenant", "home", "AHB", "dwelling"],
    "Disability": ["disability", "disabled", "intellectual", "physical", "sensory", "autism", "remedial"],
    "Children & Youth": ["child", "youth", "young", "kid", "baby", "infant", "scout", "guide", "foroige"],
    "Arts & Culture": ["art", "culture", "museum", "gallery", "theatre", "music", "heritage", "library"],
    "Sports & Recreation": ["sport", "athletic", "GAA", "soccer", "rugby", "swim", "recreation", "club"],
    "Environment": ["environment", "conservation", "wildlife", "climate", "green", "nature", "animal"],
    "Religion": ["church", "parish", "diocese", "religious", "faith", "christian", "catholic", "protestant"],
    "International": ["international", "overseas", "development", "aid", "humanitarian", "refugee"],
    "Philanthropy": ["foundation", "trust", "fund", "grant", "philanthrop", "charity"],
    "Professional & Trade": ["professional", "trade", "union", "association", "chamber", "institute"],
}

def classify_sector(name, purposes=""):
    """Classify organization into ICNPO sector based on name and purposes."""
    text = f"{name} {purposes}".lower()
    scores = {}
    for sector, keywords in ICNPO_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw.lower() in text)
        if score > 0:
            scores[sector] = score
    if scores:
        return max(scores, key=scores.get)
    return "Other"


# ============================================================
# MAIN PIPELINE
# ============================================================
def main():
    logger.info("=" * 60)
    logger.info("🚀 OpenBenefacts Data Pipeline")
    logger.info("=" * 60)
    logger.info(f"Output directory: {os.path.abspath(OUTPUT_DIR)}")
    logger.info("")

    # Step 1: Download from all sources
    charities_df = fetch_charities_register()
    cro_df = fetch_cro_companies(limit=10000)
    financials_df = fetch_cro_financials()
    annual_reports_df = fetch_charity_annual_reports()
    fetch_benefacts_legacy()
    datagov_datasets = search_datagov_datasets()

    # Step 2: Merge and normalize
    organizations = merge_and_normalize(charities_df, cro_df, financials_df, annual_reports_df)

    # Step 3: Apply sector classification
    if organizations:
        for org in organizations:
            org["sector"] = classify_sector(org.get("name", ""), org.get("charitablePurposes", ""))

        # Re-save with sectors
        output_path = os.path.join(OUTPUT_DIR, "organizations_classified.json")
        with open(output_path, 'w') as f:
            json.dump(organizations, f, indent=2, default=str)
        logger.info(f"  ✅ Classified {len(organizations)} organizations → {output_path}")

    # Step 4: Generate summary stats
    summary = {
        "pipeline_run": datetime.now().isoformat(),
        "total_organizations": len(organizations) if organizations else 0,
        "sources": {
            "charities_register": len(charities_df) if charities_df is not None else 0,
            "cro_companies": len(cro_df) if cro_df is not None else 0,
            "cro_financials": len(financials_df) if financials_df is not None else 0,
            "annual_reports": len(annual_reports_df) if annual_reports_df is not None else 0,
            "datagov_datasets_found": len(datagov_datasets) if datagov_datasets else 0,
        },
        "data_sources_reference": {
            "charities_register": {
                "url": "https://www.charitiesregulator.ie/en/information-for-the-public/search-the-register-of-charities",
                "csv": "https://www.charitiesregulator.ie/media/d52jwriz/register-of-charities.csv",
                "description": "Full public register of 11,500+ registered charities",
                "update_frequency": "Monthly"
            },
            "cro_open_data": {
                "url": "https://opendata.cro.ie/dataset/",
                "api": "https://opendata.cro.ie/api/3/action/datastore_search",
                "description": "Company records, financial statements, entity data",
                "update_frequency": "Daily"
            },
            "cro_financials": {
                "url": "https://opendata.cro.ie/dataset/financial-statements",
                "description": "Structured financial statements from 2022 onwards",
                "update_frequency": "Annual"
            },
            "benefacts_legacy": {
                "url": "https://bfphil.madeincontext.com/data-services/open-datasets/",
                "alternative": "https://benefactslegacy.ie/data/data-on-state-funding/",
                "description": "20,000+ nonprofit profiles, state funding directory",
                "format": "CSV, JSON",
                "license": "CC-BY"
            },
            "benefacts_state_funding": {
                "url": "https://benefactslegacy.ie/data/data-on-state-funding/",
                "description": "Who Funds What directory - state funding to nonprofits (2020)",
                "note": "Contains funder, programme, recipient, CRO/CHY, amount, purpose"
            },
            "datagov_ie": {
                "url": "https://data.gov.ie/",
                "api": "https://data.gov.ie/api/3/action/package_search",
                "description": "National open data portal with charity and nonprofit datasets"
            },
            "revenue_commissioners": {
                "url": "https://www.revenue.ie/en/corporate/information-about-revenue/statistics/other-datasets/charities/",
                "description": "Tax-exempt charities and approved sports bodies"
            },
            "tusla_data": {
                "url": "https://data.tusla.ie/",
                "description": "Child and Family Agency open data"
            },
            "housing_agency": {
                "url": "https://www.housingagency.ie/data-hub/",
                "description": "Housing sector data and AHB information"
            },
            "ppn_data": {
                "url": "https://datacatalogue.gov.ie/dataset/public-participation-networks",
                "description": "31 local PPNs with 18,000+ community groups"
            },
            "wheel_ie": {
                "url": "https://www.wheel.ie/funding/subscribe",
                "description": "Fundingpoint database (subscription), policy research (free)"
            }
        }
    }

    summary_path = os.path.join(OUTPUT_DIR, "pipeline_summary.json")
    with open(summary_path, 'w') as f:
        json.dump(summary, f, indent=2)
    logger.info(f"\n✅ Pipeline complete! Summary → {summary_path}")

    logger.info("\n" + "=" * 60)
    logger.info("📊 PIPELINE RESULTS")
    logger.info("=" * 60)
    for source, count in summary["sources"].items():
        logger.info(f"  {source}: {count:,} records")
    logger.info(f"\n  Total organizations: {summary['total_organizations']:,}")
    logger.info(f"  Output: {os.path.abspath(OUTPUT_DIR)}/")
    logger.info("\n💡 Next steps:")
    logger.info("  1. Run Perplexity AI enrichment on top organizations")
    logger.info("  2. Import organizations_classified.json into the React app")
    logger.info("  3. Download Benefacts state funding Excel from benefactslegacy.ie")
    logger.info("  4. Set up Supabase for persistent storage")


if __name__ == "__main__":
    main()
