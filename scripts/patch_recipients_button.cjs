/**
 * Patches App.jsx to re-enable the "View Recipients" button
 * on the Funders page. Replaces the "coming soon" label with
 * a working button that navigates to the orgs page filtered
 * by funder grants.
 *
 * Run: node scripts/patch_recipients_button.cjs
 */

const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'src', 'App.jsx');
let content = fs.readFileSync(appPath, 'utf8');

// Find and replace the "coming soon" / Lock icon section
// The current code has something like:
//   <span className="... text-gray-400 ...">
//     <Lock className="w-3 h-3 mr-1" />
//     View Recipients — coming soon
//   </span>

// Pattern 1: Look for Lock icon with "coming soon" text
const comingSoonPatterns = [
  // Span with Lock icon and "coming soon"
  /<span[^>]*className[^>]*text-gray-400[^>]*>\s*<Lock[^/]*\/>\s*View Recipients[^<]*coming soon[^<]*<\/span>/g,
  // Button disabled with Lock icon
  /<(?:span|div|button)[^>]*>[^]*?<Lock[^/]*\/>[^]*?coming soon[^]*?<\/(?:span|div|button)>/g,
  // Simpler: any element containing "View Recipients" AND "coming soon"
  /(?:<[^>]+>[^]*?)?View Recipients[^]*?coming soon(?:[^]*?<\/[^>]+>)?/g,
];

let patched = false;

// Try each pattern
for (const pattern of comingSoonPatterns) {
  if (pattern.test(content)) {
    content = content.replace(pattern, (match) => {
      console.log('Found match:', match.substring(0, 80) + '...');
      return `<button
                            onClick={() => {
                              setInitialSearch(f.name.split('/')[0].trim());
                              setPage('orgs');
                            }}
                            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center"
                          >
                            View Recipients →
                          </button>`;
    });
    patched = true;
    break;
  }
}

if (!patched) {
  // Fallback: search more broadly for anything near "View Recipients"
  // and also check for a disabled button pattern
  const lines = content.split('\n');
  let startLine = -1;
  let endLine = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('View Recipients') || lines[i].includes('coming soon')) {
      // Find the containing element
      if (startLine === -1) startLine = i;
      endLine = i;
    }
  }

  if (startLine !== -1) {
    // Look backwards for the opening tag
    for (let i = startLine; i >= Math.max(0, startLine - 5); i--) {
      if (lines[i].includes('<span') || lines[i].includes('<div') || lines[i].includes('<button')) {
        startLine = i;
        break;
      }
    }
    // Look forwards for the closing tag
    for (let i = endLine; i <= Math.min(lines.length - 1, endLine + 5); i++) {
      if (lines[i].includes('</span>') || lines[i].includes('</div>') || lines[i].includes('</button>')) {
        endLine = i;
        break;
      }
    }

    console.log(`Found View Recipients block at lines ${startLine + 1}-${endLine + 1}`);
    console.log('Current code:');
    for (let i = startLine; i <= endLine; i++) {
      console.log(`  ${i + 1}: ${lines[i]}`);
    }

    // Get indentation from the start line
    const indent = lines[startLine].match(/^\s*/)[0];

    const replacement = `${indent}<button
${indent}  onClick={() => {
${indent}    setInitialSearch(f.name.split('/')[0].trim());
${indent}    setPage('orgs');
${indent}  }}
${indent}  className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center"
${indent}>
${indent}  View Recipients →
${indent}</button>`;

    lines.splice(startLine, endLine - startLine + 1, replacement);
    content = lines.join('\n');
    patched = true;
    console.log('Patched successfully using line-based approach!');
  }
}

if (!patched) {
  console.log('ERROR: Could not find "View Recipients" or "coming soon" in App.jsx');
  console.log('You may need to manually update the FundersPage component.');
  console.log('\nSearching for related strings...');
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    if (line.toLowerCase().includes('recipient') || line.toLowerCase().includes('lock')) {
      console.log(`  Line ${i + 1}: ${line.trim()}`);
    }
  });
  process.exit(1);
}

// Also make sure Lock is not the only icon import — check if we still need it
// If Lock was only used for "coming soon", we can remove it from imports
if (!content.includes('<Lock') && content.includes('Lock')) {
  // Remove Lock from import if no longer used
  content = content.replace(/,\s*Lock/g, '');
  content = content.replace(/Lock,\s*/g, '');
  console.log('Removed unused Lock import');
}

// Also ensure setInitialSearch and setPage are available in FundersPage
// Check if FundersPage accepts these props
if (!content.includes('setInitialSearch') && content.includes('FundersPage')) {
  console.log('\nWARNING: setInitialSearch may not be passed to FundersPage.');
  console.log('Make sure the FundersPage component receives setInitialSearch and setPage props.');
}

fs.writeFileSync(appPath, content);
console.log('\nApp.jsx patched! View Recipients button is now active.');
console.log('Run: npm run build && vercel --prod  (or your deploy command)');
