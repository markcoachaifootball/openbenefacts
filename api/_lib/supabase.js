import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Simple in-memory rate limiter (resets on cold start — good enough for MVP)
const requestCounts = {};
const WINDOW_MS = 60 * 1000; // 1 minute

export function rateLimit(key, maxPerMinute = 10) {
  const now = Date.now();
  if (!requestCounts[key] || now - requestCounts[key].start > WINDOW_MS) {
    requestCounts[key] = { start: now, count: 1 };
    return true;
  }
  requestCounts[key].count++;
  return requestCounts[key].count <= maxPerMinute;
}

// Tier definitions
const TIERS = {
  free:         { maxPerMin: 5,   maxPageSize: 25,  label: 'Free Developer' },
  pro:          { maxPerMin: 20,  maxPageSize: 50,  label: 'Pro' },
  professional: { maxPerMin: 50,  maxPageSize: 100, label: 'Professional' },
  enterprise:   { maxPerMin: 200, maxPageSize: 100, label: 'Enterprise' },
};

function getTier(apiKey) {
  // TODO: Validate API key against a Supabase `api_keys` table
  // For now, differentiate by key prefix convention:
  //   ob_free_...  → free
  //   ob_pro_...   → pro
  //   ob_prof_...  → professional
  //   ob_ent_...   → enterprise
  //   anything else → professional (legacy)
  if (!apiKey) return 'free';
  if (apiKey.startsWith('ob_free_'))  return 'free';
  if (apiKey.startsWith('ob_pro_'))   return 'pro';
  if (apiKey.startsWith('ob_prof_'))  return 'professional';
  if (apiKey.startsWith('ob_ent_'))   return 'enterprise';
  return 'professional'; // default for legacy keys
}

// Auth + rate limit middleware
// Supports both authenticated (Bearer token) and unauthenticated (free tier) access
export function withAuth(handler) {
  return async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const authHeader = req.headers.authorization;
    let apiKey = null;
    let tierName = 'free';

    if (authHeader && authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.slice(7).trim();
      if (apiKey.length < 10) {
        return res.status(401).json({ error: 'Invalid API key' });
      }
      tierName = getTier(apiKey);
    }
    // No auth header → free tier (rate-limited by IP)

    const tier = TIERS[tierName] || TIERS.free;
    const rateLimitKey = apiKey || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'anonymous';

    if (!rateLimit(rateLimitKey, tier.maxPerMin)) {
      res.setHeader('X-RateLimit-Limit', tier.maxPerMin);
      res.setHeader('X-RateLimit-Tier', tier.label);
      res.setHeader('Retry-After', '60');
      return res.status(429).json({
        error: 'Rate limit exceeded. Try again in 60 seconds.',
        tier: tier.label,
        limit: `${tier.maxPerMin} requests/minute`,
        upgrade: tierName === 'free' ? 'Add an API key for higher limits: https://openbenefacts.vercel.app#pricing' : undefined,
      });
    }

    res.setHeader('X-RateLimit-Limit', tier.maxPerMin);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, tier.maxPerMin - (requestCounts[rateLimitKey]?.count || 0)));
    res.setHeader('X-RateLimit-Tier', tier.label);
    res.setHeader('X-API-Tier', tierName);

    return handler(req, res, { apiKey, tier: tierName, tierConfig: tier });
  };
}
