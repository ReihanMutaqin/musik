import fs from 'fs';

const html = fs.readFileSync('scratch/drive_raw.html', 'utf8');

// Match aria-label and ssk
const folderRegex = /aria-label="([^"]+?)(?:\s+Shared folder|\s+Google Drive)?"\s+data-handled-by-drag-and-drop="true"\s+ssk='[^:]+:[^:]+:([^'-]+)/g;

const songs = [];
let match;
while ((match = folderRegex.exec(html)) !== null) {
  const songName = match[1].replace(/\s+Shared folder$/i, '').trim();
  const folderId = match[2];
  songs.push({ title: songName, folderId });
}

console.log('Songs with Folder IDs:');
songs.forEach((s, idx) => console.log(`${idx + 1}. [${s.folderId}] ${s.title}`));
