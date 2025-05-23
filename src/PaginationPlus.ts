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
      onReady: undefined,
    };
  },

  addStorage() {
    return {
      pagesContainer: null,
      contentElements: new Map(),
      lastContentHeight: 0,
      lastPageCount: 0,
      resizeObserver: null,
      mutationObserver: null,
      refreshScheduled: false,
      refreshDebounceTimer: null,
      correctPageCount: 1,
    };
  },
  
  onCreate() {
    const targetNode = this.editor.view.dom as HTMLElement;
    targetNode.classList.add("rm-with-pagination");

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
        @apply table w-full;
      }
      .rm-with-pagination .table-row-group {
        max-height: ${_pageHeight}px;
        overflow-y: auto;
        width: 100%;
      }
    `;
    document.head.appendChild(style);

    // Debounced refresh function
    const debouncedRefresh = (force = false) => {
      if (this.storage.refreshDebounceTimer) {
        clearTimeout(this.storage.refreshDebounceTimer);
      }
      
      this.storage.refreshDebounceTimer = setTimeout(() => {
        if (!this.storage.refreshScheduled || force) {
          this.storage.refreshScheduled = true;
          requestAnimationFrame(() => {
            this.storage.refreshScheduled = false;
            refreshPage(targetNode);
          });
        }
      }, 50); // 50ms debounce
    };

    // Set up ResizeObserver for content changes
    const setupResizeObserver = () => {
      if (this.storage.resizeObserver) {
        this.storage.resizeObserver.disconnect();
      }

      const contentContainer = targetNode;
      let lastHeight = 0;

      this.storage.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const currentHeight = entry.contentRect.height;
          
          // Only trigger refresh if height changed significantly (>10px)
          if (Math.abs(currentHeight - lastHeight) > 10) {
            lastHeight = currentHeight;
            debouncedRefresh();
          }
        }
      });

      // Observe the main container
      this.storage.resizeObserver.observe(contentContainer);

      // Also observe individual content elements for more granular updates
      const observeContentElements = () => {
        const children = Array.from(contentContainer.children);
        children.forEach((child, index) => {
          if (index >= 2 && index < children.length - 1) { // Skip header/footer
            this.storage.resizeObserver.observe(child);
          }
        });
      };

      // Initial observation
      setTimeout(observeContentElements, 100);
    };

    // Optimized updateEditorHeight
    const updateEditorHeight = (
      node: HTMLElement,
      currentPageTops: number[],
      currentMaxPageVal: number
    ) => {
      // Only update if changed
      const currentHeight = parseInt(node.style.height) || 0;
      
      // Correct formula based on working 8170px for 9 pages
      // Pattern: ~908px per page (including proportional gaps/headers)
      const correctHeight = Math.round(currentMaxPageVal * 908);
      
      if (Math.abs(currentHeight - correctHeight) > 1) {
        node.style.height = `${correctHeight}px`;
      }
    };

    // Optimized refreshPage function
    const refreshPage = (nodeToRefresh: HTMLElement) => {
      // Use cached pages container
      if (!this.storage.pagesContainer) {
        this.storage.pagesContainer = nodeToRefresh.querySelector('#pages');
      }
      const pagesWidgetContainer = this.storage.pagesContainer as HTMLElement;
      
      if (!pagesWidgetContainer) {
        return;
      }

      const pageElements = pagesWidgetContainer.querySelectorAll(".page");
      const contentElements = nodeToRefresh.children;

      // Calculate available height per page (accounting for headers/footers)
      const effectivePageHeight = this.options.pageHeight - (this.options.pageHeaderHeight * 2);

      // Quick content check
      let totalContentHeight = 0;
      let hasRealContent = false;
      let contentNodes = 0;
      const contentHeights: number[] = [];

      // Find actual content boundaries
      let startIndex = -1;
      let endIndex = contentElements.length;
      
      for (let i = 0; i < contentElements.length; i++) {
        const el = contentElements[i] as HTMLElement;
        if (el.id === 'pages') {
          startIndex = i + 1;
          break;
        }
      }
      
      // Skip header at start and any footer elements
      if (startIndex === -1) startIndex = 1;
      
      for (let i = startIndex; i < contentElements.length; i++) {
        const contentElement = contentElements[i] as HTMLElement;
        if (!contentElement) continue;
        
        // Skip if this is a page decoration element
        if (contentElement.classList.contains('rm-page-header') || 
            contentElement.classList.contains('rm-page-footer') ||
            contentElement.classList.contains('rm-page-break')) {
          continue;
        }
        
        // Use scrollHeight for more accurate measurement
        const currentHeight = contentElement.scrollHeight || contentElement.offsetHeight;
        
        // Smart filtering: exclude ProseMirror trailing breaks that follow content
        const isTrailingBreak = contentElement.tagName === 'P' && 
                               currentHeight <= 24 && 
                               !contentElement.textContent?.trim() &&
                               contentElement.querySelector('br.ProseMirror-trailingBreak');
        
        // Check if previous element was a content paragraph
        const prevElement = i > startIndex ? contentElements[i - 1] as HTMLElement : null;
        const prevHasContent = prevElement && 
                              prevElement.textContent?.trim() && 
                              !prevElement.classList.contains('rm-page-header') &&
                              !prevElement.classList.contains('rm-page-footer') &&
                              !prevElement.classList.contains('rm-page-break');
        
        // Exclude trailing breaks that immediately follow content paragraphs
        const shouldExclude = isTrailingBreak && prevHasContent;
        
        if (currentHeight > 0 && !shouldExclude) {
          contentHeights.push(currentHeight);
          totalContentHeight += currentHeight;
          contentNodes++;
        }
        
        // Quick content check
        if (!hasRealContent && (
          contentElement.textContent?.trim() || 
          contentElement.querySelector('img, table, hr, blockquote, [class*="node"]')
        )) {
          hasRealContent = true;
        }
      }

      // Better content detection: only count nodes with actual content or visual elements
      // Don't assume content just because there are multiple empty nodes
      if (!hasRealContent && contentNodes > 0) {
        // Check if any of the content elements actually have meaningful content
        for (let i = startIndex; i < contentElements.length; i++) {
          const contentElement = contentElements[i] as HTMLElement;
          if (!contentElement) continue;
          
          // Skip decoration elements
          if (contentElement.classList.contains('rm-page-header') || 
              contentElement.classList.contains('rm-page-footer') ||
              contentElement.classList.contains('rm-page-break')) {
            continue;
          }
          
          // Check for actual content (not just empty paragraphs with line breaks)
          const hasText = contentElement.textContent?.trim();
          const hasVisualElements = contentElement.querySelector('img, table, hr, blockquote, [class*="node"]:not([class*="ProseMirror-trailingBreak"])');
          const hasNonEmptyParagraphs = contentElement.tagName === 'P' && hasText;
          
          if (hasText || hasVisualElements || hasNonEmptyParagraphs) {
            hasRealContent = true;
            break;
          }
        }
      }

      // Calculate required pages based on cumulative height
      let accumulatedHeight = 0;
      let requiredPages = 1;
      let pageBreaks = [];
      
      for (let i = 0; i < contentHeights.length; i++) {
        const height = contentHeights[i];
        if (accumulatedHeight + height > effectivePageHeight) {
          requiredPages++;
          pageBreaks.push({ pageNum: requiredPages, atHeight: accumulatedHeight, nextItemHeight: height });
          accumulatedHeight = height;
        } else {
          accumulatedHeight += height;
        }
      }

      // Don't count empty trailing pages
      if (!hasRealContent || totalContentHeight === 0) {
        requiredPages = 1;
      } else {
        // Use a more accurate calculation to avoid extra pages
        const calculatedPages = Math.ceil(totalContentHeight / effectivePageHeight);
        // Use the minimum of cumulative calculation and direct calculation
        requiredPages = Math.min(requiredPages, Math.max(calculatedPages, 1));
      }

      // Special handling for when content becomes empty - force recalculation
      const contentBecameEmpty = !hasRealContent && totalContentHeight === 0;
      const significantChange = Math.abs(totalContentHeight - this.storage.lastContentHeight) >= 5;
      const pageCountChanged = this.storage.lastPageCount !== pageElements.length;
      
      // Only skip recalculation if no significant changes AND content is not empty
      if (!contentBecameEmpty && !significantChange && !pageCountChanged) {
        return; // No significant changes
      }
      
      // Clear cached page count when content becomes empty
      if (contentBecameEmpty) {
        this.storage.correctPageCount = 1;
      }
      
      this.storage.lastContentHeight = totalContentHeight;
      this.storage.lastPageCount = pageElements.length;

      const maxPage = hasRealContent ? requiredPages : 1;
      const _maxPageForLogic = maxPage;

      updateEditorHeight(nodeToRefresh, [], _maxPageForLogic);
      
      // Update last-page class
      if (pagesWidgetContainer.children.length > 0) {
        // Remove existing last-page classes
        pagesWidgetContainer.querySelectorAll('.last-page').forEach(el => {
          el.classList.remove('last-page');
        });
        
        const lastPageIndex = Math.min(_maxPageForLogic - 1, pagesWidgetContainer.children.length - 1);
        
        if (lastPageIndex >= 0 && lastPageIndex < pagesWidgetContainer.children.length) {
          pagesWidgetContainer.children[lastPageIndex].classList.add('last-page');
        }
      }

      // Force re-render of decorations if page count changed
      const currentPageCount = pagesWidgetContainer.children.length;
      
      if (requiredPages !== currentPageCount) {
        // Store the correct page count in extension storage
        this.storage.correctPageCount = requiredPages;
        
        // Update editor height immediately with correct page count
        updateEditorHeight(nodeToRefresh, [], requiredPages);
        
        this.editor.view.dispatch(
          this.editor.view.state.tr.setMeta(pagination_meta_key, true)
        );
      }
    };

    // Set up MutationObserver for structural changes
    const callback = (mutationList: MutationRecord[]) => {
      // Check if we need to re-observe elements
      let needsReobserve = false;
      
      for (const mutation of mutationList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          needsReobserve = true;
          break;
        }
      }
      
      if (needsReobserve && this.storage.resizeObserver) {
        // Re-observe new elements
        const children = Array.from(targetNode.children);
        children.forEach((child, index) => {
          if (index >= 2 && index < children.length - 1) {
            this.storage.resizeObserver.observe(child);
          }
        });
      }
      
      debouncedRefresh();
    };

    this.storage.mutationObserver = new MutationObserver(callback);
    this.storage.mutationObserver.observe(targetNode, { 
      attributes: true, 
      childList: true, 
      subtree: true 
    });

    // Add event listener for forced refresh
    targetNode.addEventListener('pagination-refresh', (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.force) {
        // Clear caches
        this.storage.contentElements.clear();
        this.storage.lastContentHeight = 0;
        this.storage.pagesContainer = null;
        
        debouncedRefresh(true);
        
        this.editor.view.dispatch(
          this.editor.view.state.tr.setMeta(pagination_meta_key, true)
        );
      }
    });

    // Initial setup
    this.editor.view.dispatch(
      this.editor.view.state.tr.setMeta(pagination_meta_key, true)
    );

    // Setup observers and initial refresh
    requestAnimationFrame(() => {
      setupResizeObserver();
      refreshPage(targetNode);

      if (this.options.onReady) {
        this.options.onReady();
      }
    });
  },

  onDestroy() {
    // Cleanup observers
    if (this.storage?.resizeObserver) {
      this.storage.resizeObserver.disconnect();
    }
    if (this.storage?.mutationObserver) {
      this.storage.mutationObserver.disconnect();
    }
    if (this.storage?.refreshDebounceTimer) {
      clearTimeout(this.storage.refreshDebounceTimer);
    }
    
    // Cleanup styles
    const style = document.querySelector('[data-rm-pagination-style]');
    if (style) {
      style.remove();
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
          apply(tr, oldDeco, oldState, newState) {
            // Calculate size change
            const sizeDiff = newState.doc.content.size - lastDocSize;
            const sizeChanged = Math.abs(sizeDiff) > 10;
            
            // More sensitive detection for large deletions (like select-all-delete)
            const largeContentRemoval = sizeDiff < -50 || newState.doc.content.size < 20;
            
            if (tr.docChanged && (sizeChanged || largeContentRemoval) || tr.getMeta(pagination_meta_key)) {
              lastDocSize = newState.doc.content.size;
              
              // Force clear cached page count on large deletions
              if (largeContentRemoval && extensionStorage) {
                extensionStorage.correctPageCount = 1;
                extensionStorage.lastContentHeight = 0;
              }
              
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
  const pageWidget = Decoration.widget(
    0,
    (view) => {
      const _extraPages = 0;
      const _pageGap = pageOptions.pageGap;
      const _pageHeaderHeight = pageOptions.pageHeaderHeight;
      const _pageHeight = pageOptions.pageHeight - (_pageHeaderHeight * 2);
      const _pageBreakBackground = pageOptions.pageBreakBackground;
      const _pageGapBorderSize = pageOptions.pageGapBorderSize;

      // Use the correct page count from storage if available, otherwise calculate
      let pages = 1;
      
      if (extensionStorage?.correctPageCount) {
        pages = extensionStorage.correctPageCount;
      } else {
        // Fallback calculation - use same logic as refreshPage
        const effectivePageHeight = pageOptions.pageHeight - (pageOptions.pageHeaderHeight * 2);
        const childElements = view.dom.children;
        let totalHeight = 0;
        let hasRealContent = false;
        const heights: number[] = [];

        // Use same element selection logic as refreshPage
        let startIndex = -1;
        for (let i = 0; i < childElements.length; i++) {
          const el = childElements[i] as HTMLElement;
          if (el.id === 'pages') {
            startIndex = i + 1;
            break;
          }
        }
        if (startIndex === -1) startIndex = 2; // Skip first header

        for (let i = startIndex; i < childElements.length - 1; i++) {
          const element = childElements[i] as HTMLElement;
          if (!element) continue;
          
          // Skip page decoration elements
          if (element.classList.contains('rm-page-header') || 
              element.classList.contains('rm-page-footer') ||
              element.classList.contains('rm-page-break')) {
            continue;
          }

          const height = element.scrollHeight || element.offsetHeight || 0;
          
          // Smart filtering: exclude ProseMirror trailing breaks that follow content
          const isTrailingBreak = element.tagName === 'P' && 
                                 height <= 24 && 
                                 !element.textContent?.trim() &&
                                 element.querySelector('br.ProseMirror-trailingBreak');
          
          // Check if previous element was a content paragraph
          const prevElement = i > startIndex ? childElements[i - 1] as HTMLElement : null;
          const prevHasContent = prevElement && 
                                prevElement.textContent?.trim() && 
                                !prevElement.classList.contains('rm-page-header') &&
                                !prevElement.classList.contains('rm-page-footer') &&
                                !prevElement.classList.contains('rm-page-break');
          
          // Exclude trailing breaks that immediately follow content paragraphs
          const shouldExclude = isTrailingBreak && prevHasContent;
          
          if (height > 0 && !shouldExclude) {
            heights.push(height);
            totalHeight += height;
          }
          
          // Check for actual content
          if (!hasRealContent && (
            element.textContent?.trim() || 
            element.querySelector('img, table, hr, blockquote, [class*="node"]:not([class*="ProseMirror-trailingBreak"])')
          )) {
            hasRealContent = true;
          }
        }

        // Calculate pages using same algorithm as refreshPage (no 95% threshold)
        let accumulatedHeight = 0;
        pages = 1;
        
        for (const height of heights) {
          if (accumulatedHeight + height > effectivePageHeight) {
            pages++;
            accumulatedHeight = height;
          } else {
            accumulatedHeight += height;
          }
        }
        
        // Don't create extra pages if there's no real content
        if (!hasRealContent || totalHeight === 0) {
          pages = 1;
        } else {
          // Use a more accurate calculation to avoid extra pages
          const calculatedPages = Math.ceil(totalHeight / effectivePageHeight);
          // Use the minimum of cumulative calculation and direct calculation
          pages = Math.min(pages, Math.max(calculatedPages, 1));
        }
      }
      
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
      const finalPageCount = Math.min(pages, 15); // Cap at 15 pages as safety limit
      
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