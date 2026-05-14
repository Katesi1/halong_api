import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Messages } from '../../i18n';

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  async getPlans(msg: Messages) {
    const plans = await this.prisma.billingPlan.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      message: msg.billing.listSuccess,
      data: plans.map((p) => ({
        id: p.id,
        name: p.name,
        pricePerRoom: p.pricePerRoom,
        minCharge: p.minCharge,
        maxRooms: p.maxRooms,
        yearlyDiscountPct: p.yearlyDiscountPct,
        vatPct: p.vatPct,
        features: p.features,
      })),
    };
  }
}
