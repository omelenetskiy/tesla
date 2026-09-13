import type { MetadataRoute } from 'next'

/**
 * The installable-app manifest, served at `/manifest.webmanifest` and linked automatically.
 *
 * What it buys is the iPhone's "Add to Home Screen": without `display: standalone` iOS saves
 * a bookmark that reopens inside Safari's own chrome, and the dashboard — which is built to
 * fill a screen and to own its scroll — gets a scrolling browser toolbar on top of it.
 *
 * Two things here are load-bearing rather than decorative:
 *
 *  - `id` and `scope`, so a saved app is the same app after a path change and cannot wander
 *    outside the site it was installed from.
 *  - `theme_color` matching the icon tile and the launch background, because iOS paints the
 *    status bar and the launch screen with it. A mismatch is a visible flash of the wrong
 *    colour at every cold start.
 *
 * There is deliberately no `offline` story and no service worker: every screen here is the
 * live state of a car, so a cached dashboard would be a dashboard that lies. Installing the
 * app changes how it opens, never whether the numbers are current.
 */

/** The bottom of the icon tile, so the launch screen and the icon are one object. */
const THEME_COLOR = '#0b0f16'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DriveScope — Tesla',
    short_name: 'DriveScope',
    description: 'Tesla companion for an owner: state, location, trips, battery and charging.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    categories: ['utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      // A separate asset rather than a flag on the one above: a launcher crops a maskable
      // icon to a circle, and the ordinary icon is composed with padding that assumes it is
      // shown whole. One file cannot serve both.
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
