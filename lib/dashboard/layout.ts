/**
 * Which widget sits where on the status dashboard, how big it is, and nothing else.
 *
 * The arrangement is the operator's, not the code's: it lives in `localStorage` so a
 * reorder or a resize survives a reload without a round trip, and without a server write
 * from a screen that is otherwise strictly read-only.
 *
 * Positions are expressed the way react-grid-layout expresses them — column `x`, row `y`,
 * width `w` in columns, height `h` in pixels — and all four are stored, because the
 * operator can now change all four. The grid's row height is 1px, which is what makes `h`
 * a pixel figure rather than something the reader has to convert.
 *
 * This module is pure and DOM-free so `npm run verify` can exercise the merge and clamp
 * rules, which are the part that silently loses a widget when one is added, or turns a
 * desktop arrangement into a horizontal scroll on a phone.
 */

/** Every widget on the dashboard. The id is the storage key, so renaming one loses placements. */
export const DASHBOARD_CARDS = ['vehicle', 'overview', 'battery', 'location'] as const
export type DashboardCardId = (typeof DASHBOARD_CARDS)[number]

export type Placement = { i: DashboardCardId; x: number; y: number; w: number; h: number }

/**
 * One arrangement, not one per screen width.
 *
 * react-grid-layout's responsive component regenerates a breakpoint's layout from another
 * one whenever the breakpoint changes, and reports the regenerated result back as the
 * current layout — which then overwrites what the operator actually arranged. Keeping a
 * single arrangement and adapting it to the measured width (`cols` drops to one, so every
 * card becomes full width and the desktop order reads straight down) removes that whole
 * class of failure. It is also the behaviour the screen wants: the order you chose is the
 * order you get on the phone, not the order you never chose.
 */
export type DashboardLayout = Placement[]

/**
 * `w` is the card's width in grid columns, `h` its starting height in pixels. Every card is
 * as tall as what it shows — nothing here is sized by the operator, so nothing can be sized
 * smaller than the figures it exists to display.
 */
export type CardSpec = { w: number; h: number }

/** Vertical breathing room between rows, paid for by adding it to each card's height. */
export const ROW_GAP = 12

/** The tallest a card may be asked for. Bounded only so a bad measurement cannot run away. */
export const MAX_H = 4000

/**
 * Columns the layout is authored against. Four rather than two so a card that wants half the
 * row and a card that wants all of it can share one grid.
 */
export const MAX_COLUMNS = 4

/** A card that is two of four columns is half the row, which is the default arrangement. */
const HALF = 2

export const CARD_SPEC: Record<DashboardCardId, CardSpec> = {
  // The hero card wants the full row, because the vehicle render is now the page's anchor.
  vehicle: { w: HALF, h: 332 },
  overview: { w: HALF, h: 236 },
  battery: { w: HALF, h: 174 },
  location: { w: HALF, h: 340 },
}

/**
 * Two columns of cards from the point where two readable cards fit side by side; one column
 * below it. Four grid columns are used either way so half-width is expressible.
 *
 * This is compared against the **container's** width, not the window's — react-grid-layout
 * measures the element it is given. The dashboard's container is capped at 1220px and
 * padded, so it tops out near 1196px: a threshold set at 1200 would never be reached on any
 * screen, and every desktop would silently get the one-column arrangement.
 */
export const TWO_COLUMN_MIN_WIDTH = 700

/** Columns available at a given container width. */
export function columnsFor(width: number): number {
  return width >= TWO_COLUMN_MIN_WIDTH ? MAX_COLUMNS : 1
}

/**
 * Dashboard default order: identity + system on top, battery + map below.
 */
const DEFAULT_ORDER: DashboardCardId[] = ['vehicle', 'overview', 'battery', 'location']

/**
 * Array order is part of the layout, not a detail of it.
 *
 * Compaction walks the items in array order and moves each one up as far as it can, so a
 * list declared `[vehicle@y170, battery@y0]` does not mean "battery on top": vehicle is
 * compacted first, claims row 0, and battery is pushed below it. Every layout that reaches
 * the grid — the default, one read back from storage — is sorted into the order it renders
 * in, which is the only order that survives the round trip.
 */
function byRow(list: Placement[]): Placement[] {
  return [...list].sort((a, b) => a.y - b.y || a.x - b.x)
}

/**
 * Pack a list of cards, in the order given, into the full-width grid.
 *
 * It fills one horizontal band at a time: cards are laid side by side until the next one
 * would not fit, the band is closed at the height of its tallest card, and the next band
 * starts below it. Two consequences, both wanted:
 *
 *  - **There is nowhere empty left to sit.** A card can only ever be shorter than the band
 *    it shares, and the band is as tall as its tallest member, so no column runs ahead of
 *    another and no hole opens up under a short card.
 *  - **Cards in a row are the same height.** The slack goes inside the card, where the card
 *    is drawn, rather than between two cards, where it reads as a broken layout.
 *
 * A card as wide as the grid forms a band of its own, which is how the energy summary ends
 * up spanning the bottom.
 */
export function repack(order: Placement[]): Placement[] {
  const out: Placement[] = []
  let y = 0
  let band: Placement[] = []
  let used = 0
  let bandH = 0

  const flush = () => {
    for (const item of band) out.push({ ...item, y, h: bandH })
    y += bandH
    band = []
    used = 0
    bandH = 0
  }

  for (const placement of order) {
    const width = Math.max(1, Math.min(placement.w, MAX_COLUMNS))
    if (band.length > 0 && used + width > MAX_COLUMNS) flush()
    if (band.length === 0) bandH = placement.h
    band.push({ ...placement, w: width, x: used, h: Math.max(bandH, placement.h) })
    used += width
    bandH = Math.max(bandH, placement.h)
    if (used >= MAX_COLUMNS) flush()
  }
  if (band.length > 0) flush()
  return out
}

function stack(): Placement[] {
  return repack(
    DEFAULT_ORDER.map((id) => {
      const spec = CARD_SPEC[id]
      return { i: id, x: 0, y: 0, w: spec.w, h: spec.h + ROW_GAP }
    }),
  )
}

export const DEFAULT_LAYOUT: DashboardLayout = stack()

export const LAYOUT_STORAGE_KEY = 'drive-scope:dashboard-layout'

/** Fires in the tab that wrote, which the `storage` event deliberately does not cover. */
export const LAYOUT_CHANGED_EVENT = 'drive-scope:dashboard-layout-changed'

function isCardId(value: unknown): value is DashboardCardId {
  return typeof value === 'string' && (DASHBOARD_CARDS as readonly string[]).includes(value)
}

/** A number that survived storage: finite, whole, and inside the range the card allows. */
function clamp(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(Math.round(value), max))
}

/**
 * Untrusted storage in, a layout that always holds every card exactly once.
 *
 * Unknown ids are dropped and cards missing from storage are appended at their default
 * position, which is what keeps this from rotting: when a release adds a widget, an
 * operator's saved layout does not contain it, and dropping it would make the new card
 * invisible to everyone who has ever dragged anything.
 */
export function sanitizeLayout(raw: unknown): DashboardLayout {
  const list = Array.isArray(raw) ? raw : []
  const seen = new Set<DashboardCardId>()
  const out: Placement[] = []
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Partial<Placement>
    if (!isCardId(record.i) || seen.has(record.i)) continue
    const spec = CARD_SPEC[record.i]
    seen.add(record.i)
    out.push({
      i: record.i,
      x: clamp(record.x, 0, 0, MAX_COLUMNS - 1),
      y: clamp(record.y, spec.h, 0, Number.MAX_SAFE_INTEGER),
      w: clamp(record.w, spec.w, 1, MAX_COLUMNS),
      // No height is read back: a card is as tall as what it shows at the width it is being
      // shown at, which the grid measures every time. Storing one would replay last session's
      // figure onto a screen that may not even be the same width.
      h: spec.h + ROW_GAP,
    })
  }
  for (const missing of DEFAULT_LAYOUT) {
    if (seen.has(missing.i)) continue
    seen.add(missing.i)
    out.push({ ...missing })
  }
  return byRow(out)
}

/** Anything unparseable or of the wrong shape is "never arranged", not a broken layout. */
export function parseLayout(json: string | null): DashboardLayout {
  if (!json) return DEFAULT_LAYOUT
  try {
    return sanitizeLayout(JSON.parse(json) as unknown)
  } catch {
    return DEFAULT_LAYOUT
  }
}

/** What goes into storage: the four numbers the arrangement is made of, and nothing else. */
export function toStorage(layout: DashboardLayout): Placement[] {
  return layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }))
}

/**
 * The arrangement narrowed to the columns a screen actually has.
 *
 * A card four columns wide cannot exist where there is one, and a card in column two cannot
 * exist at all — so both collapse into the single available column, in the order the desktop
 * put them. This is the whole of the responsive behaviour: no second layout, no
 * regeneration, nothing that can get out of step with what the operator arranged.
 */
export function fitToColumns(layout: DashboardLayout, columns: number): Placement[] {
  if (columns >= MAX_COLUMNS) return layout
  return byRow(layout.map((placement) => ({ ...placement, x: 0, w: Math.min(placement.w, columns) })))
}

/**
 * Turn a layout reported by the grid into the arrangement to store.
 *
 * On a full-width screen the report *is* the arrangement — it is taken at face value, with
 * each card's width and height clamped back into what that card is allowed to be.
 *
 * On a narrow screen the grid is showing `fitToColumns`, not the arrangement: every card one
 * column wide in column zero. Storing that would flatten what the operator built on a big
 * screen, so a narrow report contributes **an order and nothing else**, and the authored
 * widths, heights and columns are re-derived from it. This is what puts every card back
 * exactly where it was when the window is widened or the phone is turned back to portrait.
 */
export function commitReport(reported: Placement[], previous: DashboardLayout, columns: number): DashboardLayout {
  if (columns >= MAX_COLUMNS) {
    return reported.map((placement) => {
      const stored = previous.find((entry) => entry.i === placement.i) ?? placement
      return {
        ...stored,
        x: clamp(placement.x, stored.x, 0, MAX_COLUMNS - 1),
        y: clamp(placement.y, stored.y, 0, Number.MAX_SAFE_INTEGER),
        w: clamp(placement.w, stored.w, 1, MAX_COLUMNS),
      }
    })
  }
  const order = byRow(reported).map(({ i }) => previous.find((entry) => entry.i === i) ?? { i, x: 0, y: 0, w: CARD_SPEC[i].w, h: CARD_SPEC[i].h + ROW_GAP })
  return repack(order.map((placement) => ({ ...placement })))
}
