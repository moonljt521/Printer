const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const vendorDir = path.join(__dirname, '..', 'vendor', 'sumatra');
const destExe = path.join(vendorDir, 'SumatraPDF.exe');

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'BatchPrinter-build' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          res.resume();
          resolve(fetchJson(res.headers.location));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve(JSON.parse(data)));
      })
      .on('error', reject);
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'BatchPrinter-build' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          res.resume();
          resolve(download(res.headers.location, dest));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
      })
      .on('error', reject);
  });
}

async function main() {
  if (process.argv.includes('--if-missing') && fs.existsSync(destExe)) {
    console.log(`SumatraPDF already vendored: ${destExe}`);
    return;
  }
  fs.mkdirSync(vendorDir, { recursive: true });

  const release = await fetchJson('https://api.github.com/repos/sumatrapdfreader/sumatrapdf/releases/latest');
  const asset =
    (release.assets || []).find((a) => /-64\.zip$/.test(a.name || '')) || (release.assets || [])[0];
  if (!asset || !asset.browser_download_url) throw new Error('no downloadable asset found');
  console.log(`downloading ${asset.name} ...`);

  const zipPath = path.join(vendorDir, 'sumatra.zip');
  await download(asset.browser_download_url, zipPath);

  const extractDir = path.join(vendorDir, 'extract');
  fs.rmSync(extractDir, { recursive: true, force: true });
  if (process.platform === 'win32') {
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${extractDir}" -Force`,
    ]);
  } else {
    execFileSync('unzip', ['-o', zipPath, '-d', extractDir]);
  }

  const found = findExe(extractDir);
  if (!found) throw new Error('SumatraPDF.exe not found in archive');
  fs.copyFileSync(found, destExe);
  fs.rmSync(zipPath, { force: true });
  fs.rmSync(extractDir, { recursive: true, force: true });
  console.log(`vendored: ${destExe}`);
}

function findExe(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findExe(full);
      if (nested) return nested;
    } else if (entry.name.toLowerCase() === 'sumatrapdf.exe') {
      return full;
    }
  }
  return undefined;
}

main().catch((err) => {
  console.error(`fetch-sumatra failed: ${err.message}`);
  process.exit(1);
});
