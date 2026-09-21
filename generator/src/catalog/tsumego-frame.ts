import type { Color } from '@goba/problem-contract';
import type { Position } from '../domain';

/**
 * Fills the board outside the problem box with two walls (one per color) that are
 * unconditionally alive via interior grid eyes, and computes the komi that makes
 * the corner outcome decide the game. Components too small to hold two eyes stay
 * empty. Returns undefined when the problem leaves no room for a frame.
 */
export function buildFrame(position: Position, relevantPoints: number[]) {
  const size = position.boardSize;
  const stones = [...position.setup.black, ...position.setup.white];
  const points = [...stones, ...relevantPoints.filter(point => point >= 0 && point < size * size)];
  const xs = points.map(point => point % size);
  const ys = points.map(point => Math.floor(point / size));
  const boxX1 = Math.min(size - 1, Math.max(...xs) + 2);
  const boxY1 = Math.min(size - 1, Math.max(...ys) + 2);
  if (boxX1 >= size - 4 && boxY1 >= size - 4) return undefined;

  // One empty gap line around the box; right strip is one color, the rest below is the other.
  const inFrame = (x: number, y: number) => x > boxX1 + 1 || y > boxY1 + 1;
  const colorAt = (x: number, y: number): Color => (x > boxX1 + 1 ? 'W' : 'B');
  const isHole = (x: number, y: number) => x % 5 === 2 && y % 5 === 2;

  const candidate = new Map<number, Color>();
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (inFrame(x, y) && !isHole(x, y)) candidate.set(y * size + x, colorAt(x, y));
    }
  }
  // Label connected components, then count each hole whose in-board 8-neighborhood
  // lies entirely inside one component (a true single-point eye).
  const componentOf = new Map<number, number>();
  const componentColor: Color[] = [];
  const componentPoints: number[][] = [];
  for (const [start, color] of candidate) {
    if (componentOf.has(start)) continue;
    const componentId = componentPoints.length;
    componentColor.push(color);
    const component: number[] = [];
    const stack = [start];
    componentOf.set(start, componentId);
    while (stack.length > 0) {
      const point = stack.pop()!;
      component.push(point);
      const x = point % size;
      const y = Math.floor(point / size);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        const next = ny * size + nx;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        if (componentOf.has(next) || candidate.get(next) !== color) continue;
        componentOf.set(next, componentId);
        stack.push(next);
      }
    }
    componentPoints.push(component);
  }
  const eyesPerComponent = new Array<number>(componentPoints.length).fill(0);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!isHole(x, y) || !inFrame(x, y)) continue;
      let owner: number | undefined;
      let surrounded = true;
      for (let ax = -1; ax <= 1 && surrounded; ax += 1) {
        for (let ay = -1; ay <= 1 && surrounded; ay += 1) {
          if (ax === 0 && ay === 0) continue;
          const sx = x + ax;
          const sy = y + ay;
          if (sx < 0 || sy < 0 || sx >= size || sy >= size) continue;
          const id = componentOf.get(sy * size + sx);
          if (id === undefined || (owner !== undefined && id !== owner)) surrounded = false;
          else owner = id;
        }
      }
      if (surrounded && owner !== undefined) eyesPerComponent[owner]! += 1;
    }
  }
  const black: number[] = [];
  const white: number[] = [];
  let holesBlack = 0;
  let holesWhite = 0;
  componentPoints.forEach((component, componentId) => {
    if (eyesPerComponent[componentId]! < 2) return;
    if (componentColor[componentId] === 'B') {
      black.push(...component);
      holesBlack += eyesPerComponent[componentId]!;
    } else {
      white.push(...component);
      holesWhite += eyesPerComponent[componentId]!;
    }
  });
  if (black.length === 0 && white.length === 0) return undefined;
  const blackArea = black.length + holesBlack;
  const whiteArea = white.length + holesWhite;
  return {
    black,
    white,
    komi: (student: Color) => blackArea - whiteArea + (student === 'B' ? 0.5 : -0.5),
  };
}

export function chainFromAnchor(position: Position, color: Color, anchor: number): number[] {
  const size = position.boardSize;
  const own = new Set(color === 'B' ? position.setup.black : position.setup.white);
  const chain = new Set<number>();
  const queue = [anchor];
  while (queue.length > 0) {
    const point = queue.pop()!;
    if (chain.has(point) || !own.has(point)) continue;
    chain.add(point);
    const x = point % size;
    const y = Math.floor(point / size);
    if (x > 0) queue.push(point - 1);
    if (x < size - 1) queue.push(point + 1);
    if (y > 0) queue.push(point - size);
    if (y < size - 1) queue.push(point + size);
  }
  return [...chain].sort((a, b) => a - b);
}
