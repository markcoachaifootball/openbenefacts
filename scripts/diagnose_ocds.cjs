#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");

const CSV = path.join(__dirname, "..", "data", "ocds", "procurement.csv");
const raw = fs.readFileSync(CSV, "utf8");

function parseLine(s) {
  const o = [];
  let c = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const k = s[i];
    if (q) {
      if (k === '"' && s[i + 1] === '"') { c += '"'; i++; }
      else if (k === '"') q = false;
      else c += k;
    } else {
      if (k === ',') { o.push(c); c = ""; }
      else if (k === '"') q = true;
      else c += k;
    }
  }
  o.push(c);
  return o;
}

const rows = raw.split(/\r?\n/);
const h = parseLine(rows[0]);
const idx = (n) => h.indexOf(n);
const iCpv = idx("Main Cpv Code");
const iTitle = idx("Tender/Contract Name");
const iVal = idx("Awarded Value (€)");
const iEst = idx("Notice Estimated Value (€)");
const iSup = idx("Awarded Suppliers");
const iBuy = idx("Contracting Authority");

const CPV = new Set([
  "55100000","55110000","55200000","55210000","55220000","55240000",
  "55250000","55270000","85311000","85311200","85311300","85312100",
  "98341000","98341100","98341120","98341130",
]);
const KW = /emergency accommodation|homeless|rough sleep|family hub|hotel accommodation|bed and breakfast|b&b|hostel|refuge|sheltered accommodation/i;

const matches = [];
for (let i = 1; i < rows.length; i++) {
  if (!rows[i]) continue;
  const c = parseLine(rows[i]);
  const cpv = (c[iCpv] || "").slice(0, 8);
  const name = c[iTitle] || "";
  if (!CPV.has(cpv) && !KW.test(name)) continue;
  const vRaw = c[iVal] || "";
  const eRaw = c[iEst] || "";
  const v = parseFloat(vRaw.replace(/[^0-9.]/g, "")) || 0;
  matches.push({
    v,
    vRaw: vRaw.slice(0, 30),
    eRaw: eRaw.slice(0, 30),
    cpv,
    name: name.slice(0, 80),
    supplier: (c[iSup] || "").slice(0, 60),
    buyer: (c[iBuy] || "").slice(0, 50),
  });
}
matches.sort((a, b) => b.v - a.v);

console.log("Total matches:", matches.length);
console.log("\nTop 20 by awarded value:\n");
matches.slice(0, 20).forEach((m, i) => {
  console.log(`${i + 1}. €${m.v.toLocaleString()} (raw="${m.vRaw}" est="${m.eRaw}")`);
  console.log(`   CPV=${m.cpv} | ${m.buyer}`);
  console.log(`   ${m.name}`);
  console.log(`   → ${m.supplier}\n`);
});

// Count how many are NOT emergency-accommodation related
const nonEmergency = matches.filter(m => {
  const t = m.name.toLowerCase();
  return /children|child|tusla|disability|residential care|nursing|older person/i.test(t)
    && !/homeless|emergency accommodation/i.test(t);
});
console.log(`\nNon-emergency (children/disability/nursing/care): ${nonEmergency.length} of ${matches.length}`);
console.log("These should probably be excluded.\n");
