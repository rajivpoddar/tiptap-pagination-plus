import TableRow from "@tiptap/extension-table-row";
export const TableRowPlus = TableRow.extend({
    addNodeView() {
        return ({ node }) => {
            const dom = document.createElement('tr');
            dom.style.display = 'grid';
            let previousChildCount = node.children.map(child => child.attrs.colspan).reduce((acc, curr) => acc + curr, 0);
            const updateGrid = (childNodeCount) => {
                dom.style.gridTemplateColumns = `repeat(${childNodeCount || 1}, 1fr)`;
            };
            updateGrid(previousChildCount);
            return {
                dom,
                contentDOM: dom,
                update(updatedNode) {
                    if (updatedNode.type.name !== 'tableRow') {
                        return false;
                    }
                    const updatedChildCount = updatedNode.children.map(child => child.attrs.colspan).reduce((acc, curr) => acc + curr, 0);
                    if (updatedChildCount !== previousChildCount) {
                        previousChildCount = updatedChildCount;
                        updateGrid(updatedChildCount);
                    }
                    return true;
                },
            };
        };
    },
});
export default TableRowPlus;
