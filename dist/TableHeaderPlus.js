import TableHeader from "@tiptap/extension-table-header";
export const TableHeaderPlus = TableHeader.extend({
    addNodeView() {
        return ({ node }) => {
            const dom = document.createElement('th');
            let colspan = node.attrs.colspan;
            let rowspan = node.attrs.rowspan;
            const updateGrid = (colspan, rowspan) => {
                dom.style.gridColumn = `auto / span ${colspan || 1}`;
                dom.rowSpan = rowspan || 1;
                dom.setAttribute("colspan", `${colspan || 1}`);
            };
            updateGrid(colspan, rowspan);
            return {
                dom,
                contentDOM: dom,
                update(updatedNode) {
                    if (updatedNode.type.name !== 'tableHeader') {
                        return false;
                    }
                    const updatedColspan = updatedNode.attrs.colspan;
                    if (updatedColspan !== colspan) {
                        colspan = updatedColspan;
                        updateGrid(updatedColspan, rowspan);
                    }
                    return true;
                },
            };
        };
    }
});
export default TableHeaderPlus;
