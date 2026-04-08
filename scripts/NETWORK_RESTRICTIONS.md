# Network Restriction Encountered

## Status
External HTTPS connections are blocked on this machine due to proxy allowlist restrictions.

**Error**: `HTTP/1.1 403 Forbidden - blocked-by-allowlist`

This affects attempts to access:
- data.gov.ie API endpoints
- opendata.cro.ie
- Benefacts legacy domains
- Any external HTTPS sources

## Environment Details
- HTTP Proxy: `http://localhost:3128` (Squid proxy with allowlist restrictions)
- Proxy Error: `blocked-by-allowlist`
- HTTPS_PROXY: `http://localhost:3128`
- HTTP_PROXY: `http://localhost:3128`

## What Would Be Downloaded

### 1. Revenue Commissioners - Tax Exempt Charities
- **API**: `https://data.gov.ie/api/3/action/package_search?q=revenue+charities`
- **Expected**: CSV list of tax-exempt charities registered with Revenue
- **Records**: ~11,000+ organizations
- **Fields**: Charity name, address, CHY number, date registered

### 2. Department of Education - Primary Schools
- **API**: `https://data.gov.ie/api/3/action/package_search?q=primary+schools`
- **Expected**: Enrollment numbers and school location data
- **Records**: ~3,200+ primary schools
- **Fields**: School name, address, enrollment, principal

### 3. Department of Education - Post-Primary Schools
- **API**: `https://data.gov.ie/api/3/action/package_search?q=post-primary+schools`
- **Expected**: Post-primary school enrollment and location data
- **Records**: ~700+ post-primary schools
- **Fields**: School name, address, enrollment, principal

### 4. Public Participation Networks (PPN)
- **API**: `https://data.gov.ie/api/3/action/package_search?q=public+participation+networks`
- **Expected**: Directory of PPN groups and networks
- **Records**: ~600+ organizations
- **Fields**: Group name, location, membership count

### 5. Sport Ireland Funding
- **API**: `https://data.gov.ie/api/3/action/package_search?q=sport+ireland+funding`
- **Expected**: Grant awards and funding programs
- **Records**: ~2,000+ funding records
- **Fields**: Organization, award amount, program, date

### 6. Arts Council Funding
- **API**: `https://data.gov.ie/api/3/action/package_search?q=arts+council+funding`
- **Expected**: Arts grants and program funding
- **Records**: ~5,000+ funding records
- **Fields**: Organization, award amount, art form, date

### 7. CRO Company Changes/Historical Data
- **API**: `https://opendata.cro.ie/api/3/action/datastore_search?resource_id=563161e1-efc3-44a2-a353-1cf480dea3a0`
- **Expected**: Company registration changes and updates
- **Records**: ~50,000+ change records
- **Fields**: Company name, change type, date, description

### 8. Benefacts Legacy Datasets
- **URLs Attempted**:
  - `https://benefactslegacy.com/data/`
  - `https://benefactslegacy.ie/data/data-on-state-funding/`
  - `https://bfphil.madeincontext.com/data-services/open-datasets/`
- **Expected**: Open nonprofit organization profiles
- **Records**: ~20,000+ organizations
- **Fields**: Organization name, address, activities, funding

## Script Location
- Main script: `/sessions/amazing-exciting-turing/mnt/Documents/openbenefacts/scripts/fetch-remaining-sources.py`
- Alternative: `/sessions/amazing-exciting-turing/mnt/Documents/openbenefacts/scripts/fetch-simple.py`

## How to Run from Machine with Internet Access

```bash
# Install dependencies
pip install requests pandas openpyxl

# Run the fetch script
cd /sessions/amazing-exciting-turing/mnt/Documents/openbenefacts
python scripts/fetch-remaining-sources.py
```

## Output Destination
All downloaded CSV files will be saved to:
```
/sessions/amazing-exciting-turing/mnt/Documents/openbenefacts/openbenefacts_data/
```

Expected files:
- `revenue_commissioners_tax_exempt.csv` - Revenue Commissioners charities
- `education_primary_schools.csv` - Primary school data
- `education_post_primary_schools.csv` - Post-primary school data
- `ppn_networks.csv` - Public Participation Networks
- `sport_ireland_funding.csv` - Sport Ireland grants
- `arts_council_funding.csv` - Arts Council funding
- `cro_company_changes.csv` - CRO company changes
- `benefacts_legacy_*.csv` - Benefacts legacy data (if available)

## Manual Alternative

To download these datasets manually:
1. Visit https://data.gov.ie
2. Search for each dataset name (e.g., "revenue charities")
3. Download the CSV resource
4. Save to `/sessions/amazing-exciting-turing/mnt/Documents/openbenefacts/openbenefacts_data/`

Alternatively, if running from a machine with unrestricted internet access, execute:
```bash
cd /sessions/amazing-exciting-turing/mnt/Documents/openbenefacts
python scripts/fetch-remaining-sources.py
```
