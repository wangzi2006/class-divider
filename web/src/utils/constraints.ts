import type { Constraint, ConstraintDraft } from "@/domain/types"

export type ConstraintParseError = {
  line: number
  raw: string
  message: string
}

export function parseConstraintDrafts(text: string): { drafts: ConstraintDraft[]; errors: ConstraintParseError[] } {
  const lines = text
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  const drafts: ConstraintDraft[] = []
  const errors: ConstraintParseError[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]
    const parts = raw
      .split(/[,\uFF0C]/g)
      .map((p) => p.trim())
      .filter(Boolean)
    const lineNo = i + 1
    if (parts.length !== 3) {
      errors.push({ line: lineNo, raw, message: "格式应为 3 段：A,B,类型 或 A,固定班级,班级编号" })
      continue
    }
    const [a, b, kind] = parts
    if (kind === "不在同班") {
      drafts.push({ kind: "pair", aName: a, bName: b, type: 2, line: lineNo, raw })
      continue
    }
    if (kind === "必须同班") {
      drafts.push({ kind: "pair", aName: a, bName: b, type: 1, line: lineNo, raw })
      continue
    }
    if (b === "固定班级") {
      const classNo1 = Number(kind)
      if (!Number.isFinite(classNo1) || classNo1 <= 0) {
        errors.push({ line: lineNo, raw, message: "固定班级的班级编号必须是正整数" })
        continue
      }
      drafts.push({ kind: "fixed", aName: a, classNo1: Math.floor(classNo1), line: lineNo, raw })
      continue
    }
    errors.push({ line: lineNo, raw, message: "第三段类型应为：不在同班 / 必须同班；或使用 A,固定班级,班级编号" })
  }

  return { drafts, errors }
}

export function buildNameIndex(names: string[]) {
  const map = new Map<string, number[]>()
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i]
    const arr = map.get(name) ?? []
    arr.push(i)
    map.set(name, arr)
  }
  return map
}

export function resolveConstraintDrafts(args: {
  drafts: ConstraintDraft[]
  nameIndex: Map<string, number[]>
  classNum: number
  resolve: (line: number, role: "a" | "b", name: string, options: number[]) => number | null
}): { constraints: Constraint[]; errors: ConstraintParseError[] } {
  const errors: ConstraintParseError[] = []
  const constraints: Constraint[] = []

  for (const d of args.drafts) {
    const aOptions = args.nameIndex.get(d.aName) ?? []
    if (aOptions.length === 0) {
      errors.push({ line: d.line, raw: d.raw, message: `找不到姓名：${d.aName}` })
      continue
    }
    const a = aOptions.length === 1 ? aOptions[0] : args.resolve(d.line, "a", d.aName, aOptions)
    if (a == null) {
      errors.push({ line: d.line, raw: d.raw, message: `未选择重名学生：${d.aName}` })
      continue
    }

    if (d.kind === "pair") {
      const bOptions = args.nameIndex.get(d.bName) ?? []
      if (bOptions.length === 0) {
        errors.push({ line: d.line, raw: d.raw, message: `找不到姓名：${d.bName}` })
        continue
      }
      const b = bOptions.length === 1 ? bOptions[0] : args.resolve(d.line, "b", d.bName, bOptions)
      if (b == null) {
        errors.push({ line: d.line, raw: d.raw, message: `未选择重名学生：${d.bName}` })
        continue
      }
      constraints.push({ type: d.type, a, b, raw: d.raw })
      continue
    }

    const cls0 = d.classNo1 - 1
    if (cls0 < 0 || cls0 >= args.classNum) {
      errors.push({ line: d.line, raw: d.raw, message: `班级编号超出范围：应为 1..${args.classNum}` })
      continue
    }
    constraints.push({ type: 3, a, b: cls0, raw: d.raw })
  }

  return { constraints, errors }
}

