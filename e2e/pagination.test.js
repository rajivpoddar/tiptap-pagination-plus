const { test, expect } = require('@playwright/test');

// Helper function for cross-platform keyboard shortcuts
const getKeyboardShortcut = (key) => {
  const isMac = process.platform === 'darwin';
  const modifier = isMac ? 'Meta' : 'Control';
  return `${modifier}+${key}`;
};

test.describe('TipTap Pagination Plus E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the demo
    await page.goto('/demo.html');
    
    // First wait for the page to load completely
    await page.waitForLoadState('networkidle');
    
    // Wait for loader to exist first
    await page.waitForSelector('#loader', { timeout: 15000 });
    
    // Wait for editor to exist
    await page.waitForSelector('#editor', { timeout: 15000 });
    
    // Wait for loader to get hidden class (when ready)
    await page.waitForSelector('#loader.hidden', { timeout: 30000, state: 'attached' });
    
    // Wait for editor to not have hidden class
    await page.waitForSelector('#editor:not(.hidden)', { timeout: 15000 });
    
    // Wait for pagination to be active
    await page.waitForFunction(() => {
      const editor = document.querySelector('.ProseMirror');
      return editor && editor.classList.contains('rm-with-pagination');
    }, { timeout: 15000 });
    
    // Wait for content to be loaded
    await page.waitForFunction(() => {
      const editor = document.querySelector('.ProseMirror');
      return editor && editor.textContent && editor.textContent.trim().length > 0;
    }, { timeout: 15000 });
  });

  test('should show single page when content is deleted', async ({ page }) => {
    // Get initial page count
    const initialPages = await page.locator('.rm-page-break').count();
    console.log(`Initial pages: ${initialPages}`);
    
    // Select all content and delete
    await page.locator('.ProseMirror').click();
    await page.keyboard.press(getKeyboardShortcut('a'));
    await page.keyboard.press('Delete');
    
    // Wait for pagination to update
    await page.waitForTimeout(1000);
    
    // Should have exactly 1 page
    const finalPages = await page.locator('.rm-page-break').count();
    expect(finalPages).toBe(1);
    
    // Should have empty content (excluding headers/footers)
    const content = await page.locator('.ProseMirror p').allTextContents();
    const bodyContent = content.filter(text => text.trim() !== '').join('');
    expect(bodyContent).toBe('');
  });

  test('should double page count when content is copied and pasted', async ({ page }) => {
    // Get initial page count
    const initialPages = await page.locator('.rm-page-break').count();
    console.log(`Initial pages: ${initialPages}`);
    
    // Select all content
    await page.locator('.ProseMirror').click();
    await page.keyboard.press(getKeyboardShortcut('a'));
    
    // Copy content
    await page.keyboard.press(getKeyboardShortcut('c'));
    
    // Move to end and paste
    await page.keyboard.press(getKeyboardShortcut('End'));
    await page.keyboard.press(getKeyboardShortcut('v'));
    
    // Wait for pagination to update
    await page.waitForTimeout(2000);
    
    // Page count should approximately double (allowing for some variance due to formatting)
    const finalPages = await page.locator('.rm-page-break').count();
    console.log(`Final pages: ${finalPages}`);
    expect(finalPages).toBeGreaterThanOrEqual(initialPages * 1.5);
    expect(finalPages).toBeLessThanOrEqual(initialPages * 2.5);
  });

  test('should create new page when pressing Enter at end', async ({ page }) => {
    // Get initial page count
    const initialPages = await page.locator('.rm-page-break').count();
    console.log(`Initial pages: ${initialPages}`);
    
    // Move to the very end of content
    await page.locator('.ProseMirror').click();
    await page.keyboard.press(getKeyboardShortcut('End'));
    
    // Press Enter multiple times to create new pages
    const entersToPress = 50; // Should be enough to create at least one new page
    for (let i = 0; i < entersToPress; i++) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(50); // Small delay between presses
    }
    
    // Wait for pagination to update
    await page.waitForTimeout(2000);
    
    // Should have more pages than initially
    const finalPages = await page.locator('.rm-page-break').count();
    console.log(`Pages after Enter presses: ${finalPages}`);
    expect(finalPages).toBeGreaterThan(initialPages);
  });

  test('should delete page when pressing Backspace to remove content', async ({ page }) => {
    // First create extra content by pressing Enter
    await page.locator('.ProseMirror').click();
    await page.keyboard.press(getKeyboardShortcut('End'));
    
    // Add enough content to create new pages
    for (let i = 0; i < 50; i++) {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(20);
    }
    
    await page.waitForTimeout(1000);
    const pagesAfterAdding = await page.locator('.rm-page-break').count();
    console.log(`Pages after adding content: ${pagesAfterAdding}`);
    
    // Now delete content with Backspace
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(20);
    }
    
    // Wait for pagination to update
    await page.waitForTimeout(2000);
    
    // Should have fewer pages than after adding content
    const finalPages = await page.locator('.rm-page-break').count();
    console.log(`Pages after Backspace: ${finalPages}`);
    expect(finalPages).toBeLessThan(pagesAfterAdding);
  });

  test('should handle typing on last line correctly', async ({ page }) => {
    // Move to the end of content
    await page.locator('.ProseMirror').click();
    await page.keyboard.press(getKeyboardShortcut('End'));
    
    // Type some text
    const testText = 'This is test text on the last line.';
    await page.keyboard.type(testText);
    
    // Wait for pagination to update
    await page.waitForTimeout(1000);
    
    // Verify text was added
    const content = await page.locator('.ProseMirror').textContent();
    expect(content).toContain(testText);
    
    // Should still have pagination active
    const hasClassPagination = await page.locator('.ProseMirror').getAttribute('class');
    expect(hasClassPagination).toContain('rm-with-pagination');
  });

  test('should handle undo/redo operations correctly', async ({ page }) => {
    // Get initial state (for reference, though not used in assertions)
    await page.locator('.ProseMirror').textContent(); // Initial content snapshot
    await page.locator('.rm-page-break').count(); // Initial page count snapshot
    
    // Add some content
    await page.locator('.ProseMirror').click();
    await page.keyboard.press(getKeyboardShortcut('End'));
    const testText = '\\n\\nThis is new test content for undo/redo testing.';
    await page.keyboard.type(testText);
    
    await page.waitForTimeout(1000);
    
    // Verify content was added
    const contentAfterTyping = await page.locator('.ProseMirror').textContent();
    expect(contentAfterTyping).toContain('undo/redo testing');
    
    // Test Undo
    await page.keyboard.press(getKeyboardShortcut('z'));
    await page.waitForTimeout(1000);
    
    const contentAfterUndo = await page.locator('.ProseMirror').textContent();
    expect(contentAfterUndo.length).toBeLessThan(contentAfterTyping.length);
    
    // Test Redo
    await page.keyboard.press(getKeyboardShortcut('y'));
    await page.waitForTimeout(1000);
    
    const contentAfterRedo = await page.locator('.ProseMirror').textContent();
    expect(contentAfterRedo).toContain('undo/redo testing');
    
    // Pagination should remain functional throughout
    const finalPages = await page.locator('.rm-page-break').count();
    expect(finalPages).toBeGreaterThan(0);
  });

  test('should maintain page numbering consistency', async ({ page }) => {
    // Get all page numbers
    const pageNumbers = await page.locator('.rm-page-footer').allTextContents();
    
    // Should have sequential page numbers
    for (let i = 0; i < pageNumbers.length; i++) {
      const expectedNumber = i + 1;
      expect(pageNumbers[i]).toContain(`Page ${expectedNumber}`);
    }
  });

  test('should handle rapid typing without breaking layout', async ({ page }) => {
    // Move to end
    await page.locator('.ProseMirror').click();
    await page.keyboard.press(getKeyboardShortcut('End'));
    
    // Rapid typing test
    const rapidText = 'This is rapid typing test. '.repeat(20);
    await page.keyboard.type(rapidText, { delay: 10 }); // Fast typing
    
    // Wait for pagination to settle
    await page.waitForTimeout(2000);
    
    // Should still have proper pagination
    const hasClassPagination = await page.locator('.ProseMirror').getAttribute('class');
    expect(hasClassPagination).toContain('rm-with-pagination');
    
    // Should have page breaks
    const pageCount = await page.locator('.rm-page-break').count();
    expect(pageCount).toBeGreaterThan(0);
    
    // Content should be preserved
    const content = await page.locator('.ProseMirror').textContent();
    expect(content).toContain('rapid typing test');
  });
});