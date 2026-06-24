import type { AnnealParams, AnnealProgress, AnnealResult, Constraint, WeightConfig } from "@/domain/types"

type RunPayload = {
  names: string[]
  scores: Float32Array
  categories: Uint8Array
  subjectNum: number
  labelNum: number
  params: AnnealParams
  weights: WeightConfig
  constraints: Constraint[]
}

type Incoming =
  | { type: "run"; payload: RunPayload }
  | { type: "stop" }

type Outgoing =
  | { type: "progress"; progress: AnnealProgress }
  | { type: "done"; result: AnnealResult; progress: AnnealProgress }
  | { type: "error"; progress: AnnealProgress }

let stopped = false

function post(msg: Outgoing) {
  ;(self as unknown as Worker).postMessage(msg)
}

function buildAdjacency(constraints: Constraint[], n: number) {
  const adj: number[][] = Array.from({ length: n }, () => [])
  for (let i = 0; i < constraints.length; i += 1) {
    const c = constraints[i]
    adj[c.a]?.push(i)
    if (c.type === 1 || c.type === 2) {
      adj[c.b]?.push(i)
    }
  }
  return adj
}

function isConstraintViolated(type: 1 | 2 | 3, a: number, b: number, classIndex: Int16Array) {
  if (type === 1) return classIndex[a] !== classIndex[b]
  if (type === 2) return classIndex[a] === classIndex[b]
  return classIndex[a] !== b
}

function anneal(payload: RunPayload) {
  const { scores, categories, subjectNum, labelNum, params, weights, constraints } = payload
  const n = payload.names.length
  if (n === 0) throw new Error("没有学生数据")
  if (subjectNum <= 0) throw new Error("未选择学科列")
  if (params.classNum <= 1) throw new Error("班级数必须大于1")
  if (weights.subjectWeights.length !== subjectNum) throw new Error("学科权重数量不匹配")
  if (weights.labelWeights.length !== labelNum) throw new Error("标签权重数量不匹配")

  const classNum = params.classNum
  const classIndex = new Int16Array(n)
  for (let i = 0; i < n; i += 1) {
    classIndex[i] = i % classNum
  }

  const classSizes = new Int16Array(classNum)
  const classScoreSums = new Float64Array(classNum * subjectNum)
  const classLabelCounts = new Int16Array(classNum * labelNum)

  function addStudentToClass(i: number, cls: number, sign: 1 | -1) {
    classSizes[cls] = (classSizes[cls] + sign) as unknown as number
    const scoreBase = i * subjectNum
    const sumBase = cls * subjectNum
    for (let j = 0; j < subjectNum; j += 1) {
      const v = scores[scoreBase + j]
      classScoreSums[sumBase + j] += Number.isFinite(v) ? sign * v : 0
    }
    const labelBase = i * labelNum
    const cntBase = cls * labelNum
    for (let k = 0; k < labelNum; k += 1) {
      classLabelCounts[cntBase + k] = (classLabelCounts[cntBase + k] + sign * categories[labelBase + k]) as unknown as number
    }
  }

  for (let i = 0; i < n; i += 1) addStudentToClass(i, classIndex[i], 1)

  function evalScoreFromCaches() {
    let scoreDiff = 0
    for (let j = 0; j < subjectNum; j += 1) {
      let minAvg = Number.POSITIVE_INFINITY
      let maxAvg = Number.NEGATIVE_INFINITY
      for (let cls = 0; cls < classNum; cls += 1) {
        const size = classSizes[cls]
        const avg = size > 0 ? classScoreSums[cls * subjectNum + j] / size : 0
        if (avg < minAvg) minAvg = avg
        if (avg > maxAvg) maxAvg = avg
      }
      const range = maxAvg - minAvg
      const w = weights.subjectWeights[j] ?? 1
      scoreDiff += ((range * 10) ** 2) * w
    }

    let distDiff = 0
    for (let k = 0; k < labelNum; k += 1) {
      let minCnt = Number.POSITIVE_INFINITY
      let maxCnt = Number.NEGATIVE_INFINITY
      let total = 0
      for (let cls = 0; cls < classNum; cls += 1) {
        const cnt = classLabelCounts[cls * labelNum + k]
        total += cnt
        if (cnt < minCnt) minCnt = cnt
        if (cnt > maxCnt) maxCnt = cnt
      }
      if (total <= 0) continue
      const range = maxCnt - minCnt
      const w = weights.labelWeights[k] ?? 1
      distDiff += (((range ** 2) / total * params.ratDist) ** 2) * w
    }

    return scoreDiff + distDiff
  }

  const adjacency = buildAdjacency(constraints, n)

  function evalSpecialPenaltyAll() {
    let p = 0
    for (const c of constraints) {
      if (isConstraintViolated(c.type, c.a, c.b, classIndex)) p += params.penaltyHard
    }
    return p
  }

  function evalSpecialPenaltyForConstraintIndex(idx: number) {
    const c = constraints[idx]
    return isConstraintViolated(c.type, c.a, c.b, classIndex) ? params.penaltyHard : 0
  }

  let specialPenalty = evalSpecialPenaltyAll()
  let currentScore = evalScoreFromCaches() + specialPenalty
  let bestScore = currentScore
  let bestSolution = new Int16Array(classIndex)

  const totalRounds = Math.max(1, Math.ceil(Math.log(params.endT / params.initialT) / Math.log(params.coolingRate)))
  let round = 0
  let currentT = params.initialT
  let accepted = 0
  let totalIter = 0
  const startedAt = performance.now()

  post({ type: "progress", progress: { phase: "running", currentT, round, totalRounds, iter: totalIter, accepted, bestScore, currentScore } })

  while (currentT > params.endT) {
    round += 1
    for (let it = 0; it < params.iterationsPerTemp; it += 1) {
      if (stopped) {
        post({ type: "progress", progress: { phase: "stopped", message: "已停止", currentT, round, totalRounds, iter: totalIter, accepted, bestScore, currentScore } })
        return { bestScore, classIndex: bestSolution, classAverages: new Float32Array(0), classLabelCounts: new Int16Array(0) }
      }
      totalIter += 1
      let a = 0
      let b = 0
      for (let tries = 0; tries < 50; tries += 1) {
        a = (Math.random() * n) | 0
        b = (Math.random() * n) | 0
        if (a !== b && classIndex[a] !== classIndex[b]) break
      }
      if (a === b || classIndex[a] === classIndex[b]) continue

      const ca = classIndex[a]
      const cb = classIndex[b]

      const impacted = new Set<number>()
      for (const idx of adjacency[a] ?? []) impacted.add(idx)
      for (const idx of adjacency[b] ?? []) impacted.add(idx)
      let oldSpecial = 0
      for (const idx of impacted) oldSpecial += evalSpecialPenaltyForConstraintIndex(idx)

      addStudentToClass(a, ca, -1)
      addStudentToClass(a, cb, 1)
      addStudentToClass(b, cb, -1)
      addStudentToClass(b, ca, 1)
      classIndex[a] = cb
      classIndex[b] = ca

      let newSpecial = 0
      for (const idx of impacted) newSpecial += evalSpecialPenaltyForConstraintIndex(idx)
      const nextSpecialPenalty = specialPenalty + (newSpecial - oldSpecial)
      const nextScore = evalScoreFromCaches() + nextSpecialPenalty

      const delta = nextScore - currentScore
      let accept = false
      if (delta <= 0) accept = true
      else if (currentT > 0 && Math.random() < Math.exp(-delta / currentT)) accept = true

      if (accept && Number.isFinite(nextScore)) {
        currentScore = nextScore
        specialPenalty = nextSpecialPenalty
        accepted += 1
        if (currentScore < bestScore) {
          bestScore = currentScore
          bestSolution = new Int16Array(classIndex)
        }
      } else {
        addStudentToClass(a, cb, -1)
        addStudentToClass(a, ca, 1)
        addStudentToClass(b, ca, -1)
        addStudentToClass(b, cb, 1)
        classIndex[a] = ca
        classIndex[b] = cb
      }

      if (totalIter % 2000 === 0) {
        const elapsed = (performance.now() - startedAt) / 1000
        const swapPerSec = elapsed > 0 ? totalIter / elapsed : undefined
        post({
          type: "progress",
          progress: {
            phase: "running",
            currentT,
            round,
            totalRounds,
            iter: totalIter,
            accepted,
            bestScore,
            currentScore,
            swapPerSec,
          },
        })
      }
    }
    currentT *= params.coolingRate
    post({
      type: "progress",
      progress: {
        phase: "running",
        currentT,
        round,
        totalRounds,
        iter: totalIter,
        accepted,
        bestScore,
        currentScore,
      },
    })
  }

  const finalClassIndex = bestSolution
  const classAverages = new Float32Array(classNum * subjectNum)
  const finalSizes = new Int16Array(classNum)
  const finalScoreSums = new Float64Array(classNum * subjectNum)
  const finalLabelCounts = new Int16Array(classNum * labelNum)

  for (let i = 0; i < n; i += 1) {
    const cls = finalClassIndex[i]
    finalSizes[cls] += 1
    const scoreBase = i * subjectNum
    const sumBase = cls * subjectNum
    for (let j = 0; j < subjectNum; j += 1) {
      const v = scores[scoreBase + j]
      finalScoreSums[sumBase + j] += Number.isFinite(v) ? v : 0
    }
    const labelBase = i * labelNum
    const cntBase = cls * labelNum
    for (let k = 0; k < labelNum; k += 1) {
      finalLabelCounts[cntBase + k] += categories[labelBase + k]
    }
  }
  for (let cls = 0; cls < classNum; cls += 1) {
    const size = finalSizes[cls]
    for (let j = 0; j < subjectNum; j += 1) {
      classAverages[cls * subjectNum + j] = size > 0 ? (finalScoreSums[cls * subjectNum + j] / size) as number : 0
    }
  }

  return { bestScore, classIndex: finalClassIndex, classAverages, classLabelCounts: finalLabelCounts }
}

self.onmessage = (e: MessageEvent<Incoming>) => {
  const data = e.data
  if (data.type === "stop") {
    stopped = true
    return
  }
  if (data.type !== "run") return
  stopped = false
  try {
    post({ type: "progress", progress: { phase: "init", message: "初始化..." } })
    const result = anneal(data.payload)
    const progress: AnnealProgress = { phase: "done", bestScore: result.bestScore, message: "完成" }
    post({ type: "done", result, progress })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    post({ type: "error", progress: { phase: "error", message } })
  }
}

