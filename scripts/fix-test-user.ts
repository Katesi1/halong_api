import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'owner-test@halong24h.com' } });
  if (!user) {
    console.log('user not found');
    return;
  }
  const existing = await prisma.kycSubmission.findFirst({ where: { userId: user.id } });
  if (existing) {
    console.log(`submission already exists id=${existing.id} status=${existing.status}`);
    return;
  }
  const submission = await prisma.kycSubmission.create({
    data: { userId: user.id, status: 'payment_pending' },
  });
  await prisma.user.update({ where: { id: user.id }, data: { kycSubmissionId: submission.id } });
  console.log('created submission', submission.id);
}
main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
