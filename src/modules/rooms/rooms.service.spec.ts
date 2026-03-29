import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../../config/cloudinary.service';
import { en } from '../../i18n';

const msg = en;

describe('RoomsService', () => {
  let service: RoomsService;
  let prisma: PrismaService;

  const mockRoom = {
    id: 'room-1',
    propertyId: 'hs-1',
    name: 'Room 101',
    code: 'HS-A-101',
    bedrooms: 2,
    maxGuests: 4,
    description: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    property: { ownerId: 'staff-1' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsService,
        {
          provide: PrismaService,
          useValue: {
            room: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            property: {
              findUnique: jest.fn(),
            },
            roomImage: {
              count: jest.fn(),
              create: jest.fn(),
              findFirst: jest.fn(),
              delete: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
            },
            $transaction: jest.fn().mockImplementation((promises) => Promise.all(promises)),
          },
        },
        {
          provide: CloudinaryService,
          useValue: {
            uploadImage: jest.fn().mockResolvedValue({ secure_url: 'https://img.url', public_id: 'pub-1' }),
            deleteImage: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<RoomsService>(RoomsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('create', () => {
    it('should throw ConflictException on duplicate code', async () => {
      (prisma.property.findUnique as jest.Mock).mockResolvedValue({ id: 'hs-1', ownerId: 'staff-1' });
      (prisma.room.findUnique as jest.Mock).mockResolvedValue(mockRoom);

      await expect(
        service.create(
          { propertyId: 'hs-1', name: 'New', code: 'HS-A-101' },
          { id: 'staff-1', role: 'STAFF' as any },
          msg,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ForbiddenException when STAFF adds room to another property', async () => {
      (prisma.property.findUnique as jest.Mock).mockResolvedValue({ id: 'hs-1', ownerId: 'other-staff' });

      await expect(
        service.create(
          { propertyId: 'hs-1', name: 'New', code: 'NEW-01' },
          { id: 'staff-1', role: 'STAFF' as any },
          msg,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('uploadImages', () => {
    it('should throw ConflictException when exceeding max images', async () => {
      (prisma.room.findUnique as jest.Mock).mockResolvedValue(mockRoom);
      (prisma.roomImage.count as jest.Mock).mockResolvedValue(18);

      const files = Array(5).fill({ buffer: Buffer.from(''), mimetype: 'image/jpeg' }) as Express.Multer.File[];

      await expect(
        service.uploadImages('room-1', files, { id: 'staff-1', role: 'STAFF' as any }, msg),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deleteImage', () => {
    it('should promote next image to cover when deleting cover image', async () => {
      (prisma.room.findUnique as jest.Mock).mockResolvedValue(mockRoom);
      (prisma.roomImage.findFirst as jest.Mock)
        .mockResolvedValueOnce({ id: 'img-1', roomId: 'room-1', publicId: 'pub-1', isCover: true })
        .mockResolvedValueOnce({ id: 'img-2', roomId: 'room-1' });
      (prisma.roomImage.delete as jest.Mock).mockResolvedValue({});
      (prisma.roomImage.update as jest.Mock).mockResolvedValue({});

      await service.deleteImage('room-1', 'img-1', { id: 'staff-1', role: 'STAFF' as any }, msg);

      expect(prisma.roomImage.update).toHaveBeenCalledWith({
        where: { id: 'img-2' },
        data: { isCover: true },
      });
    });
  });

  describe('setCoverImage', () => {
    it('should reset all covers and set new one', async () => {
      (prisma.room.findUnique as jest.Mock).mockResolvedValue(mockRoom);
      (prisma.roomImage.updateMany as jest.Mock).mockResolvedValue({ count: 3 });
      (prisma.roomImage.update as jest.Mock).mockResolvedValue({ id: 'img-2', isCover: true });

      await service.setCoverImage('room-1', 'img-2', { id: 'staff-1', role: 'STAFF' as any }, msg);

      expect(prisma.roomImage.updateMany).toHaveBeenCalledWith({
        where: { roomId: 'room-1' },
        data: { isCover: false },
      });
      expect(prisma.roomImage.update).toHaveBeenCalledWith({
        where: { id: 'img-2' },
        data: { isCover: true },
      });
    });
  });
});
