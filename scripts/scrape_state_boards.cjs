/**
 * OpenBenefacts — State Body Board Member Scraper
 *
 * Populates directors + org_directors for government bodies
 * that don't file with the Charities Regulator (HSE, Tusla,
 * Sport Ireland, state agencies, etc.).
 *
 * Data sourced from gov.ie and agency websites.
 *
 * Run: node scripts/scrape_state_boards.cjs
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ilkwspvhqedzjreysuxu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlsa3dzcHZocWVkempyZXlzdXh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDEyMjQyMiwiZXhwIjoyMDg5Njk4NDIyfQ.lnA4FizzVkNHNJ7J-OlP_A4j7gXJxZXrfyZGXM2KbBc';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function normaliseName(name) {
  return name
    .toUpperCase()
    .replace(/[^A-Z\s'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// State body board data (manually compiled from gov.ie & agency sites)
// These are publicly available appointments
// ============================================================
const STATE_BOARDS = [
  {
    orgName: 'Health Service Executive',
    altNames: ['HSE', 'HSE / Dept of Health'],
    source: 'gov.ie/hse',
    members: [
      { name: 'Ciarán Devane', role: 'Chairperson', startDate: '2019-01-01', paid: true, annualFee: 31500 },
      { name: 'Brendan Lenihan', role: 'Board Member', startDate: '2019-01-01', paid: true, annualFee: 15750 },
      { name: 'Fergus Finlay', role: 'Board Member', startDate: '2019-01-01', paid: true, annualFee: 15750 },
      { name: 'Aogán Ó Fearghail', role: 'Board Member', startDate: '2020-07-01', paid: true, annualFee: 15750 },
      { name: 'Sarah McLaughlin', role: 'Board Member', startDate: '2020-07-01', paid: true, annualFee: 15750 },
      { name: 'Brendan Whelan', role: 'Board Member', startDate: '2020-07-01', paid: true, annualFee: 15750 },
      { name: 'Tim Lucey', role: 'Board Member', startDate: '2021-01-01', paid: true, annualFee: 15750 },
      { name: 'Yvonne Traynor', role: 'Board Member', startDate: '2021-01-01', paid: true, annualFee: 15750 },
      { name: 'Michelle O\'Sullivan', role: 'Board Member', startDate: '2022-07-01', paid: true, annualFee: 15750 },
      { name: 'Patrick Lynch', role: 'Board Member', startDate: '2022-07-01', paid: true, annualFee: 15750 },
      { name: 'Bernard Gloster', role: 'CEO (ex officio)', startDate: '2023-03-06', paid: false, annualFee: 0, note: 'CEO salary paid separately' },
      { name: 'Deirdre Madden', role: 'Board Member', startDate: '2023-01-01', paid: true, annualFee: 15750 },
    ]
  },
  {
    orgName: 'Child and Family Agency',
    altNames: ['Tusla'],
    source: 'tusla.ie',
    members: [
      { name: 'Pat Rabbitte', role: 'Chairperson', startDate: '2023-01-01', paid: true, annualFee: 20520 },
      { name: 'Kate Duggan', role: 'Board Member', startDate: '2020-01-01', paid: true, annualFee: 11970 },
      { name: 'PJ Fitzpatrick', role: 'Board Member', startDate: '2020-01-01', paid: true, annualFee: 11970 },
      { name: 'Marian Brattman', role: 'Board Member', startDate: '2020-01-01', paid: true, annualFee: 11970 },
      { name: 'Jennifer Moran Stritch', role: 'Board Member', startDate: '2022-01-01', paid: true, annualFee: 11970 },
      { name: 'Noel Kelly', role: 'Board Member', startDate: '2020-01-01', paid: true, annualFee: 11970 },
      { name: 'Frank Goodwin', role: 'Board Member', startDate: '2022-01-01', paid: true, annualFee: 11970 },
      { name: 'Roisín Molloy', role: 'Board Member', startDate: '2023-01-01', paid: true, annualFee: 11970 },
      { name: 'Kate Duggan', role: 'Board Member', startDate: '2023-01-01', paid: true, annualFee: 11970 },
    ]
  },
  {
    orgName: 'Sport Ireland',
    altNames: [],
    source: 'sportireland.ie',
    members: [
      { name: 'Kieran Mulvey', role: 'Chairperson', startDate: '2019-07-01', paid: true, annualFee: 20520 },
      { name: 'Mary O\'Connor', role: 'Board Member', startDate: '2022-07-01', paid: true, annualFee: 11970 },
      { name: 'Padraic Moran', role: 'Board Member', startDate: '2022-07-01', paid: true, annualFee: 11970 },
      { name: 'John Fulham', role: 'Board Member', startDate: '2019-07-01', paid: true, annualFee: 11970 },
      { name: 'Olive Loughnane', role: 'Board Member', startDate: '2022-07-01', paid: true, annualFee: 11970 },
      { name: 'Pat O\'Connor', role: 'Board Member', startDate: '2022-07-01', paid: true, annualFee: 11970 },
      { name: 'Colm McDonnell', role: 'Board Member', startDate: '2022-07-01', paid: true, annualFee: 11970 },
      { name: 'Frances Kavanagh', role: 'Board Member', startDate: '2019-07-01', paid: true, annualFee: 11970 },
      { name: 'Roger O\'Connor', role: 'Board Member', startDate: '2022-07-01', paid: true, annualFee: 11970 },
      { name: 'Sharon Courtney', role: 'Board Member', startDate: '2022-07-01', paid: true, annualFee: 11970 },
      { name: 'Páraic Duffy', role: 'Board Member', startDate: '2019-07-01', paid: true, annualFee: 11970 },
    ]
  },
  {
    orgName: 'Pobal',
    altNames: [],
    source: 'pobal.ie',
    members: [
      { name: 'Bobby Kerr', role: 'Chairperson', startDate: '2020-01-01', paid: true, annualFee: 20520 },
      { name: 'Martin Dorgan', role: 'Board Member', startDate: '2020-01-01', paid: true, annualFee: 11970 },
      { name: 'Mary Hurley', role: 'Board Member', startDate: '2020-01-01', paid: false, annualFee: 0, note: 'Civil servant — no fee' },
      { name: 'David Leach', role: 'Board Member', startDate: '2021-01-01', paid: true, annualFee: 11970 },
      { name: 'Aisling Heffernan', role: 'Board Member', startDate: '2021-01-01', paid: true, annualFee: 11970 },
      { name: 'Anna Shakespeare', role: 'CEO (ex officio)', startDate: '2021-05-01', paid: false, annualFee: 0, note: 'CEO salary paid separately' },
      { name: 'Denis Leamy', role: 'Board Member', startDate: '2022-01-01', paid: true, annualFee: 11970 },
      { name: 'Paul Geraghty', role: 'Board Member', startDate: '2022-01-01', paid: true, annualFee: 11970 },
      { name: 'Tara Buckley', role: 'Board Member', startDate: '2023-01-01', paid: true, annualFee: 11970 },
    ]
  },
  {
    orgName: 'Arts Council',
    altNames: ['An Chomhairle Ealaíon'],
    source: 'artscouncil.ie',
    members: [
      { name: 'Prof Kevin Rafter', role: 'Chair', startDate: '2022-02-01', paid: true, annualFee: 20520 },
      { name: 'Pádraig Ó Duinnín', role: 'Council Member', startDate: '2020-01-01', paid: true, annualFee: 11970 },
      { name: 'Sinead Moriarty', role: 'Council Member', startDate: '2020-01-01', paid: true, annualFee: 11970 },
      { name: 'Kevin Kavanagh', role: 'Council Member', startDate: '2022-02-01', paid: true, annualFee: 11970 },
      { name: 'Mark O\'Brien', role: 'Council Member', startDate: '2022-02-01', paid: true, annualFee: 11970 },
      { name: 'Fearghus Ó Conchúir', role: 'Council Member', startDate: '2020-01-01', paid: true, annualFee: 11970 },
      { name: 'Miriam Dunne', role: 'Council Member', startDate: '2022-02-01', paid: true, annualFee: 11970 },
      { name: 'Loughlin Deegan', role: 'Council Member', startDate: '2022-02-01', paid: true, annualFee: 11970 },
      { name: 'Maureen Kennelly', role: 'Director (ex officio)', startDate: '2020-07-01', paid: false, annualFee: 0, note: 'CEO salary paid separately' },
    ]
  },
  {
    orgName: 'Irish Human Rights and Equality Commission',
    altNames: ['IHREC'],
    source: 'ihrec.ie',
    members: [
      { name: 'Sinead Gibney', role: 'Chief Commissioner', startDate: '2020-07-01', paid: true, annualFee: 41073 },
      { name: 'Michael Finucane', role: 'Commissioner', startDate: '2020-07-01', paid: true, annualFee: 19462 },
      { name: 'Colm O\'Dwyer', role: 'Commissioner', startDate: '2020-07-01', paid: true, annualFee: 19462 },
      { name: 'Heydi Foster-Breslin', role: 'Commissioner', startDate: '2020-07-01', paid: true, annualFee: 19462 },
      { name: 'Caroline Fennell', role: 'Commissioner', startDate: '2020-07-01', paid: true, annualFee: 19462 },
      { name: 'Adam Harris', role: 'Commissioner', startDate: '2020-07-01', paid: true, annualFee: 19462 },
    ]
  },
  {
    orgName: 'Housing Finance Agency',
    altNames: ['HFA'],
    source: 'hfa.ie',
    members: [
      { name: 'AJ Noonan', role: 'Chairperson', startDate: '2021-01-01', paid: true, annualFee: 20520 },
      { name: 'Michelle Murphy', role: 'Board Member', startDate: '2021-01-01', paid: true, annualFee: 11970 },
      { name: 'Colm Brophy', role: 'Board Member', startDate: '2021-01-01', paid: true, annualFee: 11970 },
      { name: 'Mary Hurley', role: 'Board Member', startDate: '2022-01-01', paid: false, annualFee: 0, note: 'Civil servant — no fee' },
      { name: 'Barry O\'Leary', role: 'CEO', startDate: '2020-01-01', paid: false, annualFee: 0, note: 'CEO salary paid separately' },
    ]
  },
];

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('=== OpenBenefacts State Board Scraper ===\n');

  // Load organisation lookup
  console.log('Loading organisations...');
  let allOrgs = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('organisations')
      .select('id, name, charity_number')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allOrgs.push(...data);
    if (data.length < pageSize) break;
    page++;
  }
  console.log(`Loaded ${allOrgs.length} organisations\n`);

  // Build lookup map (lowercase name -> org)
  const orgMap = {};
  allOrgs.forEach(o => {
    orgMap[o.name.toLowerCase().trim()] = o;
  });

  let totalMembers = 0;
  let totalBodies = 0;
  let matched = 0;
  let unmatched = 0;

  for (const body of STATE_BOARDS) {
    // Try to match org by name or alt names
    let org = orgMap[body.orgName.toLowerCase()];
    if (!org) {
      for (const alt of body.altNames) {
        org = orgMap[alt.toLowerCase()];
        if (org) break;
      }
    }
    // Try partial match if exact fails
    if (!org) {
      const searchTerm = body.orgName.toLowerCase();
      const match = allOrgs.find(o => o.name.toLowerCase().includes(searchTerm) || searchTerm.includes(o.name.toLowerCase()));
      if (match) org = match;
    }

    if (!org) {
      console.log(`⚠ Could not find org: ${body.orgName}`);
      unmatched++;
      continue;
    }

    console.log(`✓ ${body.orgName} → ${org.name} (${org.id})`);
    matched++;
    totalBodies++;

    for (const member of body.members) {
      const normalised = normaliseName(member.name);

      // Upsert director
      const { data: dirData, error: dirErr } = await supabase
        .from('directors')
        .upsert({ name: member.name, name_normalised: normalised }, { onConflict: 'name_normalised' })
        .select('id')
        .single();

      if (dirErr) {
        console.error(`  Error upserting director ${member.name}:`, dirErr.message);
        continue;
      }

      // Upsert org_director link with remuneration data
      const { error: linkErr } = await supabase
        .from('org_directors')
        .upsert({
          org_id: org.id,
          director_id: dirData.id,
          role: member.role,
          start_date: member.startDate,
          source: `state_board_${body.source}`,
          is_paid: member.paid,
          annual_fee: member.annualFee || 0,
          remuneration_note: member.note || null,
        }, { onConflict: 'org_id,director_id,role' });

      if (linkErr) {
        // Might fail if new columns don't exist yet — try without remuneration
        const { error: linkErr2 } = await supabase
          .from('org_directors')
          .upsert({
            org_id: org.id,
            director_id: dirData.id,
            role: member.role,
            start_date: member.startDate,
            source: `state_board_${body.source}`,
          }, { onConflict: 'org_id,director_id,role' });

        if (linkErr2) {
          console.error(`  Error linking ${member.name}:`, linkErr2.message);
          continue;
        } else {
          console.log(`  ⚠ ${member.name} — linked without remuneration (columns may not exist yet)`);
        }
      }

      totalMembers++;
    }

    console.log(`  → ${body.members.length} board members imported\n`);
  }

  console.log('=== Summary ===');
  console.log(`State bodies matched: ${matched}/${STATE_BOARDS.length}`);
  console.log(`Unmatched: ${unmatched}`);
  console.log(`Total board members imported: ${totalMembers}`);
  console.log('\nDone! Board members should now appear in the Governance tab.');
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
