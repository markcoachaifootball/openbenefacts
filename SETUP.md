# OpenBenefacts — Supabase Setup Guide

## 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click "New Project"
3. Name: `openbenefacts`
4. Region: `eu-west-1` (Ireland — closest to your users)
5. Generate a strong database password and save it

## 2. Run Schema Migration

1. In your Supabase dashboard, go to **SQL Editor**
2. Open `supabase/migrations/001_schema.sql`
3. Paste the entire file contents and click **Run**
4. You should see all tables created successfully

## 3. Get Your Keys

1. Go to **Settings → API** in your Supabase dashboard
2. Copy:
   - **Project URL** (e.g., `https://abc123.supabase.co`)
   - **anon/public key** (for the frontend)
   - **service_role key** (for the migration script — keep this secret!)

## 4. Run Data Migration

```bash
cd ~/Documents/openbenefacts
npm install @supabase/supabase-js

# Set environment variables
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_KEY=your-service-role-key

# Run migration
node supabase/migrate_data.js
```

This will:
- Insert all 14 funders with their programmes
- Insert all 26,906 organisations (cleaning corrupt values like the €250B charity)
- Insert financial records for orgs that have them

## 5. Configure Frontend

Create a `.env` file in the project root:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

## 6. Deploy

```bash
npx vite build
npx vercel --prod
```

Also set the env vars in Vercel:
1. Go to vercel.com → your project → Settings → Environment Variables
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

## 7. Verify

- Check Supabase Dashboard → Table Editor to see your data
- Visit your Vercel URL to confirm the frontend loads from Supabase
- Search for an org to test the API connection
