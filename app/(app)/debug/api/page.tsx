'use client'

import * as React from 'react'
import { AlertTriangle, BookOpen, Check, ChevronRight, Copy, Eraser, Play, RefreshCw, RotateCcw, Stethoscope, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TooltipProvider } from '@/components/ui/tooltip'
import { JsonViewer } from '@/components/json/json-viewer'
import { useFeed } from '@/components/shell/app-shell'
import type { CatalogEntry, CatalogGroupId } from '@/lib/tesla/catalog'
import type { ApiRequestLog } from '@/lib/tesla/models'
import { cn } from '@/lib/utils'

/**
 * /debug/api — the developer console (§24–§32).
 *
 * Built from the product's own primitives on purpose (§32): same tokens, same
 * borders, same buttons — a debug surface that looks like a separate tool is one
 * nobody opens.
 *
 * Everything rendered here has already passed `lib/tesla/sanitize.ts` on the write
 * path and again on the read path, so `[REDACTED]` is a property of the pipeline
 * rather than this component remembering to hide things (§30).
 */

type CatalogPayload = {
  groups: Array<{ id: CatalogGroupId; title: string; summary: string }>
  entries: CatalogEntry[]
  apiBaseUrl: string
  /** Real values from the connected vehicle, used to prefill the path parameters. */
  defaultPathParams: Record<string, string>
  vehicleConnected: boolean
  vehicleName: string | null
  /** True when a vehicle exists but its short Owner API id was never recorded. */
  needsShortId: boolean
}

type Diagnostics = {
  connected: boolean
  items: Array<{ id: string; label: string; state: 'pass' | 'fail' | 'unknown'; detail: string }>
  historyTables: Record<string, 'pass' | 'fail'>
  probe: { reachable: boolean; status: number | null; durationMs: number | null; vehicleCount: number } | null
  auth: { state: string; expiresAt: string | null; azp: string | null; scopes: string[] | null } | null
  recentFailures: Array<{ id: string; endpoint: string; status: number | null; kind: string | null; at: string; message: string | null }>
}

type Result = {
  ok: boolean
  status: number | null
  durationMs: number | null
  timestamp: string
  endpoint: string
  method: string
  url: string
  requestHeaders: Record<string, string>
  requestBody: string | null
  responseHeaders: Record<string, string>
  responseBody: string | null
  byteLength: number | null
  error: { kind: string; status: number | null; message: string } | null
  curl: string
  diagnostics: string[]
}

type EditorPayload = { query: Record<string, string>; body: string; confirmUnsafe: boolean }

/**
 * Group order follows the order the app actually calls things: authenticate, find the
 * vehicle, read the rollup, then the sections derived from it, then the one command.
 * Within a group the catalog array's own order is the sequence.
 */
const GROUP_ORDER: CatalogGroupId[] = ['authentication', 'vehicles', 'vehicle_state', 'driving', 'charging', 'climate', 'commands', 'streaming']

export default function ApiDebugPage() {
  const feed = useFeed()
  const [catalog, setCatalog] = React.useState<CatalogPayload | null>(null)
  const [catalogError, setCatalogError] = React.useState<string | null>(null)
  const [selectedId, setSelectedId] = React.useState('auth-userinfo')
  // Path params are shared across entries: the short `id` is the same value for every
  // vehicle endpoint, so re-typing it per request would be the console's worst feature.
  // Only *edits* are state. The prefilled values are derived below, so a vehicle that
  // resolves after the catalog was fetched still fills the field, and a value the
  // operator typed is never overwritten by a later refresh.
  const [paramEdits, setParamEdits] = React.useState<Record<string, string>>({})
  const [result, setResult] = React.useState<Result | null>(null)
  const [logs, setLogs] = React.useState<ApiRequestLog[]>([])
  const [diagnostics, setDiagnostics] = React.useState<Diagnostics | null>(null)
  const [sending, setSending] = React.useState(false)
  const [mobilePane, setMobilePane] = React.useState<'catalog' | 'request' | 'response'>('request')
  const [panel, setPanel] = React.useState<'console' | 'diagnostics'>('console')
  const [copied, setCopied] = React.useState<string | null>(null)

  const selected = catalog?.entries.find((entry) => entry.id === selectedId) ?? null
  const identity = feed.snapshot?.status?.identity ?? null

  const paramDefaults = React.useMemo<Record<string, string>>(() => {
    const liveVehicleId = identity?.vehicleId ? String(identity.vehicleId) : ''
    return {
      // Stored identifiers first (they are what the server resolved for this owner),
      // then whatever the live snapshot happens to carry.
      id: catalog?.defaultPathParams.id || identity?.ownerApiId || '',
      vehicle_id: catalog?.defaultPathParams.vehicle_id || liveVehicleId,
    }
  }, [catalog, identity])

  const pathParams = React.useMemo(() => {
    const names = new Set<string>(Object.keys(paramDefaults))
    for (const entry of catalog?.entries ?? []) {
      for (const param of entry.params) if (param.in === 'path') names.add(param.name)
    }
    for (const name of Object.keys(paramEdits)) names.add(name)
    const resolved: Record<string, string> = {}
    for (const name of Array.from(names)) {
      resolved[name] = name in paramEdits ? paramEdits[name] : (paramDefaults[name] ?? '')
    }
    return resolved
  }, [catalog, paramDefaults, paramEdits])

  /** Which of the two sources a filled field came from, shown under the input. */
  const paramSource = (name: string): 'typed' | 'stored' | 'live' | 'empty' => {
    if ((paramEdits[name] ?? '').trim()) return 'typed'
    if ((catalog?.defaultPathParams[name] ?? '').trim()) return 'stored'
    if ((paramDefaults[name] ?? '').trim()) return 'live'
    return 'empty'
  }
  const paramHint = catalog?.needsShortId
    ? 'No short id is stored for this vehicle yet — run "Vehicle list" first, then press Fill from vehicle.'
    : null

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const catalogResponse = await fetch('/api/debug/request', { method: 'GET' })
        if (!catalogResponse.ok) throw new Error('Endpoint catalog failed to load')
        const payload = (await catalogResponse.json()) as CatalogPayload
        if (cancelled) return
        setCatalog(payload)
      } catch (error) {
        if (!cancelled) setCatalogError(error instanceof Error ? error.message : 'Could not load the catalog')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await fetch('/api/debug/logs?limit=40')
      if (!response.ok) return
      const payload = (await response.json()) as { requests: ApiRequestLog[] }
      if (!cancelled) setLogs(payload.requests ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const response = await fetch('/api/debug/diagnostics')
      if (!response.ok) return
      const payload = (await response.json()) as Diagnostics
      if (!cancelled) setDiagnostics(payload)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const reloadCatalog = React.useCallback(async () => {
    const response = await fetch('/api/debug/request', { method: 'GET' })
    if (!response.ok) return
    setCatalog((await response.json()) as CatalogPayload)
  }, [])

  const reloadLogs = React.useCallback(async () => {
    const response = await fetch('/api/debug/logs?limit=40')
    if (!response.ok) return
    setLogs(((await response.json()) as { requests: ApiRequestLog[] }).requests ?? [])
  }, [])

  const reloadDiagnostics = React.useCallback(async () => {
    const response = await fetch('/api/debug/diagnostics')
    if (!response.ok) return
    setDiagnostics((await response.json()) as Diagnostics)
  }, [])

  const copyText = React.useCallback(async (value: string, token: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(token)
      window.setTimeout(() => setCopied((current) => (current === token ? null : current)), 1_800)
    } catch {
      setCopied(`${token}:failed`)
    }
  }, [])

  const send = async (payload: EditorPayload) => {
    if (!selected) return
    setSending(true)
    try {
      const response = await fetch('/api/debug/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId: selected.id, pathParams, query: payload.query, body: payload.body.trim() ? payload.body : null, confirmUnsafe: payload.confirmUnsafe }),
      })
      setResult((await response.json()) as Result)
      setMobilePane('response')
      // Awaited, not fired-and-forgotten: the console's own history must show the run
      // that just finished the moment it finishes. The catalog is refetched after a
      // vehicle list as well, because that is the response the short ids come from.
      const refresh: Array<Promise<void>> = [reloadLogs(), reloadDiagnostics()]
      if (selected.id === 'vehicles-list') refresh.push(reloadCatalog())
      await Promise.all(refresh)
    } catch (error) {
      setResult({
        ok: false,
        status: null,
        durationMs: null,
        timestamp: new Date().toISOString(),
        endpoint: selected.path,
        method: selected.method,
        url: selected.path,
        requestHeaders: {},
        requestBody: null,
        responseHeaders: {},
        responseBody: null,
        byteLength: null,
        error: { kind: 'network', status: null, message: error instanceof Error ? error.message : 'Request did not run' },
        curl: '',
        diagnostics: [],
      })
      setMobilePane('response')
    } finally {
      setSending(false)
    }
  }

  /**
   * Clicking a history row selects the catalog request that produced it.
   *
   * The stored endpoint carries the resolved identifiers (`/api/1/vehicles/123/data`),
   * while the catalog path holds placeholders (`/api/1/vehicles/:id/data`), so an
   * equality test never matched and the row appeared unclickable. Each placeholder is
   * turned into a segment pattern instead.
   */
  const entryForLog = (log: ApiRequestLog) => {
    const pathname = log.endpoint.split('?')[0]
    return catalog?.entries.find((entry) => {
      const pattern = entry.path.replace(/:[a-zA-Z_]+/g, '[^/]+')
      return new RegExp(`^${pattern}$`).test(pathname)
    }) ?? null
  }

  const restoreLog = (log: ApiRequestLog) => {
    const match = entryForLog(log)
    if (match) setSelectedId(match.id)
    setResult({
      ok: log.ok,
      status: log.status,
      durationMs: log.durationMs,
      timestamp: log.at,
      endpoint: log.endpoint,
      method: log.method,
      url: log.url,
      requestHeaders: log.requestHeaders,
      requestBody: log.requestBody,
      responseHeaders: log.responseHeaders,
      responseBody: log.responseBody,
      byteLength: log.responseByteLength,
      error: log.ok ? null : { kind: log.errorKind ?? 'unknown', status: log.status, message: log.errorMessage ?? '' },
      curl: '',
      diagnostics: [
        match ? `Restored from history — this is the "${match.title}" request.` : 'Restored from history. The request is no longer in the catalog.',
        'The body may have been truncated when stored.',
      ],
    })
    setMobilePane('response')
  }

  const clearHistory = async () => {
    await fetch('/api/debug/logs', { method: 'DELETE' })
    await reloadLogs()
  }

  const grouped = React.useMemo(() => {
    const map = new Map<CatalogGroupId, CatalogEntry[]>()
    for (const entry of catalog?.entries ?? []) {
      const list = map.get(entry.group) ?? []
      list.push(entry)
      map.set(entry.group, list)
    }
    return map
  }, [catalog])

  return (
    <TooltipProvider delayDuration={300}>
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 pb-4 pt-4 sm:px-6 lg:h-full lg:pb-2">
        <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line pb-4">
          {/* Navigation and the section name come from the app shell now, so this
              header only carries the target host and the view switch. */}
          <div className="mr-auto min-w-0">
            <p className="truncate text-[13px] text-ink-secondary">
              Tesla Owner API ·{' '}
              <span className="font-mono text-[12px] text-ink-tertiary">{catalog?.apiBaseUrl ?? 'owner-api.teslamotors.com'}</span>
            </p>
            {catalog && !catalog.vehicleConnected && (
              <p className="mt-0.5 text-[12px] text-warn">No Tesla connected — requests have no vehicle to run against.</p>
            )}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Tabs value={panel} onValueChange={(value) => setPanel(value as typeof panel)}>
              <TabsList>
                <TabsTrigger value="console">Console</TabsTrigger>
                <TabsTrigger value="diagnostics">
                  <Stethoscope className="size-3.5" />
                  Diagnostics
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </header>

        {catalogError && (
          <div className="flex shrink-0 items-start gap-2 rounded-lg border border-danger-line bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0">{catalogError}</span>
            <Button variant="ghost" size="sm" className="ml-auto shrink-0" onClick={() => window.location.reload()}>
              <RefreshCw className="size-3.5" />
              Reload
            </Button>
          </div>
        )}

        {panel === 'diagnostics' ? (
          <DiagnosticsPanel diagnostics={diagnostics} onRetry={() => void reloadDiagnostics()} />
        ) : (
          <>
            {/* Narrow and in-car widths get an explicit pane switch instead of a cramped
                two-column layout — §36 forbids tiny controls over hover-dependent ones. */}
            <div className="flex shrink-0 gap-1 lg:hidden">
              {(['catalog', 'request', 'response'] as const).map((pane) => (
                <button
                  key={pane}
                  type="button"
                  onClick={() => setMobilePane(pane)}
                  className={cn(
                    'h-11 flex-1 rounded-md border text-[13px] font-medium transition-colors',
                    mobilePane === pane ? 'border-line bg-surface text-ink shadow-xs' : 'border-transparent bg-transparent text-ink-secondary',
                  )}
                >
                  {pane === 'catalog' ? 'Requests' : pane === 'request' ? 'Request' : 'Response'}
                </button>
              ))}
            </div>

            {/*
              Two zones: the request list on the left, everything about the selected
              request — parameters, docs, response, history — on the right. On desktop the
              grid fills the viewport exactly and each column scrolls inside itself, so
              the list can never push content off the bottom of the screen.
            */}
            <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(244px,276px)_minmax(0,1fr)] lg:items-stretch">
              <CatalogPane className={cn('min-h-0 lg:h-full', mobilePane === 'catalog' ? 'flex' : 'hidden lg:flex')}>
                <p className="shrink-0 border-b border-line px-2.5 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-tertiary">
                  Requests
                </p>
                <nav className="min-h-0 flex-1 overflow-y-auto p-1.5" aria-label="Owner API requests">
                  {GROUP_ORDER.map((group) => {
                    const entries = grouped.get(group)
                    if (!entries?.length) return null
                    return (
                      <div key={group} className="mb-1">
                        <p className="px-2 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-tertiary">
                          {catalog?.groups.find((item) => item.id === group)?.title ?? group}
                        </p>
                        {entries.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => setSelectedId(entry.id)}
                            className={cn(
                              'flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                              selectedId === entry.id ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-surface-muted',
                            )}
                          >
                            <span className={cn('w-[38px] shrink-0 font-mono text-[10px] font-semibold', entry.method === 'POST' ? 'text-warn' : 'text-ink-tertiary')}>{entry.method}</span>
                            <span className="min-w-0 flex-1 truncate text-[13px]">{entry.title}</span>
                            {entry.deprecated && <span className="shrink-0 rounded-xs bg-surface-muted px-1 text-[9.5px] font-medium text-ink-tertiary">404</span>}
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </nav>
                <div className="shrink-0 border-t border-line px-2.5 py-2 text-[11px] leading-4 text-ink-tertiary">
                  {catalog ? `${catalog.entries.length} requests · in call order` : 'Loading catalog…'}
                </div>
              </CatalogPane>

              <div className="flex min-w-0 flex-col gap-4 lg:min-h-0 lg:overflow-y-auto lg:pr-0.5">
                {/* Keyed by entry id: switching requests resets its own form state,
                    which is what the previous "sync state in an effect" version faked. */}
                {selected && (
                  <RequestEditor
                    key={selected.id}
                    entry={selected}
                    pathParams={pathParams}
                    paramSource={paramSource}
                    onPathParamChange={(name, value) => setParamEdits((previous) => ({ ...previous, [name]: value }))}
                    onResetToVehicle={() => setParamEdits({})}
                    sending={sending}
                    paramHint={paramHint}
                    result={result}
                    copied={copied}
                    onCopy={copyText}
                    onSend={(payload) => void send(payload)}
                  />
                )}

                <ResponsePane logs={logs} result={result} onRestore={restoreLog} onRefresh={reloadLogs} onClear={() => void clearHistory()} onCopy={copyText} copied={copied} hiddenOnNarrow={mobilePane !== 'response'} />
              </div>
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  )
}

function CatalogPane({ children, className, hiddenOnWide }: { children: React.ReactNode; className?: string; hiddenOnWide?: boolean }) {
  // Display itself is supplied by the caller: `flex` here would fight `hidden` in the
  // same cascade layer, and the rail has to be a *column* — as a row it laid its
  // header, list and footer side by side and ran off the screen.
  return <aside className={cn('min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-xs', hiddenOnWide && 'hidden', className)}>{children}</aside>
}

type ParamSource = 'typed' | 'stored' | 'live' | 'empty'

const PARAM_SOURCE_TEXT: Record<ParamSource, string | null> = {
  typed: 'Your value — it overrides what the app knows.',
  stored: 'Filled from the vehicle record on file.',
  live: 'Filled from the live snapshot.',
  empty: null,
}

function RequestEditor({
  entry,
  pathParams,
  paramSource,
  onPathParamChange,
  onResetToVehicle,
  sending,
  paramHint,
  result,
  copied,
  onCopy,
  onSend,
}: {
  entry: CatalogEntry
  pathParams: Record<string, string>
  paramSource: (name: string) => ParamSource
  onPathParamChange: (name: string, value: string) => void
  onResetToVehicle: () => void
  sending: boolean
  paramHint?: string | null
  result: Result | null
  copied: string | null
  onCopy: (value: string, token: string) => Promise<void>
  onSend: (payload: EditorPayload) => void
}) {
  const [queryRows, setQueryRows] = React.useState<Array<{ key: string; value: string }>>([{ key: '', value: '' }])
  const [body, setBody] = React.useState(entry.sampleBody ?? '')
  const [confirmUnsafe, setConfirmUnsafe] = React.useState(false)
  const pathParamsExist = entry.params.some((param) => param.in === 'path')
  const missingRequired = entry.params.some((param) => param.in === 'path' && param.required && !(pathParams[param.name] ?? '').trim())
  const anyEdited = entry.params.some((param) => param.in === 'path' && paramSource(param.name) === 'typed')

  const submit = () => {
    onSend({
      query: Object.fromEntries(queryRows.filter((row) => row.key.trim()).map((row) => [row.key.trim(), row.value])),
      body,
      confirmUnsafe,
    })
  }

  const reset = () => {
    setQueryRows([{ key: '', value: '' }])
    setBody(entry.sampleBody ?? '')
    setConfirmUnsafe(false)
  }

  return (
    <section className="min-w-0 rounded-lg border border-line bg-surface shadow-xs">
      <div className="border-b border-line p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={entry.method === 'POST' ? 'warn' : 'accent'} className="font-mono">
            {entry.method}
          </Badge>
          <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink">{entry.path}</code>
          {entry.deprecated && <Badge variant="outline">deprecated</Badge>}
          {entry.requiresAwake && <Badge variant="warn">needs online</Badge>}
          {!entry.implemented && <Badge variant="neutral">not implemented</Badge>}
        </div>
        <p className="mt-2 text-[13px] leading-5 text-ink-secondary">{entry.purpose}</p>
      </div>

      <div className="space-y-4 p-3.5">
        {pathParamsExist && (
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[12px] font-medium text-ink-secondary">Path parameters</p>
              {anyEdited && (
                <button type="button" onClick={onResetToVehicle} className="min-h-8 text-[12px] text-accent hover:underline">
                  Use vehicle values
                </button>
              )}
            </div>
            <div className="space-y-2.5">
              {entry.params
                .filter((param) => param.in === 'path')
                .map((param) => {
                  const source = paramSource(param.name)
                  const sourceText = PARAM_SOURCE_TEXT[source]
                  return (
                    <div key={param.name}>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`path-${param.name}`} className="shrink-0 font-mono text-[12px]">
                          :{param.name}
                          {param.required && <span className="text-danger"> *</span>}
                        </Label>
                        <Input
                          id={`path-${param.name}`}
                          size="sm"
                          value={pathParams[param.name] ?? ''}
                          onChange={(event) => onPathParamChange(param.name, event.target.value)}
                          placeholder={param.example ?? param.name}
                          className="min-w-0 flex-1 font-mono"
                        />
                      </div>
                      <p className="mt-1 text-[11.5px] leading-4 text-ink-tertiary">{param.description}</p>
                      {sourceText && (
                        <p className={cn('mt-0.5 text-[11px] leading-4', source === 'typed' ? 'text-accent' : 'text-ok')}>{sourceText}</p>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-[12px] font-medium text-ink-secondary">Query parameters</p>
            <button type="button" onClick={() => setQueryRows((previous) => [...previous, { key: '', value: '' }])} className="min-h-8 text-[12px] text-accent hover:underline">
              + add
            </button>
          </div>
          <div className="space-y-1.5">
            {queryRows.map((row, index) => (
              <div key={index} className="flex gap-1.5">
                <Input
                  size="sm"
                  aria-label="Parameter name"
                  value={row.key}
                  onChange={(event) => setQueryRows((previous) => previous.map((item, position) => (position === index ? { ...item, key: event.target.value } : item)))}
                  placeholder="name"
                  className="w-[38%] font-mono"
                />
                <Input
                  size="sm"
                  aria-label="Parameter value"
                  value={row.value}
                  onChange={(event) => setQueryRows((previous) => previous.map((item, position) => (position === index ? { ...item, value: event.target.value } : item)))}
                  placeholder="value"
                  className="min-w-0 flex-1 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setQueryRows((previous) => (previous.length === 1 ? [{ key: '', value: '' }] : previous.filter((_, position) => position !== index)))}
                  aria-label="Remove parameter"
                  className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line text-ink-tertiary hover:text-danger"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {entry.method !== 'GET' && (
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-ink-secondary">Request body (JSON)</p>
            <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="{ }" className="min-h-[96px]" />
          </div>
        )}

        {entry.safety !== 'read' && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-warn-line bg-warn-soft px-3 py-2.5">
            <input type="checkbox" checked={confirmUnsafe} onChange={(event) => setConfirmUnsafe(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--orange)]" />
            <span className="text-[12.5px] leading-4 text-ink">
              {entry.safety === 'wake' ? 'I confirm: this request may wake the vehicle and affect its charge.' : 'I confirm: this request changes stored credentials.'}
            </span>
          </label>
        )}

        {missingRequired && (
          <p className="text-[12px] text-danger">
            Fill in the required path parameters — without them the request will 404.{' '}
            {paramHint ?? 'The short id comes from the "Vehicle list" response.'}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={submit} disabled={sending || !entry.implemented || missingRequired || (entry.safety !== 'read' && !confirmUnsafe)}>
            {sending ? <RefreshCw className="size-4 animate-spin" /> : <Play className="size-4" />}
            {sending ? 'Running…' : 'Send request'}
          </Button>
          <Button variant="ghost" onClick={reset}>
            <RotateCcw className="size-4" />
            Reset
          </Button>
          <Button variant="default" onClick={() => void onCopy(result?.curl || previewCurl(entry, pathParams), 'curl')} disabled={!result?.curl && !entry.implemented}>
            {copied === 'curl' ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
            Copy cURL
          </Button>
        </div>
        {!entry.implemented && <p className="text-[12px] text-ink-tertiary">This endpoint is listed for reference and is not called by the app (§26).</p>}
      </div>

      <EntryDocs entry={entry} />
    </section>
  )
}

/** §31 — the documentation block sits under the form it describes, not in a wiki. */
function EntryDocs({ entry }: { entry: CatalogEntry }) {
  return (
    <div className="rounded-b-lg border-t border-line bg-canvas p-3.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-tertiary">
        <BookOpen className="size-3.5" />
        Documentation
      </p>
      <dl className="space-y-1 text-[12.5px] leading-5">
        <DocRow term="Method" value={`${entry.method} ${entry.path}`} mono />
        <DocRow term="Expected response" value={entry.expectedResponse} />
        {entry.params.length > 0 && <DocRow term="Parameters" value={entry.params.map((param) => `${param.name}${param.required ? ' — required' : ''} (${param.in})`).join('; ')} />}
        {entry.replacement && <DocRow term="Replaced by" value={entry.replacement} mono />}
      </dl>
      <ul className="mt-2 space-y-1.5">
        {entry.notes.map((note, index) => (
          <li key={index} className="flex gap-2 text-[12px] leading-[1.5] text-ink-secondary">
            <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-tertiary" aria-hidden />
            {/* English fragments are verbatim quotes from the community docs. */}
            <span className="min-w-0">{note}</span>
          </li>
        ))}
      </ul>
      <a href={entry.docUrl} target="_blank" rel="noreferrer" className="mt-2.5 inline-flex items-center gap-1 text-[12px] text-accent hover:underline">
        tesla-api.timdorr.com
        <ChevronRight className="size-3" />
      </a>
    </div>
  )
}

function ResponsePane({
  logs,
  result,
  onRestore,
  onRefresh,
  onClear,
  onCopy,
  copied,
  hiddenOnNarrow,
}: {
  logs: ApiRequestLog[]
  result: Result | null
  onRestore: (log: ApiRequestLog) => void
  onRefresh: () => void
  onClear: () => void
  onCopy: (value: string, token: string) => Promise<void>
  copied: string | null
  hiddenOnNarrow?: boolean
}) {
  const [tab, setTab] = React.useState('response')
  const tone = result?.status == null ? 'outline' : result.status < 300 ? 'ok' : result.status < 500 ? 'warn' : 'danger'

  return (
    <section className={cn('flex min-w-0 flex-col gap-4', hiddenOnNarrow && 'hidden lg:flex')}>
      <div className="min-w-0 rounded-lg border border-line bg-surface shadow-xs">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3.5 py-2.5">
          <span className="text-[13px] font-medium text-ink">Response</span>
          {result ? (
            <>
              <Badge variant={tone as 'ok'}>{result.status ?? 'err'}</Badge>
              {result.durationMs !== null && <span className="font-mono text-[12px] text-ink-secondary">{result.durationMs} ms</span>}
              {result.byteLength !== null && <span className="font-mono text-[11.5px] text-ink-tertiary">{result.byteLength} B</span>}
              <span className="ml-auto font-mono text-[11.5px] text-ink-tertiary">{new Date(result.timestamp).toLocaleTimeString('en-US')}</span>
            </>
          ) : (
            <span className="text-[12.5px] text-ink-tertiary">No request has been run yet</span>
          )}
        </div>

        {result?.error && (
          <div className="border-b border-danger-line bg-danger-soft px-3.5 py-2.5">
            <p className="flex items-start gap-1.5 text-[13px] font-medium text-danger">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0">{result.error.message}</span>
            </p>
            <p className="mt-1 break-all font-mono text-[11.5px] text-ink-secondary">
              {result.error.kind}
              {result.error.status ? ` · HTTP ${result.error.status}` : ''} · {result.method} {result.endpoint}
            </p>
          </div>
        )}

        {result && (
          <div className="p-3.5">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="response">Response</TabsTrigger>
                <TabsTrigger value="headers">Headers</TabsTrigger>
                <TabsTrigger value="request">Request</TabsTrigger>
                <TabsTrigger value="curl">cURL</TabsTrigger>
              </TabsList>
              <TabsContent value="response">
                <JsonViewer source={result.responseBody ?? ''} defaultExpandedDepth={2} />
              </TabsContent>
              <TabsContent value="headers">
                <HeaderTable rows={Object.entries(result.responseHeaders)} emptyLabel="Response headers were not stored" />
              </TabsContent>
              <TabsContent value="request">
                <div className="space-y-3">
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-tertiary">URL</p>
                    <code className="block break-all font-mono text-[12px] text-ink">{result.url}</code>
                  </div>
                  <HeaderTable rows={Object.entries(result.requestHeaders)} emptyLabel="Request headers were not stored" />
                  {result.requestBody && (
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-tertiary">Request body</p>
                      <JsonViewer source={result.requestBody} defaultExpandedDepth={3} />
                    </div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="curl">
                <div className="relative">
                  <pre className="overflow-x-auto rounded-md border border-line bg-canvas p-3 pr-10 font-mono text-[12px] leading-5 text-ink">{result.curl || 'No cURL was built'}</pre>
                  <button
                    type="button"
                    onClick={() => void onCopy(result.curl, 'curlBlock')}
                    aria-label="Copy cURL"
                    className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-md border border-line bg-surface text-ink-tertiary hover:text-ink"
                  >
                    {copied === 'curlBlock' ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
                  </button>
                </div>
              </TabsContent>
            </Tabs>
            {result.diagnostics.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-line pt-2.5">
                {result.diagnostics.map((note, index) => (
                  <li key={index} className="text-[12px] leading-4 text-ink-secondary">
                    {note}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="min-w-0 rounded-lg border border-line bg-surface shadow-xs">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <span className="text-[13px] font-medium text-ink">History</span>
          <Badge variant="neutral">{logs.length}</Badge>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onRefresh}>
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={onClear} disabled={!logs.length}>
              <Eraser className="size-3.5" />
              Clear
            </Button>
          </div>
        </div>
        <ul className="max-h-[300px] divide-y divide-line overflow-y-auto">
          {!logs.length && <li className="px-3.5 py-6 text-center text-[12.5px] text-ink-tertiary">Run a request and it will appear here and in the api_request_logs table.</li>}
          {logs.map((log) => (
            <li key={log.id}>
              <button type="button" onClick={() => onRestore(log)} className="flex min-h-10 w-full items-center gap-2 px-3 text-left hover:bg-surface-muted">
                <span className={cn('w-8 shrink-0 font-mono text-[11px]', log.ok ? 'text-ok' : 'text-danger')}>{log.status ?? 'err'}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{log.endpoint}</span>
                <span className="shrink-0 font-mono text-[11px] text-ink-tertiary">{log.durationMs ?? '—'} ms</span>
                <span className="shrink-0 text-[11px] tabular-nums text-ink-tertiary">{new Date(log.at).toLocaleTimeString('en-US')}</span>
              </button>
            </li>
          ))}
        </ul>
        {!!logs.length && <p className="border-t border-line px-3 py-2 text-[11px] leading-4 text-ink-tertiary">Authorization, Bearer, refresh token, cookie and the PKCE verifier are replaced with [REDACTED] before storage (§30).</p>}
      </div>
    </section>
  )
}

function DocRow({ term, value, mono }: { term: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="shrink-0 text-ink-tertiary">{term}:</dt>
      <dd className={cn('min-w-0 text-ink-secondary', mono && 'font-mono text-[12px] text-ink')}>{value}</dd>
    </div>
  )
}

function HeaderTable({ rows, emptyLabel }: { rows: Array<[string, string]>; emptyLabel: string }) {
  if (!rows.length) return <p className="py-3 text-[12.5px] text-ink-tertiary">{emptyLabel}</p>
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <table className="w-full border-collapse text-left">
        <tbody>
          {rows.map(([key, value]) => (
            <tr key={key} className="border-b border-line last:border-0">
              <th scope="row" className={cn('w-[38%] px-2.5 py-1.5 align-top font-mono text-[11.5px] font-normal', /redacted/i.test(value) ? 'text-danger' : 'text-ink-tertiary')}>
                {key}
              </th>
              <td className={cn('break-all px-2.5 py-1.5 font-mono text-[11.5px]', /redacted/i.test(value) ? 'text-danger' : 'text-ink')}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Available before a Send, so the operator can hand a command to someone else. */
function previewCurl(entry: CatalogEntry, pathParams: Record<string, string>) {
  const host = 'https://owner-api.teslamotors.com'
  const path = entry.path.replace(':id', pathParams.id || '{id}').replace(':vehicle_id', pathParams.vehicle_id || '{vehicle_id}')
  const lines = [`curl -X ${entry.method} '${host}${path}'`, "  -H 'Accept: application/json'", "  -H 'Authorization: Bearer [REDACTED]'"]
  if (entry.method !== 'GET') lines.push("  -H 'Content-Type: application/json'", `  --data '${entry.sampleBody ?? '{}'}'`)
  return lines.join('\n')
}

function DiagnosticsPanel({ diagnostics, onRetry }: { diagnostics: Diagnostics | null; onRetry: () => void }) {
  if (!diagnostics) {
    return (
      <div className="min-h-0 flex-1 space-y-2" aria-busy="true">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-14 animate-pulse rounded-lg border border-line bg-surface-muted" />
        ))}
      </div>
    )
  }
  const blocking = diagnostics.items.filter((item) => item.state === 'fail')
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-4 overflow-y-auto xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="min-w-0 rounded-lg border border-line bg-surface shadow-xs">
        <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
          <span className="text-[13px] font-medium text-ink">Integration status</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onRetry}>
            <RefreshCw className="size-3.5" />
            Re-check
          </Button>
        </div>
        <ul className="divide-y divide-line">
          {diagnostics.items.map((item) => (
            <li key={item.id} className="flex items-start gap-2.5 px-3.5 py-2.5">
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                  item.state === 'pass' ? 'bg-ok-soft text-ok' : item.state === 'fail' ? 'bg-danger-soft text-danger' : 'bg-surface-muted text-ink-tertiary',
                )}
              >
                {item.state === 'pass' ? '✓' : item.state === 'fail' ? '✗' : '?'}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] text-ink">{item.label}</span>
                <span className="mt-0.5 block text-[12px] leading-4 break-words text-ink-tertiary">{item.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="border-t border-line px-3.5 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-tertiary">History tables</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {Object.entries(diagnostics.historyTables).map(([table, state]) => (
              <Badge key={table} variant={state === 'pass' ? 'ok' : 'warn'} className="font-mono lowercase">
                {table}
              </Badge>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] leading-4 text-ink-tertiary">
            Amber means the table does not exist yet. Files 004 and 005 are in supabase/migrations/; the app runs without them, but history is not accumulated.
          </p>
        </div>
      </section>

      <section className="min-w-0 space-y-4">
        {blocking.length > 0 && (
          <div className="rounded-lg border border-warn-line bg-warn-soft p-3.5">
            <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
              <AlertTriangle className="size-4 shrink-0 text-warn" />
              What is blocking live data
            </p>
            <ul className="mt-2 space-y-2">
              {blocking.map((item) => (
                <li key={item.id} className="text-[12.5px] leading-5 text-ink-secondary">
                  <span className="font-medium text-ink">{item.label}.</span> {item.detail}
                </li>
              ))}
            </ul>
            {blocking.some((item) => item.id === 'owner_api') && (
              <p className="mt-2.5 border-t border-warn-line pt-2.5 text-[12.5px] leading-5 text-ink-secondary">
                A 403 whose body points at the Fleet API docs is not a platform lockout — TeslaMate still uses the Owner API for personal tokens, and its tracker shows two
                causes with this exact answer. <span className="font-medium text-ink">Check the account grant first:</span> the
                <span className="font-mono text-[12px]"> vehicle_data</span> scope has to be enabled on the account itself
                (accounts.tesla.com → Security), not only in the app details — no code change fixes that one.
                <span className="font-medium text-ink"> The second</span> is an access token minted over HTTP/1.1 or TLS 1.2: Tesla pins its auth host to HTTP/2 + TLS 1.3 for
                exactly this reason, token calls here do the same, so run<span className="font-mono text-[12px]"> Refresh access token</span> under Authentication and re-check
                this item. Note that SSO accepting the token proves nothing either way — in every reported case the token call returned 200 right up to the 403.
              </p>
            )}
          </div>
        )}
        <div className="min-w-0 rounded-lg border border-line bg-surface shadow-xs">
          <p className="border-b border-line px-3.5 py-2.5 text-[13px] font-medium text-ink">Recent failures</p>
          {!diagnostics.recentFailures.length ? (
            <p className="px-3.5 py-6 text-center text-[12.5px] text-ink-tertiary">No failed requests in the log.</p>
          ) : (
            <ul className="divide-y divide-line">
              {diagnostics.recentFailures.map((failure) => (
                <li key={failure.id} className="px-3.5 py-2.5">
                  <p className="flex items-center gap-2 font-mono text-[12px] text-ink">
                    <span className="text-danger">{failure.status ?? 'err'}</span>
                    <span className="min-w-0 truncate">{failure.endpoint}</span>
                  </p>
                  <p className="mt-0.5 break-words text-[12px] leading-4 text-ink-tertiary">
                    {failure.kind} · {new Date(failure.at).toLocaleString('en-US')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
