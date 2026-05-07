import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../../config/cloudinary.service';
import {
  KYC_SUBMISSION_STATUS,
  KYC_STATUS,
  KYC_UPLOAD_TYPE,
  KYC_STATUS_API_MAP,
} from '../../common/constants';
import { Prisma } from '@prisma/client';
import type { Messages } from '../../i18n';

const REJECTABLE_ITEM_TO_TYPE: Record<string, string> = {
  cccdFront: KYC_UPLOAD_TYPE.CCCD_FRONT,
  cccdBack: KYC_UPLOAD_TYPE.CCCD_BACK,
  selfie: KYC_UPLOAD_TYPE.SELFIE,
};

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
  ) {}

  /** Get or create a draft/rejected submission for this user */
  private async getOrCreateSubmission(userId: string) {
    let submission = await this.prisma.kycSubmission.findFirst({
      where: {
        userId,
        status: { in: [KYC_SUBMISSION_STATUS.DRAFT, KYC_SUBMISSION_STATUS.REJECTED] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!submission) {
      submission = await this.prisma.kycSubmission.create({
        data: { userId },
      });
    }

    return submission;
  }

  /** Upload CCCD front image */
  async uploadCccdFront(
    user: { id: string },
    file: Express.Multer.File,
    msg: Messages,
  ) {
    const submission = await this.getOrCreateSubmission(user.id);

    // Upload to Cloudinary (private folder for KYC)
    const uploadResult = await this.cloudinary.uploadImage(file, 'kyc/cccd');
    const imageUrl = uploadResult.secure_url;
    const imageUrlThumb = this.cloudinary.getThumbnailUrl(imageUrl);
    const publicId = uploadResult.public_id;

    // TODO: Call FPT.AI OCR API here — for now, store without OCR
    const ocrResult: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
    const ocrConfidence = null;

    // Upsert the upload record (unique on submissionId + type)
    const upload = await this.prisma.kycUpload.upsert({
      where: {
        submissionId_type: {
          submissionId: submission.id,
          type: KYC_UPLOAD_TYPE.CCCD_FRONT,
        },
      },
      update: {
        imageUrl,
        imageUrlThumb,
        publicId,
        ocrResult,
        ocrConfidence,
        provider: 'manual',
      },
      create: {
        submissionId: submission.id,
        type: KYC_UPLOAD_TYPE.CCCD_FRONT,
        imageUrl,
        imageUrlThumb,
        publicId,
        ocrResult,
        ocrConfidence,
        provider: 'manual',
      },
    });

    return {
      message: msg.kyc.uploadSuccess,
      data: {
        id: upload.id,
        imageUrl: upload.imageUrl,
        ocrResult: upload.ocrResult,
        confidence: upload.ocrConfidence,
        uploadedAt: upload.uploadedAt,
      },
    };
  }

  /** Upload CCCD back image */
  async uploadCccdBack(
    user: { id: string },
    file: Express.Multer.File,
    msg: Messages,
  ) {
    const submission = await this.getOrCreateSubmission(user.id);

    const uploadResult = await this.cloudinary.uploadImage(file, 'kyc/cccd');
    const imageUrl = uploadResult.secure_url;
    const imageUrlThumb = this.cloudinary.getThumbnailUrl(imageUrl);
    const publicId = uploadResult.public_id;

    const upload = await this.prisma.kycUpload.upsert({
      where: {
        submissionId_type: {
          submissionId: submission.id,
          type: KYC_UPLOAD_TYPE.CCCD_BACK,
        },
      },
      update: {
        imageUrl,
        imageUrlThumb,
        publicId,
        ocrResult: Prisma.DbNull,
        ocrConfidence: null,
        provider: 'manual',
      },
      create: {
        submissionId: submission.id,
        type: KYC_UPLOAD_TYPE.CCCD_BACK,
        imageUrl,
        imageUrlThumb,
        publicId,
        provider: 'manual',
      },
    });

    return {
      message: msg.kyc.uploadSuccess,
      data: {
        id: upload.id,
        imageUrl: upload.imageUrl,
        ocrResult: upload.ocrResult,
        confidence: upload.ocrConfidence,
        uploadedAt: upload.uploadedAt,
      },
    };
  }

  /** Upload selfie + face match */
  async uploadSelfie(
    user: { id: string },
    file: Express.Multer.File,
    msg: Messages,
  ) {
    const submission = await this.getOrCreateSubmission(user.id);

    const uploadResult = await this.cloudinary.uploadImage(file, 'kyc/selfie');
    const imageUrl = uploadResult.secure_url;
    const publicId = uploadResult.public_id;

    // TODO: Call FPT.AI Face Match API here
    const faceMatchScore = null;
    const livenessScore = null;
    const isValid = true; // Default to true when no provider — admin will verify manually

    const upload = await this.prisma.kycUpload.upsert({
      where: {
        submissionId_type: {
          submissionId: submission.id,
          type: KYC_UPLOAD_TYPE.SELFIE,
        },
      },
      update: {
        imageUrl,
        publicId,
        faceMatchScore,
        livenessScore,
        provider: 'manual',
      },
      create: {
        submissionId: submission.id,
        type: KYC_UPLOAD_TYPE.SELFIE,
        imageUrl,
        publicId,
        faceMatchScore,
        livenessScore,
        provider: 'manual',
      },
    });

    // Check if all 3 uploads exist → auto transition to kyc_submitted
    await this.autoSubmitIfComplete(submission.id);

    return {
      message: msg.kyc.uploadSuccess,
      data: {
        id: upload.id,
        imageUrl: upload.imageUrl,
        faceMatchScore: upload.faceMatchScore,
        isValid,
        uploadedAt: upload.uploadedAt,
      },
    };
  }

  /** Auto-submit if all 3 uploads are present */
  private async autoSubmitIfComplete(submissionId: string) {
    const uploads = await this.prisma.kycUpload.findMany({
      where: { submissionId },
      select: { type: true },
    });

    const types = uploads.map((u) => u.type);
    const hasAll =
      types.includes(KYC_UPLOAD_TYPE.CCCD_FRONT) &&
      types.includes(KYC_UPLOAD_TYPE.CCCD_BACK) &&
      types.includes(KYC_UPLOAD_TYPE.SELFIE);

    if (hasAll) {
      const sub = await this.prisma.kycSubmission.findUnique({
        where: { id: submissionId },
      });
      if (sub && sub.status === KYC_SUBMISSION_STATUS.DRAFT) {
        await this.prisma.kycSubmission.update({
          where: { id: submissionId },
          data: { status: KYC_SUBMISSION_STATUS.KYC_SUBMITTED },
        });
      }
    }
  }

  /** Manual submit for approval */
  async submit(user: { id: string }, msg: Messages) {
    const submission = await this.prisma.kycSubmission.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { uploads: { select: { type: true } } },
    });

    if (!submission) {
      throw new NotFoundException(msg.kyc.submissionNotFound);
    }

    // Check all 3 uploads exist
    const types = submission.uploads.map((u) => u.type);
    if (
      !types.includes(KYC_UPLOAD_TYPE.CCCD_FRONT) ||
      !types.includes(KYC_UPLOAD_TYPE.CCCD_BACK) ||
      !types.includes(KYC_UPLOAD_TYPE.SELFIE)
    ) {
      throw new BadRequestException(msg.kyc.incompleteKyc);
    }

    // Only draft or kyc_submitted can be submitted
    if (
      submission.status !== KYC_SUBMISSION_STATUS.DRAFT &&
      submission.status !== KYC_SUBMISSION_STATUS.KYC_SUBMITTED
    ) {
      throw new BadRequestException(msg.kyc.cannotSubmit);
    }

    await this.prisma.kycSubmission.update({
      where: { id: submission.id },
      data: { status: KYC_SUBMISSION_STATUS.KYC_SUBMITTED },
    });

    return {
      message: msg.kyc.submitSuccess,
      data: {
        submissionId: submission.id,
        status: KYC_STATUS_API_MAP[KYC_SUBMISSION_STATUS.KYC_SUBMITTED],
      },
    };
  }

  /** Get submission details */
  async getSubmission(
    user: { id: string; role: number },
    submissionId: string,
    msg: Messages,
  ) {
    const submission = await this.prisma.kycSubmission.findUnique({
      where: { id: submissionId },
      include: {
        uploads: {
          select: {
            id: true,
            type: true,
            imageUrl: true,
            imageUrlThumb: true,
            ocrResult: true,
            ocrConfidence: true,
            faceMatchScore: true,
            livenessScore: true,
            uploadedAt: true,
          },
        },
        payments: {
          select: {
            id: true,
            planId: true,
            cycle: true,
            rooms: true,
            totalAmount: true,
            method: true,
            status: true,
            paidAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!submission) {
      throw new NotFoundException(msg.kyc.submissionNotFound);
    }

    // Non-admin can only see their own
    if (user.role !== 0 && submission.userId !== user.id) {
      throw new ForbiddenException(msg.kyc.submissionNotOwned);
    }

    return {
      message: msg.kyc.getSuccess,
      data: {
        id: submission.id,
        status: KYC_STATUS_API_MAP[submission.status] || submission.status,
        rejectReason: submission.rejectReason,
        rejectedItems: submission.rejectedItems,
        approvedAt: submission.approvedAt,
        trialEndsAt: submission.trialEndsAt,
        chargeStartsAt: submission.chargeStartsAt,
        expectedRooms: submission.expectedRooms,
        uploads: this.formatUploads(submission.uploads),
        payment: submission.payments[0] || null,
        createdAt: submission.createdAt,
      },
    };
  }

  /** Get current KYC status for the logged-in user */
  async getMyStatus(user: { id: string }, msg: Messages) {
    const submission = await this.prisma.kycSubmission.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        uploads: { select: { type: true } },
      },
    });

    if (!submission) {
      return {
        message: msg.kyc.statusSuccess,
        data: { status: 'draft', submissionId: null, uploads: {} },
      };
    }

    return {
      message: msg.kyc.statusSuccess,
      data: {
        status: KYC_STATUS_API_MAP[submission.status] || submission.status,
        submissionId: submission.id,
        rejectReason: submission.rejectReason,
        rejectedItems: submission.rejectedItems,
        approvedAt: submission.approvedAt,
        trialEndsAt: submission.trialEndsAt,
        uploads: this.formatUploadTypes(submission.uploads),
      },
    };
  }

  /** Resubmit rejected items */
  async resubmit(
    user: { id: string },
    submissionId: string,
    items: string[],
    msg: Messages,
  ) {
    const submission = await this.prisma.kycSubmission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException(msg.kyc.submissionNotFound);
    }
    if (submission.userId !== user.id) {
      throw new ForbiddenException(msg.kyc.submissionNotOwned);
    }
    if (submission.status !== KYC_SUBMISSION_STATUS.REJECTED) {
      throw new BadRequestException(msg.kyc.cannotResubmit);
    }

    // Delete the rejected upload types
    const typesToDelete = items
      .map((item) => REJECTABLE_ITEM_TO_TYPE[item])
      .filter(Boolean);

    if (typesToDelete.length > 0) {
      await this.prisma.kycUpload.deleteMany({
        where: {
          submissionId: submission.id,
          type: { in: typesToDelete },
        },
      });
    }

    // Reset status to draft
    await this.prisma.kycSubmission.update({
      where: { id: submission.id },
      data: {
        status: KYC_SUBMISSION_STATUS.DRAFT,
        rejectReason: null,
        rejectedItems: [],
      },
    });

    return {
      message: msg.kyc.resubmitSuccess,
      data: { status: 'draft' },
    };
  }

  /** Format uploads into a map keyed by type */
  private formatUploads(
    uploads: Array<{
      id: string;
      type: string;
      imageUrl: string;
      imageUrlThumb: string | null;
      ocrResult: any;
      ocrConfidence: number | null;
      faceMatchScore: number | null;
      livenessScore: number | null;
      uploadedAt: Date;
    }>,
  ) {
    const result: Record<string, any> = {};
    for (const u of uploads) {
      const key =
        u.type === 'cccd_front'
          ? 'cccdFront'
          : u.type === 'cccd_back'
            ? 'cccdBack'
            : 'selfie';
      result[key] = {
        id: u.id,
        imageUrl: u.imageUrl,
        imageUrlThumb: u.imageUrlThumb,
        ocrResult: u.ocrResult,
        confidence: u.ocrConfidence,
        faceMatchScore: u.faceMatchScore,
        uploadedAt: u.uploadedAt,
      };
    }
    return result;
  }

  private formatUploadTypes(uploads: Array<{ type: string }>) {
    const result: Record<string, boolean> = {};
    for (const u of uploads) {
      const key =
        u.type === 'cccd_front'
          ? 'cccdFront'
          : u.type === 'cccd_back'
            ? 'cccdBack'
            : 'selfie';
      result[key] = true;
    }
    return result;
  }
}
