import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'owner-test@halong24h.com' } });
  if (!user) return console.log('user not found');

  // Set user → past_due (như đã hết trial)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: 'past_due',
      subscriptionProvider: null,
      trialEndsAt: new Date('2026-06-01T00:00:00Z'), // trial đã kết thúc
      nextChargeAt: new Date('2026-06-01T00:00:00Z'),
    },
  });

  // Set Subscription row hiện tại → past_due
  await prisma.subscription.updateMany({
    where: { userId: user.id },
    data: {
      status: 'past_due',
      endsAt: new Date('2026-06-01T00:00:00Z'),
    },
  });

  console.log('User set to past_due. Ready to test /payments/renew');
}
main().catch(console.error).finally(() => prisma.$disconnect());
