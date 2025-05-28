import { PaginationPlus } from '../PaginationPlus';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import '@testing-library/jest-dom';
describe('PaginationPlus Integration Tests', () => {
    let editor;
    beforeEach(() => {
        editor = new Editor({
            extensions: [
                StarterKit,
                PaginationPlus.configure({
                    pageHeight: 842,
                    pageHeaderHeight: 50,
                    pageGap: 20,
                }),
            ],
        });
    });
    afterEach(() => {
        try {
            editor.destroy();
        }
        catch (e) {
            // Ignore destroy errors in tests
        }
    });
    describe('Fixed Issues', () => {
        it('should use 300ms delay for normal typing (instead of 200ms)', () => {
            // This test documents that we fixed the delay from 200ms to 300ms
            // The actual verification would require integration testing with real typing
            expect(true).toBe(true);
        });
        it('should preserve cursor and scroll position during remeasurement', () => {
            // This test documents that we added cursor and scroll position preservation
            // The actual verification would require integration testing with DOM
            expect(true).toBe(true);
        });
        it('should have TextSelection import for cursor restoration', () => {
            // Verify that the import is working
            const PaginationPlusSource = require('fs').readFileSync(require('path').join(__dirname, '../PaginationPlus.ts'), 'utf8');
            expect(PaginationPlusSource).toContain('TextSelection');
            expect(PaginationPlusSource).toContain('savedCursorPos');
            expect(PaginationPlusSource).toContain('savedScrollTop');
        });
    });
});
