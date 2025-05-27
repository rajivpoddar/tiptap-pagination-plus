# TipTap Pagination Plus - Technical Improvements TODO

Based on comprehensive code review feedback, prioritized by impact and effort.

## 🔴 High Priority - Bug Fixes (Do Soon)

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
- [ ] **Clear ResizeObserver timeout** - Ensure timeout is cleared if extension destroyed before it fires
- [ ] **Guard Promise chains** - Add early returns in `measureAndUpdatePages` async body

### Edge Cases
- [x] **Cursor position clamping** - Already fixed with `Math.min(savedCursorPos, this.editor.state.doc.content.size)`
- [ ] **Large delete ghost gaps** - Fix `allowUnstableUpdate` not being reset properly

### Type Safety
- [ ] **Add missing storage type** - Declare `remeasureContent` in `addStorage()` return type
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
- [ ] **Throttle ResizeObserver with RAF**
  ```ts
  const resizeObserver = new ResizeObserver(entries => {
    if (this._resizeFrame) cancelAnimationFrame(this._resizeFrame);
    this._resizeFrame = requestAnimationFrame(() => remeasureContent(50));
  });
  ```
- [ ] **Use `requestIdleCallback`** - Replace chained `setTimeout` for image/font waits with `requestIdleCallback` (16ms timeout)

### Minor Optimizations
- [ ] **Skip tiny edits** - Prevent redundant re-measure on minor typing
  ```ts
  if (Math.abs(sizeDiff) <= 2 && !isUndoRedo) return oldDeco; // skip tiny edits
  ```
- [ ] **Return typed plugin key**
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
- [ ] **Named constants** - Replace magic numbers (48, 20, 5) with named constants
- [ ] **Simplify conditional logic** - Reduce 300-line nested conditionals

### CSS Improvements
- [ ] **Static stylesheet** - Ship CSS as static file instead of injected strings
- [ ] **CSS-in-JS with typing** - If keeping dynamic CSS, add proper typing
- [ ] **Tree-shaking support** - Ensure CSS rules can be tree-shaken

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

## Notes

- **Current Status**: Extension works well and handles complex edge cases
- **Performance**: Generally good, but layout thrashing fix would provide significant improvement
- **Stability**: High priority fixes address real memory leak and edge case bugs
- **Maintainability**: Code organization improvements can wait until needed

**Philosophy**: Don't let perfect be the enemy of good. Focus on high-impact, low-effort improvements first.