import { Node } from "@tiptap/core";
declare module "@tiptap/core" {
    interface Commands<ReturnType> {
        pageBreak: {
            /**
             * Insert a page break at the current position
             */
            insertPageBreak: () => ReturnType;
        };
    }
}
export declare const PageBreak: Node<any, any>;
