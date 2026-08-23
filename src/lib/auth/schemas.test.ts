import { describe, expect, it } from 'vitest';
import { loginSchema } from '@/lib/auth/schemas';

describe('login schema', () => {
  it('accepts a valid email and password', () => {
    const result = loginSchema.safeParse({
      email: 'TestUser@Example.com',
      password: 'hunter2',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Normalized: trimmed + lowercased.
      expect(result.data.email).toBe('testuser@example.com');
      expect(result.data.password).toBe('hunter2');
    }
  });

  it('rejects a malformed email', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'hunter2',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty password', () => {
    const result = loginSchema.safeParse({
      email: 'ken@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing password', () => {
    const result = loginSchema.safeParse({ email: 'ken@example.com' });
    expect(result.success).toBe(false);
  });

  it('rejects an over-long password', () => {
    const result = loginSchema.safeParse({
      email: 'ken@example.com',
      password: 'x'.repeat(257),
    });
    expect(result.success).toBe(false);
  });

});
