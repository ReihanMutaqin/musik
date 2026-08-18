import fs from 'fs';

const html = fs.readFileSync('scratch/drive_raw.html', 'utf8');

// Extract all strings that look like Indonesian song names / bands
const regex = /\["([a-zA-Z0-9_-]{25,})",\["([^"\\]+)"/g;
let match;
const items = [];
const seen = new Set();

while ((match = regex.exec(html)) !== null) {
  const id = match[1];
  const name = match[2];
  if (!seen.has(name) && name.length > 2 && !name.startsWith('http')) {
    seen.add(name);
    items.push({ id, name });
  }
}

console.log('Total items found:', items.length);
console.log('List of items:');
items.forEach((it, i) => console.log(`${i + 1}. [${it.id}] ${it.name}`));
