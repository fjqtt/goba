import {
  BoundedGoban,
  type BoundedGobanProps,
  type GhostStone,
  type Map as ShudanMap,
} from '@sabaki/shudan';
import { colorToSign, pointToVertex, vertexToPoint, type Color } from '@goba/problem-contract';
import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from 'react';
import { translate, type Language } from '../i18n';

// Shudan is implemented with Preact but the build aliases its runtime to React.
// Its published declaration still names Preact's ComponentClass, so normalize
// that declaration at this single adapter boundary.
const ReactBoundedGoban = BoundedGoban as unknown as ComponentType<BoundedGobanProps>;

type Props = {
  signMap: Array<Array<0 | 1 | -1>>;
  viewport: { x0: number; y0: number; x1: number; y1: number };
  toPlay: Color;
  disabled?: boolean;
  language: Language;
  onMove: (point: number) => void;
};

export function BoardAdapter({
  signMap,
  viewport,
  toPlay,
  disabled = false,
  language,
  onMove,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pressedRef = useRef<number | null>(null);
  const [width, setWidth] = useState(320);
  const [keyboardCursor, setKeyboardCursor] = useState<number | null>(null);
  const boardSize = signMap.length;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => setWidth(Math.max(240, Math.floor(element.getBoundingClientRect().width)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const ghostStoneMap = useMemo<ShudanMap<GhostStone | null>>(() => {
    const map = emptyMap<GhostStone | null>(boardSize, null);
    if (keyboardCursor !== null) {
      const [x, y] = pointToVertex(keyboardCursor, boardSize);
      map[y]![x] = { sign: colorToSign(toPlay), faint: true };
    }
    return map;
  }, [boardSize, keyboardCursor, toPlay]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const minX = viewport.x0;
    const maxX = viewport.x1;
    const minY = viewport.y0;
    const maxY = viewport.y1;
    let [x, y] = keyboardCursor === null ? [minX, minY] : pointToVertex(keyboardCursor, boardSize);
    if (event.key === 'ArrowLeft') x = Math.max(minX, x - 1);
    else if (event.key === 'ArrowRight') x = Math.min(maxX, x + 1);
    else if (event.key === 'ArrowUp') y = Math.max(minY, y - 1);
    else if (event.key === 'ArrowDown') y = Math.min(maxY, y + 1);
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (keyboardCursor !== null && !disabled) onMove(keyboardCursor);
      return;
    } else return;
    event.preventDefault();
    setKeyboardCursor(vertexToPoint([x, y], boardSize));
  };

  return (
    <section className="board-card" aria-label={translate(language, 'goBoard')}>
      <div
        className="board-focus"
        ref={containerRef}
        role="grid"
        tabIndex={disabled ? -1 : 0}
        aria-label={translate(language, 'boardKeyboardHelp')}
        onKeyDown={onKeyDown}
        onPointerCancel={() => { pressedRef.current = null; }}
      >
        <ReactBoundedGoban
          maxWidth={width}
          maxHeight={Math.min(width, 520)}
          maxVertexSize={72}
          signMap={signMap}
          ghostStoneMap={ghostStoneMap}
          rangeX={[viewport.x0, viewport.x1]}
          rangeY={[viewport.y0, viewport.y1]}
          showCoordinates
          animateStonePlacement
          fuzzyStonePlacement={false}
          onVertexPointerDown={(_event, vertex) => {
            pressedRef.current = vertexToPoint(vertex, boardSize);
          }}
          onVertexPointerUp={(_event, vertex) => {
            const point = vertexToPoint(vertex, boardSize);
            if (pressedRef.current === point && !disabled) onMove(point);
            pressedRef.current = null;
          }}
        />
      </div>
    </section>
  );
}

function emptyMap<T>(size: number, value: T): T[][] {
  return Array.from({ length: size }, () => Array<T>(size).fill(value));
}
