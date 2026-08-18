const https = require('https');
const fs = require('fs');

const url = 'https://drive.google.com/drive/folders/1DZ2T0jqMutS1SBrzJTD6mDHhPD5NuEaS';

https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    fs.writeFileSync('scratch/drive_raw.html', data);
    console.log('Saved raw HTML, size:', data.length);

    // Look for JSON or file names
    const regex = /\["([a-zA-Z0-9_-]{20,})",\["([^"]+)"/g;
    let match;
    const items = [];
    while ((match = regex.exec(data)) !== null) {
      if (match[2] && !match[2].startsWith('http') && match[2].length > 2) {
        items.push({ id: match[1], name: match[2] });
      }
    }
    console.log('Matches found:', items.length);
    console.log(items.slice(0, 50));
  });
});
