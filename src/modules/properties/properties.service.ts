import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { Messages } from '../../i18n';
import { Role } from '@prisma/client';

@Injectable()
export class PropertiesService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: { id: string; role: Role }, msg: Messages) {
    const where =
      user.role === Role.STAFF
        ? { ownerId: user.id, isActive: true }
        : { isActive: true };

    const properties = await this.prisma.property.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true, phone: true } },
        _count: { select: { rooms: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { message: msg.properties.listSuccess, data: properties };
  }

  async findOne(id: string, user: { id: string; role: Role }, msg: Messages) {
    const property = await this.prisma.property.findUnique({
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

    if (!property || !property.isActive) throw new NotFoundException(msg.properties.notFound);
    this.checkOwnerAccess(property, user, msg);

    return { message: msg.properties.getSuccess, data: property };
  }

  async create(dto: CreatePropertyDto, user: { id: string; role: Role }, msg: Messages) {
    const ownerId = user.role === Role.ADMIN && dto.ownerId ? dto.ownerId : user.id;

    if (user.role === Role.ADMIN && dto.ownerId) {
      const owner = await this.prisma.user.findUnique({ where: { id: dto.ownerId } });
      if (!owner) throw new NotFoundException(msg.properties.ownerNotFound);
    }

    const property = await this.prisma.property.create({
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

    return { message: msg.properties.createSuccess, data: property };
  }

  async update(id: string, dto: UpdatePropertyDto, user: { id: string; role: Role }, msg: Messages) {
    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property || !property.isActive) throw new NotFoundException(msg.properties.notFound);
    this.checkOwnerAccess(property, user, msg);

    const updated = await this.prisma.property.update({
      where: { id },
      data: dto,
    });

    return { message: msg.properties.updateSuccess, data: updated };
  }

  async remove(id: string, user: { id: string; role: Role }, msg: Messages) {
    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property || !property.isActive) throw new NotFoundException(msg.properties.notFound);
    this.checkOwnerAccess(property, user, msg);

    await this.prisma.property.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: msg.properties.deleteSuccess, data: null };
  }

  private checkOwnerAccess(property: any, user: { id: string; role: Role }, msg: Messages) {
    if (user.role === Role.STAFF && property.ownerId !== user.id) {
      throw new ForbiddenException(msg.properties.forbidden);
    }
  }
}
