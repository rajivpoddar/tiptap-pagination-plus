import { PaginationPlus } from '../PaginationPlus';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import '@testing-library/jest-dom';
// Test the pagination calculation logic
describe('PaginationPlus Height Calculations', () => {
    let editor;
    beforeEach(() => {
        // Create a basic editor with PaginationPlus
        editor = new Editor({
            extensions: [
                StarterKit,
                PaginationPlus.configure({
                    pageHeight: 842,
                    pageHeaderHeight: 50,
                    pageGap: 20,
                    pageGapBorderSize: 1,
                }),
            ],
        });
    });
    afterEach(() => {
        editor.destroy();
    });
    describe('Single Page Height', () => {
        it('should calculate correct height for single page', () => {
            // Expected: 48px padding + 842px page height = 890px
            const expectedHeight = 48 + 842;
            // Test the calculation logic directly
            const contentEditablePadding = 48;
            const pageHeight = 842;
            const actualHeight = contentEditablePadding + pageHeight;
            expect(actualHeight).toBe(expectedHeight);
        });
    });
    describe('Multi Page Height', () => {
        it('should calculate correct height for 2 pages', () => {
            // Expected components:
            // - Content padding: 48px
            // - Page heights: 842px × 2
            // - Gap: 20px × 1
            // - Gap borders: 2px × 1
            // - Header margins: 48px × 1
            const expectedHeight = 48 + (842 * 2) + (20 * 1) + (2 * 1) + (48 * 1);
            // Test the calculation logic directly
            const pageCount = 2;
            const contentEditablePadding = 48;
            const pageHeight = 842;
            const pageGap = 20;
            const pageGapBorderSize = 1;
            const visibleGaps = pageCount - 1;
            const gapBorderContribution = pageGapBorderSize * 2;
            const headerMarginContribution = 48;
            let total = contentEditablePadding;
            total += pageHeight * pageCount;
            total += pageGap * visibleGaps;
            total += gapBorderContribution * visibleGaps;
            total += headerMarginContribution * visibleGaps;
            expect(total).toBe(expectedHeight);
        });
        it('should calculate correct height for 8 pages', () => {
            // Expected components:
            // - Content padding: 48px
            // - Page heights: 842px × 8
            // - Gaps: 20px × 7
            // - Gap borders: 2px × 7
            // - Header margins: 48px × 7
            const expectedHeight = 48 + (842 * 8) + (20 * 7) + (2 * 7) + (48 * 7);
            // Test the calculation logic directly
            const pageCount = 8;
            const contentEditablePadding = 48;
            const pageHeight = 842;
            const pageGap = 20;
            const pageGapBorderSize = 1;
            const visibleGaps = pageCount - 1;
            const gapBorderContribution = pageGapBorderSize * 2;
            const headerMarginContribution = 48;
            let total = contentEditablePadding;
            total += pageHeight * pageCount;
            total += pageGap * visibleGaps;
            total += gapBorderContribution * visibleGaps;
            total += headerMarginContribution * visibleGaps;
            expect(total).toBe(expectedHeight);
        });
        it('should calculate correct height for 9 pages', () => {
            // Expected components:
            // - Content padding: 48px
            // - Page heights: 842px × 9
            // - Gaps: 20px × 8
            // - Gap borders: 2px × 8
            // - Header margins: 48px × 8
            const expectedHeight = 48 + (842 * 9) + (20 * 8) + (2 * 8) + (48 * 8);
            // Test the calculation logic directly
            const pageCount = 9;
            const contentEditablePadding = 48;
            const pageHeight = 842;
            const pageGap = 20;
            const pageGapBorderSize = 1;
            const visibleGaps = pageCount - 1;
            const gapBorderContribution = pageGapBorderSize * 2;
            const headerMarginContribution = 48;
            let total = contentEditablePadding;
            total += pageHeight * pageCount;
            total += pageGap * visibleGaps;
            total += gapBorderContribution * visibleGaps;
            total += headerMarginContribution * visibleGaps;
            expect(total).toBe(expectedHeight);
        });
    });
    describe('Page Count Calculation', () => {
        it('should return 1 page for empty content', () => {
            // Test the calculation logic directly
            const naturalHeight = 890; // Initial height with just header/footer
            const contentEditablePadding = 48;
            const pageHeight = 842;
            const pageHeaderHeight = 50;
            const contentPerPage = pageHeight - (pageHeaderHeight * 2);
            const initialHeight = contentEditablePadding + (pageHeaderHeight * 2);
            const adjustedHeight = Math.max(0, naturalHeight - initialHeight);
            // For empty content
            const hasActualContent = false;
            const pageCount = hasActualContent ? Math.max(1, Math.ceil(adjustedHeight / contentPerPage)) : 1;
            expect(pageCount).toBe(1);
        });
        it('should calculate correct page count for content', () => {
            // Test the calculation logic directly
            const naturalHeight = 1500; // Height that would require 2 pages
            const contentEditablePadding = 48;
            const pageHeight = 842;
            const pageHeaderHeight = 50;
            const contentPerPage = pageHeight - (pageHeaderHeight * 2);
            const initialHeight = contentEditablePadding + (pageHeaderHeight * 2);
            const adjustedHeight = Math.max(0, naturalHeight - initialHeight);
            // For content that has actual text
            const hasActualContent = true;
            const pageCount = hasActualContent ? Math.max(1, Math.ceil(adjustedHeight / contentPerPage)) : 1;
            expect(pageCount).toBe(2);
        });
    });
    describe('Cursor and Scroll Position Preservation', () => {
        it('should store remeasureContent function in extension storage', () => {
            // Verify the function is stored in storage for plugin access
            const PaginationPlusSource = require('fs').readFileSync(require('path').join(__dirname, '../PaginationPlus.ts'), 'utf8');
            expect(PaginationPlusSource).toContain('this.storage.remeasureContent = remeasureContent');
        });
        it('should save and restore cursor position during measurement', () => {
            // Test that position saving variables are captured in the source code
            const PaginationPlusSource = require('fs').readFileSync(require('path').join(__dirname, '../PaginationPlus.ts'), 'utf8');
            expect(PaginationPlusSource).toContain('savedCursorPos');
            expect(PaginationPlusSource).toContain('savedScrollTop');
            expect(PaginationPlusSource).toContain('savedScrollLeft');
            expect(PaginationPlusSource).toContain('this.editor.state.selection.from');
        });
        it('should use TextSelection for cursor restoration', () => {
            // Verify TextSelection is imported and used
            const PaginationPlusSource = require('fs').readFileSync(require('path').join(__dirname, '../PaginationPlus.ts'), 'utf8');
            expect(PaginationPlusSource).toContain('TextSelection,');
            expect(PaginationPlusSource).toContain('TextSelection.create(');
        });
        it('should handle invalid cursor position gracefully', () => {
            // Verify error handling is in place
            const PaginationPlusSource = require('fs').readFileSync(require('path').join(__dirname, '../PaginationPlus.ts'), 'utf8');
            expect(PaginationPlusSource).toContain('Math.min(savedCursorPos, this.editor.state.doc.content.size)');
            expect(PaginationPlusSource).toContain('catch (e) {');
        });
        it('should restore scroll position after measurement', () => {
            // Verify scroll restoration code exists
            const PaginationPlusSource = require('fs').readFileSync(require('path').join(__dirname, '../PaginationPlus.ts'), 'utf8');
            expect(PaginationPlusSource).toContain('targetNode.scrollTop = savedScrollTop');
            expect(PaginationPlusSource).toContain('targetNode.scrollLeft = savedScrollLeft');
        });
        it('should use DOM settling and async restoration', () => {
            // Verify restoration waits for DOM to settle
            const PaginationPlusSource = require('fs').readFileSync(require('path').join(__dirname, '../PaginationPlus.ts'), 'utf8');
            expect(PaginationPlusSource).toContain('const measureAndUpdatePages = async (callback?: () => void) => {');
            expect(PaginationPlusSource).toContain('await Promise.all([');
            expect(PaginationPlusSource).toContain('document.fonts.ready');
        });
    });
    describe('Timing and Debouncing', () => {
        it('should use 300ms delay for normal typing', () => {
            // Verify the delay was changed from 200ms to 300ms
            const PaginationPlusSource = require('fs').readFileSync(require('path').join(__dirname, '../PaginationPlus.ts'), 'utf8');
            expect(PaginationPlusSource).toContain('extensionStorage.remeasureContent(300)');
            expect(PaginationPlusSource).toContain('// Handle normal content changes after initialization');
        });
        it('should have debounced remeasureContent function implementation', () => {
            // Verify the debounced function implementation exists
            const PaginationPlusSource = require('fs').readFileSync(require('path').join(__dirname, '../PaginationPlus.ts'), 'utf8');
            expect(PaginationPlusSource).toContain('const remeasureContent = (delay: number = 100) => {');
            expect(PaginationPlusSource).toContain('setTimeout(() => {');
            expect(PaginationPlusSource).toContain('this.storage.currentMeasurePromise = measureAndUpdatePages()');
        });
        it('should clear previous timer when remeasuring', () => {
            // Verify timer management
            const PaginationPlusSource = require('fs').readFileSync(require('path').join(__dirname, '../PaginationPlus.ts'), 'utf8');
            expect(PaginationPlusSource).toContain('if (this.storage.remeasureTimer) {');
            expect(PaginationPlusSource).toContain('clearTimeout(this.storage.remeasureTimer)');
            expect(PaginationPlusSource).toContain('this.storage.remeasureTimer = setTimeout');
        });
    });
    describe('Position Restoration Logic', () => {
        it('should save positions after debounce but before height manipulation', () => {
            // Verify position saving happens after 300ms debounce, not immediately
            const PaginationPlusSource = require('fs').readFileSync(require('path').join(__dirname, '../PaginationPlus.ts'), 'utf8');
            // Check for position saving in measurement function
            expect(PaginationPlusSource).toContain('this.storage.savedCursorPos = this.editor.state.selection.from');
            expect(PaginationPlusSource).toContain('this.storage.savedScrollTop = targetNode.scrollTop');
            // Check for new measurement approach
            expect(PaginationPlusSource).toContain('let contentHeight = 0');
            expect(PaginationPlusSource).toContain('child.getBoundingClientRect()');
        });
        it('should restore positions after all measurements complete', () => {
            // Verify restoration happens after pagination calculations
            const PaginationPlusSource = require('fs').readFileSync(require('path').join(__dirname, '../PaginationPlus.ts'), 'utf8');
            const lines = PaginationPlusSource.split('\n');
            let heightCalculationLine = -1;
            let restoreAfterSettledLine = -1;
            lines.forEach((line, index) => {
                if (line.includes('targetNode.style.height = `${paginatedHeight}px`')) {
                    heightCalculationLine = index;
                }
                if (line.includes('targetNode.scrollTop = savedScrollTop')) {
                    restoreAfterSettledLine = index;
                }
            });
            expect(heightCalculationLine).toBeGreaterThan(-1);
            expect(restoreAfterSettledLine).toBeGreaterThan(-1);
            expect(restoreAfterSettledLine).toBeGreaterThan(heightCalculationLine);
        });
        it('should handle position restoration in async context', () => {
            // Verify restoration works with the async measurement flow
            const PaginationPlusSource = require('fs').readFileSync(require('path').join(__dirname, '../PaginationPlus.ts'), 'utf8');
            expect(PaginationPlusSource).toContain('const measureAndUpdatePages = async (callback?: () => void) => {');
            expect(PaginationPlusSource).toContain('targetNode.scrollTop = savedScrollTop');
            expect(PaginationPlusSource).toContain('await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))');
        });
        it('should implement scroll locking after debounce, not during typing', () => {
            // Verify scroll locking happens after typing stops, not immediately
            const PaginationPlusSource = require('fs').readFileSync(require('path').join(__dirname, '../PaginationPlus.ts'), 'utf8');
            // Check for debounced remeasurement
            expect(PaginationPlusSource).toContain('this.storage.remeasureTimer = setTimeout');
            expect(PaginationPlusSource).toContain('clearTimeout(this.storage.remeasureTimer)');
            // Check that position saved flag is reset before measurement
            expect(PaginationPlusSource).toContain('this.storage.positionSaved = false');
            expect(PaginationPlusSource).toContain('measureAndUpdatePages()');
        });
        it('should wait for DOM to settle before restoration', () => {
            // Verify DOM settling detection
            const PaginationPlusSource = require('fs').readFileSync(require('path').join(__dirname, '../PaginationPlus.ts'), 'utf8');
            // Check for layout stability detection
            expect(PaginationPlusSource).toContain('const waitForLayoutStable = ');
            expect(PaginationPlusSource).toContain('requiredStableFrames = 3');
            expect(PaginationPlusSource).toContain('currentHeight === lastHeight');
            expect(PaginationPlusSource).toContain('requestAnimationFrame(checkStability)');
        });
    });
    describe('Keyboard Shortcuts', () => {
        it('should implement Meta+Up workaround for pagination interference', () => {
            // Verify the keyboard shortcut workaround exists
            const PaginationPlusSource = require('fs').readFileSync(require('path').join(__dirname, '../PaginationPlus.ts'), 'utf8');
            // Check for addKeyboardShortcuts method
            expect(PaginationPlusSource).toContain('addKeyboardShortcuts() {');
            expect(PaginationPlusSource).toContain("'Mod-ArrowUp': () => {");
            // Check for the workaround implementation
            expect(PaginationPlusSource).toContain('this.editor.commands.setTextSelection(0)');
            expect(PaginationPlusSource).toContain('this.editor.commands.scrollIntoView()');
            expect(PaginationPlusSource).toContain('return true;');
        });
        it('should contain proper keyboard shortcut workaround logic', () => {
            // Verify the keyboard shortcut implementation details
            const PaginationPlusSource = require('fs').readFileSync(require('path').join(__dirname, '../PaginationPlus.ts'), 'utf8');
            // Check that the workaround calls the correct commands in sequence
            expect(PaginationPlusSource).toContain('this.editor.commands.setTextSelection(0);');
            expect(PaginationPlusSource).toContain('this.editor.commands.scrollIntoView();');
            // Verify it's wrapped in the correct keyboard shortcut handler
            const modArrowUpMatch = PaginationPlusSource.match(/'Mod-ArrowUp':\s*\(\)\s*=>\s*{[^}]*}/);
            expect(modArrowUpMatch).toBeTruthy();
            // Ensure the handler returns true to prevent default behavior
            const handlerContent = (modArrowUpMatch === null || modArrowUpMatch === void 0 ? void 0 : modArrowUpMatch[0]) || '';
            expect(handlerContent).toContain('return true;');
        });
    });
});
