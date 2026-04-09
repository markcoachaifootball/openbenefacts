-- OpenBenefacts County Cleanup — run in Supabase SQL Editor
-- Fixes typos, ALL CAPS, Dublin postcodes, towns, and NI counties

-- Typos and misspellings
UPDATE organisations SET county = 'Cork' WHERE county ILIKE 'DORK';
UPDATE organisations SET county = 'Derry' WHERE county ILIKE 'LERRY';
UPDATE organisations SET county = 'Dublin' WHERE county ILIKE 'DUBLING';
UPDATE organisations SET county = 'Dublin' WHERE county ILIKE 'DUBLI%';
UPDATE organisations SET county = 'Louth' WHERE county ILIKE 'LOUHT';
UPDATE organisations SET county = 'Louth' WHERE county ILIKE 'LOUTHN';
UPDATE organisations SET county = 'Meath' WHERE county ILIKE 'MEAHT';
UPDATE organisations SET county = 'Kerry' WHERE county ILIKE 'KERR';

-- Dublin postcodes (DUBLIN 1 through DUBLIN 24)
UPDATE organisations SET county = 'Dublin' WHERE county ~ '^DUBLIN\s*\d+$';

-- ALL CAPS → proper case
UPDATE organisations SET county = 'Carlow' WHERE county = 'CARLOW';
UPDATE organisations SET county = 'Cavan' WHERE county = 'CAVAN';
UPDATE organisations SET county = 'Clare' WHERE county = 'CLARE';
UPDATE organisations SET county = 'Cork' WHERE county = 'CORK';
UPDATE organisations SET county = 'Donegal' WHERE county = 'DONEGAL';
UPDATE organisations SET county = 'Dublin' WHERE county = 'DUBLIN';
UPDATE organisations SET county = 'Galway' WHERE county = 'GALWAY';
UPDATE organisations SET county = 'Kerry' WHERE county = 'KERRY';
UPDATE organisations SET county = 'Kildare' WHERE county = 'KILDARE';
UPDATE organisations SET county = 'Kilkenny' WHERE county = 'KILKENNY';
UPDATE organisations SET county = 'Laois' WHERE county = 'LAOIS';
UPDATE organisations SET county = 'Leitrim' WHERE county = 'LEITRIM';
UPDATE organisations SET county = 'Limerick' WHERE county = 'LIMERICK';
UPDATE organisations SET county = 'Longford' WHERE county = 'LONGFORD';
UPDATE organisations SET county = 'Louth' WHERE county = 'LOUTH';
UPDATE organisations SET county = 'Mayo' WHERE county = 'MAYO';
UPDATE organisations SET county = 'Meath' WHERE county = 'MEATH';
UPDATE organisations SET county = 'Monaghan' WHERE county = 'MONAGHAN';
UPDATE organisations SET county = 'Offaly' WHERE county = 'OFFALY';
UPDATE organisations SET county = 'Roscommon' WHERE county = 'ROSCOMMON';
UPDATE organisations SET county = 'Sligo' WHERE county = 'SLIGO';
UPDATE organisations SET county = 'Tipperary' WHERE county = 'TIPPERARY';
UPDATE organisations SET county = 'Waterford' WHERE county = 'WATERFORD';
UPDATE organisations SET county = 'Westmeath' WHERE county = 'WESTMEATH';
UPDATE organisations SET county = 'Wexford' WHERE county = 'WEXFORD';
UPDATE organisations SET county = 'Wicklow' WHERE county = 'WICKLOW';

-- Northern Ireland counties
UPDATE organisations SET county = 'Antrim' WHERE county = 'ANTRIM';
UPDATE organisations SET county = 'Armagh' WHERE county = 'ARMAGH';
UPDATE organisations SET county = 'Derry' WHERE county IN ('DERRY', 'LONDONDERRY');
UPDATE organisations SET county = 'Down' WHERE county = 'DOWN';
UPDATE organisations SET county = 'Fermanagh' WHERE county = 'FERMANAGH';
UPDATE organisations SET county = 'Tyrone' WHERE county = 'TYRONE';

-- Towns → their county
UPDATE organisations SET county = 'Kerry' WHERE county ILIKE 'KILLARNEY';
UPDATE organisations SET county = 'Wexford' WHERE county ILIKE 'ENNISCORTHY';
UPDATE organisations SET county = 'Wicklow' WHERE county ILIKE 'BRAY';
UPDATE organisations SET county = 'Wicklow' WHERE county ILIKE 'GREYSTONES';

-- Eircodes and garbage → null
UPDATE organisations SET county = NULL WHERE county ~ '^[A-Z]\d{2}';

-- Verify: show what's left
SELECT county, COUNT(*) as cnt
FROM organisations
WHERE county IS NOT NULL
GROUP BY county
ORDER BY cnt DESC;
