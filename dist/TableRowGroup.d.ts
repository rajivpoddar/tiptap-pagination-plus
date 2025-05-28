import { Node } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
export declare const TableRowGroup: Node<any, any>;
export declare const getMaximumRowSpan: (row: ProseMirrorNode) => number;
export declare const getRowGroupList: (totalRows: number, rowSpanList: Record<number, number>) => number[][];
export declare const mergeOverlappingGroups: (inputGroups: number[][]) => number[][];
