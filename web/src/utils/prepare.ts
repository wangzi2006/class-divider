import type { ExcelTable, MappingConfig, PreparedDataset } from "@/domain/types"

function parseNumber(v: unknown) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN
  const s = String(v ?? "").trim()
  if (!s) return NaN
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

function normalizeName(v: unknown) {
  return String(v ?? "").trim()
}

function parseKList(text: string) {
  const parts = text
    .split(/[,，\s]+/g)
    .map((x) => x.trim())
    .filter(Boolean)
  const out: number[] = []
  const seen = new Set<number>()
  for (const p of parts) {
    const n0 = Number(p)
    if (!Number.isFinite(n0)) continue
    if (n0 === 0) continue
    const n = n0 > 0 ? Math.floor(n0) : Math.ceil(n0)
    if (n === 0) continue
    if (seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out
}

export function upsertTopK(mapping: MappingConfig, subject: string, kText: string): MappingConfig {
  const next = { ...mapping.topKBySubject }
  const ks = parseKList(kText)
  if (ks.length === 0) {
    delete next[subject]
  } else {
    next[subject] = ks
  }
  return { ...mapping, topKBySubject: next }
}

export function prepareDataset(table: ExcelTable, mapping: MappingConfig): PreparedDataset {
  const startExcelRow1 = Math.max(2, Math.floor(mapping.rowStart1 || 2))
  const endExcelRow1 = Math.max(startExcelRow1, Math.floor(mapping.rowEnd1 || table.rows.length + 1 || 2))
  const endClampedExcelRow1 = Math.min(endExcelRow1, table.rows.length + 1)
  const startDataIdx0 = Math.max(0, startExcelRow1 - 2)
  const endDataIdx0 = Math.max(startDataIdx0, endClampedExcelRow1 - 2)
  const selected = table.rows.slice(startDataIdx0, endDataIdx0 + 1)

  const names: string[] = []
  const rowNo1: number[] = []
  const subjects = mapping.subjectColumns.map((name) => ({ name }))

  const enumValueMap: Record<string, string[]> = {}
  for (const col of mapping.enumLabelColumns) {
    const set = new Set<string>()
    for (const r of selected) {
      const s = String(r[col] ?? "").trim()
      if (!s) continue
      set.add(s)
    }
    enumValueMap[col] = Array.from(set).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
  }

  const labels: { name: string; group: string }[] = []
  for (const col of mapping.labelColumns01) {
    labels.push({ name: col, group: col })
  }
  for (const col of mapping.enumLabelColumns) {
    for (const v of enumValueMap[col] ?? []) {
      labels.push({ name: `${col}:${v}`, group: col })
    }
  }

  const topKDefs: { subject: string; k: number; name: string }[] = []
  for (const subject of mapping.subjectColumns) {
    const ks = mapping.topKBySubject[subject] ?? []
    for (const k of ks) {
      const name = k > 0 ? `${subject}:Top${k}` : `${subject}:Bottom${Math.abs(k)}`
      topKDefs.push({ subject, k, name })
      labels.push({ name, group: subject })
    }
  }

  const n = selected.length
  const subjectNum = subjects.length
  const labelNum = labels.length
  const scores = new Float32Array(n * subjectNum)
  const categories = new Uint8Array(n * labelNum)

  for (let i = 0; i < n; i += 1) {
    const row = selected[i]
    rowNo1.push(startExcelRow1 + i)
    names.push(normalizeName(row[mapping.nameColumn]))
    for (let j = 0; j < subjectNum; j += 1) {
      const col = mapping.subjectColumns[j]
      const v = parseNumber(row[col])
      scores[i * subjectNum + j] = Number.isFinite(v) ? v : NaN
    }

    let labelIdx = 0
    for (const col of mapping.labelColumns01) {
      const v = String(row[col] ?? "").trim()
      const bit = v === "1" || v === "是" || v.toLowerCase() === "true" ? 1 : 0
      categories[i * labelNum + labelIdx] = bit
      labelIdx += 1
    }
    for (const col of mapping.enumLabelColumns) {
      const s = String(row[col] ?? "").trim()
      for (const v of enumValueMap[col] ?? []) {
        categories[i * labelNum + labelIdx] = s === v ? 1 : 0
        labelIdx += 1
      }
    }
    for (; labelIdx < labelNum; labelIdx += 1) {
      categories[i * labelNum + labelIdx] = 0
    }
  }

  for (const def of topKDefs) {
    const subjectIndex = mapping.subjectColumns.indexOf(def.subject)
    if (subjectIndex < 0) continue
    const labelIndex = labels.findIndex((l) => l.name === def.name)
    if (labelIndex < 0) continue

    const arr: number[] = []
    for (let i = 0; i < n; i += 1) {
      const v = scores[i * subjectNum + subjectIndex]
      if (Number.isFinite(v)) arr.push(v)
    }
    if (arr.length === 0) continue
    const absK = Math.max(1, Math.min(Math.abs(def.k), arr.length))
    if (def.k > 0) {
      arr.sort((a, b) => b - a)
      const threshold = arr[absK - 1]
      for (let i = 0; i < n; i += 1) {
        const v = scores[i * subjectNum + subjectIndex]
        categories[i * labelNum + labelIndex] = Number.isFinite(v) && v >= threshold ? 1 : 0
      }
    } else {
      arr.sort((a, b) => a - b)
      const threshold = arr[absK - 1]
      for (let i = 0; i < n; i += 1) {
        const v = scores[i * subjectNum + subjectIndex]
        categories[i * labelNum + labelIndex] = Number.isFinite(v) && v <= threshold ? 1 : 0
      }
    }
  }

  return {
    names,
    rowNo1,
    subjects,
    labels,
    scores,
    categories,
  }
}
