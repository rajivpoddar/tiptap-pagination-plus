import { Extension } from "@tiptap/core";
import {
  EditorState,
  Plugin,
  PluginKey,
  TextSelection,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

interface PaginationPlusOptions {
  pageHeight: number;
  pageGap: number;
  pageBreakBackground: string;
  pageHeaderHeight: number;
  pageGapBorderSize: number;
  footerText: string;
  headerText: string;
  maxPages?: number;
  onReady?: () => void;
}

const pagination_meta_key = "PAGINATION_META_KEY";

export const PaginationPlus = Extension.create<PaginationPlusOptions>({
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
    };
  },

  addStorage() {
    return {
      correctPageCount: 1,
      remeasureTimer: null,
      isInitialized: false,
      calculatePaginatedHeight: null as ((pageCount: number) => number) | null,
      calculatePageCount: null as ((naturalHeight: number) => number) | null,
      // Position preservation
      savedCursorPos: -1,
      savedScrollTop: 0,
      savedScrollLeft: 0,
      positionSaved: false,
      // Track last measured height to avoid unnecessary updates
      lastMeasuredHeight: 0,
      // Track stable height measurements
      stableHeightMeasurements: [] as number[],
      stableHeightThreshold: 3,
      // Measurement cancellation token
      measureToken: 0,
      currentMeasurePromise: null as Promise<void> | null,
      // Cleanup tracking
      cleanups: [] as Array<() => void>,
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
      remeasureContent: (() => {}) as (delay?: number) => void,
      // Store plugin instance ID for cleanup
      pluginInstanceId: null as string | null,
      // Store editor reference for plugin access
      editor: null as any,
    };
  },

  onCreate() {
    const targetNode = this.editor.view.dom as HTMLElement;
    targetNode.classList.add("rm-with-pagination");

    // Store editor reference for plugin access
    this.storage.editor = this.editor;

    // Options are available as this.options

    // Named constants for layout calculations
    const LAYOUT_CONSTANTS = {
      CONTENT_EDITABLE_PADDING: 48, // Content area padding
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
    } as const;

    const _pageHeaderHeight = this.options.pageHeaderHeight;
    const _pageHeight = this.options.pageHeight - _pageHeaderHeight * 2;

    // Inject styles
    const style = document.createElement("style");
    style.dataset.rmPaginationStyle = "";
    style.textContent = `
      .rm-with-pagination {
        counter-reset: page-number;
        overflow: hidden;
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
    `;
    document.head.appendChild(style);

    // Calculate paginated height based on page count
    const calculatePaginatedHeight = (pageCount: number): number => {
      const { CONTENT_EDITABLE_PADDING, FOOTER_WRAPPER_EXTRA_HEIGHT, HEADER_MARGIN_CONTRIBUTION } = LAYOUT_CONSTANTS;

      if (pageCount === 1) {
        // For single page, just add padding to page height + footer wrapper extra height
        const singlePageHeight =
          CONTENT_EDITABLE_PADDING + this.options.pageHeight + FOOTER_WRAPPER_EXTRA_HEIGHT;
        return singlePageHeight;
      }

      const visibleGaps = pageCount - 1;

      // Height calculation breakdown (matches cumulative analysis):
      // - Content padding: 48px (fixed)
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
    const calculatePageCount = (naturalHeight: number): number => {
      const contentEditablePadding = 48;
      const contentPerPage =
        this.options.pageHeight - this.options.pageHeaderHeight * 2;
      const initialHeight =
        contentEditablePadding + this.options.pageHeaderHeight * 2;
      const adjustedHeight = Math.max(0, naturalHeight - initialHeight);

      // Check if we have actual content beyond the initial structure
      const contentElement = this.editor.view.dom.querySelector(
        ".ProseMirror-content"
      );
      const hasActualContent = contentElement?.textContent
        ? contentElement.textContent.trim().length > 0
        : false;

      // Calculate page count based on adjusted height, but also consider text content
      // If we have significant height (more than 1.5 pages worth), trust the height calculation
      const significantHeight = adjustedHeight > contentPerPage * 1.5;

      return hasActualContent || significantHeight
        ? Math.max(1, Math.ceil(adjustedHeight / contentPerPage))
        : 1;
    };

    // Helper functions for detecting when content is ready
    const waitForImages = (container: HTMLElement): Promise<void> => {
      const images = container.querySelectorAll("img");
      if (images.length === 0) {
        return Promise.resolve();
      }

      const imagePromises = Array.from(images).map((img) => {
        if (img.complete) {
          return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
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

      return Promise.all(imagePromises).then(() => {});
    };

    const waitForLayoutStable = (container: HTMLElement): Promise<void> => {
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
          } else {
            stableCount = 0;
            lastHeight = currentHeight;
          }

          requestAnimationFrame(checkStability);
        };

        requestAnimationFrame(checkStability);
      });
    };

    const waitForContentVisible = (container: HTMLElement): Promise<void> => {
      return new Promise((resolve) => {
        // Use Intersection Observer to detect when content is visible
        const observer = new IntersectionObserver(
          (entries) => {
            const entry = entries[0];
            if (entry.isIntersecting && entry.intersectionRatio > 0) {
              observer.disconnect();
              resolve();
            }
          },
          { threshold: 0.01 }
        ); // Trigger when even 1% is visible

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
    const measureAndUpdatePages = async (callback?: () => void) => {
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
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

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
        await Promise.all([
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
            } else {
              setTimeout(resolve, LAYOUT_CONSTANTS.ONE_FRAME_MS); // Fallback for older browsers
            }
          }),
        ]);

        // Check cancellation after async operations
        if (
          currentToken !== this.storage.measureToken &&
          !isInitialMeasurement
        ) {
          return;
        }

        // BATCH READ PHASE: Collect all measurements first
        const measurements = {
          // Force a single layout reflow for all reads
          offsetHeight: targetNode.offsetHeight,
          paginationElements: [] as Array<{
            element: HTMLElement;
            display: string;
          }>,
          childMeasurements: [] as Array<{
            height: number;
            marginTop: number;
            marginBottom: number;
          }>,
          containerPadding: { top: 0, bottom: 0 },
        };

        // Collect pagination elements info - include ALL pagination-related elements
        const paginationSelectors =
          "[data-rm-pagination], .rm-page-header, .rm-page-footer, .rm-page-break";
        const paginationElements =
          targetNode.querySelectorAll(paginationSelectors);
        paginationElements.forEach((el) => {
          const element = el as HTMLElement;
          measurements.paginationElements.push({
            element,
            display: element.style.display,
          });
        });

        // Collect all child measurements in one go
        const children = targetNode.children;
        const childDetails: Array<{
          tagName: string;
          className: string;
          height: number;
          marginTop: number;
          marginBottom: number;
          totalHeight: number;
        }> = [];
        let skippedCount = 0;

        // First, ensure all pagination elements are truly hidden and measure their original state
        const paginationHiddenStates = new Map<HTMLElement, string>();
        const allPaginationElements = targetNode.querySelectorAll(
          ".rm-page-break, .rm-page-header, .rm-page-footer, [data-rm-pagination], #pages"
        );
        allPaginationElements.forEach((el) => {
          const element = el as HTMLElement;
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
          const child = children[i] as HTMLElement;
          // Skip pagination elements and headers/footers
          const isPagination =
            child.dataset.rmPagination ||
            child.classList.contains("rm-page-header") ||
            child.classList.contains("rm-page-footer") ||
            child.classList.contains("rm-page-break") ||
            child.id?.includes("pages") ||
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
          this.storage.lastTotalChildHeight = childDetails.reduce(
            (sum, child) => sum + child.totalHeight,
            0
          );
        }

        // Get container padding
        const containerStyles = window.getComputedStyle(targetNode);
        measurements.containerPadding.top =
          parseFloat(containerStyles.paddingTop) || 0;
        measurements.containerPadding.bottom =
          parseFloat(containerStyles.paddingBottom) || 0;

        // Calculate content height from collected measurements
        let contentHeight = 0;
        measurements.childMeasurements.forEach(
          ({ height, marginTop, marginBottom }) => {
            contentHeight += height + marginTop + marginBottom;
          }
        );

        const naturalHeight =
          contentHeight +
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
        const contentPerPage =
          this.options.pageHeight - this.options.pageHeaderHeight * 2;
        const contentEditablePadding = 48; // Fixed padding for content editable

        // For initial state, we need to account for the fact that the natural height
        // includes the initial header, footer, and padding
        const initialHeight =
          contentEditablePadding + this.options.pageHeaderHeight * 2; // Header + Footer
        const adjustedHeight = Math.max(0, naturalHeight - initialHeight);

        // Check if we have actual content beyond the initial structure
        const contentElement = targetNode.querySelector(".ProseMirror-content");
        const hasActualContent = contentElement?.textContent
          ? contentElement.textContent.trim().length > 0
          : false;

        // Calculate page count based on adjusted height, but also consider text content
        // If we have significant height (more than 1.5 pages worth), trust the height calculation
        const significantHeight = adjustedHeight > contentPerPage * 1.5;
        let initialPageCount =
          hasActualContent || significantHeight
            ? Math.max(1, Math.ceil(adjustedHeight / contentPerPage))
            : 1;

        // Apply maxPages limit
        initialPageCount = Math.min(
          initialPageCount,
          this.options.maxPages || 1000
        );

        // Use initial calculation for now
        let pageCount = initialPageCount;
        

        // Track stable height measurements
        if (
          this.storage.stableHeightMeasurements.length >=
          this.storage.stableHeightThreshold
        ) {
          this.storage.stableHeightMeasurements.shift();
        }
        this.storage.stableHeightMeasurements.push(naturalHeight);

        // Check if height is stable (all recent measurements within 5px)
        const isHeightStable =
          this.storage.stableHeightMeasurements.length >=
            this.storage.stableHeightThreshold &&
          Math.max(...this.storage.stableHeightMeasurements) -
            Math.min(...this.storage.stableHeightMeasurements) <=
            5;

        // For initial measurement, always accept the first valid measurement
        // This prevents the issue where content changes size after decorations are added
        if (
          isInitialMeasurement &&
          this.storage.correctPageCount === 1 &&
          pageCount > 1
        ) {
          this.storage.correctPageCount = pageCount;
          this.storage.lastMeasuredHeight = naturalHeight;
          // Lock in an acceptable height range (±0.5 page tolerance)
          // Tighter tolerance to prevent unnecessary page count changes
          const tolerance = contentPerPage * 0.5; // Allow 0.5 page worth of variation
          this.storage.lockedHeightRange = {
            min: naturalHeight - tolerance,
            max: naturalHeight + tolerance,
          };

          // Trigger decoration update
          this.editor.view.dispatch(
            this.editor.view.state.tr.setMeta(pagination_meta_key, true)
          );
        } else if (!this.storage.isInitialMeasurement) {
          // Only update page count after initial setup is complete
          const timeSinceSetup = this.storage.initialSetupCompleteTime
            ? Date.now() - this.storage.initialSetupCompleteTime
            : Infinity;
          const inGracePeriod = timeSinceSetup < LAYOUT_CONSTANTS.GRACE_PERIOD_MS;

          if (!inGracePeriod) {
            // Check if height has actually changed to avoid unnecessary updates
            const heightChanged =
              Math.abs(naturalHeight - this.storage.lastMeasuredHeight) > 5; // 5px tolerance
            

            if (heightChanged) {
              this.storage.lastMeasuredHeight = naturalHeight;

              // Check if we're within the locked height range
              const withinLockedRange =
                naturalHeight >= this.storage.lockedHeightRange.min &&
                naturalHeight <= this.storage.lockedHeightRange.max;
              

              // Update page count if changed
              if (pageCount !== this.storage.correctPageCount) {
                // Update if height is stable AND outside locked range, OR if unstable update is allowed
                const shouldUpdate = (!withinLockedRange && isHeightStable) || this.storage.allowUnstableUpdate;
                
                
                if (shouldUpdate) {
                  const oldPageCount = this.storage.correctPageCount;
                  this.storage.correctPageCount = pageCount;


                  // Clear the unstable update flag after use
                  this.storage.allowUnstableUpdate = false;

                  // Update locked range for new page count
                  const tolerance = contentPerPage * 0.5;
                  this.storage.lockedHeightRange = {
                    min: naturalHeight - tolerance,
                    max: naturalHeight + tolerance,
                  };

                  // Trigger decoration update
                  this.editor.view.dispatch(
                    this.editor.view.state.tr.setMeta(pagination_meta_key, true)
                  );
                  
                  // If page count increased, ensure cursor is visible
                  if (pageCount > oldPageCount) {
                    // Mark that we need to scroll to cursor after decorations are applied
                    this.storage.scrollToCursorAfterUpdate = true;
                    
                    // Also use TipTap's scrollIntoView after decorations are updated
                    requestAnimationFrame(() => {
                      requestAnimationFrame(() => {
                        try {
                          this.editor.commands.scrollIntoView();
                        } catch (e) {
                          // Ignore scroll errors
                        }
                      });
                    });
                  }
                }
              } else {
                // Clear allowUnstableUpdate flag even if page count didn't change
                // This prevents ghost gaps after large deletes that don't change page count
                if (this.storage.allowUnstableUpdate) {
                  this.storage.allowUnstableUpdate = false;
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

        // Check for content overflow after setting height and trigger auto-fix
        requestAnimationFrame(() => {
          // Check if cancelled
          if (
            currentToken !== this.storage.measureToken &&
            !isInitialMeasurement
          )
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
            this.storage.correctPageCount = newPageCount;

            // Trigger decoration update for new page count
            this.editor.view.dispatch(
              this.editor.view.state.tr.setMeta(pagination_meta_key, true)
            );

            // Check once more after the fix to ensure it worked
            requestAnimationFrame(() => {
              // Check if cancelled
              if (
                currentToken !== this.storage.measureToken &&
                !isInitialMeasurement
              )
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
                this.storage.correctPageCount = safetyPageCount;

                // Final decoration update
                this.editor.view.dispatch(
                  this.editor.view.state.tr.setMeta(pagination_meta_key, true)
                );
              }
            });
          }
        });

        // Final cancellation check before restoration
        if (currentToken !== this.storage.measureToken && !isInitialMeasurement)
          return;

        // Use positions captured at the beginning of measurement

        // Restore cursor and scroll position
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

        // Check cancellation after async operation
        if (
          currentToken !== this.storage.measureToken &&
          !isInitialMeasurement
        ) {
          return;
        }

        // Restore cursor position first (but not for large paste operations or during active typing)
        const timeSinceTyping = Date.now() - this.storage.lastTypingTime;
        const isActivelyTyping = timeSinceTyping < this.storage.typingThreshold;
        
        if (savedCursorPos >= 0 && !this.storage.scrollToCursorAfterUpdate && !isActivelyTyping) {
          try {
            const clampedPos = Math.min(savedCursorPos, this.editor.state.doc.content.size);
            const selection = TextSelection.create(
              this.editor.state.doc,
              clampedPos
            );
            const tr = this.editor.state.tr.setSelection(selection);
            this.editor.view.dispatch(tr);
          } catch (e) {
            // Ignore cursor restoration errors
          }
        }

        // Handle scroll restoration or scroll to cursor
        if (this.storage.scrollToCursorAfterUpdate) {
          // For large paste or new page creation, use TipTap's scrollIntoView
          requestAnimationFrame(() => {
            try {
              this.editor.commands.scrollIntoView();
            } catch (e) {
              // Fallback to restoring saved scroll position
              targetNode.scrollTop = savedScrollTop;
              targetNode.scrollLeft = savedScrollLeft;
            }
          });
          // Clear the flag
          this.storage.scrollToCursorAfterUpdate = false;
        } else {
          // Check if we were typing recently
          const timeSinceTyping = Date.now() - this.storage.lastTypingTime;
          const wasRecentlyTyping = timeSinceTyping < 2000; // 2 seconds
          
          if (wasRecentlyTyping) {
            // If we were typing recently, ensure cursor stays visible
            requestAnimationFrame(() => {
              try {
                this.editor.commands.scrollIntoView();
              } catch (e) {
                // Ignore scroll errors
              }
            });
          } else {
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
      } catch (error) {
        // Fallback: continue with the rest of the function anyway
      }
    };

    // Debounced remeasure function for content changes with cancellation
    const remeasureContent = (delay: number = 100) => {
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

    // Add event listener for forced refresh
    const paginationRefreshHandler = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.force) {
        remeasureContent(0);
      }
    };
    targetNode.addEventListener("pagination-refresh", paginationRefreshHandler);

    // Track cleanup
    this.storage.cleanups.push(() => {
      targetNode.removeEventListener(
        "pagination-refresh",
        paginationRefreshHandler
      );
    });

    // Initial setup
    this.editor.view.dispatch(
      this.editor.view.state.tr.setMeta(pagination_meta_key, true)
    );

    // Use ResizeObserver for efficient content change detection
    let rafId: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      const timeSinceSetup = this.storage.initialSetupCompleteTime
        ? Date.now() - this.storage.initialSetupCompleteTime
        : 0;
      const inGracePeriod = timeSinceSetup < LAYOUT_CONSTANTS.GRACE_PERIOD_MS; // 500ms grace period

      // Only respond to resize events after initial setup is complete
      // and we're outside the grace period
      if (
        this.storage.isInitialized &&
        !this.storage.isInitialMeasurement &&
        !inGracePeriod
      ) {
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
        document.fonts.ready.then(async () => {
          // Fonts loaded, performing initial measurement
          await measureAndUpdatePages(() => {
            // For initial measurement, always complete initialization even if destroyed flag is set
            // This handles the case where TipTap destroys/recreates extensions during setup
            this.storage.isInitialized = true;
            if (this.options.onReady) {
              this.options.onReady();
            }
          });
        });
      } else {
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
    // Set destroyed flag first to prevent any new async operations
    if (this.storage) {
      this.storage.destroyed = true;
    }

    // Cleanup all tracked resources
    if (this.storage?.cleanups) {
      this.storage.cleanups.forEach((cleanup: () => void) => {
        try {
          cleanup();
        } catch (e) {
          // Ignore cleanup errors
        }
      });
      this.storage.cleanups = [];
    }

    // Cleanup timer
    if (this.storage?.remeasureTimer) {
      clearTimeout(this.storage.remeasureTimer);
      this.storage.remeasureTimer = null;
    }

    // Cleanup styles
    const style = document.querySelector("[data-rm-pagination-style]");
    if (style && style.parentNode) {
      style.parentNode.removeChild(style);
    }

    // Remove class from editor
    const targetNode = this.editor?.view?.dom as HTMLElement;
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
        key: new PluginKey<DecorationSet>(`pagination-${pluginInstanceId}`),

        state: {
          init(_, state) {
            lastDocSize = state.doc.content.size;
            const widgetList = createDecoration(
              state,
              pageOptions,
              extensionStorage
            );
            return DecorationSet.create(state.doc, widgetList);
          },
          apply(tr, oldDeco, _oldState, newState) {
            const sizeDiff = newState.doc.content.size - lastDocSize;
            const sizeChanged = Math.abs(sizeDiff) > 0;
            const isLargePaste = sizeDiff > 1000;
            
            // Check if this is an undo/redo operation
            const isUndoRedo =
              tr.getMeta("history$") || 
              tr.getMeta("appendedTransaction") ||
              (tr.getMeta("addToHistory") === false && tr.docChanged);
            
            if (tr.docChanged || isUndoRedo) {
              // Track typing activity - small changes (1-2 chars) indicate active typing or deletion
              const isTypingOrDeleting = Math.abs(sizeDiff) <= 2 && !isUndoRedo;
              if (isTypingOrDeleting) {
                extensionStorage.lastTypingTime = Date.now();
                
                // Simple fix: Use TipTap's scrollIntoView command for both typing and deletion
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    try {
                      const editor = extensionStorage.editor;
                      if (!editor) {
                        return;
                      }
                      
                      editor.commands.scrollIntoView();
                    } catch (e) {
                      // Ignore scroll errors
                    }
                  });
                });
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
                } else if (sizeChanged || isUndoRedo) {
                  // Handle all other content changes (including deletions and undo/redo)
                  const delay = sizeDiff < 0 ? 100 : 300; // Faster for deletions
                  // Handle normal content changes after initialization
                  extensionStorage.remeasureContent(delay);
                }
              }
            }

            // Only update decorations for explicit pagination updates (not normal typing)
            if (tr.getMeta(pagination_meta_key)) {
              // Clear allowUnstableUpdate flag on any decoration refresh to prevent ghost gaps
              if (extensionStorage.allowUnstableUpdate) {
                extensionStorage.allowUnstableUpdate = false;
              }
              
              const widgetList = createDecoration(
                newState,
                pageOptions,
                extensionStorage
              );
              return DecorationSet.create(newState.doc, [...widgetList]);
            }

            // Map existing decorations
            return oldDeco.map(tr.mapping, tr.doc);
          },
        },

        props: {
          decorations(state: EditorState) {
            return this.getState(state) as DecorationSet;
          },
        },
      }),
    ];
  },
});

function createDecoration(
  state: EditorState,
  pageOptions: PaginationPlusOptions,
  extensionStorage?: any
): Decoration[] {

  const pageWidget = Decoration.widget(
    0,
    (view) => {
      const _pageGap = pageOptions.pageGap;
      const _pageHeaderHeight = pageOptions.pageHeaderHeight;
      const _pageHeight = pageOptions.pageHeight - _pageHeaderHeight * 2;
      const _pageBreakBackground = pageOptions.pageBreakBackground;

      // Use stored page count
      const pages = extensionStorage?.correctPageCount || 1;
      const finalPageCount = Math.min(pages, pageOptions.maxPages || 1000);

      const breakerWidth = view.dom.clientWidth;

      // Check if we can reuse existing pagination element
      const existingPagination = view.dom.querySelector(
        "#pages"
      ) as HTMLElement;
      if (
        existingPagination &&
        existingPagination.dataset.rmPagination === "true"
      ) {
        // INCREMENTAL UPDATE: Update existing pages instead of recreating
        const currentPageCount = existingPagination.children.length;

        if (finalPageCount > currentPageCount) {
          // Add missing pages
          const fragment = document.createDocumentFragment();
          for (let i = currentPageCount; i < finalPageCount; i++) {
            fragment.appendChild(
              createPageBreak(
                i === 0,
                false,
                _pageHeight,
                _pageHeaderHeight,
                _pageGap,
                _pageBreakBackground,
                breakerWidth,
                pageOptions.headerText
              )
            );
          }
          existingPagination.appendChild(fragment);
        } else if (finalPageCount < currentPageCount) {
          // Remove excess pages
          while (existingPagination.children.length > finalPageCount) {
            existingPagination.lastChild!.remove();
          }
        }

        // Update last-page class
        existingPagination.querySelectorAll(".last-page").forEach((el) => {
          el.classList.remove("last-page");
        });
        if (finalPageCount > 0) {
          existingPagination.children[finalPageCount - 1].classList.add(
            "last-page"
          );
        }

        // Update breaker widths on all existing page breaks
        const breakers = existingPagination.querySelectorAll(".breaker");
        breakers.forEach((breaker: Element) => {
          const breakerEl = breaker as HTMLElement;
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
        fragment.appendChild(
          createPageBreak(
            i === 0,
            i === finalPageCount - 1,
            _pageHeight,
            _pageHeaderHeight,
            _pageGap,
            _pageBreakBackground,
            breakerWidth,
            pageOptions.headerText
          )
        );
      }

      el.appendChild(fragment);
      return el;
    },
    { side: 1 }
  );

  // Helper function moved outside for reusability
  function createPageBreak(
    isFirst: boolean,
    isLast: boolean,
    _pageHeight: number,
    _pageHeaderHeight: number,
    _pageGap: number,
    _pageBreakBackground: string,
    breakerWidth: number,
    headerText: string
  ) {
    const pageContainer = document.createElement("div");
    pageContainer.className = "rm-page-break" + (isLast ? " last-page" : "");

    const page = document.createElement("div");
    page.className = "page";
    page.style.cssText = `
      position: relative;
      float: left;
      clear: both;
      margin-top: ${
        isFirst
          ? `calc(${_pageHeaderHeight}px + ${_pageHeight}px)`
          : _pageHeight + "px"
      };
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

  const firstHeaderWidget = Decoration.widget(
    0,
    () => {
      const el = document.createElement("div");
      el.className = "rm-page-header";
      el.style.cssText = `
        height: ${pageOptions.pageHeaderHeight}px;
        margin-top: 0px;
      `;
      el.textContent = pageOptions.headerText;
      return el;
    },
    { side: 1 }
  );

  const lastFooterWidget = Decoration.widget(
    state.doc.content.size,
    () => {
      const el = document.createElement("div");
      el.style.height = `${pageOptions.pageHeaderHeight}px`;
      return el;
    },
    { side: 1 }
  );

  return [pageWidget, firstHeaderWidget, lastFooterWidget];
}
