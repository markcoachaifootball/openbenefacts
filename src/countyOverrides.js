/**
 * countyOverrides.js
 * ============================================================
 * Manual county/location overrides for top-funded orgs.
 * These take priority over auto-classification from source data.
 *
 * Context: ~29.5% of HSE-funded org grants show county as
 * "Unknown" because the Charities Register doesn't always
 * include address data, and many org records lack county.
 *
 * This map is keyed by normalised org name (uppercase, trimmed).
 * Use getOverriddenCounty(orgName, originalCounty) to apply.
 * ============================================================
 */

// Key: normalised name → Value: correct county
const COUNTY_OVERRIDES = {
  // ─── Dublin Hospitals ──────────────────────────────────────
  "ST VINCENT'S UNIVERSITY HOSPITAL": "Dublin",
  "ST VINCENTS UNIVERSITY HOSPITAL": "Dublin",
  "ST. VINCENT'S UNIVERSITY HOSPITAL": "Dublin",
  "ST VINCENT'S HEALTHCARE GROUP": "Dublin",
  "ST JAMES'S HOSPITAL": "Dublin",
  "ST JAMES HOSPITAL": "Dublin",
  "ST. JAMES'S HOSPITAL": "Dublin",
  "MATER MISERICORDIAE UNIVERSITY HOSPITAL": "Dublin",
  "MATER HOSPITAL": "Dublin",
  "MATER PRIVATE HOSPITAL": "Dublin",
  "OUR LADY'S CHILDREN'S HOSPITAL CRUMLIN": "Dublin",
  "OUR LADY'S CHILDREN'S HOSPITAL": "Dublin",
  "CHILDREN'S HEALTH IRELAND": "Dublin",
  "BEAUMONT HOSPITAL": "Dublin",
  "BEAUMONT HOSPITAL BOARD": "Dublin",
  "CAPPAGH NATIONAL ORTHOPAEDIC HOSPITAL": "Dublin",
  "COOMBE WOMEN AND INFANTS UNIVERSITY HOSPITAL": "Dublin",
  "COOMBE WOMEN & INFANTS UNIVERSITY HOSPITAL": "Dublin",
  "THE COOMBE HOSPITAL": "Dublin",
  "NATIONAL MATERNITY HOSPITAL": "Dublin",
  "ROTUNDA HOSPITAL": "Dublin",
  "THE ROTUNDA HOSPITAL": "Dublin",
  "TEMPLE STREET CHILDREN'S UNIVERSITY HOSPITAL": "Dublin",
  "ROYAL VICTORIA EYE AND EAR HOSPITAL": "Dublin",
  "NATIONAL REHABILITATION HOSPITAL": "Dublin",
  "TALLAGHT UNIVERSITY HOSPITAL": "Dublin",
  "CONNOLLY HOSPITAL BLANCHARDSTOWN": "Dublin",
  "ST COLUMCILLE'S HOSPITAL": "Dublin",
  "LEOPARDSTOWN PARK HOSPITAL": "Dublin",
  "ROYAL HOSPITAL DONNYBROOK": "Dublin",
  "ORTHOPAEDIC HOSPITAL CLONTARF": "Dublin",
  "ST MARY'S HOSPITAL PHOENIX PARK": "Dublin",
  "BLACKROCK CLINIC": "Dublin",
  "BEACON HOSPITAL": "Dublin",
  "PEAMOUNT HEALTHCARE": "Dublin",
  "PEAMOUNT HOSPITAL": "Dublin",

  // ─── Regional Hospitals ────────────────────────────────────
  "SOUTH INFIRMARY-VICTORIA UNIVERSITY HOSPITAL": "Cork",
  "MERCY UNIVERSITY HOSPITAL": "Cork",
  "MERCY UNIVERSITY HOSPITAL CORK": "Cork",
  "CORK UNIVERSITY HOSPITAL": "Cork",
  "BON SECOURS HEALTH SYSTEM": "Cork",
  "ST JOHN'S HOSPITAL LIMERICK": "Limerick",
  "UNIVERSITY HOSPITAL LIMERICK": "Limerick",
  "GALWAY UNIVERSITY HOSPITALS": "Galway",
  "UNIVERSITY HOSPITAL GALWAY": "Galway",
  "UNIVERSITY HOSPITAL WATERFORD": "Waterford",
  "UNIVERSITY HOSPITAL KERRY": "Kerry",
  "WEXFORD GENERAL HOSPITAL": "Wexford",
  "SLIGO UNIVERSITY HOSPITAL": "Sligo",
  "LETTERKENNY UNIVERSITY HOSPITAL": "Donegal",
  "MAYO UNIVERSITY HOSPITAL": "Mayo",
  "MIDLAND REGIONAL HOSPITAL TULLAMORE": "Offaly",
  "MIDLAND REGIONAL HOSPITAL PORTLAOISE": "Laois",
  "MIDLAND REGIONAL HOSPITAL MULLINGAR": "Westmeath",
  "CAVAN GENERAL HOSPITAL": "Cavan",
  "NAAS GENERAL HOSPITAL": "Kildare",
  "ST LUKE'S HOSPITAL": "Dublin",

  // ─── Hospital Groups ───────────────────────────────────────
  "SAOLTA UNIVERSITY HEALTH CARE GROUP": "Galway",
  "IRELAND EAST HOSPITAL GROUP": "Dublin",
  "RCSI HOSPITAL GROUP": "Dublin",
  "SOUTH/SOUTH WEST HOSPITAL GROUP": "Cork",
  "UL HOSPITALS GROUP": "Limerick",
  "CHILDREN'S HOSPITAL GROUP": "Dublin",
  "DUBLIN MIDLANDS HOSPITAL GROUP": "Dublin",
  "NATIONAL TREATMENT PURCHASE FUND": "Dublin",

  // ─── Section 39 Disability — Dublin ────────────────────────
  "ST JOHN OF GOD COMMUNITY SERVICES": "Dublin",
  "ST JOHN OF GOD COMMUNITY SERVICES CLG": "Dublin",
  "ST. JOHN OF GOD COMMUNITY SERVICES": "Dublin",
  "ST MICHAEL'S HOUSE": "Dublin",
  "CENTRAL REMEDIAL CLINIC": "Dublin",
  "STEWART'S CARE": "Dublin",
  "STEWARTS CARE": "Dublin",
  "CHEEVERSTOWN HOUSE": "Dublin",
  "DAUGHTERS OF CHARITY": "Dublin",
  "DAUGHTERS OF CHARITY DISABILITY SUPPORT SERVICES": "Dublin",
  "REHAB GROUP": "Dublin",
  "THE REHAB GROUP": "Dublin",
  "IRISH WHEELCHAIR ASSOCIATION": "Dublin",
  "VISION IRELAND": "Dublin",
  "NCBI": "Dublin",
  "NATIONAL COUNCIL FOR THE BLIND OF IRELAND": "Dublin",
  "ACQUIRED BRAIN INJURY IRELAND": "Dublin",
  "WALK": "Dublin",
  "PROSPER FINGAL": "Dublin",
  "ENABLE IRELAND": "Dublin",
  "ENABLE IRELAND DISABILITY SERVICES": "Dublin",

  // ─── Section 39 Disability — Outside Dublin ────────────────
  "COPE FOUNDATION": "Cork",
  "BROTHERS OF CHARITY SERVICES IRELAND": "Galway",
  "BROTHERS OF CHARITY SERVICES": "Galway",
  "BROTHERS OF CHARITY SERVICES GALWAY": "Galway",
  "BROTHERS OF CHARITY SERVICES CLARE": "Clare",
  "BROTHERS OF CHARITY SERVICES ROSCOMMON": "Roscommon",
  "BROTHERS OF CHARITY SERVICES SOUTH EAST": "Waterford",
  "BROTHERS OF CHARITY SOUTHERN SERVICES": "Cork",
  "SUNBEAM HOUSE SERVICES": "Wicklow",
  "WESTERN CARE ASSOCIATION": "Mayo",
  "ABILITY WEST": "Galway",
  "ST JOSEPH'S FOUNDATION": "Cork",
  "CHESHIRE IRELAND": "Dublin",
  "CAMPHILL COMMUNITIES OF IRELAND": "Kilkenny",
  "L'ARCHE IRELAND": "Dublin",
  "MUIRIOSA FOUNDATION": "Kildare",
  "KARE": "Kildare",
  "NAVAN CENTRE FOR PEOPLE WITH DISABILITIES": "Meath",
  "PRAXIS CARE": "Dublin",
  "GHEEL AUTISM SERVICES": "Dublin",
  "SAPLINGS SCHOOL": "Dublin",

  // ─── Child & Family / Homelessness ─────────────────────────
  "TUSLA": "Dublin",
  "CHILD AND FAMILY AGENCY": "Dublin",
  "BARNARDOS": "Dublin",
  "BARNARDOS REPUBLIC OF IRELAND": "Dublin",
  "FOCUS IRELAND": "Dublin",
  "PETER MCVERRY TRUST": "Dublin",
  "SIMON COMMUNITY": "Dublin",
  "DUBLIN SIMON COMMUNITY": "Dublin",
  "CORK SIMON COMMUNITY": "Cork",
  "GALWAY SIMON COMMUNITY": "Galway",
  "MIDLANDS SIMON COMMUNITY": "Westmeath",
  "NORTH WEST SIMON COMMUNITY": "Sligo",
  "DEPAUL IRELAND": "Dublin",
  "THRESHOLD": "Dublin",
  "NOVAS": "Limerick",
  "SOPHIA HOUSING": "Dublin",
  "CROSSCARE": "Dublin",
  "ALONE": "Dublin",
  "AGE ACTION IRELAND": "Dublin",
  "INDEPENDENT LIVING MOVEMENT IRELAND": "Dublin",

  // ─── Mental Health ─────────────────────────────────────────
  "ST PATRICK'S MENTAL HEALTH SERVICES": "Dublin",
  "MENTAL HEALTH IRELAND": "Dublin",
  "PIETA HOUSE": "Dublin",
  "JIGSAW": "Dublin",
  "AWARE": "Dublin",
  "BODYWHYS": "Dublin",

  // ─── State Bodies & Education ──────────────────────────────
  "POBAL": "Dublin",
  "CITIZENS INFORMATION BOARD": "Dublin",
  "IRISH RED CROSS SOCIETY": "Dublin",
  "IRISH RED CROSS": "Dublin",
  "ST VINCENT DE PAUL": "Dublin",
  "SOCIETY OF ST. VINCENT DE PAUL": "Dublin",
  "HIGHER EDUCATION AUTHORITY": "Dublin",
  "SOLAS": "Dublin",
  "QUALITY AND QUALIFICATIONS IRELAND": "Dublin",
  "SKILLNET IRELAND": "Dublin",
};

// Normalise name for lookup: uppercase, strip common suffixes, collapse whitespace
function normaliseName(name) {
  return (name || "")
    .toUpperCase()
    .replace(/\b(LIMITED|LTD\.?|CLG|DAC|PLC|T\/A.*$|TRADING\s+AS.*$)\b/gi, "")
    .replace(/[''`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns the correct county for an org, applying manual overrides.
 * @param {string} orgName - The org's display name
 * @param {string} originalCounty - The auto-classified county from source data
 * @returns {string} The corrected county
 */
export function getOverriddenCounty(orgName, originalCounty) {
  // If the original county is already populated and not "Unknown", keep it
  if (originalCounty && originalCounty !== "Unknown" && originalCounty !== "unknown") {
    return originalCounty;
  }

  if (!orgName) return originalCounty || "Unknown";
  const norm = normaliseName(orgName);

  // Direct match
  if (COUNTY_OVERRIDES[norm]) return COUNTY_OVERRIDES[norm];

  // Partial match for common name fragments
  for (const [key, county] of Object.entries(COUNTY_OVERRIDES)) {
    if (key.length >= 10 && norm.includes(key)) return county;
  }

  return originalCounty || "Unknown";
}

export default COUNTY_OVERRIDES;
