import "@testing-library/jest-dom";

// Polyfills for jsdom (required by recharts ResponsiveContainer)
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

// jsdom elements have 0 dimensions by default; give charts a usable size
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function () {
  const rect = originalGetBoundingClientRect.call(this);
  if (rect.width === 0 && rect.height === 0) {
    return { ...rect, width: 500, height: 300 };
  }
  return rect;
};
