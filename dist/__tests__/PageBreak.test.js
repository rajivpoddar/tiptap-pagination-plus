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
    it('should not insert duplicate page breaks adjacent to each other', () => {
        // Set content with a paragraph
        editor.commands.setContent('<p>Some text</p>');
        // Insert first page break at position after "Some"
        editor.commands.setTextSelection(5);
        editor.commands.insertPageBreak();
        // Now try to insert another page break right before the existing one
        // The split will have created: <p>Some</p><p> text</p>
        // Find position right before the page break
        let pageBreakPos = -1;
        editor.state.doc.descendants((node, pos) => {
            if (node.type.name === 'pageBreak') {
                pageBreakPos = pos;
                return false;
            }
        });
        // Move cursor to just before the page break
        editor.commands.setTextSelection(pageBreakPos);
        // Try to insert another page break - should be prevented
        editor.commands.insertPageBreak();
        // Count page breaks
        let pageBreakCount = 0;
        editor.state.doc.descendants((node) => {
            if (node.type.name === 'pageBreak') {
                pageBreakCount++;
            }
        });
        // Should still have only one page break due to duplicate prevention
        expect(pageBreakCount).toBe(1);
    });
    it('should split block when inserting page break in middle of paragraph', () => {
        // Set content with a longer paragraph
        editor.commands.setContent('<p>First part of text. Second part of text.</p>');
        // Move cursor to middle of paragraph
        editor.commands.setTextSelection(20);
        // Insert page break
        editor.commands.insertPageBreak();
        // Check document structure
        const doc = editor.state.doc;
        // splitBlock creates: first para, empty para, page break, second para
        expect(doc.childCount).toBe(4);
        expect(doc.child(0).type.name).toBe('paragraph');
        expect(doc.child(0).textContent).toBe('First part of text.');
        expect(doc.child(1).type.name).toBe('paragraph');
        expect(doc.child(1).textContent).toBe('');
        expect(doc.child(2).type.name).toBe('pageBreak');
        expect(doc.child(3).type.name).toBe('paragraph');
        expect(doc.child(3).textContent).toBe(' Second part of text.');
    });
    it('should handle page break at start of document', () => {
        // Move cursor to start of paragraph content
        editor.commands.setTextSelection(1);
        // Insert page break
        editor.commands.insertPageBreak();
        // Check document structure - splitBlock will create empty para, then empty para, then page break
        const doc = editor.state.doc;
        // Find the page break position
        let pageBreakIndex = -1;
        for (let i = 0; i < doc.childCount; i++) {
            if (doc.child(i).type.name === 'pageBreak') {
                pageBreakIndex = i;
                break;
            }
        }
        expect(pageBreakIndex).toBeGreaterThan(-1);
        // Should have 'Hello world' text somewhere after empty paragraphs
        let foundHelloWorld = false;
        doc.descendants((node) => {
            if (node.textContent === 'Hello world') {
                foundHelloWorld = true;
            }
        });
        expect(foundHelloWorld).toBe(true);
    });
    it('should generate correct HTML output', () => {
        editor.commands.insertPageBreak();
        const html = editor.getHTML();
        expect(html).toContain('data-page-break="true"');
        expect(html).toContain('data-page-break-force="true"');
        expect(html).toContain('page-break-node');
        expect(html).toContain('tiptap-page-break');
        expect(html).toContain('contenteditable="false"');
    });
    it('should work with complex document structure', () => {
        // Set up complex content
        editor.commands.setContent(`
      <p>First paragraph</p>
      <p>Second paragraph</p>
      <p>Third paragraph</p>
    `);
        // Find position at end of second paragraph
        let secondParaEnd = -1;
        let paraCount = 0;
        editor.state.doc.descendants((node, pos) => {
            if (node.type.name === 'paragraph') {
                paraCount++;
                if (paraCount === 2 && node.textContent === 'Second paragraph') {
                    secondParaEnd = pos + node.nodeSize - 1;
                    return false;
                }
            }
        });
        // Insert page break at end of second paragraph
        editor.commands.setTextSelection(secondParaEnd);
        editor.commands.insertPageBreak();
        // Verify structure
        const doc = editor.state.doc;
        // Should have at least 4 nodes
        expect(doc.childCount).toBeGreaterThanOrEqual(4);
        // Find and verify the page break
        let pageBreakIndex = -1;
        for (let i = 0; i < doc.childCount; i++) {
            if (doc.child(i).type.name === 'pageBreak') {
                pageBreakIndex = i;
                break;
            }
        }
        expect(pageBreakIndex).toBeGreaterThan(-1);
        expect(doc.child(0).textContent).toBe('First paragraph');
        // Find second paragraph (might not be at index 1 due to empty paragraphs)
        let foundSecondPara = false;
        for (let i = 0; i < doc.childCount; i++) {
            if (doc.child(i).textContent.includes('Second paragraph')) {
                foundSecondPara = true;
                break;
            }
        }
        expect(foundSecondPara).toBe(true);
    });
    it('should handle multiple page breaks in document', () => {
        editor.commands.setContent(`
      <p>Page 1 content</p>
      <div data-page-break="true"></div>
      <p>Page 2 content</p>
      <div data-page-break="true"></div>
      <p>Page 3 content</p>
    `);
        let pageBreakCount = 0;
        let paragraphCount = 0;
        editor.state.doc.descendants((node) => {
            if (node.type.name === 'pageBreak') {
                pageBreakCount++;
            }
            else if (node.type.name === 'paragraph') {
                paragraphCount++;
            }
        });
        expect(pageBreakCount).toBe(2);
        expect(paragraphCount).toBe(3);
    });
    it('should maintain page break attributes', () => {
        editor.commands.insertPageBreak();
        let pageBreakNode = null;
        editor.state.doc.descendants((node) => {
            if (node.type.name === 'pageBreak') {
                pageBreakNode = node;
            }
        });
        expect(pageBreakNode).toBeTruthy();
        // Page break nodes don't have content but should be atomic
        expect(pageBreakNode.isAtom).toBe(true);
    });
    it('should handle cursor navigation around page breaks', () => {
        editor.commands.setContent(`
      <p>Before break</p>
      <div data-page-break="true"></div>
      <p>After break</p>
    `);
        // Verify page break exists
        let hasPageBreak = false;
        editor.state.doc.descendants((node) => {
            if (node.type.name === 'pageBreak') {
                hasPageBreak = true;
            }
        });
        expect(hasPageBreak).toBe(true);
        // Verify content structure
        const doc = editor.state.doc;
        expect(doc.child(0).textContent).toBe('Before break');
        expect(doc.child(1).type.name).toBe('pageBreak');
        expect(doc.child(2).textContent).toBe('After break');
    });
    it('should be included in document serialization', () => {
        editor.commands.setContent(`
      <p>Content before</p>
      <div data-page-break="true"></div>
      <p>Content after</p>
    `);
        const json = editor.getJSON();
        // Find page break in JSON structure
        let hasPageBreak = false;
        if (json.content) {
            hasPageBreak = json.content.some((node) => node.type === 'pageBreak');
        }
        expect(hasPageBreak).toBe(true);
    });
});
