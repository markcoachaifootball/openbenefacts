#!/usr/bin/env node
/**
 * Fix data quality issues in data.js
 * - Caps absurd income/expenditure values
 * - Recalculates stats
 *
 * Run: node fix_data.js
 */
const fs = require('fs');

const content = fs.readFileSync('src/data.js', 'utf8');
const jsonStart = content.indexOf('{');
const jsonEnd = content.lastIndexOf(';');
const data = JSON.parse(content.slice(jsonStart, jsonEnd));

console.log(`Loaded ${data.allOrgs.length} orgs, ${data.funders.length} funders`);

// HSE is ~€20B, so €50B is a safe cap for any single org
const MAX_INCOME = 50e9;
const MAX_EXPENDITURE = 50e9;

let fixed = 0;
let fixedOrgs = [];

data.allOrgs.forEach(o => {
  let wasFixed = false;
  const origInc = o.inc;

  // Fix income
  if ((o.inc || 0) > MAX_INCOME) {
    // Try to recover: if govInc + othInc etc are reasonable, use their sum
    const parts = (o.govInc || 0) + (o.pubInc || 0) + (o.donInc || 0) + (o.tradInc || 0) + (o.othInc || 0);
    if (parts > 0 && parts < MAX_INCOME) {
      o.inc = parts;
    } else if (o.exp > 0 && o.exp < MAX_INCOME) {
      // Use expenditure as proxy
      o.inc = o.exp;
    } else {
      o.inc = 0;
    }
    wasFixed = true;
  }

  // Fix expenditure
  if ((o.exp || 0) > MAX_EXPENDITURE) {
    if (o.inc > 0 && o.inc < MAX_EXPENDITURE) {
      o.exp = o.inc;
    } else {
      o.exp = 0;
    }
    wasFixed = true;
  }

  // Fix othInc (often the source of the corruption)
  if ((o.othInc || 0) > MAX_INCOME) {
    o.othInc = 0;
    wasFixed = true;
  }

  // Recalculate state funding percentage
  if (wasFixed && o.inc > 0 && o.govInc > 0) {
    o.sfp = Math.round(o.govInc / o.inc * 1000) / 10;
  }

  if (wasFixed) {
    fixed++;
    fixedOrgs.push({ name: o.n, origInc, newInc: o.inc, exp: o.exp });
  }
});

console.log(`\nFixed ${fixed} orgs with absurd values:`);
fixedOrgs.forEach(o => {
  console.log(`  ${o.name}: €${o.origInc.toLocaleString()} → €${o.newInc.toLocaleString()}`);
});

// Recalculate stats
const withFinancials = data.allOrgs.filter(o => o.inc > 0 && o.inc < MAX_INCOME).length;
data.stats.withFinancials = withFinancials;
data.stats.totalOrgs = data.allOrgs.length;

// Save
const header = `// OpenBenefacts - ${data.allOrgs.length.toLocaleString()} organizations, ${data.funders.length} funders\n// Data: 2022-2026 from 11 government sources + scrapers\nexport const DATA = `;
fs.writeFileSync('src/data.js', header + JSON.stringify(data) + ';\n');

const sizeMB = (fs.statSync('src/data.js').size / (1024 * 1024)).toFixed(1);
console.log(`\nSaved data.js: ${sizeMB} MB`);
console.log('Done! Now run: npx vercel --prod');
