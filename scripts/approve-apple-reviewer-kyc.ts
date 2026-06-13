/**
 * Set apple-reviewer KYC to approved (user + submission + subscription trial).
 * Idempotent — safe to re-run.
 *
 * Chạy: npx tsx scripts/approve-apple-reviewer-kyc.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EMAIL = 'apple-reviewer@halong24h.com';

async function main() {
  const user = await prisma.user.findFirst({ where: { email: EMAIL } });
  if (!user) {
    console.error(`User not found: ${EMAIL}`);
    process.exit(1);
  }

  const admin = await prisma.user.findFirst({
    where: { role: 0 },
    select: { id: true },
  });

  const trialEndsAt =
    user.trialEndsAt ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  let submission = await prisma.kycSubmission.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  if (!submission) {
    submission = await prisma.kycSubmission.create({
      data: {
        userId: user.id,
        status: 'approved',
        approvedAt: new Date(),
        approvedById: admin?.id ?? null,
        trialEndsAt,
        chargeStartsAt: trialEndsAt,
        expectedRooms: 3,
      },
    });
    console.log('Created KycSubmission:', submission.id);
  } else if (submission.status !== 'approved') {
    submission = await prisma.kycSubmission.update({
      where: { id: submission.id },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approvedById: admin?.id ?? null,
        trialEndsAt,
        chargeStartsAt: trialEndsAt,
      },
    });
    console.log('Updated KycSubmission to approved:', submission.id);
  } else {
    console.log('KycSubmission already approved:', submission.id);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      kycStatus: 'approved',
      kycBypass: true,
      kycSubmissionId: submission.id,
      subscriptionStatus: 'trial',
      subscriptionPlanId: 'rooms_5',
      subscriptionCycle: 'monthly',
      trialEndsAt,
      nextChargeAt: trialEndsAt,
    },
  });

  const existingSubscription = await prisma.subscription.findFirst({
    where: { userId: user.id },
  });
  if (!existingSubscription) {
    await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: 'rooms_5',
        cycle: 'monthly',
        rooms: 3,
        status: 'trial',
        startsAt: new Date(),
        endsAt: trialEndsAt,
      },
    });
    console.log('Created Subscription (trial)');
  }

  const final = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      email: true,
      kycStatus: true,
      kycBypass: true,
      kycSubmissionId: true,
      subscriptionStatus: true,
      trialEndsAt: true,
    },
  });

  console.log('\nApple reviewer KYC approved:');
  console.log(JSON.stringify(final, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
