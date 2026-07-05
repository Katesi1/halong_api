import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { en } from '../../i18n';
import { ROLE } from '../../common/constants';

const msg = en;

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  const mockUser = {
    id: 'user-1',
    name: 'Test',
    phone: '0900000001',
    email: null,
    password: '$2a$10$hashedpassword',
    role: ROLE.SALE,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            create: jest.fn().mockResolvedValue(undefined),
            notifyUser: jest.fn().mockResolvedValue(undefined),
            notifyAdmins: jest.fn().mockResolvedValue(undefined),
            notifyPropertyOwner: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendStaffInvite: jest.fn().mockResolvedValue(undefined),
            sendPasswordReset: jest.fn().mockResolvedValue(undefined),
            sendAccountDeletionScheduled: jest.fn().mockResolvedValue(undefined),
            sendAccountDeletionRestored: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('findAll', () => {
    it('should return user list without password', async () => {
      const users = [{ id: 'u1', name: 'A', phone: '09001', email: null, role: ROLE.SALE, isActive: true, createdAt: new Date() }];
      (prisma.user.findMany as jest.Mock).mockResolvedValue(users);

      const result = await service.findAll(msg);

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as any).password).toBeUndefined();
    });
  });

  describe('create', () => {
    it('should throw ConflictException on duplicate email', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(
        service.create({ name: 'New', email: 'test@example.com', password: 'Test@123', role: ROLE.SALE }, undefined as any, msg),
      ).rejects.toThrow(ConflictException);
    });

    it('should hash password on create', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockImplementation(({ data }) => {
        expect(data.password).not.toBe('Test@123');
        expect(data.password).toMatch(/^\$2[aby]\$/);
        return Promise.resolve({ id: 'new-id', ...data });
      });

      await service.create({ name: 'New', email: 'new@example.com', password: 'Test@123', role: ROLE.SALE }, undefined as any, msg);

      expect(prisma.user.create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should throw NotFoundException when user not found', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update('bad-id', { name: 'X' }, { id: 'admin-1', role: ROLE.ADMIN }, msg),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update user fields correctly (admin)', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue({ ...mockUser, name: 'Updated' });

      const result = await service.update('user-1', { name: 'Updated' }, { id: 'admin-1', role: ROLE.ADMIN }, msg);

      expect(result.data.name).toBe('Updated');
    });

    it('should throw ForbiddenException when non-admin edits another user', async () => {
      await expect(
        service.update('other-user', { name: 'X' }, { id: 'user-1', role: ROLE.CUSTOMER }, msg),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should strip privileged fields for non-admin self-edit', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue({ ...mockUser, name: 'NewName' });

      await service.update('user-1', { name: 'NewName', role: ROLE.ADMIN, isActive: false }, { id: 'user-1', role: ROLE.SALE }, msg);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ role: ROLE.ADMIN, isActive: false }),
        }),
      );
    });

    it('should strip bank fields via PUT /users/:id — bank now needs admin approval', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({ ...mockUser, role: ROLE.OWNER });
      (prisma.user.update as jest.Mock).mockResolvedValue({ ...mockUser });

      await service.update(
        'user-1',
        { name: 'X', bankBin: '970436', bankAccountNumber: '0123456789' } as any,
        { id: 'user-1', role: ROLE.OWNER },
        msg,
      );

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ bankBin: '970436', bankAccountNumber: '0123456789' }),
        }),
      );
    });
  });

  describe('bank moderation', () => {
    it('submitBankChange sets pending (not live) + status=pending for OWNER', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'owner-1', role: ROLE.OWNER, name: 'Owner' });
      (prisma.user.update as jest.Mock).mockImplementation(({ data }) => {
        // ghi pending, KHÔNG đụng bank* live
        expect(data.bankStatus).toBe('pending');
        expect(data.pendingBankAccountNumber).toBe('0123456789');
        expect(data.bankBin).toBeUndefined();
        expect(data.bankAccountNumber).toBeUndefined();
        return Promise.resolve({
          bankBin: null, bankName: null, bankAccountNumber: null, bankAccountName: null,
          bankStatus: 'pending', bankSubmittedAt: new Date(), bankReviewedAt: null, bankRejectReason: null,
          pendingBankBin: '970436', pendingBankName: 'VCB',
          pendingBankAccountNumber: '0123456789', pendingBankAccountName: 'NGUYEN VAN A',
        });
      });

      const res = await service.submitBankChange(
        'owner-1',
        { bankBin: '970436', bankName: 'VCB', bankAccountNumber: '0123456789', bankAccountName: 'NGUYEN VAN A' },
        msg,
      );
      expect(res.data.status).toBe('pending');
      expect(res.data.pending?.bankAccountNumber).toBe('0123456789');
      expect(res.data.current.bankAccountNumber).toBeNull();
    });

    it('submitBankChange rejects non-OWNER with 403', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'c-1', role: ROLE.CUSTOMER, name: 'Cust' });
      await expect(
        service.submitBankChange(
          'c-1',
          { bankBin: '970436', bankAccountNumber: '0123456789', bankAccountName: 'X' },
          msg,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('adminApproveBank copies pending → live and clears pending', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({
        id: 'owner-1', email: 'o@x.com', bankStatus: 'pending',
        pendingBankBin: '970436', pendingBankName: 'VCB',
        pendingBankAccountNumber: '0123456789', pendingBankAccountName: 'NGUYEN VAN A',
      });
      (prisma.user.update as jest.Mock).mockImplementation(({ data }) => {
        expect(data.bankBin).toBe('970436');
        expect(data.bankAccountNumber).toBe('0123456789');
        expect(data.bankStatus).toBe('approved');
        expect(data.pendingBankBin).toBeNull();
        return Promise.resolve({
          bankBin: '970436', bankName: 'VCB', bankAccountNumber: '0123456789', bankAccountName: 'NGUYEN VAN A',
          bankStatus: 'approved', bankSubmittedAt: new Date(), bankReviewedAt: new Date(), bankRejectReason: null,
          pendingBankBin: null, pendingBankName: null, pendingBankAccountNumber: null, pendingBankAccountName: null,
        });
      });
      const res = await service.adminApproveBank('admin-1', 'owner-1', msg);
      expect(res.data.status).toBe('approved');
      expect(res.data.current.bankAccountNumber).toBe('0123456789');
    });

    it('adminApproveBank throws 400 when no pending request', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'owner-1', email: 'o@x.com', bankStatus: 'approved' });
      await expect(service.adminApproveBank('admin-1', 'owner-1', msg)).rejects.toThrow(BadRequestException);
    });

    it('adminRejectBank keeps live bank, stores reason, status=rejected', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'owner-1', email: 'o@x.com', bankStatus: 'pending' });
      (prisma.user.update as jest.Mock).mockImplementation(({ data }) => {
        expect(data.bankStatus).toBe('rejected');
        expect(data.bankRejectReason).toBe('Sai thong tin');
        expect(data.pendingBankBin).toBeNull();
        expect(data.bankBin).toBeUndefined(); // live không bị đụng
        return Promise.resolve({
          bankBin: '970436', bankName: 'VCB', bankAccountNumber: '0123456789', bankAccountName: 'NGUYEN VAN A',
          bankStatus: 'rejected', bankSubmittedAt: new Date(), bankReviewedAt: new Date(), bankRejectReason: 'Sai thong tin',
          pendingBankBin: null, pendingBankName: null, pendingBankAccountNumber: null, pendingBankAccountName: null,
        });
      });
      const res = await service.adminRejectBank('admin-1', 'owner-1', 'Sai thong tin', msg);
      expect(res.data.status).toBe('rejected');
      expect(res.data.rejectReason).toBe('Sai thong tin');
      expect(res.data.current.bankAccountNumber).toBe('0123456789');
    });
  });

  describe('remove', () => {
    it('should throw BadRequestException when deleting self', async () => {
      await expect(
        service.remove('user-1', 'user-1', msg),
      ).rejects.toThrow(BadRequestException);
    });

    it('should soft delete (set deletedAt)', async () => {
      (prisma.user.findFirst as jest.Mock).mockResolvedValue(mockUser);
      (prisma.user.update as jest.Mock).mockResolvedValue({ ...mockUser, deletedAt: new Date() });

      await service.remove('user-1', 'admin-id', msg);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
