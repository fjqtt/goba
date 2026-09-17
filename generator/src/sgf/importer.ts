import sgf, { type SgfNode } from '@sabaki/sgf';
import { hashBytes, vertexToPoint, type Color } from '@goba/problem-contract';
import type { DraftRecord, ImportSource, Position, TargetCandidate } from '../domain';

type PositionNode = { node: SgfNode; path: SgfNode[]; ordinal: number };

export class SgfImportError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'SgfImportError';
  }
}

export type SgfImportResult = {
  assetSha256: string;
  drafts: DraftRecord[];
};

export async function importSgfCollection(
  content: string,
  source: ImportSource,
): Promise<SgfImportResult> {
  let roots: SgfNode[];
  try {
    roots = sgf.parse(content);
  } catch (error) {
    throw new SgfImportError('invalid-sgf', error instanceof Error ? error.message : 'SGF parsing failed');
  }
  if (roots.length === 0) throw new SgfImportError('empty-sgf', 'SGF contains no game trees');

  const assetSha256 = await hashBytes(new TextEncoder().encode(content));
  const positions = findPositionNodes(roots);
  if (positions.length === 0) {
    throw new SgfImportError('no-positions', 'SGF contains no nodes with setup stones');
  }

  const now = new Date().toISOString();
  const assetPrefix = assetSha256.slice('sha256:'.length, 'sha256:'.length + 16);
  const drafts = positions.map(({ node, path, ordinal }) => {
    const position = readPosition(path);
    const sourceLabel = node.data.C?.[0]?.trim() || `problem ${ordinal}`;
    return {
      draftId: `draft-${assetPrefix}-${String(ordinal).padStart(4, '0')}`,
      revision: 1,
      status: 'needs-annotation' as const,
      assetSha256,
      source: { ...source, pageOrNodePath: `/${ordinal}` },
      sourceLabel,
      position,
      viewport: calculateViewport(position),
      targetCandidates: findTargetCandidates(position),
      hasSourceTree: containsMove(node.children),
      createdAt: now,
      updatedAt: now,
    } satisfies DraftRecord;
  });

  return { assetSha256, drafts };
}

function findPositionNodes(roots: SgfNode[]): PositionNode[] {
  const result: PositionNode[] = [];
  let ordinal = 0;
  const visit = (node: SgfNode, path: SgfNode[]) => {
    const nextPath = [...path, node];
    if (hasSetup(node)) {
      ordinal += 1;
      result.push({ node, path: nextPath, ordinal });
      return;
    }
    for (const child of node.children) visit(child, nextPath);
  };
  for (const root of roots) visit(root, []);
  return result;
}

function readPosition(path: SgfNode[]): Position {
  const sizeValue = inherited(path, 'SZ')?.[0] ?? '19';
  if (sizeValue.includes(':')) throw new SgfImportError('rectangular-board', 'Rectangular SGF boards are unsupported');
  const size = Number.parseInt(sizeValue, 10);
  if (size !== 9 && size !== 13 && size !== 19) {
    throw new SgfImportError('board-size', `Unsupported board size: ${sizeValue}`);
  }

  const stones = new Map<number, Color>();
  for (const node of path) {
    applySetupValues(stones, node.data.AB, 'B', size);
    applySetupValues(stones, node.data.AW, 'W', size);
    for (const point of expandPoints(node.data.AE, size)) stones.delete(point);
  }
  const black = [...stones].filter(([, color]) => color === 'B').map(([point]) => point).sort(numeric);
  const white = [...stones].filter(([, color]) => color === 'W').map(([point]) => point).sort(numeric);
  if (black.length === 0 || white.length === 0) {
    throw new SgfImportError('missing-color', 'Each problem position must contain black and white setup stones');
  }

  const toPlayValue = inherited(path, 'PL')?.[0] ?? 'B';
  if (toPlayValue !== 'B' && toPlayValue !== 'W') {
    throw new SgfImportError('player-color', `Invalid PL value: ${toPlayValue}`);
  }
  return {
    boardSize: size,
    setup: { black, white },
    history: { policy: 'fresh-position', moves: [] },
    toPlay: toPlayValue,
  };
}

function applySetupValues(
  stones: Map<number, Color>,
  values: string[] | undefined,
  color: Color,
  boardSize: number,
): void {
  for (const point of expandPoints(values, boardSize)) {
    const occupied = stones.get(point);
    if (occupied && occupied !== color) {
      throw new SgfImportError('setup-overlap', `Both colors occupy point ${point}`);
    }
    stones.set(point, color);
  }
}

function expandPoints(values: string[] | undefined, boardSize: number): number[] {
  if (!values) return [];
  const result: number[] = [];
  for (const value of values) {
    const vertices = value.includes(':')
      ? sgf.parseCompressedVertices(value)
      : [sgf.parseVertex(value)];
    for (const [x, y] of vertices) {
      if (x < 0 || y < 0 || x >= boardSize || y >= boardSize) {
        throw new SgfImportError('coordinate', `Point ${value} is outside ${boardSize}x${boardSize}`);
      }
      result.push(vertexToPoint([x, y], boardSize));
    }
  }
  return result;
}

function findTargetCandidates(position: Position): TargetCandidate[] {
  const board = Array.from({ length: position.boardSize ** 2 }, () => undefined as Color | undefined);
  for (const point of position.setup.black) board[point] = 'B';
  for (const point of position.setup.white) board[point] = 'W';
  const seen = new Set<number>();
  const candidates: TargetCandidate[] = [];

  for (let point = 0; point < board.length; point += 1) {
    const color = board[point];
    if (!color || seen.has(point)) continue;
    const anchors: number[] = [];
    const liberties = new Set<number>();
    const pending = [point];
    seen.add(point);
    let touchesBoardEdge = false;
    while (pending.length > 0) {
      const current = pending.pop()!;
      anchors.push(current);
      const x = current % position.boardSize;
      const y = Math.floor(current / position.boardSize);
      if (x === 0 || y === 0 || x === position.boardSize - 1 || y === position.boardSize - 1) {
        touchesBoardEdge = true;
      }
      for (const neighbor of neighbors(current, position.boardSize)) {
        if (board[neighbor] === undefined) liberties.add(neighbor);
        if (board[neighbor] === color && !seen.has(neighbor)) {
          seen.add(neighbor);
          pending.push(neighbor);
        }
      }
    }
    anchors.sort(numeric);
    const rank = liberties.size * 100 + Math.min(anchors.length, 50) * 2 - (touchesBoardEdge ? 5 : 0);
    candidates.push({
      color,
      anchors,
      liberties: liberties.size,
      stoneCount: anchors.length,
      touchesBoardEdge,
      rank,
    });
  }

  return candidates.sort((left, right) => left.rank - right.rank).slice(0, 8);
}

function calculateViewport(position: Position): DraftRecord['viewport'] {
  const points = [...position.setup.black, ...position.setup.white];
  const xs = points.map(point => point % position.boardSize);
  const ys = points.map(point => Math.floor(point / position.boardSize));
  return {
    x0: Math.max(0, Math.min(...xs) - 1),
    y0: Math.max(0, Math.min(...ys) - 1),
    x1: Math.min(position.boardSize - 1, Math.max(...xs) + 1),
    y1: Math.min(position.boardSize - 1, Math.max(...ys) + 1),
  };
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

function inherited(path: SgfNode[], property: string): string[] | undefined {
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const value = path[index]!.data[property];
    if (value) return value;
  }
  return undefined;
}

function hasSetup(node: SgfNode): boolean {
  return Boolean(node.data.AB?.length || node.data.AW?.length);
}

function containsMove(nodes: SgfNode[]): boolean {
  return nodes.some(node => Boolean(node.data.B || node.data.W) || containsMove(node.children));
}

function numeric(left: number, right: number): number {
  return left - right;
}
