'use client'

import * as React from 'react'
import { GridLayout, useContainerWidth, type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import {
  CARD_SPEC,
  DASHBOARD_CARDS,
  MAX_H,
  ROW_GAP,
  columnsFor,
  commitReport,
  fitToColumns,
  type DashboardCardId,
  type DashboardLayout,
  type Placement,
} from '@/lib/dashboard/layout'

/**
 * The dashboard's widgets, laid out and dragged by react-grid-layout.
 *
 * Two columns of cards on a desktop or the car's landscape display, one on a phone, with
 * the arrangement remembered between visits. The library owns the parts that are genuinely
 * hard — collision resolution, vertical compaction so no hole is left behind, and the
 * transition that moves the other cards out of the way.
 *
 * Three choices worth stating:
 *
 *  - **The drag surface is the card's header band.** The top strip is already a title bar in
 *    every dashboard the operator has used and holds nothing clickable, so taking it costs
 *    nothing. The body stays free: the map keeps its own pan gesture, which a whole-card
 *    handle would have eaten.
 *  - **Cards are not resizable.** Every card is exactly as tall as what it shows, so there is
 *    no size to get wrong and no way to shrink a figure out of existence. Width is the grid's
 *    to decide, from the card's role — a status screen is not a canvas.
 *  - **One arrangement, fitted to the width** rather than one per breakpoint. A narrow screen
 *    is a view of the desktop arrangement, and a change made there is stored as an order and
 *    nothing else (`commitReport`), which is what puts every card back where it was when the
 *    window is widened again.
 */

/** Selector react-grid-layout starts a drag from: the card's own header band. */
const DRAG_HANDLE = '.dash-head'

/** The grid's row height is 1px, so a card's grid height is its pixel height. */
const ROW_HEIGHT = 1

/** Margin between cards: horizontal only, because the vertical gap is paid inside the height. */
const MARGIN: readonly [number, number] = [12, 0]

/** Cards are placed, not sized: the grid decides where, the content decides how tall. */
const GridCardContext = React.createContext<DashboardCardId | null>(null)

export function useGridCard(): DashboardCardId | null {
  return React.useContext(GridCardContext)
}

export function DashboardGrid({ layout, onCommit, children }: {
  layout: DashboardLayout
  onCommit: (next: DashboardLayout) => void
  /** Renders one widget by id. */
  children: (id: DashboardCardId) => React.ReactNode
}) {
  const { width, containerRef, mounted } = useContainerWidth()
  const columns = columnsFor(width)

  /** Measured content height per card, in pixels — the only source of a card's height. */
  const [heights, setHeights] = React.useState<Partial<Record<DashboardCardId, number>>>({})

  const reportHeight = React.useCallback((id: DashboardCardId, px: number) => {
    setHeights((previous) => (previous[id] === px ? previous : { ...previous, [id]: px }))
  }, [])

  const items = React.useMemo<Layout>(
    () =>
      fitToColumns(layout, columns).map((placement): Layout[number] => {
        const spec = CARD_SPEC[placement.i]
        const measured = heights[placement.i]
        return {
          ...placement,
          // Until the first measurement lands, the authored height is the guess; after it,
          // the card is exactly as tall as its content and no taller.
          h: Math.min(measured ?? spec.h, MAX_H) + ROW_GAP,
          minW: placement.w,
          maxW: placement.w,
          minH: 1,
          maxH: MAX_H,
          isResizable: false,
        }
      }),
    [layout, columns, heights],
  )

  // Stored only when the operator let go of a card. Every other report — a measurement that
  // changed a height, a window that crossed the breakpoint — is the grid describing itself,
  // and writing those would be how an arrangement quietly disappears.
  const commit = React.useCallback(
    (reported: Layout) => {
      onCommit(commitReport(reported.map(({ i, x, y, w, h }): Placement => ({ i: i as DashboardCardId, x, y, w, h })), layout, columns))
    },
    [layout, onCommit, columns],
  )

  return (
    <div ref={containerRef} className="dash-grid-root">
      {mounted && (
        <GridLayout
          width={width}
          layout={items}
          gridConfig={{ cols: columns, rowHeight: ROW_HEIGHT, margin: MARGIN, containerPadding: [0, 0] }}
          dragConfig={{ handle: DRAG_HANDLE, threshold: 3 }}
          resizeConfig={{ enabled: false }}
          onDragStop={commit}
        >
          {DASHBOARD_CARDS.map((id) => (
            <div key={id} className="dash-cell">
              <Measured id={id} onHeight={reportHeight}>
                <GridCardContext.Provider value={id}>{children(id)}</GridCardContext.Provider>
              </Measured>
            </div>
          ))}
        </GridLayout>
      )}
    </div>
  )
}

/**
 * Reports a card's content height so the grid can give it exactly that much room.
 *
 * The measured element is the card's *stack* — header plus body — and the card's own
 * vertical padding is added to it, because the box has to fit both. Measuring the card
 * itself is not an option: it fills the box it is given, so it would report the box back as
 * its content and the next pass would ask for that much box — a ratchet that grows every
 * card on screen until the page is all empty space.
 */
function Measured({ id, onHeight, children }: { id: DashboardCardId; onHeight: (id: DashboardCardId, px: number) => void; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const wrap = ref.current
    const stack = wrap?.querySelector<HTMLElement>('.dash-stack')
    const card = wrap?.querySelector<HTMLElement>('.dash-card')
    if (!stack || !card) return
    const observer = new ResizeObserver(() => {
      const style = getComputedStyle(card)
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
      const px = Math.round(stack.getBoundingClientRect().height + padding)
      if (px > 0) onHeight(id, px)
    })
    observer.observe(stack)
    return () => {
      observer.disconnect()
    }
  }, [id, onHeight])

  return (
    <div ref={ref} className="dash-measure">
      {children}
    </div>
  )
}
