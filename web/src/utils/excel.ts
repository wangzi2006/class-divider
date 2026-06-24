import * as XLSX from "xlsx"
import type { ExcelTable } from "@/domain/types"

function toSafeColumnName(name: string, idx: number) {
  const trimmed = String(name ?? "").trim()
  const base = trimmed.length > 0 ? trimmed : `列${idx + 1}`
  if (base === "__proto__" || base === "prototype" || base === "constructor") {
    return `列${idx + 1}_${base}`
  }
  return base
}

export async function readFirstSheet(file: File): Promise<ExcelTable> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: "array" })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    throw new Error("未找到 sheet")
  }
  const sheet = wb.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" })
  if (raw.length === 0) {
    return { sheetName, columns: [], rows: [] }
  }
  const headerRow = raw[0] as unknown[]
  const columns = headerRow.map((c, idx) => toSafeColumnName(String(c), idx))
  const seen = new Map<string, number>()
  for (let i = 0; i < columns.length; i += 1) {
    const k = columns[i]
    const n = seen.get(k) ?? 0
    seen.set(k, n + 1)
    if (n > 0) columns[i] = `${k}_${n + 1}`
  }
  const rows = raw.slice(1).map((r) => {
    const arr = Array.isArray(r) ? r : []
    const obj: Record<string, unknown> = {}
    for (let i = 0; i < columns.length; i += 1) {
      obj[columns[i]] = arr[i] ?? ""
    }
    return obj
  })
  return { sheetName, columns, rows }
}

export function guessNameColumn(columns: string[], rows: Record<string, unknown>[]) {
  const byKeyword = columns.find((c) => /姓名|名字|name/i.test(c))
  if (byKeyword) return byKeyword

  const sample = rows.slice(0, Math.min(50, rows.length))
  let best = ""
  let bestScore = -1
  for (const col of columns) {
    let textCount = 0
    let uniq = new Set<string>()
    for (const r of sample) {
      const v = r[col]
      const s = String(v ?? "").trim()
      if (!s) continue
      if (s.length > 1 && s.length < 10 && !/^\d+(\.\d+)?$/.test(s)) {
        textCount += 1
        uniq.add(s)
      }
    }
    if (textCount === 0) continue
    const ratio = uniq.size / textCount
    const score = textCount * 0.6 + ratio * 10
    if (score > bestScore) {
      bestScore = score
      best = col
    }
  }
  return best || (columns[0] ?? "")
}
