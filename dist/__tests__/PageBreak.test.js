import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { PageBreak } from '../PageBreak';
describe('PageBreak', () => {
    let editor;
    beforeEach(() => {
        editor = new Editor({
            extensions: [Document, Paragraph, Text, PageBreak],
            content: '<p>Hello world</p>',
        });
    });
    afterEach(() => {
        editor.destroy();
    });
    it('should create a page break node', () => {
        expect(editor.schema.nodes.pageBreak).toBeDefined();
    });
    it('should insert a page break', () => {
        editor.commands.insertPageBreak();
        // Check that a page break was inserted
        let pageBreakCount = 0;
        editor.state.doc.descendants((node) => {
            if (node.type.name === 'pageBreak') {
                pageBreakCount++;
            }
        });
        expect(pageBreakCount).toBe(1);
    });
    it('should allow page breaks with content between them', () => {
        // Insert first page break
        editor.commands.insertPageBreak();
        // Add some content
        editor.commands.insertContent('<p>Some text</p>');
        // Insert another page break
        editor.commands.insertPageBreak();
        // Count page breaks
        let pageBreakCount = 0;
        editor.state.doc.descendants((node) => {
            if (node.type.name === 'pageBreak') {
                pageBreakCount++;
            }
        });
        // Should have two page breaks with content between
        expect(pageBreakCount).toBe(2);
    });
    it('should have Ctrl+Enter keyboard shortcut defined', () => {
        const pageBreakExt = editor.extensionManager.extensions
            .find(ext => ext.name === 'pageBreak');
        expect(pageBreakExt).toBeDefined();
        // Check that the extension has keyboard shortcuts defined
        const keyboardShortcuts = pageBreakExt === null || pageBreakExt === void 0 ? void 0 : pageBreakExt.config.addKeyboardShortcuts;
        expect(keyboardShortcuts).toBeDefined();
    });
    it('should render page break as non-editable div', () => {
        const pageBreakExt = editor.extensionManager.extensions.find(ext => ext.name === 'pageBreak');
        const renderHTML = pageBreakExt === null || pageBreakExt === void 0 ? void 0 : pageBreakExt.config.renderHTML;
        expect(renderHTML).toBeDefined();
        if (renderHTML) {
            const result = renderHTML({ HTMLAttributes: {} });
            expect(result).toBeDefined();
            expect(result[0]).toBe('div');
            expect(result[1]['data-page-break']).toBe('true');
            expect(result[1]['contenteditable']).toBe('false');
        }
    });
    it('should be atomic and non-selectable', () => {
        const nodeSpec = editor.schema.nodes.pageBreak.spec;
        expect(nodeSpec.atom).toBe(true);
        expect(nodeSpec.selectable).toBe(false);
        expect(nodeSpec.draggable).toBe(false);
    });
    it('should add paragraph after page break when at end of document', () => {
        // Move cursor to end
        editor.commands.setTextSelection(editor.state.doc.content.size);
        // Insert page break
        editor.commands.insertPageBreak();
        // Check that there's a paragraph after the page break
        const lastNode = editor.state.doc.lastChild;
        expect(lastNode === null || lastNode === void 0 ? void 0 : lastNode.type.name).toBe('paragraph');
    });
    it('should parse from HTML correctly', () => {
        const html = '<div data-page-break="true"></div>';
        editor.commands.setContent(html);
        let pageBreakCount = 0;
        editor.state.doc.descendants((node) => {
            if (node.type.name === 'pageBreak') {
                pageBreakCount++;
            }
        });
        expect(pageBreakCount).toBe(1);
    });
});
