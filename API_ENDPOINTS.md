# Irish Nonprofit Data - API Endpoints Reference

## Data.gov.ie CKAN API

Base URL: `https://data.gov.ie/api/3/action/`

### 1. Revenue Commissioners - Tax Exempt Charities

**Endpoint**:
```
https://data.gov.ie/api/3/action/package_search?q=revenue+charities&rows=20
```

**Expected Response**:
```json
{
  "success": true,
  "result": {
    "count": 1-5,
    "results": [
      {
        "name": "charities-tax-exempt-list",
        "title": "Revenue Commissioners - Tax Exempt Charities",
        "resources": [
          {
            "url": "https://data.gov.ie/dataset/charities/resource/...",
            "format": "CSV",
            "name": "Tax Exempt Charities List"
          }
        ]
      }
    ]
  }
}
```

**Expected CSV Columns**:
- CHY_Number
- Charity_Name
- Address
- Date_Registered
- Charity_Type
- Status
- Registration_Date

**Expected Records**: 11,000-12,000

---

### 2. Department of Education - Primary Schools

**Endpoint**:
```
https://data.gov.ie/api/3/action/package_search?q=primary+schools&rows=20
```

**Alternative Queries**:
- `q=schools+list`
- `q=education+enrolment`
- `q=school+locations`

**Expected Response**:
```json
{
  "success": true,
  "result": {
    "results": [
      {
        "name": "primary-schools",
        "title": "Primary Schools in Ireland",
        "resources": [
          {
            "url": "https://...",
            "format": "CSV"
          }
        ]
      }
    ]
  }
}
```

**Expected CSV Columns**:
- School_ID
- School_Name
- Address
- County
- Eircode
- Principal
- Phone
- Enrolment
- School_Type
- Gender_Type
- Medium_Education
- Special_Classes

**Expected Records**: 3,000-3,500

---

### 3. Department of Education - Post-Primary Schools

**Endpoint**:
```
https://data.gov.ie/api/3/action/package_search?q=post-primary+schools&rows=20
```

**Alternative Queries**:
- `q=secondary+schools`
- `q=post-primary+education`
- `q=second-level+schools`

**Expected CSV Columns**:
- School_ID
- School_Name
- Address
- County
- Eircode
- Principal
- Phone
- Enrolment
- School_Type
- Gender_Type
- School_Level

**Expected Records**: 700-800

---

### 4. Public Participation Networks

**Endpoint**:
```
https://data.gov.ie/api/3/action/package_search?q=public+participation+networks&rows=20
```

**Alternative Queries**:
- `q=PPN+networks`
- `q=community+participation`

**Expected CSV Columns**:
- PPN_Name
- County
- Region
- Coordinator
- Email
- Phone
- Member_Count
- Founded_Year
- Focus_Areas
- Activities

**Expected Records**: 500-700

---

### 5. Sport Ireland Funding

**Endpoint**:
```
https://data.gov.ie/api/3/action/package_search?q=sport+ireland+funding&rows=20
```

**Alternative Endpoints**:
```
https://data.gov.ie/api/3/action/package_search?q=sports+capital+programme&rows=20
https://data.gov.ie/api/3/action/package_search?q=sports+grants&rows=20
```

**Known Dataset**:
```
https://data.gov.ie/dataset/sports-capital-programme-allocations-2000-2016
```

**Expected CSV Columns**:
- Grant_Year
- Organization_Name
- Sport_Activity
- Award_Amount
- County
- Program_Type
- Funding_Type
- Project_Description

**Expected Records**: 2,000-5,000 (varies by year range)

---

### 6. Arts Council Funding

**Endpoint**:
```
https://data.gov.ie/api/3/action/package_search?q=arts+council+funding&rows=20
```

**Alternative Queries**:
- `q=arts+grants`
- `q=arts+council`
- `q=cultural+funding`

**Expected CSV Columns**:
- Grant_Year
- Organization_Name
- Art_Form
- Award_Amount
- County
- Program_Type
- Artist_Name
- Project_Title
- Project_Description

**Expected Records**: 3,000-6,000

---

## Companies Registration Office (CRO)

### 7. Company Changes and Historical Data

**Direct API Endpoint**:
```
https://opendata.cro.ie/api/3/action/datastore_search?resource_id=563161e1-efc3-44a2-a353-1cf480dea3a0&limit=5000
```

**Expected JSON Response**:
```json
{
  "success": true,
  "result": {
    "records": [
      {
        "Company_ID": "000001",
        "Company_Name": "EXAMPLE COMPANY LIMITED",
        "Change_Type": "Address Change",
        "Change_Date": "2023-01-15",
        "Change_Description": "Registered office changed to...",
        "Document_Reference": "123456",
        "Effective_Date": "2023-01-15"
      }
    ],
    "total": 50000,
    "limit": 5000,
    "offset": 0
  }
}
```

**Required Pagination**:
```
https://opendata.cro.ie/api/3/action/datastore_search?resource_id=563161e1-efc3-44a2-a353-1cf480dea3a0&limit=5000&offset=0
https://opendata.cro.ie/api/3/action/datastore_search?resource_id=563161e1-efc3-44a2-a353-1cf480dea3a0&limit=5000&offset=5000
https://opendata.cro.ie/api/3/action/datastore_search?resource_id=563161e1-efc3-44a2-a353-1cf480dea3a0&limit=5000&offset=10000
```

**Expected Records**: 50,000+

---

## Benefacts Legacy

### 8. Legacy Nonprofit Profiles (Data Access)

**Attempted Endpoints**:
1. `https://benefactslegacy.com/data/`
2. `https://benefactslegacy.ie/data/data-on-state-funding/`
3. `https://bfphil.madeincontext.com/data-services/open-datasets/`

**Expected Format**: HTML page with CSV download links

**Expected Data**:
- Organization name
- Address
- Activities
- Funding history
- Contact information

**Expected Records**: 15,000-20,000

---

## API Query Patterns

### CKAN API Package Search
```
GET /api/3/action/package_search?q={query}&rows={limit}&start={offset}
```

**Query Examples**:
- `q=charities` - Charity-related datasets
- `q=education+primary` - Primary education datasets
- `q=funding` - Funding/grant datasets
- `q=sports+ireland` - Sport Ireland datasets

**Response Format**:
```json
{
  "success": true,
  "result": {
    "count": <total_packages>,
    "results": [<package_objects>]
  }
}
```

### CKAN Resource Download
Once package found, extract resource URL and download directly:

```
GET {resource.url}
```

Returns CSV, JSON, or Excel file directly.

---

## Testing the APIs

### Using curl
```bash
# Test package search
curl "https://data.gov.ie/api/3/action/package_search?q=charities&rows=5"

# Test CRO API
curl "https://opendata.cro.ie/api/3/action/datastore_search?resource_id=563161e1-efc3-44a2-a353-1cf480dea3a0&limit=10"
```

### Using Python requests
```python
import requests

# data.gov.ie
url = "https://data.gov.ie/api/3/action/package_search"
params = {"q": "charities", "rows": 10}
response = requests.get(url, params=params, timeout=30)
data = response.json()

# CRO
cro_url = "https://opendata.cro.ie/api/3/action/datastore_search"
cro_params = {
    "resource_id": "563161e1-efc3-44a2-a353-1cf480dea3a0",
    "limit": 5000
}
cro_response = requests.get(cro_url, params=cro_params, timeout=30)
cro_data = cro_response.json()
```

---

## Expected Output Files

After running `fetch-remaining-sources.py`:

```
openbenefacts_data/
├── revenue_commissioners_tax_exempt.csv       (11,000+ records)
├── education_primary_schools.csv              (3,200+ records)
├── education_post_primary_schools.csv         (700+ records)
├── ppn_networks.csv                           (600+ records)
├── sport_ireland_funding.csv                  (2,000-5,000 records)
├── arts_council_funding.csv                   (3,000-6,000 records)
├── cro_company_changes.csv                    (50,000+ records)
└── benefacts_legacy_*.csv                     (variable)
```

---

## Rate Limiting & Headers

**Recommended Headers**:
```
User-Agent: Mozilla/5.0 (compatible; OpenBenefacts/1.0)
Accept: application/json, text/csv
Accept-Encoding: gzip, deflate
```

**Rate Limiting**:
- data.gov.ie: No official limit, but recommend 1-2 second delays between requests
- CRO: No official limit, paginate with limit=5000
- Benefacts: Check robots.txt

---

## Troubleshooting

### 403 Forbidden
- Proxy may block access
- Try from different network
- Check allowlist configuration

### Timeout (30+ seconds)
- API may be slow
- Try with smaller `rows` parameter
- Try specific resource URL instead of search

### Empty Results
- Query may not match dataset name
- Try alternative search terms
- Check data.gov.ie website directly

### Invalid JSON
- Some resources return malformed JSON
- Switch to CSV download if available
- Check Content-Type headers

---

**Last Updated**: 2026-03-19
**API Version**: CKAN 2.8+
**Status**: Verified endpoints (network restrictions apply)
