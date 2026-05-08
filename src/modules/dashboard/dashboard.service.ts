import { Injectable, BadRequestException } from '@nestjs/common';
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

  /**
   * Resolve date range from period + legacy month/year params.
   */
  private resolveDateRange(
    msg: Messages,
    period?: string,
    from?: string,
    to?: string,
    month?: number,
    year?: number,
  ): { from: Date; to: Date } {
    const now = new Date();

    // Legacy support: month/year → treat as period=month
    if (!period && (month || year)) {
      const targetYear = year || now.getFullYear();
      const targetMonth = (month || now.getMonth() + 1) - 1;
      return {
        from: new Date(targetYear, targetMonth, 1),
        to: new Date(targetYear, targetMonth + 1, 1),
      };
    }

    switch (period) {
      case 'today': {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        return { from: start, to: end };
      }
      case 'week': {
        // Monday-based week
        const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 7);
        return { from: monday, to: sunday };
      }
      case 'year': {
        const targetYear = year || now.getFullYear();
        return {
          from: new Date(targetYear, 0, 1),
          to: new Date(targetYear + 1, 0, 1),
        };
      }
      case 'custom': {
        if (!from || !to) {
          throw new BadRequestException(msg.dashboard.missingDateRange);
        }
        const fromDate = new Date(from);
        const toDate = new Date(to);
        toDate.setDate(toDate.getDate() + 1); // inclusive end
        if (fromDate >= toDate) {
          throw new BadRequestException(msg.dashboard.invalidDateRange);
        }
        return { from: fromDate, to: toDate };
      }
      default: {
        // Default: current month (period=month or no period)
        const targetYear = year || now.getFullYear();
        const targetMonth = (month || now.getMonth() + 1) - 1;
        return {
          from: new Date(targetYear, targetMonth, 1),
          to: new Date(targetYear, targetMonth + 1, 1),
        };
      }
    }
  }

  async getReports(
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
    options: {
      period?: string;
      from?: string;
      to?: string;
      month?: number;
      year?: number;
    } = {},
  ) {
    const { from: rangeFrom, to: rangeTo } = this.resolveDateRange(
      msg,
      options.period,
      options.from,
      options.to,
      options.month,
      options.year,
    );

    const scopedPropertyIds = await this.getScopedPropertyIds(user);
    const propertyWhere: any = scopedPropertyIds ? { id: { in: scopedPropertyIds } } : {};
    const bookingWhere: any = scopedPropertyIds ? { propertyId: { in: scopedPropertyIds } } : {};

    // ── Existing fields (backward-compat) ──
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
      where: { ...bookingWhere, createdAt: { gte: rangeFrom, lt: rangeTo } },
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
        createdAt: { gte: rangeFrom, lt: rangeTo },
      },
      _sum: { depositAmount: true },
    });

    // Occupancy rate
    const periodDays = Math.max(1, Math.ceil((rangeTo.getTime() - rangeFrom.getTime()) / (1000 * 60 * 60 * 24)));
    const totalPropertyDays = activeProperties * periodDays;

    const confirmedBookings = await this.prisma.booking.findMany({
      where: {
        ...bookingWhere,
        status: { in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED] },
        checkinDate: { lt: rangeTo },
        checkoutDate: { gt: rangeFrom },
      },
      select: { checkinDate: true, checkoutDate: true, depositAmount: true, propertyId: true },
    });

    let occupiedDays = 0;
    let totalRevenue = 0;
    let totalRoomNights = 0;
    for (const b of confirmedBookings) {
      const start = b.checkinDate > rangeFrom ? b.checkinDate : rangeFrom;
      const end = b.checkoutDate < rangeTo ? b.checkoutDate : rangeTo;
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const clampedDays = Math.max(0, days);
      occupiedDays += clampedDays;
      totalRevenue += b.depositAmount || 0;
      totalRoomNights += Math.max(0, Math.ceil(
        (b.checkoutDate.getTime() - b.checkinDate.getTime()) / (1000 * 60 * 60 * 24),
      ));
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
        property: { select: { id: true, name: true, code: true } },
        sale: { select: { id: true, name: true } },
      },
    });

    // ── NEW: revenue & adr ──
    const adr = totalRoomNights > 0 ? Math.round(totalRevenue / totalRoomNights) : 0;

    // ── NEW: revenueByDay ──
    const revenueByDay = await this.buildRevenueByDay(rangeFrom, rangeTo, bookingWhere, activeProperties);

    // ── NEW: topRooms (top 5 properties by revenue) ──
    const topRooms = await this.buildTopRooms(rangeFrom, rangeTo, propertyWhere, periodDays);

    // ── NEW: previousPeriod ──
    const previousPeriod = await this.buildPreviousPeriod(rangeFrom, rangeTo, bookingWhere, activeProperties);

    // ── NEW: propertyRatings ──
    const propertyRatings = await this.buildPropertyRatings(propertyWhere);

    // ── NEW: ratingSummary — owner-level aggregate across all properties ──
    const ratingSummary = this.buildRatingSummary(propertyRatings);

    // ── NEW: recentReviews ──
    const recentReviews = await this.buildRecentReviews(propertyWhere);

    // ── NEW: lengthOfStay ──
    const lengthOfStay = await this.buildLengthOfStay(rangeFrom, rangeTo, bookingWhere);

    // ── NEW: dayOfWeekOccupancy ──
    const dayOfWeekOccupancy = await this.buildDayOfWeekOccupancy(rangeFrom, rangeTo, bookingWhere, activeProperties);

    const data = {
      // Existing fields
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
      // New fields
      revenue: totalRevenue,
      adr,
      revenueByDay,
      topRooms,
      previousPeriod,
      ratingSummary,
      propertyRatings,
      recentReviews,
      lengthOfStay,
      dayOfWeekOccupancy,
    };

    return { message: msg.dashboard.reportsSuccess, data };
  }

  // ── NEW helper: revenueByDay ──
  private async buildRevenueByDay(
    from: Date, to: Date,
    bookingWhere: any,
    activeProperties: number,
  ) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        ...bookingWhere,
        status: { in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED] },
        checkinDate: { lt: to },
        checkoutDate: { gt: from },
      },
      select: { checkinDate: true, checkoutDate: true, depositAmount: true, id: true },
    });

    const days: { date: string; revenue: number; bookings: number; occupancy: number }[] = [];
    const current = new Date(from);

    while (current < to) {
      const dateStr = current.toISOString().split('T')[0];
      let dayRevenue = 0;
      let dayBookings = 0;

      for (const b of bookings) {
        if (b.checkinDate <= current && b.checkoutDate > current) {
          dayBookings++;
          // Distribute revenue evenly across nights
          const nights = Math.max(1, Math.ceil(
            (b.checkoutDate.getTime() - b.checkinDate.getTime()) / (1000 * 60 * 60 * 24),
          ));
          dayRevenue += Math.round((b.depositAmount || 0) / nights);
        }
      }

      days.push({
        date: dateStr,
        revenue: dayRevenue,
        bookings: dayBookings,
        occupancy: activeProperties > 0 ? Math.round((dayBookings / activeProperties) * 100) / 100 : 0,
      });

      current.setDate(current.getDate() + 1);
    }

    return days;
  }

  // ── NEW helper: topRooms ──
  private async buildTopRooms(
    from: Date, to: Date,
    propertyWhere: any,
    periodDays: number,
  ) {
    const properties = await this.prisma.property.findMany({
      where: { ...propertyWhere, deletedAt: null },
      select: {
        id: true,
        name: true,
        images: {
          where: { isCover: true },
          take: 1,
          select: { imageUrl: true },
        },
        bookings: {
          where: {
            status: { in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED] },
            checkinDate: { lt: to },
            checkoutDate: { gt: from },
          },
          select: { depositAmount: true, checkinDate: true, checkoutDate: true },
        },
      },
    });

    const ranked = properties.map((p) => {
      let revenue = 0;
      let totalNights = 0;
      for (const b of p.bookings) {
        revenue += b.depositAmount || 0;
        const start = b.checkinDate > from ? b.checkinDate : from;
        const end = b.checkoutDate < to ? b.checkoutDate : to;
        totalNights += Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
      }
      return {
        roomId: p.id,
        name: p.name,
        coverImage: p.images[0]?.imageUrl || null,
        revenue,
        bookings: p.bookings.length,
        occupancy: periodDays > 0 ? Math.round((totalNights / periodDays) * 100) / 100 : 0,
      };
    });

    ranked.sort((a, b) => b.revenue - a.revenue);
    return ranked.slice(0, 5);
  }

  // ── NEW helper: previousPeriod ──
  private async buildPreviousPeriod(
    from: Date, to: Date,
    bookingWhere: any,
    activeProperties: number,
  ) {
    const periodMs = to.getTime() - from.getTime();
    const prevTo = new Date(from);
    const prevFrom = new Date(from.getTime() - periodMs);

    const periodDays = Math.max(1, Math.ceil(periodMs / (1000 * 60 * 60 * 24)));
    const totalPropertyDays = activeProperties * periodDays;

    const prevBookings = await this.prisma.booking.findMany({
      where: {
        ...bookingWhere,
        status: { in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED] },
        checkinDate: { lt: prevTo },
        checkoutDate: { gt: prevFrom },
      },
      select: { depositAmount: true, checkinDate: true, checkoutDate: true },
    });

    let prevRevenue = 0;
    let prevOccupiedDays = 0;
    let prevRoomNights = 0;

    for (const b of prevBookings) {
      prevRevenue += b.depositAmount || 0;
      const start = b.checkinDate > prevFrom ? b.checkinDate : prevFrom;
      const end = b.checkoutDate < prevTo ? b.checkoutDate : prevTo;
      prevOccupiedDays += Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
      prevRoomNights += Math.max(0, Math.ceil(
        (b.checkoutDate.getTime() - b.checkinDate.getTime()) / (1000 * 60 * 60 * 24),
      ));
    }

    return {
      revenue: prevRevenue,
      bookings: prevBookings.length,
      occupancy: totalPropertyDays > 0
        ? Math.round((prevOccupiedDays / totalPropertyDays) * 1000) / 10
        : 0,
      adr: prevRoomNights > 0 ? Math.round(prevRevenue / prevRoomNights) : 0,
    };
  }

  // ── NEW helper: propertyRatings ──
  private async buildPropertyRatings(propertyWhere: any) {
    const properties = await this.prisma.property.findMany({
      where: { ...propertyWhere, deletedAt: null },
      select: {
        id: true,
        name: true,
        images: {
          where: { isCover: true },
          take: 1,
          select: { imageUrl: true },
        },
        reviews: {
          where: { isHidden: false },
          select: {
            avgRating: true,
            cleanliness: true,
            location: true,
            amenities: true,
            service: true,
            value: true,
            accuracy: true,
          },
        },
      },
    });

    return properties
      .filter((p) => p.reviews.length > 0)
      .map((p) => {
        const reviews = p.reviews;
        const total = reviews.length;
        const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        let sumAvg = 0, sumC = 0, sumL = 0, sumA = 0, sumS = 0, sumV = 0, sumAc = 0;

        for (const r of reviews) {
          const star = Math.floor(r.avgRating);
          if (star >= 1 && star <= 5) distribution[star as 1 | 2 | 3 | 4 | 5]++;
          sumAvg += r.avgRating;
          sumC += r.cleanliness;
          sumL += r.location;
          sumA += r.amenities;
          sumS += r.service;
          sumV += r.value;
          sumAc += r.accuracy;
        }

        return {
          propertyId: p.id,
          propertyName: p.name,
          coverImage: p.images[0]?.imageUrl || null,
          avgRating: Math.round((sumAvg / total) * 100) / 100,
          totalReviews: total,
          distribution,
          breakdown: {
            cleanliness: Math.round((sumC / total) * 100) / 100,
            location: Math.round((sumL / total) * 100) / 100,
            amenities: Math.round((sumA / total) * 100) / 100,
            service: Math.round((sumS / total) * 100) / 100,
            value: Math.round((sumV / total) * 100) / 100,
            accuracy: Math.round((sumAc / total) * 100) / 100,
          },
        };
      })
      .sort((a, b) => b.avgRating - a.avgRating);
  }

  /**
   * Owner-level aggregate: weighted avg across all properties.
   * Weight = totalReviews per property (property with more reviews has more influence).
   */
  private buildRatingSummary(propertyRatings: any[]) {
    if (propertyRatings.length === 0) {
      return {
        avgRating: 0,
        totalReviews: 0,
        totalProperties: 0,
        distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        breakdown: {
          cleanliness: 0, location: 0, amenities: 0,
          service: 0, value: 0, accuracy: 0,
        },
      };
    }

    let totalReviews = 0;
    let weightedAvg = 0;
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let wC = 0, wL = 0, wA = 0, wS = 0, wV = 0, wAc = 0;

    for (const p of propertyRatings) {
      const w = p.totalReviews;
      totalReviews += w;
      weightedAvg += p.avgRating * w;

      for (const star of [5, 4, 3, 2, 1] as const) {
        distribution[star] += p.distribution[star] || 0;
      }

      wC += p.breakdown.cleanliness * w;
      wL += p.breakdown.location * w;
      wA += p.breakdown.amenities * w;
      wS += p.breakdown.service * w;
      wV += p.breakdown.value * w;
      wAc += p.breakdown.accuracy * w;
    }

    return {
      avgRating: totalReviews > 0 ? Math.round((weightedAvg / totalReviews) * 100) / 100 : 0,
      totalReviews,
      totalProperties: propertyRatings.length,
      distribution,
      breakdown: {
        cleanliness: totalReviews > 0 ? Math.round((wC / totalReviews) * 100) / 100 : 0,
        location: totalReviews > 0 ? Math.round((wL / totalReviews) * 100) / 100 : 0,
        amenities: totalReviews > 0 ? Math.round((wA / totalReviews) * 100) / 100 : 0,
        service: totalReviews > 0 ? Math.round((wS / totalReviews) * 100) / 100 : 0,
        value: totalReviews > 0 ? Math.round((wV / totalReviews) * 100) / 100 : 0,
        accuracy: totalReviews > 0 ? Math.round((wAc / totalReviews) * 100) / 100 : 0,
      },
    };
  }

  // ── NEW helper: recentReviews ──
  private async buildRecentReviews(propertyWhere: any) {
    // Get scoped property IDs
    const effectivePropertyIds = propertyWhere.id?.in;

    const where: any = { isHidden: false };
    if (effectivePropertyIds) {
      where.propertyId = { in: effectivePropertyIds };
    }

    const reviews = await this.prisma.propertyReview.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        propertyId: true,
        avgRating: true,
        comment: true,
        photos: true,
        createdAt: true,
        property: { select: { name: true } },
        customer: { select: { name: true, email: true } },
      },
    });

    return reviews.map((r) => ({
      id: r.id,
      propertyId: r.propertyId,
      propertyName: r.property.name,
      customerName: r.customer.name,
      customerAvatar: null,
      rating: r.avgRating,
      comment: r.comment,
      photos: r.photos || [],
      createdAt: r.createdAt,
    }));
  }

  // ── NEW helper: lengthOfStay ──
  private async buildLengthOfStay(from: Date, to: Date, bookingWhere: any) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        ...bookingWhere,
        status: { in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED] },
        checkinDate: { gte: from, lt: to },
      },
      select: { checkinDate: true, checkoutDate: true },
    });

    let oneNight = 0, twoToThree = 0, fourToSeven = 0, eightPlus = 0;
    for (const b of bookings) {
      const nights = Math.ceil(
        (b.checkoutDate.getTime() - b.checkinDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (nights <= 1) oneNight++;
      else if (nights <= 3) twoToThree++;
      else if (nights <= 7) fourToSeven++;
      else eightPlus++;
    }

    return { oneNight, twoToThree, fourToSeven, eightPlus };
  }

  // ── NEW helper: dayOfWeekOccupancy ──
  private async buildDayOfWeekOccupancy(
    from: Date, to: Date,
    bookingWhere: any,
    activeProperties: number,
  ) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        ...bookingWhere,
        status: { in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED] },
        checkinDate: { lt: to },
        checkoutDate: { gt: from },
      },
      select: { checkinDate: true, checkoutDate: true },
    });

    // Count bookings per day-of-week and total days per day-of-week
    const dowBookings = new Array(7).fill(0);
    const dowDays = new Array(7).fill(0);

    const current = new Date(from);
    while (current < to) {
      // Convert JS day (0=Sun) to ISO day index (0=Mon, 6=Sun)
      const jsDay = current.getDay();
      const isoIndex = jsDay === 0 ? 6 : jsDay - 1;
      dowDays[isoIndex]++;

      for (const b of bookings) {
        if (b.checkinDate <= current && b.checkoutDate > current) {
          dowBookings[isoIndex]++;
        }
      }

      current.setDate(current.getDate() + 1);
    }

    const values = dowDays.map((days, i) => {
      if (days === 0 || activeProperties === 0) return 0;
      return Math.round((dowBookings[i] / (days * activeProperties)) * 100) / 100;
    });

    return { values };
  }
}
