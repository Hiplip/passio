/**
 * Renders the passio mark to every raster size the two surfaces need.
 *
 * Run with `pnpm icons` after changing the mark. The outputs are committed,
 * because neither bundler generates them and a missing extension icon is not a
 * build error - Chrome silently falls back to a grey puzzle piece.
 *
 * The geometry is duplicated from packages/ui/src/mark.tsx rather than
 * imported: this is a plain Node script with no JSX pipeline, and the two are
 * pinned together by icons.test.ts, which fails if they drift.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// sharp arrives as a transitive dependency of Next and is not declared here, so
// it is resolved from the workspace root rather than this script's folder.
const require = createRequire(join(root, "package.json"));
const sharp = require("sharp");

export const DIAL_SEGMENT =
  "M78 86.49A46 46 0 0 1 22 86.49L31.74 73.8A30 30 0 0 0 68.26 73.8Z";
export const DIAL_HUB = 12;

/**
 * The mark's shapes, with the colour on a group rather than the root.
 *
 * Putting the fill on the <svg> element meant that lifting the shapes out to
 * nest them inside another document dropped it, and the mark rendered black on
 * black - invisible, and not a build error.
 */
export function markShapes(colour) {
  const segments = [0, 90, 180, 270]
    .map((a) => `<path d="${DIAL_SEGMENT}" transform="rotate(${a} 50 50)"/>`)
    .join("");
  return (
    `<g fill="${colour}">` +
    segments +
    `<circle cx="50" cy="50" r="${DIAL_HUB}"/>` +
    `</g>`
  );
}

/** The mark as a standalone document, in one flat colour. */
export function markSvg(colour) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    markShapes(colour) +
    `</svg>`
  );
}

const INK = "#221f2b";
const PORCELAIN = "#fbfafc";

/**
 * A toolbar icon is drawn on browser chrome, which is dark in a dark theme and
 * light in a light one, and Chrome does not tell an extension which. Padding
 * the mark onto a filled ink disc makes it legible on both without a second
 * asset and without guessing.
 */
function toolbarSvg() {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<circle cx="50" cy="50" r="50" fill="${INK}"/>` +
    `<g transform="translate(50 50) scale(0.74) translate(-50 -50)">` +
    markShapes(PORCELAIN) +
    `</g>` +
    `</svg>`
  );
}

async function png(svg, size, out) {
  await mkdir(dirname(out), { recursive: true });
  const buffer = await sharp(Buffer.from(svg))
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(out, buffer);
  return buffer;
}

/**
 * An .ico wrapping a single PNG.
 *
 * The format allows a PNG payload rather than a bitmap, so this is a 22-byte
 * header and the file. Written by hand because sharp cannot emit .ico, and
 * /favicon.ico is still requested by browsers and link unfurlers that ignore
 * every modern declaration.
 */
async function ico(pngBuffer, size, out) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
  entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  await writeFile(out, Buffer.concat([header, entry, pngBuffer]));
}

async function main() {
  const toolbar = toolbarSvg();

  // The extension. Chrome picks the nearest size and downscales, so shipping
  // the exact ones it asks for avoids a blurry toolbar.
  for (const size of [16, 32, 48, 128]) {
    await png(toolbar, size, join(root, `apps/extension/public/icon/${size}.png`));
  }

  // The web app. icon.svg serves every modern browser; these cover the rest.
  const favicon = await png(toolbar, 32, join(root, "apps/web/public/icon-32.png"));
  await ico(favicon, 32, join(root, "apps/web/public/favicon.ico"));
  await png(toolbar, 180, join(root, "apps/web/src/app/apple-icon.png"));

  console.log("icons written");
}

await main();
