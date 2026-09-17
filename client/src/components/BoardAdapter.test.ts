import { describe, expect, it } from 'vitest';
import { calculateVertexSize } from './board-sizing';

const coordinateCells = 2;
const borderCells = 0.18;

describe('BoardAdapter sizing', () => {
  it.each([
    { width: 286, columns: 7, rows: 5 },
    { width: 286, columns: 12, rows: 6 },
    { width: 341, columns: 10, rows: 8 },
    { width: 504, columns: 19, rows: 19 },
  ])('fits a $columns×$rows crop within $width px', ({ width, columns, rows }) => {
    const vertexSize = calculateVertexSize(width, columns, rows);
    const renderedWidth = vertexSize * (columns + coordinateCells + borderCells);
    const renderedHeight = vertexSize * (rows + coordinateCells + borderCells);

    expect(renderedWidth).toBeLessThanOrEqual(width - 4);
    expect(renderedHeight).toBeLessThanOrEqual(520);
    expect(vertexSize).toBeGreaterThan(0);
  });
});
