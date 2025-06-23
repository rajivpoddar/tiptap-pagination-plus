import { Node } from "@tiptap/core";
export const PageBreak = Node.create({
    name: "pageBreak",
    group: "block",
    atom: true,
    selectable: false,
    draggable: false,
    parseHTML() {
        return [
            {
                tag: 'div[data-page-break]',
            },
        ];
    },
    renderHTML({ HTMLAttributes }) {
        return ['div', Object.assign({ 'data-page-break': 'true', 'data-page-break-force': 'true', class: 'page-break-node tiptap-page-break', contenteditable: 'false' }, HTMLAttributes)];
    },
    addCommands() {
        return {
            insertPageBreak: () => ({ commands, state, tr }) => {
                const { from, to } = state.selection;
                // Check if there's already a page break immediately before or after cursor
                const $from = state.doc.resolve(from);
                const $to = state.doc.resolve(to);
                // Check node before cursor
                if ($from.nodeBefore && $from.nodeBefore.type.name === 'pageBreak') {
                    return false;
                }
                // Check node after cursor
                if ($to.nodeAfter && $to.nodeAfter.type.name === 'pageBreak') {
                    return false;
                }
                // Check if we're at the very end of the document
                const isAtEnd = from >= state.doc.content.size - 1;
                if (isAtEnd) {
                    // At end of document, insert page break followed by an empty paragraph
                    return commands.insertContent([
                        { type: this.name },
                        { type: 'paragraph' }
                    ]);
                }
                // For normal insert, split current block and insert page break
                // First split the block at cursor position
                if (!commands.splitBlock()) {
                    return false;
                }
                // Then insert the page break
                const result = commands.insertContent({ type: this.name });
                return result;
            },
        };
    },
    addKeyboardShortcuts() {
        return {
            // Ctrl+Enter (or Cmd+Enter on Mac) to insert page break
            'Mod-Enter': () => this.editor.commands.insertPageBreak(),
        };
    },
});
