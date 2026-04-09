#!/usr/bin/env python3
"""
Master archival script: runs all data source scrapers in sequence.
Designed to be run monthly via cron or scheduled task.

Usage:
  # Archive only (no Supabase writes):
  python3 scrapers/archive_all.py

  # Archive + database update:
  SUPABASE_SERVICE_KEY=your_key python3 scrapers/archive_all.py

Data sources:
  1. Charities Regulator — Register + Annual Returns (CSV, ~60MB)
  2. Revenue Commissioners — CHY Register (CSV/XLS)
  3. data.gov.ie — Charities register bulk data (CSV)

Future sources (manual/PDF — not yet automated):
  4. Oireachtas — Accounts laid before Houses (PDFs)
  5. SIPO — Corporate donors register (PDFs)
  6. National Lottery — Good causes grants (web scrape)
  7. Department of Education — School registers (restricted)
"""

import subprocess
import sys
from datetime import datetime
from pathlib import Path

SCRAPERS_DIR = Path(__file__).parent


def run_scraper(name, script):
    """Run a scraper script and report status."""
    print(f"\n{'=' * 60}")
    print(f"  {name}")
    print(f"{'=' * 60}")
    try:
        result = subprocess.run(
            [sys.executable, str(script)],
            capture_output=False,
            timeout=300,
        )
        if result.returncode == 0:
            print(f"  ✓ {name} completed successfully")
            return True
        else:
            print(f"  ✗ {name} failed (exit code {result.returncode})")
            return False
    except subprocess.TimeoutExpired:
        print(f"  ✗ {name} timed out after 5 minutes")
        return False
    except Exception as e:
        print(f"  ✗ {name} error: {e}")
        return False


def main():
    timestamp = datetime.now().strftime("%Y-%m")
    print(f"╔══════════════════════════════════════════════════════════╗")
    print(f"║  OpenBenefacts Monthly Data Archive — {timestamp}          ║")
    print(f"╚══════════════════════════════════════════════════════════╝")

    scrapers = [
        ("Charities Regulator (Register + Annual Returns)", SCRAPERS_DIR / "archive_charities_regulator.py"),
        ("Revenue Commissioners (CHY Register)", SCRAPERS_DIR / "archive_revenue_chy.py"),
    ]

    results = {}
    for name, script in scrapers:
        if script.exists():
            results[name] = run_scraper(name, script)
        else:
            print(f"\n⚠ {name}: script not found at {script}")
            results[name] = False

    # Summary
    print(f"\n{'=' * 60}")
    print(f"  ARCHIVE SUMMARY — {timestamp}")
    print(f"{'=' * 60}")
    for name, success in results.items():
        status = "✓ OK" if success else "✗ FAILED"
        print(f"  {status}  {name}")

    succeeded = sum(1 for v in results.values() if v)
    print(f"\n  {succeeded}/{len(results)} scrapers completed successfully")
    print(f"  Archive directory: data/archive/")
    print(f"\n  Next steps:")
    print(f"  - Check data/archive/ for timestamped CSVs and JSONs")
    print(f"  - Set SUPABASE_SERVICE_KEY to enable automatic database updates")
    print(f"  - Schedule this script to run on the 1st of each month")


if __name__ == "__main__":
    main()
