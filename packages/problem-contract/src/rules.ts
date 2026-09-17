import GoBoard, { type SignMap } from '@sabaki/go-board';
import { colorToSign, oppositeColor, pointToVertex } from './coordinates';
import type { Color, Move, ProblemV1 } from './schema';

export type RulesState = {
  board: GoBoard;
  toPlay: Color;
  seenSituations: ReadonlySet<string>;
  aliveAnchors: ReadonlySet<number>;
  ply: number;
};

export type MoveError = 'occupied' | 'suicide' | 'superko' | 'outside-board' | 'wrong-turn';

export type MoveResult =
  | { ok: true; state: RulesState; captured: number[] }
  | { ok: false; reason: MoveError };

export function createRulesState(problem: ProblemV1): RulesState {
  const signMap: SignMap = Array.from(
    { length: problem.boardSize },
    () => Array<0 | 1 | -1>(problem.boardSize).fill(0),
  );
  for (const point of problem.setup.black) {
    const [x, y] = pointToVertex(point, problem.boardSize);
    signMap[y]![x] = 1;
  }
  for (const point of problem.setup.white) {
    const [x, y] = pointToVertex(point, problem.boardSize);
    signMap[y]![x] = -1;
  }

  let state: RulesState = {
    board: new GoBoard(signMap),
    toPlay: problem.history.moves[0]?.[0] ?? problem.toPlay,
    seenSituations: new Set<string>(),
    aliveAnchors: new Set(problem.goal.anchors),
    ply: 0,
  };
  state = { ...state, seenSituations: new Set([situationKey(state.board.signMap, state.toPlay)]) };

  for (const [color, move] of problem.history.moves) {
    const replay = applyMove(state, color, move, problem.boardSize);
    if (!replay.ok) throw new Error(`Invalid provided history at ply ${state.ply}: ${replay.reason}`);
    state = replay.state;
  }
  if (state.toPlay !== problem.toPlay) {
    throw new Error(`History ends with ${state.toPlay} to play, expected ${problem.toPlay}`);
  }
  return state;
}

export function applyMove(
  state: RulesState,
  color: Color,
  move: Move,
  boardSize: number,
): MoveResult {
  if (state.toPlay !== color) return { ok: false, reason: 'wrong-turn' };
  const nextColor = oppositeColor(color);

  if (move === 'pass') {
    const nextSeen = new Set(state.seenSituations);
    nextSeen.add(situationKey(state.board.signMap, nextColor));
    return {
      ok: true,
      captured: [],
      state: { ...state, board: state.board.clone(), toPlay: nextColor, seenSituations: nextSeen, ply: state.ply + 1 },
    };
  }

  if (move < 0 || move >= boardSize ** 2) return { ok: false, reason: 'outside-board' };
  const vertex = pointToVertex(move, boardSize);
  const analysis = state.board.analyzeMove(colorToSign(color), vertex);
  if (analysis.overwrite) return { ok: false, reason: 'occupied' };
  if (analysis.suicide) return { ok: false, reason: 'suicide' };

  const nextBoard = state.board.makeMove(colorToSign(color), vertex, {
    preventOverwrite: true,
    preventSuicide: true,
  });
  const key = situationKey(nextBoard.signMap, nextColor);
  if (state.seenSituations.has(key)) return { ok: false, reason: 'superko' };

  const captured: number[] = [];
  for (let point = 0; point < boardSize ** 2; point += 1) {
    const [x, y] = pointToVertex(point, boardSize);
    if (state.board.signMap[y]![x] !== 0 && nextBoard.signMap[y]![x] === 0) captured.push(point);
  }
  const nextAnchors = new Set(state.aliveAnchors);
  for (const point of nextAnchors) {
    const [x, y] = pointToVertex(point, boardSize);
    if (nextBoard.signMap[y]![x] !== state.board.signMap[y]![x]) nextAnchors.delete(point);
  }
  const nextSeen = new Set(state.seenSituations);
  nextSeen.add(key);

  return {
    ok: true,
    captured,
    state: {
      board: nextBoard,
      toPlay: nextColor,
      seenSituations: nextSeen,
      aliveAnchors: nextAnchors,
      ply: state.ply + 1,
    },
  };
}

export function situationKey(signMap: SignMap, toPlay: Color): string {
  return `${toPlay}:${signMap.map(row => row.join('')).join('/')}`;
}

export function stateFingerprint(state: RulesState): string {
  return situationKey(state.board.signMap, state.toPlay);
}
