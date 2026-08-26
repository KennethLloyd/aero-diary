import { beforeEach, describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { testDb, resetTestDb } from '@/test/test-db';
import { seedDemoData } from '@/lib/demo-seed';

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'demo-password';
const SEED_DATE = new Date('2026-08-21T12:00:00.000Z');

describe('demo seed', () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it('provisions an ordinary user with the complete deterministic dataset', async () => {
    const summary = await seedDemoData(
      testDb,
      { email: DEMO_EMAIL, password: DEMO_PASSWORD },
      SEED_DATE,
    );

    expect(summary).toMatchObject({ entries: 90, activities: 8, photos: 3 });
    const user = await testDb.user.findUnique({ where: { email: DEMO_EMAIL } });
    expect(user).not.toBeNull();
    expect(user?.name).toBe('Aero Diary Demo');
    expect(user && await verifyPassword(DEMO_PASSWORD, user.passwordHash)).toBe(true);

    expect(await testDb.entry.count({ where: { userId: user?.id } })).toBe(90);
    expect(await testDb.activity.count({ where: { userId: user?.id } })).toBe(8);
    expect(await testDb.photo.count({ where: { entry: { userId: user?.id } } })).toBe(3);
    expect(await testDb.entry.count({ where: { userId: user?.id, sourceId: { not: null } } })).toBe(0);
    expect(await testDb.entry.findMany({
      where: { userId: user?.id },
      distinct: ['mood'],
      select: { mood: true },
    })).toHaveLength(5);
  });

  it('reruns safely and leaves a real user and its data untouched', async () => {
    const real = await testDb.user.create({
      data: { email: 'real@example.com', passwordHash: await hashPassword('real-password') },
    });
    const realActivity = await testDb.activity.create({
      data: { userId: real.id, name: 'Private activity', emoji: '🔒' },
    });
    await testDb.entry.create({
      data: {
        userId: real.id,
        journalDate: '2026-08-21',
        mood: 'RAD',
        note: 'Private journal note.',
        activities: { create: [{ activity: { connect: { id: realActivity.id } } }] },
      },
    });

    await seedDemoData(testDb, { email: DEMO_EMAIL, password: DEMO_PASSWORD }, SEED_DATE);
    await seedDemoData(
      testDb,
      { email: DEMO_EMAIL, password: 'new-demo-password' },
      new Date(SEED_DATE.getTime() + 24 * 60 * 60 * 1000),
    );

    const realAfter = await testDb.user.findUnique({
      where: { id: real.id },
      include: { entries: true, activities: true },
    });
    expect(realAfter?.entries).toHaveLength(1);
    expect(realAfter?.entries[0]?.note).toBe('Private journal note.');
    expect(realAfter?.activities).toHaveLength(1);
    expect(realAfter?.activities[0]?.name).toBe('Private activity');
    expect(await testDb.entry.count({ where: { userId: real.id } })).toBe(1);
  });

  it('refuses to seed an existing account that is not the known demo dataset', async () => {
    const real = await testDb.user.create({
      data: {
        email: DEMO_EMAIL,
        passwordHash: await hashPassword('real-password'),
      },
    });
    await testDb.entry.create({
      data: {
        userId: real.id,
        journalDate: '2026-08-21',
        mood: 'GOOD',
        note: 'This must remain private.',
      },
    });

    await expect(
      seedDemoData(testDb, { email: DEMO_EMAIL, password: DEMO_PASSWORD }, SEED_DATE),
    ).rejects.toThrow('Seeding stopped without changing it');

    const unchanged = await testDb.user.findUnique({
      where: { id: real.id },
      include: { entries: true },
    });
    expect(unchanged?.entries).toHaveLength(1);
    expect(unchanged?.entries[0]?.note).toBe('This must remain private.');
    expect(await verifyPassword('real-password', unchanged?.passwordHash ?? '')).toBe(true);
  });
});
