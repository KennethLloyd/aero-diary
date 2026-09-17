import { describe, expect, it } from 'vitest';
import { appLockPinSchema, loginSchema } from '@/lib/auth/schemas';

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

describe('App Lock PIN schema', () => {
  it.each(['1234', '123456'])('accepts a %s PIN', (pin) => {
    expect(appLockPinSchema.safeParse(pin).success).toBe(true);
  });

  it.each(['123', '12345', '1234567', '１２３４', '12a4'])('rejects %s', (pin) => {
    expect(appLockPinSchema.safeParse(pin).success).toBe(false);
  });
});
