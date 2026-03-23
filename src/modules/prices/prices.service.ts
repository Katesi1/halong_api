import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertPriceDto } from './dto/upsert-price.dto';
import { Messages } from '../../i18n';
import { Role } from '@prisma/client';

@Injectable()
export class PricesService {
  constructor(private prisma: PrismaService) {}

  async getPrice(roomId: string, msg: Messages) {
    const price = await this.prisma.roomPrice.findUnique({ where: { roomId } });
    if (!price) throw new NotFoundException(msg.prices.notFound);
    return { message: msg.prices.getSuccess, data: price };
  }

  async upsertPrice(
    roomId: string,
    dto: UpsertPriceDto,
    user: { id: string; role: Role },
    msg: Messages,
  ) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { homestay: { select: { ownerId: true } } },
    });
    if (!room) throw new NotFoundException(msg.rooms.notFound);
    if (user.role === Role.STAFF && room.homestay.ownerId !== user.id) {
      throw new ForbiddenException(msg.prices.forbidden);
    }

    const price = await this.prisma.roomPrice.upsert({
      where: { roomId },
      update: dto,
      create: { roomId, ...dto },
    });

    return { message: msg.prices.upsertSuccess, data: price };
  }

  calculatePriceForDate(price: any, date: Date): number {
    const day = date.getDay();
    if (day === 5) return price.fridayPrice;
    if (day === 6) return price.saturdayPrice;
    return price.weekdayPrice;
  }

  async calculateTotalPrice(roomId: string, checkin: Date, checkout: Date): Promise<number> {
    const price = await this.prisma.roomPrice.findUnique({ where: { roomId } });
    if (!price) return 0;

    let total = 0;
    const current = new Date(checkin);
    while (current < checkout) {
      total += this.calculatePriceForDate(price, current);
      current.setDate(current.getDate() + 1);
    }
    return total;
  }
}
