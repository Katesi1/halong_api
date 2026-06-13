import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../../config/cloudinary.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { Messages } from '../../i18n';
import { ROLE, BOOKING_STATUS, NOTIFICATION_TYPE, KYC_STATUS, AUDIT_ACTION, AUDIT_TARGET_TYPE, getEffectiveOwnerId, isSaleUnassigned } from '../../common/constants';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { kycRequired } from '../../common/errors/kyc.errors';
import { assertOwnerEntitled } from '../../common/subscription';

@Injectable()
export class PropertiesService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
    private notifications: NotificationsService,
    private auditLog: AuditLogService,
  ) {}

  async findAll(
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
    includeInactive?: boolean,
    view?: string,
  ) {
    const effectiveOwnerId = getEffectiveOwnerId(user);
    const where: any = effectiveOwnerId
      ? { ownerId: effectiveOwnerId, deletedAt: null }
      : { deletedAt: null };

    // OWNER/SALE luôn thấy property của mình kể cả pending/rejected/suspended,
    // tránh "biến mất" sau khi tạo. ADMIN/list explicit query mới cần includeInactive.
    const scopedToSelf = user.role === ROLE.OWNER || user.role === ROLE.SALE;
    if (!includeInactive && !scopedToSelf) {
      where.isActive = true;
    }

    if (view) {
      where.view = view;
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
    view?: string,
  ) {
    const where: any = { isActive: true, deletedAt: null };

    if (type !== undefined) {
      where.type = type;
    }

    if (view) {
      where.view = view;
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
      const checkin = new Date(checkinDate.split('T')[0] + 'T00:00:00.000Z');
      const checkout = new Date(checkoutDate.split('T')[0] + 'T00:00:00.000Z');

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

  async findOne(id: string, msg: Messages) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true, name: true, phone: true,
          },
        },
        images: { orderBy: { order: 'asc' } },
        _count: { select: { bookings: true } },
      },
    });

    if (!property || property.deletedAt) throw new NotFoundException(msg.properties.notFound);

    return { message: msg.properties.getSuccess, data: property };
  }

  async create(dto: CreatePropertyDto, user: { id: string; role: number; ownerId?: string | null }, msg: Messages) {
    // SALE: assigned can CRU, unassigned cannot create
    if (user.role === ROLE.SALE) {
      if (isSaleUnassigned(user)) {
        throw new ForbiddenException(msg.properties.forbidden);
      }
      // Assigned SALE can create for their owner
    }

    // OWNER must complete KYC before managing properties
    if (user.role === ROLE.OWNER) {
      await this.checkKycApproved(user.id, msg);
    }
    // Apple IAP compliance: chặn khi trial hết hạn / chưa active.
    await assertOwnerEntitled(this.prisma, user, msg);

    const ownerId = user.role === ROLE.ADMIN && dto.ownerId
      ? dto.ownerId
      : user.role === ROLE.SALE && user.ownerId
        ? user.ownerId
        : user.id;

    if (user.role === ROLE.ADMIN && dto.ownerId) {
      const owner = await this.prisma.user.findUnique({ where: { id: dto.ownerId } });
      if (!owner) throw new NotFoundException(msg.properties.ownerNotFound);
    }

    const existing = await this.prisma.property.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException(msg.properties.codeDuplicate);

    const { ownerId: _, ...createData } = dto;
    // OWNER-created properties go through moderation. ADMIN/SALE bypass.
    const moderationStatus = user.role === ROLE.OWNER ? 'pending' : 'approved';
    const property = await this.prisma.property.create({
      data: {
        ...createData,
        ownerId,
        moderationStatus,
        isActive: moderationStatus === 'approved',
      },
      include: {
        owner: { select: { id: true, name: true, phone: true } },
      },
    });

    await this.notifications.notifyAdmins(
      'Phòng mới được tạo',
      `${property.name} (${property.code}) được tạo bởi ${property.owner.name}`,
      NOTIFICATION_TYPE.SYSTEM,
      property.id,
      'property',
    );

    return { message: msg.properties.createSuccess, data: property };
  }

  async update(id: string, dto: UpdatePropertyDto, user: { id: string; role: number; ownerId?: string | null }, msg: Messages) {
    // Unassigned SALE cannot update
    if (user.role === ROLE.SALE && isSaleUnassigned(user)) {
      throw new ForbiddenException(msg.properties.forbidden);
    }

    // OWNER must complete KYC
    if (user.role === ROLE.OWNER) {
      await this.checkKycApproved(user.id, msg);
    }
    await assertOwnerEntitled(this.prisma, user, msg);

    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property || property.deletedAt) throw new NotFoundException(msg.properties.notFound);
    this.checkOwnerAccess(property, user, msg);

    if (dto.code && dto.code !== property.code) {
      const existing = await this.prisma.property.findUnique({ where: { code: dto.code } });
      if (existing) throw new ConflictException(msg.properties.codeDuplicate);
    }

    // Auto-resubmit: nếu OWNER đang sở hữu property bị reject/suspended và edit lại
    // → chuyển moderationStatus về pending để admin duyệt lại.
    const data: any = { ...dto };
    if (
      user.role === ROLE.OWNER &&
      (property.moderationStatus === 'rejected' || property.moderationStatus === 'suspended')
    ) {
      data.moderationStatus = 'pending';
      data.moderationRejectedReason = null;
      data.moderationReviewedAt = null;
      data.moderationReviewedBy = null;
    }

    const updated = await this.prisma.property.update({
      where: { id },
      data,
      include: {
        owner: { select: { id: true, name: true, phone: true } },
        images: { orderBy: { order: 'asc' } },
        _count: { select: { bookings: true } },
      },
    });

    // Nếu chuyển sang pending → notify admin có property cần duyệt lại
    if (data.moderationStatus === 'pending') {
      await this.notifications.notifyAdmins(
        'Cơ sở cần duyệt lại',
        `${updated.name} đã được chủ cập nhật và gửi lại để duyệt`,
        NOTIFICATION_TYPE.SYSTEM,
        id,
        'property',
        { pushType: 'property_resubmitted', deepLink: `/admin/properties/${id}` },
      );
    }

    await this.notifications.notifyPropertyOwner(
      id,
      'Phòng được cập nhật',
      `${updated.name} (${(updated as any).code}) đã được cập nhật`,
      NOTIFICATION_TYPE.SYSTEM,
      id,
      'property',
    );

    return { message: msg.properties.updateSuccess, data: updated };
  }

  async remove(id: string, user: { id: string; role: number; ownerId?: string | null }, msg: Messages) {
    // Only ADMIN and OWNER can delete
    if (user.role === ROLE.SALE) {
      throw new ForbiddenException(msg.properties.forbidden);
    }

    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property || property.deletedAt) throw new NotFoundException(msg.properties.notFound);
    this.checkOwnerAccess(property, user, msg);

    await this.prisma.property.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.notifications.notifyAdmins(
      'Phòng đã bị xóa',
      `${property.name} (${property.code}) đã bị vô hiệu hóa`,
      NOTIFICATION_TYPE.SYSTEM,
      id,
      'property',
    );

    return { message: msg.properties.deleteSuccess, data: null };
  }

  // ─── Prices ───────────────────────────────────────────────────────────────

  async updatePrices(
    id: string,
    dto: { weekdayPrice?: number; weekendPrice?: number; holidayPrice?: number; adultSurcharge?: number; childSurcharge?: number },
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
  ) {
    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property || property.deletedAt) throw new NotFoundException(msg.properties.notFound);
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

    await this.notifications.notifyPropertyOwner(
      id,
      'Bảng giá được cập nhật',
      `${updated.name} (${updated.code}) đã cập nhật bảng giá`,
      NOTIFICATION_TYPE.SYSTEM,
      id,
      'property',
    );

    return { message: msg.properties.updatePricesSuccess, data: updated };
  }

  // ─── Image Management ──────────────────────────────────────────────────────

  async uploadImages(
    propertyId: string,
    files: Express.Multer.File[],
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException(msg.properties.noFiles);
    }

    await this.getPropertyWithAccess(propertyId, user, msg);

    const currentCount = await this.prisma.propertyImage.count({ where: { propertyId } });
    const maxImages = 30;
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

    const prop = await this.prisma.property.findUnique({ where: { id: propertyId }, select: { name: true, code: true } });
    await this.notifications.notifyPropertyOwner(
      propertyId,
      'Ảnh mới được tải lên',
      `${prop?.name} (${prop?.code}) — ${images.length} ảnh mới`,
      NOTIFICATION_TYPE.SYSTEM,
      propertyId,
      'property',
    );

    return { message: msg.properties.uploadSuccess(images.length), data: images };
  }

  async deleteImage(
    propertyId: string,
    imageId: string,
    user: { id: string; role: number; ownerId?: string | null },
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

    await this.notifications.notifyPropertyOwner(
      propertyId,
      'Ảnh đã bị xóa',
      `Một ảnh của phòng đã bị xóa`,
      NOTIFICATION_TYPE.SYSTEM,
      propertyId,
      'property',
    );

    return { message: msg.properties.deleteImageSuccess, data: null };
  }

  async setCoverImage(
    propertyId: string,
    imageId: string,
    user: { id: string; role: number; ownerId?: string | null },
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

  // ─── Public Share (no auth, no prices) ──────────────────────────────────────

  async findShareDetail(id: string, msg: Messages) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        code: true,
        type: true,
        address: true,
        latitude: true,
        longitude: true,
        mapLink: true,
        view: true,
        bedrooms: true,
        bathrooms: true,
        standardGuests: true,
        maxGuests: true,
        amenities: true,
        description: true,
        rules: true,
        services: true,
        cancellationPolicy: true,
        checkInTime: true,
        checkOutTime: true,
        isActive: true,
        images: { orderBy: { order: 'asc' } },
      },
    });

    if (!property || !property.isActive) {
      throw new NotFoundException(msg.properties.notFound);
    }

    return { message: msg.properties.shareSuccess, data: property };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async getPropertyWithAccess(
    id: string,
    user: { id: string; role: number; ownerId?: string | null },
    msg: Messages,
  ) {
    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property || property.deletedAt) throw new NotFoundException(msg.properties.notFound);
    this.checkOwnerAccess(property, user, msg);
    return property;
  }

  private checkOwnerAccess(property: any, user: { id: string; role: number; ownerId?: string | null }, msg: Messages) {
    const effectiveOwnerId = getEffectiveOwnerId(user);
    if (effectiveOwnerId && property.ownerId !== effectiveOwnerId) {
      throw new ForbiddenException(msg.properties.forbidden);
    }
  }

  private async checkKycApproved(userId: string, msg: Messages) {
    const owner = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { kycStatus: true, kycBypass: true },
    });
    if (!owner) throw kycRequired(msg.kyc.propertyRequiresKyc);
    // ADMIN-granted bypass skips KYC requirement
    if (owner.kycBypass) return;
    if (owner.kycStatus !== KYC_STATUS.APPROVED) {
      throw kycRequired(msg.kyc.propertyRequiresKyc);
    }
  }

  // ─── Admin moderation ─────────────────────────────────────────────────────

  async approveProperty(
    adminId: string,
    propertyId: string,
    msg: Messages,
  ) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, ownerId: true, name: true, moderationStatus: true },
    });
    if (!property) throw new NotFoundException(msg.properties.notFound);

    const updated = await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        moderationStatus: 'approved',
        moderationRejectedReason: null,
        moderationReviewedAt: new Date(),
        moderationReviewedBy: adminId,
        isActive: true,
      },
    });

    await this.notifications.notifyUser(
      property.ownerId,
      'Cơ sở đã được duyệt',
      `Cơ sở ${property.name} đã được admin duyệt và hiển thị công khai.`,
      NOTIFICATION_TYPE.SYSTEM,
      propertyId,
      'property',
      { pushType: 'property_approved', deepLink: `/host/properties/${propertyId}` },
    );

    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: AUDIT_ACTION.PROPERTY_APPROVE,
      targetType: AUDIT_TARGET_TYPE.PROPERTY,
      targetId: propertyId,
      targetLabel: property.name,
    });

    return { message: msg.properties.approveSuccess, data: updated };
  }

  async rejectProperty(
    adminId: string,
    propertyId: string,
    reason: string,
    msg: Messages,
  ) {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestException(msg.properties.rejectReasonRequired);
    }
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, ownerId: true, name: true },
    });
    if (!property) throw new NotFoundException(msg.properties.notFound);

    const updated = await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        moderationStatus: 'rejected',
        moderationRejectedReason: reason.trim(),
        moderationReviewedAt: new Date(),
        moderationReviewedBy: adminId,
        isActive: false,
      },
    });

    await this.notifications.notifyUser(
      property.ownerId,
      'Cơ sở bị từ chối duyệt',
      `Cơ sở ${property.name} bị admin từ chối. Lý do: ${reason}`,
      NOTIFICATION_TYPE.SYSTEM,
      propertyId,
      'property',
      { pushType: 'property_rejected', deepLink: `/host/properties/${propertyId}` },
    );

    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: AUDIT_ACTION.PROPERTY_REJECT,
      targetType: AUDIT_TARGET_TYPE.PROPERTY,
      targetId: propertyId,
      targetLabel: property.name,
      metadata: { reason: reason.trim() },
    });

    return { message: msg.properties.rejectSuccess, data: updated };
  }

  async suspendProperty(
    adminId: string,
    propertyId: string,
    reason: string | undefined,
    msg: Messages,
  ) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, ownerId: true, name: true },
    });
    if (!property) throw new NotFoundException(msg.properties.notFound);

    const updated = await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        moderationStatus: 'suspended',
        moderationRejectedReason: reason?.trim() ?? 'Suspended by admin',
        moderationReviewedAt: new Date(),
        moderationReviewedBy: adminId,
        isActive: false,
      },
    });

    await this.notifications.notifyUser(
      property.ownerId,
      'Cơ sở bị tạm ngưng',
      `Cơ sở ${property.name} đã bị admin tạm ngưng${reason ? `. Lý do: ${reason}` : '.'}`,
      NOTIFICATION_TYPE.SYSTEM,
      propertyId,
      'property',
      { pushType: 'property_suspended', deepLink: `/host/properties/${propertyId}` },
    );

    void this.auditLog.log({
      actorId: adminId,
      actorRole: ROLE.ADMIN,
      action: AUDIT_ACTION.PROPERTY_SUSPEND,
      targetType: AUDIT_TARGET_TYPE.PROPERTY,
      targetId: propertyId,
      targetLabel: property.name,
      metadata: { reason: reason?.trim() ?? null },
    });

    return { message: msg.properties.suspendSuccess, data: updated };
  }
}
