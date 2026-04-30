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

  // ─── Universities & Higher Education ──────────────────────
  "TRINITY COLLEGE DUBLIN": "Education, Research",
  "UNIVERSITY COLLEGE DUBLIN": "Education, Research",
  "DUBLIN CITY UNIVERSITY": "Education, Research",
  "TECHNOLOGICAL UNIVERSITY DUBLIN": "Education, Research",
  "TU DUBLIN": "Education, Research",
  "UNIVERSITY COLLEGE CORK": "Education, Research",
  "UNIVERSITY OF LIMERICK": "Education, Research",
  "NATIONAL UNIVERSITY OF IRELAND GALWAY": "Education, Research",
  "UNIVERSITY OF GALWAY": "Education, Research",
  "MAYNOOTH UNIVERSITY": "Education, Research",
  "NATIONAL UNIVERSITY OF IRELAND MAYNOOTH": "Education, Research",
  "ROYAL COLLEGE OF SURGEONS IN IRELAND": "Education, Research",
  "NATIONAL COLLEGE OF ART AND DESIGN": "Education, Research",
  "NATIONAL COLLEGE OF IRELAND": "Education, Research",
  "ATLANTIC TECHNOLOGICAL UNIVERSITY": "Education, Research",
  "SOUTH EAST TECHNOLOGICAL UNIVERSITY": "Education, Research",
  "MUNSTER TECHNOLOGICAL UNIVERSITY": "Education, Research",

  // ─── ETBs ─────────────────────────────────────────────────
  "CITY OF DUBLIN ETB": "Education, Research",
  "CITY OF DUBLIN EDUCATION AND TRAINING BOARD": "Education, Research",
  "DUBLIN AND DUN LAOGHAIRE ETB": "Education, Research",
  "DUBLIN AND DUN LAOGHAIRE EDUCATION AND TRAINING BOARD": "Education, Research",
  "CORK ETB": "Education, Research",
  "CORK EDUCATION AND TRAINING BOARD": "Education, Research",
  "GALWAY AND ROSCOMMON ETB": "Education, Research",
  "GALWAY AND ROSCOMMON EDUCATION AND TRAINING BOARD": "Education, Research",
  "LIMERICK AND CLARE ETB": "Education, Research",
  "LIMERICK AND CLARE EDUCATION AND TRAINING BOARD": "Education, Research",
  "MAYO SLIGO AND LEITRIM ETB": "Education, Research",
  "KERRY ETB": "Education, Research",
  "WATERFORD AND WEXFORD ETB": "Education, Research",
  "KILKENNY AND CARLOW ETB": "Education, Research",
  "TIPPERARY ETB": "Education, Research",
  "LAOIS AND OFFALY ETB": "Education, Research",
  "LONGFORD AND WESTMEATH ETB": "Education, Research",
  "LOUTH AND MEATH ETB": "Education, Research",
  "CAVAN AND MONAGHAN ETB": "Education, Research",
  "DONEGAL ETB": "Education, Research",
  "KILDARE AND WICKLOW ETB": "Education, Research",

  // ─── Large National Charities ─────────────────────────────
  "IRISH CANCER SOCIETY": "Health",
  "IRISH HEART FOUNDATION": "Health",
  "IRISH KIDNEY ASSOCIATION": "Health",
  "IRISH HOSPICE FOUNDATION": "Health",
  "ALZHEIMER SOCIETY OF IRELAND": "Health",
  "EPILEPSY IRELAND": "Health",
  "CYSTIC FIBROSIS IRELAND": "Health",
  "ASTHMA SOCIETY OF IRELAND": "Health",
  "ARTHRITIS IRELAND": "Health",
  "DOWN SYNDROME IRELAND": "Health",
  "IRISH GUIDE DOGS FOR THE BLIND": "Social Services",
  "AS I AM": "Social Services",
  "INCLUSION IRELAND": "Social Services",
  "DISABILITY FEDERATION OF IRELAND": "Social Services",
  "SHINE": "Health",

  // ─── International Development ────────────────────────────
  "TROCAIRE": "International",
  "GOAL": "International",
  "CONCERN WORLDWIDE": "International",
  "CONCERN": "International",
  "CHRISTIAN AID IRELAND": "International",
  "OXFAM IRELAND": "International",
  "PLAN INTERNATIONAL IRELAND": "International",
  "SELF HELP AFRICA": "International",
  "GORTA": "International",
  "HABITAT FOR HUMANITY IRELAND": "International",

  // ─── Approved Housing Bodies ──────────────────────────────
  "RESPOND": "Social Services",
  "RESPOND HOUSING ASSOCIATION": "Social Services",
  "CLUID HOUSING": "Social Services",
  "CLUID HOUSING ASSOCIATION": "Social Services",
  "TUATH HOUSING": "Social Services",
  "TUATH HOUSING ASSOCIATION": "Social Services",
  "FOLD IRELAND": "Social Services",
  "FOLD HOUSING ASSOCIATION": "Social Services",
  "CO-OPERATIVE HOUSING IRELAND": "Social Services",
  "OAKLEE HOUSING": "Social Services",
  "CIRCLE VOLUNTARY HOUSING ASSOCIATION": "Social Services",
  "IVEAGH TRUST": "Social Services",

  // ─── Additional Homelessness ──────────────────────────────
  "MERCHANTS QUAY IRELAND": "Social Services",
  "ANA LIFFEY DRUG PROJECT": "Health",
  "INNER CITY HELPING HOMELESS": "Social Services",
  "DUBLIN REGION HOMELESS EXECUTIVE": "Social Services",
  "MENDICITY INSTITUTION": "Social Services",
  "CAPUCHIN DAY CENTRE": "Social Services",
  "SIMON COMMUNITIES OF IRELAND": "Social Services",
  "COPE GALWAY": "Social Services",

  // ─── Children & Youth ─────────────────────────────────────
  "ISPCC": "Social Services",
  "IRISH SOCIETY FOR THE PREVENTION OF CRUELTY TO CHILDREN": "Social Services",
  "FOROIGE": "Social Services",
  "YOUTH WORK IRELAND": "Social Services",
  "NATIONAL YOUTH COUNCIL OF IRELAND": "Social Services",
  "JACK AND JILL CHILDREN'S FOUNDATION": "Health",
  "JACK AND JILL": "Health",
  "BARRETSTOWN": "Health",
  "LAURA LYNN": "Health",
  "LAURA LYNN IRELAND'S CHILDREN'S HOSPICE": "Health",
  "MAKE-A-WISH IRELAND": "Social Services",

  // ─── Sports Bodies ────────────────────────────────────────
  "SPORT IRELAND": "Culture, Recreation",
  "FAI": "Culture, Recreation",
  "FOOTBALL ASSOCIATION OF IRELAND": "Culture, Recreation",
  "IRFU": "Culture, Recreation",
  "IRISH RUGBY FOOTBALL UNION": "Culture, Recreation",
  "GAA": "Culture, Recreation",
  "CUMANN LUTHCHLEAS GAEL": "Culture, Recreation",
  "HORSE SPORT IRELAND": "Culture, Recreation",
  "HORSE RACING IRELAND": "Culture, Recreation",
  "SPECIAL OLYMPICS IRELAND": "Culture, Recreation",
  "PARALYMPICS IRELAND": "Culture, Recreation",

  // ─── Arts & Culture ───────────────────────────────────────
  "ARTS COUNCIL": "Culture, Recreation",
  "THE ARTS COUNCIL": "Culture, Recreation",
  "SCREEN IRELAND": "Culture, Recreation",
  "IRISH FILM BOARD": "Culture, Recreation",
  "NATIONAL GALLERY OF IRELAND": "Culture, Recreation",
  "IRISH MUSEUM OF MODERN ART": "Culture, Recreation",
  "NATIONAL MUSEUM OF IRELAND": "Culture, Recreation",
  "CHESTER BEATTY LIBRARY": "Culture, Recreation",
  "ABBEY THEATRE": "Culture, Recreation",
  "GATE THEATRE": "Culture, Recreation",
  "WEXFORD FESTIVAL OPERA": "Culture, Recreation",
  "NATIONAL CONCERT HALL": "Culture, Recreation",
  "AN TAISCE": "Environment",
  "IRISH HERITAGE TRUST": "Culture, Recreation",

  // ─── State Agencies ───────────────────────────────────────
  "ENTERPRISE IRELAND": "Development, Housing",
  "IDA IRELAND": "Development, Housing",
  "FAILTE IRELAND": "Culture, Recreation",
  "SCIENCE FOUNDATION IRELAND": "Education, Research",
  "IRISH RESEARCH COUNCIL": "Education, Research",
  "HEALTH RESEARCH BOARD": "Education, Research",
  "TEAGASC": "Education, Research",
  "MARINE INSTITUTE": "Education, Research",
  "ENVIRONMENTAL PROTECTION AGENCY": "Environment",
  "SUSTAINABLE ENERGY AUTHORITY OF IRELAND": "Environment",
  "FOOD SAFETY AUTHORITY OF IRELAND": "Health",

  // ─── Additional Health Bodies ─────────────────────────────
  "IRISH BLOOD TRANSFUSION SERVICE": "Health",
  "HEALTH INFORMATION AND QUALITY AUTHORITY": "Health",
  "HIQA": "Health",
  "MENTAL HEALTH COMMISSION": "Health",
  "HEALTH PRODUCTS REGULATORY AUTHORITY": "Health",
  "NURSING AND MIDWIFERY BOARD OF IRELAND": "Health",
  "MEDICAL COUNCIL": "Health",
  "HSE": "Health",
  "HEALTH SERVICE EXECUTIVE": "Health",

  // ─── Sector Infrastructure ────────────────────────────────
  "THE WHEEL": "Philanthropy, Voluntarism",
  "CARMICHAEL": "Philanthropy, Voluntarism",
  "CARMICHAEL CENTRE": "Philanthropy, Voluntarism",
  "VOLUNTEER IRELAND": "Philanthropy, Voluntarism",
  "PHILANTHROPY IRELAND": "Philanthropy, Voluntarism",
  "NOT FOR PROFIT BUSINESS ASSOCIATION": "Philanthropy, Voluntarism",

  // ─── Additional Disability Services ───────────────────────
  "REHABCARE": "Social Services",
  "NATIONAL LEARNING NETWORK": "Education, Research",
  "ST GABRIEL'S SCHOOL AND CENTRE": "Social Services",
  "ST PATRICK'S CENTRE KILKENNY": "Social Services",
  "DELTA CENTRE": "Social Services",
  "ST AIDAN'S SERVICES": "Social Services",
  "SOS KILKENNY": "Social Services",
};

// Normalise name for lookup: uppercase, strip common suffixes, collapse whitespace
function normaliseName(name) {
  return (name || "")
    .toUpperCase()
    .replace(/\b(LIMITED|LTD\.?|CLG|DAC|PLC|T\/A.*$|TRADING\s+AS.*$)\b/gi, "")
    .replace(/[‘’‛''`]/g, "'")
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

  // Keyword-based fallback classifier for unmatched orgs
  const KEYWORD_SECTORS = [
    [/\b(HOSPITAL|HOSPICE|CLINIC|MEDICAL|NURSING HOME|HEALTH CENTRE|HEALTH CENTER)\b/, "Health"],
    [/\b(SCHOOL|COLLEGE|UNIVERSITY|INSTITUTE OF TECHNOLOGY|EDUCATION|TRAINING BOARD|ETB)\b/, "Education, Research"],
    [/\b(HOUSING ASSOCIATION|HOUSING BODY|HOMELESS|SHELTER|ACCOMMODATION)\b/, "Social Services"],
    [/\b(DISABILITY|DISABLED|SPECIAL NEEDS|AUTISM|INTELLECTUAL)\b/, "Social Services"],
    [/\b(THEATRE|THEATER|GALLERY|MUSEUM|ARTS CENTRE|FESTIVAL|ORCHESTRA|CHOIR)\b/, "Culture, Recreation"],
    [/\b(SPORTS? CLUB|ATHLETIC|RUGBY|SOCCER|FOOTBALL|GAA|HURLING|CAMOGIE|SWIMMING)\b/, "Culture, Recreation"],
    [/\b(ENVIRONMENTAL|CONSERVATION|WILDLIFE|ECOLOGY|CLIMATE|SUSTAINABILITY)\b/, "Environment"],
    [/\b(MISSIONARY|OVERSEAS AID|DEVELOPMENT AID|HUMANITARIAN)\b/, "International"],
    [/\b(PARISH|DIOCESE|ARCHDIOCESE|CONGREGATION|RELIGIOUS ORDER|MONASTERY|CONVENT)\b/, "Religion"],
  ];

  for (const [pattern, sector] of KEYWORD_SECTORS) {
    if (pattern.test(norm)) return sector;
  }

  return originalSector || "Unclassified";
}

export default SECTOR_OVERRIDES;
