import fs from 'fs';

const html = fs.readFileSync('scratch/drive_raw.html', 'utf8');

// Look for Indonesian band names or song names in the whole HTML
const keywords = ['Peterpan', 'Noah', 'Dewa', 'Sheila', 'Ungu', 'Padi', 'Slank', 'Kotak', 'Jamrud', 'Gigi', 'J-Rocks', 'Vierratale', 'Armada', 'Last Child', 'Wali', 'Kangen', 'Vol'];
for (const kw of keywords) {
  const idx = html.toLowerCase().indexOf(kw.toLowerCase());
  if (idx !== -1) {
    console.log(`Found keyword "${kw}" at index ${idx}:`);
    console.log(html.slice(Math.max(0, idx - 100), idx + 200));
  }
}
