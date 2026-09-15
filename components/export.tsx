'use client'

import React, { useState } from 'react'
import { Dialog } from '@/components/ui/forms'

export type ExportFormat = 'csv' | 'json' | 'pdf'
export type ExportData = Record<string, unknown> | Array<Record<string, unknown>>

export function ExportDialog({
  isOpen,
  onCloseAction,
  onExportAction,
}: {
  isOpen: boolean
  onCloseAction: () => void
  onExportAction: (format: ExportFormat) => void
}) {
  const [format, setFormat] = useState<ExportFormat>('csv')

  const handleExport = () => {
    onExportAction(format)
    onCloseAction()
  }

  return (
    <Dialog
      isOpen={isOpen}
      title="Export Data"
      description="Choose format to export your vehicle data"
      onClose={onCloseAction}
      actions={[
        {
          label: 'Export',
          onClick: handleExport,
          variant: 'primary',
        },
      ]}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          {(['csv', 'json', 'pdf'] as const).map((fmt) => (
            <label key={fmt} className="flex cursor-pointer items-center gap-3">
              <input
                type="radio"
                name="format"
                value={fmt}
                checked={format === fmt}
                onChange={(e) => setFormat(e.target.value as ExportFormat)}
                className="h-4 w-4"
              />
              <span className="font-medium uppercase text-gray-900 dark:text-white">{fmt} format</span>
            </label>
          ))}
        </div>
      </div>
    </Dialog>
  )
}

export function useDataExport() {
  const [isOpen, setIsOpen] = useState(false)
  const exportCounterRef = React.useRef(1)

  const nextExportName = (ext: 'json' | 'csv') => {
    const seq = exportCounterRef.current
    exportCounterRef.current += 1
    return `export-${seq}.${ext}`
  }

  const downloadFile = (blob: Blob, filename: string) => {
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const convertToCSV = (data: ExportData) => {
    if (Array.isArray(data) && data.length > 0) {
      const headers = Object.keys(data[0])
      const rows = data.map((row) => headers.map((header) => JSON.stringify(row[header] ?? '')).join(','))
      return [headers.join(','), ...rows].join('\n')
    }
    return JSON.stringify(data)
  }

  const exportAsPrintableDocument = (data: ExportData) => {
    const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700')
    if (!w) return

    const pretty = JSON.stringify(data, null, 2)
    const escaped = pretty.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

    w.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Export</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 24px; }
      h1 { font-size: 18px; margin: 0 0 12px; }
      pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.4; }
      @media print { body { margin: 0; } }
    </style>
  </head>
  <body>
    <h1>Data Export</h1>
    <pre>${escaped}</pre>
    <script>window.print()</script>
  </body>
</html>`)
    w.document.close()
  }

  const exportData = (data: ExportData, format: ExportFormat) => {
    if (format === 'json') {
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      downloadFile(blob, nextExportName('json'))
      return
    }

    if (format === 'csv') {
      const csv = convertToCSV(data)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      downloadFile(blob, nextExportName('csv'))
      return
    }

    exportAsPrintableDocument(data)
  }

  return { isOpen, setIsOpen, exportData }
}
