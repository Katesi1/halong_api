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
        role: true, isActive: true, gender: true, dateOfBirth: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { message: msg.users.listSuccess, data: users };
  }

  async findOne(id: string, msg: Messages) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true, name: true, phone: true, email: true,
        role: true, isActive: true, gender: true, dateOfBirth: true, createdAt: true,
        properties: {
          select: { id: true, name: true, code: true },
          where: { isActive: true, deletedAt: null },
        },
      },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);
    return { message: msg.users.getSuccess, data: user };
  }

  async create(dto: CreateUserDto, msg: Messages) {
    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existing) throw new ConflictException(msg.users.phoneDuplicate);

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: { ...dto, password: hashedPassword },
      select: {
        id: true, name: true, phone: true, email: true, role: true,
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
        id: true, name: true, phone: true, email: true, role: true,
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
}
