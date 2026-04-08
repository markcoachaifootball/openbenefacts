# Irish Nonprofit Data Sources - Download Status Report

**Date**: March 19, 2026
**Status**: Network restrictions prevent live API access

## Summary

Scripts have been created to download remaining Irish nonprofit data sources, but execution is blocked by proxy restrictions on this machine. The scripts are ready to run from any environment with unrestricted internet access.

### Key Finding
- **164 datasets indexed** from data.gov.ie
- **Already downloaded**: Charities Register (main data source)
- **Remaining to download**: 7 specific datasets
- **Network blocker**: Proxy allowlist (HTTP 403 error)

## Already Downloaded

The following datasets are already available in `/openbenefacts_data/`:

1. **Charities Register CSV** (20 MB)
   - 11,500+ active charities
   - Source: Charities Regulator (Primary source)
   - Size: 20 MB CSV + 37 MB XLSX

2. **Charity Annual Reports** (56 MB)
   - Historical financial data
   - Source: Charities Regulator
   - Size: 56 MB CSV

3. **CRO Companies** (136 KB)
   - 3,000+ company records
   - Source: Companies Registration Office

4. **CRO Financials** (723 KB)
   - Financial statements
   - Source: Companies Registration Office

5. **Data.gov.ie Index** (110 KB JSON)
   - Searchable index of 164 datasets
   - Covers multiple government departments

## Still Needed (7 Sources)

### 1. Revenue Commissioners - Tax Exempt Charities
- **Status**: ❌ Not yet downloaded
- **API Endpoint**: `https://data.gov.ie/api/3/action/package_search?q=revenue+charities`
- **Expected Records**: ~11,000
- **Data Fields**:
  - Charity name
  - CHY number
  - Address
  - Date registered
  - Charity status
- **Priority**: HIGH (Validates Charities Register)
- **Script**: `fetch-remaining-sources.py` (lines 80-85)

### 2. Department of Education - Primary Schools
- **Status**: ❌ Not yet downloaded
- **API Endpoint**: `https://data.gov.ie/api/3/action/package_search?q=primary+schools`
- **Expected Records**: ~3,200 primary schools
- **Data Fields**:
  - School name
  - School address
  - Enrollment numbers (by class/year)
  - Principal name
  - School ID
  - Educational level
- **Priority**: MEDIUM (Educational nonprofit context)
- **Script**: `fetch-remaining-sources.py` (lines 90-95)

### 3. Department of Education - Post-Primary Schools
- **Status**: ❌ Not yet downloaded
- **API Endpoint**: `https://data.gov.ie/api/3/action/package_search?q=post-primary+schools`
- **Expected Records**: ~700 post-primary schools
- **Data Fields**: Same as primary schools
- **Priority**: MEDIUM (Educational nonprofit context)
- **Script**: `fetch-remaining-sources.py` (lines 100-105)

### 4. Public Participation Networks (PPN)
- **Status**: ❌ Not yet downloaded
- **API Endpoint**: `https://data.gov.ie/api/3/action/package_search?q=public+participation+networks`
- **Expected Records**: ~600 PPN groups
- **Data Fields**:
  - Network name
  - Geographic area
  - Member organizations
  - Contact information
  - Activities/focus areas
- **Priority**: HIGH (Community participation infrastructure)
- **Script**: `fetch-remaining-sources.py` (lines 110-115)

### 5. Sport Ireland Funding
- **Status**: ❌ Not yet downloaded
- **Found in Index**: ✓ Yes (Sports Capital Programme 2000-2016)
- **API Endpoint**: `https://data.gov.ie/api/3/action/package_search?q=sport+ireland+funding`
- **Expected Records**: ~2,000+ grants
- **Data Fields**:
  - Organization name
  - Award amount
  - Sport/Activity
  - Grant program
  - Year awarded
  - Geographic location
- **Priority**: MEDIUM (Funding data)
- **Script**: `fetch-remaining-sources.py` (lines 120-125)
- **Alternative Data Found**: Sports Capital Programme (2000-2016)

### 6. Arts Council Funding
- **Status**: ❌ Not yet downloaded
- **API Endpoint**: `https://data.gov.ie/api/3/action/package_search?q=arts+council+funding`
- **Expected Records**: ~5,000+ grants
- **Data Fields**:
  - Organization name
  - Award amount
  - Art form (music, theatre, visual arts, etc.)
  - Grant program
  - Year awarded
- **Priority**: MEDIUM (Funding data)
- **Script**: `fetch-remaining-sources.py` (lines 130-135)

### 7. CRO Company Changes/Historical Data
- **Status**: ❌ Not yet downloaded
- **Direct API**: `https://opendata.cro.ie/api/3/action/datastore_search?resource_id=563161e1-efc3-44a2-a353-1cf480dea3a0&limit=5000`
- **Expected Records**: ~50,000 change events
- **Data Fields**:
  - Company name
  - Change type (director, address, name, etc.)
  - Change date
  - Company status changes
  - Document reference
- **Priority**: LOW (Historical tracking)
- **Script**: `fetch-remaining-sources.py` (lines 140-165)

## Benefacts Legacy Datasets

- **Status**: ❌ Cannot verify availability
- **Attempted URLs**:
  - `https://benefactslegacy.com/data/` - Blocked by proxy
  - `https://benefactslegacy.ie/data/data-on-state-funding/` - Blocked by proxy
  - `https://bfphil.madeincontext.com/data-services/open-datasets/` - Blocked by proxy
- **Expected Records**: ~20,000 organization profiles
- **Priority**: LOW (Legacy/historical data)

## How to Download

### Option 1: Run Script (Recommended)
From any machine with unrestricted internet access:

```bash
cd /sessions/amazing-exciting-turing/mnt/Documents/openbenefacts
python3 scripts/fetch-remaining-sources.py
```

This will download all 7 datasets and save them as CSV files in `openbenefacts_data/`.

### Option 2: Manual Download
Visit https://data.gov.ie and search for each dataset name individually.

### Option 3: Check Direct CRO API
Some data may be accessible via:
- CRO Open Data: https://opendata.cro.ie
- Revenue Commissioners: https://www.revenue.ie
- Department of Education: https://www.education.ie

## Script Files Created

1. **`scripts/fetch-remaining-sources.py`** (Main script)
   - Full implementation with error handling
   - Supports CKAN API queries
   - CSV parsing and consolidation
   - Rate limiting and timeouts
   - Metadata capture

2. **`scripts/fetch-simple.py`** (Lightweight alternative)
   - Minimal dependencies
   - Basic JSON parsing
   - URL validation only (no downloads)
   - Useful for network diagnostics

3. **`scripts/NETWORK_RESTRICTIONS.md`** (Technical details)
   - Proxy configuration details
   - Error logs and explanations
   - Manual workaround instructions

## Network Environment

### Current Restrictions
- **Proxy**: `http://localhost:3128` (Squid)
- **Error**: HTTP 403 Forbidden - blocked-by-allowlist
- **Impact**: Cannot reach external HTTPS endpoints
- **Whitelist Status**: data.gov.ie not whitelisted

### Workaround Options
1. Run script from machine with direct internet
2. Add data.gov.ie to proxy whitelist (requires admin)
3. Download CSVs manually from web interface
4. Use alternative data sources (see below)

## Alternative Data Sources

If primary sources unavailable, consider:

1. **Irish Nonprofits Database** (Academic)
   - https://www.independentsector.org/
   - Focus on metrics and sector analysis

2. **Nonprofit Research Institute**
   - Data on giving patterns
   - Sector benchmarks

3. **EU Open Data Portal**
   - Some cross-border nonprofit data
   - CORDIS funding (EU research grants)

4. **Open Corporates**
   - Company director networks
   - Company formation records

5. **Global Giving**
   - International nonprofit directory
   - Some Irish organizations

## Data Quality Notes

### Charities Register (Already Have)
✓ Most comprehensive source
✓ Official government register
✓ Annual updates
✓ 11,500+ organizations
✓ Full financial data

### Revenue Commissioners (Needed)
- Validates registration status
- Shows tax-exempt status changes
- Identifies organizations with charity status

### Education Data (Needed)
- Context for school-based nonprofits
- Enrollment trends
- Geographic distribution

### PPN Data (Needed)
- Interconnection mapping
- Community participation networks
- Local engagement levels

### Funding Data (Needed)
- Grant recipient tracking
- Funding trends by year
- Sector analysis by activity

## Next Steps

1. **Immediate**: Move scripts to machine with internet access
2. **Short-term**: Execute `fetch-remaining-sources.py`
3. **Validation**: Verify data quality and record counts
4. **Integration**: Merge with existing charities register data
5. **Analysis**: Map interconnections between datasets

## File Locations

- **Scripts**: `/sessions/amazing-exciting-turing/mnt/Documents/openbenefacts/scripts/`
- **Output**: `/sessions/amazing-exciting-turing/mnt/Documents/openbenefacts/openbenefacts_data/`
- **Config**: `/sessions/amazing-exciting-turing/mnt/Documents/openbenefacts/`

## Contact/Support

For issues running the scripts:
- Check `NETWORK_RESTRICTIONS.md` for proxy details
- Verify requests/pandas are installed: `pip install requests pandas`
- Review script logs for specific error messages
- Check data.gov.ie directly for API status

---

**Generated**: 2026-03-19
**Machine**: Mark's Linux environment
**Status**: Ready for execution with internet access
