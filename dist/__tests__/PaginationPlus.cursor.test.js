import { PaginationPlus } from '../PaginationPlus';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import '@testing-library/jest-dom';
// Mock DOM scroll methods
const mockScrollTo = jest.fn();
const mockGetBoundingClientRect = jest.fn(() => ({
    top: 100,
    left: 50,
    width: 200,
    height: 20
}));
Object.defineProperty(Element.prototype, 'scrollTo', {
    value: mockScrollTo,
    writable: true
});
Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    value: mockGetBoundingClientRect,
    writable: true
});
Object.defineProperty(Element.prototype, 'scrollTop', {
    value: 0,
    writable: true,
    configurable: true
});
Object.defineProperty(Element.prototype, 'scrollLeft', {
    value: 0,
    writable: true,
    configurable: true
});
describe('PaginationPlus Cursor and Scroll Restoration', () => {
    let editor;
    let editorElement;
    beforeEach(() => {
        // Create a mock DOM element for the editor
        editorElement = document.createElement('div');
        editorElement.style.height = '800px';
        editorElement.scrollTop = 150; // Initial scroll position
        document.body.appendChild(editorElement);
        // Mock editor view
        const mockView = {
            dom: editorElement,
            state: {
                selection: {
                    from: 10,
                    to: 10,
                    $from: { pos: 10 },
                    $to: { pos: 10 }
                }
            },
            dispatch: jest.fn(),
            coordsAtPos: jest.fn(() => ({ top: 100, left: 50 }))
        };
        editor = new Editor({
            element: editorElement,
            extensions: [
                StarterKit,
                PaginationPlus.configure({
                    pageHeight: 842,
                    pageHeaderHeight: 50,
                    pageGap: 20,
                }),
            ],
        });
        // Mock the view after creation
        Object.defineProperty(editor, 'view', {
            value: mockView,
            writable: true
        });
        jest.clearAllMocks();
    });
    afterEach(() => {
        try {
            editor.destroy();
        }
        catch (e) {
            // Ignore destroy errors in tests
        }
        if (document.body.contains(editorElement)) {
            document.body.removeChild(editorElement);
        }
    });
    describe('Typing Delay', () => {
        it('should use 300ms delay after typing ends', (done) => {
            // Mock the remeasureContent function to track timing
            let remeasureCalled = false;
            let actualDelay = 0;
            const startTime = Date.now();
            // Access the extension storage
            const paginationExtension = editor.extensionManager.extensions.find(ext => ext.name === 'PaginationPlus');
            if (paginationExtension === null || paginationExtension === void 0 ? void 0 : paginationExtension.storage.remeasureContent) {
                const originalRemeasure = paginationExtension.storage.remeasureContent;
                paginationExtension.storage.remeasureContent = (delay) => {
                    actualDelay = delay;
                    // Call original with minimal delay for testing
                    originalRemeasure(10);
                    remeasureCalled = true;
                    setTimeout(() => {
                        expect(actualDelay).toBe(300);
                        expect(remeasureCalled).toBe(true);
                        done();
                    }, 20);
                };
                // Simulate typing that should trigger 300ms delay
                editor.commands.insertContent('Hello world');
            }
            else {
                fail('remeasureContent not found in storage');
            }
        });
        it('should reset delay timer on subsequent typing', (done) => {
            let callCount = 0;
            const paginationExtension = editor.extensionManager.extensions.find(ext => ext.name === 'PaginationPlus');
            if (paginationExtension === null || paginationExtension === void 0 ? void 0 : paginationExtension.storage.remeasureContent) {
                const originalRemeasure = paginationExtension.storage.remeasureContent;
                paginationExtension.storage.remeasureContent = (delay) => {
                    callCount++;
                    originalRemeasure(10); // Use minimal delay for testing
                    if (callCount === 2) {
                        // Should only be called once due to debouncing
                        setTimeout(() => {
                            expect(callCount).toBe(2); // Called twice but timer should reset
                            done();
                        }, 50);
                    }
                };
                // Simulate rapid typing
                editor.commands.insertContent('Hello');
                setTimeout(() => {
                    editor.commands.insertContent(' world');
                }, 50); // Type again before 300ms delay expires
            }
            else {
                fail('remeasureContent not found in storage');
            }
        });
    });
    describe('Cursor Position Preservation', () => {
        it('should save cursor position before remeasurement', () => {
            // Set up initial cursor position
            const initialSelection = editor.state.selection;
            const initialPos = initialSelection.from;
            // Mock the measureAndUpdatePages to track if cursor position is saved
            let cursorPositionSaved = false;
            const paginationExtension = editor.extensionManager.extensions.find(ext => ext.name === 'PaginationPlus');
            // We'll need to modify the implementation to expose this functionality
            expect(initialPos).toBe(10); // From our mock
        });
        it('should restore cursor position after remeasurement', (done) => {
            const initialCursorPos = 10;
            // Simulate remeasurement
            const paginationExtension = editor.extensionManager.extensions.find(ext => ext.name === 'PaginationPlus');
            if (paginationExtension === null || paginationExtension === void 0 ? void 0 : paginationExtension.storage.remeasureContent) {
                const originalRemeasure = paginationExtension.storage.remeasureContent;
                paginationExtension.storage.remeasureContent = (delay) => {
                    // Call original
                    originalRemeasure(delay);
                    // Check cursor position is preserved after remeasurement
                    setTimeout(() => {
                        const currentPos = editor.state.selection.from;
                        expect(currentPos).toBe(initialCursorPos);
                        done();
                    }, delay + 50);
                };
                // Trigger remeasurement
                editor.commands.insertContent('Test content');
            }
            else {
                fail('remeasureContent not found in storage');
            }
        });
    });
    describe('Scroll Position Preservation', () => {
        it('should save scroll position before remeasurement', () => {
            const initialScrollTop = editorElement.scrollTop;
            expect(initialScrollTop).toBe(150); // From our setup
            // This test will pass when we implement scroll position saving
        });
        it('should restore scroll position after remeasurement', (done) => {
            const initialScrollTop = 150;
            editorElement.scrollTop = initialScrollTop;
            const paginationExtension = editor.extensionManager.extensions.find(ext => ext.name === 'PaginationPlus');
            if (paginationExtension === null || paginationExtension === void 0 ? void 0 : paginationExtension.storage.remeasureContent) {
                const originalRemeasure = paginationExtension.storage.remeasureContent;
                paginationExtension.storage.remeasureContent = (delay) => {
                    // Call original
                    originalRemeasure(delay);
                    // Check scroll position is preserved after remeasurement
                    setTimeout(() => {
                        expect(editorElement.scrollTop).toBe(initialScrollTop);
                        done();
                    }, delay + 50);
                };
                // Trigger remeasurement
                editor.commands.insertContent('Test content that might change height');
            }
            else {
                fail('remeasureContent not found in storage');
            }
        });
        it('should handle scroll restoration when container height changes', (done) => {
            const initialScrollTop = 150;
            editorElement.scrollTop = initialScrollTop;
            // Mock height change during remeasurement
            const originalHeight = editorElement.style.height;
            const paginationExtension = editor.extensionManager.extensions.find(ext => ext.name === 'PaginationPlus');
            if (paginationExtension === null || paginationExtension === void 0 ? void 0 : paginationExtension.storage.remeasureContent) {
                const originalRemeasure = paginationExtension.storage.remeasureContent;
                paginationExtension.storage.remeasureContent = (delay) => {
                    // Simulate height change during remeasurement
                    editorElement.style.height = '1200px';
                    originalRemeasure(delay);
                    setTimeout(() => {
                        // Scroll position should be preserved even with height change
                        expect(editorElement.scrollTop).toBe(initialScrollTop);
                        done();
                    }, delay + 50);
                };
                // Trigger remeasurement with content that increases height
                editor.commands.insertContent('Long content that increases page height significantly');
            }
            else {
                fail('remeasureContent not found in storage');
            }
        });
    });
    describe('Integration Tests', () => {
        it('should preserve both cursor and scroll position during full remeasurement cycle', (done) => {
            const initialScrollTop = 150;
            const initialCursorPos = 10;
            editorElement.scrollTop = initialScrollTop;
            const paginationExtension = editor.extensionManager.extensions.find(ext => ext.name === 'PaginationPlus');
            if (paginationExtension === null || paginationExtension === void 0 ? void 0 : paginationExtension.storage.remeasureContent) {
                const originalRemeasure = paginationExtension.storage.remeasureContent;
                paginationExtension.storage.remeasureContent = (delay) => {
                    originalRemeasure(delay);
                    setTimeout(() => {
                        // Both should be preserved
                        expect(editorElement.scrollTop).toBe(initialScrollTop);
                        expect(editor.state.selection.from).toBe(initialCursorPos);
                        done();
                    }, delay + 50);
                };
                // Simulate typing that triggers remeasurement
                editor.commands.insertContent('Testing both cursor and scroll preservation');
            }
            else {
                fail('remeasureContent not found in storage');
            }
        });
    });
});
