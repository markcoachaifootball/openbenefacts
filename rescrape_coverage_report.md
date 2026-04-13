# OpenBenefacts AFS Parser — Coverage Report

**Date:** 12 April 2026  
**Batch run on Mark's machine:** 49/50 PDFs parsed, 38 OK, 23 OCR'd, 1 error

## Summary

| Metric | Value |
|---|---|
| Total cached PDFs | 50 |
| Successfully parsed | 49 (98%) |
| OK (has gross_exp + rates) | 38 (78%) |
| OCR pipeline used | 23 |
| Errors | 1 (Kilkenny 2018 corrupt PDF) |

## Results by Council

| Council | Years | OK | OCR | Notes |
|---|---|---|---|---|
| Clare | 2016–2024 | 7/9 | 4 | 2 partial (likely OCR quality) |
| Cork | 2022 | 1/1 | — | |
| Donegal | 2023 | 1/1 | — | |
| Dublin | 2023 | 1/1 | — | |
| Dún Laoghaire-Rathdown | 2022 | 1/1 | — | |
| Galway | 2022 | 1/1 | — | |
| Kildare | 2018–2025 | 7/8 | 4 | 1 partial (likely OCR) |
| Kilkenny | 2015–2024 | 3/8 | 6 | Low scan quality; 2018 corrupt; 2015 non-ACOP |
| Leitrim | 2023 | 1/1 | — | |
| Limerick | 2023 | 1/1 | — | |
| Meath | 2023 | 1/1 | — | |
| Monaghan | 2023 | 1/1 | — | |
| Offaly | 2022 | 1/1 | — | |
| South Dublin | 2020–2022 | 0/3 | — | **Wrong PDFs cached** — see below |
| Tipperary | 2023 | 1/1 | — | |
| Waterford | 2016–2024 | 9/9 | 9 | Full recovery from 0% via OCR |
| Wicklow | 2023 | 1/1 | — | |

## Key Achievement: Waterford

All 9 Waterford years (2016–2024) were 100% image-only PDFs with halftone dot backgrounds that defeated both native pdfplumber and ocrmypdf. The new direct-tesseract pipeline (300 DPI + MedianFilter(3) + PSM 6) recovers 13–17/18 I&E fields and 9–13/16 BS fields across all years.

## Issues Found

### South Dublin (0/3) — Wrong Files Cached
The cached files (`lgas_south-dublin_2020.pdf` through `2022.pdf`) are **Local Government Audit Service statutory audit reports**, not Annual Financial Statements. They contain 14 pages of auditor opinion text with zero financial tables. The 2023 registry entry (`audited-afs2023-v1-0.pdf` from sdcc.ie) is the correct AFS URL but was never downloaded to cache.

**Fix:** Delete the 3 wrong cached files. Download the real 2023 AFS from the registry URL. Search sdcc.ie for 2020–2022 AFS PDFs.

### Kilkenny (3/8) — Low Scan Quality
Kilkenny's image-only PDFs have worse scan quality than Waterford. Even after median filtering, tesseract produces garbled digits. OCR hygiene rules (period-as-thousands, character substitutions) help but can't fix fundamental digit misreads.

### Kilkenny 2018 — Corrupt PDF
No /Root object. Needs re-download.

### Kilkenny 2015 — Non-ACOP Format
0/18 IE fields. Likely a pre-ACOP template.

## Missing Councils (11)

No entries in registry: Carlow, Cavan, Kerry, Laois, Longford, Louth, Mayo, Roscommon, Sligo, Westmeath, Wexford.

## Parser Changes This Session

1. **`_ocr_pdf_to_texts()`** — Direct tesseract OCR: pdfplumber 300 DPI → MedianFilter(3) → tesseract --psm 6, JSON-cached per SHA1 hash
2. **`_parse_statements_from_lines()`** — Decoupled text extraction from parsing
3. **`_ocr_line_hygiene()`** — Period-as-thousands, dropped separator, stray comma-space
4. **Broadened regexes** for OCR misreads (Surplusi, Overali, Loca!, Operationa!, belore, Janvery, Surphrs, etc.)
5. **`net_assets` derivation** from `total_reserves` (ACOP accounting identity)
6. **`run_batch_parse.py`** — Standalone batch runner script
