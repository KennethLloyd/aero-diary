import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// `server-only` throws outside RSC; Vitest doesn't set the react-server export
// condition, so neutralize it (Next's compiler enforces the boundary in-app).
vi.mock('server-only', () => ({}))