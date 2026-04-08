import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Simple in-memory rate limiter (resets on cold start — good enough for MVP)
const requestCounts = {};
const WINDOW_MS = 60 * 1000; // 1 minute

export function rateLimit(apiKey, maxPerMinute = 10) {
  const now = Date.now();
  if (!requestCounts[apiKey] || now - requestCounts[apiKey].start > WINDOW_MS) {
    requestCounts[apiKey] = { start: now, count: 1 };
    return true;
  }
  requestCounts[apiKey].count++;
  return requestCounts[apiKey].count <= maxPerMinute;
}

// Auth + rate limit middleware
export function withAuth(handler) {
  return async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header. Use: Bearer YOUR_API_KEY' });
    }

    const apiKey = authHeader.slice(7).trim();
    if (!apiKey || apiKey.length < 10) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // TODO: Validate API key against a Supabase `api_keys` table
    // For now, accept any key that looks valid (MVP stub)

    // Rate limit: 10 req/min for Professional, 50 for Enterprise
    const maxPerMin = 50; // will differentiate by tier later
    if (!rateLimit(apiKey, maxPerMin)) {
      res.setHeader('X-RateLimit-Limit', maxPerMin);
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ error: 'Rate limit exceeded. Try again in 60 seconds.' });
    }

    res.setHeader('X-RateLimit-Limit', maxPerMin);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxPerMin - (requestCounts[apiKey]?.count || 0)));

    return handler(req, res, { apiKey });
  };
}
