#!/bin/bash
# Download HSE Section 38/39 funded organisations list
# Source: Department of Health via assets.gov.ie
mkdir -p data/hse
curl -sL -o data/hse/section_38_39_orgs.xlsx \
  "https://assets.gov.ie/247584/c223c6e7-2d32-4ace-923d-4b263ec7df07.xlsx"
echo "Downloaded to data/hse/section_38_39_orgs.xlsx"
ls -la data/hse/section_38_39_orgs.xlsx
