# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Build**: `npm run build` - Compiles TypeScript to dist/
- **Test**: `npm test` - Runs Jest test suite 
- **Watch**: `npm run watch` - Watches for changes and rebuilds automatically

## Architecture Overview

This is a TipTap extension package that adds pagination support to rich text editors, with specialized table handling capabilities.

### Core Extensions

The package exports 5 main extensions that work together:

1. **PaginationPlus** (`src/PaginationPlus.ts`) - The main pagination engine
   - Automatically calculates page breaks based on content height
   - Uses ProseMirror decorations to insert page break UI elements
   - Browser API-based content settlement detection for accurate height calculations
   - Handles dynamic content changes with debounced remeasurement
   - Complex height calculation logic accounting for headers, footers, gaps, and padding

2. **TablePlus** (`src/TablePlus.ts`) - Enhanced table extension
   - Extends TipTap's base Table extension
   - Supports `tableRowGroup` for better pagination handling
   - Dynamically calculates CSS grid columns based on table structure

3. **Table Row/Cell Extensions** - Enhanced versions of TipTap's table components
   - TableRowPlus, TableCellPlus, TableHeaderPlus
   - Work together to enable table content to split across pages

4. **TableRowGroup** (`src/TableRowGroup.ts`) - Special grouping for table rows
   - Allows tables to be split into chunks that fit within page boundaries

### Key Technical Details

- **Height Calculation**: Complex algorithm in PaginationPlus that accounts for:
  - Content editable padding (48px)
  - Page heights (configurable, default 842px)
  - Header/footer heights (configurable, default 50px each)
  - Page gaps (configurable, default 20px)
  - Header margins (48px per gap)

- **Content Settlement**: Uses browser APIs to detect when content is fully rendered:
  - `document.fonts.ready` for font loading
  - Image load detection
  - Intersection Observer for visibility
  - Layout stability detection via `requestAnimationFrame`

- **Auto-correction**: Built-in overflow detection and page count adjustment

### Testing Setup

- Uses Jest with jsdom environment for DOM testing
- Tests focus on height calculation algorithms
- Setup file mocks DOM measurements and requestAnimationFrame

## Configuration

The PaginationPlus extension accepts these options:
- `pageHeight`: Height of each page (default: 800px)
- `pageGap`: Gap between pages (default: 50px) 
- `pageBreakBackground`: Background color for gaps (default: "#ffffff")
- `pageHeaderHeight`: Header/footer height (default: 10px)
- `footerText`: Custom footer text
- `headerText`: Custom header text
- `maxPages`: Maximum pages (default: 1000)

## Debugging Scroll Issues

When debugging scroll position glitches during repagination, especially the "backspace at end of document" scenario:

1. **Add debug logging** to see scroll position changes:
   ```javascript
   console.log('Debug info:', JSON.stringify({
     scrollTop: targetNode.scrollTop,
     scrollLeft: targetNode.scrollLeft,
     cursorPos: selection.from,
     docSize: docSize
   }));
   ```

2. **Key debugging points** in PaginationPlus.ts:
   - Backspace handler in `addKeyboardShortcuts()` (around line 55)
   - Scroll restoration logic in `measureAndUpdatePages()` (around line 945)
   - Transaction apply method in the plugin (around line 1140)

3. **Common scroll glitch scenarios**:
   - **Backspace at end**: User presses Enter to create new page, then Backspace to delete content
   - **Page reduction**: Content deletion causes page count to decrease
   - **Large paste**: Big content additions that trigger repagination

4. **Current fix approach**: 
   - Backspace handler locks scroll position when cursor is at end of document
   - Scroll lock is enforced during pagination process
   - Lock is released when pagination completes

5. **Always use JSON.stringify** for debug logs to avoid object reference issues that can show stale data.

## Important Git Instructions

**NEVER commit changes automatically**. Always ask the user before creating any git commits. This ensures:
- The user maintains control over their git history
- Changes can be reviewed before committing
- Commit messages can be customized as needed
- The user can decide when they're ready to commit

When the user explicitly asks to commit, then follow the git commit instructions in the main Claude instructions.