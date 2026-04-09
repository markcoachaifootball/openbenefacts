# OpenBenefacts Data Sources Roadmap

## Currently Active (Automated)

| Source | Format | Frequency | Scraper |
|--------|--------|-----------|---------|
| Charities Regulator — Register | CSV | Monthly | `archive_charities_regulator.py` |
| Charities Regulator — Annual Returns | CSV (~60MB) | Monthly | `archive_charities_regulator.py` |
| Revenue Commissioners — CHY Register | CSV | Monthly | `archive_revenue_chy.py` |

## Currently Active (From openbenefacts-scrapers repo)

| Source | Format | Scraper |
|--------|--------|---------|
| HSE Section 38/39 Funding | CSV/JSON | `scrape_hse.py` |
| Arts Council Funding | CSV/JSON | `scrape_arts_council.py` |
| Sport Ireland Funding | CSV/JSON | `scrape_sport_ireland.py` |
| Pobal Funding | CSV/JSON | `scrape_pobal.py` |
| Tusla Section 56 Funding | CSV/JSON | `scrape_tusla.py` |

## Planned — Structured Data Available

| Source | URL | Format | Priority | Notes |
|--------|-----|--------|----------|-------|
| data.gov.ie Charities Register | https://data.gov.ie/dataset/register-of-charities-in-ireland | CSV | HIGH | CKAN API available |
| data.gov.ie Bulk Datasets | https://data.gov.ie/api/3/action/package_search | JSON API | HIGH | Search for charity/nonprofit datasets |
| CRO CORE Company Data | https://core.cro.ie | HTML | MEDIUM | No public API — web scrape needed |

## Planned — Requires Manual/PDF Processing

| Source | URL | Format | Priority | Notes |
|--------|-----|--------|----------|-------|
| Oireachtas — Accounts Laid | https://www.oireachtas.ie/en/publications/docs-laid/ | PDFs | MEDIUM | ~2,000 docs/year. Charter body financials. No API. |
| SIPO — Corporate Donors | https://www.sipo.ie/reports-and-publications/register-of-corporate-donors/ | PDFs | LOW | Political donation register. Individual PDFs. |
| National Lottery — Good Causes | https://www.lottery.ie/good-causes | HTML | LOW | Grant data on web pages, no bulk export. |
| Dept. of Education — Schools | https://www.gov.ie/en/service/43ddb5-post-primary-online-database-p-pod/ | Restricted | LOW | P-POD system, authenticated access only. |

## The Longitudinal Moat

Every month of archiving builds a dataset competitors cannot replicate. Key metrics:

- **Month 1**: Baseline snapshot of all 26,906 orgs + financial history
- **Month 6**: 6 months of change tracking — new registrations, deregistrations, financial filing patterns
- **Year 1**: Full annual cycle — seasonal patterns, annual return filing compliance rates
- **Year 3**: 3-year longitudinal dataset — trend analysis competitors would need 3 years to build

## Running the Archive

```bash
# One-time setup
pip install -r scrapers/requirements.txt

# Monthly archive (CSV only — no database writes)
python3 scrapers/archive_all.py

# Monthly archive + database update
SUPABASE_SERVICE_KEY=your_service_role_key python3 scrapers/archive_all.py

# Individual scrapers
python3 scrapers/archive_charities_regulator.py
python3 scrapers/archive_revenue_chy.py
```

## Archive Directory Structure

```
data/archive/
  charities_register_2026-04.csv
  charities_annual_returns_2026-04.csv
  charities_annual_returns_2026-04.json
  revenue_chy_register_2026-04.csv
  revenue_chy_register_2026-04.json
  archive_summary_2026-04.json
```
