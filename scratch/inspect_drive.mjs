import https from 'https';
import fs from 'fs';

const url = 'https://drive.google.com/drive/folders/1DZ2T0jqMutS1SBrzJTD6mDHhPD5NuEaS';

https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    fs.writeFileSync('scratch/drive_raw.html', data);
    console.log('Saved raw HTML, size:', data.length);

    // Let's search for patterns in the HTML
    const lines = data.split('\n');
    for (const line of lines) {
      if (line.includes('AF_initDataCallback') || line.includes('_DRIVE_')) {
        // Look for song names
        const matches = [...line.matchAll(/"([^"]+\.(?:zip|rar|sng|chart|mid|mp3|ogg))"/gi)];
        if (matches.length > 0) {
          console.log('File matches:', matches.map(m => m[1]));
        }
      }
    }
  });
});
