import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateHomestayDto } from './dto/create-homestay.dto';
import { UpdateHomestayDto } from './dto/update-homestay.dto';
import { Messages } from '../../i18n';
import { Role } from '@prisma/client';

@Injectable()
export class HomestaysService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: { id: string; role: Role }, msg: Messages) {
    const where =
      user.role === Role.STAFF
        ? { ownerId: user.id, isActive: true }
        : { isActive: true };

    const homestays = await this.prisma.homestay.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true, phone: true } },
        _count: { select: { rooms: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { message: msg.homestays.listSuccess, data: homestays };
  }

  async findOne(id: string, user: { id: string; role: Role }, msg: Messages) {
    const homestay = await this.prisma.homestay.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, phone: true } },
        rooms: {
          where: { isActive: true },
          include: {
            images: { orderBy: { order: 'asc' } },
            price: true,
            _count: { select: { bookings: true } },
          },
        },
      },
    });

    if (!homestay || !homestay.isActive) throw new NotFoundException(msg.homestays.notFound);
    this.checkOwnerAccess(homestay, user, msg);

    return { message: msg.homestays.getSuccess, data: homestay };
  }

  async create(dto: CreateHomestayDto, user: { id: string; role: Role }, msg: Messages) {
    const ownerId = user.role === Role.ADMIN && dto.ownerId ? dto.ownerId : user.id;

    if (user.role === Role.ADMIN && dto.ownerId) {
      const owner = await this.prisma.user.findUnique({ where: { id: dto.ownerId } });
      if (!owner) throw new NotFoundException(msg.homestays.ownerNotFound);
    }

    const homestay = await this.prisma.homestay.create({
      data: {
        name: dto.name,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        mapLink: dto.mapLink,
        ownerId,
      },
      include: {
        owner: { select: { id: true, name: true } },
      },
    });

    return { message: msg.homestays.createSuccess, data: homestay };
  }

  async update(id: string, dto: UpdateHomestayDto, user: { id: string; role: Role }, msg: Messages) {
    const homestay = await this.prisma.homestay.findUnique({ where: { id } });
    if (!homestay || !homestay.isActive) throw new NotFoundException(msg.homestays.notFound);
    this.checkOwnerAccess(homestay, user, msg);

    const updated = await this.prisma.homestay.update({
      where: { id },
      data: dto,
    });

    return { message: msg.homestays.updateSuccess, data: updated };
  }

  async remove(id: string, user: { id: string; role: Role }, msg: Messages) {
    const homestay = await this.prisma.homestay.findUnique({ where: { id } });
    if (!homestay || !homestay.isActive) throw new NotFoundException(msg.homestays.notFound);
    this.checkOwnerAccess(homestay, user, msg);

    await this.prisma.homestay.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: msg.homestays.deleteSuccess, data: null };
  }

  private checkOwnerAccess(homestay: any, user: { id: string; role: Role }, msg: Messages) {
    if (user.role === Role.STAFF && homestay.ownerId !== user.id) {
      throw new ForbiddenException(msg.homestays.forbidden);
    }
  }
}
