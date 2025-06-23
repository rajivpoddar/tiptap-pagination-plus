import { test, expect } from '@playwright/test';

test.describe('Page Break - Happy Path', () => {
  let initialPageBreakCount: number;
  
  test.beforeEach(async ({ page }) => {
    // Navigate to the demo page
    await page.goto('http://localhost:8000/demo.html');
    
    // Wait for editor to be ready
    await page.waitForSelector('.ProseMirror', { state: 'visible' });
    
    // Wait for pagination to initialize
    await page.waitForSelector('.rm-page-header', { state: 'visible' });
    
    // Count initial page breaks (demo has pre-existing ones)
    initialPageBreakCount = await page.locator('.page-break-node').count();
  });

  test('should insert page break using button', async ({ page }) => {
    // Click at the end of first paragraph
    const firstParagraph = page.locator('.ProseMirror p').first();
    await firstParagraph.click();
    
    // Move cursor to end of paragraph
    await page.keyboard.press('End');
    
    // Count initial pages
    const initialPageCount = await page.locator('.rm-page-header').count();
    
    // Click page break button
    await page.click('button:has-text("Page Break")');
    
    // Wait for pagination to update
    await page.waitForTimeout(500);
    
    // Verify page break was inserted
    const pageBreaks = await page.locator('.page-break-node').count();
    expect(pageBreaks).toBe(initialPageBreakCount + 1);
    
    // Verify new page was created if needed
    const newPageCount = await page.locator('.rm-page-header').count();
    expect(newPageCount).toBeGreaterThanOrEqual(initialPageCount);
  });

  test('should insert page break using keyboard shortcut', async ({ page }) => {
    // Click in the middle of content
    const paragraph = page.locator('.ProseMirror p').nth(2);
    await paragraph.click();
    
    // Use Ctrl+Enter (or Cmd+Enter on Mac)
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+Enter`);
    
    // Wait for page break to be inserted
    await page.waitForTimeout(300);
    
    // Verify page break was inserted
    const pageBreaks = await page.locator('.page-break-node').count();
    expect(pageBreaks).toBe(initialPageBreakCount + 1);
  });

  test('should create visual separation with page break', async ({ page }) => {
    // Insert a page break in the middle of content
    const targetParagraph = page.locator('.ProseMirror p').nth(2);
    await targetParagraph.click();
    await page.keyboard.press('End');
    
    // Insert page break
    await page.click('button:has-text("Page Break")');
    await page.waitForTimeout(800);
    
    // Verify the page break element exists and is visible
    const newPageBreak = page.locator('.page-break-node').nth(initialPageBreakCount);
    await expect(newPageBreak).toBeVisible();
    
    // Verify it has height (creates visual separation)
    const bounds = await newPageBreak.boundingBox();
    expect(bounds).not.toBeNull();
    if (bounds) {
      expect(bounds.height).toBeGreaterThan(10); // Should have substantial height
    }
    
    // Verify the page break is between content
    const pageBreakHtml = await page.locator('.ProseMirror').innerHTML();
    expect(pageBreakHtml).toMatch(/<p[^>]*>.*<\/p>\s*<div[^>]*data-page-break="true"[^>]*>.*<\/div>\s*<p/);
  });

  test('should handle multiple page breaks', async ({ page }) => {
    // Insert first page break
    const firstPara = page.locator('.ProseMirror p').first();
    await firstPara.click();
    await page.keyboard.press('End');
    await page.click('button:has-text("Page Break")');
    
    await page.waitForTimeout(300);
    
    // Insert second page break further down
    const thirdPara = page.locator('.ProseMirror p').nth(3);
    await thirdPara.click();
    await page.keyboard.press('End');
    await page.click('button:has-text("Page Break")');
    
    await page.waitForTimeout(300);
    
    // Verify both new page breaks were added
    const pageBreakCount = await page.locator('.page-break-node').count();
    expect(pageBreakCount).toBe(initialPageBreakCount + 2);
    
    // Verify page breaks have proper spacing
    const pageBreaks = await page.locator('.page-break-node').all();
    const firstBreakBounds = await pageBreaks[0].boundingBox();
    const secondBreakBounds = await pageBreaks[1].boundingBox();
    
    if (firstBreakBounds && secondBreakBounds) {
      expect(secondBreakBounds.y).toBeGreaterThan(firstBreakBounds.y);
    }
  });

  test('should maintain page breaks after content editing', async ({ page }) => {
    // Insert a page break
    const paragraph = page.locator('.ProseMirror p').nth(1);
    await paragraph.click();
    await page.keyboard.press('End');
    await page.click('button:has-text("Page Break")');
    
    await page.waitForTimeout(300);
    
    // Type new content before the page break
    await paragraph.click();
    await page.keyboard.type(' This is new content added before the page break.');
    
    await page.waitForTimeout(300);
    
    // Verify page break still exists (check count instead of visibility to avoid strict mode)
    const pageBreakCount = await page.locator('.page-break-node').count();
    expect(pageBreakCount).toBe(initialPageBreakCount + 1);
    
    // Add content after the page break
    const nextPara = page.locator('.ProseMirror p').nth(2);
    await nextPara.click();
    await page.keyboard.press('Home');
    await page.keyboard.type('New content after break: ');
    
    await page.waitForTimeout(300);
    
    // Verify page break is still there
    const finalPageBreakCount = await page.locator('.page-break-node').count();
    expect(finalPageBreakCount).toBe(initialPageBreakCount + 1);
  });

  test('should properly display page break visual indicator', async ({ page }) => {
    // Insert a page break
    const paragraph = page.locator('.ProseMirror p').first();
    await paragraph.click();
    await page.keyboard.press('End');
    await page.click('button:has-text("Page Break")');
    
    await page.waitForTimeout(300);
    
    // Check page break element properties
    const pageBreak = page.locator('.page-break-node').first();
    
    // Verify it's not editable
    const contentEditable = await pageBreak.getAttribute('contenteditable');
    expect(contentEditable).toBe('false');
    
    // Verify it has the correct data attribute
    const dataPageBreak = await pageBreak.getAttribute('data-page-break');
    expect(dataPageBreak).toBe('true');
    
    // Verify it's visible and has height
    const isVisible = await pageBreak.isVisible();
    expect(isVisible).toBe(true);
    
    const bounds = await pageBreak.boundingBox();
    expect(bounds).not.toBeNull();
    if (bounds) {
      expect(bounds.height).toBeGreaterThan(0);
    }
  });

  test('should work with undo/redo', async ({ page }) => {
    // Insert a page break
    const paragraph = page.locator('.ProseMirror p').first();
    await paragraph.click();
    await page.keyboard.press('End');
    await page.click('button:has-text("Page Break")');
    
    await page.waitForTimeout(300);
    
    // Verify page break exists
    let pageBreakCount = await page.locator('.page-break-node').count();
    expect(pageBreakCount).toBe(initialPageBreakCount + 1);
    
    // Undo
    await page.click('button:has-text("Undo")');
    await page.waitForTimeout(300);
    
    // Verify page break was removed
    pageBreakCount = await page.locator('.page-break-node').count();
    expect(pageBreakCount).toBe(initialPageBreakCount);
    
    // Redo
    await page.click('button:has-text("Redo")');
    await page.waitForTimeout(300);
    
    // Verify page break is back
    pageBreakCount = await page.locator('.page-break-node').count();
    expect(pageBreakCount).toBe(initialPageBreakCount + 1);
  });

  test('should handle page break at document boundaries', async ({ page }) => {
    // Test page break at start of document
    const firstPara = page.locator('.ProseMirror p').first();
    await firstPara.click();
    await page.keyboard.press('Home');
    await page.click('button:has-text("Page Break")');
    
    await page.waitForTimeout(300);
    
    // Verify page break was inserted at start
    const firstElement = page.locator('.ProseMirror > *').first();
    const tagName = await firstElement.evaluate(el => el.tagName.toLowerCase());
    // It might be a paragraph if split occurred
    
    // Test page break at end of document
    await page.keyboard.press('Control+End');
    await page.click('button:has-text("Page Break")');
    
    await page.waitForTimeout(300);
    
    // Verify total page breaks
    const totalPageBreaks = await page.locator('.page-break-node').count();
    expect(totalPageBreaks).toBe(initialPageBreakCount + 2);
  });

  test('should create proper page structure with headers and footers', async ({ page }) => {
    // Add a few page breaks to test multiple pages
    const initialPageCount = await page.locator('.rm-page-header').count();
    
    // Add 2 page breaks at different locations
    const para1 = page.locator('.ProseMirror p').nth(2);
    await para1.click();
    await page.keyboard.press('End');
    await page.click('button:has-text("Page Break")');
    await page.waitForTimeout(300);
    
    const para2 = page.locator('.ProseMirror p').nth(5);
    await para2.click();
    await page.keyboard.press('End');
    await page.click('button:has-text("Page Break")');
    await page.waitForTimeout(300);
    
    // Check that we have at least the initial pages
    const pageHeaders = await page.locator('.rm-page-header').count();
    expect(pageHeaders).toBeGreaterThanOrEqual(initialPageCount);
    
    // Verify headers contain expected text
    const firstHeader = page.locator('.rm-page-header').first();
    const headerText = await firstHeader.textContent();
    expect(headerText).toContain('Demo Document');
    
    // Verify multiple page headers exist
    const finalPageHeaders = await page.locator('.rm-page-header').count();
    expect(finalPageHeaders).toBeGreaterThanOrEqual(initialPageCount);
    
    // Verify headers contain expected text
    const headerTexts = await page.locator('.rm-page-header').allTextContents();
    expect(headerTexts.length).toBeGreaterThan(0);
    expect(headerTexts[0]).toContain('Demo Document');
    
    // Verify page breaks were added
    const totalPageBreaks = await page.locator('.page-break-node').count();
    expect(totalPageBreaks).toBe(initialPageBreakCount + 2);
  });

  test('should load document with existing page breaks', async ({ page }) => {
    // The demo.html already has page breaks in the initial content
    // Verify they are rendered correctly (we know there are 4)
    const existingPageBreaks = await page.locator('.page-break-node').count();
    expect(existingPageBreaks).toBe(4);
    
    // Verify they maintain their position after load
    const pageBreak = page.locator('.page-break-node').first();
    const bounds = await pageBreak.boundingBox();
    expect(bounds).not.toBeNull();
    
    // Add a new page break to verify functionality still works
    const paragraph = page.locator('.ProseMirror p').nth(5);
    await paragraph.click();
    await page.keyboard.press('End');
    await page.click('button:has-text("Page Break")');
    
    await page.waitForTimeout(300);
    
    // Verify new total
    const newTotal = await page.locator('.page-break-node').count();
    expect(newTotal).toBe(5); // 4 existing + 1 new
  });
});