import type { Color, Move } from './schema';

export const colorToSign = (color: Color): 1 | -1 => color === 'B' ? 1 : -1;
export const oppositeColor = (color: Color): Color => color === 'B' ? 'W' : 'B';

export function pointToVertex(point: number, boardSize: number): [number, number] {
  return [point % boardSize, Math.floor(point / boardSize)];
}

export function vertexToPoint([x, y]: readonly [number, number], boardSize: number): number {
  return y * boardSize + x;
}

export function moveKey(move: Move): string {
  return move === 'pass' ? 'pass' : String(move);
}
