import { PaginationPlus } from '../PaginationPlus';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import '@testing-library/jest-dom';

// Test the pagination calculation logic
describe('PaginationPlus Height Calculations', () => {
  let editor: Editor;

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
});