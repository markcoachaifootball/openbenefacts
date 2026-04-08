# Data Download - Execution Guide

## Executive Summary

Scripts have been created to download the 7 remaining Irish nonprofit datasets. Due to proxy restrictions on Mark's machine, the scripts cannot execute on the local network, but are ready to run from any environment with internet access.

## Network Issue Encountered

**Problem**: Mark's machine is behind a corporate proxy (localhost:3128) with an allowlist that blocks access to data.gov.ie and external HTTPS endpoints.

**Error**: `HTTP/1.1 403 Forbidden - blocked-by-allowlist`

**Solution**: Execute the scripts from a different machine with unrestricted internet access, or add data.gov.ie to the proxy allowlist.

## What's Been Created

### 1. Main Download Script
**File**: `scripts/fetch-remaining-sources.py` (279 lines)

**Features**:
- ✓ CKAN API queries for all 7 datasets
- ✓ CSV parsing and consolidation
- ✓ Error handling and retries
- ✓ Rate limiting (1-second delays)
- ✓ Source metadata tracking
- ✓ Progress reporting

**Datasets Covered**:
1. Revenue Commissioners - Tax Exempt Charities
2. Department of Education - Primary Schools
3. Department of Education - Post-Primary Schools
4. Public Participation Networks (PPN)
5. Sport Ireland Funding
6. Arts Council Funding
7. CRO Company Changes/Historical Data
8. Benefacts Legacy (attempted)

### 2. Documentation Files

**DOWNLOAD_STATUS.md** (8.8 KB)
- Comprehensive status report
- Data source details
- Expected record counts
- Priority ratings
- Network environment info

**API_ENDPOINTS.md** (8.2 KB)
- Complete API reference
- Example requests/responses
- CSV column definitions
- Query patterns
- Testing examples

**NETWORK_RESTRICTIONS.md** (in scripts directory)
- Technical proxy details
- Error logs
- Manual workarounds

## How to Execute

### Option 1: Quick Start (Recommended)
```bash
# On a machine with unrestricted internet
cd /sessions/amazing-exciting-turing/mnt/Documents/openbenefacts

# Ensure dependencies are installed
pip install requests pandas openpyxl

# Run the download script
python3 scripts/fetch-remaining-sources.py
```

**Expected Duration**: 5-10 minutes
**Expected Output**: 8 CSV files (total ~100-150 MB)

### Option 2: Alternative Script (Lightweight)
```bash
python3 scripts/fetch-simple.py
```

**Features**: URL validation only (doesn't download)
**Use Case**: Network diagnostics, API testing

### Option 3: Manual Download
Visit https://data.gov.ie and search for:
1. "revenue charities"
2. "primary schools"
3. "post-primary schools"
4. "public participation networks"
5. "sport ireland funding"
6. "arts council funding"

Download CSV files and save to `openbenefacts_data/`

## Expected Results

After running the script:

```
openbenefacts_data/
├── charities_register.csv                      (EXISTING: 20 MB, 11,500 records)
├── charity_annual_reports.csv                  (EXISTING: 56 MB)
├── cro_companies.csv                           (EXISTING: 136 KB)
├── cro_financials.csv                          (EXISTING: 723 KB)
│
├── revenue_commissioners_tax_exempt.csv        (NEW: ~5 MB, 11,000 records)
├── education_primary_schools.csv               (NEW: ~2 MB, 3,200 records)
├── education_post_primary_schools.csv          (NEW: ~500 KB, 700 records)
├── ppn_networks.csv                            (NEW: ~300 KB, 600 records)
├── sport_ireland_funding.csv                   (NEW: ~3 MB, 2,000-5,000 records)
├── arts_council_funding.csv                    (NEW: ~4 MB, 3,000-6,000 records)
├── cro_company_changes.csv                     (NEW: ~15 MB, 50,000 records)
└── benefacts_legacy_*.csv                      (NEW if available)

Total New Data: ~40-50 MB
Total Records: ~80,000+
```

## Validation Checklist

After download, verify:
- [ ] All 7 CSV files created
- [ ] File sizes reasonable (no 0-byte files)
- [ ] CSV headers present
- [ ] Data records > 0
- [ ] No "ERROR" in output messages
- [ ] Summary statistics match expected ranges

```bash
# Quick validation script
cd openbenefacts_data
for file in *.csv; do
  lines=$(wc -l < "$file")
  size=$(du -h "$file" | cut -f1)
  echo "$file: $lines lines, $size"
done
```

## Data Quality Notes

### Revenue Commissioners Data
- May have duplicate entries
- Dates in various formats (standardize during integration)
- Some organizations may have ceased

### Education Data
- Include current enrollments
- Some schools may have closed/merged
- Verify school IDs match CRO if applicable

### PPN Data
- Membership counts may be outdated
- Geographic boundaries sometimes overlap
- Coordinate information may vary

### Funding Data
- Multiple years of awards
- Some organizations may appear multiple times
- Amounts in different currencies (normalize if needed)

### CRO Changes
- Large dataset (50,000+ records)
- May take longer to download
- Consider pagination if network unstable

## Integration Path

Once downloaded, suggested next steps:

1. **Data Cleaning**
   - Remove duplicates
   - Standardize address formats
   - Normalize organization names
   - Fix date formats

2. **Cross-Reference**
   - Match organizations across datasets
   - Verify CHY numbers
   - Link to CRO company records
   - Identify nonprofit networks

3. **Enrichment**
   - Add geocoding (latitude/longitude)
   - Calculate funding totals
   - Identify peer organizations
   - Flag merged/ceased entities

4. **Analysis**
   - Geographic distribution
   - Funding patterns
   - Network clustering
   - Trend analysis

## Files Reference

**Location**: `/sessions/amazing-exciting-turing/mnt/Documents/openbenefacts/`

### Scripts Directory
```
scripts/
├── fetch-remaining-sources.py  ← Main download script
├── fetch-simple.py             ← Lightweight alternative
├── data-pipeline.py            ← Existing pipeline
├── ai-enrichment.py            ← AI enrichment module
├── NETWORK_RESTRICTIONS.md     ← Proxy error details
└── supabase-setup.sql          ← Database setup
```

### Documentation
```
├── DOWNLOAD_STATUS.md          ← Status report (YOU ARE HERE)
├── API_ENDPOINTS.md            ← API reference
├── EXECUTION_GUIDE.md          ← This file
└── README.md                   ← Project overview
```

### Data Directory
```
openbenefacts_data/
├── [8+ CSV files after execution]
├── datagov_datasets_index.json ← Existing index
└── [processed JSON files]
```

## Troubleshooting

### Script hangs or times out
- Network may be slow
- Try `fetch-simple.py` instead
- Check individual API endpoints manually

### Empty CSV files created
- API may have returned no results
- Try alternative search terms (see API_ENDPOINTS.md)
- Check data.gov.ie website directly

### "Failed to parse CSV" error
- Some resources may be malformed
- Check resource format (may be JSON instead)
- Modify script to handle different formats

### Proxy/403 Error
- Network block detected
- Run from different machine
- Contact network administrator to whitelist data.gov.ie
- Use VPN if available

### Memory error with large files
- Reduce `rows` parameter in API calls
- Process in chunks
- Increase system RAM or swap

## Contact & Support

**Script Issues**:
- Check script error messages (printed to console)
- Review NETWORK_RESTRICTIONS.md
- Verify dependencies: `pip list | grep -E "requests|pandas"`

**Data Issues**:
- Check API status: https://data.gov.ie
- Verify dataset still available at source
- Review API_ENDPOINTS.md for correct URL format

**Integration Help**:
- See DOWNLOAD_STATUS.md for dataset details
- Review expected CSV columns in API_ENDPOINTS.md
- Check existing pipeline for integration patterns

---

## Quick Reference

| Dataset | Endpoint | Records | Priority |
|---------|----------|---------|----------|
| Revenue Tax Exempt | revenue charities | 11,000 | HIGH |
| Primary Schools | primary schools | 3,200 | MEDIUM |
| Post-Primary Schools | post-primary schools | 700 | MEDIUM |
| PPN Networks | public participation networks | 600 | HIGH |
| Sport Funding | sport ireland funding | 2,000-5,000 | MEDIUM |
| Arts Funding | arts council funding | 3,000-6,000 | MEDIUM |
| CRO Changes | opendata.cro.ie API | 50,000+ | LOW |

---

**Created**: March 19, 2026
**Status**: Ready for execution
**Environment**: Any machine with Python 3.6+ and internet access
**Next Step**: Copy scripts to internet-enabled machine and run
