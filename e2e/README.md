# Page Break E2E Tests

This directory contains end-to-end tests for the page break functionality using Playwright.

## Running the Tests

### Prerequisites
1. Make sure the project is built:
   ```bash
   npm run build
   ```

2. The tests will automatically start a local server on port 8000.

### Run Tests

Run all E2E tests:
```bash
npm run test:e2e
```

Run tests with UI mode (interactive):
```bash
npm run test:e2e:ui
```

Run tests for a specific browser:
```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

Run a specific test file:
```bash
npx playwright test e2e/pagebreak.spec.ts
```

### Test Coverage

The page break E2E tests cover the following happy path scenarios:

1. **Insert page break using button** - Verifies the page break button in the menu bar works correctly
2. **Insert page break using keyboard shortcut** - Tests Ctrl+Enter (or Cmd+Enter on Mac)
3. **Content push to next page** - Ensures content after page break appears on the next page
4. **Multiple page breaks** - Tests inserting multiple page breaks in a document
5. **Page breaks persist after editing** - Verifies page breaks remain after content changes
6. **Visual indicator display** - Checks page break visual elements are rendered correctly
7. **Undo/Redo functionality** - Tests that page breaks work with undo/redo commands
8. **Document boundary handling** - Tests page breaks at start and end of document
9. **Page structure with headers/footers** - Verifies proper pagination with headers
10. **Loading existing page breaks** - Tests that pre-existing page breaks load correctly

### Debugging

To debug tests:
```bash
npx playwright test --debug
```

To see the browser during test execution:
```bash
npx playwright test --headed
```

To slow down test execution:
```bash
npx playwright test --headed --slow-mo=1000
```

### Test Reports

After running tests, view the HTML report:
```bash
npx playwright show-report
```

### Troubleshooting

1. **Port 8000 already in use**: The tests use port 8000 for the local server. Make sure no other process is using this port.

2. **Tests timing out**: The tests include wait times for pagination updates. If tests are timing out on slower machines, you may need to increase the timeout values in the test file.

3. **Browser not installed**: Playwright needs to download browsers. Run:
   ```bash
   npx playwright install
   ```