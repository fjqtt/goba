declare module '@sabaki/sgf' {
  export type SgfNode = {
    id: string | number;
    data: Record<string, string[]>;
    parentId: string | number | null;
    children: SgfNode[];
  };

  export function parse(contents: string, options?: { getId?: () => string | number }): SgfNode[];
  export function parseVertex(input: string): [number, number];
  export function parseCompressedVertices(input: string): Array<[number, number]>;
  export function stringify(nodes: SgfNode[]): string;

  const sgf: {
    parse: typeof parse;
    parseVertex: typeof parseVertex;
    parseCompressedVertices: typeof parseCompressedVertices;
    stringify: typeof stringify;
  };
  export default sgf;
}
