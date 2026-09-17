import { describe, expect, it } from 'vitest';
import { parsePrintableAnswer, recoverMalformedAnswer, sameSetup } from './printable-answer-key';

describe('printable answer key parser', () => {
  it('extracts the setup and root move from Cho problem 8', () => {
    const answer = parsePrintableAnswer(
      8,
      'B<(((((((((((((((((> X@@@@+++++++++++++] [!!!!!!+++++++++++] [++*+++++*+++++*++] [!++++++++++++++++] [+++++++++++++++++]',
    );
    expect(answer.position.setup.black).toEqual([20, 21, 22, 23]);
    expect(answer.position.setup.white).toEqual([39, 40, 41, 42, 43, 44, 77]);
    expect(answer.displayPosition.setup).toEqual(answer.position.setup);
    expect(answer.rootMoves).toEqual([19]);
    expect(answer.line).toEqual([['B', 19]]);
    expect(answer.issues).toEqual([]);
  });

  it('extracts numbered continuations and reports setup differences', () => {
    const answer = parsePrintableAnswer(
      30,
      'B③②⑤@((((((((((((((> ④@@@!+++++++++++++] X@!!!+++++++++++++] @@!*+++++*+++++*++] [!!+++++++++++++++] [+++++++++++++++++]',
    );
    expect(answer.line.map(([color, point]) => [color, point])).toEqual([
      ['B', 38], ['W', 1], ['B', 0], ['W', 19], ['B', 2],
    ]);
    expect(answer.displayPosition.setup.white).toEqual(expect.arrayContaining([0, 1, 2, 19]));
    expect(sameSetup(answer.position, { ...answer.position, setup: { black: [], white: [] } })).toBe(false);
  });

  it('recovers a uniquely missing empty point against the reference setup', () => {
    const encoded = 'B<(((((((((((((((((> X!!!@+++++++++++++] [!@+@+@++++++++++] !!@@+++++*+++++*++] @@++++++++++++++++] [+@+++++++++++++++] [+++++++++++++++++]';
    const reference = parsePrintableAnswer(201, encoded.replace('[!@+@+@', '[+!@+@+@')).position;
    const recovered = recoverMalformedAnswer(201, encoded, reference);
    expect(recovered?.insertedAt).toEqual({ row: 2, column: 1 });
    expect(recovered?.answer.rootMoves).toEqual([19]);
  });
});
