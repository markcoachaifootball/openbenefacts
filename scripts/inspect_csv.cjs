#!/usr/bin/env node
/**
 * Quick diagnostic: shows the first 10 rows of the SCEP 2023 CSV
 * to understand the actual column structure and data format.
 */
const fs = require("fs");
const path = require("path");

const csvPath = path.join(__dirname, "..", "data", "oscar", "scep_2023_applications.csv");

if (!fs.existsSync(csvPath)) {
  console.log("CSV not found at:", csvPath);
  process.exit(1);
}

const text = fs.readFileSync(csvPath, "utf8");
const lines = text.split("\n");

console.log(`Total lines: ${lines.length}`);
console.log(`File size: ${(text.length / 1024).toFixed(0)} KB`);
console.log(`\n${"=".repeat(80)}`);
console.log("FIRST 15 LINES (raw):");
console.log("=".repeat(80));

for (let i = 0; i < Math.min(15, lines.length); i++) {
  console.log(`Line ${i}: ${lines[i].substring(0, 200)}`);
}

// Also parse and show structured
console.log(`\n${"=".repeat(80)}`);
console.log("PARSED HEADER + FIRST 5 ROWS:");
console.log("=".repeat(80));

function parseCSVLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) { values.push(current); current = ""; continue; }
    current += ch;
  }
  values.push(current);
  return values;
}

const headers = parseCSVLine(lines[0]);
console.log(`\nHeaders (${headers.length} columns):`);
headers.forEach((h, i) => console.log(`  [${i}] "${h.trim()}"`));

for (let r = 1; r <= Math.min(5, lines.length - 1); r++) {
  if (!lines[r]?.trim()) continue;
  const vals = parseCSVLine(lines[r]);
  console.log(`\nRow ${r}:`);
  headers.forEach((h, i) => {
    const val = (vals[i] || "").trim();
    if (val) console.log(`  ${h.trim()} = "${val}"`);
  });
}

// Check how many rows have values in each column
console.log(`\n${"=".repeat(80)}`);
console.log("COLUMN FILL RATES (first 100 rows):");
console.log("=".repeat(80));
const fillCounts = headers.map(() => 0);
const sampleRows = Math.min(100, lines.length - 1);
for (let r = 1; r <= sampleRows; r++) {
  if (!lines[r]?.trim()) continue;
  const vals = parseCSVLine(lines[r]);
  vals.forEach((v, i) => { if (v && v.trim()) fillCounts[i]++; });
}
headers.forEach((h, i) => {
  console.log(`  ${h.trim().padEnd(30)} ${fillCounts[i]}/${sampleRows} (${Math.round(100 * fillCounts[i] / sampleRows)}%)`);
});
