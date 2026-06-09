import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface StaffInviteEmailData {
  to: string;
  ownerName: string;
  homestayName?: string | null;
  inviteLink: string;
  shortCode: string;
  expiresAt: Date;
}

export interface PasswordResetEmailData {
  to: string;
  resetLink: string;
  expiresInMinutes: number;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (!host || !user || !pass) {
      this.logger.warn('SMTP credentials missing — email service disabled. Invite links will be returned in API response only.');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: parseInt(this.configService.get<string>('SMTP_PORT') || '587', 10),
      secure: false,
      auth: { user, pass },
    });
  }

  isEnabled(): boolean {
    return this.transporter !== null;
  }

  async sendStaffInvite(data: StaffInviteEmailData): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`Skipping email to ${data.to} — SMTP not configured`);
      return;
    }

    const expiresStr = data.expiresAt.toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    const homestayLine = data.homestayName ? ` (chủ homestay ${data.homestayName})` : '';
    const from = this.configService.get<string>('SMTP_FROM') || 'Halong24h <noreply@halong24h.com>';

    const text = `Xin chào,

${data.ownerName}${homestayLine} đã mời bạn làm nhân viên quản lý booking trên Halong24h.

Để chấp nhận lời mời:

  - Trên điện thoại: bấm vào link sau
    ${data.inviteLink}

  - Hoặc mở app Halong24h → Đăng nhập → "Tôi có mã mời" → nhập mã:
    ${data.shortCode}

Lời mời hết hạn vào ngày ${expiresStr}.

Nếu bạn không biết người gửi, có thể bỏ qua email này.

— Halong24h Team`;

    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#222">
  <h2 style="margin:0 0 16px">Bạn được mời làm nhân viên — Halong24h</h2>
  <p><strong>${data.ownerName}</strong>${homestayLine} đã mời bạn làm nhân viên quản lý booking trên Halong24h.</p>
  <p style="margin:24px 0">
    <a href="${data.inviteLink}"
       style="background:#0d6efd;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">
      Chấp nhận lời mời
    </a>
  </p>
  <p>Hoặc mở app Halong24h → "Tôi có mã mời" → nhập mã:</p>
  <p style="font-size:20px;font-weight:bold;letter-spacing:2px;background:#f5f5f5;padding:12px;text-align:center;border-radius:6px">${data.shortCode}</p>
  <p style="color:#666;font-size:13px">Lời mời hết hạn vào ngày <strong>${expiresStr}</strong>. Nếu bạn không biết người gửi, có thể bỏ qua email này.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#999;font-size:12px">— Halong24h Team</p>
</div>`;

    try {
      await this.transporter.sendMail({
        from,
        to: data.to,
        subject: `Bạn được mời làm nhân viên tại ${data.ownerName} — Halong24h`,
        text,
        html,
      });
    } catch (err) {
      this.logger.error(`Failed to send staff invite to ${data.to}: ${(err as Error).message}`);
      throw err;
    }
  }

  async sendPasswordReset(data: PasswordResetEmailData): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`Skipping password reset email to ${data.to} — SMTP not configured`);
      return;
    }

    const from = this.configService.get<string>('SMTP_FROM') || 'Halong24h <noreply@halong24h.com>';

    const text = `Xin chào,

Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản Halong24h gắn với email này.

Bấm vào link sau để đặt mật khẩu mới (hết hạn sau ${data.expiresInMinutes} phút):

  ${data.resetLink}

Nếu bạn không yêu cầu đặt lại mật khẩu, có thể bỏ qua email này — tài khoản của bạn vẫn an toàn.

— Halong24h Team`;

    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#222">
  <h2 style="margin:0 0 16px">Đặt lại mật khẩu — Halong24h</h2>
  <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản Halong24h gắn với email này.</p>
  <p style="margin:24px 0">
    <a href="${data.resetLink}"
       style="background:#0d6efd;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">
      Đặt lại mật khẩu
    </a>
  </p>
  <p style="color:#666;font-size:13px">Hoặc copy link sau vào trình duyệt:</p>
  <p style="word-break:break-all;background:#f5f5f5;padding:10px;border-radius:4px;font-size:13px"><a href="${data.resetLink}">${data.resetLink}</a></p>
  <p style="color:#666;font-size:13px">Link hết hạn sau <strong>${data.expiresInMinutes} phút</strong>. Nếu bạn không yêu cầu đặt lại mật khẩu, có thể bỏ qua email này — tài khoản của bạn vẫn an toàn.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#999;font-size:12px">— Halong24h Team</p>
</div>`;

    try {
      await this.transporter.sendMail({
        from,
        to: data.to,
        subject: 'Đặt lại mật khẩu — Halong24h',
        text,
        html,
      });
    } catch (err) {
      this.logger.error(`Failed to send password reset to ${data.to}: ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * Generic test send — admin clicks "Send test" on a template card.
   * Renders sample data and dispatches to a target email so admin can verify rendering.
   */
  async sendTest(template: string, to: string): Promise<{ sent: boolean }> {
    if (!this.transporter) {
      this.logger.warn(`Skipping test email (${template}) to ${to} — SMTP not configured`);
      return { sent: false };
    }
    const from = this.configService.get<string>('SMTP_FROM') || 'Halong24h <noreply@halong24h.com>';
    const sample = EMAIL_TEMPLATE_SAMPLES[template];
    if (!sample) {
      throw new Error(`Unknown template: ${template}`);
    }
    await this.transporter.sendMail({
      from,
      to,
      subject: `[TEST] ${sample.subject}`,
      text: sample.text,
      html: sample.html,
    });
    return { sent: true };
  }
}

interface EmailSample {
  subject: string;
  text: string;
  html: string;
}

/**
 * Known templates exposed to admin UI. When wiring a real template later,
 * replace the sample here with the production renderer.
 */
export const EMAIL_TEMPLATE_KEYS = [
  'welcome_owner',
  'welcome_sale',
  'password_reset',
  'booking_confirmed',
  'booking_cancelled',
  'booking_paid',
  'kyc_approved',
  'kyc_rejected',
  'staff_invite',
  'subscription_due',
  'subscription_overdue',
  'subscription_paid',
  'dispute_opened',
  'review_received',
  'property_approved',
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

const EMAIL_TEMPLATE_SAMPLES: Record<string, EmailSample> = {
  welcome_owner: {
    subject: 'Chào mừng bạn đến với Halong24h',
    text: 'Xin chào! Tài khoản chủ homestay của bạn đã được kích hoạt.',
    html: '<p>Xin chào! Tài khoản chủ homestay của bạn đã được kích hoạt.</p>',
  },
  welcome_sale: {
    subject: 'Tài khoản nhân viên đã sẵn sàng',
    text: 'Bạn đã được thêm vào đội ngũ. Đăng nhập để bắt đầu.',
    html: '<p>Bạn đã được thêm vào đội ngũ. Đăng nhập để bắt đầu.</p>',
  },
  password_reset: {
    subject: 'Đặt lại mật khẩu — Halong24h',
    text: 'Bấm vào link để đặt mật khẩu mới. Link hết hạn sau 10 phút. Nếu không phải bạn, có thể bỏ qua email này.',
    html: '<p>Bấm vào link để đặt mật khẩu mới. Link hết hạn sau <strong>10 phút</strong>. Nếu không phải bạn, có thể bỏ qua email này.</p>',
  },
  booking_confirmed: {
    subject: 'Đặt phòng đã xác nhận',
    text: 'Booking #SAMPLE đã được xác nhận.',
    html: '<p>Booking <b>#SAMPLE</b> đã được xác nhận.</p>',
  },
  booking_cancelled: {
    subject: 'Đặt phòng đã huỷ',
    text: 'Booking #SAMPLE đã bị huỷ.',
    html: '<p>Booking <b>#SAMPLE</b> đã bị huỷ.</p>',
  },
  booking_paid: {
    subject: 'Đã nhận thanh toán',
    text: 'Đã ghi nhận thanh toán cho booking #SAMPLE.',
    html: '<p>Đã ghi nhận thanh toán cho booking <b>#SAMPLE</b>.</p>',
  },
  kyc_approved: {
    subject: 'KYC được duyệt',
    text: 'Hồ sơ KYC của bạn đã được duyệt.',
    html: '<p>Hồ sơ KYC của bạn đã được duyệt.</p>',
  },
  kyc_rejected: {
    subject: 'KYC bị từ chối',
    text: 'Hồ sơ KYC của bạn bị từ chối. Vui lòng kiểm tra và gửi lại.',
    html: '<p>Hồ sơ KYC của bạn bị từ chối. Vui lòng kiểm tra và gửi lại.</p>',
  },
  staff_invite: {
    subject: 'Bạn được mời làm nhân viên',
    text: 'Đây là mẫu lời mời nhân viên (test render).',
    html: '<p>Đây là mẫu lời mời nhân viên (test render).</p>',
  },
  subscription_due: {
    subject: 'Sắp đến hạn gia hạn gói',
    text: 'Gói của bạn sắp hết hạn — vui lòng gia hạn.',
    html: '<p>Gói của bạn sắp hết hạn — vui lòng gia hạn.</p>',
  },
  subscription_overdue: {
    subject: 'Gói đã quá hạn',
    text: 'Gói của bạn đã quá hạn — vui lòng thanh toán.',
    html: '<p>Gói của bạn đã quá hạn — vui lòng thanh toán.</p>',
  },
  subscription_paid: {
    subject: 'Cảm ơn đã thanh toán',
    text: 'Gói của bạn đã được gia hạn.',
    html: '<p>Gói của bạn đã được gia hạn.</p>',
  },
  dispute_opened: {
    subject: 'Có khiếu nại mới',
    text: 'Một khiếu nại liên quan đến cơ sở của bạn vừa được mở.',
    html: '<p>Một khiếu nại liên quan đến cơ sở của bạn vừa được mở.</p>',
  },
  review_received: {
    subject: 'Bạn có đánh giá mới',
    text: 'Cơ sở của bạn vừa nhận được đánh giá mới.',
    html: '<p>Cơ sở của bạn vừa nhận được đánh giá mới.</p>',
  },
  property_approved: {
    subject: 'Cơ sở đã được duyệt',
    text: 'Cơ sở của bạn đã được duyệt và hiển thị công khai.',
    html: '<p>Cơ sở của bạn đã được duyệt và hiển thị công khai.</p>',
  },
};
