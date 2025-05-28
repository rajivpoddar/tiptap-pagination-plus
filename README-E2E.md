# E2E Testing for TipTap Pagination Plus

This document describes the end-to-end testing setup for the TipTap Pagination Plus extension.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   npx playwright install
   ```

2. **Run tests:**
   ```bash
   # Run all E2E tests
   npm run test:e2e
   
   # Run tests with UI (interactive mode)
   npm run test:e2e:ui
   
   # Run tests in specific browser
   npx playwright test --project=chromium
   ```

## Test Coverage

The E2E test suite covers these critical pagination scenarios:

### Basic Content Operations
- **Select All + Delete**: Should result in exactly 1 page with empty content
- **Select All + Copy + Paste**: Page count should approximately double
- **Typing on Last Line**: Should maintain pagination functionality

### Page Creation/Deletion
- **Enter Key Spam**: Pressing Enter repeatedly should create new pages
- **Backspace Deletion**: Removing content should reduce page count
- **Rapid Typing**: Fast typing should not break layout

### Editor Functionality  
- **Undo/Redo**: Should work correctly and maintain pagination
- **Page Numbering**: Should show sequential page numbers (Page 1, Page 2, etc.)

## Test Architecture

- **Framework**: Playwright (cross-browser testing)
- **Browsers**: Chrome, Firefox, Safari
- **Server**: Auto-starts http-server on port 8080
- **Target**: `demo.html` file in project root

## Running Specific Tests

```bash
# Run only the undo/redo test
npx playwright test -g "undo/redo"

# Run only page creation tests  
npx playwright test -g "create new page"

# Run tests in headed mode (see browser)
npx playwright test --headed

# Debug a specific test
npx playwright test --debug -g "select all and delete"
```

## Test Environment

The tests expect:
- `demo.html` to be available at project root
- PaginationPlus extension built in `dist/` folder
- Editor to load within 10 seconds
- Pagination to be active (`.rm-with-pagination` class present)

## CI/CD Integration

Tests are configured for CI environments:
- Retries failed tests 2x on CI
- Uses single worker on CI for stability
- Generates HTML report on completion
- Records videos/screenshots on failure

## Troubleshooting

**Tests timing out:**
- Increase timeout values in test configuration
- Check if local server is running properly
- Verify demo.html loads correctly in browser

**Flaky tests:**
- Add more `waitForTimeout()` calls after user actions
- Use `waitForFunction()` for dynamic conditions
- Check if pagination has finished updating

**Cross-browser issues:**
- Some keyboard shortcuts differ (Ctrl vs Meta on macOS)
- Adjust selectors if DOM structure varies
- Test in headed mode to debug visually