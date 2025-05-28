import { Extension } from "@tiptap/core";
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
    contentPadding: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
    fontSize: number;
    lineHeight: number;
}
export declare const PaginationPlus: Extension<PaginationPlusOptions, any>;
export {};
