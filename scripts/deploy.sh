#!/bin/bash
# OpenBenefacts — One-command deploy to Vercel
# Usage: chmod +x scripts/deploy.sh && ./scripts/deploy.sh

set -e

echo "🚀 OpenBenefacts Deploy"
echo "======================="

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "❌ Node.js required. Install from nodejs.org"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm required"; exit 1; }

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build
echo "🔨 Building production bundle..."
npm run build

# Check for Vercel CLI
if command -v vercel >/dev/null 2>&1; then
    echo "☁️ Deploying to Vercel..."
    vercel --prod
    echo "✅ Deployed!"
else
    echo ""
    echo "📦 Build complete! dist/ folder ready."
    echo ""
    echo "To deploy:"
    echo "  Option A: npm i -g vercel && vercel --prod"
    echo "  Option B: Drag dist/ to netlify.com/drop"
    echo "  Option C: Push to GitHub and connect to Vercel/Netlify"
fi
