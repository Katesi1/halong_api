import type { PrismaService } from '../../../prisma/prisma.service';

/**
 * Generate a sequential invoice number per calendar year: INV-YYYY-NNNN.
 *
 * Note: a small race window exists if two paid sessions are created simultaneously.
 * Acceptable at current scale; switch to a Postgres sequence or `SELECT ... FOR
 * UPDATE` row if collisions appear. Uniqueness is enforced by `@unique` on
 * `invoiceNumber` so a duplicate would just fail the transaction — caller can
 * retry once.
 */
export async function generateInvoiceNumber(
  prisma: PrismaService,
  date: Date = new Date(),
): Promise<string> {
  const year = date.getFullYear();
  const prefix = `INV-${year}-`;
  const count = await prisma.paymentSession.count({
    where: { invoiceNumber: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
}
