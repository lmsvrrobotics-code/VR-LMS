// Confirms the founder-meeting poster is where the home page expects it.
// Run:  node check-poster.mjs
import { existsSync, statSync } from 'node:fs';

const path = 'public/founder-meeting-poster.png';
if (!existsSync(path)) {
  console.log('MISSING  ' + path);
  console.log('Save the flyer to frontend/' + path + ' with that exact name.');
  process.exit(1);
}
const { size } = statSync(path);
console.log('FOUND    ' + path + '  (' + Math.round(size / 1024) + ' KB)');
if (size < 1024) console.log('WARNING: suspiciously small — is it a real image?');
