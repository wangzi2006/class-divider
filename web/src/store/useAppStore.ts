import { create } from "zustand"
import type { AnnealParams, AnnealProgress, AnnealResult, Constraint, ExcelTable, MappingConfig, PreparedDataset, WeightConfig } from "@/domain/types"

type WorkerState =
  | { status: "idle" }
  | { status: "running"; progress: AnnealProgress }
  | { status: "done"; progress: AnnealProgress; result: AnnealResult }
  | { status: "error"; progress: AnnealProgress }

type AppState = {
  table: ExcelTable | null
  mapping: MappingConfig
  constraintsText: string
  constraints: Constraint[]
  prepared: PreparedDataset | null
  weights: WeightConfig | null
  params: AnnealParams
  worker: WorkerState
  setTable: (table: ExcelTable | null) => void
  setMapping: (patch: Partial<MappingConfig>) => void
  setConstraintsText: (text: string) => void
  setConstraints: (constraints: Constraint[]) => void
  setPrepared: (prepared: PreparedDataset | null) => void
  setWeights: (weights: WeightConfig | null) => void
  setParams: (patch: Partial<AnnealParams>) => void
  setWorker: (worker: WorkerState) => void
}

const defaultMapping: MappingConfig = {
  nameColumn: "",
  rowStart1: 2,
  rowEnd1: 2,
  subjectColumns: [],
  labelColumns01: [],
  enumLabelColumns: [],
  topKBySubject: {},
}

const defaultParams: AnnealParams = {
  classNum: 8,
  iterationsPerTemp: 5000,
  initialT: 10000,
  coolingRate: 0.9,
  endT: 1,
  ratDist: 10,
  penaltyHard: 300,
}

export const useAppStore = create<AppState>((set) => ({
  table: null,
  mapping: defaultMapping,
  constraintsText: "",
  constraints: [],
  prepared: null,
  weights: null,
  params: defaultParams,
  worker: { status: "idle" },
  setTable: (table) =>
    set(() => ({
      table,
      mapping: table ? { ...defaultMapping, rowEnd1: Math.max(2, table.rows.length + 1) } : defaultMapping,
      prepared: null,
      constraints: [],
      weights: null,
      worker: { status: "idle" },
    })),
  setMapping: (patch) => set((s) => ({ mapping: { ...s.mapping, ...patch }, prepared: null, constraints: [], weights: null })),
  setConstraintsText: (text) => set(() => ({ constraintsText: text })),
  setConstraints: (constraints) => set(() => ({ constraints })),
  setPrepared: (prepared) => set(() => ({ prepared })),
  setWeights: (weights) => set(() => ({ weights })),
  setParams: (patch) => set((s) => ({ params: { ...s.params, ...patch } })),
  setWorker: (worker) => set(() => ({ worker })),
}))
