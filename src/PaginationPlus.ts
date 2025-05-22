// DecorativeDecoration.ts
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
  onCreate() {
    const targetNode = this.editor.view.dom as HTMLElement;
    targetNode.classList.add("rm-with-pagination");

    const config = { attributes: true };
    const _pageHeaderHeight = this.options.pageHeaderHeight;
    const _pageHeight = this.options.pageHeight - (_pageHeaderHeight * 2);

    const style = document.createElement('style');
    style.dataset.rmPaginationStyle = '';
    style.textContent = `
      .rm-with-pagination {
        counter-reset: page-number;
      }
      .rm-with-pagination .rm-page-footer::before {
        counter-increment: page-number;
      }
      .rm-with-pagination .rm-page-footer::before {
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
      .rm-with-pagination .rm-page-break.last-page ~ .rm-page-break {
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

    const _pageGap = this.options.pageGap;
    const _pageGapBorderSize = this.options.pageGapBorderSize;
    

    const updateEditorHeight = (
      node: HTMLElement,
      currentPacetops: number[],
      currentMaxPageVal: number // Renamed from _maxPage to avoid confusion with outer scope if any
    ) => {
      // const calculatedPageContentHeight = this.options.pageHeight - (this.options.pageHeaderHeight * 2);

      if (currentMaxPageVal > 0 && currentPacetops.length >= currentMaxPageVal && currentPacetops[currentMaxPageVal -1] !== Infinity) {
        const lastPageFooterStartOffset = currentPacetops[currentMaxPageVal - 1];
        const requiredHeight = lastPageFooterStartOffset; // User confirmed this formula works
        node.style.height = `${requiredHeight}px`;
      } else if (currentMaxPageVal === 1) { 
         const requiredHeight = this.options.pageHeight + this.options.pageHeaderHeight;
         node.style.height = `${requiredHeight}px`; 
      } else {
        const fallbackHeight = (currentMaxPageVal * this.options.pageHeight) + (Math.max(0, currentMaxPageVal - 1) * this.options.pageGap);
        node.style.height = `${fallbackHeight}px`;
      }
    };

    const refreshPage = (nodeToRefresh: HTMLElement) => {
      const pagesWidgetContainer = Array.from(nodeToRefresh.children).find((child) => child.id === "pages") as HTMLElement | undefined;
      if (!pagesWidgetContainer) {
        return;
      }

      const pageElements = [...pagesWidgetContainer.querySelectorAll(".page")] as HTMLElement[];
      const contentElements = [...nodeToRefresh.children] as HTMLElement[];

      // pageTops should be relative to targetNode (editor.view.dom)
      const pageData = pageElements.map((el) => ({
        absoluteTop: pagesWidgetContainer.offsetTop + el.offsetTop,
        relativeTop: el.offsetTop,
      }));

      const pageTops = pageData
        .filter(data => data.absoluteTop !== pagesWidgetContainer.offsetTop || data.relativeTop === 0)
        .map(data => data.absoluteTop);

      pageTops.push(Infinity); // to simplify range check for last page

      const pagesWithContent = new Set();
      // contentElements[0] is div#pages (all page breaks widget)
      // contentElements[1] is the firstHeaderWidget
      // contentElements[contentElements.length - 1] is the lastFooterWidget
      // So, actual content nodes are from index 2 to contentElements.length - 2
      for (let i = 2; i < contentElements.length - 1; i++) {
        const contentElement = contentElements[i];
        // Ensure we are not trying to get offsetTop of a widget that might be display:none or similar
        if (!contentElement || !(contentElement instanceof HTMLElement)) {
          continue;
        }
        const top = contentElement.offsetTop;
        let foundPage = false;
        for (let j = 0; j < pageTops.length - 1; j++) {
          if (top >= pageTops[j] && top < pageTops[j + 1]) {
            pagesWithContent.add(j + 1); // page index starting from 1
            foundPage = true;
            break;
          }
        }
      }
      const maxPage = pagesWithContent.size > 0 ? Math.max(...Array.from(pagesWithContent as Set<number>)) : 0;
      
      const _maxPageForLogic = maxPage + 1;

      updateEditorHeight(nodeToRefresh, pageTops, _maxPageForLogic);
      
      // Apply last-page class (using pagesWidgetContainer)
      if (_maxPageForLogic > 0 && pagesWidgetContainer && (_maxPageForLogic -1) in pagesWidgetContainer.children) {
        // Clear last-page from any other element first
        for(let i = 0; i < pagesWidgetContainer.children.length; i++) {
          pagesWidgetContainer.children[i].classList.remove('last-page');
        }
        pagesWidgetContainer.children[_maxPageForLogic -1].classList.add('last-page');
      } else if (pagesWidgetContainer && pagesWidgetContainer.children.length > 0 && _maxPageForLogic === 0) {
        // This case should ideally not happen if createDecoration always adds pages
        // but as a fallback, if no pages are to be shown, mark the first one as last.
        for(let i = 0; i < pagesWidgetContainer.children.length; i++) {
          pagesWidgetContainer.children[i].classList.remove('last-page');
        }
        pagesWidgetContainer.children[0].classList.add('last-page');
      }
    }

    const callback = (
      mutationList: MutationRecord[],
      observer: MutationObserver
    ) => {
      if(mutationList.length > 0 && mutationList[0].target) {
        const _target = mutationList[0].target as HTMLElement;
        if(_target.classList.contains("rm-with-pagination")) {
          // Debounce refreshPage calls from the mutation observer
          if ((this.editor.storage as any).paginationRefreshTimeout) {
            clearTimeout((this.editor.storage as any).paginationRefreshTimeout);
          }
          (this.editor.storage as any).paginationRefreshTimeout = setTimeout(() => {
            refreshPage(_target);
          }, 300); // Debounce/delay increased to 300ms
        }
      }
    };
    const observer = new MutationObserver(callback);
    observer.observe(targetNode, config);
    
    this.editor.view.dispatch(
      this.editor.view.state.tr.setMeta(pagination_meta_key, true)
    );

    requestAnimationFrame(() => {
      refreshPage(targetNode);

      if (this.options.onReady) {
        this.options.onReady();
      }
    });
  },
  addProseMirrorPlugins() {
    const pageOptions = this.options;
    return [
      new Plugin({
        key: new PluginKey("pagination"),

        state: {
          init(_, state) {
            const widgetList = createDecoration(state, pageOptions);
            return DecorationSet.create(state.doc, widgetList);
          },
          apply(tr, oldDeco, oldState, newState) {
            // Recalculate only on doc changes
            if (tr.docChanged || tr.getMeta(pagination_meta_key)) {
              const widgetList = createDecoration(newState, pageOptions);
              return DecorationSet.create(newState.doc, [...widgetList]);
            }
            return oldDeco;
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
  pageOptions: PaginationPlusOptions
): Decoration[] {
  const pageWidget = Decoration.widget(
    0,
    (view) => {
      const _extraPages = 1;
      const _pageGap = pageOptions.pageGap;
      const _pageHeaderHeight = pageOptions.pageHeaderHeight;
      const _pageHeight = pageOptions.pageHeight - (_pageHeaderHeight * 2);
      const _pageBreakBackground = pageOptions.pageBreakBackground;
      const _pageGapBorderSize = pageOptions.pageGapBorderSize;

      const childElements = view.dom.children;
      let totalHeight = 0;

      for (let i = 2; i < childElements.length - 1; i++) {
        totalHeight += childElements[i].scrollHeight;
      }

      const paginationElement = document.querySelector("[data-rm-pagination]");

      let previousPageCount = paginationElement
        ? paginationElement.children.length
        : 0;
      previousPageCount =
        previousPageCount > _extraPages ? previousPageCount - _extraPages : 0;

      const totalPageGap = _pageGap + _pageHeaderHeight + _pageHeaderHeight;

      let actualPageContentHeight =
        totalHeight -
        previousPageCount * (totalPageGap + _pageGapBorderSize * 2);
      let pages = Math.ceil(actualPageContentHeight / _pageHeight);
      pages = pages > 0 ? pages - 1 : 0;
      const breakerWidth = view.dom.clientWidth;
      
      const el = document.createElement("div");
      el.dataset.rmPagination = "true";

      const pageBreakDefinition = ({
        firstPage = false,
        lastPage = false,
      }: {
        firstPage: boolean;
        lastPage: boolean;
      }) => {
        const pageContainer = document.createElement("div");
        pageContainer.classList.add("rm-page-break")

        const page = document.createElement("div");
        page.classList.add("page");
        page.style.position = "relative";
        page.style.float = "left";
        page.style.clear = "both";
        page.style.marginTop = firstPage
          ? `calc(${_pageHeaderHeight}px + ${_pageHeight}px)`
          : _pageHeight + "px";

        const pageBreak = document.createElement("div");
        pageBreak.classList.add("breaker");
        pageBreak.style.width = `calc(${breakerWidth}px)`;
        pageBreak.style.marginLeft = `calc(calc(calc(${breakerWidth}px - 100%) / 2) - calc(${breakerWidth}px - 100%))`;
        pageBreak.style.marginRight = `calc(calc(calc(${breakerWidth}px - 100%) / 2) - calc(${breakerWidth}px - 100%))`;
        pageBreak.style.position = "relative";
        pageBreak.style.float = "left";
        pageBreak.style.clear = "both";
        pageBreak.style.left = "0px";
        pageBreak.style.right = "0px";
        pageBreak.style.zIndex = "2";

        const pageFooter = document.createElement("div");
        pageFooter.classList.add("rm-page-footer");
        pageFooter.style.height = _pageHeaderHeight + "px";

        const pageSpace = document.createElement("div");
        pageSpace.classList.add("rm-pagination-gap");
        pageSpace.style.height = _pageGap + "px";
        pageSpace.style.borderLeft = "1px solid";
        pageSpace.style.borderRight = "1px solid";
        pageSpace.style.position = "relative";
        pageSpace.style.setProperty("width", "calc(100% + 2px)", "important");
        pageSpace.style.left = "-1px";
        pageSpace.style.backgroundColor = _pageBreakBackground;
        pageSpace.style.borderLeftColor = _pageBreakBackground;
        pageSpace.style.borderRightColor = _pageBreakBackground;

        const pageHeader = document.createElement("div");
        pageHeader.classList.add("rm-page-header");
        pageHeader.style.height = _pageHeaderHeight + "px";
        pageHeader.textContent = pageOptions.headerText;

        pageBreak.append(pageFooter, pageSpace, pageHeader);
        pageContainer.append(page, pageBreak);

        return pageContainer;
      };

      const page = pageBreakDefinition({ firstPage: false, lastPage: false });
      const firstPage = pageBreakDefinition({
        firstPage: true,
        lastPage: false,
      });
      const fragment = document.createDocumentFragment();

      for (let i = 0; i < pages + _extraPages; i++) {
        if (i === 0) {
          fragment.appendChild(firstPage.cloneNode(true));
        } else {
          fragment.appendChild(page.cloneNode(true));
        }
      }
      el.append(fragment);
      el.id = "pages";

      return el;
    },
    { side: -1 }
  );
  const firstHeaderWidget = Decoration.widget(
    0,
    (view) => {
      const el = document.createElement("div");
      el.classList.add("rm-page-header");
      el.style.height = `${pageOptions.pageHeaderHeight}px`;
      el.textContent = pageOptions.headerText;
      el.style.marginTop = '0px';

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
  return [
    pageWidget,
    firstHeaderWidget,
    lastFooterWidget
  ];
}
