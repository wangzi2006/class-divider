import { useEffect, useMemo, useRef, useState } from "react"
import { Card } from "@/components/Card"
import { ColumnChecklist } from "@/components/ColumnChecklist"
import { TablePreview } from "@/components/TablePreview"
import { useAppStore } from "@/store/useAppStore"
import { guessNameColumn, readFirstSheet } from "@/utils/excel"
import { prepareDataset, upsertTopK } from "@/utils/prepare"
import { buildNameIndex, parseConstraintDrafts, resolveConstraintDrafts } from "@/utils/constraints"
import type { ConstraintParseError } from "@/utils/constraints"
import type { ConstraintDraft } from "@/domain/types"
import { buildResultWorkbook, downloadWorkbook } from "@/utils/export"

function guessSubjectColumns(columns: string[], rows: Record<string, unknown>[], nameColumn: string) {
  const sample = rows.slice(0, Math.min(60, rows.length))
  const scored = columns
    .filter((c) => c !== nameColumn)
    .map((col) => {
      let numeric = 0
      let nonEmpty = 0
      for (const r of sample) {
        const v = r[col]
        const s = String(v ?? "").trim()
        if (!s) continue
        nonEmpty += 1
        const n = Number(s)
        if (Number.isFinite(n)) numeric += 1
      }
      const ratio = nonEmpty > 0 ? numeric / nonEmpty : 0
      return { col, score: ratio * nonEmpty }
    })
    .filter((x) => x.score > 10)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.col)
  return scored.slice(0, Math.min(6, scored.length))
}

function formatErrors(errors: ConstraintParseError[]) {
  return errors
    .slice(0, 8)
    .map((e) => `第${e.line}行：${e.message}`)
    .join("；")
}

export default function Home() {
  const table = useAppStore((s) => s.table)
  const mapping = useAppStore((s) => s.mapping)
  const prepared = useAppStore((s) => s.prepared)
  const weights = useAppStore((s) => s.weights)
  const params = useAppStore((s) => s.params)
  const constraintsText = useAppStore((s) => s.constraintsText)
  const constraints = useAppStore((s) => s.constraints)
  const workerState = useAppStore((s) => s.worker)
  const setTable = useAppStore((s) => s.setTable)
  const setMapping = useAppStore((s) => s.setMapping)
  const setPrepared = useAppStore((s) => s.setPrepared)
  const setWeights = useAppStore((s) => s.setWeights)
  const setParams = useAppStore((s) => s.setParams)
  const setConstraintsText = useAppStore((s) => s.setConstraintsText)
  const setConstraints = useAppStore((s) => s.setConstraints)
  const setWorker = useAppStore((s) => s.setWorker)

  const [fileName, setFileName] = useState("")
  const [mapError, setMapError] = useState<string | null>(null)
  const [constraintDrafts, setConstraintDrafts] = useState<ConstraintDraft[]>([])
  const [constraintErrors, setConstraintErrors] = useState<ConstraintParseError[]>([])
  const [resolutions, setResolutions] = useState<Record<string, number>>({})
  const [labelFilter, setLabelFilter] = useState("")
  const [labelBulkValue, setLabelBulkValue] = useState("")

  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    const w = new Worker(new URL("../workers/anneal.worker.ts", import.meta.url), { type: "module" })
    workerRef.current = w
    w.onmessage = (e: MessageEvent<any>) => {
      const msg = e.data
      if (msg?.type === "progress") {
        setWorker({ status: "running", progress: msg.progress })
        return
      }
      if (msg?.type === "done") {
        setWorker({ status: "done", progress: msg.progress, result: msg.result })
        return
      }
      if (msg?.type === "error") {
        setWorker({ status: "error", progress: msg.progress })
      }
    }
    return () => {
      w.terminate()
    }
  }, [setWorker])

  const nameIndex = useMemo(() => (prepared ? buildNameIndex(prepared.names) : null), [prepared])

  const labelOrderText = useMemo(() => {
    if (!prepared) return ""
    const parts = [...prepared.subjects.map((s) => `学科:${s.name}`), ...prepared.labels.map((l) => `标签:${l.name}`)]
    return parts.join("；")
  }, [prepared])

  const canPrepare =
    !!table &&
    mapping.nameColumn &&
    mapping.subjectColumns.length > 0 &&
    mapping.rowStart1 >= 2 &&
    mapping.rowEnd1 >= mapping.rowStart1 &&
    mapping.rowEnd1 <= table.rows.length + 1

  const canRun =
    workerState.status !== "running" &&
    !!prepared &&
    !!weights &&
    weights.subjectWeights.length === prepared.subjects.length &&
    weights.labelWeights.length === prepared.labels.length

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <header className="mb-8 flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">分班程序（纯前端）</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">上传 Excel → 配置列与约束 → 模拟退火 → 导出结果 Excel</p>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="1. 上传 Excel" right={fileName ? <span className="text-xs text-zinc-500">{fileName}</span> : null}>
            <div className="flex flex-col gap-3">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  setMapError(null)
                  setFileName(f.name)
                  try {
                    const t = await readFirstSheet(f)
                    setTable(t)
                    const guessedNameCol = guessNameColumn(t.columns, t.rows)
                    setMapping({ nameColumn: guessedNameCol })
                    const guessedSubjects = guessSubjectColumns(t.columns, t.rows, guessedNameCol)
                    setMapping({ subjectColumns: guessedSubjects })
                  } catch (err) {
                    const message = err instanceof Error ? err.message : String(err)
                    setMapError(message)
                    setTable(null)
                  }
                }}
                className="block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm file:mr-4 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:file:bg-zinc-100 dark:file:text-zinc-900 dark:hover:file:bg-white"
              />
              {mapError ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{mapError}</div> : null}
              {table ? <div className="text-xs text-zinc-600 dark:text-zinc-400">读取到 {table.rows.length} 行，{table.columns.length} 列（sheet: {table.sheetName}）</div> : null}
            </div>
          </Card>

          <Card title="2. 预览与行列选择">
            {!table ? (
              <div className="text-sm text-zinc-600 dark:text-zinc-400">请先上传 Excel。</div>
            ) : (
              <div className="flex flex-col gap-4">
                <TablePreview table={table} />

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">姓名列</div>
                    <select
                      value={mapping.nameColumn}
                      onChange={(e) => setMapping({ nameColumn: e.target.value })}
                      className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <option value="" disabled>
                        请选择
                      </option>
                      {table.columns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">分后的班级数</div>
                    <input
                      type="number"
                      value={params.classNum}
                      min={2}
                      onChange={(e) => setParams({ classNum: Math.max(2, Math.floor(Number(e.target.value) || 2)) })}
                      className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">起始行号（Excel 行号）</div>
                    <input
                      type="number"
                      value={mapping.rowStart1}
                      min={2}
                      max={table.rows.length + 1}
                      onChange={(e) => {
                        const v = Math.max(2, Math.floor(Number(e.target.value) || 2))
                        setMapping({ rowStart1: v, rowEnd1: Math.max(v, mapping.rowEnd1) })
                      }}
                      className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">结束行号（Excel 行号）</div>
                    <input
                      type="number"
                      value={mapping.rowEnd1}
                      min={mapping.rowStart1}
                      max={table.rows.length + 1}
                      onChange={(e) => {
                        const v = Math.max(mapping.rowStart1, Math.floor(Number(e.target.value) || mapping.rowStart1))
                        setMapping({ rowEnd1: Math.min(table.rows.length + 1, v) })
                      }}
                      className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">学科成绩列（多选）</div>
                  <ColumnChecklist columns={table.columns.filter((c) => c !== mapping.nameColumn)} value={mapping.subjectColumns} onChange={(v) => setMapping({ subjectColumns: v })} />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">0/1 标签列</div>
                    <ColumnChecklist
                      columns={table.columns.filter((c) => c !== mapping.nameColumn && !mapping.subjectColumns.includes(c))}
                      value={mapping.labelColumns01}
                      onChange={(v) => setMapping({ labelColumns01: v })}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">OneHot 类别标签列（空白不展开）</div>
                    <ColumnChecklist
                      columns={table.columns.filter((c) => c !== mapping.nameColumn && !mapping.subjectColumns.includes(c) && !mapping.labelColumns01.includes(c))}
                      value={mapping.enumLabelColumns}
                      onChange={(v) => setMapping({ enumLabelColumns: v })}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                    前K名 / 后K名（每门学科单独输入 K 列表；正数=前K，负数=后K；包含并列）
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {mapping.subjectColumns.map((subject) => {
                      const ks = mapping.topKBySubject[subject] ?? []
                      return (
                        <label key={subject} className="flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                          <span className="font-medium text-zinc-700 dark:text-zinc-200">{subject}</span>
                          <input
                            className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-800 dark:bg-zinc-950"
                            placeholder="例如：10,20,-15"
                            defaultValue={ks.join(",")}
                            onBlur={(e) => setMapping(upsertTopK(mapping, subject, e.target.value))}
                          />
                        </label>
                      )
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    disabled={!canPrepare}
                    onClick={() => {
                      if (!table) return
                      if (!mapping.nameColumn) return
                      if (mapping.subjectColumns.length === 0) return
                      const ds = prepareDataset(table, mapping)
                      setPrepared(ds)
                      setWeights({
                        subjectWeights: Array.from({ length: ds.subjects.length }, () => 1),
                        labelWeights: Array.from({ length: ds.labels.length }, () => 1),
                      })
                    }}
                    className="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400"
                  >
                    导入数据集
                  </button>
                  {prepared ? (
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">
                      学生 {prepared.names.length} 人；学科 {prepared.subjects.length}；标签 {prepared.labels.length}
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </Card>

          <Card title="3. 特殊硬性约束">
            <div className="flex flex-col gap-3">
              <textarea
                value={constraintsText}
                onChange={(e) => setConstraintsText(e.target.value)}
                placeholder={"支持三种格式（使用英文逗号分隔）：\n1) 张三,李四,不在同班\n2) 张三,李四,必须同班\n3) 张三,固定班级,3"}
                className="h-48 w-full resize-none rounded-lg border border-zinc-200 bg-white p-3 text-xs leading-relaxed shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  disabled={!prepared}
                  onClick={() => {
                    const { drafts, errors } = parseConstraintDrafts(constraintsText)
                    setConstraintDrafts(drafts)
                    setConstraintErrors(errors)
                    setResolutions({})
                    setConstraints([])
                  }}
                  className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  解析
                </button>
                <button
                  disabled={!prepared || !nameIndex}
                  onClick={() => {
                    if (!prepared || !nameIndex) return
                    const { constraints: cs, errors } = resolveConstraintDrafts({
                      drafts: constraintDrafts,
                      nameIndex,
                      classNum: params.classNum,
                      resolve: (line, role, name, options) => {
                        const key = `${line}:${role}:${name}`
                        const selected = resolutions[key]
                        if (options.length === 1) return options[0]
                        if (selected == null) return null
                        return selected
                      },
                    })
                    setConstraints(cs)
                    setConstraintErrors(errors)
                  }}
                  className="h-9 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400"
                >
                  生成约束
                </button>
                {constraints.length > 0 ? <span className="text-xs text-zinc-600 dark:text-zinc-400">已生成 {constraints.length} 条约束</span> : null}
              </div>

              {!prepared ? <div className="text-xs text-zinc-500">请先在上一步导入数据集（确保姓名列已确定）；先按“解析”（无事发生是正常的），再按“生成约束”；核对约束个数是否正确。</div> : null}

              {prepared && nameIndex && constraintDrafts.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">重名消歧（仅对出现重名的姓名显示）</div>
                  <div className="grid grid-cols-1 gap-2">
                    {constraintDrafts.flatMap((d) => {
                      const items: { line: number; role: "a" | "b"; name: string }[] = [{ line: d.line, role: "a", name: d.aName }]
                      if (d.kind === "pair") items.push({ line: d.line, role: "b", name: d.bName })
                      return items
                    }).map((it) => {
                      const options = nameIndex.get(it.name) ?? []
                      if (options.length <= 1) return null
                      const key = `${it.line}:${it.role}:${it.name}`
                      return (
                        <label key={key} className="flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                          <span className="text-zinc-600 dark:text-zinc-400">
                            第{it.line}行 {it.role.toUpperCase()}：{it.name}
                          </span>
                          <select
                            value={resolutions[key] ?? ""}
                            onChange={(e) => setResolutions((m) => ({ ...m, [key]: Number(e.target.value) }))}
                            className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-800 dark:bg-zinc-950"
                          >
                            <option value="" disabled>
                              请选择具体学生
                            </option>
                            {options.map((idx) => (
                              <option key={idx} value={idx}>
                                {prepared.names[idx]}（原始行号 {prepared.rowNo1[idx]}）
                              </option>
                            ))}
                          </select>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {constraintErrors.length > 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{formatErrors(constraintErrors)}</div>
              ) : null}
            </div>
          </Card>

          <Card title="4. 参数与权重">
            {!prepared || !weights ? (
              <div className="text-sm text-zinc-600 dark:text-zinc-400">请先生成数据集。</div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-zinc-600 dark:text-zinc-400">iterationsPerTemp</span>
                    <input
                      type="number"
                      value={params.iterationsPerTemp}
                      min={100}
                      onChange={(e) => setParams({ iterationsPerTemp: Math.max(100, Math.floor(Number(e.target.value) || 100)) })}
                      className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-zinc-600 dark:text-zinc-400">initialT</span>
                    <input
                      type="number"
                      value={params.initialT}
                      min={1}
                      onChange={(e) => setParams({ initialT: Math.max(1, Number(e.target.value) || 1) })}
                      className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-zinc-600 dark:text-zinc-400">coolingRate</span>
                    <input
                      type="number"
                      step="0.01"
                      value={params.coolingRate}
                      min={0.1}
                      max={0.99}
                      onChange={(e) => setParams({ coolingRate: Math.min(0.99, Math.max(0.1, Number(e.target.value) || 0.7)) })}
                      className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-zinc-600 dark:text-zinc-400">endT</span>
                    <input
                      type="number"
                      value={params.endT}
                      min={0.0001}
                      onChange={(e) => setParams({ endT: Math.max(0.0001, Number(e.target.value) || 1) })}
                      className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-zinc-600 dark:text-zinc-400">ratDist</span>
                    <input
                      type="number"
                      value={params.ratDist}
                      min={0}
                      onChange={(e) => setParams({ ratDist: Math.max(0, Number(e.target.value) || 0) })}
                      className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-zinc-600 dark:text-zinc-400">penaltyHard</span>
                    <input
                      type="number"
                      value={params.penaltyHard}
                      min={0}
                      onChange={(e) => setParams({ penaltyHard: Math.max(0, Number(e.target.value) || 0) })}
                      className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </label>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">学科权重</div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {prepared.subjects.map((s, idx) => (
                      <label key={s.name} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                        <span className="truncate text-zinc-700 dark:text-zinc-200">{s.name}</span>
                        <input
                          type="number"
                          value={weights.subjectWeights[idx] ?? 1}
                          onChange={(e) => {
                            const next = [...weights.subjectWeights]
                            next[idx] = Number(e.target.value) || 0
                            setWeights({ ...weights, subjectWeights: next })
                          }}
                          className="h-8 w-24 rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-800 dark:bg-zinc-950"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200">标签权重</div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const next = Array.from({ length: prepared.labels.length }, () => 1)
                          setWeights({ ...weights, labelWeights: next })
                        }}
                        className="h-8 rounded-lg border border-zinc-200 bg-white px-3 text-xs shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                      >
                        全部设为 1
                      </button>
                      <button
                        onClick={() => {
                          const next = Array.from({ length: prepared.labels.length }, () => 0)
                          setWeights({ ...weights, labelWeights: next })
                        }}
                        className="h-8 rounded-lg border border-zinc-200 bg-white px-3 text-xs shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                      >
                        全部设为 0
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <input
                      value={labelFilter}
                      onChange={(e) => setLabelFilter(e.target.value)}
                      placeholder="搜索标签（支持子串）"
                      className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                    />
                    <input
                      value={labelBulkValue}
                      onChange={(e) => setLabelBulkValue(e.target.value)}
                      placeholder="批量权重（数字）"
                      className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                    />
                    <button
                      onClick={() => {
                        const v = Number(labelBulkValue)
                        if (!Number.isFinite(v)) return
                        const next = [...weights.labelWeights]
                        const q = labelFilter.trim().toLowerCase()
                        for (let i = 0; i < prepared.labels.length; i += 1) {
                          const name = prepared.labels[i].name.toLowerCase()
                          if (!q || name.includes(q)) next[i] = v
                        }
                        setWeights({ ...weights, labelWeights: next })
                      }}
                      className="h-9 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
                    >
                      对筛选结果应用
                    </button>
                  </div>

                  <div className="max-h-72 overflow-auto rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
                    <div className="grid grid-cols-1 gap-2">
                      {prepared.labels.map((l, idx) => {
                        const q = labelFilter.trim().toLowerCase()
                        if (q && !l.name.toLowerCase().includes(q)) return null
                        return (
                          <label
                            key={l.name}
                            className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                          >
                            <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-200">{l.name}</span>
                            <input
                              type="number"
                              value={weights.labelWeights[idx] ?? 1}
                              onChange={(e) => {
                                const next = [...weights.labelWeights]
                                next[idx] = Number(e.target.value) || 0
                                setWeights({ ...weights, labelWeights: next })
                              }}
                              className="h-8 w-24 rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-800 dark:bg-zinc-950"
                            />
                          </label>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                  当前权重顺序：{labelOrderText}
                </div>
              </div>
            )}
          </Card>

          <Card title="5. 运行模拟退火">
            {!prepared || !weights ? (
              <div className="text-sm text-zinc-600 dark:text-zinc-400">请先生成数据集，并配置权重。</div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    disabled={!canRun}
                    onClick={() => {
                      const w = workerRef.current
                      if (!w) return
                      setWorker({ status: "running", progress: { phase: "init", message: "启动..." } })
                      w.postMessage({
                        type: "run",
                        payload: {
                          names: prepared.names,
                          scores: prepared.scores,
                          categories: prepared.categories,
                          subjectNum: prepared.subjects.length,
                          labelNum: prepared.labels.length,
                          params,
                          weights,
                          constraints,
                        },
                      })
                    }}
                    className="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400"
                  >
                    开始
                  </button>
                  <button
                    disabled={workerState.status !== "running"}
                    onClick={() => workerRef.current?.postMessage({ type: "stop" })}
                    className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    停止
                  </button>
                </div>

                {workerState.status === "running" ? (
                  <div className="rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                    {workerState.progress.phase} {workerState.progress.message ? `- ${workerState.progress.message}` : ""}
                    {workerState.progress.bestScore != null ? <div>bestScore: {workerState.progress.bestScore.toFixed(2)}</div> : null}
                    {workerState.progress.currentScore != null ? <div>currentScore: {workerState.progress.currentScore.toFixed(2)}</div> : null}
                    {workerState.progress.currentT != null ? <div>T: {workerState.progress.currentT.toFixed(3)}</div> : null}
                    {workerState.progress.iter != null ? <div>iter: {workerState.progress.iter}</div> : null}
                    {workerState.progress.swapPerSec != null ? <div>swap/s: {workerState.progress.swapPerSec.toFixed(0)}</div> : null}
                  </div>
                ) : null}

                {workerState.status === "error" ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{workerState.progress.message}</div>
                ) : null}

                {workerState.status === "done" ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    完成。bestScore: {workerState.result.bestScore.toFixed(2)}
                  </div>
                ) : null}
              </div>
            )}
          </Card>

          <Card title="6. 导出 Excel">
            {workerState.status !== "done" || !prepared ? (
              <div className="text-sm text-zinc-600 dark:text-zinc-400">运行完成后可导出。</div>
            ) : (
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    const wb = buildResultWorkbook({
                      dataset: prepared,
                      classIndex0: workerState.result.classIndex,
                      classNum: params.classNum,
                      params,
                      constraints,
                      bestScore: workerState.result.bestScore,
                    })
                    downloadWorkbook(wb, "分班结果.xlsx")
                  }}
                  className="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
                >
                  下载 分班结果.xlsx
                </button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
