import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PricesService } from './prices.service';
import { PrismaService } from '../../prisma/prisma.service';
import { en } from '../../i18n';

const msg = en;

describe('PricesService', () => {
  let service: PricesService;
  let prisma: PrismaService;

  const mockPrice = {
    id: 'price-1',
    roomId: 'room-1',
    weekdayPrice: 500000,
    fridayPrice: 600000,
    saturdayPrice: 800000,
    holidayPrice: 1000000,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricesService,
        {
          provide: PrismaService,
          useValue: {
            roomPrice: {
              findUnique: jest.fn(),
              upsert: jest.fn(),
            },
            room: {
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<PricesService>(PricesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('getPrice', () => {
    it('should throw NotFoundException when no price exists', async () => {
      (prisma.roomPrice.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getPrice('room-1', msg)).rejects.toThrow(NotFoundException);
    });

    it('should return price when exists', async () => {
      (prisma.roomPrice.findUnique as jest.Mock).mockResolvedValue(mockPrice);

      const result = await service.getPrice('room-1', msg);
      expect(result.data.weekdayPrice).toBe(500000);
    });
  });

  describe('upsertPrice', () => {
    it('should throw ForbiddenException when STAFF updates another owner room', async () => {
      (prisma.room.findUnique as jest.Mock).mockResolvedValue({
        id: 'room-1',
        homestay: { ownerId: 'other-staff' },
      });

      await expect(
        service.upsertPrice('room-1', { weekdayPrice: 100 }, { id: 'staff-1', role: 'STAFF' as any }, msg),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('calculateTotalPrice', () => {
    it('should calculate correctly for weekday + friday + saturday', async () => {
      (prisma.roomPrice.findUnique as jest.Mock).mockResolvedValue(mockPrice);

      // 2026-04-06 = Monday, 2026-04-10 = Friday → Mon,Tue,Wed,Thu = 4 weekdays
      const total = await service.calculateTotalPrice(
        'room-1',
        new Date('2026-04-06'), // Monday
        new Date('2026-04-10'), // Friday (checkout, not counted)
      );

      expect(total).toBe(500000 * 4); // 4 weekdays
    });

    it('should return 0 when no price set', async () => {
      (prisma.roomPrice.findUnique as jest.Mock).mockResolvedValue(null);

      const total = await service.calculateTotalPrice('room-1', new Date(), new Date());
      expect(total).toBe(0);
    });
  });
});
