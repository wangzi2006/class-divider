import * as XLSX from "xlsx"
import type { AnnealParams, Constraint, PreparedDataset } from "@/domain/types"

export function buildResultWorkbook(args: {
  dataset: PreparedDataset
  classIndex0: Int16Array
  classNum: number
  params: AnnealParams
  constraints: Constraint[]
  bestScore: number
}) {
  const { dataset, classIndex0, classNum } = args
  const n = dataset.names.length
  const subjectNum = dataset.subjects.length
  const labelNum = dataset.labels.length

  const detailRows: Record<string, unknown>[] = []
  for (let i = 0; i < n; i += 1) {
    const row: Record<string, unknown> = { 原始行号: dataset.rowNo1[i], 姓名: dataset.names[i], 班级: `${classIndex0[i] + 1}班` }
    for (let j = 0; j < subjectNum; j += 1) {
      row[dataset.subjects[j].name] = dataset.scores[i * subjectNum + j]
    }
    for (let k = 0; k < labelNum; k += 1) {
      row[dataset.labels[k].name] = dataset.categories[i * labelNum + k]
    }
    detailRows.push(row)
  }

  const avgRows: Record<string, unknown>[] = []
  const labelRows: Record<string, unknown>[] = []

  const classSizes = new Int16Array(classNum)
  const scoreSums = new Float64Array(classNum * subjectNum)
  const labelCounts = new Int16Array(classNum * labelNum)

  for (let i = 0; i < n; i += 1) {
    const cls = classIndex0[i]
    classSizes[cls] += 1
    for (let j = 0; j < subjectNum; j += 1) {
      const v = dataset.scores[i * subjectNum + j]
      scoreSums[cls * subjectNum + j] += Number.isFinite(v) ? v : 0
    }
    for (let k = 0; k < labelNum; k += 1) {
      labelCounts[cls * labelNum + k] += dataset.categories[i * labelNum + k]
    }
  }

  for (let cls = 0; cls < classNum; cls += 1) {
    const avgRow: Record<string, unknown> = { 班级: `${cls + 1}班`, 人数: classSizes[cls] }
    for (let j = 0; j < subjectNum; j += 1) {
      avgRow[dataset.subjects[j].name] = classSizes[cls] > 0 ? scoreSums[cls * subjectNum + j] / classSizes[cls] : 0
    }
    avgRows.push(avgRow)

    const labelRow: Record<string, unknown> = { 班级: `${cls + 1}班`, 人数: classSizes[cls] }
    for (let k = 0; k < labelNum; k += 1) {
      labelRow[dataset.labels[k].name] = labelCounts[cls * labelNum + k]
    }
    labelRows.push(labelRow)
  }

  const summaryRows: Record<string, unknown>[] = []
  for (let j = 0; j < subjectNum; j += 1) {
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    for (let cls = 0; cls < classNum; cls += 1) {
      const v = classSizes[cls] > 0 ? scoreSums[cls * subjectNum + j] / classSizes[cls] : 0
      if (v < min) min = v
      if (v > max) max = v
    }
    summaryRows.push({ 项目: dataset.subjects[j].name, 最小值: min, 最大值: max, 极差: max - min, 类型: "学科均值" })
  }
  for (let k = 0; k < labelNum; k += 1) {
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    for (let cls = 0; cls < classNum; cls += 1) {
      const v = labelCounts[cls * labelNum + k]
      if (v < min) min = v
      if (v > max) max = v
    }
    summaryRows.push({ 项目: dataset.labels[k].name, 最小值: min, 最大值: max, 极差: max - min, 类型: "标签人数" })
  }

  const metaRows: Record<string, unknown>[] = [
    { 键: "bestScore", 值: args.bestScore },
    { 键: "classNum", 值: args.classNum },
    { 键: "iterationsPerTemp", 值: args.params.iterationsPerTemp },
    { 键: "initialT", 值: args.params.initialT },
    { 键: "coolingRate", 值: args.params.coolingRate },
    { 键: "endT", 值: args.params.endT },
    { 键: "ratDist", 值: args.params.ratDist },
    { 键: "penaltyHard", 值: args.params.penaltyHard },
    { 键: "constraintsCount", 值: args.constraints.length },
  ]

  const constraintRows = args.constraints.map((c) => ({
    type: c.type,
    a: c.a,
    b: c.b,
    raw: c.raw,
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "学生分班")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(avgRows), "各班学科均值")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(labelRows), "各班标签人数")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "统计汇总")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metaRows), "参数")
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(constraintRows), "约束")
  return wb
}

export function downloadWorkbook(wb: XLSX.WorkBook, fileName: string) {
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" })
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
