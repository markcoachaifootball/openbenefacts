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

  // ─── Universities & Higher Education ──────────────────────
  "TRINITY COLLEGE DUBLIN": "Dublin",
  "UNIVERSITY COLLEGE DUBLIN": "Dublin",
  "UCD": "Dublin",
  "DUBLIN CITY UNIVERSITY": "Dublin",
  "DCU": "Dublin",
  "TECHNOLOGICAL UNIVERSITY DUBLIN": "Dublin",
  "TU DUBLIN": "Dublin",
  "UNIVERSITY COLLEGE CORK": "Cork",
  "UCC": "Cork",
  "UNIVERSITY OF LIMERICK": "Limerick",
  "NATIONAL UNIVERSITY OF IRELAND GALWAY": "Galway",
  "UNIVERSITY OF GALWAY": "Galway",
  "MAYNOOTH UNIVERSITY": "Kildare",
  "NATIONAL UNIVERSITY OF IRELAND MAYNOOTH": "Kildare",
  "ROYAL COLLEGE OF SURGEONS IN IRELAND": "Dublin",
  "RCSI": "Dublin",
  "NATIONAL COLLEGE OF ART AND DESIGN": "Dublin",
  "NATIONAL COLLEGE OF IRELAND": "Dublin",
  "DUNDALK INSTITUTE OF TECHNOLOGY": "Louth",
  "LETTERKENNY INSTITUTE OF TECHNOLOGY": "Donegal",
  "ATLANTIC TECHNOLOGICAL UNIVERSITY": "Galway",
  "ATU": "Galway",
  "SOUTH EAST TECHNOLOGICAL UNIVERSITY": "Waterford",
  "SETU": "Waterford",
  "MUNSTER TECHNOLOGICAL UNIVERSITY": "Cork",
  "MTU": "Cork",

  // ─── ETBs (Education & Training Boards) ───────────────────
  "CITY OF DUBLIN ETB": "Dublin",
  "CITY OF DUBLIN EDUCATION AND TRAINING BOARD": "Dublin",
  "DUBLIN AND DUN LAOGHAIRE ETB": "Dublin",
  "DUBLIN AND DUN LAOGHAIRE EDUCATION AND TRAINING BOARD": "Dublin",
  "CORK ETB": "Cork",
  "CORK EDUCATION AND TRAINING BOARD": "Cork",
  "GALWAY AND ROSCOMMON ETB": "Galway",
  "GALWAY AND ROSCOMMON EDUCATION AND TRAINING BOARD": "Galway",
  "LIMERICK AND CLARE ETB": "Limerick",
  "LIMERICK AND CLARE EDUCATION AND TRAINING BOARD": "Limerick",
  "MAYO SLIGO AND LEITRIM ETB": "Mayo",
  "MAYO SLIGO AND LEITRIM EDUCATION AND TRAINING BOARD": "Mayo",
  "KERRY ETB": "Kerry",
  "KERRY EDUCATION AND TRAINING BOARD": "Kerry",
  "WATERFORD AND WEXFORD ETB": "Waterford",
  "WATERFORD AND WEXFORD EDUCATION AND TRAINING BOARD": "Waterford",
  "KILKENNY AND CARLOW ETB": "Kilkenny",
  "KILKENNY AND CARLOW EDUCATION AND TRAINING BOARD": "Kilkenny",
  "TIPPERARY ETB": "Tipperary",
  "TIPPERARY EDUCATION AND TRAINING BOARD": "Tipperary",
  "LAOIS AND OFFALY ETB": "Laois",
  "LAOIS AND OFFALY EDUCATION AND TRAINING BOARD": "Laois",
  "LONGFORD AND WESTMEATH ETB": "Westmeath",
  "LONGFORD AND WESTMEATH EDUCATION AND TRAINING BOARD": "Westmeath",
  "LOUTH AND MEATH ETB": "Louth",
  "LOUTH AND MEATH EDUCATION AND TRAINING BOARD": "Louth",
  "CAVAN AND MONAGHAN ETB": "Cavan",
  "CAVAN AND MONAGHAN EDUCATION AND TRAINING BOARD": "Cavan",
  "DONEGAL ETB": "Donegal",
  "DONEGAL EDUCATION AND TRAINING BOARD": "Donegal",
  "KILDARE AND WICKLOW ETB": "Kildare",
  "KILDARE AND WICKLOW EDUCATION AND TRAINING BOARD": "Kildare",

  // ─── Large National Charities (HQ location) ──────────────
  "IRISH CANCER SOCIETY": "Dublin",
  "IRISH HEART FOUNDATION": "Dublin",
  "IRISH KIDNEY ASSOCIATION": "Dublin",
  "IRISH HOSPICE FOUNDATION": "Dublin",
  "IRISH GUIDE DOGS FOR THE BLIND": "Cork",
  "GUIDE DOGS": "Cork",
  "TROCAIRE": "Kildare",
  "GOAL": "Dublin",
  "CONCERN WORLDWIDE": "Dublin",
  "CONCERN": "Dublin",
  "CHRISTIAN AID IRELAND": "Dublin",
  "OXFAM IRELAND": "Dublin",
  "PLAN INTERNATIONAL IRELAND": "Dublin",
  "SELF HELP AFRICA": "Dublin",
  "GORTA": "Dublin",
  "ALZHEIMER SOCIETY OF IRELAND": "Dublin",
  "ARTHRITIS IRELAND": "Dublin",
  "ASTHMA SOCIETY OF IRELAND": "Dublin",
  "CYSTIC FIBROSIS IRELAND": "Dublin",
  "DOWN SYNDROME IRELAND": "Dublin",
  "EPILEPSY IRELAND": "Dublin",
  "IRISH AUTISM ACTION": "Dublin",
  "AUTISM IRELAND": "Dublin",
  "AS I AM": "Dublin",
  "SHINE": "Dublin",
  "INCLUSION IRELAND": "Dublin",
  "DISABILITY FEDERATION OF IRELAND": "Dublin",
  "NOT FOR PROFIT BUSINESS ASSOCIATION": "Dublin",
  "THE WHEEL": "Dublin",
  "CARMICHAEL": "Dublin",
  "CARMICHAEL CENTRE": "Dublin",
  "VOLUNTEER IRELAND": "Dublin",
  "PHILANTHROPY IRELAND": "Dublin",

  // ─── Approved Housing Bodies ──────────────────────────────
  "RESPOND": "Waterford",
  "RESPOND HOUSING ASSOCIATION": "Waterford",
  "CLUID HOUSING": "Dublin",
  "CLUID HOUSING ASSOCIATION": "Dublin",
  "TUATH HOUSING": "Dublin",
  "TUATH HOUSING ASSOCIATION": "Dublin",
  "FOLD IRELAND": "Dublin",
  "FOLD HOUSING ASSOCIATION": "Dublin",
  "CO-OPERATIVE HOUSING IRELAND": "Dublin",
  "OAKLEE HOUSING": "Dublin",
  "CIRCLE VOLUNTARY HOUSING ASSOCIATION": "Dublin",
  "CLANMIL IRELAND": "Dublin",
  "IVEAGH TRUST": "Dublin",
  "PETER MCVERRY TRUST HOUSING": "Dublin",
  "HABITAT FOR HUMANITY IRELAND": "Dublin",

  // ─── Additional Section 39 Disability ─────────────────────
  "ST GABRIEL'S SCHOOL AND CENTRE": "Limerick",
  "ST VINCENT'S CENTRE LISNAGRY": "Limerick",
  "SISKIN CENTRE": "Dublin",
  "NAVAN ROAD CENTRE": "Dublin",
  "ST HILDA'S SERVICES": "Westmeath",
  "DAUGHTERS OF CHARITY CHILD AND FAMILY SERVICE": "Dublin",
  "ST PATRICK'S CENTRE KILKENNY": "Kilkenny",
  "DELTA CENTRE": "Carlow",
  "ST AIDAN'S SERVICES": "Wexford",
  "SOS KILKENNY": "Kilkenny",
  "REHABCARE": "Dublin",
  "NATIONAL LEARNING NETWORK": "Dublin",
  "CUMAS": "Dublin",

  // ─── Additional Homelessness / Housing ────────────────────
  "MERCHANTS QUAY IRELAND": "Dublin",
  "ANA LIFFEY DRUG PROJECT": "Dublin",
  "INNER CITY HELPING HOMELESS": "Dublin",
  "MCVERRY TRUST": "Dublin",
  "DUBLIN REGION HOMELESS EXECUTIVE": "Dublin",
  "DRHE": "Dublin",
  "MENDICITY INSTITUTION": "Dublin",
  "CAPUCHIN DAY CENTRE": "Dublin",
  "SVP": "Dublin",
  "SIMON COMMUNITIES OF IRELAND": "Dublin",
  "GOOD SHEPHERD CORK": "Cork",
  "EDEL HOUSE": "Cork",
  "COPE GALWAY": "Galway",
  "COPE": "Galway",
  "MIDLANDS SIMON": "Westmeath",

  // ─── Children & Youth ─────────────────────────────────────
  "ISPCC": "Dublin",
  "IRISH SOCIETY FOR THE PREVENTION OF CRUELTY TO CHILDREN": "Dublin",
  "FOROIGE": "Dublin",
  "YOUTH WORK IRELAND": "Dublin",
  "NATIONAL YOUTH COUNCIL OF IRELAND": "Dublin",
  "GAISCE": "Dublin",
  "BIG BROTHER BIG SISTER IRELAND": "Dublin",
  "JACK AND JILL CHILDREN'S FOUNDATION": "Kildare",
  "JACK AND JILL": "Kildare",
  "BARRETSTOWN": "Kildare",
  "LAURA LYNN": "Dublin",
  "LAURALYNN": "Dublin",
  "LAURA LYNN IRELAND'S CHILDREN'S HOSPICE": "Dublin",
  "MAKE-A-WISH IRELAND": "Dublin",

  // ─── Sports Bodies ────────────────────────────────────────
  "SPORT IRELAND": "Dublin",
  "FAI": "Dublin",
  "FOOTBALL ASSOCIATION OF IRELAND": "Dublin",
  "IRFU": "Dublin",
  "IRISH RUGBY FOOTBALL UNION": "Dublin",
  "GAA": "Dublin",
  "CUMANN LUTHCHLEAS GAEL": "Dublin",
  "HORSE SPORT IRELAND": "Kildare",
  "HORSE RACING IRELAND": "Kildare",
  "SWIM IRELAND": "Dublin",
  "ATHLETICS IRELAND": "Dublin",
  "TENNIS IRELAND": "Dublin",
  "BASKETBALL IRELAND": "Dublin",
  "CRICKET IRELAND": "Dublin",
  "HOCKEY IRELAND": "Dublin",
  "ROWING IRELAND": "Dublin",
  "SAILING IRELAND": "Dublin",
  "SPECIAL OLYMPICS IRELAND": "Dublin",
  "PARALYMPICS IRELAND": "Dublin",

  // ─── Arts & Culture ───────────────────────────────────────
  "ARTS COUNCIL": "Dublin",
  "THE ARTS COUNCIL": "Dublin",
  "IRISH FILM BOARD": "Galway",
  "SCREEN IRELAND": "Galway",
  "NATIONAL GALLERY OF IRELAND": "Dublin",
  "IRISH MUSEUM OF MODERN ART": "Dublin",
  "IMMA": "Dublin",
  "NATIONAL MUSEUM OF IRELAND": "Dublin",
  "CHESTER BEATTY LIBRARY": "Dublin",
  "ABBEY THEATRE": "Dublin",
  "GATE THEATRE": "Dublin",
  "WEXFORD FESTIVAL OPERA": "Wexford",
  "NATIONAL CONCERT HALL": "Dublin",
  "IRISH HERITAGE TRUST": "Dublin",
  "AN TAISCE": "Dublin",

  // ─── Regional Development & Local ─────────────────────────
  "WESTERN DEVELOPMENT COMMISSION": "Roscommon",
  "UDARAS NA GAELTACHTA": "Galway",
  "SHANNON HERITAGE": "Clare",
  "FAILTE IRELAND": "Dublin",
  "ENTERPRISE IRELAND": "Dublin",
  "IDA IRELAND": "Dublin",
  "SCIENCE FOUNDATION IRELAND": "Dublin",
  "IRISH RESEARCH COUNCIL": "Dublin",
  "HEALTH RESEARCH BOARD": "Dublin",
  "FOOD SAFETY AUTHORITY OF IRELAND": "Dublin",
  "TEAGASC": "Carlow",
  "MARINE INSTITUTE": "Galway",
  "ENVIRONMENTAL PROTECTION AGENCY": "Wexford",
  "EPA": "Wexford",
  "ORDNANCE SURVEY IRELAND": "Dublin",
  "SUSTAINABLE ENERGY AUTHORITY OF IRELAND": "Dublin",
  "SEAI": "Dublin",

  // ─── Additional Health Services ───────────────────────────
  "IRISH BLOOD TRANSFUSION SERVICE": "Dublin",
  "NATIONAL AMBULANCE SERVICE": "Dublin",
  "NATIONAL SCREENING SERVICE": "Dublin",
  "HEALTH INFORMATION AND QUALITY AUTHORITY": "Cork",
  "HIQA": "Cork",
  "MENTAL HEALTH COMMISSION": "Dublin",
  "HEALTH PRODUCTS REGULATORY AUTHORITY": "Dublin",
  "HPRA": "Dublin",
  "IRISH DENTAL ASSOCIATION": "Dublin",
  "IRISH MEDICAL ORGANISATION": "Dublin",
  "NURSING AND MIDWIFERY BOARD OF IRELAND": "Dublin",
  "MEDICAL COUNCIL": "Dublin",
  "AN BORD ALTRANAIS": "Dublin",
  "PRIMARY CARE REIMBURSEMENT SERVICE": "Dublin",
  "HSE": "Dublin",
  "HEALTH SERVICE EXECUTIVE": "Dublin",
  "NATIONAL TREATMENT PURCHASE FUND BOARD": "Dublin",
};

// Normalise name for lookup: uppercase, strip common suffixes, collapse whitespace
function normaliseName(name) {
  return (name || "")
    .toUpperCase()
    .replace(/\b(LIMITED|LTD\.?|CLG|DAC|PLC|T\/A.*$|TRADING\s+AS.*$)\b/gi, "")
    .replace(/[''‛''`]/g, "'")
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
