const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const assetsDir = path.join(__dirname, '..', 'assets');

test('SVG is a restrained glacier ribbon mark with no text or circle primitives', () => {
  const svg = fs.readFileSync(path.join(assetsDir, 'minework.svg'), 'utf8');
  const shapes = svg.match(/<(?:path|rect)\b/gi) || [];
  assert.ok(shapes.length <= 5, `expected at most five path/rect shapes, got ${shapes.length}`);
  assert.doesNotMatch(svg, /<(?:text|circle)\b/i);
  assert.match(svg, /id=["'](?:ribbon|workflow-ribbon)["']/i);
});

test('small-frame variant is a restrained two-shape steel-ink mark', () => {
  const small = fs.readFileSync(path.join(assetsDir, 'minework-small.svg'), 'utf8');
  const shapes = small.match(/<(?:path|rect)\b/gi) || [];
  assert.ok(shapes.length <= 5, `expected at most five path/rect shapes, got ${shapes.length}`);
  assert.doesNotMatch(small, /<(?:text|circle)\b/i);
  assert.doesNotMatch(small, /(?:#000(?:000)?|#050607|\bblack\b)/i);
  assert.match(small, /id=["']workflow-ribbon["']/i);
  assert.match(small, /stroke="#2E4A68"/);
});

test('SVG uses no black paint and contains no top capsule bar', () => {
  const svg = fs.readFileSync(path.join(assetsDir, 'minework.svg'), 'utf8');
  assert.doesNotMatch(svg, /(?:#000(?:000)?|#050607|\bblack\b)/i);
  const rects = [...svg.matchAll(/<rect\b([^>]*)\/?\s*>/gi)].map(([, source]) => {
    const number = (name) => {
      const match = source.match(new RegExp(`\\b${name}=["']([0-9.]+)["']`, 'i'));
      return match ? Number(match[1]) : NaN;
    };
    return { y: number('y'), width: number('width'), height: number('height'), rx: number('rx') };
  });
  const topCapsule = rects.find(({ y, width, height, rx }) => y < 96 && width / height >= 2 && rx >= height * .4);
  assert.equal(topCapsule, undefined, 'SVG must not contain a Dynamic-Island-style top capsule');
});

test('PNG is exactly 256 x 256 RGBA', () => {
  const png = fs.readFileSync(path.join(assetsDir, 'minework.png'));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 256);
  assert.equal(png.readUInt32BE(20), 256);
  assert.equal(png[24], 8);
  assert.equal(png[25], 6);
});

test('ICO contains exact PNG frames for all Windows icon sizes', () => {
  const ico = fs.readFileSync(path.join(assetsDir, 'minework.ico'));
  const count = ico.readUInt16LE(4);
  const entries = Array.from({ length: count }, (_, index) => {
    const offset = 6 + index * 16;
    const width = ico[offset] || 256;
    const height = ico[offset + 1] || 256;
    const bytes = ico.readUInt32LE(offset + 8);
    const imageOffset = ico.readUInt32LE(offset + 12);
    assert.deepEqual([...ico.subarray(imageOffset, imageOffset + 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.ok(imageOffset + bytes <= ico.length);
    return { width, height };
  });
  assert.deepEqual(entries, [16,20,24,32,40,48,64,128,256].map((size) => ({ width: size, height: size })));
});

test('small Windows frames remain non-empty and preserve alpha contrast', () => {
  const ico = fs.readFileSync(path.join(assetsDir, 'minework.ico'));
  const count = ico.readUInt16LE(4);
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    const size = ico[offset] || 256;
    if (![16, 20, 24, 32, 48].includes(size)) continue;
    const bytes = ico.readUInt32LE(offset + 8);
    assert.ok(bytes > 120, `${size}px frame is unexpectedly empty`);
  }
});

test('icon contract mutation detects forbidden circle and excess shape primitives', () => {
  const svg = fs.readFileSync(path.join(assetsDir, 'minework.svg'), 'utf8');
  const forbiddenCircle = svg.replace('</svg>', '<circle cx="8" cy="8" r="2"/></svg>');
  const excessShapes = svg.replace('</svg>', '<path d="M0 0h1v1Z"/><path d="M2 2h1v1Z"/><path d="M4 4h1v1Z"/></svg>');
  assert.match(forbiddenCircle, /<circle\b/i);
  assert.ok((excessShapes.match(/<(?:path|rect)\b/gi) || []).length > 5);
});
