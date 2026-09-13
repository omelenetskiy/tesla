// Builds the dashboard's shipped assets:
//
//  1. MapLibre's tile worker, copied out of node_modules into public/maplibre/ — see
//     vendorMaplibreWorker() below for why a copy is load-bearing rather than tidy.
//  2. The vehicle render: the source art in assets/source, cropped to its alpha bounding
//     box and re-encoded as transparent WebP at two device-independent widths.
//  3. The app icons: the same art as a square tile, at every size a browser, a launcher or
//     an iPhone home screen asks for — including the .ico that backs the tab.
//
// The image source is a 2752x1536 RGBA PNG at ~2.4 MB. The dashboard is meant to be read in
// the car over the vehicle's own cellular connection, where that is a visible cost, so the
// shipped asset is a transparent WebP at two device-independent widths and the
// transparent margin is cropped away: 2752x1536 -> 2533x1346 of content -> 18.2 KB + 34.7 KB,
// which is what the car's network actually pays.
//
// The bounding box is computed from the alpha channel rather than sharp's trim(): trim()
// compares against a corner *pixel*, and on a fully transparent corner the threshold
// comparison is against rgba(0,0,0,0), which can eat into soft shadow edges.
//
// Run: node scripts/build-assets.mjs [--vendor-only]

import sharp from 'sharp'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
/**
 * The vehicle illustration is the source of truth for the card art. `model-y-render.png`
 * is the earlier photographic render, kept so the choice can be revisited; point
 * `input` back at it to ship that one instead.
 */
const SOURCES = [{ input: 'assets/source/model-y-illustration.png', out: 'public/vehicle/model-y' }]

/**
 * MapLibre's tile worker, vendored.
 *
 * The library resolves the worker relative to `import.meta.url` of its own module, and a
 * bundler rewrites that to the emitted chunk's path — where the file does not exist. The
 * worker then never starts, and because tiles and glyphs are fetched from inside it, the
 * only visible symptom is a map painted in its background colour. Serving the real files
 * from `public/` and naming the URL in components/map/vehicle-map.tsx is the fix; they are
 * copied rather than imported so the URL is stable in dev and in a production build alike.
 *
 * `maplibre-gl-shared.mjs` comes along because the worker imports it by relative path.
 */
const VENDOR_DIR = 'public/maplibre'
const VENDOR_FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']

/** Widths to emit. The card renders at ~320-460 CSS px, so 640 covers 1x and 1280 the 2x case. */
const WIDTHS = [640, 1280]
const ALPHA_THRESHOLD = 6
/** Anything at or above this is treated as carrying its own colour rather than a blend. */
const OPAQUE = 250

/* ── App icons ───────────────────────────────────────────────────────────── */

const ICON_DIR = 'public/icons'
/** Next serves `app/favicon.ico` at `/favicon.ico`, which the proxy matcher already exempts. */
const FAVICON_FILE = 'app/favicon.ico'
const ICO_SIZES = [16, 32, 48]
/** Tile gradient — the app's own dark palette, so the icon is the product at rest. */
const TILE_TOP = '#1c2836'
const TILE_BOTTOM = '#0b0f16'
/** Front end of the car, as a fraction of its trimmed width. See iconTile(). */
const ICON_CROP = 0.58
/** Motif size inside a tile that a launcher will mask: leaves room for the squircle. */
const ICON_FILL = 0.88
/** A tab icon is not masked and is 16-32 real pixels, so it can bleed closer to the edge. */
const FAVICON_FILL = 0.96
/** Maskable art is cropped by the launcher, not padded: the motif must fit the safe circle. */
const MASKABLE_FILL = 0.62

async function alphaBounds(image) {
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, channels } = info
  let min = -1
  let max = -1
  let top = -1
  let bottom = -1
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width * channels + x * channels + 3] <= ALPHA_THRESHOLD) continue
      if (min === -1 || x < min) min = x
      if (max === -1 || x > max) max = x
      if (top === -1 || y < top) top = y
      if (y > bottom) bottom = y
    }
  }
  if (min === -1) throw new Error('source is fully transparent')
  return { left: min, top, right: max, bottom }
}

/**
 * Colour decontamination — "defringing".
 *
 * The illustration was cut out of a white background by a tool that left the removed colour
 * sitting in the semi-transparent edge pixels: their alpha says "mostly background", their RGB
 * still says "white". On a light card that is invisible. On the dark one the browser
 * composites them against `#161d27` and the car arrives wearing a bright outline — measured on
 * the shipped asset at mean luminance 243 across the 9k outermost pixels and 218 across the
 * next 5k, against a body that averages 85.
 *
 * So each partially transparent pixel is repainted with the colour of the opaque pixels it is a
 * blend *of*. Walking outward from the opaque boundary in wave order is what makes "nearest"
 * exact: blind dilation passes let a pixel adopt the colour of a neighbour that has not been
 * fixed yet, and the white creeps along the silhouette instead of leaving it. Averaging the
 * boundary colours rather than picking one keeps a pixel that straddles the grey body and a
 * black wheel arch from resolving to either.
 *
 * Fully transparent pixels are left alone — no compositor ever looks at their colour.
 */
function defringe(rgba, width, height) {
  const pixels = width * height
  const alpha = new Uint8Array(pixels)
  for (let i = 0; i < pixels; i++) alpha[i] = rgba[i * 4 + 3]

  const NEIGHBOURS = [-1, 1, -width, width, -width - 1, -width + 1, width - 1, width + 1]
  const fixed = new Uint8Array(pixels)
  const queue = new Int32Array(pixels)
  let head = 0
  let tail = 0

  const boundaryColours = (i) => {
    const x = i % width
    let n = 0
    let r = 0
    let g = 0
    let b = 0
    for (const d of NEIGHBOURS) {
      const j = i + d
      // Wrapping a row edge would reach across the image and blend in an unrelated colour.
      if (j < 0 || j >= pixels || Math.abs((j % width) - x) > 1) continue
      if (alpha[j] < OPAQUE) continue
      n++
      r += rgba[j * 4]
      g += rgba[j * 4 + 1]
      b += rgba[j * 4 + 2]
    }
    return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : null
  }

  for (let i = 0; i < pixels; i++) {
    if (alpha[i] === 0 || alpha[i] >= OPAQUE) continue
    const colour = boundaryColours(i)
    if (!colour) continue
    rgba[i * 4] = colour[0]
    rgba[i * 4 + 1] = colour[1]
    rgba[i * 4 + 2] = colour[2]
    fixed[i] = 1
    queue[tail++] = i
  }

  // Each wave front carries the colour of the boundary it grew from, so a pixel two steps off
  // the silhouette gets the colour two steps into the art rather than the average of the frame.
  while (head < tail) {
    const i = queue[head++]
    const x = i % width
    for (const d of NEIGHBOURS) {
      const j = i + d
      if (j < 0 || j >= pixels || Math.abs((j % width) - x) > 1) continue
      if (fixed[j] || alpha[j] === 0 || alpha[j] >= OPAQUE) continue
      rgba[j * 4] = rgba[i * 4]
      rgba[j * 4 + 1] = rgba[i * 4 + 1]
      rgba[j * 4 + 2] = rgba[i * 4 + 2]
      fixed[j] = 1
      queue[tail++] = j
    }
  }
  return { repainted: tail }
}

/**
 * Copies MapLibre's worker into `public/maplibre/`, skipping files that are already
 * byte-identical. Cheap enough to run before every `next dev` / `next build`, which is
 * what keeps it in step with the installed version.
 */
async function vendorMaplibreWorker() {
  const require = createRequire(import.meta.url)
  // Resolving the worker itself rather than the package root: it fails here, with a
  // readable error, instead of halfway through a copy loop.
  const dist = dirname(require.resolve('maplibre-gl/dist/maplibre-gl-worker.mjs'))
  await mkdir(join(ROOT, VENDOR_DIR), { recursive: true })
  for (const file of VENDOR_FILES) {
    const from = join(dist, file)
    const to = join(ROOT, VENDOR_DIR, file)
    const [source, shipped] = await Promise.all([readFile(from), readFile(to).catch(() => null)])
    if (shipped && source.equals(shipped)) {
      console.log(`${VENDOR_DIR}/${file}: up to date (${(source.length / 1024).toFixed(1)} KB)`)
      continue
    }
    await copyFile(from, to)
    console.log(`${VENDOR_DIR}/${file}: ${shipped ? 'refreshed' : 'created'} (${(source.length / 1024).toFixed(1)} KB)`)
  }
}

/**
 * The car, cropped to its content and decontaminated, as an in-memory PNG.
 *
 * Every shipped raster — the card art at two widths and the whole icon set — is cut from
 * this one buffer, so the tab icon and the card can never disagree about which illustration
 * the app uses.
 */
async function buildCarArt() {
  const { input } = SOURCES[0]
  const source = join(ROOT, input)
  const meta = await sharp(source).metadata()
  const box = await alphaBounds(sharp(source))
  // A little air keeps the wheels off the crop edge at any scale.
  const pad = Math.round(Math.max(box.right - box.left, box.bottom - box.top) * 0.02)
  const crop = {
    left: Math.max(0, box.left - pad),
    top: Math.max(0, box.top - pad),
    width: Math.min(meta.width, box.right + pad + 1) - Math.max(0, box.left - pad),
    height: Math.min(meta.height, box.bottom + pad + 1) - Math.max(0, box.top - pad),
  }
  crop.width = Math.min(crop.width, meta.width - crop.left)
  crop.height = Math.min(crop.height, meta.height - crop.top)

  // Decontaminate once, at source resolution, and let every resize carry the clean edges:
  // sharp resizes premultiplied, so a pixel whose colour is right at the boundary stays
  // right at every scale below it. Doing it after the resize would fix a narrower band of
  // pixels but leave the source as an art file that cannot be re-cropped safely.
  const raw = await sharp(source).extract(crop).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { repainted } = defringe(raw.data, raw.info.width, raw.info.height)
  const buffer = await sharp(raw.data, { raw: { width: raw.info.width, height: raw.info.height, channels: 4 } })
    .png()
    .toBuffer()
  console.log(`${input}: ${meta.width}x${meta.height} -> content ${raw.info.width}x${raw.info.height}, defringed ${repainted} semi-transparent pixels`)
  return { buffer, width: raw.info.width, height: raw.info.height }
}

async function emitVehicleRenders(art) {
  const out = SOURCES[0].out
  await mkdir(join(ROOT, dirname(out)), { recursive: true })
  for (const width of WIDTHS) {
    const file = width === WIDTHS[0] ? `${out}.webp` : `${out}@2x.webp`
    const info = await sharp(art.buffer)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: width >= 1024 ? 78 : 82, effort: 6 })
      .toFile(join(ROOT, file))
    console.log(`  ${file}  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(1)} KB`)
  }
}

/**
 * A square app tile: the front of the car on a gradient.
 *
 * The whole silhouette is 2.17:1, so in a square it is a 25pt sliver on an iPhone home
 * screen — unreadable at the size it is actually rendered. Cutting to the front end (nose,
 * lamp, badge, front wheel) lets the motif fill the tile, and it still reads as this car at
 * 32px, which the full side profile does not.
 *
 * The motif stops at 88% of the tile because iOS masks the result into a squircle and
 * Android into a circle: art that touches the edge gets its bumper and wheel shorn off.
 */
async function iconTile({ size, art, fill, cropWidth }) {
  const width = Math.round(art.width * cropWidth)
  const motif = await sharp(art.buffer)
    .extract({ left: 0, top: 0, width, height: art.height })
    .resize({ width: Math.round(size * fill), height: Math.round(size * fill), fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer()
  // A gradient rather than a flat fill: a home-screen tile next to a light wallpaper needs
  // some internal contrast to read as an object rather than a swatch of colour.
  const background = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${TILE_TOP}"/><stop offset="1" stop-color="${TILE_BOTTOM}"/>` +
      `</linearGradient></defs><rect width="${size}" height="${size}" fill="url(#g)"/></svg>`,
  )
  return sharp({ create: { width: size, height: size, channels: 4, background: TILE_BOTTOM } })
    .composite([{ input: background, left: 0, top: 0 }, { input: motif, gravity: 'centre' }])
    // Opaque, always: iOS fills the transparent parts of a home-screen icon with black, and
    // a maskable icon is clipped by a launcher that assumes it can crop anywhere.
    .flatten({ background: TILE_BOTTOM })
    .png()
    .toBuffer()
}

/**
 * A Windows-style .ico holding PNG-compressed frames.
 *
 * The libvips in this project's sharp build was compiled without ICO support, and the
 * container is 6 bytes of header plus a 16-byte directory entry per frame — smaller to write
 * than to work around. Browsers since IE9 and every current engine read the PNG form, which
 * also keeps the file down where a 32bpp BMP frame would not.
 */
function encodeIco(frames) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // resource type: icon
  header.writeUInt16LE(frames.length, 4)
  const directory = Buffer.alloc(16 * frames.length)
  let offset = header.length + directory.length
  frames.forEach((frame, i) => {
    const at = i * 16
    // 256 is encoded as 0 in both the width and height byte; nothing here reaches that.
    directory.writeUInt8(frame.size % 256, at)
    directory.writeUInt8(frame.size % 256, at + 1)
    directory.writeUInt8(0, at + 2) // palette entries
    directory.writeUInt8(0, at + 3) // reserved
    directory.writeUInt16LE(1, at + 4) // colour planes
    directory.writeUInt16LE(32, at + 6) // bits per pixel
    directory.writeUInt32LE(frame.data.length, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += frame.data.length
  })
  return Buffer.concat([header, directory, ...frames.map((f) => f.data)])
}

async function buildIcons(art) {
  await mkdir(join(ROOT, ICON_DIR), { recursive: true })
  // The manifest asks for 192 and 512; the browser tab asks for 32; iOS asks for 180 and
  // ignores everything else. Each is emitted from the same tile so they cannot drift.
  const targets = [
    { file: `${ICON_DIR}/icon-32.png`, size: 32, fill: FAVICON_FILL },
    { file: `${ICON_DIR}/icon-192.png`, size: 192, fill: ICON_FILL },
    { file: `${ICON_DIR}/icon-512.png`, size: 512, fill: ICON_FILL },
    { file: `${ICON_DIR}/apple-touch-icon.png`, size: 180, fill: ICON_FILL },
    // Android masks this one to a circle and ignores any padding in the art, so the motif
    // has to be shrunk to the safe zone instead of relying on the tile's own margin.
    { file: `${ICON_DIR}/icon-maskable-512.png`, size: 512, fill: MASKABLE_FILL },
  ]
  for (const target of targets) {
    const data = await iconTile({ size: target.size, art, fill: target.fill, cropWidth: ICON_CROP })
    await writeFile(join(ROOT, target.file), data)
    console.log(`  ${target.file}  ${target.size}x${target.size}  ${(data.length / 1024).toFixed(1)} KB`)
  }

  // The tab icon: one .ico carrying 16, 32 and 48 so the browser picks the density that
  // matches the display instead of upscaling a 16px frame on a retina screen.
  const frames = []
  for (const size of ICO_SIZES) {
    frames.push({ size, data: await iconTile({ size, art, fill: FAVICON_FILL, cropWidth: ICON_CROP }) })
  }
  const ico = encodeIco(frames)
  await writeFile(join(ROOT, FAVICON_FILE), ico)
  console.log(`  ${FAVICON_FILE}  ${frames.map((f) => f.size).join('/')}  ${(ico.length / 1024).toFixed(1)} KB`)
}

await vendorMaplibreWorker()
// `--vendor-only` skips the image work, so the hook in front of every dev/build stays fast.
if (!process.argv.includes('--vendor-only')) {
  const art = await buildCarArt()
  await emitVehicleRenders(art)
  await buildIcons(art)
}
