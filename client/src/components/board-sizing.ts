const COORDINATE_CELLS = 2;
const BOARD_BORDER_IN_CELLS = 0.18;
const BOARD_FIT_INSET_PX = 4;
const MAX_BOARD_HEIGHT_PX = 520;
const MAX_VERTEX_SIZE_PX = 72;

export function calculateVertexSize(
  availableWidth: number,
  viewportColumns: number,
  viewportRows: number,
): number {
  const usableWidth = Math.max(1, availableWidth - BOARD_FIT_INSET_PX);
  const widthCells = viewportColumns + COORDINATE_CELLS + BOARD_BORDER_IN_CELLS;
  const heightCells = viewportRows + COORDINATE_CELLS + BOARD_BORDER_IN_CELLS;
  return Math.max(1, Math.min(
    MAX_VERTEX_SIZE_PX,
    Math.floor(usableWidth / widthCells),
    Math.floor(MAX_BOARD_HEIGHT_PX / heightCells),
  ));
}
