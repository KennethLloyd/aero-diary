import type { Prisma, PrismaClient, User } from '@/generated/prisma/client';
import { hashPassword } from '@/lib/auth/password';
import type { CreateUserInput } from '@/lib/auth/schemas';

type UserProvisioningDb = Pick<PrismaClient, 'user'> | Pick<Prisma.TransactionClient, 'user'>

// The only user provisioning seam. Both the manual CLI and the demo seed use
// this upsert so every account is an ordinary User with the same password path.
export async function provisionUser(
  database: UserProvisioningDb,
  input: CreateUserInput,
): Promise<User> {
  const passwordHash = await hashPassword(input.password);
  return database.user.upsert({
    where: { email: input.email },
    update: {
      passwordHash,
      name: input.name ?? undefined,
    },
    create: {
      email: input.email,
      passwordHash,
      name: input.name ?? null,
    },
  });
}
