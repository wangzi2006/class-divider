export type ConstraintType = 1 | 2 | 3

export type ConstraintTextKind = "不在同班" | "必须同班" | "固定班级"

export type ConstraintDraft =
  | { kind: "pair"; aName: string; bName: string; type: 1 | 2; line: number; raw: string }
  | { kind: "fixed"; aName: string; classNo1: number; line: number; raw: string }

export type ResolvedStudentRef = {
  name: string
  studentIndex: number
}

export type Constraint = {
  type: ConstraintType
  a: number
  b: number
  raw: string
}

export type ExcelTable = {
  sheetName: string
  columns: string[]
  rows: Record<string, unknown>[]
}

export type MappingConfig = {
  nameColumn: string
  rowStart1: number
  rowEnd1: number
  subjectColumns: string[]
  labelColumns01: string[]
  enumLabelColumns: string[]
  topKBySubject: Record<string, number[]>
}

export type PreparedDataset = {
  names: string[]
  rowNo1: number[]
  subjects: { name: string }[]
  labels: { name: string; group: string }[]
  scores: Float32Array
  categories: Uint8Array
}

export type AnnealParams = {
  classNum: number
  iterationsPerTemp: number
  initialT: number
  coolingRate: number
  endT: number
  ratDist: number
  penaltyHard: number
}

export type WeightConfig = {
  subjectWeights: number[]
  labelWeights: number[]
}

export type AnnealProgress = {
  phase: "init" | "running" | "done" | "stopped" | "error"
  message?: string
  currentT?: number
  round?: number
  totalRounds?: number
  iter?: number
  accepted?: number
  bestScore?: number
  currentScore?: number
  swapPerSec?: number
}

export type AnnealResult = {
  bestScore: number
  classIndex: Int16Array
  classAverages: Float32Array
  classLabelCounts: Int16Array
}
