import {
  applyMove,
  createRulesState,
  hashRulesState,
  type Move,
  type NodeV1,
  type ProblemV1,
  type RulesState,
} from '@goba/problem-contract';

export type SessionPhase =
  | 'ready'
  | 'unknown'
  | 'illegal'
  | 'wrong'
  | 'success'
  | 'failure'
  | 'content-error';

export type PlayedStep = {
  node: number;
  move: Move;
  by: 'student' | 'opponent';
  verdict: 'correct' | 'wrong' | 'unclassified';
};

export type PuzzleSession = {
  attemptId: string;
  problem: ProblemV1;
  nodeId: number;
  rulesState: RulesState;
  phase: SessionPhase;
  message: string;
  path: PlayedStep[];
  hintCount: number;
  demoIndex: number;
};

export async function startSession(problem: ProblemV1): Promise<PuzzleSession> {
  const rulesState = createRulesState(problem);
  const session: PuzzleSession = {
    attemptId: crypto.randomUUID(),
    problem,
    nodeId: problem.root,
    rulesState,
    phase: 'ready',
    message: 'Найдите лучший ход.',
    path: [],
    hintCount: 0,
    demoIndex: 0,
  };
  return verifyCurrentState(session);
}

export type SessionCheckpoint = Pick<
  PuzzleSession,
  'attemptId' | 'nodeId' | 'phase' | 'message' | 'path' | 'hintCount' | 'demoIndex'
> & {
  problemId: string;
  revision: number;
  updatedAt: string;
};

export function createCheckpoint(session: PuzzleSession): SessionCheckpoint {
  return {
    attemptId: session.attemptId,
    problemId: session.problem.problemId,
    revision: session.problem.revision,
    nodeId: session.nodeId,
    phase: session.phase,
    message: session.message,
    path: session.path,
    hintCount: session.hintCount,
    demoIndex: session.demoIndex,
    updatedAt: new Date().toISOString(),
  };
}

export async function restoreSession(
  problem: ProblemV1,
  checkpoint: SessionCheckpoint,
): Promise<PuzzleSession> {
  if (checkpoint.problemId !== problem.problemId || checkpoint.revision !== problem.revision) {
    throw new Error('Checkpoint belongs to another problem revision');
  }
  let nodeId = problem.root;
  let rulesState = createRulesState(problem);
  for (const [index, step] of checkpoint.path.entries()) {
    if (step.node !== nodeId) throw new Error(`Checkpoint node mismatch at step ${index}`);
    const node = problem.nodes[nodeId]!;
    const edge = node.edges.find(candidate => candidate.move === step.move);
    if (!edge) throw new Error(`Checkpoint edge missing at step ${index}`);
    const applied = applyMove(rulesState, node.toPlay, step.move, problem.boardSize);
    if (!applied.ok) throw new Error(`Checkpoint contains illegal move at step ${index}`);
    rulesState = applied.state;
    nodeId = edge.next;
  }
  if (nodeId !== checkpoint.nodeId) throw new Error('Checkpoint final node mismatch');
  return verifyCurrentState({
    attemptId: checkpoint.attemptId,
    problem,
    nodeId,
    rulesState,
    phase: checkpoint.phase,
    message: checkpoint.message,
    path: checkpoint.path,
    hintCount: checkpoint.hintCount,
    demoIndex: Number.isInteger(checkpoint.demoIndex)
      ? Math.min(checkpoint.demoIndex, checkpoint.path.length)
      : checkpoint.path.length,
  });
}

export function stepDemonstration(session: PuzzleSession, delta: -1 | 1): PuzzleSession {
  if (session.phase !== 'failure') return session;
  return {
    ...session,
    demoIndex: Math.max(0, Math.min(session.path.length, session.demoIndex + delta)),
  };
}

export function displayedRulesState(session: PuzzleSession): RulesState {
  if (session.phase !== 'failure' || session.demoIndex === session.path.length) return session.rulesState;
  let state = createRulesState(session.problem);
  for (const step of session.path.slice(0, session.demoIndex)) {
    const node = session.problem.nodes[step.node]!;
    const applied = applyMove(state, node.toPlay, step.move, session.problem.boardSize);
    if (!applied.ok) return session.rulesState;
    state = applied.state;
  }
  return state;
}

export type PlayStudentMoveOptions = {
  beforeOpponentReply?: (sessionAfterStudentMove: PuzzleSession) => void | Promise<void>;
};

export async function playStudentMove(
  session: PuzzleSession,
  move: Move,
  options: PlayStudentMoveOptions = {},
): Promise<PuzzleSession> {
  if (!['ready', 'unknown', 'illegal'].includes(session.phase)) return session;
  const node = currentNode(session);
  if (node.toPlay !== session.problem.studentColor) {
    return contentError(session, 'Ожидался ход соперника, но ответ не задан.');
  }

  const applied = applyMove(session.rulesState, node.toPlay, move, session.problem.boardSize);
  if (!applied.ok) {
    return {
      ...session,
      phase: 'illegal',
      message: illegalMoveMessage(applied.reason),
    };
  }
  const edge = node.edges.find(candidate => candidate.move === move);
  if (!edge || edge.verdict === 'unclassified') {
    return {
      ...session,
      phase: 'unknown',
      message: 'Этот ход ещё не проверен. Попробуйте другой.',
    };
  }

  let next: PuzzleSession = {
    ...session,
    nodeId: edge.next,
    rulesState: applied.state,
    path: [...session.path, { node: session.nodeId, move, by: 'student', verdict: edge.verdict }],
    phase: edge.verdict === 'wrong' ? 'wrong' : 'ready',
    message: edge.verdict === 'wrong' ? 'Соперник может опровергнуть этот ход.' : 'Верно. Смотрим ответ соперника…',
  };
  next = await verifyCurrentState(next);
  if (next.phase === 'content-error') return next;

  const beforeReply = terminalPhase(edge.verdict === 'wrong' ? { ...next, phase: 'ready' } : next);
  if (beforeReply.phase !== 'ready') return beforeReply;
  if (currentNode(beforeReply).toPlay !== beforeReply.problem.studentColor) {
    await options.beforeOpponentReply?.(beforeReply);
  }
  return advanceDefaultReplies(beforeReply);
}

export function revealHint(session: PuzzleSession): PuzzleSession {
  if (!['ready', 'unknown', 'illegal'].includes(session.phase)) return session;
  const solution = currentNode(session).edges.find(edge => edge.verdict === 'correct' && edge.role === 'solution');
  if (!solution) return contentError(session, 'Для этой позиции нет подготовленной подсказки.');
  return {
    ...session,
    hintCount: session.hintCount + 1,
    message: solution.move === 'pass'
      ? 'Подсказка: здесь нужен пасс.'
      : `Подсказка: рассмотрите ${formatPoint(solution.move, session.problem.boardSize)}.`,
  };
}

export async function restartSession(session: PuzzleSession): Promise<PuzzleSession> {
  return startSession(session.problem);
}

async function advanceDefaultReplies(session: PuzzleSession): Promise<PuzzleSession> {
  let next = terminalPhase(session);
  while (next.phase === 'ready' && currentNode(next).toPlay !== next.problem.studentColor) {
    const node = currentNode(next);
    if (node.defaultReply === undefined) return contentError(next, 'У позиции соперника отсутствует defaultReply.');
    const edge = node.edges[node.defaultReply];
    if (!edge) return contentError(next, 'defaultReply указывает за пределы списка ходов.');
    const applied = applyMove(next.rulesState, node.toPlay, edge.move, next.problem.boardSize);
    if (!applied.ok) return contentError(next, `Подготовленный ответ нелегален: ${applied.reason}.`);
    next = {
      ...next,
      nodeId: edge.next,
      rulesState: applied.state,
      path: [...next.path, { node: next.nodeId, move: edge.move, by: 'opponent', verdict: edge.verdict }],
      message: 'Ваш ход.',
    };
    next = await verifyCurrentState(next);
    if (next.phase === 'content-error') return next;
    next = terminalPhase(next);
  }
  return next;
}

async function verifyCurrentState(session: PuzzleSession): Promise<PuzzleSession> {
  const expected = currentNode(session).stateHash;
  const actual = await hashRulesState(session.rulesState);
  return expected === actual
    ? session
    : contentError(session, 'Состояние доски не совпало с проверенным деревом. Попытка не будет оценена.');
}

function terminalPhase(session: PuzzleSession): PuzzleSession {
  const terminal = currentNode(session).terminal;
  if (!terminal) return session;
  return {
    ...session,
    phase: terminal.result,
    message: terminal.explanation,
    demoIndex: session.path.length,
  };
}

function currentNode(session: PuzzleSession): NodeV1 {
  return session.problem.nodes[session.nodeId]!;
}

function contentError(session: PuzzleSession, message: string): PuzzleSession {
  return { ...session, phase: 'content-error', message };
}

function illegalMoveMessage(reason: string): string {
  if (reason === 'occupied') return 'Эта точка уже занята.';
  if (reason === 'suicide') return 'Этот ход — самоубийство группы.';
  if (reason === 'superko') return 'Этот ход повторяет прежнюю позицию.';
  return 'Этот ход недопустим.';
}

function formatPoint(point: number, boardSize: number): string {
  const x = point % boardSize;
  const y = Math.floor(point / boardSize);
  const letters = 'ABCDEFGHJKLMNOPQRST';
  return `${letters[x]}${boardSize - y}`;
}
