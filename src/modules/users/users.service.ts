import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Messages } from '../../i18n';
import { ROLE } from '../../common/constants';
import * as bcrypt from 'bcryptjs';

// Fields non-admin users can update on their own profile
const SELF_EDITABLE_FIELDS = ['name', 'phone', 'email', 'gender', 'dateOfBirth'];

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(msg: Messages, role?: number) {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, ...(role !== undefined ? { role } : {}) },
      select: {
        id: true, name: true, phone: true, email: true,
        role: true, ownerId: true, isActive: true, gender: true, dateOfBirth: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { message: msg.users.listSuccess, data: users };
  }

  async findOne(id: string, currentUser: { id: string; role: number }, msg: Messages) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true, name: true, phone: true, email: true,
        role: true, ownerId: true, isActive: true, gender: true, dateOfBirth: true, createdAt: true,
        properties: {
          select: { id: true, name: true, code: true },
          where: { isActive: true, deletedAt: null },
        },
        staffMembers: {
          select: { id: true, name: true, phone: true, role: true, isActive: true },
          where: { deletedAt: null },
        },
      },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);

    // OWNER can only view their own SALE staff
    if (currentUser.role === ROLE.OWNER && user.ownerId !== currentUser.id) {
      throw new ForbiddenException(msg.common.forbidden);
    }

    return { message: msg.users.getSuccess, data: user };
  }

  async create(dto: CreateUserDto, msg: Messages) {
    dto.email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException(msg.users.emailDuplicate);

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: { ...dto, password: hashedPassword },
      select: {
        id: true, name: true, phone: true, email: true, role: true, ownerId: true,
        gender: true, dateOfBirth: true, createdAt: true,
      },
    });

    return { message: msg.users.createSuccess, data: user };
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    currentUser: { id: string; role: number },
    msg: Messages,
  ) {
    // Non-admin can only edit themselves
    if (currentUser.role !== ROLE.ADMIN && currentUser.id !== id) {
      throw new ForbiddenException(msg.common.forbidden);
    }

    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException(msg.users.notFound);

    // Non-admin: strip privileged fields (role, isActive, password)
    let filteredDto = dto;
    if (currentUser.role !== ROLE.ADMIN) {
      filteredDto = {} as UpdateUserDto;
      for (const field of SELF_EDITABLE_FIELDS) {
        if ((dto as any)[field] !== undefined) {
          (filteredDto as any)[field] = (dto as any)[field];
        }
      }
    }

    if (filteredDto.phone && filteredDto.phone !== user.phone) {
      const existing = await this.prisma.user.findUnique({ where: { phone: filteredDto.phone } });
      if (existing) throw new ConflictException(msg.users.phoneDuplicate);
    }

    const { password, dateOfBirth, ...rest } = filteredDto;
    const data: any = {
      ...rest,
      ...(password ? { password: await bcrypt.hash(password, 10) } : {}),
      ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}),
    };

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true, name: true, phone: true, email: true, role: true, ownerId: true,
        isActive: true, gender: true, dateOfBirth: true, updatedAt: true,
      },
    });

    return { message: msg.users.updateSuccess, data: updated };
  }

  async remove(id: string, currentUserId: string, msg: Messages) {
    if (id === currentUserId) {
      throw new BadRequestException(msg.users.cannotDeleteSelf);
    }
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException(msg.users.notFound);

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { message: msg.users.disableSuccess, data: null };
  }

  // ─── Staff Management (OWNER only) ─────────────────────────────────────────

  async getAvailableStaff(msg: Messages) {
    const staff = await this.prisma.user.findMany({
      where: { role: ROLE.SALE, ownerId: null, isActive: true, deletedAt: null },
      select: {
        id: true, name: true, phone: true, email: true,
        role: true, ownerId: true, isActive: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { message: msg.users.staffListSuccess, data: staff };
  }

  async getMyStaff(ownerId: string, msg: Messages) {
    const staff = await this.prisma.user.findMany({
      where: { ownerId, role: ROLE.SALE, deletedAt: null },
      select: {
        id: true, name: true, phone: true, email: true,
        role: true, isActive: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { message: msg.users.staffListSuccess, data: staff };
  }

  async addMyStaff(ownerId: string, saleEmail: string, msg: Messages) {
    const sale = await this.prisma.user.findFirst({
      where: { email: saleEmail.toLowerCase().trim(), deletedAt: null },
    });
    if (!sale) throw new NotFoundException(msg.users.staffUserNotFound);

    if (sale.role !== ROLE.SALE) {
      throw new BadRequestException(msg.users.staffOnlySaleRole);
    }

    if (sale.ownerId) {
      throw new ConflictException(msg.users.staffAlreadyAssigned);
    }

    const updated = await this.prisma.user.update({
      where: { id: sale.id },
      data: { ownerId },
      select: {
        id: true, name: true, phone: true, email: true,
        role: true, ownerId: true, isActive: true, createdAt: true,
      },
    });

    return { message: msg.users.staffAddSuccess, data: updated };
  }

  async removeMyStaff(ownerId: string, staffId: string, msg: Messages) {
    const staff = await this.prisma.user.findFirst({
      where: { id: staffId, ownerId, role: ROLE.SALE, deletedAt: null },
    });
    if (!staff) throw new NotFoundException(msg.users.staffNotFound);

    await this.prisma.user.update({
      where: { id: staffId },
      data: { ownerId: null },
    });

    return { message: msg.users.staffRemoveSuccess, data: null };
  }
}
