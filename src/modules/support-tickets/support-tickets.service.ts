import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLE } from '../../common/constants';
import type { Messages } from '../../i18n';
import { CreateSupportTicketDto } from './dto/create-ticket.dto';
import { ReplySupportTicketDto } from './dto/reply-ticket.dto';

@Injectable()
export class SupportTicketsService {
  constructor(private prisma: PrismaService) {}

  private genCode(): string {
    const n = Math.floor(100000 + Math.random() * 900000);
    return `HT-${n}`;
  }

  async create(
    userId: string,
    dto: CreateSupportTicketDto,
    msg: Messages,
  ) {
    let code = this.genCode();
    // ensure uniqueness with small retry loop
    for (let i = 0; i < 5; i++) {
      const exists = await this.prisma.supportTicket.findUnique({ where: { code } });
      if (!exists) break;
      code = this.genCode();
    }
    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId,
        code,
        subject: dto.subject.trim(),
        category: dto.category,
        description: dto.description.trim(),
        attachments: (dto.attachments ?? []) as Prisma.InputJsonValue,
      },
    });
    return { message: msg.supportTickets.createSuccess, data: ticket };
  }

  async list(
    caller: { id: string; role: number },
    filters: { status?: string; page?: number; limit?: number },
    msg: Messages,
  ) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.SupportTicketWhereInput = {};
    if (caller.role !== ROLE.ADMIN) where.userId = caller.id;
    if (filters.status) where.status = filters.status;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.supportTicket.count({ where }),
      this.prisma.supportTicket.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      message: msg.supportTickets.listSuccess,
      data: {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(
    id: string,
    caller: { id: string; role: number },
    msg: Messages,
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!ticket) throw new NotFoundException(msg.supportTickets.notFound);
    if (caller.role !== ROLE.ADMIN && ticket.userId !== caller.id) {
      throw new ForbiddenException(msg.supportTickets.forbidden);
    }
    return { message: msg.supportTickets.getSuccess, data: ticket };
  }

  async reply(
    id: string,
    dto: ReplySupportTicketDto,
    caller: { id: string; role: number },
    msg: Messages,
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException(msg.supportTickets.notFound);
    if (caller.role !== ROLE.ADMIN && ticket.userId !== caller.id) {
      throw new ForbiddenException(msg.supportTickets.forbidden);
    }

    const message = await this.prisma.supportTicketMessage.create({
      data: {
        ticketId: id,
        userId: caller.id,
        fromAdmin: caller.role === ROLE.ADMIN,
        message: dto.message.trim(),
        attachments: (dto.attachments ?? []) as Prisma.InputJsonValue,
      },
    });

    // If admin replies on an open ticket, auto-bump status to in_progress
    if (caller.role === ROLE.ADMIN && ticket.status === 'open') {
      await this.prisma.supportTicket.update({
        where: { id },
        data: { status: 'in_progress' },
      });
    }

    return { message: msg.supportTickets.replySuccess, data: message };
  }
}
