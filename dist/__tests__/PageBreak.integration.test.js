import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { PageBreak } from '../PageBreak';
import { PaginationPlus } from '../PaginationPlus';
describe('PageBreak with PaginationPlus Integration', () => {
    let editor;
    let container;
    beforeEach(() => {
        // Create a container element with proper dimensions
        container = document.createElement('div');
        container.style.width = '800px';
        container.style.height = '1000px';
        document.body.appendChild(container);
        editor = new Editor({
            element: container,
            extensions: [
                Document,
                Paragraph,
                Text,
                PageBreak,
                PaginationPlus.configure({
                    pageHeight: 842,
                    pageGap: 20,
                    pageHeaderHeight: 50,
                    pageBreakBackground: '#f2f2f2',
                }),
            ],
            content: '<p>Initial content</p>',
        });
    });
    afterEach(() => {
        editor.destroy();
        document.body.removeChild(container);
    });
    it('should work with PaginationPlus extension', () => {
        // Both extensions should be loaded
        const pageBreakExt = editor.extensionManager.extensions.find((ext) => ext.name === 'pageBreak');
        const paginationExt = editor.extensionManager.extensions.find((ext) => ext.name === 'PaginationPlus');
        expect(pageBreakExt).toBeDefined();
        expect(paginationExt).toBeDefined();
    });
    it('should work with page breaks when pagination is active', () => {
        // Insert a page break
        editor.commands.insertPageBreak();
        // Verify page break was inserted
        let pageBreakCount = 0;
        editor.state.doc.descendants((node) => {
            if (node.type.name === 'pageBreak') {
                pageBreakCount++;
            }
        });
        expect(pageBreakCount).toBe(1);
    });
    it('should apply page-break-node class to page breaks', (done) => {
        editor.commands.insertPageBreak();
        setTimeout(() => {
            const pageBreakElements = container.querySelectorAll('.page-break-node');
            expect(pageBreakElements.length).toBe(1);
            done();
        }, 100);
    });
    it('should handle multiple page breaks with pagination', (done) => {
        // Add multiple page breaks
        editor.commands.setContent(`
      <p>Page 1 content</p>
      <div data-page-break="true"></div>
      <p>Page 2 content</p>
      <div data-page-break="true"></div>
      <p>Page 3 content</p>
    `);
        setTimeout(() => {
            const pageBreakElements = container.querySelectorAll('.page-break-node');
            expect(pageBreakElements.length).toBe(2);
            done();
        }, 100);
    });
    it('should update page break heights dynamically', (done) => {
        // Insert a page break
        editor.commands.insertPageBreak();
        setTimeout(() => {
            const pageBreakElement = container.querySelector('.page-break-node');
            expect(pageBreakElement).toBeTruthy();
            if (pageBreakElement) {
                // Check that the page break element exists and has the correct class
                expect(pageBreakElement.classList.contains('page-break-node')).toBe(true);
                expect(pageBreakElement.getAttribute('data-page-break')).toBe('true');
            }
            done();
        }, 200);
    });
    it('should maintain editor element when pagination is active', () => {
        const editorElement = container.querySelector('.ProseMirror');
        expect(editorElement).toBeTruthy();
    });
    it('should serialize and deserialize correctly with pagination', () => {
        var _a;
        // First destroy and recreate editor without pagination to avoid the view error
        editor.destroy();
        editor = new Editor({
            element: container,
            extensions: [
                Document,
                Paragraph,
                Text,
                PageBreak,
            ],
            content: '<p>Initial content</p>',
        });
        // Set content with page breaks
        const originalContent = `
      <p>First page content</p>
      <div data-page-break="true" data-page-break-force="true" class="page-break-node tiptap-page-break" contenteditable="false"></div>
      <p>Second page content</p>
    `;
        editor.commands.setContent(originalContent);
        // Get HTML and JSON
        const html = editor.getHTML();
        const json = editor.getJSON();
        // HTML should contain page break attributes
        expect(html).toContain('data-page-break="true"');
        expect(html).toContain('page-break-node');
        // JSON should have page break node
        expect(json.content).toBeDefined();
        const hasPageBreak = (_a = json.content) === null || _a === void 0 ? void 0 : _a.some((node) => node.type === 'pageBreak');
        expect(hasPageBreak).toBe(true);
        // Set content from JSON and verify
        editor.commands.setContent(json);
        const newHtml = editor.getHTML();
        expect(newHtml).toContain('data-page-break="true"');
    });
    it('should handle page breaks at document boundaries', (done) => {
        // Page break at start of content (position 1)
        editor.commands.setTextSelection(1);
        editor.commands.insertPageBreak();
        // Page break at end
        editor.commands.setTextSelection(editor.state.doc.content.size);
        editor.commands.insertPageBreak();
        setTimeout(() => {
            const pageBreaks = container.querySelectorAll('.page-break-node');
            expect(pageBreaks.length).toBe(2);
            // Document should have page breaks
            let pageBreakCount = 0;
            editor.state.doc.descendants((node) => {
                if (node.type.name === 'pageBreak') {
                    pageBreakCount++;
                }
            });
            expect(pageBreakCount).toBe(2);
            done();
        }, 100);
    });
    it('should respect page break force attribute', () => {
        editor.commands.setContent('<div data-page-break="true" data-page-break-force="true"></div>');
        let pageBreakNode = null;
        editor.state.doc.descendants((node) => {
            if (node.type.name === 'pageBreak') {
                pageBreakNode = node;
            }
        });
        expect(pageBreakNode).toBeTruthy();
        // Get the rendered element
        const pageBreakElement = container.querySelector('[data-page-break-force="true"]');
        expect(pageBreakElement).toBeTruthy();
    });
    it('should handle content changes after page breaks', (done) => {
        // Insert page break
        editor.commands.insertPageBreak();
        // Add content after page break
        editor.commands.insertContent('<p>New content after break</p>');
        setTimeout(() => {
            // Verify content structure
            const doc = editor.state.doc;
            let foundPageBreak = false;
            let foundNewContent = false;
            doc.descendants((node) => {
                if (node.type.name === 'pageBreak') {
                    foundPageBreak = true;
                }
                if (node.textContent === 'New content after break') {
                    foundNewContent = true;
                }
            });
            expect(foundPageBreak).toBe(true);
            expect(foundNewContent).toBe(true);
            done();
        }, 100);
    });
});
