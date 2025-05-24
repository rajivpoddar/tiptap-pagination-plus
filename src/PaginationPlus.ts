// OptimizedPagination.ts
import { Extension } from "@tiptap/core";
import { EditorState, Plugin, PluginKey } from "@tiptap/pm/state";
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

  addStorage() {
    return {
      correctPageCount: 1,
      remeasureTimer: null,
      isInitialized: false,
      calculatePaginatedHeight: null as ((pageCount: number) => number) | null,
      calculatePageCount: null as ((naturalHeight: number) => number) | null,
    };
  },
  
  onCreate() {
    const targetNode = this.editor.view.dom as HTMLElement;
    targetNode.classList.add("rm-with-pagination");

    // Options are available as this.options

    const _pageHeaderHeight = this.options.pageHeaderHeight;
    const _pageHeight = this.options.pageHeight - (_pageHeaderHeight * 2);

    // Inject styles
    const style = document.createElement('style');
    style.dataset.rmPaginationStyle = '';
    style.textContent = `
      .rm-with-pagination {
        counter-reset: page-number;
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
      }
      .rm-with-pagination > *:not(#pages):not(.rm-page-header):not(.rm-page-footer):not([data-rm-pagination]) {
        position: relative;
        z-index: 1;
      }
      .rm-with-pagination .ProseMirror-selectednode {
        outline: 2px solid #8cf;
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
    `;
    document.head.appendChild(style);

    // Calculate paginated height based on page count
    const calculatePaginatedHeight = (pageCount: number): number => {
      const contentEditablePadding = 48;
      
      if (pageCount === 1) {
        // For single page, just add padding to page height
        const singlePageHeight = contentEditablePadding + this.options.pageHeight;
        return singlePageHeight;
      }
      
      const visibleGaps = pageCount - 1;
      const headerMarginContribution = 48;
      
      // Height calculation breakdown (matches cumulative analysis):
      // - Content padding: 48px (fixed)
      // - Page heights: 842px × number of pages (includes headers/footers)
      // - Gaps: 20px × number of gaps  
      // - Header margins: 48px × number of gaps
      // Note: Gap borders are handled by CSS and don't add to container height
      let total = contentEditablePadding;                                    // 48
      total += this.options.pageHeight * pageCount;                         // 842 * pages
      total += this.options.pageGap * visibleGaps;                         // 20 * gaps
      total += headerMarginContribution * visibleGaps;                     // 48 * gaps (header margins)
      
      return total;
    };

    // Calculate page count based on natural height
    const calculatePageCount = (naturalHeight: number): number => {
      const contentEditablePadding = 48;
      const contentPerPage = this.options.pageHeight - (this.options.pageHeaderHeight * 2);
      const initialHeight = contentEditablePadding + (this.options.pageHeaderHeight * 2);
      const adjustedHeight = Math.max(0, naturalHeight - initialHeight);
      
      // Check if we have actual content beyond the initial structure
      const contentElement = this.editor.view.dom.querySelector('.ProseMirror-content');
      const hasActualContent = contentElement?.textContent ? contentElement.textContent.trim().length > 0 : false;
      
      // Calculate page count based on adjusted height, but also consider text content
      // If we have significant height (more than 1.5 pages worth), trust the height calculation
      const significantHeight = adjustedHeight > (contentPerPage * 1.5);
      
      return (hasActualContent || significantHeight) ? Math.max(1, Math.ceil(adjustedHeight / contentPerPage)) : 1;
    };


    // Helper functions for detecting when content is ready
    const waitForImages = (container: HTMLElement): Promise<void> => {
      const images = container.querySelectorAll('img');
      if (images.length === 0) {
        return Promise.resolve();
      }
      
      const imagePromises = Array.from(images).map(img => {
        if (img.complete) {
          return Promise.resolve();
        }
        
        return new Promise<void>((resolve) => {
          const onLoad = () => {
            img.removeEventListener('load', onLoad);
            img.removeEventListener('error', onLoad);
            resolve();
          };
          img.addEventListener('load', onLoad);
          img.addEventListener('error', onLoad);
          
          // Timeout after 5 seconds for broken images
          setTimeout(onLoad, 5000);
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
        const observer = new IntersectionObserver((entries) => {
          const entry = entries[0];
          if (entry.isIntersecting && entry.intersectionRatio > 0) {
            observer.disconnect();
            resolve();
          }
        }, { threshold: 0.01 }); // Trigger when even 1% is visible
        
        observer.observe(container);
        
        // Fallback timeout
        setTimeout(() => {
          observer.disconnect();
          resolve();
        }, 1000);
      });
    };

    // Store methods in storage for testing access
    this.storage.calculatePaginatedHeight = calculatePaginatedHeight;
    this.storage.calculatePageCount = calculatePageCount;

    // Main measurement function
    const measureAndUpdatePages = (callback?: () => void) => {
      // Clean measurement start
      
      // Temporarily set to auto height for natural measurement
      targetNode.style.height = 'auto';
      targetNode.style.minHeight = '0';
      
      // Force layout reflow
      targetNode.offsetHeight;
      
      // Wait for layout to complete
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Use browser APIs to detect when content is truly ready (for all document sizes)
          const measureWhenReady = async () => {
            // Force layout reflow first
            targetNode.offsetHeight;
            
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
              new Promise(resolve => setTimeout(resolve, 16)) // One frame
            ]);
            
            // Now measure - content should be fully settled
            const naturalHeight = targetNode.scrollHeight;
          
          // Check for layout issues
          
          // Don't subtract header/footer from page height for calculation
          
          // For this specific case, we need to calculate pages differently
          // The natural height doesn't directly map to pages due to headers/footers
          // being part of the decoration, not the content
          
          // Calculate based on content area per page (pageHeight - headers/footers)
          const contentPerPage = this.options.pageHeight - (this.options.pageHeaderHeight * 2);
          const contentEditablePadding = 48; // Fixed padding for content editable
          
          // For initial state, we need to account for the fact that the natural height
          // includes the initial header, footer, and padding
          const initialHeight = contentEditablePadding + (this.options.pageHeaderHeight * 2); // Header + Footer
          const adjustedHeight = Math.max(0, naturalHeight - initialHeight);
          
          // Check if we have actual content beyond the initial structure
          const contentElement = targetNode.querySelector('.ProseMirror-content');
          const hasActualContent = contentElement?.textContent ? contentElement.textContent.trim().length > 0 : false;
          
          // Calculate page count based on adjusted height, but also consider text content
          // If we have significant height (more than 1.5 pages worth), trust the height calculation
          const significantHeight = adjustedHeight > (contentPerPage * 1.5);
          let initialPageCount = (hasActualContent || significantHeight) ? Math.max(1, Math.ceil(adjustedHeight / contentPerPage)) : 1;
          
          // Apply maxPages limit
          initialPageCount = Math.min(initialPageCount, this.options.maxPages || 1000);
          
          // Use initial calculation for now
          let pageCount = initialPageCount;
          
          // Clean logging removed for performance
          
          // Update page count if changed
          if (pageCount !== this.storage.correctPageCount) {
            this.storage.correctPageCount = pageCount;
            
            // Trigger decoration update
            this.editor.view.dispatch(
              this.editor.view.state.tr.setMeta(pagination_meta_key, true)
            );
          }

          // Set paginated height
          const paginatedHeight = calculatePaginatedHeight(pageCount);
          
          // Apply calculated height
          
          targetNode.style.height = `${paginatedHeight}px`;
          
          // Check for content overflow after setting height and trigger auto-fix
          requestAnimationFrame(() => {
            const actualScrollHeight = targetNode.scrollHeight;
            const containerHeight = paginatedHeight;
            const overflow = actualScrollHeight - containerHeight;
            
            if (overflow > 0) {
              console.error(`🚨 CONTENT OVERFLOW DETECTED:`, {
                containerHeight: containerHeight,
                actualScrollHeight: actualScrollHeight,
                overflow: overflow,
                overflowPages: Math.ceil(overflow / 742), // content per page
                pageCount: pageCount,
                suggestedPages: pageCount + Math.ceil(overflow / 742)
              });
              
              // Auto-fix: Add enough pages to contain all content
              const additionalPages = Math.ceil(overflow / 742);
              const newPageCount = pageCount + additionalPages;
              const newHeight = calculatePaginatedHeight(newPageCount);
              console.log(`🔧 Auto-fixing: ${pageCount} → ${newPageCount} pages, ${containerHeight} → ${newHeight}px`);
              
              // Apply corrected height and update storage
              targetNode.style.height = `${newHeight}px`;
              this.storage.correctPageCount = newPageCount;
              
              // Trigger decoration update for new page count
              this.editor.view.dispatch(
                this.editor.view.state.tr.setMeta(pagination_meta_key, true)
              );
              
              // Check once more after the fix to ensure it worked
              requestAnimationFrame(() => {
                const finalScrollHeight = targetNode.scrollHeight;
                const finalContainerHeight = parseInt(targetNode.style.height);
                const finalOverflow = finalScrollHeight - finalContainerHeight;
                
                if (finalOverflow > 0) {
                  console.warn(`⚠️ Still have overflow after fix: ${finalOverflow}px. May need another iteration.`);
                  
                  // If still overflowing, add one more page as safety margin
                  const safetyPageCount = newPageCount + 1;
                  const safetyHeight = calculatePaginatedHeight(safetyPageCount);
                  targetNode.style.height = `${safetyHeight}px`;
                  this.storage.correctPageCount = safetyPageCount;
                  
                  console.log(`🛡️ Safety fix: ${newPageCount} → ${safetyPageCount} pages`);
                  
                  // Final decoration update
                  this.editor.view.dispatch(
                    this.editor.view.state.tr.setMeta(pagination_meta_key, true)
                  );
                } else {
                  console.log(`✅ Auto-fix successful: ${finalOverflow}px overflow remaining`);
                }
              });
            }
          });
          
          // Update last-page class
          const pagesContainer = targetNode.querySelector('#pages');
          if (pagesContainer && pagesContainer.children.length > 0) {
            pagesContainer.querySelectorAll('.last-page').forEach(el => {
              el.classList.remove('last-page');
            });
            
            const lastPageIndex = Math.min(pageCount - 1, pagesContainer.children.length - 1);
            if (lastPageIndex >= 0) {
              pagesContainer.children[lastPageIndex].classList.add('last-page');
            }
          }
          
            if (callback) {
              callback();
            }
          };
          
          // Call the async measurement function
          measureWhenReady().catch((error) => {
            console.warn('⚠️ Content readiness detection failed, proceeding with measurement:', error);
            // Fallback: continue with the rest of the function anyway
          });
        });
      });
    };

    // Debounced remeasure function for content changes
    const remeasureContent = (delay: number = 100) => {
      if (this.storage.remeasureTimer) {
        clearTimeout(this.storage.remeasureTimer);
      }
      
      this.storage.remeasureTimer = setTimeout(() => {
        measureAndUpdatePages();
      }, delay);
    };

    // Store remeasure function for use in plugins
    this.storage.remeasureContent = remeasureContent;

    // Add event listener for forced refresh
    targetNode.addEventListener('pagination-refresh', (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.force) {
        console.log('🔄 Forced pagination refresh');
        remeasureContent(0);
      }
    });

    // Initial setup
    this.editor.view.dispatch(
      this.editor.view.state.tr.setMeta(pagination_meta_key, true)
    );

    // Initial measurement after fonts load
    requestAnimationFrame(() => {
      if ('fonts' in document && document.fonts.status !== 'loaded') {
        document.fonts.ready.then(() => {
          console.log('🔤 Fonts loaded, performing initial measurement');
          measureAndUpdatePages(() => {
            this.storage.isInitialized = true;
            if (this.options.onReady) {
              this.options.onReady();
            }
          });
        });
      } else {
        // Fonts already loaded
        measureAndUpdatePages(() => {
          this.storage.isInitialized = true;
          if (this.options.onReady) {
            this.options.onReady();
          }
        });
      }
    });
  },

  onDestroy() {
    // Cleanup
    if (this.storage?.remeasureTimer) {
      clearTimeout(this.storage.remeasureTimer);
    }
    
    // Cleanup styles
    const style = document.querySelector('[data-rm-pagination-style]');
    if (style && style.parentNode) {
      style.parentNode.removeChild(style);
    }
  },

  addProseMirrorPlugins() {
    const pageOptions = this.options;
    const extensionStorage = this.storage;
    let lastDocSize = 0;
    
    return [
      new Plugin({
        key: new PluginKey("pagination"),

        state: {
          init(_, state) {
            lastDocSize = state.doc.content.size;
            const widgetList = createDecoration(state, pageOptions, extensionStorage);
            return DecorationSet.create(state.doc, widgetList);
          },
          apply(tr, oldDeco, _oldState, newState) {
            const sizeDiff = newState.doc.content.size - lastDocSize;
            const sizeChanged = Math.abs(sizeDiff) > 10;
            const isLargePaste = sizeDiff > 1000;
            const isLargeDeletion = sizeDiff < -50 && newState.doc.content.size < 20;
            
            if (tr.docChanged) {
              console.log('🔄 Document change:', {
                sizeDiff,
                isLargePaste,
                isLargeDeletion,
                oldSize: lastDocSize,
                newSize: newState.doc.content.size
              });
              
              // Handle large paste with delayed remeasurement
              if (isLargePaste && extensionStorage.isInitialized) {
                console.log('📋 Large paste detected - scheduling remeasurement');
                
                // Quick remeasure for immediate feedback
                extensionStorage.remeasureContent(50);
                
                // Additional remeasure for very large pastes
                if (sizeDiff > 10000) {
                  extensionStorage.remeasureContent(300);
                }
              }
              
              // Handle large deletion
              if (isLargeDeletion) {
                console.log('🗑️ Large deletion detected');
                extensionStorage.correctPageCount = 1;
                if (extensionStorage.isInitialized) {
                  extensionStorage.remeasureContent(50);
                }
              }
              
              // Handle normal content changes after initialization
              if (sizeChanged && !isLargePaste && !isLargeDeletion && extensionStorage.isInitialized) {
                extensionStorage.remeasureContent(200);
              }
            }
            
            if (tr.docChanged && (sizeChanged || isLargeDeletion) || tr.getMeta(pagination_meta_key)) {
              lastDocSize = newState.doc.content.size;
              
              console.log('🔄 Updating decorations');
              const widgetList = createDecoration(newState, pageOptions, extensionStorage);
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
  // Creating pagination decorations
  
  const pageWidget = Decoration.widget(
    0,
    (view) => {
      const _pageGap = pageOptions.pageGap;
      const _pageHeaderHeight = pageOptions.pageHeaderHeight;
      const _pageHeight = pageOptions.pageHeight - (_pageHeaderHeight * 2);
      const _pageBreakBackground = pageOptions.pageBreakBackground;
      
      // Use stored page count
      const pages = extensionStorage?.correctPageCount || 1;
      // Creating page elements
      
      const breakerWidth = view.dom.clientWidth;
      
      const el = document.createElement("div");
      el.dataset.rmPagination = "true";
      el.id = "pages";

      // Create fragment for batch DOM operation
      const fragment = document.createDocumentFragment();

      const createPageBreak = (isFirst: boolean, isLast: boolean) => {
        const pageContainer = document.createElement("div");
        pageContainer.className = "rm-page-break" + (isLast ? " last-page" : "");

        const page = document.createElement("div");
        page.className = "page";
        page.style.cssText = `
          position: relative;
          float: left;
          clear: both;
          margin-top: ${isFirst ? `calc(${_pageHeaderHeight}px + ${_pageHeight}px)` : _pageHeight + "px"};
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

        const pageFooter = document.createElement("div");
        pageFooter.className = "rm-page-footer";
        pageFooter.style.height = _pageHeaderHeight + "px";

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
        pageHeader.textContent = pageOptions.headerText;

        pageBreak.append(pageFooter, pageSpace, pageHeader);
        pageContainer.append(page, pageBreak);

        return pageContainer;
      };

      // Build all pages at once  
      const finalPageCount = Math.min(pages, pageOptions.maxPages || 1000);
      
      for (let i = 0; i < finalPageCount; i++) {
        fragment.appendChild(createPageBreak(i === 0, i === finalPageCount - 1));
      }
      
      el.appendChild(fragment);
      return el;
    },
    { side: -1 }
  );

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
    { side: -1 }
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