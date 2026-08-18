import fs from 'fs';

const html = fs.readFileSync('scratch/drive_raw.html', 'utf8');

// Match aria-label="... Shared folder" or aria-label="..."
const folderRegex = /aria-label="([^"]+?)(?:\s+Shared folder|\s+Google Drive)?"\s+data-handled-by-drag-and-drop="true"\s+ssk='[^:]+:[^:]+:([^'-]+)/g;

const songs = [];
let match;
while ((match = folderRegex.exec(html)) !== null) {
  const songName = match[1].replace(/\s+Shared folder$/i, '').trim();
  const folderId = match[2];
  songs.push({ title: songName, folderId });
}

// Fallback search with generic regex
if (songs.length === 0) {
  const generic = /aria-label="([^"]+?)\s+Shared folder"/g;
  while ((match = generic.exec(html)) !== null) {
    songs.push({ title: match[1].trim() });
  }
}

console.log(`Total Indonesian Songs in Drive Folder: ${songs.length}`);
songs.forEach((s, idx) => console.log(`${idx + 1}. ${s.title}`));
