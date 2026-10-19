const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 1024;
const outPath = path.join(__dirname, '..', 'build', 'icon.png');

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const px = new Uint8Array(SIZE * SIZE * 4);

function setPx(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = a;
}

function fillRoundedRect(x0, y0, x1, y1, radius, r, g, b, a) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = x < x0 + radius ? x0 + radius - x : x >= x1 - radius ? x - (x1 - radius - 1) : 0;
      const dy = y < y0 + radius ? y0 + radius - y : y >= y1 - radius ? y - (y1 - radius - 1) : 0;
      if (dx * dx + dy * dy > radius * radius) continue;
      setPx(x, y, r, g, b, a);
    }
  }
}

const BG = [47, 107, 255];
const WHITE = [255, 255, 255];
const PAPER = [219, 228, 255];

fillRoundedRect(0, 0, SIZE, SIZE, 224, BG[0], BG[1], BG[2], 255);

fillRoundedRect(288, 168, 736, 384, 28, WHITE[0], WHITE[1], WHITE[2], 255);
fillRoundedRect(296, 176, 728, 376, 22, PAPER[0], PAPER[1], PAPER[2], 255);

fillRoundedRect(176, 352, 848, 688, 56, WHITE[0], WHITE[1], WHITE[2], 255);

fillRoundedRect(240, 432, 784, 480, 24, BG[0], BG[1], BG[2], 255);

fillRoundedRect(288, 592, 736, 840, 24, WHITE[0], WHITE[1], WHITE[2], 255);
fillRoundedRect(320, 624, 704, 648, 12, PAPER[0], PAPER[1], PAPER[2], 255);
fillRoundedRect(320, 672, 704, 696, 12, PAPER[0], PAPER[1], PAPER[2], 255);
fillRoundedRect(320, 720, 608, 744, 12, PAPER[0], PAPER[1], PAPER[2], 255);

const png = encodePng(SIZE, SIZE, Buffer.from(px));
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, png);
console.log(`icon written: ${outPath} (${png.length} bytes)`);
