import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ROLE,
  LEAD_STATUS,
  LEAD_SOURCE,
  NOTIFICATION_TYPE,
} from '../../common/constants';
import type { Messages } from '../../i18n';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /** Public form submit — không cần auth */
  async create(dto: CreateLeadDto, msg: Messages) {
    let ownerId: string | null = null;
    if (dto.propertyId) {
      const property = await this.prisma.property.findUnique({
        where: { id: dto.propertyId },
        select: { id: true, ownerId: true, name: true, isActive: true, deletedAt: true },
      });
      if (!property || property.deletedAt) {
        throw new NotFoundException(msg.leads.propertyNotFound);
      }
      ownerId = property.ownerId;
    }

    if (dto.checkIn && dto.checkOut) {
      const ci = new Date(dto.checkIn);
      const co = new Date(dto.checkOut);
      if (co <= ci) throw new BadRequestException(msg.leads.invalidDates);
    }

    // Dedup: cùng phone + propertyId (hoặc cả 2 null) trong 1 giờ → trả lead cũ.
    // Tránh spam form bằng cách F5 hoặc network retry.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await this.prisma.lead.findFirst({
      where: {
        guestPhone: dto.guestPhone.trim(),
        propertyId: dto.propertyId ?? null,
        createdAt: { gte: oneHourAgo },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recent) {
      return { message: msg.leads.createSuccess, data: recent };
    }

    const lead = await this.prisma.lead.create({
      data: {
        propertyId: dto.propertyId ?? null,
        ownerId,
        guestName: dto.guestName.trim(),
        guestPhone: dto.guestPhone.trim(),
        guestEmail: dto.guestEmail?.trim() ?? null,
        checkIn: dto.checkIn ? new Date(dto.checkIn) : null,
        checkOut: dto.checkOut ? new Date(dto.checkOut) : null,
        numGuests: dto.numGuests ?? null,
        message: dto.message?.trim() ?? null,
        source: dto.source ?? LEAD_SOURCE.PUBLIC_FORM,
        status: LEAD_STATUS.NEW,
      },
    });

    // Notify owner if property-linked; else notify all admins
    if (ownerId) {
      await this.notifications.notifyUser(
        ownerId,
        'Có khách hàng quan tâm cơ sở của bạn',
        `${lead.guestName} (${lead.guestPhone})${lead.message ? `: ${lead.message.slice(0, 80)}` : ''}`,
        NOTIFICATION_TYPE.SYSTEM,
        lead.id,
        'lead',
        { pushType: 'lead_new', deepLink: `/host/leads/${lead.id}` },
      );
    } else {
      await this.notifications.notifyAdmins(
        'Có lead mới (chưa gắn cơ sở)',
        `${lead.guestName} (${lead.guestPhone})`,
        NOTIFICATION_TYPE.SYSTEM,
        lead.id,
        'lead',
        { pushType: 'lead_new', deepLink: `/admin/leads/${lead.id}` },
      );
    }

    return { message: msg.leads.createSuccess, data: lead };
  }

  /** Owner / Sale / Admin list */
  async list(
    caller: { id: string; role: number; ownerId?: string | null },
    filters: {
      status?: string;
      propertyId?: string;
      page?: number;
      limit?: number;
    },
    msg: Messages,
  ) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.LeadWhereInput = {};
    if (caller.role === ROLE.OWNER) where.ownerId = caller.id;
    else if (caller.role === ROLE.SALE) where.ownerId = caller.ownerId ?? '__none__';
    // ADMIN: no ownerId filter

    if (filters.status) where.status = filters.status;
    if (filters.propertyId) where.propertyId = filters.propertyId;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const hydrated = await this.hydrateLeads(items);

    return {
      message: msg.leads.listSuccess,
      data: { items: hydrated, total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Hydrate assignedToName (và contactedByName nếu cần) cho mảng lead — 1 query batch. */
  private async hydrateLeads<T extends { assignedToId: string | null; contactedById: string | null }>(
    leads: T[],
  ): Promise<Array<T & { assignedToName: string | null; contactedByName: string | null }>> {
    const userIds = Array.from(
      new Set(
        leads
          .flatMap((l) => [l.assignedToId, l.contactedById])
          .filter((id): id is string => !!id),
      ),
    );
    if (userIds.length === 0) {
      return leads.map((l) => ({ ...l, assignedToName: null, contactedByName: null }));
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(users.map((u) => [u.id, u.name]));
    return leads.map((l) => ({
      ...l,
      assignedToName: l.assignedToId ? nameMap.get(l.assignedToId) ?? null : null,
      contactedByName: l.contactedById ? nameMap.get(l.contactedById) ?? null : null,
    }));
  }

  async findOne(
    id: string,
    caller: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
  ) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(msg.leads.notFound);
    this.checkAccess(lead, caller, msg);

    // Hydrate property if any
    const property = lead.propertyId
      ? await this.prisma.property.findUnique({
          where: { id: lead.propertyId },
          select: { id: true, name: true, code: true },
        })
      : null;

    const [withNames] = await this.hydrateLeads([lead]);
    return { message: msg.leads.getSuccess, data: { ...withNames, property } };
  }

  async update(
    id: string,
    dto: UpdateLeadDto,
    caller: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
  ) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(msg.leads.notFound);
    this.checkAccess(lead, caller, msg);

    const data: Prisma.LeadUpdateInput = {};
    if (dto.status) {
      data.status = dto.status;
      if (dto.status === LEAD_STATUS.CONTACTED) {
        data.contactedAt = new Date();
        data.contactedById = caller.id;
      }
    }
    if (dto.assignedToId !== undefined) data.assignedToId = dto.assignedToId;
    if (dto.notes !== undefined) data.notes = dto.notes;

    const updated = await this.prisma.lead.update({ where: { id }, data });
    const [withNames] = await this.hydrateLeads([updated]);
    return { message: msg.leads.updateSuccess, data: withNames };
  }

  private checkAccess(
    lead: { ownerId: string | null },
    caller: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
  ) {
    if (caller.role === ROLE.ADMIN) return;
    if (caller.role === ROLE.OWNER && lead.ownerId === caller.id) return;
    if (caller.role === ROLE.SALE && lead.ownerId === caller.ownerId) return;
    throw new ForbiddenException(msg.leads.forbidden);
  }
}
