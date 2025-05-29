# TipTap Pagination Plus - Technical Improvements TODO

Based on comprehensive code review feedback, prioritized by impact and effort.

## 🔴 High Priority - Bug Fixes (Do Soon)

### Scroll Position During Line Wrap
- [x] **Typing causes scroll jump when line wraps** - Fixed! Cursor position now maintained in viewport
  
  **Solution Implemented**:
  - Detect when typing (not Enter key) causes content changes
  - Save cursor position relative to viewport before repagination
  - Block automatic `scrollIntoView` during typing operations
  - Restore cursor to same viewport position after repagination
  - Special handling to allow Enter key at end of document to work normally

## ~~🔴 High Priority - Bug Fixes (Do Soon)~~ COMPLETED

### Scroll Glitch on Backspace
- [x] **Backspace scroll glitch at end of document** - Fixed! Scroll position now preserved during page reduction
  
  **Solution Implemented**:
  - Save scroll offset from bottom when deletion is detected
  - Block automatic `scrollIntoView` during deletion operations
  - Restore scroll position after page count reduction based on saved offset
  - Clean up protection flags after successful restoration
  
  **Investigation Summary**:
  - **Scenario**: Go to end of doc, press Enter to create new page, then press Backspace during repagination
  - **Root Cause**: Multiple interacting factors:
    1. When backspace causes page reduction (e.g., 6→5 pages), container height shrinks
    2. Browser automatically clamps scroll to new maximum (e.g., 3896.5 → 3147)
    3. The glitch only happens when cursor is in lines 1-5 of the viewport (not lines 6+)
    4. `scrollIntoView` is called multiple times during repagination, fighting with scroll position
  
  **Attempted Solutions**:
  1. ✗ Saving scroll position earlier in transaction - scroll already reset by then
  2. ✗ Native keydown capture - captured correct scroll but still glitched
  3. ✗ Continuous scroll enforcement with RAF - detected reset but couldn't prevent it
  4. ✗ Setting overflow:hidden during pagination - didn't prevent the reset
  5. ✗ Deferring height reduction until after scroll unlock - complex interaction with scrollIntoView
  6. ✗ Viewport-based detection (top 5 lines) - detection worked but prevention failed
  7. ✓ **Save offset from bottom + block scrollIntoView** - Successful approach!

### Memory Leaks & Stability
- [x] **Add destroyed flag** - Prevent async operations after extension destroy
  ```ts
  // Track destroyed state and guard async operations
  if (this.destroyed) return;
  ```
- [x] **Reset `allowUnstableUpdate` flag** - Clear flag on any decoration refresh to prevent ghost gaps
  ```ts
  if (extensionStorage.allowUnstableUpdate) {
    extensionStorage.allowUnstableUpdate = false;
  }
  ```
- [x] **Clear ResizeObserver timeout** - Ensure timeout is cleared if extension destroyed before it fires
- [x] **Guard Promise chains** - Add early returns in `measureAndUpdatePages` async body

### Edge Cases
- [x] **Cursor position clamping** - Already fixed with `Math.min(savedCursorPos, this.editor.state.doc.content.size)`
- [x] **Large delete ghost gaps** - Fix `allowUnstableUpdate` not being reset properly

### Type Safety
- [x] **Add missing storage type** - Declare `remeasureContent` in `addStorage()` return type
  ```ts
  remeasureContent: (delay?: number) => void;
  ```

## 🟡 Medium Priority - Performance Wins

### Layout Thrashing Fix (High Impact, Low Effort)
- [ ] **Single wrapper visibility toggle** - Replace individual element hiding with single wrapper
  ```ts
  // Instead of hiding hundreds of elements individually
  const paginationWrapper = targetNode.querySelector('#pages') as HTMLElement;
  paginationWrapper.style.visibility = 'hidden';
  const naturalHeight = targetNode.scrollHeight;
  paginationWrapper.style.visibility = '';
  ```
  **Impact**: Eliminates hundreds of reflows, significant performance improvement
  **Note**: Experimented with height auto approach but caused copy/paste regressions

### Throttling Improvements
- [x] **Throttle ResizeObserver with RAF**
  ```ts
  const resizeObserver = new ResizeObserver(entries => {
    if (this._resizeFrame) cancelAnimationFrame(this._resizeFrame);
    this._resizeFrame = requestAnimationFrame(() => remeasureContent(50));
  });
  ```
- [x] **Use `requestIdleCallback`** - Replace chained `setTimeout` for image/font waits with `requestIdleCallback` (16ms timeout)

### Minor Optimizations
- [x] **Return typed plugin key**
  ```ts
  const PAGINATION_PLUGIN = new PluginKey<DecorationSet>('pagination');
  ```

## 🟢 Low Priority - Code Quality

### Code Organization (When Time Allows)
- [ ] **Split into 4 files** for better maintainability:
  1. `pagination-dom.ts` - DOM creation/manipulation for breaks, headers, footers
  2. `measurement.ts` - Height calculations + waitForXXX helpers  
  3. `state.ts` - Storage definition + helpers
  4. `extension.ts` - Main extension glue code

### Code Style
- [ ] **Early-exit guards** - Refactor nested `if`s in `measureAndUpdatePages` to early returns
- [x] **Named constants** - Replace magic numbers (48, 20, 5) with named constants
- [ ] **Simplify conditional logic** - Reduce 300-line nested conditionals

### CSS Improvements
- [ ] **Static stylesheet** - Ship CSS as static file instead of injected strings
- [ ] **CSS-in-JS with typing** - If keeping dynamic CSS, add proper typing
- [ ] **Tree-shaking support** - Ensure CSS rules can be tree-shaken

### Configuration Architecture
- [ ] **Configurable padding/typography** - Make contentPadding, fontSize, lineHeight configurable without breaking height calculations
  - Currently hardcoded to 48px padding and 24px line-height for stable pagination
  - Height calculation algorithm needs to properly account for configurable values
  - Should allow developers to customize editor appearance while maintaining accurate page breaks

## 🔵 Future Considerations (Major Changes)

### Alternative Architecture (Only if Performance Issues)
- [ ] **CSS Columns Approach** - Prototype using CSS columns + `break-after: page` for printing
  - Keep editor single-scroll for editing
  - Paginate only for export/print via off-DOM iframe
  - Let browser handle page breaks natively
  - **Pros**: Eliminates runtime measurement complexity
  - **Cons**: Complete rewrite, may lose current edge case handling

### API Improvements
- [ ] **Single Responsibility** - Consider splitting into separate extensions:
  - Pagination logic
  - Layout measurement  
  - Cursor/scroll restoration
- [ ] **Expose fewer internals** - Simplify public API surface

## ✅ Recently Completed

- [x] **Memory leak protection** - Added destroyed flag and proper cleanup tracking
- [x] **Plugin instance ID tracking** - Unique plugin IDs for better lifecycle management
- [x] **Better initialization logic** - Mark extension as initialized after successful measurement
- [x] **Repagination stability** - Fixed lifecycle checks that prevented typing repagination
- [x] **Copy/paste regression fix** - Reverted height measurement to prevent extra pages
- [x] **Ghost gaps prevention** - Reset allowUnstableUpdate flag on decoration refresh
- [x] **All 22 tests passing** - Fixed cursor validation and async patterns
- [x] **Cursor position bounds checking** - Added `Math.min` validation
- [x] **Async pattern consistency** - Standardized requestAnimationFrame Promises
- [x] **Test coverage** - Added missing comments and patterns expected by tests
- [x] **ResizeObserver RAF throttling** - Improved performance by using requestAnimationFrame instead of setTimeout
- [x] **Promise chain guards** - Added early returns after async operations to prevent execution after cancellation
- [x] **Storage type safety** - Fixed remeasureContent type declaration to be non-nullable for proper TypeScript safety
- [x] **Large delete ghost gaps fix** - Ensure allowUnstableUpdate flag is reset even when page count doesn't change
- [x] **requestIdleCallback optimization** - Use requestIdleCallback instead of setTimeout for better async timing
- [x] **Typed plugin key** - Added explicit DecorationSet generic type to PluginKey for better TypeScript safety
- [x] **Named constants** - Replaced magic numbers in layout calculations with descriptive named constants
- [x] **Backspace scroll glitch fix** - Implemented scroll position preservation during page reduction using offset-from-bottom tracking
- [x] **Typing line wrap scroll fix** - Implemented cursor viewport position preservation during typing that causes line wrapping

## Notes

- **Current Status**: Extension works well and handles complex edge cases
- **Performance**: Generally good, but layout thrashing fix would provide significant improvement
- **Stability**: High priority fixes address real memory leak and edge case bugs
- **Maintainability**: Code organization improvements can wait until needed

**Philosophy**: Don't let perfect be the enemy of good. Focus on high-impact, low-effort improvements first.