import tsumego from 'tsumego.js';
import { hashBytes, oppositeColor, pointToVertex, type Color } from '@goba/problem-contract';
import type { CanonicalTask, SolveRequest, SolveResult } from '../domain';

type RawSolverResult = {
  rootMove: string;
  proofs: string[];
  tree?: string;
};

export async function runTsumegoJs(request: SolveRequest): Promise<SolveResult> {
  const started = performance.now();
  const inputHash = await hashBytes(new TextEncoder().encode(stableJson(request)));
  const effectiveSgf = canonicalTaskToSolverSgf(request.task);
  const effectivePositionHash = await hashBytes(new TextEncoder().encode(effectiveSgf));
  const base = {
    jobId: request.jobId,
    perspective: 'student-goal' as const,
    inputHash,
    effectivePositionHash,
    rulesProfile: request.task.rules.profile,
    solver: {
      name: 'tsumego.js',
      sourceSha: 'npm:tsumego.js@1.1.0',
      binarySha256: 'sha256:runtime-javascript-source-pinned-by-lockfile',
      configSha256: await hashBytes(new TextEncoder().encode(request.configurationId)),
      adapterVersion: 'tsumego-js-adapter-v1',
    },
  };

  const admissionError = admissionReason(request.task);
  if (admissionError) {
    return {
      ...base,
      status: 'unsupported',
      outcome: 'unknown',
      artifacts: { rawResult: JSON.stringify({ admissionError }), logs: '' },
      coverage: 'root-proof',
      statistics: { wallMs: performance.now() - started },
      reason: 'scope',
    };
  }

  try {
    const solver = new tsumego.Solver(effectiveSgf);
    for (const [color, move] of request.forcedPath) {
      const encoded = move === 'pass' ? `${color}[]` : `${color}[${pointToSgf(move, request.task.position.boardSize)}]`;
      if (!solver.play(encoded)) throw new Error(`Forced path contains illegal move ${encoded}`);
    }
    const rootMove = solver.solve(request.task.studentColor);
    if (!rootMove) {
      const raw: RawSolverResult = { rootMove: '', proofs: [] };
      return {
        ...base,
        status: 'proven-loss',
        outcome: oppositeOutcome(request.task),
        artifacts: { rawResult: JSON.stringify(raw), logs: '' },
        coverage: 'root-proof',
        statistics: { wallMs: performance.now() - started },
      };
    }

    const proofs = [...solver.proofs(request.task.studentColor)];
    const treeDriver = solver.tree(request.task.studentColor, request.wrongMoveDepth, false);
    let input: unknown = undefined;
    let stepCount = 0;
    let rawTree = '';
    while (stepCount <= request.limits.maxNodes) {
      const step = treeDriver.next(input as never);
      if (step.done) {
        rawTree = step.value;
        break;
      }
      stepCount += 1;
      if (step.value === 'B' || step.value === 'W') {
        input = firstThreat(solver, step.value);
      } else {
        input = false;
      }
    }
    if (!rawTree) {
      return {
        ...base,
        status: 'unknown',
        outcome: 'unknown',
        artifacts: {
          rawResult: JSON.stringify({ rootMove, proofs }),
          logs: `Tree driver exceeded ${request.limits.maxNodes} interaction steps`,
        },
        coverage: 'root-proof',
        statistics: { wallMs: performance.now() - started, nodes: stepCount },
        reason: 'incomplete-tree',
      };
    }

    const raw: RawSolverResult = { rootMove, proofs, tree: rawTree };
    return {
      ...base,
      status: 'proven-win',
      outcome: taskOutcome(request.task),
      artifacts: { rawResult: JSON.stringify(raw), rawTree, logs: '' },
      coverage: 'partial-expanded',
      statistics: { wallMs: performance.now() - started, nodes: stepCount },
    };
  } catch (error) {
    return {
      ...base,
      status: 'error',
      outcome: 'unknown',
      artifacts: {
        rawResult: '{}',
        logs: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      },
      coverage: 'root-proof',
      statistics: { wallMs: performance.now() - started },
      reason: 'crash',
    };
  }
}

export function canonicalTaskToSolverSgf(task: CanonicalTask): string {
  const props = [
    'FF[4]',
    'GM[1]',
    `SZ[${task.position.boardSize}]`,
    encodePoints('AB', task.position.setup.black, task.position.boardSize),
    encodePoints('AW', task.position.setup.white, task.position.boardSize),
    `MA[${pointToSgf(task.goal.anchors[0]!, task.position.boardSize)}]`,
    `PL[${task.position.toPlay}]`,
  ].filter(Boolean).join('');
  return `(;${props})`;
}

function admissionReason(task: CanonicalTask): string | undefined {
  if (task.position.toPlay !== task.studentColor) return 'Student color must be the side to play';
  if (task.goal.kind === 'capture' && task.studentColor === task.goal.targetColor) {
    return 'Capture goal requires the student to oppose the target color';
  }
  if (task.goal.kind === 'live' && task.studentColor !== task.goal.targetColor) {
    return 'Life goal requires the student to own the target group';
  }
  if (task.goal.ko !== 'unsupported' || task.goal.seki !== 'unsupported') return 'Ko and seki are unsupported';
  const target = task.goal.anchors[0];
  const setup = task.goal.targetColor === 'B' ? task.position.setup.black : task.position.setup.white;
  if (target === undefined || !setup.includes(target)) return 'Target anchor does not contain the target color';
  const localEmptyPoints = targetRegionEmptyPoints(task);
  if (localEmptyPoints === undefined) return 'Target group has no adjacent search region';
  if (localEmptyPoints > 15) {
    return `Target search region has ${localEmptyPoints} empty points; tsumego.js limit is 15`;
  }
  return undefined;
}

function targetRegionEmptyPoints(task: CanonicalTask): number | undefined {
  const size = task.position.boardSize;
  const occupied = new Set([...task.position.setup.black, ...task.position.setup.white]);
  const seeds = new Set<number>();
  for (const anchor of task.goal.anchors) {
    for (const point of neighbors(anchor, size)) if (!occupied.has(point)) seeds.add(point);
  }
  if (seeds.size === 0) return undefined;

  const visited = new Set<number>();
  for (const seed of seeds) {
    const pending = [seed];
    while (pending.length > 0) {
      const point = pending.pop()!;
      if (visited.has(point) || occupied.has(point)) continue;
      visited.add(point);
      for (const next of neighbors(point, size)) {
        if (!visited.has(next) && !occupied.has(next)) pending.push(next);
      }
    }
  }
  return visited.size;
}

function neighbors(point: number, size: number): number[] {
  const x = point % size;
  const y = Math.floor(point / size);
  const result: number[] = [];
  if (x > 0) result.push(point - 1);
  if (x + 1 < size) result.push(point + 1);
  if (y > 0) result.push(point - size);
  if (y + 1 < size) result.push(point + size);
  return result;
}

function firstThreat(solver: tsumego.Solver, color: Color): string | null {
  for (const threat of solver.threats(color)) return threat;
  return null;
}

function taskOutcome(task: CanonicalTask): SolveResult['outcome'] {
  return task.goal.kind === 'capture' ? 'target-captured' : 'unconditional-life';
}

function oppositeOutcome(task: CanonicalTask): SolveResult['outcome'] {
  return task.goal.kind === 'capture' ? 'unconditional-life' : 'target-captured';
}

function encodePoints(property: string, points: number[], size: number): string {
  return points.length === 0 ? '' : `${property}${points.map(point => `[${pointToSgf(point, size)}]`).join('')}`;
}

function pointToSgf(point: number, size: number): string {
  const [x, y] = pointToVertex(point, size);
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  return `${letters[x]}${letters[y]}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
