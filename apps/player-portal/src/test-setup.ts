// jsdom doesn't implement ResizeObserver. Provide a no-op stub so
// components that use it (e.g. Character's height-sync effect) don't throw.
global.ResizeObserver = class ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};
