const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');

function loadSharp() {
  try { return require('sharp'); } catch (error) {
    const bundled = process.env.MINEWORK_BUNDLED_NODE_MODULES;
    if (!bundled) throw error;
    return createRequire(path.join(bundled, 'minework-icon-runtime.cjs'))('sharp');
  }
}

const sharp = loadSharp();

const assetsDir = path.join(__dirname, '..', 'assets');
const sourcePath = path.join(assetsDir, 'minework.svg');
const outputArg = process.argv.indexOf('--output-dir');
const outputDir = outputArg >= 0 && process.argv[outputArg + 1] ? path.resolve(process.argv[outputArg + 1]) : assetsDir;
const pngPath = path.join(outputDir, 'minework.png');
const icoPath = path.join(outputDir, 'minework.ico');
const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];

async function renderPng(svg, size) {
  return sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

function buildIco(frames) {
  const headerSize = 6;
  const entrySize = 16;
  const dataOffset = headerSize + frames.length * entrySize;
  const header = Buffer.alloc(dataOffset);

  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  let cursor = dataOffset;
  frames.forEach(({ size, png }, index) => {
    const offset = headerSize + index * entrySize;
    header[offset] = size === 256 ? 0 : size;
    header[offset + 1] = size === 256 ? 0 : size;
    header[offset + 2] = 0;
    header[offset + 3] = 0;
    header.writeUInt16LE(1, offset + 4);
    header.writeUInt16LE(32, offset + 6);
    header.writeUInt32LE(png.length, offset + 8);
    header.writeUInt32LE(cursor, offset + 12);
    cursor += png.length;
  });

  return Buffer.concat([header, ...frames.map(({ png }) => png)]);
}

async function main() {
  const svg = await fs.readFile(sourcePath);
  await fs.mkdir(outputDir, { recursive: true });
  const frames = await Promise.all(
    sizes.map(async (size) => ({ size, png: await renderPng(svg, size) }))
  );

  const sourcePng = frames.find(({ size }) => size === 256).png;
  await Promise.all([
    fs.writeFile(pngPath, sourcePng),
    fs.writeFile(icoPath, buildIco(frames)),
  ]);

  process.stdout.write(`Generated minework.png and minework.ico (${sizes.join(', ')} px)\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
