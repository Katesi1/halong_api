/**
 * One-off script: tạo tài khoản apple-review-delete@halong24h.com để Apple test
 * luồng xoá account. KHÔNG reset bất kỳ dữ liệu nào — chỉ insert (hoặc bỏ qua
 * nếu đã tồn tại / re-activate nếu bị soft-delete).
 *
 * Chạy: npx ts-node -r tsconfig-paths/register prisma/seed-apple-delete.ts
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const ROLE_OWNER = 1;

async function main() {
  const email = 'apple-review-delete@halong24h.com';
  const phone = '0327000004';
  const password = 'Halong24h@2026';

  const existing = await prisma.user.findFirst({ where: { email } });
  const hashed = await bcrypt.hash(password, 10);

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: 'Apple Reviewer Delete',
        phone,
        password: hashed,
        role: ROLE_OWNER,
        emailVerified: true,
        isActive: true,
        deletedAt: null,
      },
    });
    console.log(`♻️  Re-activated existing account: ${email}`);
  } else {
    await prisma.user.create({
      data: {
        name: 'Apple Reviewer Delete',
        email,
        phone,
        password: hashed,
        role: ROLE_OWNER,
        emailVerified: true,
        isActive: true,
      },
    });
    console.log(`✅ Created new account: ${email}`);
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📧 Email:    ${email}`);
  console.log(`📱 Phone:    ${phone}`);
  console.log(`🔑 Password: ${password}`);
  console.log(`👤 Role:     OWNER`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
