import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import {
  ROLE,
  DISPUTE_STATUS,
  NOTIFICATION_TYPE,
  AUDIT_ACTION,
  AUDIT_TARGET_TYPE,
} from '../../common/constants';
import type { Messages } from '../../i18n';
import { OpenDisputeDto } from './dto/open-dispute.dto';
import { ResolveDisputeDto, RejectDisputeDto } from './dto/resolve-dispute.dto';

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private auditLog: AuditLogService,
  ) {}

  /** Mở dispute (authenticated user: owner, sale, customer) */
  async open(
    caller: { id: string; role: number; ownerId?: string | null },
    dto: OpenDisputeDto,
    msg: Messages,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      select: {
        id: true,
        propertyId: true,
        customerId: true,
        property: { select: { ownerId: true, name: true } },
      },
    });
    if (!booking) throw new NotFoundException(msg.bookings.notFound);

    // ACL: owner/sale của property hoặc customer của booking mới mở được
    const isOwner = booking.property.ownerId === caller.id;
    const isSale = caller.role === ROLE.SALE && caller.ownerId === booking.property.ownerId;
    const isCustomer = booking.customerId === caller.id;
    const isAdmin = caller.role === ROLE.ADMIN;
    if (!isOwner && !isSale && !isCustomer && !isAdmin) {
      throw new ForbiddenException(msg.disputes.forbiddenOpen);
    }

    const openerType: string = isAdmin ? 'admin' : isOwner ? 'owner' : isSale ? 'sale' : 'customer';

    const attachments = dto.attachments?.slice(0, 10) ?? null;

    const dispute = await this.prisma.dispute.create({
      data: {
        bookingId: booking.id,
        propertyId: booking.propertyId,
        ownerId: booking.property.ownerId,
        customerId: booking.customerId,
        openerType,
        openerId: caller.id,
        type: dto.type,
        subject: dto.subject,
        description: dto.description,
        amount: dto.amount ?? null,
        status: DISPUTE_STATUS.PENDING,
        attachments: attachments as Prisma.InputJsonValue,
      },
    });

    // Notify admin team + the other party
    await this.notifications.notifyAdmins(
      'Có dispute mới',
      `${booking.property.name} — ${dto.subject}`,
      NOTIFICATION_TYPE.SYSTEM,
      dispute.id,
      'dispute',
      { pushType: 'dispute_opened', deepLink: `/admin/disputes/${dispute.id}` },
    );
    if (openerType !== 'owner' && openerType !== 'sale') {
      await this.notifications.notifyUser(
        booking.property.ownerId,
        'Có khiếu nại mới về cơ sở',
        `${booking.property.name} — ${dto.subject}`,
        NOTIFICATION_TYPE.SYSTEM,
        dispute.id,
        'dispute',
        { pushType: 'dispute_opened', deepLink: `/host/bookings/${booking.id}` },
      );
    }
    if (openerType !== 'customer' && booking.customerId) {
      await this.notifications.notifyUser(
        booking.customerId,
        'Có khiếu nại liên quan đến booking của bạn',
        dto.subject,
        NOTIFICATION_TYPE.SYSTEM,
        dispute.id,
        'dispute',
        { pushType: 'dispute_opened', deepLink: '/my-bookings' },
      );
    }

    return { message: msg.disputes.openSuccess, data: dispute };
  }

  /** Admin list with filters */
  async list(
    filters: {
      status?: string;
      type?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
    msg: Messages,
  ) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.DisputeWhereInput = {};
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;
    if (filters.search) {
      const q = filters.search.trim();
      where.OR = [
        { subject: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.dispute.count({ where }),
      this.prisma.dispute.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      message: msg.disputes.listSuccess,
      data: {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async countActive(msg: Messages) {
    const count = await this.prisma.dispute.count({
      where: {
        status: { in: [DISPUTE_STATUS.PENDING, DISPUTE_STATUS.INVESTIGATING] },
      },
    });
    return { message: msg.disputes.countSuccess, data: { count } };
  }

  async findOne(id: string, msg: Messages) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id } });
    if (!dispute) throw new NotFoundException(msg.disputes.notFound);

    // Hydrate property + booking + parties for admin UI
    const [property, booking, owner, customer] = await Promise.all([
      this.prisma.property.findUnique({
        where: { id: dispute.propertyId },
        select: { id: true, name: true, code: true },
      }),
      this.prisma.booking.findUnique({
        where: { id: dispute.bookingId },
        select: { id: true, checkinDate: true, checkoutDate: true, totalAmount: true, paidAmount: true, status: true },
      }),
      this.prisma.user.findUnique({
        where: { id: dispute.ownerId },
        select: { id: true, name: true, email: true, phone: true },
      }),
      dispute.customerId
        ? this.prisma.user.findUnique({
            where: { id: dispute.customerId },
            select: { id: true, name: true, email: true, phone: true },
          })
        : Promise.resolve(null),
    ]);

    return {
      message: msg.disputes.getSuccess,
      data: { ...dispute, property, booking, owner, customer },
    };
  }

  async investigate(adminId: string, adminRole: number, id: string, msg: Messages) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id } });
    if (!dispute) throw new NotFoundException(msg.disputes.notFound);
    if (dispute.status !== DISPUTE_STATUS.PENDING) {
      throw new BadRequestException(msg.disputes.onlyPendingCanInvestigate);
    }
    const updated = await this.prisma.dispute.update({
      where: { id },
      data: { status: DISPUTE_STATUS.INVESTIGATING },
    });

    void this.auditLog.log({
      actorId: adminId,
      actorRole: adminRole,
      action: AUDIT_ACTION.DISPUTE_INVESTIGATE,
      targetType: AUDIT_TARGET_TYPE.DISPUTE,
      targetId: id,
      targetLabel: dispute.subject,
    });

    return { message: msg.disputes.investigateSuccess, data: updated };
  }

  async resolve(
    adminId: string,
    adminRole: number,
    id: string,
    dto: ResolveDisputeDto,
    msg: Messages,
  ) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id } });
    if (!dispute) throw new NotFoundException(msg.disputes.notFound);
    if (dispute.status === DISPUTE_STATUS.RESOLVED || dispute.status === DISPUTE_STATUS.REJECTED) {
      throw new BadRequestException(msg.disputes.alreadyClosed);
    }

    const updated = await this.prisma.dispute.update({
      where: { id },
      data: {
        status: DISPUTE_STATUS.RESOLVED,
        resolution: dto.resolution.trim(),
        refundAmount: dto.refundAmount ?? null,
        resolvedById: adminId,
        resolvedAt: new Date(),
      },
    });

    void this.auditLog.log({
      actorId: adminId,
      actorRole: adminRole,
      action: AUDIT_ACTION.DISPUTE_RESOLVE,
      targetType: AUDIT_TARGET_TYPE.DISPUTE,
      targetId: id,
      targetLabel: dispute.subject,
      metadata: { refundAmount: dto.refundAmount ?? null },
    });

    // Notify both parties + opener (nếu khác)
    const notifiedSet = new Set<string>();
    const notifyOnce = async (uid: string | null | undefined, deepLink: string) => {
      if (!uid || notifiedSet.has(uid)) return;
      notifiedSet.add(uid);
      await this.notifications.notifyUser(
        uid,
        'Khiếu nại đã được giải quyết',
        `${dispute.subject} — admin đã ra phán quyết`,
        NOTIFICATION_TYPE.SYSTEM,
        id,
        'dispute',
        { pushType: 'dispute_resolved', deepLink },
      );
    };
    await notifyOnce(dispute.ownerId, `/host/bookings/${dispute.bookingId}`);
    await notifyOnce(dispute.customerId, '/my-bookings');
    // Opener nếu là sale/admin (không phải owner/customer ở trên)
    await notifyOnce(dispute.openerId, '/');

    return { message: msg.disputes.resolveSuccess, data: updated };
  }

  async reject(
    adminId: string,
    adminRole: number,
    id: string,
    dto: RejectDisputeDto,
    msg: Messages,
  ) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id } });
    if (!dispute) throw new NotFoundException(msg.disputes.notFound);
    if (dispute.status === DISPUTE_STATUS.RESOLVED || dispute.status === DISPUTE_STATUS.REJECTED) {
      throw new BadRequestException(msg.disputes.alreadyClosed);
    }

    const updated = await this.prisma.dispute.update({
      where: { id },
      data: {
        status: DISPUTE_STATUS.REJECTED,
        resolution: dto.resolution.trim(),
        resolvedById: adminId,
        resolvedAt: new Date(),
      },
    });

    void this.auditLog.log({
      actorId: adminId,
      actorRole: adminRole,
      action: AUDIT_ACTION.DISPUTE_REJECT,
      targetType: AUDIT_TARGET_TYPE.DISPUTE,
      targetId: id,
      targetLabel: dispute.subject,
    });

    await this.notifications.notifyUser(
      dispute.openerId,
      'Khiếu nại bị bác',
      `${dispute.subject} — admin đã bác khiếu nại`,
      NOTIFICATION_TYPE.SYSTEM,
      id,
      'dispute',
      { pushType: 'dispute_rejected', deepLink: '/' },
    );

    return { message: msg.disputes.rejectSuccess, data: updated };
  }
}
