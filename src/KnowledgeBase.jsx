import { useState, useMemo } from "react";
import { Search, BookOpen, Database, Shield, FileText, Users, Landmark, ChevronRight, ArrowLeft, ExternalLink, HelpCircle, Scale, Globe, Heart, Building2, CreditCard, Code, BarChart3, Layers } from "lucide-react";

// ===========================================================
// KNOWLEDGE BASE — OpenBenefacts Help & Learning Centre
// ===========================================================
// Modelled on OpenCorporates' knowledge base: search-first,
// category cards, expandable articles with deep Irish nonprofit
// context. Covers data sources, entity types, financials,
// governance, and how to use the platform.
// ===========================================================

const CATEGORIES = [
  {
    id: "getting-started",
    title: "Getting Started",
    description: "New to OpenBenefacts? Start here to understand what we do and how to use the platform.",
    icon: BookOpen,
    colour: "emerald",
  },
  {
    id: "data-sources",
    title: "Data Sources",
    description: "Where our data comes from — the regulators, registries, and public datasets we aggregate.",
    icon: Database,
    colour: "blue",
  },
  {
    id: "entity-types",
    title: "Entity Types",
    description: "The different kinds of organisations in Ireland — charities, AHBs, schools, companies, and more.",
    icon: Building2,
    colour: "violet",
  },
  {
    id: "financials",
    title: "Financial Data",
    description: "Understanding nonprofit accounts, annual returns, and how we present financial information.",
    icon: BarChart3,
    colour: "amber",
  },
  {
    id: "governance",
    title: "Governance & Directors",
    description: "Board composition, trustee data, and how governance information is collected and displayed.",
    icon: Users,
    colour: "rose",
  },
  {
    id: "funding",
    title: "Government Funding",
    description: "How we track €14 billion in public funding flows from departments, agencies, and local authorities.",
    icon: Landmark,
    colour: "teal",
  },
  {
    id: "using-platform",
    title: "Using the Platform",
    description: "Search tips, filters, watchlists, exports, and getting the most out of OpenBenefacts.",
    icon: Layers,
    colour: "indigo",
  },
  {
    id: "api-developers",
    title: "API & Developers",
    description: "Accessing OpenBenefacts data programmatically — endpoints, authentication, and rate limits.",
    icon: Code,
    colour: "gray",
  },
];

const ARTICLES = [
  // ── Getting Started ──
  {
    id: "what-is-openbenefacts",
    category: "getting-started",
    title: "What is OpenBenefacts?",
    summary: "An overview of Ireland's nonprofit transparency platform and what data is available.",
    content: `OpenBenefacts is an independent, free-to-search database of over 39,000 Irish nonprofit organisations. We aggregate publicly available data from government regulators and registries into a single, searchable platform.

Our goal is to make Ireland's nonprofit sector as transparent and accessible as the for-profit sector already is through the Companies Registration Office. We believe that organisations receiving public funding or charitable donations should be easy to look up, understand, and compare.

**What you'll find on OpenBenefacts:**
• Registered charities, approved housing bodies, schools, sports clubs, and other nonprofits
• Financial records including income, expenditure, assets, and liabilities
• Board and trustee information from the Charities Register
• Government funding flows — who funds whom, and how much
• Company details from the CRO for incorporated organisations
• Cross-references between regulators so you can see the full picture

**What we don't do:**
We don't rate or rank organisations. We present factual, publicly available data and let users draw their own conclusions. We're not a regulator — we aggregate what regulators already publish.`,
  },
  {
    id: "who-is-it-for",
    category: "getting-started",
    title: "Who is OpenBenefacts for?",
    summary: "Journalists, researchers, donors, policymakers, and the nonprofits themselves.",
    content: `OpenBenefacts serves anyone interested in understanding Ireland's nonprofit sector:

**Journalists & investigators** use our Follow the Money tools and funding flow visualisations to trace public spending through the nonprofit system. The Emergency Accommodation Tracker, for example, names individual providers and contract values.

**Researchers & academics** use our structured data and API to study sector trends, governance patterns, and funding concentrations without manually scraping dozens of regulator websites.

**Donors & philanthropists** can look up any organisation to see its financial health, governance structure, and regulatory standing before making funding decisions.

**Policymakers** can use our aggregate data to understand sector-wide patterns — how many organisations operate in each county, which sectors are growing, and where public funding is concentrated.

**Nonprofits themselves** can check their own listing, compare themselves to sector benchmarks, and understand how they appear to external stakeholders. Our "Claim your listing" feature lets organisations add context to their profile.`,
  },
  {
    id: "how-often-updated",
    category: "getting-started",
    title: "How often is the data updated?",
    summary: "Our data pipelines run regularly, but different sources update at different intervals.",
    content: `Different data sources have different update cycles:

**Charities Regulator** — We pull the full public register roughly weekly. New registrations, de-registrations, and updated annual returns appear within a few days of publication.

**Companies Registration Office (CRO)** — Company details (registered address, company status, directors) are refreshed via the CRO Open Data API. New filings appear as the CRO processes them, typically within a few business days.

**Government funding data** — Funding flows from departments and agencies are updated when new datasets are published on data.gov.ie, gov.ie, or individual agency websites. This varies — some publish quarterly, others annually.

**Emergency Accommodation Tracker** — Contract data from eTenders and other procurement sources is refreshed regularly and cross-referenced against CRO and charity records.

**Financial statements** — Annual accounts data depends on when organisations file. Irish charities must file within 10 months of their financial year-end. We process new filings as they appear on the Charities Regulator's website.

If you notice data that appears out of date, you can email corrections@openbenefacts.com and we'll investigate.`,
  },
  {
    id: "benefacts-replacement",
    category: "getting-started",
    title: "Is OpenBenefacts related to Benefacts?",
    summary: "We're an independent project — not affiliated with the original Benefacts organisation.",
    content: `No. OpenBenefacts is an entirely independent project. We are not affiliated with, endorsed by, or connected to the original Benefacts organisation (formerly known as Irish Nonprofits Knowledge Exchange / INKEx), which ceased operations.

The original Benefacts built a valuable database of Irish nonprofits over many years, largely through manual data collection and government partnerships. When it closed, a significant gap was left in Ireland's nonprofit transparency infrastructure.

OpenBenefacts was created to fill that gap using a different approach: we build on freely available public data from government registries and regulators, use automated data pipelines, and make everything free to search. Our data model, technology stack, and governance are entirely separate from the original Benefacts.

We chose the name "OpenBenefacts" because the concept of tracking who benefits from public and charitable spending remains important — and because we believe this data should be open to everyone.`,
  },

  // ── Data Sources ──
  {
    id: "charities-regulator",
    category: "data-sources",
    title: "Charities Regulator",
    summary: "Ireland's charity regulator — the primary source for registered charity data, annual returns, and trustee information.",
    content: `The Charities Regulatory Authority (CRA) maintains the Register of Charities, which every charity operating in Ireland must join. This is our richest data source.

**What we get from the CRA:**
• Organisation name, registered address, and charity number (CHY and CRA numbers)
• Charitable purposes and activities descriptions
• Trustee (board member) names and appointment dates
• Annual return data including income, expenditure, and employee counts
• Filing compliance status
• CRO number for incorporated charities

**How we access it:**
The CRA publishes the full register as a downloadable dataset, and individual charity pages are publicly accessible on charitiesregulator.ie. We run automated pipelines to keep our copy in sync.

**Limitations:**
Not all Irish nonprofits are on the Charities Register. Organisations that don't meet the legal definition of a "charity" (e.g. many sports clubs, trade associations, and mutual societies) aren't required to register. Also, some registered charities are slow to file, so the most recent financial data may be 1-2 years old.`,
  },
  {
    id: "cro-data",
    category: "data-sources",
    title: "Companies Registration Office (CRO)",
    summary: "The CRO holds company incorporation data, director filings, and annual returns for all Irish companies.",
    content: `The Companies Registration Office (CRO) is the statutory authority for registering companies in Ireland. Many nonprofits are incorporated as Companies Limited by Guarantee (CLG) or Designated Activity Companies (DAC), so the CRO holds important data about them.

**What we get from the CRO:**
• Company name, number, and registered office address
• Company type (CLG, DAC, PLC, etc.) and status (Active, Dissolved, etc.)
• Date of incorporation
• Director and secretary names (from annual returns)
• Annual return filing dates and compliance status

**How we access it:**
We use the CRO Open Data API (opendata.cro.ie), which provides free, machine-readable access to basic company information through CKAN's DataStore API. No authentication is required.

**Limitations:**
The free API provides company summary data. Full annual accounts and detailed document filings require paid access through the CRO's CORE system (€2.50+ per document). Director details from annual returns are available in summary form but full lists may require document access for some companies.`,
  },
  {
    id: "government-spending",
    category: "data-sources",
    title: "Government Spending Data",
    summary: "Departmental appropriation accounts, voted expenditure, and agency-level grant data from across government.",
    content: `Ireland's government publishes detailed spending data through several channels. We aggregate these into our "Follow the Money" funding flow visualisations.

**Sources include:**
• Appropriation Accounts published by the C&AG (Comptroller & Auditor General)
• Departmental annual reports and voted expenditure breakdowns
• HSE financial statements and Section 38/39 funding lists
• DEASP (Social Protection) community and voluntary sector grants
• Department of Housing grants to Approved Housing Bodies
• Tusla funding allocations
• Sport Ireland, Arts Council, and other agency grants
• Local authority budgets and spending returns

**How we access it:**
Most of this data is published on gov.ie, data.gov.ie, or individual agency websites as PDFs, spreadsheets, or structured data files. We scrape, parse, and normalise these into a consistent format, then match recipients against our organisations database.

**Limitations:**
Government spending transparency in Ireland is inconsistent. Some agencies publish line-by-line grant data; others only publish sector totals. The Comptroller & Auditor General has repeatedly called for better public spending transparency.`,
  },
  {
    id: "etenders-procurement",
    category: "data-sources",
    title: "eTenders & Public Procurement",
    summary: "Contract award data from Ireland's public procurement system.",
    content: `eTenders (etenders.gov.ie) is Ireland's national tendering platform. When government bodies award contracts — including to nonprofits and private companies — the details are published on eTenders and, for larger contracts, on the EU's Tenders Electronic Daily (TED) system.

**What we get:**
• Contract titles and descriptions
• Awarding authority (which government body)
• Winning supplier/contractor name
• Contract value (where published)
• Award date and contract duration

**How we use it:**
Our Emergency Accommodation Tracker, for example, uses procurement data to identify which hotels, B&Bs, and housing providers receive government contracts for emergency accommodation. We cross-reference supplier names against CRO and charity records to build entity profiles.

**Limitations:**
Not all contract values are published. Framework agreements (multi-year maximum values) can appear misleadingly large — we flag these separately. Sub-threshold procurement (under €25,000 for services) is not required to go through eTenders, so many smaller grants are invisible in this data.`,
  },

  // ── Entity Types ──
  {
    id: "registered-charities",
    category: "entity-types",
    title: "Registered Charities",
    summary: "Organisations on the Charities Regulator's register — the most data-rich entities in our database.",
    content: `A registered charity is an organisation that has been entered onto the Register of Charities maintained by the Charities Regulatory Authority (CRA). Under the Charities Act 2009, all charities operating in Ireland must register.

**How to identify them:**
Registered charities have a CRA registration number (e.g. 20012345) and usually a CHY number (the Revenue Commissioners' charity tax reference). On OpenBenefacts, they show the "Registered charity" badge.

**What data is available:**
These are typically our most data-rich profiles because charities must file annual returns with the CRA including financial summaries, activity reports, and trustee lists. Many are also incorporated at the CRO, giving us company data too.

**Filing obligations:**
Charities must file an annual return within 10 months of their financial year-end. Returns include income and expenditure figures, employee counts, and confirmation of trustee details. Failure to file can result in de-registration.

**Examples:** ISPCC, SVP (Society of St. Vincent de Paul), Barnardos, Concern Worldwide, Trócaire.`,
  },
  {
    id: "approved-housing-bodies",
    category: "entity-types",
    title: "Approved Housing Bodies (AHBs)",
    summary: "Housing associations and cooperatives that provide social and affordable housing.",
    content: `Approved Housing Bodies (AHBs) are independent, not-for-profit organisations that provide social and affordable housing in Ireland. They're approved and regulated by the Approved Housing Bodies Regulatory Authority (AHBRA), established in 2022.

**How they're funded:**
AHBs receive capital funding from the Department of Housing and local authorities to build or acquire housing. They also receive availability payments and leasing income. The largest AHBs manage thousands of housing units and have annual turnovers in the hundreds of millions.

**Regulatory framework:**
AHBs must file financial statements and governance returns with AHBRA. Those that are also registered charities file with the CRA too. Many are incorporated as CLGs at the CRO.

**On OpenBenefacts:**
We cross-reference AHB data from AHBRA's register, the Charities Register, and the CRO to build comprehensive profiles. Financial data comes from charity annual returns and, where available, AHBRA filings.

**Major AHBs:** Respond, Tuath, Clúid, Oaklee, Peter McVerry Trust, Focus Ireland, Circle.`,
  },
  {
    id: "schools",
    category: "entity-types",
    title: "Schools",
    summary: "Primary, secondary, and community schools — largely funded by the Department of Education.",
    content: `Ireland has approximately 4,000 primary and post-primary schools, the vast majority of which receive state funding through the Department of Education. While not "nonprofits" in the traditional sense, they're non-commercial entities spending public money and are included in our database.

**Types of schools:**
• National (primary) schools — typically under a patron (religious order, ETB, or Educate Together)
• Secondary schools — voluntary secondary, community, comprehensive, or ETB-run
• Gaelscoileanna and Gaelcholáistí — Irish-medium schools
• Community and comprehensive schools

**Financial data:**
Individual school-level financial data is limited in public sources. The Department of Education publishes aggregate data and per-pupil funding rates. Some schools that are also registered charities file financial returns with the CRA.

**On OpenBenefacts:**
Schools are identified through Department of Education roll numbers, ETB records, and patron body databases. Where a school is also a registered charity or company, we link those records together.`,
  },
  {
    id: "sports-clubs",
    category: "entity-types",
    title: "Sports Clubs",
    summary: "GAA clubs, soccer clubs, rugby clubs, and other sporting organisations.",
    content: `Ireland has thousands of sports clubs, from GAA clubs in every parish to soccer, rugby, athletics, and other sporting organisations. Many receive public funding through Sport Ireland, local authorities, or the Dormant Accounts Fund.

**Regulatory status:**
Most sports clubs are unincorporated associations — they don't have a separate legal personality. Some larger clubs are incorporated as CLGs at the CRO, and a smaller number are registered charities. Their governance is typically managed through their National Governing Body (NGB) — the GAA, FAI, IRFU, etc.

**Financial transparency:**
Sports club finances are generally less transparent than charities or AHBs. Accounts are typically presented at the club AGM rather than filed with a public regulator. Clubs that are registered charities file returns with the CRA.

**On OpenBenefacts:**
We identify sports clubs through sector classifications, NGB membership data, and name pattern matching. Financial data is available where the club is also a registered charity.`,
  },

  // ── Financials ──
  {
    id: "understanding-finances",
    category: "financials",
    title: "Understanding Nonprofit Finances",
    summary: "How to read the income, expenditure, assets, and liabilities figures on organisation profiles.",
    content: `Nonprofit financial reporting in Ireland follows the Statement of Recommended Practice (SORP) for charities, though not all organisations use it consistently. Here's what the key figures mean:

**Income** — Total money received in the financial year. For charities, this is broken into: donations and legacies, charitable activities income, other trading income, and investment income. For government-funded bodies, most income comes from grants and service agreements.

**Expenditure** — Total money spent. Split into: charitable activities (programme delivery), raising funds (fundraising costs), and governance costs (audit, compliance, board). The ratio of charitable spending to total spending is a common (if imperfect) measure of efficiency.

**Assets** — What the organisation owns at year-end. Fixed assets (property, equipment) plus current assets (cash, debtors). For AHBs, fixed assets include housing stock worth hundreds of millions.

**Liabilities** — What the organisation owes. Creditors, loans, and provisions. Net assets (assets minus liabilities) show the organisation's overall financial position.

**Employees** — Full-time-equivalent headcount. A useful indicator of organisational scale.

**Comparisons:** Our sector benchmarking tool lets you compare an organisation's financials against the median for its sector and size band. A charity with 95% of income going to charitable activities is typical; one spending 60% on fundraising might warrant questions.`,
  },
  {
    id: "financial-years",
    category: "financials",
    title: "Financial Year-Ends and Filing Delays",
    summary: "Why some organisations show older data — and what filing compliance tells you.",
    content: `Irish charities can choose any date as their financial year-end, though 31 December and 31 March are the most common. Annual returns are due within 10 months of the year-end, but many organisations file late.

**What this means in practice:**
An organisation with a December 2024 year-end has until October 2025 to file its annual return. The Charities Regulator then processes the filing, which may take additional weeks. So the most recent data available for any charity could be 12-22 months old, even when fully compliant.

**Filing compliance:**
On OpenBenefacts, we show the most recent financial data available and the filing date. If an organisation hasn't filed recently, this is flagged. Poor filing compliance can indicate governance problems — or simply that a small organisation with volunteer trustees is struggling with administrative requirements.

**Multiple years:**
Where available, we show financial data across multiple years so you can see trends. Is income growing or declining? Are reserves being depleted? Multi-year data tells a much richer story than a single snapshot.`,
  },
  {
    id: "framework-agreements",
    category: "financials",
    title: "Framework Agreement Values",
    summary: "Why some contract values appear very large — and what framework ceilings actually mean.",
    content: `In our Emergency Accommodation Tracker and procurement data, you'll sometimes see contract values of €100 million, €200 million, or more. These are typically framework agreement ceilings, not actual spending.

**What is a framework agreement?**
A framework agreement sets the terms under which a government body can purchase services over a period (usually 2-4 years) up to a maximum value. The actual spend may be a fraction of the framework ceiling. For example, a €100M framework for emergency accommodation means the government can spend up to €100M through that contract — but actual payments might total €15M.

**How we handle this:**
On OpenBenefacts, we flag values over €100M as likely framework ceilings using amber highlighting and a warning label. This prevents readers from mistakenly thinking an individual provider received hundreds of millions of euros.

**Why it matters:**
Without this context, procurement data can be deeply misleading. A small hotel with a €200M framework value hasn't received €200M — it's on a panel that collectively might be used up to that amount. Always check the "actual spend" figures where available.`,
  },

  // ── Governance ──
  {
    id: "trustee-data",
    category: "governance",
    title: "Trustee & Director Data",
    summary: "Where board member information comes from and what it tells you.",
    content: `Board member data on OpenBenefacts comes from two primary sources:

**1. Charities Register (trustees):**
Registered charities must list their trustees (board members) in their annual return to the CRA. This includes names, appointment dates, and roles. We import this data and display it on organisation profiles.

**2. Companies Registration Office (directors):**
Incorporated organisations (CLGs, DACs) must file annual returns with the CRO listing their directors and secretary. For companies that are also charities, there should be significant overlap between the CRA trustee list and CRO director list.

**What we show:**
• Current trustees/directors with appointment dates
• Historical board members (where resignation dates are available)
• Cross-directorships — other organisations where the same person serves on the board

**Cross-directorships matter because:**
They reveal networks of governance relationships. A person sitting on multiple charity boards isn't inherently problematic, but patterns of overlapping governance can indicate: shared interests between organisations, governance capacity constraints in the sector, or potential conflicts of interest that merit disclosure.

**Limitations:**
Board member matching across organisations uses name matching, which isn't perfect. Common names may produce false positives. We're working on better entity resolution.`,
  },
  {
    id: "director-pay",
    category: "governance",
    title: "Director & Executive Compensation",
    summary: "What public data exists on nonprofit executive pay in Ireland.",
    content: `Executive pay in the Irish nonprofit sector is a frequent public interest topic, particularly for organisations receiving significant state funding. Here's what data is available:

**Charities SORP disclosure:**
Under the Statement of Recommended Practice, charities should disclose the number of employees earning over €60,000, broken into salary bands (€60K-€70K, €70K-€80K, etc.). This doesn't name individuals but shows the overall pay profile.

**HSE Section 38/39 bodies:**
Organisations funded under HSE Section 38 (where staff are public servants) and Section 39 (grant-funded) have different pay transparency requirements. Section 38 bodies follow public sector pay scales. Section 39 bodies' pay is less visible, though the HSE has sought compliance with public sector norms.

**What's not easily available:**
Individual named executive salaries are rarely in public filings. Annual reports may disclose CEO pay, but this varies. Companies filing abridged accounts at the CRO can lawfully omit director remuneration.

**On OpenBenefacts:**
We display salary band data where available from charity annual returns. We're exploring ways to extract pay data from published annual reports and financial statement PDFs as a future enhancement.`,
  },

  // ── Funding ──
  {
    id: "follow-the-money",
    category: "funding",
    title: "Follow the Money — How It Works",
    summary: "How we trace government funding from departments to frontline organisations.",
    content: `Our "Follow the Money" feature visualises how public funding flows from government departments and agencies through to the nonprofits that deliver services.

**The data chain:**
1. **Departments** publish annual expenditure in Appropriation Accounts and annual reports
2. **Agencies** (HSE, Tusla, Pobal, etc.) distribute funding to organisations under various programmes
3. **Organisations** receive grants, service agreements, and contracts
4. We match recipient names against our database of 39,000+ organisations

**What you can see:**
• Which government bodies fund which organisations (and vice versa)
• How much each funder distributes and to whom
• Funding concentration — are a few organisations receiving most of the money?
• Year-over-year funding trends

**Funding flow visualisations:**
For each major funder, we build Sankey-style flow diagrams showing money moving from the funder through to recipients. These make it easy to spot patterns: which organisations receive the most, how funding is distributed across sectors, and where public money ends up.

**Limitations:**
Our funding data is only as complete as what government bodies publish. Many smaller grants aren't in structured data sources. We continuously add new sources and improve matching accuracy.`,
  },
  {
    id: "emergency-accommodation",
    category: "funding",
    title: "Emergency Accommodation Tracker",
    summary: "How we track which hotels, B&Bs, and providers receive government contracts for emergency housing.",
    content: `The Emergency Accommodation Tracker is one of our most detailed investigative tools. It names individual providers — hotels, B&Bs, housing charities, and private companies — that receive government contracts to provide emergency accommodation.

**Why it matters:**
Ireland spends hundreds of millions of euros annually on emergency accommodation for homeless individuals and families and for international protection applicants. Until now, it was very difficult to see which specific providers were receiving this money.

**How we build it:**
1. Procurement data from eTenders and TED identifies contract awards for accommodation services
2. We cross-reference provider names against the CRO (company data) and Charities Register
3. We enrich profiles with director names, registered addresses, and company status
4. Where available, we show both framework agreement ceilings and actual contract values

**What you can see:**
• Provider name, type (hotel, charity, private company), and location
• Contract values and awarding authority
• Directors/trustees and their other board positions
• Company status and CRO filing compliance

**Privacy and accuracy:**
We only use publicly available data. Provider names come from published procurement records. Director information comes from CRO or CRA filings. If any data appears incorrect, providers can contact us at corrections@openbenefacts.com.`,
  },

  // ── Using the Platform ──
  {
    id: "search-tips",
    category: "using-platform",
    title: "Search Tips",
    summary: "How to find exactly the organisation, funder, or data point you're looking for.",
    content: `OpenBenefacts search covers 39,000+ organisation names, alternative names, and CRO numbers. Here are tips for getting the best results:

**Basic search:**
Type any part of an organisation's name. Search is fuzzy — it handles misspellings and partial matches. "SVP" will find "Society of St. Vincent de Paul". "Peter McVerry" will find "Peter McVerry Trust".

**Filtering results:**
After searching, use the sector filter to narrow results to specific sectors (Health, Education, Housing, etc.) or the county filter for geographic searches.

**CRO number search:**
If you know a company's CRO number, enter it directly in the search bar. This gives you the exact match.

**Charity number search:**
Similarly, entering a CHY number (e.g. "CHY5073") or CRA number will find the specific charity.

**Finding funders:**
Use the Funders page to search government departments and agencies by name. Each funder page shows their grant recipients and funding flows.

**Advanced use:**
For bulk data access or complex queries, use our API (see the API documentation). The API supports filtering by sector, county, entity type, and more.`,
  },
  {
    id: "watchlists",
    category: "using-platform",
    title: "Watchlists & Monitoring",
    summary: "Track organisations you're interested in and get notified of changes.",
    content: `The Watchlist feature lets you save organisations for quick access and monitoring.

**Adding to your watchlist:**
Click the bookmark icon on any organisation profile to add it to your watchlist. You can access your watchlist from the Dashboard.

**What's monitored:**
When an organisation on your watchlist files new data — a financial return, a CRO filing, or a new procurement contract — the update appears in your Dashboard feed.

**Use cases:**
• Journalists monitoring organisations for a developing story
• Funders tracking their grantees' compliance and financial health
• Researchers watching a cohort of organisations over time
• Nonprofit staff keeping an eye on peer organisations

**Limits:**
Free accounts can watch up to 5 organisations. Professional and institutional plans support unlimited watchlists with export capabilities.`,
  },
  {
    id: "data-exports",
    category: "using-platform",
    title: "Data Exports & Downloads",
    summary: "How to download data from OpenBenefacts for your own analysis.",
    content: `OpenBenefacts supports data exports for users who need to work with the data offline.

**CSV exports:**
On the Funders page and various data tables, look for the download/export button to get data as CSV files compatible with Excel, Google Sheets, or any data analysis tool.

**API access:**
For programmatic access, our REST API provides JSON-formatted data for organisations, financial records, and funding flows. See the API documentation for endpoints and authentication details.

**What you can export:**
• Organisation lists with key identifiers (charity numbers, CRO numbers)
• Financial summaries across multiple years
• Funder-recipient grant data
• Director and trustee lists

**Licensing:**
Data on OpenBenefacts is derived from public government sources. Our aggregated dataset is available under Creative Commons Attribution 4.0 (CC BY 4.0). Please credit "OpenBenefacts" when republishing. See our Terms of Use for full details.`,
  },

  // ── API & Developers ──
  {
    id: "api-overview",
    category: "api-developers",
    title: "API Overview",
    summary: "REST API endpoints for accessing OpenBenefacts data programmatically.",
    content: `The OpenBenefacts API provides free, programmatic access to our database of Irish nonprofit organisations.

**Base URL:** https://www.openbenefacts.ie/api/v1/

**Authentication:**
Basic search and read operations are available without authentication. Write operations and higher rate limits require an API key, available with Professional and Institutional plans.

**Key endpoints:**
• GET /organisations — List and search organisations with filtering
• GET /organisations/:id — Full profile for a single organisation
• GET /funders — List government funders
• GET /funders/:id/grants — Grants made by a specific funder
• GET /stats — Aggregate statistics

**Response format:**
All endpoints return JSON. Lists are paginated with standard offset/limit parameters.

**Rate limits:**
• Unauthenticated: 100 requests per hour
• Professional: 1,000 requests per hour
• Institutional: 10,000 requests per hour

**Example request:**
\`\`\`
GET /api/v1/organisations?q=peter+mcverry&limit=5
\`\`\`

For full API documentation including request/response schemas, see the API page.`,
  },
  {
    id: "data-licensing",
    category: "api-developers",
    title: "Data Licensing & Attribution",
    summary: "How you can use OpenBenefacts data and what attribution is required.",
    content: `OpenBenefacts aggregates publicly available data from Irish government registries and regulators. Our aggregated, cleaned, and cross-referenced dataset is made available under the following terms:

**Creative Commons Attribution 4.0 (CC BY 4.0):**
You are free to share and adapt the data for any purpose, including commercial use, provided you give appropriate credit to OpenBenefacts and indicate if changes were made.

**Attribution format:**
"Data from OpenBenefacts (openbenefacts.ie), sourced from Irish government public records."

**Underlying sources:**
The raw data we aggregate is published by Irish government bodies under various open data licences (typically the Irish Government's Open Data Licence or Creative Commons). Our value-add is in the aggregation, cleaning, cross-referencing, and entity resolution.

**What you can do:**
• Use the data in research papers, journalism, and reports
• Build applications and visualisations on top of the API
• Integrate with other datasets
• Use commercially with attribution

**What we ask:**
Please credit OpenBenefacts. If you're building something significant on our data, we'd love to hear about it — contact mark@openbenefacts.com.`,
  },
];

// Colour utility
const colourClasses = {
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", icon: "text-emerald-600", hover: "hover:border-emerald-300 hover:shadow-md" },
  blue: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", icon: "text-blue-600", hover: "hover:border-blue-300 hover:shadow-md" },
  violet: { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", icon: "text-violet-600", hover: "hover:border-violet-300 hover:shadow-md" },
  amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", icon: "text-amber-600", hover: "hover:border-amber-300 hover:shadow-md" },
  rose: { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", icon: "text-rose-600", hover: "hover:border-rose-300 hover:shadow-md" },
  teal: { bg: "bg-teal-50", border: "border-teal-200", text: "text-teal-700", icon: "text-teal-600", hover: "hover:border-teal-300 hover:shadow-md" },
  indigo: { bg: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700", icon: "text-indigo-600", hover: "hover:border-indigo-300 hover:shadow-md" },
  gray: { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-700", icon: "text-gray-600", hover: "hover:border-gray-300 hover:shadow-md" },
};

export default function KnowledgeBasePage({ setPage }) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState(null);
  const [activeArticle, setActiveArticle] = useState(null);

  // Filter articles by search
  const filteredArticles = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return ARTICLES;
    return ARTICLES.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        a.content.toLowerCase().includes(q)
    );
  }, [search]);

  // Articles for active category
  const categoryArticles = useMemo(() => {
    if (!activeCategory) return [];
    return filteredArticles.filter((a) => a.category === activeCategory);
  }, [activeCategory, filteredArticles]);

  // Search results mode
  const isSearching = search.trim().length > 0;

  // Find article by ID
  const currentArticle = activeArticle
    ? ARTICLES.find((a) => a.id === activeArticle)
    : null;

  const currentCategory = activeCategory
    ? CATEGORIES.find((c) => c.id === activeCategory)
    : null;

  // ── Article view ──
  if (currentArticle) {
    const cat = CATEGORIES.find((c) => c.id === currentArticle.category);
    const cc = colourClasses[cat?.colour || "gray"];
    const siblings = ARTICLES.filter(
      (a) => a.category === currentArticle.category && a.id !== currentArticle.id
    );

    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-8">
          <button
            onClick={() => { setActiveArticle(null); setActiveCategory(null); }}
            className="hover:text-gray-700"
          >
            Knowledge Base
          </button>
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          <button
            onClick={() => { setActiveArticle(null); setActiveCategory(currentArticle.category); }}
            className="hover:text-gray-700"
          >
            {cat?.title}
          </button>
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="text-gray-900 font-medium">{currentArticle.title}</span>
        </div>

        {/* Article */}
        <article>
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${cc.bg} ${cc.text} mb-4`}>
            {cat && <cat.icon className="w-3.5 h-3.5" />}
            {cat?.title}
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3 tracking-tight">
            {currentArticle.title}
          </h1>
          <p className="text-lg text-gray-500 mb-8">{currentArticle.summary}</p>

          <div className="prose prose-gray max-w-none">
            {currentArticle.content.split("\n\n").map((para, i) => {
              // Handle bold headers like **Header:**
              if (para.startsWith("**") && para.includes(":**")) {
                const parts = para.split("\n");
                return (
                  <div key={i} className="mb-4">
                    {parts.map((line, j) => {
                      if (line.startsWith("**")) {
                        const cleaned = line.replace(/\*\*/g, "");
                        return (
                          <h3 key={j} className="text-base font-bold text-gray-900 mt-6 mb-2">
                            {cleaned}
                          </h3>
                        );
                      }
                      if (line.startsWith("•")) {
                        return (
                          <li key={j} className="text-gray-600 ml-4 list-disc list-inside">
                            {line.slice(2)}
                          </li>
                        );
                      }
                      return (
                        <p key={j} className="text-gray-600 leading-relaxed">
                          {line}
                        </p>
                      );
                    })}
                  </div>
                );
              }
              // Handle bullet lists
              if (para.startsWith("•")) {
                return (
                  <ul key={i} className="mb-4 space-y-1">
                    {para.split("\n").map((line, j) => (
                      <li key={j} className="text-gray-600 ml-4 list-disc list-inside">
                        {line.replace(/^•\s*/, "")}
                      </li>
                    ))}
                  </ul>
                );
              }
              // Handle code blocks
              if (para.startsWith("```")) {
                const code = para.replace(/```\w*\n?/g, "").trim();
                return (
                  <pre key={i} className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm font-mono text-gray-700 overflow-x-auto mb-4">
                    {code}
                  </pre>
                );
              }
              // Bold text inline
              const rendered = para.split(/(\*\*[^*]+\*\*)/).map((part, j) => {
                if (part.startsWith("**") && part.endsWith("**")) {
                  return <strong key={j} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>;
                }
                return part;
              });
              return (
                <p key={i} className="text-gray-600 leading-relaxed mb-4">
                  {rendered}
                </p>
              );
            })}
          </div>
        </article>

        {/* Related articles */}
        {siblings.length > 0 && (
          <div className="mt-12 pt-8 border-t border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              More in {cat?.title}
            </h3>
            <div className="grid gap-3">
              {siblings.map((a) => (
                <button
                  key={a.id}
                  onClick={() => { setActiveArticle(a.id); window.scrollTo(0, 0); }}
                  className="text-left p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all group"
                >
                  <h4 className="font-semibold text-gray-900 group-hover:text-emerald-700 transition-colors">
                    {a.title}
                  </h4>
                  <p className="text-sm text-gray-500 mt-1">{a.summary}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8">
          <button
            onClick={() => { setActiveArticle(null); setActiveCategory(null); }}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to Knowledge Base
          </button>
        </div>
      </div>
    );
  }

  // ── Category view ──
  if (activeCategory && currentCategory && !isSearching) {
    const cc = colourClasses[currentCategory.colour || "gray"];
    const Icon = currentCategory.icon;

    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-8">
          <button onClick={() => setActiveCategory(null)} className="hover:text-gray-700">
            Knowledge Base
          </button>
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="text-gray-900 font-medium">{currentCategory.title}</span>
        </div>

        <div className="flex items-center gap-3 mb-2">
          <div className={`w-10 h-10 rounded-xl ${cc.bg} flex items-center justify-center`}>
            <Icon className={`w-5 h-5 ${cc.icon}`} />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
            {currentCategory.title}
          </h1>
        </div>
        <p className="text-gray-500 mb-8 ml-[52px]">{currentCategory.description}</p>

        <div className="grid gap-3">
          {categoryArticles.map((a) => (
            <button
              key={a.id}
              onClick={() => { setActiveArticle(a.id); window.scrollTo(0, 0); }}
              className="text-left p-5 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all group flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 group-hover:text-emerald-700 transition-colors">
                  {a.title}
                </h3>
                <p className="text-sm text-gray-500 mt-1">{a.summary}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-emerald-500 flex-shrink-0 mt-1 transition-colors" aria-hidden="true" />
            </button>
          ))}
        </div>

        <div className="mt-8">
          <button
            onClick={() => setActiveCategory(null)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to Knowledge Base
          </button>
        </div>
      </div>
    );
  }

  // ── Main KB landing ──
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold mb-4">
          <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
          Knowledge Base
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight mb-3">
          Learn about Irish nonprofits
        </h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto">
          Understand our data sources, entity types, financial reporting, and how to get the most from OpenBenefacts.
        </p>
      </div>

      {/* Search */}
      <div className="max-w-2xl mx-auto mb-12">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the knowledge base..."
            className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent shadow-sm"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Search results */}
      {isSearching ? (
        <div>
          <p className="text-sm text-gray-500 mb-4">
            {filteredArticles.length} result{filteredArticles.length !== 1 ? "s" : ""} for "{search}"
          </p>
          {filteredArticles.length === 0 ? (
            <div className="text-center py-12">
              <HelpCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" aria-hidden="true" />
              <p className="text-gray-500">No articles match your search. Try different keywords.</p>
              <p className="text-sm text-gray-400 mt-2">
                Can't find what you need? Email{" "}
                <a href="mailto:mark@openbenefacts.com" className="text-emerald-600 hover:underline">
                  mark@openbenefacts.com
                </a>
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredArticles.map((a) => {
                const cat = CATEGORIES.find((c) => c.id === a.category);
                const cc = colourClasses[cat?.colour || "gray"];
                return (
                  <button
                    key={a.id}
                    onClick={() => { setActiveArticle(a.id); setActiveCategory(a.category); window.scrollTo(0, 0); }}
                    className="text-left p-5 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cc.bg} ${cc.text}`}>
                        {cat?.title}
                      </span>
                    </div>
                    <h3 className="font-semibold text-gray-900 group-hover:text-emerald-700 transition-colors">
                      {a.title}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">{a.summary}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Category cards */
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {CATEGORIES.map((cat) => {
            const cc = colourClasses[cat.colour];
            const Icon = cat.icon;
            const count = ARTICLES.filter((a) => a.category === cat.id).length;

            return (
              <button
                key={cat.id}
                onClick={() => { setActiveCategory(cat.id); window.scrollTo(0, 0); }}
                className={`text-left p-6 rounded-xl border ${cc.border} ${cc.hover} transition-all group bg-white`}
              >
                <div className={`w-10 h-10 rounded-xl ${cc.bg} flex items-center justify-center mb-4`}>
                  <Icon className={`w-5 h-5 ${cc.icon}`} />
                </div>
                <h3 className="font-bold text-gray-900 mb-1 group-hover:text-emerald-700 transition-colors">
                  {cat.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed mb-3">
                  {cat.description}
                </p>
                <span className="text-xs font-medium text-gray-400">
                  {count} article{count !== 1 ? "s" : ""}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Bottom CTA */}
      {!isSearching && (
        <div className="mt-16 text-center bg-gray-50 rounded-2xl p-8 border border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Can't find what you're looking for?</h2>
          <p className="text-gray-500 mb-4">
            We're continuously adding new articles. If you have a question about Irish nonprofits or our data, get in touch.
          </p>
          <a
            href="mailto:mark@openbenefacts.com"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1B3A4B] text-white rounded-lg font-medium hover:bg-[#0f2b3a] transition-colors"
          >
            Contact us
          </a>
        </div>
      )}
    </div>
  );
}
