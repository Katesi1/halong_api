import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Messages } from '../../i18n';
import { BookingStatus, Role } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  // Helper: lấy danh sách roomIds mà user có quyền xem
  private async getScopedRoomIds(user: { id: string; role: Role }): Promise<string[] | null> {
    // ADMIN thấy tất cả → return null (no filter)
    if (user.role === Role.ADMIN) return null;

    // STAFF chỉ thấy rooms thuộc property của mình
    const rooms = await this.prisma.room.findMany({
      where: { property: { ownerId: user.id } },
      select: { id: true },
    });
    return rooms.map((r) => r.id);
  }

  async getStats(user: { id: string; role: Role }, msg: Messages) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const scopedRoomIds = await this.getScopedRoomIds(user);
    const roomWhere: any = scopedRoomIds ? { id: { in: scopedRoomIds } } : {};
    const bookingWhere: any = scopedRoomIds ? { roomId: { in: scopedRoomIds } } : {};

    // Room counts
    const [totalRooms, activeRooms] = await Promise.all([
      this.prisma.room.count({ where: roomWhere }),
      this.prisma.room.count({ where: { ...roomWhere, isActive: true } }),
    ]);

    // Today's bookings: occupied and checkout
    const [occupiedBookings, checkoutTodayBookings] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          ...bookingWhere,
          status: { in: [BookingStatus.HOLD, BookingStatus.CONFIRMED] },
          checkinDate: { lte: now },
          checkoutDate: { gt: now },
        },
        select: { roomId: true },
      }),
      this.prisma.booking.count({
        where: {
          ...bookingWhere,
          status: BookingStatus.CONFIRMED,
          checkoutDate: { gte: todayStart, lt: todayEnd },
        },
      }),
    ]);

    const occupiedRoomIds = new Set(occupiedBookings.map((b) => b.roomId));
    const occupiedRooms = occupiedRoomIds.size;
    const emptyRooms = activeRooms - occupiedRooms;

    // Booking counts
    const [totalBookings, thisMonthBookings] = await Promise.all([
      this.prisma.booking.count({ where: bookingWhere }),
      this.prisma.booking.count({
        where: { ...bookingWhere, createdAt: { gte: monthStart, lt: monthEnd } },
      }),
    ]);

    // Revenue (deposit sums)
    const [monthlyRevenueResult, todayRevenueResult] = await Promise.all([
      this.prisma.booking.aggregate({
        where: {
          ...bookingWhere,
          status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] },
          createdAt: { gte: monthStart, lt: monthEnd },
        },
        _sum: { depositAmount: true },
      }),
      this.prisma.booking.aggregate({
        where: {
          ...bookingWhere,
          status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] },
          createdAt: { gte: todayStart, lt: todayEnd },
        },
        _sum: { depositAmount: true },
      }),
    ]);

    const data = {
      totalRooms,
      activeRooms,
      emptyRooms: Math.max(0, emptyRooms),
      occupiedRooms,
      checkoutToday: checkoutTodayBookings,
      totalBookings,
      thisMonthBookings,
      monthlyRevenue: monthlyRevenueResult._sum.depositAmount || 0,
      todayRevenue: todayRevenueResult._sum.depositAmount || 0,
    };

    return { message: msg.dashboard.statsSuccess, data };
  }

  async getReports(user: { id: string; role: Role }, msg: Messages, month?: number, year?: number) {
    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month || now.getMonth() + 1;

    const monthStart = new Date(targetYear, targetMonth - 1, 1);
    const monthEnd = new Date(targetYear, targetMonth, 1);

    const scopedRoomIds = await this.getScopedRoomIds(user);
    const roomWhere: any = scopedRoomIds ? { id: { in: scopedRoomIds } } : {};
    const bookingWhere: any = scopedRoomIds ? { roomId: { in: scopedRoomIds } } : {};

    // Room counts
    const [totalRooms, activeRooms] = await Promise.all([
      this.prisma.room.count({ where: roomWhere }),
      this.prisma.room.count({ where: { ...roomWhere, isActive: true } }),
    ]);

    // Booking counts
    const totalBookings = await this.prisma.booking.count({ where: bookingWhere });

    const bookingsByStatus = await this.prisma.booking.groupBy({
      by: ['status'],
      where: { ...bookingWhere, createdAt: { gte: monthStart, lt: monthEnd } },
      _count: { id: true },
    });

    const statusMap: Record<string, number> = {};
    let thisMonthBookings = 0;
    for (const b of bookingsByStatus) {
      statusMap[b.status] = b._count.id;
      thisMonthBookings += b._count.id;
    }

    // Total deposit for the month
    const depositResult = await this.prisma.booking.aggregate({
      where: {
        ...bookingWhere,
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] },
        createdAt: { gte: monthStart, lt: monthEnd },
      },
      _sum: { depositAmount: true },
    });

    // Occupancy rate: (occupied room-days / total room-days) * 100
    const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
    const totalRoomDays = activeRooms * daysInMonth;

    const confirmedBookings = await this.prisma.booking.findMany({
      where: {
        ...bookingWhere,
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.COMPLETED] },
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

    const occupancyRate = totalRoomDays > 0
      ? Math.round((occupiedDays / totalRoomDays) * 1000) / 10
      : 0;

    // Rooms with cover image and price
    const [roomsWithCover, roomsWithPrice] = await Promise.all([
      this.prisma.room.count({
        where: { ...roomWhere, isActive: true, images: { some: { isCover: true } } },
      }),
      this.prisma.room.count({
        where: { ...roomWhere, isActive: true, price: { isNot: null } },
      }),
    ]);

    // Recent bookings
    const recentBookings = await this.prisma.booking.findMany({
      where: bookingWhere,
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        room: {
          select: {
            id: true, name: true, code: true,
            property: { select: { name: true } },
          },
        },
        sale: { select: { id: true, name: true } },
      },
    });

    const data = {
      totalRooms,
      activeRooms,
      totalBookings,
      thisMonthBookings,
      holdCount: statusMap[BookingStatus.HOLD] || 0,
      confirmedCount: statusMap[BookingStatus.CONFIRMED] || 0,
      cancelledCount: statusMap[BookingStatus.CANCELLED] || 0,
      completedCount: statusMap[BookingStatus.COMPLETED] || 0,
      totalDeposit: depositResult._sum.depositAmount || 0,
      occupancyRate,
      roomsWithCover,
      roomsWithPrice,
      recentBookings,
    };

    return { message: msg.dashboard.reportsSuccess, data };
  }
}
