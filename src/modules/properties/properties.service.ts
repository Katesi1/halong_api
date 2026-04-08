import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../../config/cloudinary.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { Messages } from '../../i18n';
import { ROLE, STAFF_ROLES, BOOKING_STATUS } from '../../common/constants';

@Injectable()
export class PropertiesService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  async findAll(
    user: { id: string; role: number },
    msg: Messages,
    includeInactive?: boolean,
  ) {
    const where: any =
      (STAFF_ROLES as readonly number[]).includes(user.role)
        ? { ownerId: user.id }
        : {};

    if (!includeInactive) {
      where.isActive = true;
    }

    const properties = await this.prisma.property.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true, phone: true } },
        images: { orderBy: { order: 'asc' } },
        _count: { select: { bookings: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { message: msg.properties.listSuccess, data: properties };
  }

  async findPublic(
    msg: Messages,
    checkinDate?: string,
    checkoutDate?: string,
    guests?: number,
    minPrice?: number,
    maxPrice?: number,
    type?: number,
  ) {
    const where: any = { isActive: true };

    if (type !== undefined) {
      where.type = type;
    }

    if (guests) {
      where.maxGuests = { gte: guests };
    }

    if (minPrice) {
      where.weekdayPrice = { ...where.weekdayPrice, gte: minPrice };
    }
    if (maxPrice) {
      where.weekdayPrice = { ...where.weekdayPrice, lte: maxPrice };
    }

    let properties = await this.prisma.property.findMany({
      where,
      include: {
        images: { orderBy: { order: 'asc' } },
        owner: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filter by date availability
    if (checkinDate && checkoutDate) {
      const checkin = new Date(checkinDate);
      const checkout = new Date(checkoutDate);

      const conflictingBookings = await this.prisma.booking.findMany({
        where: {
          status: { in: [BOOKING_STATUS.HOLD, BOOKING_STATUS.CONFIRMED] },
          checkinDate: { lt: checkout },
          checkoutDate: { gt: checkin },
        },
        select: { propertyId: true },
      });

      const bookedPropertyIds = new Set(conflictingBookings.map(b => b.propertyId));
      properties = properties.filter(p => !bookedPropertyIds.has(p.id));
    }

    return { message: msg.properties.publicListSuccess, data: properties };
  }

  async findOne(id: string, user: { id: string; role: number }, msg: Messages) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, phone: true } },
        images: { orderBy: { order: 'asc' } },
        _count: { select: { bookings: true } },
      },
    });

    if (!property) throw new NotFoundException(msg.properties.notFound);
    this.checkOwnerAccess(property, user, msg);

    return { message: msg.properties.getSuccess, data: property };
  }

  async create(dto: CreatePropertyDto, user: { id: string; role: number }, msg: Messages) {
    const ownerId = user.role === ROLE.ADMIN && dto.ownerId ? dto.ownerId : user.id;

    if (user.role === ROLE.ADMIN && dto.ownerId) {
      const owner = await this.prisma.user.findUnique({ where: { id: dto.ownerId } });
      if (!owner) throw new NotFoundException(msg.properties.ownerNotFound);
    }

    const existing = await this.prisma.property.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException(msg.properties.codeDuplicate);

    const { ownerId: _, ...createData } = dto;
    const property = await this.prisma.property.create({
      data: {
        ...createData,
        ownerId,
      },
      include: {
        owner: { select: { id: true, name: true, phone: true } },
      },
    });

    return { message: msg.properties.createSuccess, data: property };
  }

  async update(id: string, dto: UpdatePropertyDto, user: { id: string; role: number }, msg: Messages) {
    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property) throw new NotFoundException(msg.properties.notFound);
    this.checkOwnerAccess(property, user, msg);

    if (dto.code && dto.code !== property.code) {
      const existing = await this.prisma.property.findUnique({ where: { code: dto.code } });
      if (existing) throw new ConflictException(msg.properties.codeDuplicate);
    }

    const updated = await this.prisma.property.update({
      where: { id },
      data: dto,
      include: {
        owner: { select: { id: true, name: true, phone: true } },
        images: { orderBy: { order: 'asc' } },
        _count: { select: { bookings: true } },
      },
    });

    return { message: msg.properties.updateSuccess, data: updated };
  }

  async remove(id: string, user: { id: string; role: number }, msg: Messages) {
    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property) throw new NotFoundException(msg.properties.notFound);
    this.checkOwnerAccess(property, user, msg);

    await this.prisma.property.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: msg.properties.deleteSuccess, data: null };
  }

  // ─── Prices ───────────────────────────────────────────────────────────────

  async updatePrices(
    id: string,
    dto: { weekdayPrice?: number; weekendPrice?: number; holidayPrice?: number; adultSurcharge?: number; childSurcharge?: number },
    user: { id: string; role: number },
    msg: Messages,
  ) {
    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property) throw new NotFoundException(msg.properties.notFound);
    this.checkOwnerAccess(property, user, msg);

    const updated = await this.prisma.property.update({
      where: { id },
      data: dto,
      select: {
        id: true, name: true, code: true,
        weekdayPrice: true, weekendPrice: true, holidayPrice: true,
        adultSurcharge: true, childSurcharge: true,
      },
    });

    return { message: msg.properties.updatePricesSuccess, data: updated };
  }

  // ─── Image Management ──────────────────────────────────────────────────────

  async uploadImages(
    propertyId: string,
    files: Express.Multer.File[],
    user: { id: string; role: number },
    msg: Messages,
  ) {
    await this.getPropertyWithAccess(propertyId, user, msg);

    const currentCount = await this.prisma.propertyImage.count({ where: { propertyId } });
    const maxImages = 20;
    if (currentCount + files.length > maxImages) {
      throw new ConflictException(msg.properties.maxImages(maxImages));
    }

    const uploadedImages = await Promise.all(
      files.map(async (file, index) => {
        const result = await this.cloudinary.uploadImage(
          file,
          `property/${propertyId}`,
        );
        return {
          propertyId,
          imageUrl: result.secure_url,
          publicId: result.public_id,
          isCover: currentCount === 0 && index === 0,
          order: currentCount + index,
        };
      }),
    );

    const images = await this.prisma.$transaction(
      uploadedImages.map((img) => this.prisma.propertyImage.create({ data: img })),
    );

    return { message: msg.properties.uploadSuccess(images.length), data: images };
  }

  async deleteImage(
    propertyId: string,
    imageId: string,
    user: { id: string; role: number },
    msg: Messages,
  ) {
    await this.getPropertyWithAccess(propertyId, user, msg);

    const image = await this.prisma.propertyImage.findFirst({
      where: { id: imageId, propertyId },
    });
    if (!image) throw new NotFoundException(msg.properties.imageNotFound);

    await this.cloudinary.deleteImage(image.publicId);
    await this.prisma.propertyImage.delete({ where: { id: imageId } });

    if (image.isCover) {
      const firstImage = await this.prisma.propertyImage.findFirst({
        where: { propertyId },
        orderBy: { order: 'asc' },
      });
      if (firstImage) {
        await this.prisma.propertyImage.update({
          where: { id: firstImage.id },
          data: { isCover: true },
        });
      }
    }

    return { message: msg.properties.deleteImageSuccess, data: null };
  }

  async setCoverImage(
    propertyId: string,
    imageId: string,
    user: { id: string; role: number },
    msg: Messages,
  ) {
    await this.getPropertyWithAccess(propertyId, user, msg);

    await this.prisma.propertyImage.updateMany({
      where: { propertyId },
      data: { isCover: false },
    });

    const image = await this.prisma.propertyImage.update({
      where: { id: imageId },
      data: { isCover: true },
    });

    return { message: msg.properties.setCoverSuccess, data: image };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async getPropertyWithAccess(
    id: string,
    user: { id: string; role: number },
    msg: Messages,
  ) {
    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property) throw new NotFoundException(msg.properties.notFound);
    this.checkOwnerAccess(property, user, msg);
    return property;
  }

  private checkOwnerAccess(property: any, user: { id: string; role: number }, msg: Messages) {
    if ((STAFF_ROLES as readonly number[]).includes(user.role) && property.ownerId !== user.id) {
      throw new ForbiddenException(msg.properties.forbidden);
    }
  }
}
