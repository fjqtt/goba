import type { Color } from '@goba/problem-contract';
import type { Position } from '../domain';

const BLACK_NUMBERED = '❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴';
const WHITE_NUMBERED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const BOARD_SIZE = 19;

export type PrintableAnswer = {
  problemNumber: number;
  position: Position;
  displayPosition: Position;
  rootMoves: number[];
  line: Array<[Color, number]>;
  issues: string[];
};

export function parsePrintableAnswer(problemNumber: number, encoded: string): PrintableAnswer {
  const toPlay = encoded[0];
  if (toPlay !== 'B' && toPlay !== 'W') throw new Error(`Problem ${problemNumber}: missing B/W prefix`);
  const rows = [...encoded.slice(1).split(' ').filter(Boolean)];
  if (rows.length === 0 || rows.length > BOARD_SIZE || rows.some(row => [...row].length !== BOARD_SIZE)) {
    throw new Error(`Problem ${problemNumber}: expected 1-${BOARD_SIZE} rows of width ${BOARD_SIZE}`);
  }

  const black: number[] = [];
  const white: number[] = [];
  const displayBlack: number[] = [];
  const displayWhite: number[] = [];
  const moves = new Map<number, number[]>();
  for (const [y, row] of rows.entries()) {
    for (const [x, character] of [...row].entries()) {
      const point = y * BOARD_SIZE + x;
      if (character === '@') {
        black.push(point);
        displayBlack.push(point);
      }
      if (character === '!') {
        white.push(point);
        displayWhite.push(point);
      }
      if ([...BLACK_NUMBERED].includes(character)) displayBlack.push(point);
      if ([...WHITE_NUMBERED].includes(character)) displayWhite.push(point);
      const moveNumber = markerNumber(character);
      if (moveNumber !== undefined) {
        const points = moves.get(moveNumber) ?? [];
        points.push(point);
        moves.set(moveNumber, points);
      }
    }
  }

  const issues: string[] = [];
  const numbers = [...moves.keys()].sort(numeric);
  if (!moves.has(1)) issues.push('missing-root-move');
  const maximum = numbers.at(-1) ?? 0;
  for (let move = 1; move <= maximum; move += 1) {
    if (!moves.has(move)) issues.push(`missing-move-${move}`);
    if ((moves.get(move)?.length ?? 0) > 1 && move !== 1) issues.push(`ambiguous-move-${move}`);
  }

  const line: Array<[Color, number]> = [];
  for (let move = 1; move <= maximum; move += 1) {
    const points = moves.get(move);
    if (points?.length !== 1) break;
    line.push([moveColor(toPlay, move), points[0]!]);
  }

  return {
    problemNumber,
    position: {
      boardSize: BOARD_SIZE,
      setup: { black, white },
      history: { policy: 'fresh-position', moves: [] },
      toPlay,
    },
    displayPosition: {
      boardSize: BOARD_SIZE,
      setup: { black: displayBlack, white: displayWhite },
      history: { policy: 'fresh-position', moves: [] },
      toPlay,
    },
    rootMoves: [...(moves.get(1) ?? [])].sort(numeric),
    line,
    issues,
  };
}

export function recoverMalformedAnswer(
  problemNumber: number,
  encoded: string,
  reference: Position,
): { answer: PrintableAnswer; repaired: string; insertedAt: { row: number; column: number } } | undefined {
  const prefix = encoded[0];
  const rows = encoded.slice(1).split(' ').filter(Boolean);
  const candidates: Array<{
    answer: PrintableAnswer;
    repaired: string;
    insertedAt: { row: number; column: number };
  }> = [];
  for (const [rowIndex, row] of rows.entries()) {
    const characters = [...row];
    if (characters.length !== BOARD_SIZE - 1) continue;
    for (let column = 0; column <= characters.length; column += 1) {
      const repairedRow = [...characters.slice(0, column), '+', ...characters.slice(column)].join('');
      const repairedRows = rows.map((value, index) => index === rowIndex ? repairedRow : value);
      const repaired = `${prefix}${repairedRows.join(' ')}`;
      try {
        const answer = parsePrintableAnswer(problemNumber, repaired);
        if (sameSetup(answer.position, reference)) {
          candidates.push({ answer, repaired, insertedAt: { row: rowIndex, column } });
        }
      } catch {
        // Try the next insertion.
      }
    }
  }
  if (candidates.length === 1) return candidates[0];
  // A leading board-edge marker and an inserted empty point are both empty for setup matching.
  // Prefer preserving the edge marker at column 0 and insert immediately after it.
  const edgePreserving = candidates.filter(candidate => (
    ['[', '<'].includes(rows[candidate.insertedAt.row]?.[0] ?? '')
    && candidate.insertedAt.column === 1
  ));
  return edgePreserving.length === 1 ? edgePreserving[0] : undefined;
}

export function sameSetup(left: Position, right: Position): boolean {
  return left.boardSize === right.boardSize
    && left.toPlay === right.toPlay
    && samePoints(left.setup.black, right.setup.black)
    && samePoints(left.setup.white, right.setup.white);
}

function markerNumber(character: string): number | undefined {
  if (character === 'X') return 1;
  if (/^[1-9]$/.test(character)) return Number.parseInt(character, 10);
  const blackIndex = [...BLACK_NUMBERED].indexOf(character);
  if (blackIndex >= 0) return blackIndex + 1;
  const whiteIndex = [...WHITE_NUMBERED].indexOf(character);
  if (whiteIndex >= 0) return whiteIndex + 1;
  return undefined;
}

function moveColor(toPlay: Color, moveNumber: number): Color {
  return moveNumber % 2 === 1 ? toPlay : toPlay === 'B' ? 'W' : 'B';
}

function samePoints(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort(numeric);
  const b = [...right].sort(numeric);
  return a.every((point, index) => point === b[index]);
}

function numeric(left: number, right: number): number {
  return left - right;
}
