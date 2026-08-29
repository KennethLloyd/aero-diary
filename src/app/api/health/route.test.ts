import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock('@/lib/db', () => ({ db: { $queryRaw: mocks.queryRaw } }));

import { GET } from '@/app/api/health/route';

describe('health route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports healthy when SQLite is reachable', async () => {
    mocks.queryRaw.mockResolvedValue([{ 1: 1 }]);

    const response = await GET(new Request('http://localhost/api/health'));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
  });

  it('reports a generic unhealthy response when SQLite is unavailable', async () => {
    const error = new Error('database path should not be exposed');
    mocks.queryRaw.mockRejectedValue(error);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await GET(new Request('http://localhost/api/health'));

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ status: 'unhealthy' });
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(log).toHaveBeenCalledWith('Health check failed.', error);
  });
});
