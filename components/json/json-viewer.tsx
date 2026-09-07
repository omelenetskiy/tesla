'use client'

import * as React from 'react'
import { Check, ChevronRight, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Response JSON inspector for /debug/api (§28).
 *
 * Written by hand rather than pulled from a package because the requirement set is
 * narrow and specific to this console: collapse, expand/collapse-all, substring
 * search that auto-reveals matches, and per-node copy — with the product's own
 * palette and no syntax-highlighting dependency.
 *
 * Values arriving here are already sanitised server-side; this component also never
 * invents structure, so a string body renders as a string block.
 */

type Json = unknown

const INDENT = 18

function isPlainObject(value: Json): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function typeOf(value: Json): 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (isPlainObject(value)) return 'object'
  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') return type
  return 'string'
}

function preview(value: Json) {
  const type = typeOf(value)
  if (type === 'object') return `{${Object.keys(value as Record<string, Json>).length}}`
  if (type === 'array') return `[${(value as Json[]).length}]`
  if (type === 'string') return `"${(value as string).length > 120 ? `${(value as string).slice(0, 120)}…` : value}"`
  return String(value)
}

/** Marks the matched span so a search result is findable by eye, not just by scroll. */
function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const index = text.toLowerCase().indexOf(query.toLowerCase())
  if (index < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-xs bg-warn-soft px-0.5 text-warn">{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  )
}

function ValueToken({ value, query }: { value: Json; query: string }) {
  const type = typeOf(value)
  const className =
    type === 'string' ? 'text-accent' : type === 'number' ? 'text-ok' : type === 'boolean' ? 'text-warn' : 'text-ink-tertiary'
  return (
    <span className={className}>
      <Highlighted text={preview(value)} query={query} />
    </span>
  )
}

type NodeProps = {
  name: string | null
  value: Json
  depth: number
  query: string
  /** Node paths the user opened explicitly; search matches are opened separately. */
  openPaths: Set<string>
  onToggle: (path: string) => void
  basePath: string
  forceOpenPaths: Set<string> | null
  onCopy: (path: string, value: Json) => void
  copiedPath: string | null
}

function JsonNode(props: NodeProps) {
  const { name, value, depth, query, basePath, openPaths, onToggle, forceOpenPaths, onCopy, copiedPath } = props
  const path = name === null ? basePath : `${basePath}.${name}`
  const type = typeOf(value)
  const compound = type === 'object' || type === 'array'
  const containsMatch = forceOpenPaths ? forceOpenPaths.has(path) : false
  const open = compound ? openPaths.has(path) || containsMatch : false

  const children = compound
    ? type === 'array'
      ? (value as Json[]).map((item, index) => [String(index), item] as const)
      : Object.entries(value as Record<string, Json>)
    : []

  return (
    <div className="min-w-0">
      <div
        className={cn('group flex items-start gap-1 rounded-xs py-[1px] pr-1 hover:bg-surface-muted', !compound && 'items-center')}
        style={{ paddingLeft: depth * INDENT }}
      >
        {compound ? (
          <button
            type="button"
            onClick={() => onToggle(path)}
            aria-label={open ? `Collapse ${name ?? 'root'}` : `Expand ${name ?? 'root'}`}
            className="mt-[3px] flex size-4 shrink-0 items-center justify-center rounded-xs text-ink-tertiary hover:bg-canvas hover:text-ink"
          >
            <ChevronRight className={cn('size-3 transition-transform duration-150', open && 'rotate-90')} />
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}

        <span className="min-w-0 break-all font-mono text-[12.5px] leading-5">
          {name !== null && (
            <>
              <span className={cn('text-ink-secondary', query && 'font-medium')}>
                <Highlighted text={name} query={query} />
              </span>
              <span className="text-ink-tertiary">: </span>
            </>
          )}
          {compound && !open && <ValueToken value={value} query={query} />}
          {compound && open && <span className="text-ink-tertiary">{type === 'array' ? `[${children.length}]` : `{${children.length}}`}</span>}
          {!compound && <ValueToken value={value} query={query} />}
        </span>

        {!compound && (
          <button
            type="button"
            onClick={() => onCopy(path, value)}
            aria-label="Copy value"
            className="ml-auto shrink-0 text-ink-tertiary opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
          >
            {copiedPath === path ? <Check className="size-3 text-ok" /> : <Copy className="size-3" />}
          </button>
        )}
      </div>

      {compound && open && (
        <div>
          {children.map(([key, item]) => (
            <JsonNode
              key={`${path}.${key}`}
              name={key}
              value={item}
              depth={depth + 1}
              query={query}
              basePath={basePath}
              openPaths={openPaths}
              onToggle={onToggle}
              forceOpenPaths={forceOpenPaths}
              onCopy={onCopy}
              copiedPath={copiedPath}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export type JsonViewerProps = {
  source: string | Json
  /** Paths collapsed by default so a 60-key payload does not read as a wall. */
  defaultExpandedDepth?: number
  className?: string
  emptyLabel?: string
}

export function JsonViewer({ source, defaultExpandedDepth = 2, className, emptyLabel = 'No response body' }: JsonViewerProps) {
  const parsed = React.useMemo<{ value: Json; error: string | null }>(() => {
    if (typeof source !== 'string') return { value: source, error: null }
    if (!source.trim()) return { value: null, error: null }
    try {
      return { value: JSON.parse(source), error: null }
    } catch {
      // A non-JSON body (an HTML WAF page, plain text) is shown raw rather than
      // discarded — that content is often the actual diagnosis.
      return { value: source, error: null }
    }
  }, [source])

  const allPaths = React.useMemo(() => {
    const paths = new Set<string>()
    const walk = (value: Json, path: string, depth: number) => {
      if (depth > 24) return
      const type = typeOf(value)
      if (type !== 'object' && type !== 'array') return
      paths.add(path)
      const children = type === 'array' ? (value as Json[]).map((item, index) => [String(index), item] as const) : Object.entries(value as Record<string, Json>)
      for (const [key, item] of children) walk(item, `${path}.${key}`, depth + 1)
    }
    walk(parsed.value, '$', 0)
    return paths
  }, [parsed.value])

  const initiallyOpen = React.useMemo(() => {
    const open = new Set<string>()
    const walk = (value: Json, path: string, depth: number) => {
      if (depth >= defaultExpandedDepth) return
      const type = typeOf(value)
      if (type !== 'object' && type !== 'array') return
      open.add(path)
      const children = type === 'array' ? (value as Json[]).map((item, index) => [String(index), item] as const) : Object.entries(value as Record<string, Json>)
      for (const [key, item] of children) walk(item, `${path}.${key}`, depth + 1)
    }
    walk(parsed.value, '$', 0)
    return open
  }, [parsed.value, defaultExpandedDepth])

  // Reset expand/collapse choices when a new response arrives. Done as a render-time
  // state adjustment (React's documented pattern for deriving state from props) rather
  // than an effect, which would cascade a second render on every response.
  const [openPaths, setOpenPaths] = React.useState<Set<string>>(initiallyOpen)
  const [previousOpen, setPreviousOpen] = React.useState(initiallyOpen)
  if (previousOpen !== initiallyOpen) {
    setPreviousOpen(initiallyOpen)
    setOpenPaths(initiallyOpen)
  }
  const [query, setQuery] = React.useState('')
  const [copiedPath, setCopiedPath] = React.useState<string | null>(null)

  const forceOpenPaths = React.useMemo(() => {
    if (!query.trim()) return null
    const targets = new Set<string>()
    const walk = (value: Json, path: string): boolean => {
      const type = typeOf(value)
      let matched = false
      if (type === 'object' || type === 'array') {
        const children = type === 'array' ? (value as Json[]).map((item, index) => [String(index), item] as const) : Object.entries(value as Record<string, Json>)
        for (const [key, item] of children) {
          const childMatched = walk(item, `${path}.${key}`)
          if (childMatched) matched = true
        }
        if (matched) targets.add(path)
      }
      const nameMatch = path.split('.').at(-1)?.toLowerCase().includes(query.trim().toLowerCase())
      const valueMatch = type !== 'object' && type !== 'array' && String((value as never) ?? '').toLowerCase().includes(query.trim().toLowerCase())
      if (nameMatch || valueMatch) targets.add(path)
      return matched || Boolean(nameMatch) || Boolean(valueMatch)
    }
    walk(parsed.value, '$')
    return targets
  }, [query, parsed.value])

  const matchCount = React.useMemo(() => {
    if (!query.trim() || typeof parsed.value === 'string') return 0
    let count = 0
    const needle = query.trim().toLowerCase()
    const walk = (value: Json, key: string | null) => {
      const type = typeOf(value)
      if (type === 'object' || type === 'array') {
        const children = type === 'array' ? (value as Json[]).map((item, index) => [String(index), item] as const) : Object.entries(value as Record<string, Json>)
        for (const [childKey, item] of children) walk(item, childKey)
        return
      }
      if ((key?.toLowerCase().includes(needle)) || String(value).toLowerCase().includes(needle)) count += 1
    }
    walk(parsed.value, null)
    return count
  }, [query, parsed.value])

  const toggle = (path: string) =>
    setOpenPaths((previous) => {
      const next = new Set(previous)
      if (next.has(path) && !(forceOpenPaths?.has(path) ?? false)) next.delete(path)
      else next.add(path)
      return next
    })

  const copy = async (path: string, value: Json) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? String(value)
    try {
      await navigator.clipboard.writeText(text)
      setCopiedPath(path)
      window.setTimeout(() => setCopiedPath((current) => (current === path ? null : current)), 1_600)
    } catch {
      // Clipboard can be blocked by the frame's permissions; the value stays visible.
    }
  }

  const expandAll = () => setOpenPaths(new Set(allPaths))
  const collapseAll = () => setOpenPaths(new Set(['$']))

  if (typeof parsed.value === 'string') {
    return (
      <div className={cn('min-w-0', className)}>
        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12.5px] leading-5 text-ink">{parsed.value}</pre>
      </div>
    )
  }

  if (parsed.value === null || parsed.value === undefined) {
    return <p className={cn('font-mono text-[12.5px] text-ink-tertiary', className)}>{emptyLabel}</p>
  }

  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search keys or values"
            aria-label="Search JSON"
            className="h-8 w-full rounded-md border border-line bg-surface px-2.5 text-[13px] text-ink placeholder:text-ink-tertiary focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
          />
          {query && (
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-ink-tertiary">
              {matchCount}
            </span>
          )}
        </div>
        <button type="button" onClick={expandAll} className="h-8 rounded-md border border-line px-2 text-[12px] text-ink-secondary hover:bg-surface-muted hover:text-ink">
          Expand all
        </button>
        <button type="button" onClick={collapseAll} className="h-8 rounded-md border border-line px-2 text-[12px] text-ink-secondary hover:bg-surface-muted hover:text-ink">
          Collapse all
        </button>
        <button
          type="button"
          onClick={() => copy('$', parsed.value)}
          className="h-8 rounded-md border border-line px-2 text-[12px] text-ink-secondary hover:bg-surface-muted hover:text-ink"
        >
          {copiedPath === '$' ? 'Copied' : 'Copy JSON'}
        </button>
      </div>
      <div className="min-w-0 overflow-x-auto">
        <JsonNode
          name={null}
          value={parsed.value}
          depth={0}
          query={query.trim()}
          basePath="$"
          openPaths={openPaths}
          onToggle={toggle}
          forceOpenPaths={forceOpenPaths}
          onCopy={copy}
          copiedPath={copiedPath}
        />
      </div>
    </div>
  )
}
