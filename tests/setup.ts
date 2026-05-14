import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

Object.defineProperty(globalThis.navigator, 'serviceWorker', {
  configurable: true,
  writable: true,
  value: {
    register: vi.fn().mockResolvedValue({
      addEventListener: vi.fn(),
      installing: null,
      waiting: null,
      active: null,
    }),
    addEventListener: vi.fn(),
    ready: Promise.resolve({}),
  },
});

Object.defineProperty(globalThis.navigator, 'onLine', {
  configurable: true,
  writable: true,
  value: true,
});
