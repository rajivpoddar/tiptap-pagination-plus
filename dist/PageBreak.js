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
        return ['div', Object.assign({ 'data-page-break': 'true', 'data-page-break-force': 'true', class: 'page-break-node tiptap-page-break', contenteditable: 'false' }, HTMLAttributes), 0];
    },
    addCommands() {
        return {
            insertPageBreak: () => ({ commands, state, tr }) => {
                console.log('[PageBreak] insertPageBreak command called');
                console.log('[PageBreak] Current doc size:', state.doc.content.size);
                console.log('[PageBreak] Current selection:', state.selection.from, state.selection.to);
                const { from, to } = state.selection;
                // Check if there's already a page break immediately before or after cursor
                const $from = state.doc.resolve(from);
                const $to = state.doc.resolve(to);
                // Check node before cursor
                if ($from.nodeBefore && $from.nodeBefore.type.name === 'pageBreak') {
                    console.log('[PageBreak] Page break already exists before cursor - skipping insert');
                    return false;
                }
                // Check node after cursor
                if ($to.nodeAfter && $to.nodeAfter.type.name === 'pageBreak') {
                    console.log('[PageBreak] Page break already exists after cursor - skipping insert');
                    return false;
                }
                // Check if we're at the very end of the document
                const isAtEnd = from >= state.doc.content.size - 1;
                if (isAtEnd) {
                    console.log('[PageBreak] At end of document - inserting page break with extra paragraph');
                    // At end of document, insert page break followed by an empty paragraph
                    return commands.insertContent([
                        { type: this.name },
                        { type: 'paragraph' }
                    ]);
                }
                // For normal insert, split current block and insert page break
                console.log('[PageBreak] Normal insert at position:', from);
                // First split the block at cursor position
                if (!commands.splitBlock()) {
                    console.log('[PageBreak] Failed to split block');
                    return false;
                }
                // Then insert the page break
                const result = commands.insertContent({ type: this.name });
                console.log('[PageBreak] Page break inserted, result:', result);
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
