import sgf, { type SgfNode } from '@sabaki/sgf';
import { pointToVertex, vertexToPoint, type Color } from '@goba/problem-contract';
import type { Position } from '../domain';

const GTP_COLUMNS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

export type KataGoQuery = {
  id: string;
  initialStones: Array<[Color, string]>;
  initialPlayer: Color;
  moves: Array<[Color, string]>;
  rules: 'aga';
  komi: 0;
  boardXSize: number;
  boardYSize: number;
  analyzeTurns: number[];
  maxVisits: number;
  analysisPVLen: number;
  includePolicy: true;
  includeOwnership: false;
  rootPolicyTemperature: number;
  rootFpuReductionMax: number;
  allowMoves: Array<{ player: Color; moves: string[]; untilDepth: number }>;
};

export type KataGoMoveInfo = {
  move: string;
  order: number;
  visits: number;
  prior: number;
  scoreLead?: number;
  winrate?: number;
  pv?: string[];
};

export type KataGoResult = {
  id: string;
  turnNumber?: number;
  moveInfos?: KataGoMoveInfo[];
  policy?: number[];
  error?: string;
};

export type CrosscheckMetadata = {
  id: string;
  corpus: 'exact' | 'reconciled' | 'genuine-key' | 'genuine-sgf';
  problemNumber: number;
  auditStatus: string;
  ply: number;
  position: Position;
  prefix: Array<[Color, number]>;
  player: Color;
  expectedMoves: number[];
  generatorMoves: number[];
  expectedMoveLegality: 'legal' | 'occupied' | 'suicide' | 'superko' | 'outside-board' | 'wrong-turn' | 'unknown';
  allowedMoves: number[];
};

export function makeKataGoQuery(metadata: CrosscheckMetadata, maxVisits: number): KataGoQuery {
  const size = metadata.position.boardSize;
  return {
    id: metadata.id,
    initialStones: [
      ...metadata.position.setup.black.map(point => ['B', pointToGtp(point, size)] as [Color, string]),
      ...metadata.position.setup.white.map(point => ['W', pointToGtp(point, size)] as [Color, string]),
    ],
    initialPlayer: metadata.position.toPlay,
    moves: metadata.prefix.map(([color, point]) => [color, pointToGtp(point, size)]),
    rules: 'aga',
    komi: 0,
    boardXSize: size,
    boardYSize: size,
    analyzeTurns: [metadata.ply],
    maxVisits,
    analysisPVLen: 12,
    includePolicy: true,
    includeOwnership: false,
    rootPolicyTemperature: 1.4,
    rootFpuReductionMax: 0,
    allowMoves: [{
      player: metadata.player,
      moves: metadata.allowedMoves.map(point => pointToGtp(point, size)),
      untilDepth: metadata.ply + 1,
    }],
  };
}

export function pointToGtp(point: number, size: number): string {
  const [x, y] = pointToVertex(point, size);
  return `${GTP_COLUMNS[x]}${size - y}`;
}

export function gtpToPoint(value: string, size: number): number | undefined {
  if (value.toUpperCase() === 'PASS') return undefined;
  const x = GTP_COLUMNS.indexOf(value[0]!.toUpperCase());
  const row = Number.parseInt(value.slice(1), 10);
  if (x < 0 || !Number.isInteger(row) || row < 1 || row > size) return undefined;
  return vertexToPoint([x, size - row], size);
}

export function policyRank(
  policy: number[] | undefined,
  point: number,
  allowedMoves: number[],
): { rank?: number; value?: number } {
  const value = policy?.[point];
  if (value === undefined || value < 0) return {};
  const ranked = allowedMoves
    .map(candidate => ({ candidate, value: policy?.[candidate] ?? -1 }))
    .filter(item => item.value >= 0)
    .sort((left, right) => right.value - left.value || left.candidate - right.candidate);
  const index = ranked.findIndex(item => item.candidate === point);
  return { ...(index >= 0 ? { rank: index + 1 } : {}), value };
}

export function readGeneratedMovesByPrefix(
  rawTree: string,
  position: Position,
): Map<string, number[]> {
  const roots = sgf.parse(rawTree);
  const moves = new Map<string, Set<number>>();
  const visit = (node: SgfNode, prefix: Array<[Color, number]>): void => {
    const nodeColor: Color | undefined = node.data.B ? 'B' : node.data.W ? 'W' : undefined;
    if (nodeColor && ((node.data[nodeColor] ?? [''])[0] ?? '') === '') return;
    const move = readMove(node, position.boardSize);
    let nextPrefix = prefix;
    if (move) {
      if (prefix.length === 0 && move[0] !== position.toPlay) return;
      const key = prefixKey(prefix);
      const values = moves.get(key) ?? new Set<number>();
      values.add(move[1]);
      moves.set(key, values);
      nextPrefix = [...prefix, move];
    }
    for (const child of node.children) visit(child, nextPrefix);
  };
  for (const root of roots) for (const child of root.children) visit(child, []);
  return new Map([...moves].map(([key, values]) => [key, [...values].sort(numeric)]));
}

export function prefixKey(prefix: Array<[Color, number]>): string {
  return prefix.map(([color, point]) => `${color}:${point}`).join(',');
}

function readMove(node: SgfNode, boardSize: number): [Color, number] | undefined {
  const color: Color | undefined = node.data.B ? 'B' : node.data.W ? 'W' : undefined;
  if (!color) return undefined;
  const encoded = (node.data[color] ?? [''])[0] ?? '';
  if (!encoded) return undefined;
  return [color, vertexToPoint(sgf.parseVertex(encoded), boardSize)];
}

function numeric(left: number, right: number): number {
  return left - right;
}
