import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../../config/cloudinary.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { Messages } from '../../i18n';
import { BookingStatus, Role } from '@prisma/client';

@Injectable()
export class RoomsService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  async findPublic(
    msg: Messages,
    checkinDate?: string,
    checkoutDate?: string,
    guests?: number,
    minPrice?: number,
    maxPrice?: number,
  ) {
    const where: any = { isActive: true };

    // Filter by guest capacity
    if (guests) {
      where.maxGuests = { gte: guests };
    }

    // Filter by price range (weekdayPrice)
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.weekdayPrice = { ...where.price.weekdayPrice, gte: minPrice };
      if (maxPrice) where.price.weekdayPrice = { ...where.price.weekdayPrice, lte: maxPrice };
    }

    let rooms = await this.prisma.room.findMany({
      where,
      include: {
        homestay: {
          select: { id: true, name: true, address: true, latitude: true, longitude: true, mapLink: true },
        },
        images: { orderBy: { order: 'asc' } },
        price: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filter by date availability (exclude rooms with conflicting bookings)
    if (checkinDate && checkoutDate) {
      const checkin = new Date(checkinDate);
      const checkout = new Date(checkoutDate);

      const conflictingBookings = await this.prisma.booking.findMany({
        where: {
          status: { in: [BookingStatus.HOLD, BookingStatus.CONFIRMED] },
          checkinDate: { lt: checkout },
          checkoutDate: { gt: checkin },
        },
        select: { roomId: true },
      });

      const bookedRoomIds = new Set(conflictingBookings.map(b => b.roomId));
      rooms = rooms.filter(room => !bookedRoomIds.has(room.id));
    }

    return { message: msg.rooms.publicListSuccess, data: rooms };
  }

  async findAll(user: { id: string; role: Role }, msg: Messages, homestayId?: string) {
    const where: any = { isActive: true };
    if (homestayId) where.homestayId = homestayId;

    if (user.role === Role.STAFF) {
      where.homestay = { ownerId: user.id };
    }

    const rooms = await this.prisma.room.findMany({
      where,
      include: {
        homestay: { select: { id: true, name: true, address: true } },
        images: { orderBy: { order: 'asc' }, take: 1 },
        price: true,
        _count: { select: { bookings: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { message: msg.rooms.listSuccess, data: rooms };
  }

  async findOne(id: string, msg: Messages) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: {
        homestay: {
          select: {
            id: true, name: true, address: true,
            latitude: true, longitude: true, mapLink: true,
            owner: { select: { id: true, name: true, phone: true } },
          },
        },
        images: { orderBy: { order: 'asc' } },
        price: true,
      },
    });

    if (!room || !room.isActive) throw new NotFoundException(msg.rooms.notFound);
    return { message: msg.rooms.getSuccess, data: room };
  }

  async create(dto: CreateRoomDto, user: { id: string; role: Role }, msg: Messages) {
    const homestay = await this.prisma.homestay.findUnique({
      where: { id: dto.homestayId },
    });
    if (!homestay) throw new NotFoundException(msg.homestays.notFound);
    if (user.role === Role.STAFF && homestay.ownerId !== user.id) {
      throw new ForbiddenException(msg.rooms.forbiddenAdd);
    }

    const existing = await this.prisma.room.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException(msg.rooms.codeDuplicate);

    const room = await this.prisma.room.create({
      data: dto,
      include: { homestay: { select: { id: true, name: true } } },
    });

    return { message: msg.rooms.createSuccess, data: room };
  }

  async update(id: string, dto: UpdateRoomDto, user: { id: string; role: Role }, msg: Messages) {
    const room = await this.getRoomWithAccess(id, user, msg);

    if (dto.code && dto.code !== room.code) {
      const existing = await this.prisma.room.findUnique({ where: { code: dto.code } });
      if (existing) throw new ConflictException(msg.rooms.codeDuplicate);
    }

    const updated = await this.prisma.room.update({
      where: { id },
      data: dto,
    });

    return { message: msg.rooms.updateSuccess, data: updated };
  }

  async remove(id: string, user: { id: string; role: Role }, msg: Messages) {
    await this.getRoomWithAccess(id, user, msg);

    await this.prisma.room.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: msg.rooms.deleteSuccess, data: null };
  }

  async uploadImages(
    roomId: string,
    files: Express.Multer.File[],
    user: { id: string; role: Role },
    msg: Messages,
  ) {
    await this.getRoomWithAccess(roomId, user, msg);

    const currentCount = await this.prisma.roomImage.count({ where: { roomId } });
    const maxImages = 20;
    if (currentCount + files.length > maxImages) {
      throw new ConflictException(msg.rooms.maxImages(maxImages));
    }

    const uploadedImages = await Promise.all(
      files.map(async (file, index) => {
        const result = await this.cloudinary.uploadImage(
          file,
          `homestay/rooms/${roomId}`,
        );
        return {
          roomId,
          imageUrl: result.secure_url,
          publicId: result.public_id,
          isCover: currentCount === 0 && index === 0,
          order: currentCount + index,
        };
      }),
    );

    const images = await this.prisma.$transaction(
      uploadedImages.map((img) => this.prisma.roomImage.create({ data: img })),
    );

    return { message: msg.rooms.uploadSuccess(images.length), data: images };
  }

  async deleteImage(roomId: string, imageId: string, user: { id: string; role: Role }, msg: Messages) {
    await this.getRoomWithAccess(roomId, user, msg);

    const image = await this.prisma.roomImage.findFirst({
      where: { id: imageId, roomId },
    });
    if (!image) throw new NotFoundException(msg.rooms.imageNotFound);

    await this.cloudinary.deleteImage(image.publicId);
    await this.prisma.roomImage.delete({ where: { id: imageId } });

    if (image.isCover) {
      const firstImage = await this.prisma.roomImage.findFirst({
        where: { roomId },
        orderBy: { order: 'asc' },
      });
      if (firstImage) {
        await this.prisma.roomImage.update({
          where: { id: firstImage.id },
          data: { isCover: true },
        });
      }
    }

    return { message: msg.rooms.deleteImageSuccess, data: null };
  }

  async setCoverImage(roomId: string, imageId: string, user: { id: string; role: Role }, msg: Messages) {
    await this.getRoomWithAccess(roomId, user, msg);

    await this.prisma.roomImage.updateMany({
      where: { roomId },
      data: { isCover: false },
    });

    const image = await this.prisma.roomImage.update({
      where: { id: imageId },
      data: { isCover: true },
    });

    return { message: msg.rooms.setCoverSuccess, data: image };
  }

  private async getRoomWithAccess(id: string, user: { id: string; role: Role }, msg: Messages) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: { homestay: { select: { ownerId: true } } },
    });
    if (!room || !room.isActive) throw new NotFoundException(msg.rooms.notFound);
    if (user.role === Role.STAFF && room.homestay.ownerId !== user.id) {
      throw new ForbiddenException(msg.rooms.forbidden);
    }
    return room;
  }
}
