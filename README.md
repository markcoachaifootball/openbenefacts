# OpenBenefacts

**Modern transparency platform for Ireland's nonprofit sector** — a replacement for the now-closed Benefacts.ie.

Explore 19,000+ organizations, track government funding, and access AI-powered insights.

## Quick Start

```bash
npm install
npm run dev
# Open http://localhost:3000
```

## Deploy

```bash
npm run build
npx vercel --prod
```

## Data Pipeline

```bash
# Download real data from public sources
pip install requests pandas openpyxl
npm run data:fetch

# Enrich with AI (requires API keys)
export PERPLEXITY_API_KEY=your-key
export OPENAI_API_KEY=your-key
npm run data:enrich
```

## Database (Supabase)

1. Create project at [supabase.com](https://supabase.com)
2. Run `scripts/supabase-setup.sql` in SQL Editor
3. Set environment variables:
   ```
   VITE_SUPABASE_URL=your-url
   VITE_SUPABASE_ANON_KEY=your-key
   ```

## Project Structure

```
openbenefacts/
├── src/
│   ├── App.jsx          # Full React application
│   ├── main.jsx         # Entry point
│   └── index.css        # Tailwind styles
├── scripts/
│   ├── data-pipeline.py    # Downloads from 10+ public data sources
│   ├── ai-enrichment.py    # Perplexity + GPT enrichment
│   ├── supabase-setup.sql  # Full database schema
│   └── deploy.sh           # One-command deploy
├── package.json
├── vite.config.js
└── index.html
```

## Data Sources

| Source | Records | Type |
|--------|---------|------|
| Charities Regulator | 11,500+ | Register |
| CRO Open Data | 700,000+ | Companies |
| Benefacts Legacy | 20,000+ | Profiles |
| Benefacts State Funding | 22,000+ | Grants |
| data.gov.ie | Various | Open Data |
| Revenue Commissioners | 11,000+ | Tax Status |

## License

Built by Mark McGrory — mark@staydiasports.com
