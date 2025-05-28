import '@testing-library/jest-dom';
// Mock DOM elements and measurements
Object.defineProperty(window, 'getComputedStyle', {
    value: () => ({
        getPropertyValue: () => '',
    }),
});
// Mock requestAnimationFrame
global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
