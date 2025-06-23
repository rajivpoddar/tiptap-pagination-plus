import '@testing-library/jest-dom';

// Mock DOM elements and measurements
Object.defineProperty(window, 'getComputedStyle', {
  value: () => ({
    getPropertyValue: () => '',
  }),
});

// Mock requestAnimationFrame
global.requestAnimationFrame = (callback) => setTimeout(callback, 0);

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  callback: ResizeObserverCallback;
  
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  
  observe() {
    // Mock implementation
  }
  
  unobserve() {
    // Mock implementation
  }
  
  disconnect() {
    // Mock implementation
  }
}; 