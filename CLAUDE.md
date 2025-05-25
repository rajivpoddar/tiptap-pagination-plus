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