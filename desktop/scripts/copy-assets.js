const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src', 'renderer');
const outDir = path.join(__dirname, '..', 'dist', 'renderer');
const assets = ['print.html', 'settings.html', 'style.css'];

fs.mkdirSync(outDir, { recursive: true });
for (const file of assets) {
  fs.copyFileSync(path.join(srcDir, file), path.join(outDir, file));
}
console.log(`copied ${assets.length} renderer assets to dist/renderer`);
