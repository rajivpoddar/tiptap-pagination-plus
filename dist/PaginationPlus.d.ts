import { Extension } from "@tiptap/core";
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
export declare const PaginationPlus: Extension<PaginationPlusOptions, any>;
export {};
