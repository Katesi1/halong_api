import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Messages } from '../../i18n';
import { BOOKING_STATUS, getEffectiveOwnerId } from '../../common/constants';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  private async getScopedPropertyIds(user: { id: string; role: number; ownerId?: string | null }): Promise<string[] | null> {
    const effectiveOwnerId = getEffectiveOwnerId(user);
    if (!effectiveOwnerId) return null; // ADMIN sees all

    const properties = await this.prisma.property.findMany({
      where: { ownerId: effectiveOwnerId, deletedAt: null },
      select: { id: true },
    });
    return properties.map((p) => p.id);
  }

  async getStats(user: { id: string; role: number; ownerId?: string | null }, msg: Messages) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const scopedPropertyIds = await this.getScopedPropertyIds(user);
    const propertyWhere: any = scopedPropertyIds ? { id: { in: scopedPropertyIds } } : {};
    const bookingWhere: any = scopedPropertyIds ? { propertyId: { in: scopedPropertyIds } } : {};

    const [totalProperties, activeProperties, globalTotalProperties, globalActiveProperties] = await Promise.all([
      this.prisma.property.count({ where: { ...propertyWhere, deletedAt: null } }),
      this.prisma.property.count({ where: { ...propertyWhere, isActive: true, deletedAt: null } }),
      this.prisma.property.count({ where: { deletedAt: null } }),
      this.prisma.property.count({ where: { isActive: true, deletedAt: null } }),
    ]);

    const [occupiedBookings, globalOccupiedBookings, checkoutTodayBookings] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          ...bookingWhere,
          status: { in: [BOOKING_STATUS.HOLD, BOOKING_STATUS.CONFIRMED] },
          checkinDate: { lte: now },
          checkoutDate: { gt: now },
        },
        select: { propertyId: true },
      }),
      this.prisma.booking.findMany({
        where: {
          status: { in: [BOOKING_STATUS.HOLD, BOOKING_STATUS.CONFIRMED] },
          checkinDate: { lte: now },
          checkoutDate: { gt: now },
        },
        select: { propertyId: true },
      }),
      this.prisma.booking.count({
        where: {
          ...bookingWhere,
          status: BOOKING_STATUS.CONFIRMED,
          checkoutDate: { gte: todayStart, lt: todayEnd },
        },
      }),
    ]);

    const occupiedPropertyIds = new Set(occupiedBookings.map((b) => b.propertyId));
    const occupiedProperties = occupiedPropertyIds.size;
    const emptyProperties = activeProperties - occupiedProperties;

    const globalOccupiedPropertyIds = new Set(globalOccupiedBookings.map((b) => b.propertyId));
    const globalOccupied = globalOccupiedPropertyIds.size;
    const globalEmpty = globalActiveProperties - globalOccupied;

    const [totalBookings, thisMonthBookings] = await Promise.all([
      this.prisma.booking.count({ where: bookingWhere }),
      this.prisma.booking.count({
        where: { ...bookingWhere, createdAt: { gte: monthStart, lt: monthEnd } },
      }),
    ]);

    const [monthlyRevenueResult, todayRevenueResult] = await Promise.all([
      this.prisma.booking.aggregate({
        where: {
          ...bookingWhere,
          status: { in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED] },
          createdAt: { gte: monthStart, lt: monthEnd },
        },
        _sum: { depositAmount: true },
      }),
      this.prisma.booking.aggregate({
        where: {
          ...bookingWhere,
          status: { in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED] },
          createdAt: { gte: todayStart, lt: todayEnd },
        },
        _sum: { depositAmount: true },
      }),
    ]);

    const data = {
      totalRooms: totalProperties,
      activeRooms: activeProperties,
      emptyRooms: Math.max(0, emptyProperties),
      occupiedRooms: occupiedProperties,
      globalTotalRooms: globalTotalProperties,
      globalEmptyRooms: Math.max(0, globalEmpty),
      checkoutToday: checkoutTodayBookings,
      totalBookings,
      thisMonthBookings,
      monthlyRevenue: monthlyRevenueResult._sum.depositAmount || 0,
      todayRevenue: todayRevenueResult._sum.depositAmount || 0,
    };

    return { message: msg.dashboard.statsSuccess, data };
  }

  async getReports(user: { id: string; role: number; ownerId?: string | null }, msg: Messages, month?: number, year?: number) {
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month || now.getMonth() + 1;

    const monthStart = new Date(targetYear, targetMonth - 1, 1);
    const monthEnd = new Date(targetYear, targetMonth, 1);

    const scopedPropertyIds = await this.getScopedPropertyIds(user);
    const propertyWhere: any = scopedPropertyIds ? { id: { in: scopedPropertyIds } } : {};
    const bookingWhere: any = scopedPropertyIds ? { propertyId: { in: scopedPropertyIds } } : {};

    const [totalProperties, activeProperties, roomsWithCover, roomsWithPrice] = await Promise.all([
      this.prisma.property.count({ where: { ...propertyWhere, deletedAt: null } }),
      this.prisma.property.count({ where: { ...propertyWhere, isActive: true, deletedAt: null } }),
      this.prisma.property.count({
        where: {
          ...propertyWhere,
          deletedAt: null,
          images: { some: { isCover: true } },
        },
      }),
      this.prisma.property.count({
        where: {
          ...propertyWhere,
          deletedAt: null,
          weekdayPrice: { not: null },
        },
      }),
    ]);

    const totalBookings = await this.prisma.booking.count({ where: bookingWhere });

    const bookingsByStatus = await this.prisma.booking.groupBy({
      by: ['status'],
      where: { ...bookingWhere, createdAt: { gte: monthStart, lt: monthEnd } },
      _count: { id: true },
    });

    const statusMap: Record<number, number> = {};
    let thisMonthBookings = 0;
    for (const b of bookingsByStatus) {
      statusMap[b.status] = b._count.id;
      thisMonthBookings += b._count.id;
    }

    const depositResult = await this.prisma.booking.aggregate({
      where: {
        ...bookingWhere,
        status: { in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED] },
        createdAt: { gte: monthStart, lt: monthEnd },
      },
      _sum: { depositAmount: true },
    });

    // Occupancy rate
    const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
    const totalPropertyDays = activeProperties * daysInMonth;

    const confirmedBookings = await this.prisma.booking.findMany({
      where: {
        ...bookingWhere,
        status: { in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED] },
        checkinDate: { lt: monthEnd },
        checkoutDate: { gt: monthStart },
      },
      select: { checkinDate: true, checkoutDate: true },
    });

    let occupiedDays = 0;
    for (const b of confirmedBookings) {
      const start = b.checkinDate > monthStart ? b.checkinDate : monthStart;
      const end = b.checkoutDate < monthEnd ? b.checkoutDate : monthEnd;
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      occupiedDays += Math.max(0, days);
    }

    const occupancyRate = totalPropertyDays > 0
      ? Math.round((occupiedDays / totalPropertyDays) * 1000) / 10
      : 0;

    // Recent bookings
    const recentBookings = await this.prisma.booking.findMany({
      where: bookingWhere,
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        property: {
          select: { id: true, name: true, code: true },
        },
        sale: { select: { id: true, name: true } },
      },
    });

    const data = {
      totalRooms: totalProperties,
      activeRooms: activeProperties,
      totalBookings,
      thisMonthBookings,
      holdCount: statusMap[BOOKING_STATUS.HOLD] || 0,
      confirmedCount: statusMap[BOOKING_STATUS.CONFIRMED] || 0,
      cancelledCount: statusMap[BOOKING_STATUS.CANCELLED] || 0,
      completedCount: statusMap[BOOKING_STATUS.COMPLETED] || 0,
      totalDeposit: depositResult._sum.depositAmount || 0,
      occupancyRate,
      roomsWithCover,
      roomsWithPrice,
      recentBookings,
    };

    return { message: msg.dashboard.reportsSuccess, data };
  }
}
