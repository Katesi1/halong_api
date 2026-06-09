/**
 * Tạo 1 tài khoản OWNER cho người kiểm duyệt Apple — KHÔNG cần KYC.
 *
 * Idempotent: chạy lại sẽ update kycBypass + reset password thay vì lỗi.
 * KHÔNG reset DB, KHÔNG đụng dữ liệu hiện có.
 *
 * Chạy:  npx ts-node scripts/add-apple-reviewer.ts
 *        hoặc: npx tsx scripts/add-apple-reviewer.ts
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const EMAIL = 'apple-reviewer@halong24h.com';
const PHONE = '0327000099';
const PASSWORD = 'Halong24h@2026';
const NAME = 'Apple Reviewer (No KYC)';
const ROLE_OWNER = 1; // 0=ADMIN, 1=OWNER, 2=SALE, 3=CUSTOMER

async function main() {
  const hashed = await bcrypt.hash(PASSWORD, 10);
  const trialEndsAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {
      password: hashed,
      role: ROLE_OWNER,
      kycBypass: true,
      kycStatus: 'approved',
      emailVerified: true,
      isActive: true,
      subscriptionStatus: 'trial',
      subscriptionPlanId: 'rooms_5',
      subscriptionCycle: 'monthly',
      trialEndsAt,
      nextChargeAt: trialEndsAt,
    },
    create: {
      name: NAME,
      email: EMAIL,
      phone: PHONE,
      password: hashed,
      role: ROLE_OWNER,
      emailVerified: true,
      isActive: true,
      kycBypass: true,
      kycStatus: 'approved',
      subscriptionStatus: 'trial',
      subscriptionPlanId: 'rooms_5',
      subscriptionCycle: 'monthly',
      trialEndsAt,
      nextChargeAt: trialEndsAt,
    },
  });

  console.log('Apple reviewer account ready:');
  console.log(`  id        : ${user.id}`);
  console.log(`  email     : ${EMAIL}`);
  console.log(`  phone     : ${PHONE}`);
  console.log(`  password  : ${PASSWORD}`);
  console.log(`  role      : OWNER`);
  console.log(`  kycBypass : true (không cần KYC)`);
  console.log(`  trial đến : ${trialEndsAt.toISOString()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
