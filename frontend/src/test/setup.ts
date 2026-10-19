import "@testing-library/jest-dom/vitest";
import i18n from "@/i18n";

void i18n.changeLanguage("en");

document.documentElement.classList.add("dark");
document.documentElement.style.colorScheme = "dark";

// Polyfills for jsdom (required by recharts ResponsiveContainer)
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// jsdom has no usable PointerEvent; gesture tests need a constructor that carries pointerId/clientX.
class PointerEventPolyfill extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly isPrimary: boolean;
  constructor(
    type: string,
    init: MouseEventInit & {
      pointerId?: number;
      pointerType?: string;
      isPrimary?: boolean;
    } = {},
  ) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "touch";
    this.isPrimary = init.isPrimary ?? true;
  }
}
Object.defineProperty(window, "PointerEvent", {
  configurable: true,
  writable: true,
  value: PointerEventPolyfill,
});

// jsdom elements have 0 dimensions by default; give charts a usable size
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function () {
  const rect = originalGetBoundingClientRect.call(this);
  if (rect.width === 0 && rect.height === 0) {
    return { ...rect, width: 500, height: 300 };
  }
  return rect;
};
