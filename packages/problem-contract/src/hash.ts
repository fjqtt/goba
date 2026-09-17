import type { RulesState } from './rules';
import type { ProblemV1 } from './schema';

export type ProblemSemantics = Pick<
  ProblemV1,
  'boardSize' | 'setup' | 'toPlay' | 'studentColor' | 'history' | 'rules' | 'goal'
>;

export function stateHashPayload(state: RulesState): string {
  return JSON.stringify({
    board: state.board.signMap,
    toPlay: state.toPlay,
    seenSituations: [...state.seenSituations].sort(),
    aliveAnchors: [...state.aliveAnchors].sort((a, b) => a - b),
  });
}

export async function hashRulesState(state: RulesState): Promise<string> {
  return sha256(stateHashPayload(state));
}

export function semanticHashPayload(problem: ProblemSemantics): string {
  return JSON.stringify({
    boardSize: problem.boardSize,
    setup: {
      black: [...problem.setup.black].sort((a, b) => a - b),
      white: [...problem.setup.white].sort((a, b) => a - b),
    },
    toPlay: problem.toPlay,
    studentColor: problem.studentColor,
    history: problem.history,
    rules: problem.rules,
    goal: problem.goal,
  });
}

export async function hashProblemSemantics(problem: ProblemSemantics): Promise<string> {
  return sha256(semanticHashPayload(problem));
}

async function sha256(value: string): Promise<string> {
  return hashBytes(new TextEncoder().encode(value));
}

export async function hashBytes(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
}
