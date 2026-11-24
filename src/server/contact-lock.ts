import type { Prisma } from '@prisma/client';

/** Coordinate writes of personal data with the retention transaction. */
export async function lockIdentifiableContact(tx: Prisma.TransactionClient, orgId: string, contactId: string) {
  const [contact] = await tx.$queryRaw<{ isAnonymized: boolean }[]>`
    SELECT "isAnonymized" FROM "Contact"
    WHERE id = ${contactId} AND "orgId" = ${orgId} FOR NO KEY UPDATE
  `;
  return !!contact && !contact.isAnonymized;
}
