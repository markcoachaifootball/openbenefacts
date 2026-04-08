#!/usr/bin/env python3
"""
OpenBenefacts AI Enrichment Pipeline
======================================
Enriches organization data using Perplexity Deep Research and GPT-4.

For each organization, generates:
- AI summary (2-3 sentence overview)
- One-liner description
- Risk score (0-100)
- Transparency rating (0-100)
- Key insights
- State funding percentage

Usage:
    pip install requests openai supabase
    export PERPLEXITY_API_KEY=your-key
    export OPENAI_API_KEY=your-key
    export SUPABASE_URL=your-url
    export SUPABASE_KEY=your-key
    python ai-enrichment.py [--limit 30] [--model deep-research|sonar-pro]
"""

import os
import sys
import json
import time
import logging
import argparse
from datetime import datetime

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

try:
    import requests
except ImportError:
    print("pip install requests openai supabase")
    sys.exit(1)

# ============================================================
# CONFIG
# ============================================================
PERPLEXITY_KEY = os.getenv("PERPLEXITY_API_KEY")
OPENAI_KEY = os.getenv("OPENAI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

PERPLEXITY_MODELS = {
    "deep-research": "sonar-deep-research",   # ~$0.70/query, best quality
    "sonar-pro": "sonar-reasoning-pro",        # ~$0.07/query, good quality
    "sonar": "sonar",                          # ~$0.01/query, basic
}

# ============================================================
# PERPLEXITY: Web research on organizations
# ============================================================
def perplexity_research(org_name, org_data, model="sonar-pro"):
    """
    Uses Perplexity to research an organization from web sources.
    Returns structured data about the org.
    """
    if not PERPLEXITY_KEY:
        logger.warning("No PERPLEXITY_API_KEY set, skipping Perplexity enrichment")
        return None

    model_id = PERPLEXITY_MODELS.get(model, model)

    prompt = f"""Research the Irish nonprofit organization "{org_name}".

Provide a structured analysis covering:
1. SUMMARY: A concise 2-3 sentence overview of what this organization does, who it serves, and its significance in Ireland.
2. ONE_LINER: A single sentence (under 100 chars) describing the org.
3. KEY_FACTS: List 3-5 key facts about the organization.
4. GOVERNANCE: Any notable governance information (board, leadership, controversies).
5. FINANCIAL_HEALTH: Assessment of financial stability based on available information.
6. STATE_FUNDING: What percentage of their income comes from government sources? Which departments fund them?
7. RISK_FACTORS: Any concerns about this organization (financial, governance, operational).

Context: This is for a nonprofit transparency platform (similar to the now-closed Benefacts.ie).
{f'Additional data: Sector: {org_data.get("sector", "")}, County: {org_data.get("county", "")}, Charity Number: {org_data.get("charity_number", "")}' if org_data else ''}

Respond in JSON format:
{{
  "summary": "...",
  "one_liner": "...",
  "key_facts": ["...", "..."],
  "governance_notes": "...",
  "financial_health": "...",
  "state_funding_estimate_pct": 0,
  "risk_factors": ["...", "..."],
  "sources": ["url1", "url2"]
}}"""

    try:
        resp = requests.post(
            "https://api.perplexity.ai/chat/completions",
            headers={
                "Authorization": f"Bearer {PERPLEXITY_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": model_id,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
            },
            timeout=120
        )

        if resp.status_code == 200:
            content = resp.json()["choices"][0]["message"]["content"]
            # Try to parse JSON from response
            try:
                # Handle markdown code blocks
                if "```json" in content:
                    content = content.split("```json")[1].split("```")[0]
                elif "```" in content:
                    content = content.split("```")[1].split("```")[0]
                return json.loads(content)
            except json.JSONDecodeError:
                return {"summary": content, "raw": True}
        else:
            logger.error(f"Perplexity API error {resp.status_code}: {resp.text[:200]}")
            return None

    except Exception as e:
        logger.error(f"Perplexity request failed: {e}")
        return None


# ============================================================
# GPT: Derived analytics and scoring
# ============================================================
def gpt_analyze(org_name, org_data, perplexity_data):
    """
    Uses GPT-4 to generate derived analytics from combined data.
    Produces risk score, transparency rating, and structured insights.
    """
    if not OPENAI_KEY:
        logger.warning("No OPENAI_API_KEY set, skipping GPT analysis")
        return None

    context = json.dumps({
        "org_name": org_name,
        "org_data": org_data or {},
        "web_research": perplexity_data or {},
    }, indent=2, default=str)

    prompt = f"""You are an analyst for an Irish nonprofit transparency platform. Based on the following data about "{org_name}", produce a structured analysis.

DATA:
{context}

Produce a JSON response with:
{{
  "risk_score": <0-100, where 0=no risk, 100=highest risk>,
  "transparency_rating": <0-100, based on data availability and disclosure quality>,
  "financial_health_score": <0-100>,
  "governance_score": <0-100>,
  "state_funding_pct": <estimated percentage of income from government>,
  "ai_summary": "<2-3 sentence summary suitable for a public profile page>",
  "ai_one_liner": "<single sentence under 100 chars>",
  "key_insights": [
    {{"type": "positive|negative|neutral", "text": "insight text"}},
  ],
  "sector_classification": "<ICNPO sector>",
  "comparable_organizations": ["org1", "org2"]
}}

Be factual and evidence-based. If data is insufficient, note the uncertainty."""

    try:
        resp = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.2,
                "response_format": {"type": "json_object"}
            },
            timeout=60
        )

        if resp.status_code == 200:
            content = resp.json()["choices"][0]["message"]["content"]
            return json.loads(content)
        else:
            logger.error(f"OpenAI API error {resp.status_code}: {resp.text[:200]}")
            return None

    except Exception as e:
        logger.error(f"GPT request failed: {e}")
        return None


# ============================================================
# SUPABASE: Save enriched data
# ============================================================
def save_to_supabase(org_id, analysis):
    """Saves AI enrichment results to Supabase."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.info("No Supabase credentials, saving to local file instead")
        return False

    try:
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/ai_intelligence",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates"
            },
            json={
                "organization_id": org_id,
                "ai_summary": analysis.get("ai_summary", ""),
                "ai_one_liner": analysis.get("ai_one_liner", ""),
                "risk_score": analysis.get("risk_score"),
                "transparency_rating": analysis.get("transparency_rating"),
                "state_funding_pct": analysis.get("state_funding_pct"),
                "key_insights": analysis.get("key_insights", []),
                "model_used": "perplexity+gpt-4o-mini",
                "sources": analysis.get("sources", []),
            },
            timeout=10
        )
        return resp.status_code in (200, 201)
    except Exception as e:
        logger.error(f"Supabase save failed: {e}")
        return False


# ============================================================
# MAIN ENRICHMENT PIPELINE
# ============================================================
def main():
    parser = argparse.ArgumentParser(description="OpenBenefacts AI Enrichment Pipeline")
    parser.add_argument("--limit", type=int, default=30, help="Max organizations to enrich")
    parser.add_argument("--model", default="sonar-pro", choices=PERPLEXITY_MODELS.keys(), help="Perplexity model to use")
    parser.add_argument("--input", default="openbenefacts_data/organizations_classified.json", help="Input organizations JSON")
    parser.add_argument("--output", default="openbenefacts_data/organizations_enriched.json", help="Output enriched JSON")
    parser.add_argument("--skip-perplexity", action="store_true", help="Skip Perplexity, use GPT only")
    args = parser.parse_args()

    logger.info("=" * 60)
    logger.info("🧠 OpenBenefacts AI Enrichment Pipeline")
    logger.info(f"   Model: {args.model} | Limit: {args.limit}")
    logger.info("=" * 60)

    # Load organizations
    if os.path.exists(args.input):
        with open(args.input) as f:
            organizations = json.load(f)
        logger.info(f"📂 Loaded {len(organizations)} organizations from {args.input}")
    else:
        logger.error(f"Input file not found: {args.input}")
        logger.info("Run the data pipeline first: python data-pipeline.py")
        return

    # Sort by income (descending) to prioritize top organizations
    organizations.sort(key=lambda o: o.get("income", 0), reverse=True)
    orgs_to_enrich = organizations[:args.limit]

    logger.info(f"🎯 Enriching top {len(orgs_to_enrich)} organizations\n")

    enriched = []
    total_cost = 0

    for i, org in enumerate(orgs_to_enrich):
        name = org.get("name", "Unknown")
        logger.info(f"[{i+1}/{len(orgs_to_enrich)}] Processing: {name}")

        # Step 1: Perplexity web research
        perplexity_data = None
        if not args.skip_perplexity:
            perplexity_data = perplexity_research(name, org, model=args.model)
            if perplexity_data:
                logger.info(f"  ✅ Perplexity research complete")
                cost = 0.70 if args.model == "deep-research" else 0.07
                total_cost += cost
            else:
                logger.warning(f"  ⚠️ Perplexity research failed")
            time.sleep(2)  # Rate limiting

        # Step 2: GPT analysis
        gpt_data = gpt_analyze(name, org, perplexity_data)
        if gpt_data:
            logger.info(f"  ✅ GPT analysis complete (risk: {gpt_data.get('risk_score', '?')}, transparency: {gpt_data.get('transparency_rating', '?')})")
            total_cost += 0.01
        else:
            logger.warning(f"  ⚠️ GPT analysis failed")

        # Step 3: Merge results
        analysis = {**(perplexity_data or {}), **(gpt_data or {})}
        org_enriched = {**org, "ai": analysis}
        enriched.append(org_enriched)

        # Step 4: Save to Supabase (if configured)
        if org.get("id"):
            save_to_supabase(org["id"], analysis)

        logger.info(f"  💰 Running cost: ${total_cost:.2f}")

    # Save enriched data locally
    with open(args.output, 'w') as f:
        json.dump(enriched, f, indent=2, default=str)
    logger.info(f"\n✅ Enrichment complete!")
    logger.info(f"   Processed: {len(enriched)} organizations")
    logger.info(f"   Total cost: ~${total_cost:.2f}")
    logger.info(f"   Output: {args.output}")


if __name__ == "__main__":
    main()
