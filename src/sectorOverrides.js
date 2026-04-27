/**
 * sectorOverrides.js
 * ============================================================
 * Manual sector classification overrides for top-funded orgs.
 * These take priority over auto-classification from source data.
 *
 * Context: The Charities Regulator ICNPO classification has
 * significant gaps — ~28% of HSE-funded orgs show as
 * "Unclassified", and some hospitals are tagged as
 * "Philanthropy, Voluntarism" or "Other".
 *
 * This map is keyed by normalised org name (uppercase, trimmed).
 * Use getOverriddenSector(orgName, originalSector) to apply.
 * ============================================================
 */

// Key: normalised name → Value: correct ICNPO sector
const SECTOR_OVERRIDES = {
  // ─── Section 38 Voluntary Hospitals ─────────────────────────
  "ST VINCENT'S UNIVERSITY HOSPITAL": "Health",
  "ST VINCENTS UNIVERSITY HOSPITAL": "Health",
  "ST. VINCENT'S UNIVERSITY HOSPITAL": "Health",
  "ST JAMES'S HOSPITAL": "Health",
  "ST JAMES HOSPITAL": "Health",
  "ST. JAMES'S HOSPITAL": "Health",
  "MATER MISERICORDIAE UNIVERSITY HOSPITAL": "Health",
  "MATER HOSPITAL": "Health",
  "OUR LADY'S CHILDREN'S HOSPITAL CRUMLIN": "Health",
  "OUR LADY'S CHILDREN'S HOSPITAL": "Health",
  "CHILDREN'S HEALTH IRELAND": "Health",
  "BEAUMONT HOSPITAL": "Health",
  "BEAUMONT HOSPITAL BOARD": "Health",
  "CAPPAGH NATIONAL ORTHOPAEDIC HOSPITAL": "Health",
  "COOMBE WOMEN AND INFANTS UNIVERSITY HOSPITAL": "Health",
  "COOMBE WOMEN & INFANTS UNIVERSITY HOSPITAL": "Health",
  "THE COOMBE HOSPITAL": "Health",
  "NATIONAL MATERNITY HOSPITAL": "Health",
  "ROTUNDA HOSPITAL": "Health",
  "THE ROTUNDA HOSPITAL": "Health",
  "TEMPLE STREET CHILDREN'S UNIVERSITY HOSPITAL": "Health",
  "ROYAL VICTORIA EYE AND EAR HOSPITAL": "Health",
  "NATIONAL REHABILITATION HOSPITAL": "Health",
  "TALLAGHT UNIVERSITY HOSPITAL": "Health",
  "SOUTH INFIRMARY-VICTORIA UNIVERSITY HOSPITAL": "Health",
  "MERCY UNIVERSITY HOSPITAL": "Health",
  "MERCY UNIVERSITY HOSPITAL CORK": "Health",
  "ST LUKE'S HOSPITAL": "Health",
  "ST JOHN'S HOSPITAL LIMERICK": "Health",
  "GALWAY UNIVERSITY HOSPITALS": "Health",
  "CORK UNIVERSITY HOSPITAL": "Health",
  "UNIVERSITY HOSPITAL LIMERICK": "Health",
  "UNIVERSITY HOSPITAL WATERFORD": "Health",
  "UNIVERSITY HOSPITAL GALWAY": "Health",
  "UNIVERSITY HOSPITAL KERRY": "Health",
  "WEXFORD GENERAL HOSPITAL": "Health",
  "SLIGO UNIVERSITY HOSPITAL": "Health",
  "LETTERKENNY UNIVERSITY HOSPITAL": "Health",
  "MAYO UNIVERSITY HOSPITAL": "Health",
  "MIDLAND REGIONAL HOSPITAL TULLAMORE": "Health",
  "MIDLAND REGIONAL HOSPITAL PORTLAOISE": "Health",
  "MIDLAND REGIONAL HOSPITAL MULLINGAR": "Health",
  "CAVAN GENERAL HOSPITAL": "Health",
  "CONNOLLY HOSPITAL BLANCHARDSTOWN": "Health",
  "NAAS GENERAL HOSPITAL": "Health",
  "ST COLUMCILLE'S HOSPITAL": "Health",
  "LEOPARDSTOWN PARK HOSPITAL": "Health",
  "PEAMOUNT HEALTHCARE": "Health",
  "ROYAL HOSPITAL DONNYBROOK": "Health",
  "ORTHOPAEDIC HOSPITAL CLONTARF": "Health",
  "ST MARY'S HOSPITAL PHOENIX PARK": "Health",
  "NATIONAL TREATMENT PURCHASE FUND": "Health",
  "SAOLTA UNIVERSITY HEALTH CARE GROUP": "Health",
  "IRELAND EAST HOSPITAL GROUP": "Health",
  "RCSI HOSPITAL GROUP": "Health",
  "SOUTH/SOUTH WEST HOSPITAL GROUP": "Health",
  "UL HOSPITALS GROUP": "Health",
  "CHILDREN'S HOSPITAL GROUP": "Health",
  "DUBLIN MIDLANDS HOSPITAL GROUP": "Health",

  // ─── Section 39 Disability & Mental Health ──────────────────
  "ST JOHN OF GOD COMMUNITY SERVICES": "Social Services",
  "ST JOHN OF GOD COMMUNITY SERVICES CLG": "Social Services",
  "ST. JOHN OF GOD COMMUNITY SERVICES": "Social Services",
  "BROTHERS OF CHARITY SERVICES IRELAND": "Social Services",
  "BROTHERS OF CHARITY SERVICES": "Social Services",
  "BROTHERS OF CHARITY SERVICES GALWAY": "Social Services",
  "BROTHERS OF CHARITY SERVICES CLARE": "Social Services",
  "BROTHERS OF CHARITY SERVICES ROSCOMMON": "Social Services",
  "BROTHERS OF CHARITY SERVICES SOUTH EAST": "Social Services",
  "BROTHERS OF CHARITY SOUTHERN SERVICES": "Social Services",
  "ENABLE IRELAND": "Social Services",
  "ENABLE IRELAND DISABILITY SERVICES": "Social Services",
  "COPE FOUNDATION": "Social Services",
  "ST MICHAEL'S HOUSE": "Social Services",
  "REHAB GROUP": "Social Services",
  "THE REHAB GROUP": "Social Services",
  "IRISH WHEELCHAIR ASSOCIATION": "Social Services",
  "CENTRAL REMEDIAL CLINIC": "Social Services",
  "STEWART'S CARE": "Social Services",
  "STEWARTS CARE": "Social Services",
  "CHEEVERSTOWN HOUSE": "Social Services",
  "DAUGHTERS OF CHARITY": "Social Services",
  "DAUGHTERS OF CHARITY DISABILITY SUPPORT SERVICES": "Social Services",
  "SUNBEAM HOUSE SERVICES": "Social Services",
  "KARE": "Social Services",
  "NAVAN CENTRE FOR PEOPLE WITH DISABILITIES": "Social Services",
  "WESTERN CARE ASSOCIATION": "Social Services",
  "ABILITY WEST": "Social Services",
  "ST JOSEPH'S FOUNDATION": "Social Services",
  "CHESHIRE IRELAND": "Social Services",
  "VISION IRELAND": "Social Services",
  "NCBI": "Social Services",
  "NATIONAL COUNCIL FOR THE BLIND OF IRELAND": "Social Services",
  "ACQUIRED BRAIN INJURY IRELAND": "Social Services",
  "CAMPHILL COMMUNITIES OF IRELAND": "Social Services",
  "L'ARCHE IRELAND": "Social Services",
  "MUIRIOSA FOUNDATION": "Social Services",
  "PEAMOUNT HOSPITAL": "Health",
  "PRAXIS CARE": "Social Services",
  "PROSPER FINGAL": "Social Services",
  "WALK": "Social Services",
  "GHEEL AUTISM SERVICES": "Social Services",
  "SAPLINGS SCHOOL": "Social Services",

  // ─── Child & Family Services ────────────────────────────────
  "TUSLA": "Social Services",
  "CHILD AND FAMILY AGENCY": "Social Services",
  "BARNARDOS": "Social Services",
  "BARNARDOS REPUBLIC OF IRELAND": "Social Services",
  "FOCUS IRELAND": "Social Services",
  "PETER MCVERRY TRUST": "Social Services",
  "SIMON COMMUNITY": "Social Services",
  "DUBLIN SIMON COMMUNITY": "Social Services",
  "CORK SIMON COMMUNITY": "Social Services",
  "GALWAY SIMON COMMUNITY": "Social Services",
  "MIDLANDS SIMON COMMUNITY": "Social Services",
  "NORTH WEST SIMON COMMUNITY": "Social Services",
  "DEPAUL IRELAND": "Social Services",
  "THRESHOLD": "Social Services",
  "NOVAS": "Social Services",
  "SOPHIA HOUSING": "Social Services",
  "CROSSCARE": "Social Services",
  "ALONE": "Social Services",
  "AGE ACTION IRELAND": "Social Services",
  "INDEPENDENT LIVING MOVEMENT IRELAND": "Social Services",

  // ─── Mental Health ──────────────────────────────────────────
  "ST PATRICK'S MENTAL HEALTH SERVICES": "Health",
  "MENTAL HEALTH IRELAND": "Health",
  "PIETA HOUSE": "Health",
  "JIGSAW": "Health",
  "AWARE": "Health",
  "BODYWHYS": "Health",

  // ─── Hospitals mislabelled as Philanthropy/Other ────────────
  "ST VINCENT'S HEALTHCARE GROUP": "Health",
  "MATER PRIVATE HOSPITAL": "Health",
  "BON SECOURS HEALTH SYSTEM": "Health",
  "BLACKROCK CLINIC": "Health",
  "BEACON HOSPITAL": "Health",

  // ─── Education (commonly misclassified) ─────────────────────
  "HIGHER EDUCATION AUTHORITY": "Education, Research",
  "SOLAS": "Education, Research",
  "QUALITY AND QUALIFICATIONS IRELAND": "Education, Research",
  "SKILLNET IRELAND": "Education, Research",

  // ─── Key state bodies ───────────────────────────────────────
  "POBAL": "Social Services",
  "CITIZENS INFORMATION BOARD": "Social Services",
  "IRISH RED CROSS SOCIETY": "Social Services",
  "IRISH RED CROSS": "Social Services",
  "ST VINCENT DE PAUL": "Social Services",
  "SOCIETY OF ST. VINCENT DE PAUL": "Social Services",
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
 * Returns the correct sector for an org, applying manual overrides.
 * @param {string} orgName - The org's display name
 * @param {string} originalSector - The auto-classified sector from source data
 * @returns {string} The corrected sector
 */
export function getOverriddenSector(orgName, originalSector) {
  if (!orgName) return originalSector || "Unclassified";
  const norm = normaliseName(orgName);

  // Direct match
  if (SECTOR_OVERRIDES[norm]) return SECTOR_OVERRIDES[norm];

  // Partial match for common name fragments
  for (const [key, sector] of Object.entries(SECTOR_OVERRIDES)) {
    if (key.length >= 10 && norm.includes(key)) return sector;
  }

  return originalSector || "Unclassified";
}

export default SECTOR_OVERRIDES;
