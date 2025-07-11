var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
const pagination_meta_key = "PAGINATION_META_KEY";
export const PaginationPlus = Extension.create({
    name: "PaginationPlus",
    addOptions() {
        return {
            pageHeight: 800,
            pageGap: 50,
            pageGapBorderSize: 1,
            pageBreakBackground: "#ffffff",
            pageHeaderHeight: 10,
            footerText: "",
            headerText: "",
            maxPages: 1000,
            onReady: undefined,
            contentPadding: { top: 48, right: 96, bottom: 48, left: 96 },
            fontSize: 16,
            lineHeight: 1.5,
        };
    },
    addKeyboardShortcuts() {
        return {
            'Mod-ArrowUp': () => {
                // Workaround for Meta+Up not working due to pagination decorations
                this.editor.commands.setTextSelection(0);
                this.editor.commands.scrollIntoView();
                return true;
            },
            'Backspace': () => {
                // Prevent removing pagination when document is empty
                const { doc, selection } = this.editor.state;
                // Check if document is empty or nearly empty
                const isEmpty = doc.content.size <= 2; // Empty doc has size 2
                const isAtStart = selection.from === 0 || selection.from === 1;
                if (isEmpty && isAtStart) {
                    // Document is empty and cursor at start - prevent default backspace
                    // This ensures pagination (header/footer) remains visible
                    // Force page count to 1 if it somehow got set to 0
                    if (this.storage.correctPageCount < 1) {
                        this.storage.correctPageCount = 1;
                        // Trigger decoration update
                        this.editor.view.dispatch(this.editor.view.state.tr.setMeta(pagination_meta_key, true));
                    }
                    return true; // Prevent default backspace behavior
                }
                // Let default backspace behavior handle all other cases
                return false;
            },
        };
    },
    addStorage() {
        return {
            correctPageCount: 1,
            remeasureTimer: null,
            isInitialized: false,
            calculatePaginatedHeight: null,
            calculatePageCount: null,
            // Position preservation
            savedCursorPos: -1,
            savedScrollTop: 0,
            savedScrollLeft: 0,
            positionSaved: false,
            // Track last measured height to avoid unnecessary updates
            lastMeasuredHeight: 0,
            // Track stable height measurements
            stableHeightMeasurements: [],
            stableHeightThreshold: 3,
            // Measurement cancellation token
            measureToken: 0,
            currentMeasurePromise: null,
            // Cleanup tracking
            cleanups: [],
            // Flag to prevent cancelling initial measurement
            isInitialMeasurement: true,
            // Track child measurements for debugging
            lastChildCount: 0,
            lastTotalChildHeight: 0,
            // Grace period after initial setup
            initialSetupCompleteTime: 0,
            // Lock the expected height range for content
            lockedHeightRange: { min: 0, max: 0 },
            // Allow page count updates even when height is unstable (for deletions)
            allowUnstableUpdate: false,
            // Flag to scroll to cursor after pagination (for large paste)
            scrollToCursorAfterUpdate: false,
            // Track typing activity to avoid interfering with cursor during active typing
            lastTypingTime: 0,
            typingThreshold: 1000, // 1 second of inactivity before allowing cursor restoration
            // Extension lifecycle tracking
            destroyed: false,
            // Type the remeasureContent function for proper type safety
            remeasureContent: (() => { }),
            // Store plugin instance ID for cleanup
            pluginInstanceId: null,
            // Store editor reference for plugin access
            editor: null,
            // Scroll position preservation for backspace deletions
            offsetFromBottom: undefined,
            blockScrollIntoView: false,
            savedPageCountBeforeDeletion: undefined,
            // Cursor position in viewport for typing scenarios
            cursorViewportOffset: undefined,
            // Dynamic page break height calculation
            isUpdatingPageBreaks: false,
            updatePageBreakHeights: (() => { }),
        };
    },
    onCreate() {
        const targetNode = this.editor.view.dom;
        targetNode.classList.add("rm-with-pagination");
        // Store editor reference for plugin access
        this.storage.editor = this.editor;
        // Options are available as this.options
        // Named constants for layout calculations
        const LAYOUT_CONSTANTS = {
            CONTENT_EDITABLE_PADDING: 48, // Content area padding (hardcoded for now - TODO: make configurable)
            FOOTER_WRAPPER_EXTRA_HEIGHT: 20, // 10px top + 10px bottom padding
            HEADER_MARGIN_CONTRIBUTION: 48, // Header margin per gap
            ONE_FRAME_MS: 16, // One animation frame duration
            DELETION_DELAY_MS: 100, // Faster remeasure for deletions
            NORMAL_TYPING_DELAY_MS: 300, // Standard remeasure delay
            LARGE_PASTE_THRESHOLD: 1000, // Size diff for large paste detection
            VERY_LARGE_PASTE_THRESHOLD: 10000, // Size diff for very large paste
            TYPING_THRESHOLD_MS: 1000, // Inactivity before cursor restoration
            GRACE_PERIOD_MS: 500, // Grace period after initialization
            LARGE_CHANGE_THRESHOLD: 50, // Size diff for height lock reset
        };
        const _pageHeaderHeight = this.options.pageHeaderHeight;
        const _pageHeight = this.options.pageHeight - _pageHeaderHeight * 2;
        // Inject styles
        const style = document.createElement("style");
        style.dataset.rmPaginationStyle = "";
        style.textContent = `
      .rm-with-pagination {
        counter-reset: page-number;
        overflow: hidden;
        line-height: ${this.options.lineHeight};
        font-size: ${this.options.fontSize}px;
        padding: ${this.options.contentPadding.top}px ${this.options.contentPadding.right}px ${this.options.contentPadding.bottom}px ${this.options.contentPadding.left}px !important;
        box-sizing: border-box;
      }
      .rm-with-pagination .rm-page-footer::before {
        counter-increment: page-number;
        content: "${this.options.footerText} " counter(page-number); 
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        top: 5px;
      }
      .rm-with-pagination .rm-page-footer {
        font-size: 0.8em;
        color: #7c7c7c;
        position: relative;
        white-space: nowrap;
        overflow: hidden;
      }
      .rm-with-pagination .rm-page-header {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        padding: 0 25px;
        font-size: 0.8em;
        color: #7c7c7c;
        margin-top: 48px;
        position: relative;
        top: -15px;
        user-select: none;
      }
      .rm-with-pagination > *:not(#pages):not(.rm-page-header):not(.rm-page-footer):not([data-rm-pagination]) {
        position: relative;
        z-index: 1;
      }
      .rm-with-pagination .ProseMirror-selectednode {
        outline: none;
      }
      .rm-with-pagination .rm-page-break.last-page ~ .rm-page-break,
      .rm-with-pagination .rm-page-break.hidden {
        display: none;
      }
      .rm-with-pagination .rm-page-break.last-page .rm-pagination-gap {
        display: none;
      }
      .rm-with-pagination .rm-page-break.last-page .rm-page-header {
        display: none;
      }
      .rm-with-pagination table tbody > tr > td {
        width: calc(100% / var(--cell-count));
        word-break: break-all;
      }
      .rm-with-pagination table > tr {
        display: grid;
        min-width: 100%;
      }
      .rm-with-pagination table {
        border-collapse: collapse;
        width: 100%;
        display: contents;
      }
      .rm-with-pagination table tbody{
        display: table;
        max-height: 300px;
        overflow-y: auto;
      }
      .rm-with-pagination table tbody > tr{
        display: table-row !important;
      }
      .rm-with-pagination p:has(br.ProseMirror-trailingBreak:only-child) {
        display: table;
        width: 100%;
        margin: 0;
        border-collapse: collapse;
      }
      .rm-with-pagination p {
        margin: 0;
      }
      .rm-with-pagination p:empty,
      .rm-with-pagination p > br.ProseMirror-trailingBreak:only-child {
        display: table;
        width: 100%;
        height: 24px;
        line-height: 24px;
      }
      .rm-with-pagination .table-row-group {
        max-height: ${_pageHeight}px;
        overflow-y: auto;
        width: 100%;
      }
      
      /* Firefox-specific fix: Use block display for empty paragraphs to maintain Enter functionality */
      @-moz-document url-prefix() {
        .rm-with-pagination p:empty,
        .rm-with-pagination p > br.ProseMirror-trailingBreak:only-child {
          display: block !important;
          min-height: 24px !important;
          line-height: 24px !important;
          width: 100% !important;
        }
        .rm-with-pagination p:has(br.ProseMirror-trailingBreak:only-child) {
          display: block !important;
          min-height: 24px !important;
          line-height: 24px !important;
          width: 100% !important;
        }
      }
      
      /* Manual page break styles - creates a spacer that pushes content to next page */
      .rm-with-pagination .page-break-node {
        display: block;
        width: 100%;
        min-height: 20px;
        background: transparent;
        border: none;
        pointer-events: none;
        user-select: none;
        -webkit-user-select: none;
        /* Dynamic height will be set via CSS variable */
        height: var(--page-break-height, 200px);
      }
    `;
        document.head.appendChild(style);
        // Calculate paginated height based on page count
        const calculatePaginatedHeight = (pageCount) => {
            const { CONTENT_EDITABLE_PADDING, FOOTER_WRAPPER_EXTRA_HEIGHT, HEADER_MARGIN_CONTRIBUTION } = LAYOUT_CONSTANTS;
            if (pageCount === 1) {
                // For single page, just add padding to page height + footer wrapper extra height
                const singlePageHeight = CONTENT_EDITABLE_PADDING + this.options.pageHeight + FOOTER_WRAPPER_EXTRA_HEIGHT;
                return singlePageHeight;
            }
            const visibleGaps = pageCount - 1;
            // Height calculation breakdown (matches cumulative analysis):
            // - Content padding: 48px (hardcoded for now)
            // - Page heights: configured page height × number of pages (includes headers/footers)
            // - Gaps: configured gap size × number of gaps
            // - Header margins: 48px × number of gaps
            // - Footer wrapper extra height: 20px × number of pages
            let total = CONTENT_EDITABLE_PADDING;
            total += this.options.pageHeight * pageCount;
            total += this.options.pageGap * visibleGaps;
            total += HEADER_MARGIN_CONTRIBUTION * visibleGaps;
            total += FOOTER_WRAPPER_EXTRA_HEIGHT * pageCount;
            return total;
        };
        // Calculate page count based on natural height
        const calculatePageCount = (naturalHeight) => {
            const contentEditablePadding = 48;
            const contentPerPage = this.options.pageHeight - this.options.pageHeaderHeight * 2;
            const initialHeight = contentEditablePadding + this.options.pageHeaderHeight * 2;
            const adjustedHeight = Math.max(0, naturalHeight - initialHeight);
            // Check if we have actual content beyond the initial structure
            const contentElement = this.editor.view.dom.querySelector(".ProseMirror-content");
            const hasActualContent = (contentElement === null || contentElement === void 0 ? void 0 : contentElement.textContent)
                ? contentElement.textContent.trim().length > 0
                : false;
            // Calculate page count based on adjusted height, but also consider text content
            // If we have significant height (more than 1.5 pages worth), trust the height calculation
            const significantHeight = adjustedHeight > contentPerPage * 1.5;
            // Check for manual page breaks in the document
            const pageBreakNodes = this.editor.state.doc.content.content.filter((node) => node.type.name === 'pageBreak');
            const manualPageBreaks = pageBreakNodes.length;
            // If we have manual page breaks, ensure we have at least that many pages + 1
            if (manualPageBreaks > 0) {
                const calculatedPages = hasActualContent || significantHeight
                    ? Math.max(1, Math.ceil(adjustedHeight / contentPerPage))
                    : 1;
                return Math.max(calculatedPages, manualPageBreaks + 1);
            }
            return hasActualContent || significantHeight
                ? Math.max(1, Math.ceil(adjustedHeight / contentPerPage))
                : 1;
        };
        // Analyze page breaks in the document and return their positions
        const analyzePageBreaks = () => {
            const pageBreaks = [];
            let pos = 0;
            this.editor.state.doc.descendants((node, nodePos) => {
                if (node.type.name === 'pageBreak') {
                    pageBreaks.push({ pos: nodePos, node });
                }
            });
            return pageBreaks;
        };
        // Update page break heights dynamically
        const updatePageBreakHeights = () => __awaiter(this, void 0, void 0, function* () {
            var _a;
            // Prevent recursive calls
            if (this.storage.isUpdatingPageBreaks) {
                return;
            }
            this.storage.isUpdatingPageBreaks = true;
            try {
                // Wait for DOM to stabilize
                yield new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
                // Find all page break elements in the DOM
                let pageBreakElements = targetNode.querySelectorAll('.page-break-node');
                // Also check for other selectors the PageBreak might use
                const altPageBreakElements = targetNode.querySelectorAll('[data-page-break="true"], .tiptap-page-break, div[data-page-break]');
                if (pageBreakElements.length === 0 && altPageBreakElements.length > 0) {
                    // Use the alternative selector results
                    pageBreakElements = altPageBreakElements;
                }
                if (pageBreakElements.length === 0) {
                    return;
                }
                const pageHeight = this.options.pageHeight;
                const headerHeight = this.options.pageHeaderHeight;
                const contentHeight = pageHeight - headerHeight * 2;
                const lineHeight = this.options.fontSize * this.options.lineHeight;
                // Process each page break sequentially to ensure previous heights are applied
                for (let index = 0; index < pageBreakElements.length; index++) {
                    const element = pageBreakElements[index];
                    const pageBreakEl = element;
                    // Get the position of this page break in the document
                    const rect = pageBreakEl.getBoundingClientRect();
                    const containerRect = targetNode.getBoundingClientRect();
                    const relativeTop = rect.top - containerRect.top + targetNode.scrollTop;
                    // Calculate which page this element is on
                    const currentPage = Math.floor(relativeTop / pageHeight);
                    const pageStartY = currentPage * pageHeight + headerHeight;
                    const pageEndY = pageStartY + contentHeight;
                    // Calculate how much space is left on the current page
                    const spaceUsedOnPage = relativeTop - pageStartY;
                    const spaceLeftOnPage = pageEndY - relativeTop;
                    // The page break should fill the entire remaining space on the current page
                    // to push ALL following content to the next page
                    // We need to account for the fact that the page break itself takes some space
                    // and that content after it needs to start cleanly on the next page
                    // Start with the space left on the page
                    let requiredHeight = spaceLeftOnPage;
                    // We need to ensure the page break fills exactly to the page boundary
                    // No buffer needed here - we want to fill exactly to the end
                    requiredHeight = spaceLeftOnPage;
                    // Round to nearest line height for cleaner breaks
                    let lines = Math.ceil(requiredHeight / lineHeight);
                    let testHeight = lines * lineHeight;
                    // Use mathematical approach to calculate exact height needed
                    // Find the next content element after this page break
                    let nextElement = pageBreakEl.nextElementSibling;
                    while (nextElement && (nextElement.classList.contains('page-break-node') ||
                        nextElement.classList.contains('rm-page-break') ||
                        ((_a = nextElement.dataset) === null || _a === void 0 ? void 0 : _a.rmPagination))) {
                        nextElement = nextElement.nextElementSibling;
                    }
                    if (nextElement) {
                        // Get initial position of next content
                        const initialNextRect = nextElement.getBoundingClientRect();
                        const initialNextTop = initialNextRect.top - containerRect.top + targetNode.scrollTop;
                        const targetPage = currentPage + 1;
                        const targetPageStartY = targetPage * pageHeight + headerHeight;
                        // Use O(1) mathematical calculation instead of iterative approach
                        // Step 1: Set page break to minimum height to remove previous influence
                        pageBreakEl.style.setProperty('--page-break-height', '1px');
                        // Force layout recalculation to get clean measurements
                        void pageBreakEl.offsetHeight;
                        void targetNode.offsetHeight;
                        // Step 2: Measure where the next content currently sits
                        const nextRect = nextElement.getBoundingClientRect();
                        const nextTop = nextRect.top - containerRect.top + targetNode.scrollTop;
                        // Calculate target page start (reuse from above)
                        // const targetPageStartY = targetPage * pageHeight + headerHeight; // Already calculated above
                        // Step 3: Use visual approach to find target page position
                        // Build ordered array of actual page starts from rendered headers
                        const pageHeaders = Array.from(targetNode.querySelectorAll('.rm-page-header'));
                        const pageTops = pageHeaders
                            .map(header => {
                            const rect = header.getBoundingClientRect();
                            return rect.top - containerRect.top + targetNode.scrollTop;
                        })
                            .sort((a, b) => a - b); // 0-based page order
                        // Find which page the next content element currently lands on
                        let currentContentPageIndex = 0;
                        while (currentContentPageIndex + 1 < pageTops.length &&
                            nextTop >= pageTops[currentContentPageIndex + 1]) {
                            currentContentPageIndex++;
                        }
                        // The target page is the next page after where content currently sits
                        const targetPageIndex = currentContentPageIndex + 1;
                        // Calculate actual target page start position
                        let actualTargetPageStart;
                        if (targetPageIndex < pageTops.length) {
                            // We have the target page header - use its actual position
                            actualTargetPageStart = pageTops[targetPageIndex] + headerHeight;
                        }
                        else {
                            // Target page doesn't exist yet - this shouldn't happen in normal operation
                            // Fall back to mathematical calculation
                            actualTargetPageStart = targetPage * pageHeight + headerHeight;
                        }
                        const currentOffsetWithinPage = nextTop - (currentPage * pageHeight + headerHeight);
                        const deltaNeeded = actualTargetPageStart - nextTop;
                        let finalHeight;
                        if (deltaNeeded <= 0) {
                            // Content is already on or past the target page
                            // Use minimum height to maintain the page break node
                            finalHeight = lineHeight;
                        }
                        else {
                            // Calculate exact height needed - deltaNeeded is the direct distance
                            // No need to add spaceLeftOnPage as deltaNeeded already accounts for it
                            const exactHeight = deltaNeeded;
                            const linesNeeded = Math.ceil(exactHeight / lineHeight);
                            finalHeight = linesNeeded * lineHeight;
                        }
                        // Step 4: Set the calculated height
                        pageBreakEl.style.setProperty('--page-break-height', `${finalHeight}px`);
                        // Step 5: Verify using visual approach - is content at start of target page?
                        void pageBreakEl.offsetHeight;
                        void targetNode.offsetHeight;
                        const verifyRect = nextElement.getBoundingClientRect();
                        const verifyTop = verifyRect.top - containerRect.top + targetNode.scrollTop;
                        // Re-scan page headers after height change
                        const verifyPageHeaders = Array.from(targetNode.querySelectorAll('.rm-page-header'));
                        const verifyPageTops = verifyPageHeaders
                            .map(header => {
                            const rect = header.getBoundingClientRect();
                            return rect.top - containerRect.top + targetNode.scrollTop;
                        })
                            .sort((a, b) => a - b);
                        // Find which page the content actually landed on
                        let actualPageIndex = 0;
                        while (actualPageIndex + 1 < verifyPageTops.length &&
                            verifyTop >= verifyPageTops[actualPageIndex + 1]) {
                            actualPageIndex++;
                        }
                        // Calculate the ideal start position for this page
                        const actualPageStart = verifyPageTops[actualPageIndex] + headerHeight;
                        const offsetFromPageStart = verifyTop - actualPageStart;
                        const tolerancePx = lineHeight; // 1 line height tolerance
                        const atStartOfPage = Math.abs(offsetFromPageStart) <= tolerancePx;
                        const verifyOffsetWithinPage = offsetFromPageStart; // For binary search compatibility
                        // Step 6: Optional binary search refinement for precision
                        if (!atStartOfPage || actualPageIndex !== targetPageIndex) {
                            let minHeight = Math.max(lineHeight, finalHeight - lineHeight);
                            let maxHeight = finalHeight + lineHeight;
                            let bestHeight = finalHeight;
                            let bestDistance = Math.abs(offsetFromPageStart);
                            let bestPageCorrect = actualPageIndex === targetPageIndex;
                            for (let binaryIter = 0; binaryIter < 4; binaryIter++) {
                                const midHeight = Math.round((minHeight + maxHeight) / 2);
                                pageBreakEl.style.setProperty('--page-break-height', `${midHeight}px`);
                                void pageBreakEl.offsetHeight;
                                void targetNode.offsetHeight;
                                const testRect = nextElement.getBoundingClientRect();
                                const testTop = testRect.top - containerRect.top + targetNode.scrollTop;
                                // Re-scan page headers after height change
                                const testPageHeaders = Array.from(targetNode.querySelectorAll('.rm-page-header'));
                                const testPageTops = testPageHeaders
                                    .map(header => {
                                    const rect = header.getBoundingClientRect();
                                    return rect.top - containerRect.top + targetNode.scrollTop;
                                })
                                    .sort((a, b) => a - b);
                                // Find which page content landed on
                                let testPageIndex = 0;
                                while (testPageIndex + 1 < testPageTops.length &&
                                    testTop >= testPageTops[testPageIndex + 1]) {
                                    testPageIndex++;
                                }
                                const testPageStart = testPageTops[testPageIndex] + headerHeight;
                                const testOffset = testTop - testPageStart;
                                const distance = Math.abs(testOffset);
                                const pageCorrect = testPageIndex === targetPageIndex;
                                // Prefer solutions that get the page right, then optimize for distance
                                if (pageCorrect && !bestPageCorrect) {
                                    bestHeight = midHeight;
                                    bestDistance = distance;
                                    bestPageCorrect = true;
                                }
                                else if (pageCorrect === bestPageCorrect && distance < bestDistance) {
                                    bestHeight = midHeight;
                                    bestDistance = distance;
                                }
                                if (testOffset > 0) {
                                    // Content is below target, need more height
                                    minHeight = midHeight;
                                }
                                else {
                                    // Content is above target, need less height
                                    maxHeight = midHeight;
                                }
                                // Early exit if we're close enough and on the right page
                                if (pageCorrect && distance <= tolerancePx)
                                    break;
                            }
                            finalHeight = bestHeight;
                            pageBreakEl.style.setProperty('--page-break-height', `${finalHeight}px`);
                        }
                    }
                    else {
                        // No next element - just fill the remaining space on current page
                        const fallbackHeight = Math.ceil(spaceLeftOnPage / lineHeight) * lineHeight;
                        pageBreakEl.style.setProperty('--page-break-height', `${fallbackHeight}px`);
                    }
                    // Force layout recalculation after setting final height
                    // This ensures the next page break sees the correct positions
                    void targetNode.offsetHeight;
                    yield new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
                }
            }
            finally {
                this.storage.isUpdatingPageBreaks = false;
            }
        });
        // Helper functions for detecting when content is ready
        const waitForImages = (container) => {
            const images = container.querySelectorAll("img");
            if (images.length === 0) {
                return Promise.resolve();
            }
            const imagePromises = Array.from(images).map((img) => {
                if (img.complete) {
                    return Promise.resolve();
                }
                return new Promise((resolve) => {
                    const onLoad = () => {
                        img.removeEventListener("load", onLoad);
                        img.removeEventListener("error", onLoad);
                        resolve();
                    };
                    img.addEventListener("load", onLoad);
                    img.addEventListener("error", onLoad);
                    // Timeout after 5 seconds for broken images
                    const timeoutId = setTimeout(onLoad, 5000);
                    // Track cleanup for proper disposal
                    this.storage.cleanups.push(() => {
                        clearTimeout(timeoutId);
                        img.removeEventListener("load", onLoad);
                        img.removeEventListener("error", onLoad);
                    });
                });
            });
            return Promise.all(imagePromises).then(() => { });
        };
        const waitForLayoutStable = (container) => {
            return new Promise((resolve) => {
                let lastHeight = container.scrollHeight;
                let stableCount = 0;
                const requiredStableFrames = 3; // Need 3 consecutive stable frames
                const checkStability = () => {
                    const currentHeight = container.scrollHeight;
                    if (currentHeight === lastHeight) {
                        stableCount++;
                        if (stableCount >= requiredStableFrames) {
                            resolve();
                            return;
                        }
                    }
                    else {
                        stableCount = 0;
                        lastHeight = currentHeight;
                    }
                    requestAnimationFrame(checkStability);
                };
                requestAnimationFrame(checkStability);
            });
        };
        const waitForContentVisible = (container) => {
            return new Promise((resolve) => {
                // Use Intersection Observer to detect when content is visible
                const observer = new IntersectionObserver((entries) => {
                    const entry = entries[0];
                    if (entry.isIntersecting && entry.intersectionRatio > 0) {
                        observer.disconnect();
                        resolve();
                    }
                }, { threshold: 0.01 }); // Trigger when even 1% is visible
                observer.observe(container);
                // Fallback timeout
                const timeoutId = setTimeout(() => {
                    observer.disconnect();
                    resolve();
                }, 1000);
                // Track cleanup
                this.storage.cleanups.push(() => {
                    clearTimeout(timeoutId);
                    observer.disconnect();
                });
            });
        };
        // Store methods in storage for testing access
        this.storage.calculatePaginatedHeight = calculatePaginatedHeight;
        this.storage.calculatePageCount = calculatePageCount;
        // Main measurement function with cancellation support
        const measureAndUpdatePages = (callback) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            // Increment token to cancel any pending measurements
            const currentToken = ++this.storage.measureToken;
            const isInitialMeasurement = this.storage.isInitialMeasurement;
            // Save positions if not already saved
            if (!this.storage.positionSaved) {
                this.storage.savedCursorPos = this.editor.state.selection.from;
                this.storage.savedScrollTop = targetNode.scrollTop;
                this.storage.savedScrollLeft = targetNode.scrollLeft;
                this.storage.positionSaved = true;
            }
            // Use saved positions for restoration 
            const savedCursorPos = this.storage.savedCursorPos;
            const savedScrollTop = this.storage.savedScrollTop;
            const savedScrollLeft = this.storage.savedScrollLeft;
            // Measure content height without changing container dimensions
            // Wait for layout to complete
            yield new Promise(resolve => requestAnimationFrame(() => resolve()));
            yield new Promise(resolve => requestAnimationFrame(() => resolve()));
            // Check if measurement was cancelled
            if (currentToken !== this.storage.measureToken && !isInitialMeasurement) {
                return;
            }
            // Use browser APIs to detect when content is truly ready (for all document sizes)
            try {
                // Check if cancelled before proceeding with expensive operations
                if (currentToken !== this.storage.measureToken && !isInitialMeasurement)
                    return;
                // Wait for all browser APIs to indicate readiness
                yield Promise.all([
                    // 1. Wait for fonts to load
                    document.fonts.ready,
                    // 2. Wait for images to load (if any)
                    waitForImages(targetNode),
                    // 3. Wait for content to be visible (layout complete)
                    waitForContentVisible(targetNode),
                    // 4. Wait for layout to stabilize
                    waitForLayoutStable(targetNode),
                    // 5. Wait for any pending async operations
                    new Promise((resolve) => {
                        if ('requestIdleCallback' in window) {
                            requestIdleCallback(resolve, { timeout: LAYOUT_CONSTANTS.ONE_FRAME_MS });
                        }
                        else {
                            setTimeout(resolve, LAYOUT_CONSTANTS.ONE_FRAME_MS); // Fallback for older browsers
                        }
                    }),
                ]);
                // Check cancellation after async operations
                if (currentToken !== this.storage.measureToken &&
                    !isInitialMeasurement) {
                    return;
                }
                // BATCH READ PHASE: Collect all measurements first
                const measurements = {
                    // Force a single layout reflow for all reads
                    offsetHeight: targetNode.offsetHeight,
                    paginationElements: [],
                    childMeasurements: [],
                    containerPadding: { top: 0, bottom: 0 },
                };
                // Collect pagination elements info - include ALL pagination-related elements
                const paginationSelectors = "[data-rm-pagination], .rm-page-header, .rm-page-footer, .rm-page-break";
                const paginationElements = targetNode.querySelectorAll(paginationSelectors);
                paginationElements.forEach((el) => {
                    const element = el;
                    measurements.paginationElements.push({
                        element,
                        display: element.style.display,
                    });
                });
                // Collect all child measurements in one go
                const children = targetNode.children;
                const childDetails = [];
                let skippedCount = 0;
                // First, ensure all pagination elements are truly hidden and measure their original state
                const paginationHiddenStates = new Map();
                const allPaginationElements = targetNode.querySelectorAll(".rm-page-break, .rm-page-header, .rm-page-footer, [data-rm-pagination], #pages");
                allPaginationElements.forEach((el) => {
                    const element = el;
                    // Store original display state
                    paginationHiddenStates.set(element, element.style.display);
                    // Force hide with visibility hidden to maintain layout but exclude from height
                    element.style.visibility = "hidden";
                    element.style.position = "absolute";
                    element.style.top = "-9999px";
                });
                // Force layout recalculation after hiding
                void targetNode.offsetHeight;
                for (let i = 0; i < children.length; i++) {
                    const child = children[i];
                    // Skip pagination elements and headers/footers
                    const isPagination = child.dataset.rmPagination ||
                        child.classList.contains("rm-page-header") ||
                        child.classList.contains("rm-page-footer") ||
                        child.classList.contains("rm-page-break") ||
                        ((_a = child.id) === null || _a === void 0 ? void 0 : _a.includes("pages")) ||
                        child.classList.contains("ProseMirror-widget") ||
                        paginationHiddenStates.has(child);
                    if (isPagination) {
                        skippedCount++;
                        continue;
                    }
                    const rect = child.getBoundingClientRect();
                    const styles = window.getComputedStyle(child);
                    const height = rect.height || 0;
                    const marginTop = parseFloat(styles.marginTop) || 0;
                    const marginBottom = parseFloat(styles.marginBottom) || 0;
                    childDetails.push({
                        tagName: child.tagName,
                        className: child.className,
                        height,
                        marginTop,
                        marginBottom,
                        totalHeight: height + marginTop + marginBottom,
                    });
                    measurements.childMeasurements.push({
                        height,
                        marginTop,
                        marginBottom,
                    });
                }
                // Track child measurements for debugging purposes
                if (childDetails.length > 0) {
                    this.storage.lastChildCount = childDetails.length;
                    this.storage.lastTotalChildHeight = childDetails.reduce((sum, child) => sum + child.totalHeight, 0);
                }
                // Get container padding
                const containerStyles = window.getComputedStyle(targetNode);
                measurements.containerPadding.top =
                    parseFloat(containerStyles.paddingTop) || 0;
                measurements.containerPadding.bottom =
                    parseFloat(containerStyles.paddingBottom) || 0;
                // Calculate content height from collected measurements
                let contentHeight = 0;
                measurements.childMeasurements.forEach(({ height, marginTop, marginBottom }) => {
                    contentHeight += height + marginTop + marginBottom;
                });
                const naturalHeight = contentHeight +
                    measurements.containerPadding.top +
                    measurements.containerPadding.bottom;
                // Restore pagination elements to their original state
                paginationHiddenStates.forEach((originalDisplay, element) => {
                    element.style.visibility = "";
                    element.style.position = "";
                    element.style.top = "";
                    element.style.display = originalDisplay;
                });
                // Validate naturalHeight
                if (isNaN(naturalHeight) || naturalHeight <= 0) {
                    return;
                }
                // Calculate page count from natural content height
                // Calculate based on content area per page (pageHeight - headers/footers)
                const contentPerPage = this.options.pageHeight - this.options.pageHeaderHeight * 2;
                const contentEditablePadding = 48; // Fixed padding for content editable
                // For initial state, we need to account for the fact that the natural height
                // includes the initial header, footer, and padding
                const initialHeight = contentEditablePadding + this.options.pageHeaderHeight * 2; // Header + Footer
                const adjustedHeight = Math.max(0, naturalHeight - initialHeight);
                // Check if we have actual content beyond the initial structure
                const contentElement = targetNode.querySelector(".ProseMirror-content");
                const hasActualContent = (contentElement === null || contentElement === void 0 ? void 0 : contentElement.textContent)
                    ? contentElement.textContent.trim().length > 0
                    : false;
                // Calculate page count based on adjusted height, but also consider text content
                // If we have significant height (more than 1.5 pages worth), trust the height calculation
                const significantHeight = adjustedHeight > contentPerPage * 1.5;
                let initialPageCount = hasActualContent || significantHeight
                    ? Math.max(1, Math.ceil(adjustedHeight / contentPerPage))
                    : 1;
                // Apply maxPages limit
                initialPageCount = Math.min(initialPageCount, this.options.maxPages || 1000);
                // Use initial calculation for now
                let pageCount = initialPageCount;
                // Track stable height measurements
                if (this.storage.stableHeightMeasurements.length >=
                    this.storage.stableHeightThreshold) {
                    this.storage.stableHeightMeasurements.shift();
                }
                this.storage.stableHeightMeasurements.push(naturalHeight);
                // Check if height is stable (all recent measurements within 5px)
                const isHeightStable = this.storage.stableHeightMeasurements.length >=
                    this.storage.stableHeightThreshold &&
                    Math.max(...this.storage.stableHeightMeasurements) -
                        Math.min(...this.storage.stableHeightMeasurements) <=
                        5;
                // For initial measurement, always accept the first valid measurement
                // This prevents the issue where content changes size after decorations are added
                if (isInitialMeasurement &&
                    this.storage.correctPageCount === 1 &&
                    pageCount > 1) {
                    this.storage.correctPageCount = Math.max(1, pageCount);
                    this.storage.lastMeasuredHeight = naturalHeight;
                    // Lock in an acceptable height range (±0.5 page tolerance)
                    // Tighter tolerance to prevent unnecessary page count changes
                    const tolerance = contentPerPage * 0.5; // Allow 0.5 page worth of variation
                    this.storage.lockedHeightRange = {
                        min: naturalHeight - tolerance,
                        max: naturalHeight + tolerance,
                    };
                    // Trigger decoration update
                    this.editor.view.dispatch(this.editor.view.state.tr.setMeta(pagination_meta_key, true));
                    // Update page break heights after initial setup
                    requestAnimationFrame(() => {
                        updatePageBreakHeights();
                    });
                }
                else if (!this.storage.isInitialMeasurement) {
                    // Only update page count after initial setup is complete
                    const timeSinceSetup = this.storage.initialSetupCompleteTime
                        ? Date.now() - this.storage.initialSetupCompleteTime
                        : Infinity;
                    const inGracePeriod = timeSinceSetup < LAYOUT_CONSTANTS.GRACE_PERIOD_MS;
                    if (!inGracePeriod) {
                        // Check if height has actually changed to avoid unnecessary updates
                        const heightChanged = Math.abs(naturalHeight - this.storage.lastMeasuredHeight) > 5; // 5px tolerance
                        if (heightChanged) {
                            this.storage.lastMeasuredHeight = naturalHeight;
                            // Check if we're within the locked height range
                            const withinLockedRange = naturalHeight >= this.storage.lockedHeightRange.min &&
                                naturalHeight <= this.storage.lockedHeightRange.max;
                            // Update page count if changed
                            if (pageCount !== this.storage.correctPageCount) {
                                // Update if height is stable AND outside locked range, OR if unstable update is allowed
                                const shouldUpdate = (!withinLockedRange && isHeightStable) || this.storage.allowUnstableUpdate;
                                if (shouldUpdate) {
                                    const oldPageCount = this.storage.correctPageCount;
                                    this.storage.correctPageCount = Math.max(1, pageCount);
                                    // Clear the unstable update flag after use
                                    this.storage.allowUnstableUpdate = false;
                                    // If page count decreased due to deletion, clear scroll protection after update
                                    if (pageCount < oldPageCount && this.storage.blockScrollIntoView) {
                                        // Delay clearing the block to ensure all scroll operations are complete
                                        requestAnimationFrame(() => {
                                            requestAnimationFrame(() => {
                                                this.storage.blockScrollIntoView = false;
                                            });
                                        });
                                    }
                                    // Update locked range for new page count
                                    const tolerance = contentPerPage * 0.5;
                                    this.storage.lockedHeightRange = {
                                        min: naturalHeight - tolerance,
                                        max: naturalHeight + tolerance,
                                    };
                                    // Trigger decoration update
                                    this.editor.view.dispatch(this.editor.view.state.tr.setMeta(pagination_meta_key, true));
                                    // Update page break heights after decoration update
                                    requestAnimationFrame(() => {
                                        updatePageBreakHeights();
                                    });
                                    // If page count increased, ensure cursor is visible
                                    if (pageCount > oldPageCount) {
                                        // Mark that we need to scroll to cursor after decorations are applied
                                        this.storage.scrollToCursorAfterUpdate = true;
                                        // Also use TipTap's scrollIntoView after decorations are updated
                                        requestAnimationFrame(() => {
                                            requestAnimationFrame(() => {
                                                try {
                                                    this.editor.commands.scrollIntoView();
                                                }
                                                catch (e) {
                                                    // Ignore scroll errors
                                                }
                                            });
                                        });
                                    }
                                }
                            }
                            else {
                                // Clear allowUnstableUpdate flag even if page count didn't change
                                // This prevents ghost gaps after large deletes that don't change page count
                                if (this.storage.allowUnstableUpdate) {
                                    this.storage.allowUnstableUpdate = false;
                                }
                                // If we had scroll protection active but page count didn't change, clear it
                                if (this.storage.blockScrollIntoView && this.storage.offsetFromBottom !== undefined) {
                                    // Clean up scroll protection if no page change occurred
                                    delete this.storage.offsetFromBottom;
                                    delete this.storage.savedPageCountBeforeDeletion;
                                    requestAnimationFrame(() => {
                                        this.storage.blockScrollIntoView = false;
                                    });
                                }
                            }
                        }
                    }
                }
                // Set paginated height - use the stored correct page count, not the calculated one
                const finalPageCount = this.storage.correctPageCount || pageCount;
                const paginatedHeight = calculatePaginatedHeight(finalPageCount);
                // Apply calculated height
                targetNode.style.height = `${paginatedHeight}px`;
                // Restore scroll position for backspace deletions to prevent glitch
                if (this.storage.offsetFromBottom !== undefined) {
                    // Only restore if the page count actually changed
                    const pageCountChanged = this.storage.savedPageCountBeforeDeletion !== undefined &&
                        finalPageCount !== this.storage.savedPageCountBeforeDeletion;
                    if (pageCountChanged) {
                        // Page count decreased - restore the distance from bottom
                        const newScrollTop = targetNode.scrollHeight - targetNode.clientHeight - this.storage.offsetFromBottom;
                        // Ensure the scroll position is valid
                        const maxScrollTop = targetNode.scrollHeight - targetNode.clientHeight;
                        targetNode.scrollTop = Math.max(0, Math.min(newScrollTop, maxScrollTop));
                    }
                    // Clean up
                    delete this.storage.offsetFromBottom;
                    delete this.storage.savedPageCountBeforeDeletion;
                }
                // Restore cursor position in viewport for typing scenarios
                if (this.storage.cursorViewportOffset !== undefined) {
                    requestAnimationFrame(() => {
                        try {
                            // Get current cursor position
                            const coords = this.editor.view.coordsAtPos(this.editor.state.selection.from);
                            const editorRect = targetNode.getBoundingClientRect();
                            const currentCursorOffset = coords.top - editorRect.top;
                            // Calculate how much we need to scroll to restore the cursor position
                            const scrollAdjustment = currentCursorOffset - this.storage.cursorViewportOffset;
                            // Apply the scroll adjustment
                            const newScrollTop = targetNode.scrollTop + scrollAdjustment;
                            const maxScrollTop = targetNode.scrollHeight - targetNode.clientHeight;
                            targetNode.scrollTop = Math.max(0, Math.min(newScrollTop, maxScrollTop));
                            // Clean up
                            delete this.storage.cursorViewportOffset;
                            // Clear block after restoration
                            requestAnimationFrame(() => {
                                this.storage.blockScrollIntoView = false;
                            });
                        }
                        catch (e) {
                            // If we can't restore position, fall back to ensuring cursor is visible
                            if (!this.storage.blockScrollIntoView) {
                                this.editor.commands.scrollIntoView();
                            }
                            delete this.storage.cursorViewportOffset;
                        }
                    });
                }
                // Check for content overflow after setting height and trigger auto-fix
                requestAnimationFrame(() => {
                    // Check if cancelled
                    if (currentToken !== this.storage.measureToken &&
                        !isInitialMeasurement)
                        return;
                    const actualScrollHeight = targetNode.scrollHeight;
                    const containerHeight = paginatedHeight;
                    const overflow = actualScrollHeight - containerHeight;
                    if (overflow > 0 && !this.storage.isInitialMeasurement) {
                        // Content overflow detected
                        // Auto-fix: Add enough pages to contain all content
                        const additionalPages = Math.ceil(overflow / contentPerPage);
                        const newPageCount = finalPageCount + additionalPages;
                        const newHeight = calculatePaginatedHeight(newPageCount);
                        // Apply corrected height and update storage
                        targetNode.style.height = `${newHeight}px`;
                        this.storage.correctPageCount = Math.max(1, newPageCount);
                        // Trigger decoration update for new page count
                        this.editor.view.dispatch(this.editor.view.state.tr.setMeta(pagination_meta_key, true));
                        // Update page break heights after auto-fix
                        requestAnimationFrame(() => {
                            updatePageBreakHeights();
                        });
                        // Check once more after the fix to ensure it worked
                        requestAnimationFrame(() => {
                            // Check if cancelled
                            if (currentToken !== this.storage.measureToken &&
                                !isInitialMeasurement)
                                return;
                            const finalScrollHeight = targetNode.scrollHeight;
                            const finalContainerHeight = parseInt(targetNode.style.height);
                            const finalOverflow = finalScrollHeight - finalContainerHeight;
                            if (finalOverflow > 0) {
                                // Still have overflow after fix
                                // If still overflowing, add one more page as safety margin
                                const safetyPageCount = newPageCount + 1;
                                const safetyHeight = calculatePaginatedHeight(safetyPageCount);
                                targetNode.style.height = `${safetyHeight}px`;
                                this.storage.correctPageCount = Math.max(1, safetyPageCount);
                                // Final decoration update
                                this.editor.view.dispatch(this.editor.view.state.tr.setMeta(pagination_meta_key, true));
                                // Update page break heights after final fix
                                requestAnimationFrame(() => {
                                    updatePageBreakHeights();
                                });
                            }
                        });
                    }
                });
                // Final cancellation check before restoration
                if (currentToken !== this.storage.measureToken && !isInitialMeasurement)
                    return;
                // Use positions captured at the beginning of measurement
                // Restore cursor and scroll position
                yield new Promise(resolve => requestAnimationFrame(() => resolve()));
                // Check cancellation after async operation
                if (currentToken !== this.storage.measureToken &&
                    !isInitialMeasurement) {
                    return;
                }
                // Restore cursor position first (but not for large paste operations or during active typing)
                const timeSinceTyping = Date.now() - this.storage.lastTypingTime;
                const isActivelyTyping = timeSinceTyping < this.storage.typingThreshold;
                if (savedCursorPos >= 0 && !this.storage.scrollToCursorAfterUpdate && !isActivelyTyping) {
                    try {
                        const clampedPos = Math.min(savedCursorPos, this.editor.state.doc.content.size);
                        const selection = TextSelection.create(this.editor.state.doc, clampedPos);
                        const tr = this.editor.state.tr.setSelection(selection);
                        this.editor.view.dispatch(tr);
                    }
                    catch (e) {
                        // Ignore cursor restoration errors
                    }
                }
                // Handle scroll restoration or scroll to cursor
                if (this.storage.scrollToCursorAfterUpdate) {
                    // For large paste or new page creation, use TipTap's scrollIntoView
                    requestAnimationFrame(() => {
                        try {
                            if (!this.storage.blockScrollIntoView) {
                                this.editor.commands.scrollIntoView();
                            }
                        }
                        catch (e) {
                            // Fallback to restoring saved scroll position
                            targetNode.scrollTop = savedScrollTop;
                            targetNode.scrollLeft = savedScrollLeft;
                        }
                    });
                    // Clear the flag
                    this.storage.scrollToCursorAfterUpdate = false;
                }
                else {
                    // Check if we were typing recently
                    const timeSinceTyping = Date.now() - this.storage.lastTypingTime;
                    const wasRecentlyTyping = timeSinceTyping < 2000; // 2 seconds
                    if (wasRecentlyTyping && !this.storage.cursorViewportOffset) {
                        // Only use scrollIntoView if we're not manually managing cursor position
                        requestAnimationFrame(() => {
                            try {
                                if (!this.storage.blockScrollIntoView) {
                                    this.editor.commands.scrollIntoView();
                                }
                            }
                            catch (e) {
                                // Ignore scroll errors
                            }
                        });
                    }
                    else {
                        // Only restore scroll position if it hasn't changed significantly since we saved it
                        // This prevents jarring scroll jumps during active typing/scrolling
                        const currentScrollTop = targetNode.scrollTop;
                        const scrollDifference = Math.abs(currentScrollTop - savedScrollTop);
                        const isScrollStable = scrollDifference < 50; // Allow 50px tolerance
                        // Also check if we're at the bottom of the document (common case for last page typing)
                        const maxScroll = targetNode.scrollHeight - targetNode.clientHeight;
                        const isAtBottom = currentScrollTop >= maxScroll - 10; // 10px tolerance for "at bottom"
                        // Don't restore scroll during active editing to prevent glitches
                        const isActivelyEditing = wasRecentlyTyping;
                        // Only restore scroll if the position is stable, we're not at the bottom, and not actively editing
                        if (isScrollStable && !isAtBottom && !isActivelyEditing) {
                            targetNode.scrollTop = savedScrollTop;
                            targetNode.scrollLeft = savedScrollLeft;
                        }
                        // If scroll has changed significantly, at bottom, or actively editing, leave it alone
                    }
                }
                // Reset flags
                this.storage.positionSaved = false;
                // Only reset blockScrollIntoView if we're not in the middle of handling a deletion
                if (this.storage.offsetFromBottom === undefined) {
                    this.storage.blockScrollIntoView = false;
                }
                if (callback) {
                    callback();
                }
                // Clear initial measurement flag after first successful measurement
                if (isInitialMeasurement) {
                    this.storage.isInitialMeasurement = false;
                    this.storage.initialSetupCompleteTime = Date.now();
                    // Mark extension as initialized after any successful initial measurement
                    if (!this.storage.isInitialized) {
                        this.storage.isInitialized = true;
                    }
                }
            }
            catch (error) {
                // Fallback: continue with the rest of the function anyway
            }
        });
        // Debounced remeasure function for content changes with cancellation
        const remeasureContent = (delay = 100) => {
            // Continue with remeasurement even if destroyed flag is set
            // This handles the case where React/TipTap destroys extensions during active operations
            if (this.storage.remeasureTimer) {
                clearTimeout(this.storage.remeasureTimer);
            }
            this.storage.remeasureTimer = setTimeout(() => {
                // Reset position saved flag so fresh position is captured
                this.storage.positionSaved = false;
                // Cancel any pending measurement and start new one
                this.storage.currentMeasurePromise = measureAndUpdatePages();
            }, delay);
        };
        // Store remeasure function for use in plugins
        this.storage.remeasureContent = remeasureContent;
        // Store updatePageBreakHeights function for use in plugins
        this.storage.updatePageBreakHeights = updatePageBreakHeights;
        // Add event listener for forced refresh
        const paginationRefreshHandler = (e) => {
            var _a;
            const customEvent = e;
            if ((_a = customEvent.detail) === null || _a === void 0 ? void 0 : _a.force) {
                remeasureContent(0);
            }
        };
        targetNode.addEventListener("pagination-refresh", paginationRefreshHandler);
        // Track cleanup
        this.storage.cleanups.push(() => {
            targetNode.removeEventListener("pagination-refresh", paginationRefreshHandler);
        });
        // Initial setup
        this.editor.view.dispatch(this.editor.view.state.tr.setMeta(pagination_meta_key, true));
        // Use ResizeObserver for efficient content change detection
        let rafId = null;
        const resizeObserver = new ResizeObserver(() => {
            const timeSinceSetup = this.storage.initialSetupCompleteTime
                ? Date.now() - this.storage.initialSetupCompleteTime
                : 0;
            const inGracePeriod = timeSinceSetup < LAYOUT_CONSTANTS.GRACE_PERIOD_MS; // 500ms grace period
            // Only respond to resize events after initial setup is complete
            // and we're outside the grace period
            if (this.storage.isInitialized &&
                !this.storage.isInitialMeasurement &&
                !inGracePeriod) {
                // Throttle with requestAnimationFrame for better performance
                if (rafId) {
                    cancelAnimationFrame(rafId);
                }
                rafId = requestAnimationFrame(() => {
                    // Handle normal content changes after initialization
                    remeasureContent(80);
                });
            }
        });
        resizeObserver.observe(targetNode);
        // Track cleanup
        this.storage.cleanups.push(() => {
            if (rafId) {
                cancelAnimationFrame(rafId);
            }
            resizeObserver.disconnect();
        });
        // Initial measurement after fonts load
        requestAnimationFrame(() => {
            if ("fonts" in document && document.fonts.status !== "loaded") {
                document.fonts.ready.then(() => __awaiter(this, void 0, void 0, function* () {
                    // Fonts loaded, performing initial measurement
                    yield measureAndUpdatePages(() => {
                        // For initial measurement, always complete initialization even if destroyed flag is set
                        // This handles the case where TipTap destroys/recreates extensions during setup
                        this.storage.isInitialized = true;
                        if (this.options.onReady) {
                            this.options.onReady();
                        }
                    });
                }));
            }
            else {
                // Fonts already loaded
                measureAndUpdatePages().then(() => {
                    // For initial measurement, always complete initialization even if destroyed flag is set
                    // This handles the case where TipTap destroys/recreates extensions during setup
                    this.storage.isInitialized = true;
                    if (this.options.onReady) {
                        this.options.onReady();
                    }
                });
            }
        });
    },
    onDestroy() {
        var _a, _b, _c, _d;
        // Set destroyed flag first to prevent any new async operations
        if (this.storage) {
            this.storage.destroyed = true;
        }
        // Cleanup all tracked resources
        if ((_a = this.storage) === null || _a === void 0 ? void 0 : _a.cleanups) {
            this.storage.cleanups.forEach((cleanup) => {
                try {
                    cleanup();
                }
                catch (e) {
                    // Ignore cleanup errors
                }
            });
            this.storage.cleanups = [];
        }
        // Cleanup timer
        if ((_b = this.storage) === null || _b === void 0 ? void 0 : _b.remeasureTimer) {
            clearTimeout(this.storage.remeasureTimer);
            this.storage.remeasureTimer = null;
        }
        // Cleanup styles
        const style = document.querySelector("[data-rm-pagination-style]");
        if (style && style.parentNode) {
            style.parentNode.removeChild(style);
        }
        // Remove class from editor
        const targetNode = (_d = (_c = this.editor) === null || _c === void 0 ? void 0 : _c.view) === null || _d === void 0 ? void 0 : _d.dom;
        if (targetNode) {
            targetNode.classList.remove("rm-with-pagination");
        }
    },
    addProseMirrorPlugins() {
        const pageOptions = this.options;
        const extensionStorage = this.storage;
        let lastDocSize = 0;
        const pluginInstanceId = `${Date.now()}-${Math.random()}`;
        // Store the plugin instance ID in extension storage for cleanup tracking
        this.storage.pluginInstanceId = pluginInstanceId;
        return [
            new Plugin({
                key: new PluginKey(`pagination-${pluginInstanceId}`),
                state: {
                    init(_, state) {
                        lastDocSize = state.doc.content.size;
                        const widgetList = createDecoration(state, pageOptions, extensionStorage);
                        return DecorationSet.create(state.doc, widgetList);
                    },
                    apply(tr, oldDeco, _oldState, newState) {
                        const sizeDiff = newState.doc.content.size - lastDocSize;
                        const sizeChanged = Math.abs(sizeDiff) > 0;
                        const isLargePaste = sizeDiff > 1000;
                        // Check if this is an undo/redo operation
                        const isUndoRedo = tr.getMeta("history$") ||
                            tr.getMeta("appendedTransaction") ||
                            (tr.getMeta("addToHistory") === false && tr.docChanged);
                        if (tr.docChanged || isUndoRedo) {
                            // Track typing activity - small changes (1-2 chars) indicate active typing or deletion
                            const isTypingOrDeleting = Math.abs(sizeDiff) <= 2 && !isUndoRedo;
                            if (isTypingOrDeleting) {
                                extensionStorage.lastTypingTime = Date.now();
                                const node = extensionStorage.editor.view.dom;
                                // For typing (positive sizeDiff), save cursor position in viewport
                                if (sizeDiff > 0) {
                                    // Check if this is likely an Enter key press (creates new paragraph)
                                    // When Enter is pressed, it typically adds a paragraph node
                                    const isLikelyEnterKey = tr.steps.some(step => {
                                        if (step.toJSON && step.toJSON().stepType === 'replace') {
                                            return true;
                                        }
                                        return false;
                                    });
                                    // Check if cursor is at the end of the document
                                    const cursorAtEnd = tr.selection.from >= tr.doc.content.size - 1;
                                    // Don't preserve scroll for Enter key at end of document
                                    if (!isLikelyEnterKey || !cursorAtEnd) {
                                        // Get cursor position in viewport
                                        const coords = extensionStorage.editor.view.coordsAtPos(tr.selection.from);
                                        const editorRect = node.getBoundingClientRect();
                                        const cursorOffsetInViewport = coords.top - editorRect.top;
                                        // Save this offset for restoration after repagination
                                        extensionStorage.cursorViewportOffset = cursorOffsetInViewport;
                                        extensionStorage.blockScrollIntoView = true;
                                    }
                                }
                                // For deletions that might cause page shrinkage, save scroll position
                                else if (sizeDiff < 0) {
                                    // Only save if we haven't already saved for this deletion cycle
                                    if (extensionStorage.offsetFromBottom === undefined) {
                                        const offset = node.scrollHeight - node.clientHeight - node.scrollTop;
                                        extensionStorage.offsetFromBottom = offset;
                                        extensionStorage.blockScrollIntoView = true;
                                        // Also save the current page count to detect if it actually changes
                                        extensionStorage.savedPageCountBeforeDeletion = extensionStorage.correctPageCount;
                                    }
                                }
                                // Don't use scrollIntoView for typing - we'll handle it manually
                                if (!extensionStorage.blockScrollIntoView) {
                                    requestAnimationFrame(() => {
                                        requestAnimationFrame(() => {
                                            try {
                                                const editor = extensionStorage.editor;
                                                if (!editor) {
                                                    return;
                                                }
                                                editor.commands.scrollIntoView();
                                            }
                                            catch (e) {
                                                // Ignore scroll errors
                                            }
                                        });
                                    });
                                }
                            }
                            // Document changed or undo/redo operation
                            // Update lastDocSize for accurate future calculations
                            lastDocSize = newState.doc.content.size;
                            if (extensionStorage.isInitialized) {
                                // For any significant content change or undo/redo, reset height lock to allow page count adjustments
                                const shouldResetLock = Math.abs(sizeDiff) > 50 || isUndoRedo || sizeDiff < 0;
                                if (shouldResetLock) {
                                    extensionStorage.lockedHeightRange = { min: 0, max: 0 };
                                }
                                // Flag content deletion to bypass height stability requirement
                                if (sizeDiff < 0 || isUndoRedo) {
                                    extensionStorage.allowUnstableUpdate = true;
                                }
                                // Handle large paste with faster remeasurement
                                if (isLargePaste) {
                                    // Set flag to scroll to cursor after pagination
                                    extensionStorage.scrollToCursorAfterUpdate = true;
                                    // Handle normal content changes after initialization
                                    extensionStorage.remeasureContent(50); // Keep 50ms for large paste responsiveness
                                    // Additional remeasure for very large pastes
                                    if (sizeDiff > 10000) {
                                        // Handle normal content changes after initialization
                                        extensionStorage.remeasureContent(300);
                                    }
                                }
                                else if (sizeChanged || isUndoRedo) {
                                    // Handle all other content changes (including deletions and undo/redo)
                                    const delay = sizeDiff < 0 ? 100 : 300; // Faster for deletions
                                    // Handle normal content changes after initialization
                                    extensionStorage.remeasureContent(delay);
                                    // Check if page breaks exist and schedule height update
                                    requestAnimationFrame(() => {
                                        const hasPageBreaks = newState.doc.content.content.some((node) => node.type.name === 'pageBreak');
                                        if (hasPageBreaks) {
                                            extensionStorage.updatePageBreakHeights();
                                        }
                                    });
                                }
                            }
                        }
                        // Only update decorations for explicit pagination updates (not normal typing)
                        if (tr.getMeta(pagination_meta_key)) {
                            // Clear allowUnstableUpdate flag on any decoration refresh to prevent ghost gaps
                            if (extensionStorage.allowUnstableUpdate) {
                                extensionStorage.allowUnstableUpdate = false;
                            }
                            const widgetList = createDecoration(newState, pageOptions, extensionStorage);
                            return DecorationSet.create(newState.doc, [...widgetList]);
                        }
                        // Map existing decorations
                        return oldDeco.map(tr.mapping, tr.doc);
                    },
                },
                props: {
                    decorations(state) {
                        return this.getState(state);
                    },
                },
            }),
        ];
    },
});
function createDecoration(state, pageOptions, extensionStorage) {
    const pageWidget = Decoration.widget(0, (view) => {
        const _pageGap = pageOptions.pageGap;
        const _pageHeaderHeight = pageOptions.pageHeaderHeight;
        const _pageHeight = pageOptions.pageHeight - _pageHeaderHeight * 2;
        const _pageBreakBackground = pageOptions.pageBreakBackground;
        // Use stored page count, but ensure at least 1 page for empty documents
        const pages = Math.max(1, (extensionStorage === null || extensionStorage === void 0 ? void 0 : extensionStorage.correctPageCount) || 1);
        const finalPageCount = Math.min(pages, pageOptions.maxPages || 1000);
        const breakerWidth = view.dom.clientWidth;
        // Check if we can reuse existing pagination element
        const existingPagination = view.dom.querySelector("#pages");
        if (existingPagination &&
            existingPagination.dataset.rmPagination === "true") {
            // INCREMENTAL UPDATE: Update existing pages instead of recreating
            const currentPageCount = existingPagination.children.length;
            if (finalPageCount > currentPageCount) {
                // Add missing pages
                const fragment = document.createDocumentFragment();
                for (let i = currentPageCount; i < finalPageCount; i++) {
                    fragment.appendChild(createPageBreak(i === 0, false, _pageHeight, _pageHeaderHeight, _pageGap, _pageBreakBackground, breakerWidth, pageOptions.headerText));
                }
                existingPagination.appendChild(fragment);
            }
            else if (finalPageCount < currentPageCount) {
                // Remove excess pages, but ensure at least 1 page remains
                while (existingPagination.children.length > Math.max(1, finalPageCount)) {
                    existingPagination.lastChild.remove();
                }
            }
            // Update last-page class
            existingPagination.querySelectorAll(".last-page").forEach((el) => {
                el.classList.remove("last-page");
            });
            if (finalPageCount > 0) {
                existingPagination.children[finalPageCount - 1].classList.add("last-page");
            }
            // Update breaker widths on all existing page breaks
            const breakers = existingPagination.querySelectorAll(".breaker");
            breakers.forEach((breaker) => {
                const breakerEl = breaker;
                breakerEl.style.width = `calc(${breakerWidth}px)`;
                breakerEl.style.marginLeft = `calc(calc(calc(${breakerWidth}px - 100%) / 2) - calc(${breakerWidth}px - 100%))`;
                breakerEl.style.marginRight = `calc(calc(calc(${breakerWidth}px - 100%) / 2) - calc(${breakerWidth}px - 100%))`;
            });
            return existingPagination;
        }
        // INITIAL CREATION: Create new pagination element
        const el = document.createElement("div");
        el.dataset.rmPagination = "true";
        el.id = "pages";
        // Create fragment for batch DOM operation
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < finalPageCount; i++) {
            fragment.appendChild(createPageBreak(i === 0, i === finalPageCount - 1, _pageHeight, _pageHeaderHeight, _pageGap, _pageBreakBackground, breakerWidth, pageOptions.headerText));
        }
        el.appendChild(fragment);
        return el;
    }, { side: 1 });
    // Helper function moved outside for reusability
    function createPageBreak(isFirst, isLast, _pageHeight, _pageHeaderHeight, _pageGap, _pageBreakBackground, breakerWidth, headerText) {
        const pageContainer = document.createElement("div");
        pageContainer.className = "rm-page-break" + (isLast ? " last-page" : "");
        const page = document.createElement("div");
        page.className = "page";
        page.style.cssText = `
      position: relative;
      float: left;
      clear: both;
      margin-top: ${isFirst
            ? `calc(${_pageHeaderHeight}px + ${_pageHeight}px)`
            : _pageHeight + "px"};
    `;
        const pageBreak = document.createElement("div");
        pageBreak.className = "breaker";
        pageBreak.style.cssText = `
      width: calc(${breakerWidth}px);
      margin-left: calc(calc(calc(${breakerWidth}px - 100%) / 2) - calc(${breakerWidth}px - 100%));
      margin-right: calc(calc(calc(${breakerWidth}px - 100%) / 2) - calc(${breakerWidth}px - 100%));
      position: relative;
      float: left;
      clear: both;
      left: 0px;
      right: 0px;
      z-index: 2;
    `;
        const pageFooterWrapper = document.createElement("div");
        pageFooterWrapper.style.cssText = `
      padding: 10px 0;
      height: ${_pageHeaderHeight + 20}px;
      box-sizing: border-box;
    `;
        const pageFooter = document.createElement("div");
        pageFooter.className = "rm-page-footer";
        pageFooter.style.height = _pageHeaderHeight + "px";
        pageFooterWrapper.appendChild(pageFooter);
        const pageSpace = document.createElement("div");
        pageSpace.className = "rm-pagination-gap";
        pageSpace.style.cssText = `
      height: ${_pageGap}px;
      border-left: 1px solid ${_pageBreakBackground};
      border-right: 1px solid ${_pageBreakBackground};
      position: relative;
      width: calc(100% + 2px) !important;
      left: -1px;
      background-color: ${_pageBreakBackground};
    `;
        const pageHeader = document.createElement("div");
        pageHeader.className = "rm-page-header";
        pageHeader.style.height = _pageHeaderHeight + "px";
        pageHeader.textContent = headerText;
        pageBreak.append(pageFooterWrapper, pageSpace, pageHeader);
        pageContainer.append(page, pageBreak);
        return pageContainer;
    }
    const firstHeaderWidget = Decoration.widget(0, () => {
        const el = document.createElement("div");
        el.className = "rm-page-header";
        el.style.cssText = `
        height: ${pageOptions.pageHeaderHeight}px;
        margin-top: 0px;
      `;
        el.textContent = pageOptions.headerText;
        return el;
    }, { side: 1 });
    const lastFooterWidget = Decoration.widget(state.doc.content.size, () => {
        const el = document.createElement("div");
        el.style.height = `${pageOptions.pageHeaderHeight}px`;
        return el;
    }, { side: 1 });
    return [pageWidget, firstHeaderWidget, lastFooterWidget];
}
