import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { hashBytes, pointToVertex } from '@goba/problem-contract';
import type { CanonicalTask, SolveRequest, SolveResult } from '../domain';

const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const ADAPTER_VERSION = 'gnugo-owl-adapter-v1';

type ProcessResult = { stdout: string; stderr: string; code: number };
type GtpResponse = { id: number; success: boolean; body: string };
type SolveResultBase = Pick<
  SolveResult,
  'jobId' | 'perspective' | 'inputHash' | 'effectivePositionHash' | 'rulesProfile' | 'solver'
>;

export async function executeGnuGoJob(request: SolveRequest): Promise<SolveResult> {
  const started = performance.now();
  const effectiveSgf = canonicalTaskToGnuGoSgf(request.task, request.forcedPath);
  const inputHash = await hashBytes(new TextEncoder().encode(stableJson(request)));
  const effectivePositionHash = await hashBytes(new TextEncoder().encode(effectiveSgf));
  const binary = await resolveExecutable(process.env.GNUGO_BIN ?? 'gnugo');
  const config = gnuGoArguments(request);
  const base = {
    jobId: request.jobId,
    perspective: 'student-goal' as const,
    inputHash,
    effectivePositionHash,
    rulesProfile: request.task.rules.profile,
    solver: {
      name: 'GNU Go Owl',
      sourceSha: 'gnu-go-3.8',
      binarySha256: binary
        ? await hashBytes(new Uint8Array(await readFile(binary)))
        : 'sha256:binary-not-found',
      configSha256: await hashBytes(new TextEncoder().encode(stableJson(config))),
      adapterVersion: ADAPTER_VERSION,
    },
  };

  const admissionError = admissionReason(request.task);
  if (admissionError) return unsupported(base, started, admissionError);
  if (!binary) {
    return failure(base, started, 'crash', 'GNU Go executable was not found in PATH; install with `brew install gnu-go`');
  }

  const workingDirectory = await mkdtemp(join(tmpdir(), 'goba-gnugo-'));
  const inputPath = join(workingDirectory, 'input.sgf');
  const treePath = join(workingDirectory, 'owl-tree.sgf');
  try {
    await writeFile(inputPath, effectiveSgf, 'utf8');
    const command = request.task.goal.kind === 'live' ? 'owl_defend' : 'owl_attack';
    const doesCommand = request.task.goal.kind === 'live' ? 'owl_does_defend' : 'owl_does_attack';
    const target = pointToGtp(request.task.goal.anchors[0]!, request.task.position.boardSize);
    const localCandidates = candidateMoves(request.task);
    const commands = [
      `1 ${command} ${target}`,
      ...localCandidates.map((move, index) => `${index + 2} ${doesCommand} ${move} ${target}`),
      `${localCandidates.length + 2} quit`,
    ];
    const elapsed = performance.now() - started;
    const remaining = Math.max(1, request.limits.wallMs - elapsed);
    const analysis = await runProcess(binary, [
      '--quiet', '--mode', 'gtp', '--situational-superko',
      ...config,
      '-l', inputPath,
    ], `${commands.join('\n')}\n`, remaining);
    const responses = parseGtpResponses(analysis.stdout);
    const primary = responses.find(item => item.id === 1);
    if (!primary?.success) {
      return failure(base, started, 'crash', analysis.stderr || primary?.body || 'GNU Go returned no Owl result');
    }
    const [rawCode = '0', rootMove] = primary.body.split(/\s+/);
    const code = Number.parseInt(rawCode, 10);
    const acceptedAlternatives = localCandidates.filter((_, index) => {
      const response = responses.find(item => item.id === index + 2);
      const alternativeCode = Number.parseInt(response?.body.split(/\s+/)[0] ?? '0', 10);
      return response?.success === true && alternativeCode > 0;
    });

    const elapsedAfterAnalysis = performance.now() - started;
    const treeRun = await runProcess(binary, [
      '--quiet', '--situational-superko',
      ...config,
      '-l', inputPath,
      '--decide-owl', target,
      '-o', treePath,
    ], undefined, Math.max(1, request.limits.wallMs - elapsedAfterAnalysis));
    const rawTree = await readBoundedArtifact(treePath);
    const rawResult = {
      verification: 'heuristic-candidate-only',
      command,
      target,
      code: Number.isFinite(code) ? code : 0,
      rootMove,
      acceptedAlternatives,
      candidateOutcome: code > 0 ? taskOutcome(request.task) : 'unknown',
    };

    return {
      ...base,
      // Owl is a bounded heuristic reader. A positive result is useful evidence, not a proof.
      status: 'unknown',
      outcome: 'unknown',
      artifacts: {
        rawResult: JSON.stringify(rawResult),
        ...(rawTree ? { rawTree } : {}),
        logs: [analysis.stderr, treeRun.stdout, treeRun.stderr].filter(Boolean).join('\n'),
      },
      coverage: rawTree ? 'partial-expanded' : 'root-proof',
      statistics: { wallMs: performance.now() - started },
      ...(!rawTree ? { reason: 'incomplete-tree' as const } : {}),
    };
  } catch (error) {
    if (error instanceof ProcessFailure) {
      return failure(base, started, error.reason, error.message);
    }
    return failure(base, started, 'crash', error instanceof Error ? error.message : String(error));
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

export function canonicalTaskToGnuGoSgf(
  task: CanonicalTask,
  forcedPath: SolveRequest['forcedPath'] = [],
): string {
  const size = task.position.boardSize;
  const root = [
    'FF[4]', 'GM[1]', `SZ[${size}]`,
    encodePoints('AB', task.position.setup.black, size),
    encodePoints('AW', task.position.setup.white, size),
    `PL[${task.position.toPlay}]`,
    `MA[${pointToSgf(task.goal.anchors[0]!, size)}]`,
  ].filter(Boolean).join('');
  const moves = forcedPath.map(([color, move]) => (
    `;${color}[${move === 'pass' ? '' : pointToSgf(move, size)}]`
  )).join('');
  return `(;${root}${moves})`;
}

export function parseGtpResponses(output: string): GtpResponse[] {
  return output.split(/\r?\n\r?\n/).flatMap(block => {
    const match = block.trim().match(/^([=?])(\d+)\s*([\s\S]*)$/);
    if (!match) return [];
    return [{ id: Number.parseInt(match[2]!, 10), success: match[1] === '=', body: match[3]!.trim() }];
  });
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
  if (task.boundary.kind !== 'full-board') return 'Declared local assumptions are not encoded for GNU Go';
  const anchor = task.goal.anchors[0];
  const setup = task.goal.targetColor === 'B' ? task.position.setup.black : task.position.setup.white;
  if (anchor === undefined || !setup.includes(anchor)) return 'Target anchor does not contain the target color';
  return undefined;
}

function candidateMoves(task: CanonicalTask): string[] {
  const occupied = new Set([...task.position.setup.black, ...task.position.setup.white]);
  const result: string[] = [];
  for (let y = task.viewport.y0; y <= task.viewport.y1; y += 1) {
    for (let x = task.viewport.x0; x <= task.viewport.x1; x += 1) {
      const point = y * task.position.boardSize + x;
      if (!occupied.has(point)) result.push(pointToGtp(point, task.position.boardSize));
    }
  }
  return result;
}

function gnuGoArguments(request: SolveRequest): string[] {
  const memoryMiB = Math.max(8, Math.min(512, Math.floor(request.limits.memoryMiB / 2)));
  return [
    '--level', '10',
    '--owl-node-limit', String(request.limits.maxNodes),
    '--owl-branch', '20',
    '--owl-reading', '40',
    '-M', String(memoryMiB),
  ];
}

async function resolveExecutable(command: string): Promise<string | undefined> {
  const candidates = isAbsolute(command)
    ? [command]
    : (process.env.PATH ?? '').split(delimiter).filter(Boolean).map(directory => join(directory, command));
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return await realpath(candidate);
    } catch {
      // Keep searching PATH.
    }
  }
  return undefined;
}

function runProcess(
  executable: string,
  args: string[],
  input: string | undefined,
  timeoutMs: number,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    const finishError = (reason: 'timeout' | 'memory' | 'crash', message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      reject(new ProcessFailure(reason, message));
    };
    const timer = setTimeout(() => finishError('timeout', `GNU Go exceeded ${Math.ceil(timeoutMs)} ms`), timeoutMs);
    child.stdout.on('data', chunk => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) finishError('memory', 'GNU Go output exceeded 8 MiB');
      else stdout.push(Buffer.from(chunk));
    });
    child.stderr.on('data', chunk => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) finishError('memory', 'GNU Go output exceeded 8 MiB');
      else stderr.push(Buffer.from(chunk));
    });
    child.on('error', error => finishError('crash', error.message));
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const result = {
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        code: code ?? -1,
      };
      if (code !== 0) reject(new ProcessFailure('crash', result.stderr || `GNU Go exited ${code}`));
      else resolve(result);
    });
    child.stdin.end(input);
  });
}

class ProcessFailure extends Error {
  constructor(readonly reason: 'timeout' | 'memory' | 'crash', message: string) {
    super(message);
  }
}

function unsupported(
  base: SolveResultBase,
  started: number,
  message: string,
): SolveResult {
  return {
    ...base,
    status: 'unsupported', outcome: 'unknown',
    artifacts: { rawResult: JSON.stringify({ admissionError: message }), logs: '' },
    coverage: 'root-proof', statistics: { wallMs: performance.now() - started }, reason: 'scope',
  };
}

function failure(
  base: SolveResultBase,
  started: number,
  reason: 'timeout' | 'memory' | 'crash',
  logs: string,
): SolveResult {
  return {
    ...base,
    status: 'error', outcome: 'unknown', artifacts: { rawResult: '{}', logs },
    coverage: 'root-proof', statistics: { wallMs: performance.now() - started }, reason,
  };
}

async function readBoundedArtifact(path: string): Promise<string | undefined> {
  try {
    const metadata = await stat(path);
    if (metadata.size > MAX_OUTPUT_BYTES) {
      throw new ProcessFailure('memory', 'GNU Go SGF tree exceeded 8 MiB');
    }
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof ProcessFailure) throw error;
    return undefined;
  }
}

function taskOutcome(task: CanonicalTask): SolveResult['outcome'] {
  return task.goal.kind === 'capture' ? 'target-captured' : 'unconditional-life';
}

function encodePoints(property: string, points: number[], size: number): string {
  return points.length === 0 ? '' : `${property}${points.map(point => `[${pointToSgf(point, size)}]`).join('')}`;
}

function pointToSgf(point: number, size: number): string {
  const [x, y] = pointToVertex(point, size);
  return `${'abcdefghijklmnopqrstuvwxyz'[x]}${'abcdefghijklmnopqrstuvwxyz'[y]}`;
}

function pointToGtp(point: number, size: number): string {
  const [x, y] = pointToVertex(point, size);
  return `${'ABCDEFGHJKLMNOPQRSTUVWXYZ'[x]}${size - y}`;
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
