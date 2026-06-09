import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Messages } from '../../i18n';
import { CreateBillingPlanDto } from './dto/create-billing-plan.dto';
import { UpdateBillingPlanDto } from './dto/update-billing-plan.dto';

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
        rooms: p.maxRooms ?? -1,
        monthlyPrice: p.minCharge,
        yearlyPrice: p.yearlyPrice ?? 0,
        features: p.features,
      })),
    };
  }

  // ─── Admin CRUD ─────────────────────────────────────────────────────────

  async adminList(msg: Messages) {
    const plans = await this.prisma.billingPlan.findMany({
      orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }],
    });
    return { message: msg.billing.adminListSuccess, data: plans };
  }

  async adminCreate(dto: CreateBillingPlanDto, msg: Messages) {
    if (!/^[a-z0-9_]+$/.test(dto.id)) {
      throw new BadRequestException(msg.billing.idInvalid);
    }
    const existing = await this.prisma.billingPlan.findUnique({
      where: { id: dto.id },
    });
    if (existing) {
      throw new ConflictException(msg.billing.idExists);
    }

    const plan = await this.prisma.billingPlan.create({
      data: {
        id: dto.id,
        name: dto.name,
        pricePerRoom: dto.pricePerRoom,
        minCharge: dto.minCharge,
        yearlyPrice: dto.yearlyPrice ?? null,
        maxRooms: dto.maxRooms ?? null,
        yearlyDiscountPct: dto.yearlyDiscountPct ?? 20,
        vatPct: dto.vatPct ?? 10,
        features: dto.features ?? [],
        active: dto.active ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    return { message: msg.billing.createSuccess, data: plan };
  }

  async adminUpdate(id: string, dto: UpdateBillingPlanDto, msg: Messages) {
    const existing = await this.prisma.billingPlan.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(msg.billing.planNotFound);
    }

    const plan = await this.prisma.billingPlan.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.pricePerRoom !== undefined && { pricePerRoom: dto.pricePerRoom }),
        ...(dto.minCharge !== undefined && { minCharge: dto.minCharge }),
        ...(dto.yearlyPrice !== undefined && { yearlyPrice: dto.yearlyPrice }),
        ...(dto.maxRooms !== undefined && { maxRooms: dto.maxRooms }),
        ...(dto.yearlyDiscountPct !== undefined && {
          yearlyDiscountPct: dto.yearlyDiscountPct,
        }),
        ...(dto.vatPct !== undefined && { vatPct: dto.vatPct }),
        ...(dto.features !== undefined && { features: dto.features }),
        ...(dto.active !== undefined && { active: dto.active }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
    return { message: msg.billing.updateSuccess, data: plan };
  }

  /**
   * Hard delete if no subscription/payment references; otherwise soft-delete (active=false).
   * Soft-delete keeps history intact and removes the plan from the public list.
   */
  async adminDelete(id: string, msg: Messages) {
    const existing = await this.prisma.billingPlan.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(msg.billing.planNotFound);
    }

    const [subCount, payCount] = await Promise.all([
      this.prisma.subscription.count({ where: { planId: id } }),
      this.prisma.paymentSession.count({ where: { planId: id } }),
    ]);

    if (subCount > 0 || payCount > 0) {
      const plan = await this.prisma.billingPlan.update({
        where: { id },
        data: { active: false },
      });
      return {
        message: msg.billing.deactivateSuccess,
        data: { ...plan, softDeleted: true, subCount, payCount },
      };
    }

    await this.prisma.billingPlan.delete({ where: { id } });
    return {
      message: msg.billing.deleteSuccess,
      data: { id, softDeleted: false },
    };
  }
}
