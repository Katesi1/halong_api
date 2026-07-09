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

export interface BookingCancelledEmailData {
  to: string;
  customerName: string;
  propertyName: string;
  propertyCode?: string | null;
  checkinDate: Date;
  checkoutDate: Date;
  reason?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
}

export interface BookingConfirmedEmailData {
  to: string;
  customerName: string;
  propertyName: string;
  propertyCode?: string | null;
  checkinDate: Date;
  checkoutDate: Date;
  paidAmount: number;
  totalAmount?: number | null;
  depositAmount?: number | null;
  remainingAmount?: number | null;
  bookingCode: string;
  ownerName?: string | null;
  ownerPhone?: string | null;
}

export interface WelcomeEmailData {
  to: string;
  name: string;
}

export interface KycApprovedEmailData {
  to: string;
  name: string;
  /** true = đã có gói → quản lý cơ sở ngay; false = cần mua gói dịch vụ */
  canManageNow: boolean;
}

export interface KycRejectedEmailData {
  to: string;
  name: string;
  reason?: string | null;
  rejectedItems?: string[];
}

export interface ReviewInvitationEmailData {
  to: string;
  customerName: string;
  propertyName: string;
  reviewUrl: string;
  bookingCode: string;
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

  async sendBookingCancelled(data: BookingCancelledEmailData): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`Skipping booking-cancelled email to ${data.to} — SMTP not configured`);
      return;
    }

    const from = this.configService.get<string>('SMTP_FROM') || 'Halong24h <noreply@halong24h.com>';
    const fmt = (d: Date) =>
      d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const checkin = fmt(data.checkinDate);
    const checkout = fmt(data.checkoutDate);
    const propLabel = data.propertyCode ? `${data.propertyName} (${data.propertyCode})` : data.propertyName;
    const reasonLine = data.reason ? `\n\nLý do từ chủ nhà:\n  ${data.reason}` : '';
    const contactLine = data.ownerName || data.ownerPhone
      ? `\n\nNếu cần hỗ trợ, bạn có thể liên hệ ${data.ownerName ?? 'chủ nhà'}${data.ownerPhone ? ` — ${data.ownerPhone}` : ''}.`
      : '';

    const text = `Xin chào ${data.customerName},

Rất tiếc, đặt phòng của bạn tại ${propLabel} (nhận ${checkin} → trả ${checkout}) đã bị huỷ.${reasonLine}${contactLine}

Bạn có thể đặt lại phòng khác trên Halong24h bất cứ lúc nào.

— Halong24h Team`;

    const reasonHtml = data.reason
      ? `<div style="background:#fff8e1;border-left:4px solid #f0ad4e;padding:12px 16px;margin:16px 0;border-radius:4px"><strong>Lý do từ chủ nhà:</strong><br>${this.escapeHtml(data.reason)}</div>`
      : '';
    const contactHtml = data.ownerName || data.ownerPhone
      ? `<p style="color:#666;font-size:14px">Nếu cần hỗ trợ, bạn có thể liên hệ <strong>${this.escapeHtml(data.ownerName ?? 'chủ nhà')}</strong>${data.ownerPhone ? ` — <a href="tel:${data.ownerPhone}">${data.ownerPhone}</a>` : ''}.</p>`
      : '';

    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#222">
  <h2 style="margin:0 0 16px">Đặt phòng đã bị huỷ</h2>
  <p>Xin chào <strong>${this.escapeHtml(data.customerName)}</strong>,</p>
  <p>Rất tiếc, đặt phòng của bạn tại <strong>${this.escapeHtml(propLabel)}</strong> (nhận <strong>${checkin}</strong> → trả <strong>${checkout}</strong>) đã bị huỷ.</p>
  ${reasonHtml}
  ${contactHtml}
  <p style="margin-top:24px">Bạn có thể đặt lại phòng khác trên Halong24h bất cứ lúc nào.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#999;font-size:12px">— Halong24h Team</p>
</div>`;

    try {
      await this.transporter.sendMail({
        from,
        to: data.to,
        subject: 'Đặt phòng đã bị huỷ — Halong24h',
        text,
        html,
      });
    } catch (err) {
      this.logger.error(`Failed to send booking-cancelled to ${data.to}: ${(err as Error).message}`);
      throw err;
    }
  }

  async sendBookingConfirmed(data: BookingConfirmedEmailData): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`Skipping booking-confirmed email to ${data.to} — SMTP not configured`);
      return;
    }

    const from = this.configService.get<string>('SMTP_FROM') || 'Halong24h <noreply@halong24h.com>';
    const { subject, text, html } = renderBookingConfirmedEmail(data);

    try {
      await this.transporter.sendMail({ from, to: data.to, subject, text, html });
    } catch (err) {
      this.logger.error(`Failed to send booking-confirmed to ${data.to}: ${(err as Error).message}`);
      throw err;
    }
  }

  /** Chào mừng chủ nhà mới đăng ký (OWNER). Fire-and-forget từ auth/register. */
  async sendWelcomeOwner(data: WelcomeEmailData): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`Skipping welcome-owner email to ${data.to} — SMTP not configured`);
      return;
    }
    const from = this.configService.get<string>('SMTP_FROM') || 'Halong24h <noreply@halong24h.com>';
    const { subject, text, html } = renderWelcomeOwnerEmail(data);
    try {
      await this.transporter.sendMail({ from, to: data.to, subject, text, html });
    } catch (err) {
      this.logger.error(`Failed to send welcome-owner to ${data.to}: ${(err as Error).message}`);
    }
  }

  /** Chào mừng nhân viên SALE khi tài khoản được tạo (accept invite / admin tạo). */
  async sendWelcomeSale(data: WelcomeEmailData): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`Skipping welcome-sale email to ${data.to} — SMTP not configured`);
      return;
    }
    const from = this.configService.get<string>('SMTP_FROM') || 'Halong24h <noreply@halong24h.com>';
    const { subject, text, html } = renderWelcomeSaleEmail(data);
    try {
      await this.transporter.sendMail({ from, to: data.to, subject, text, html });
    } catch (err) {
      this.logger.error(`Failed to send welcome-sale to ${data.to}: ${(err as Error).message}`);
    }
  }

  /** KYC được duyệt — gửi chủ nhà. */
  async sendKycApproved(data: KycApprovedEmailData): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`Skipping kyc-approved email to ${data.to} — SMTP not configured`);
      return;
    }
    const from = this.configService.get<string>('SMTP_FROM') || 'Halong24h <noreply@halong24h.com>';
    const { subject, text, html } = renderKycApprovedEmail(data);
    try {
      await this.transporter.sendMail({ from, to: data.to, subject, text, html });
    } catch (err) {
      this.logger.error(`Failed to send kyc-approved to ${data.to}: ${(err as Error).message}`);
    }
  }

  /** KYC bị từ chối — gửi chủ nhà kèm lý do + mục cần bổ sung. */
  async sendKycRejected(data: KycRejectedEmailData): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`Skipping kyc-rejected email to ${data.to} — SMTP not configured`);
      return;
    }
    const from = this.configService.get<string>('SMTP_FROM') || 'Halong24h <noreply@halong24h.com>';
    const { subject, text, html } = renderKycRejectedEmail(data);
    try {
      await this.transporter.sendMail({ from, to: data.to, subject, text, html });
    } catch (err) {
      this.logger.error(`Failed to send kyc-rejected to ${data.to}: ${(err as Error).message}`);
    }
  }

  /** Mời khách đánh giá — gửi lúc 12h trưa ngày trả phòng (review đã mở). */
  async sendReviewInvitation(data: ReviewInvitationEmailData): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`Skipping review-invitation email to ${data.to} — SMTP not configured`);
      return;
    }
    const from = this.configService.get<string>('SMTP_FROM') || 'Halong24h <noreply@halong24h.com>';
    const { subject, text, html } = renderReviewInvitationEmail(data);
    try {
      await this.transporter.sendMail({ from, to: data.to, subject, text, html });
    } catch (err) {
      this.logger.error(`Failed to send review-invitation to ${data.to}: ${(err as Error).message}`);
    }
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async sendAccountDeletionScheduled(data: {
    to: string;
    name: string;
    scheduledDeleteAt: Date;
  }): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`Skipping deletion-scheduled email to ${data.to} — SMTP not configured`);
      return;
    }
    const from = this.configService.get<string>('SMTP_FROM') || 'Halong24h <noreply@halong24h.com>';
    const dateStr = data.scheduledDeleteAt.toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    const safeName = this.escapeHtml(data.name || 'Bạn');

    const text = `Xin chào ${data.name || 'bạn'},

Chúng tôi đã ghi nhận yêu cầu xoá tài khoản Halong24h gắn với email này.

Tài khoản sẽ bị xoá vĩnh viễn vào ngày ${dateStr} (sau 30 ngày grace theo Nghị định 13/2023/NĐ-CP). Toàn bộ KYC, lịch sử, ảnh và dữ liệu cá nhân sẽ bị xoá.

Nếu bạn đổi ý, chỉ cần đăng nhập lại trước ngày ${dateStr} — tài khoản sẽ được khôi phục tự động và mọi dữ liệu được giữ nguyên.

Nếu bạn không yêu cầu xoá tài khoản, hãy đăng nhập ngay để huỷ yêu cầu và đổi mật khẩu.

— Halong24h Team`;

    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#222">
  <h2 style="margin:0 0 16px">Yêu cầu xoá tài khoản — Halong24h</h2>
  <p>Xin chào <strong>${safeName}</strong>,</p>
  <p>Chúng tôi đã ghi nhận yêu cầu xoá tài khoản Halong24h gắn với email này.</p>
  <p style="background:#fff7e6;border-left:4px solid #f59e0b;padding:12px 16px;margin:16px 0">
    Tài khoản sẽ bị xoá vĩnh viễn vào ngày <strong>${dateStr}</strong> (sau 30 ngày grace theo Nghị định 13/2023/NĐ-CP).<br>
    Toàn bộ KYC, lịch sử, ảnh và dữ liệu cá nhân sẽ bị xoá.
  </p>
  <p><strong>Đổi ý?</strong> Chỉ cần đăng nhập lại trước ngày ${dateStr} — tài khoản sẽ được khôi phục tự động và mọi dữ liệu được giữ nguyên.</p>
  <p>Nếu bạn không yêu cầu xoá tài khoản, hãy đăng nhập ngay để huỷ yêu cầu và đổi mật khẩu.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#999;font-size:12px">— Halong24h Team</p>
</div>`;

    try {
      await this.transporter.sendMail({
        from,
        to: data.to,
        subject: `Yêu cầu xoá tài khoản — Halong24h (xoá vào ${dateStr})`,
        text,
        html,
      });
    } catch (err) {
      this.logger.error(`Failed to send deletion-scheduled email to ${data.to}: ${(err as Error).message}`);
    }
  }

  async sendAccountDeletionRestored(data: {
    to: string;
    name: string;
  }): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`Skipping deletion-restored email to ${data.to} — SMTP not configured`);
      return;
    }
    const from = this.configService.get<string>('SMTP_FROM') || 'Halong24h <noreply@halong24h.com>';
    const safeName = this.escapeHtml(data.name || 'Bạn');

    const text = `Xin chào ${data.name || 'bạn'},

Tài khoản Halong24h của bạn đã được khôi phục. Yêu cầu xoá tài khoản trước đó đã được huỷ và mọi dữ liệu (KYC, booking, cơ sở…) được giữ nguyên.

Nếu bạn không thực hiện thao tác này, hãy đổi mật khẩu ngay và liên hệ hỗ trợ.

— Halong24h Team`;

    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#222">
  <h2 style="margin:0 0 16px">Tài khoản đã được khôi phục — Halong24h</h2>
  <p>Xin chào <strong>${safeName}</strong>,</p>
  <p style="background:#ecfdf5;border-left:4px solid #10b981;padding:12px 16px;margin:16px 0">
    Tài khoản Halong24h của bạn đã được khôi phục. Yêu cầu xoá tài khoản trước đó đã được huỷ và mọi dữ liệu được giữ nguyên.
  </p>
  <p>Nếu bạn không thực hiện thao tác này, hãy <strong>đổi mật khẩu ngay</strong> và liên hệ hỗ trợ.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#999;font-size:12px">— Halong24h Team</p>
</div>`;

    try {
      await this.transporter.sendMail({
        from,
        to: data.to,
        subject: 'Tài khoản đã được khôi phục — Halong24h',
        text,
        html,
      });
    } catch (err) {
      this.logger.error(`Failed to send deletion-restored email to ${data.to}: ${(err as Error).message}`);
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

/** Escape HTML entities (module-level, dùng cho các renderer standalone). */
function escapeHtmlStr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render email xác nhận booking (dùng chung: sendBookingConfirmed + sample admin "Send test").
 * Trả về { subject, text, html }.
 */
export function renderBookingConfirmedEmail(data: BookingConfirmedEmailData): {
  subject: string;
  text: string;
  html: string;
} {
  const fmt = (d: Date) =>
    d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const checkin = fmt(data.checkinDate);
  const checkout = fmt(data.checkoutDate);
  const propLabel = data.propertyCode ? `${data.propertyName} (${data.propertyCode})` : data.propertyName;
  const vnd = (n: number) => `${n.toLocaleString('vi-VN')} đ`;
  const amount = vnd(data.paidAmount);
  const contactLine = data.ownerName || data.ownerPhone
    ? `\n\nChủ nhà: ${data.ownerName ?? ''}${data.ownerPhone ? ` — ${data.ownerPhone}` : ''}.`
    : '';

  // Dòng giá bổ sung (chỉ hiện khi BE truyền): tổng / cọc / còn lại.
  const priceLinesText =
    (data.totalAmount != null ? `\n  Tổng tiền: ${vnd(data.totalAmount)}` : '') +
    (data.depositAmount != null ? `\n  Tiền cọc: ${vnd(data.depositAmount)}` : '') +
    (data.remainingAmount != null ? `\n  Còn lại: ${vnd(data.remainingAmount)}` : '');

  const text = `Xin chào ${data.customerName},

Đặt phòng của bạn tại ${propLabel} đã được xác nhận và ghi nhận thanh toán.

  Mã booking: ${data.bookingCode}
  Nhận phòng: ${checkin}
  Trả phòng:  ${checkout}
  Đã thanh toán: ${amount}${priceLinesText}${contactLine}

Hẹn gặp bạn tại ${data.propertyName}!

— Halong24h Team`;

  const contactHtml = data.ownerName || data.ownerPhone
    ? `<p style="color:#666;font-size:14px">Chủ nhà: <strong>${escapeHtmlStr(data.ownerName ?? '')}</strong>${data.ownerPhone ? ` — <a href="tel:${data.ownerPhone}">${data.ownerPhone}</a>` : ''}.</p>`
    : '';

  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#222">
  <h2 style="margin:0 0 16px;color:#1a7f37">Đặt phòng đã được xác nhận</h2>
  <p>Xin chào <strong>${escapeHtmlStr(data.customerName)}</strong>,</p>
  <p>Đặt phòng của bạn tại <strong>${escapeHtmlStr(propLabel)}</strong> đã được xác nhận và ghi nhận thanh toán.</p>
  <table style="border-collapse:collapse;margin:16px 0;font-size:14px">
    <tr><td style="padding:6px 12px 6px 0;color:#666">Mã booking</td><td style="padding:6px 0"><strong>${escapeHtmlStr(data.bookingCode)}</strong></td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666">Nhận phòng</td><td style="padding:6px 0"><strong>${checkin}</strong></td></tr>
    <tr><td style="padding:6px 12px 6px 0;color:#666">Trả phòng</td><td style="padding:6px 0"><strong>${checkout}</strong></td></tr>
    ${data.totalAmount != null ? `<tr><td style="padding:6px 12px 6px 0;color:#666">Tổng tiền</td><td style="padding:6px 0"><strong>${vnd(data.totalAmount)}</strong></td></tr>` : ''}
    ${data.depositAmount != null ? `<tr><td style="padding:6px 12px 6px 0;color:#666">Tiền cọc</td><td style="padding:6px 0"><strong>${vnd(data.depositAmount)}</strong></td></tr>` : ''}
    <tr><td style="padding:6px 12px 6px 0;color:#666">Đã thanh toán</td><td style="padding:6px 0"><strong>${amount}</strong></td></tr>
    ${data.remainingAmount != null ? `<tr><td style="padding:6px 12px 6px 0;color:#666">Còn lại</td><td style="padding:6px 0"><strong>${vnd(data.remainingAmount)}</strong></td></tr>` : ''}
  </table>
  ${contactHtml}
  <p style="margin-top:24px">Hẹn gặp bạn tại ${escapeHtmlStr(data.propertyName)}!</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#999;font-size:12px">— Halong24h Team</p>
</div>`;

  return { subject: 'Đặt phòng đã được xác nhận — Halong24h', text, html };
}

/** Render email chào mừng chủ nhà (welcome_owner). */
export function renderWelcomeOwnerEmail(data: WelcomeEmailData): EmailSample {
  const safeName = escapeHtmlStr(data.name || 'Bạn');
  const text = `Xin chào ${data.name || 'bạn'},

Chào mừng bạn đến với Halong24h! Tài khoản chủ nhà của bạn đã được tạo thành công.

Để bắt đầu cho thuê cơ sở, vui lòng:
  1. Hoàn tất xác minh danh tính (KYC).
  2. Thêm cơ sở và bảng giá.
  3. Quản lý lịch đặt phòng, khách hàng ngay trên app.

Chúc bạn kinh doanh thuận lợi!

— Halong24h Team`;

  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#222">
  <h2 style="margin:0 0 16px;color:#1a7f37">Chào mừng đến với Halong24h 🎉</h2>
  <p>Xin chào <strong>${safeName}</strong>,</p>
  <p>Tài khoản <strong>chủ nhà</strong> của bạn đã được tạo thành công. Để bắt đầu cho thuê cơ sở:</p>
  <ol style="line-height:1.8">
    <li>Hoàn tất xác minh danh tính (KYC).</li>
    <li>Thêm cơ sở và bảng giá.</li>
    <li>Quản lý lịch đặt phòng, khách hàng ngay trên app.</li>
  </ol>
  <p style="margin-top:24px">Chúc bạn kinh doanh thuận lợi!</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#999;font-size:12px">— Halong24h Team</p>
</div>`;

  return { subject: 'Chào mừng bạn đến với Halong24h', text, html };
}

/** Render email chào mừng nhân viên SALE (welcome_sale). */
export function renderWelcomeSaleEmail(data: WelcomeEmailData): EmailSample {
  const safeName = escapeHtmlStr(data.name || 'Bạn');
  const text = `Xin chào ${data.name || 'bạn'},

Tài khoản nhân viên của bạn trên Halong24h đã sẵn sàng. Đăng nhập để bắt đầu hỗ trợ quản lý đặt phòng, lịch và khách hàng.

Nếu bạn cần thêm quyền thao tác, hãy liên hệ chủ nhà quản lý đội của bạn.

— Halong24h Team`;

  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#222">
  <h2 style="margin:0 0 16px">Tài khoản nhân viên đã sẵn sàng</h2>
  <p>Xin chào <strong>${safeName}</strong>,</p>
  <p>Tài khoản nhân viên của bạn trên Halong24h đã sẵn sàng. Đăng nhập để bắt đầu hỗ trợ quản lý đặt phòng, lịch và khách hàng.</p>
  <p style="color:#666;font-size:14px">Nếu bạn cần thêm quyền thao tác, hãy liên hệ chủ nhà quản lý đội của bạn.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#999;font-size:12px">— Halong24h Team</p>
</div>`;

  return { subject: 'Tài khoản nhân viên đã sẵn sàng — Halong24h', text, html };
}

/** Render email KYC được duyệt (kyc_approved). */
export function renderKycApprovedEmail(data: KycApprovedEmailData): EmailSample {
  const safeName = escapeHtmlStr(data.name || 'Bạn');
  const nextLine = data.canManageNow
    ? 'Bạn có thể bắt đầu quản lý cơ sở ngay bây giờ.'
    : 'Bạn có thể mua gói dịch vụ để bắt đầu quản lý cơ sở.';

  const text = `Xin chào ${data.name || 'bạn'},

Hồ sơ xác minh danh tính (KYC) của bạn đã được duyệt. ${nextLine}

— Halong24h Team`;

  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#222">
  <h2 style="margin:0 0 16px;color:#1a7f37">Hồ sơ KYC đã được duyệt ✅</h2>
  <p>Xin chào <strong>${safeName}</strong>,</p>
  <p style="background:#ecfdf5;border-left:4px solid #10b981;padding:12px 16px;margin:16px 0">
    Hồ sơ xác minh danh tính (KYC) của bạn đã được duyệt. ${nextLine}
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#999;font-size:12px">— Halong24h Team</p>
</div>`;

  return { subject: 'Hồ sơ KYC đã được duyệt — Halong24h', text, html };
}

/** Render email KYC bị từ chối (kyc_rejected). */
export function renderKycRejectedEmail(data: KycRejectedEmailData): EmailSample {
  const safeName = escapeHtmlStr(data.name || 'Bạn');
  const reason = data.reason?.trim();
  const items = (data.rejectedItems ?? []).filter(Boolean);
  const ITEM_LABELS: Record<string, string> = {
    cccdFront: 'CCCD mặt trước',
    cccdBack: 'CCCD mặt sau',
    selfie: 'Ảnh selfie',
  };
  const itemsLabelled = items.map((i) => ITEM_LABELS[i] ?? i);

  const reasonText = reason ? `\n\nLý do: ${reason}` : '';
  const itemsText = itemsLabelled.length ? `\n\nCần bổ sung: ${itemsLabelled.join(', ')}` : '';
  const text = `Xin chào ${data.name || 'bạn'},

Rất tiếc, hồ sơ xác minh danh tính (KYC) của bạn chưa được duyệt.${reasonText}${itemsText}

Vui lòng kiểm tra và gửi lại hồ sơ trên app.

— Halong24h Team`;

  const reasonHtml = reason
    ? `<div style="background:#fff8e1;border-left:4px solid #f0ad4e;padding:12px 16px;margin:16px 0;border-radius:4px"><strong>Lý do:</strong><br>${escapeHtmlStr(reason)}</div>`
    : '';
  const itemsHtml = itemsLabelled.length
    ? `<p><strong>Cần bổ sung:</strong> ${escapeHtmlStr(itemsLabelled.join(', '))}</p>`
    : '';
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#222">
  <h2 style="margin:0 0 16px">Hồ sơ KYC chưa được duyệt</h2>
  <p>Xin chào <strong>${safeName}</strong>,</p>
  <p>Rất tiếc, hồ sơ xác minh danh tính (KYC) của bạn chưa được duyệt.</p>
  ${reasonHtml}
  ${itemsHtml}
  <p style="margin-top:16px">Vui lòng kiểm tra và gửi lại hồ sơ trên app.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#999;font-size:12px">— Halong24h Team</p>
</div>`;

  return { subject: 'Hồ sơ KYC cần bổ sung — Halong24h', text, html };
}

/** Render email mời đánh giá (review_invitation). */
export function renderReviewInvitationEmail(data: ReviewInvitationEmailData): EmailSample {
  const safeName = escapeHtmlStr(data.customerName || 'Quý khách');
  const safeProp = escapeHtmlStr(data.propertyName || 'cơ sở');

  const text = `Xin chào ${data.customerName || 'Quý khách'},

Cảm ơn bạn đã lưu trú tại ${data.propertyName}. Kỳ nghỉ của bạn đã kết thúc — hãy dành chút thời gian chia sẻ trải nghiệm để giúp chủ nhà và những khách sau nhé!

  Mã đặt phòng: ${data.bookingCode}

Đánh giá ngay:
  ${data.reviewUrl}

Cảm ơn bạn,
— Halong24h Team`;

  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#222">
  <h2 style="margin:0 0 16px">Bạn thấy kỳ nghỉ thế nào? ⭐</h2>
  <p>Xin chào <strong>${safeName}</strong>,</p>
  <p>Cảm ơn bạn đã lưu trú tại <strong>${safeProp}</strong>. Kỳ nghỉ của bạn đã kết thúc — hãy dành chút thời gian chia sẻ trải nghiệm để giúp chủ nhà và những khách sau nhé!</p>
  <p style="color:#666;font-size:14px">Mã đặt phòng: <strong>${escapeHtmlStr(data.bookingCode)}</strong></p>
  <p style="margin:24px 0">
    <a href="${data.reviewUrl}"
       style="background:#f0ad4e;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:bold">
      Đánh giá ngay
    </a>
  </p>
  <p style="color:#666;font-size:13px">Hoặc copy link sau vào trình duyệt:</p>
  <p style="word-break:break-all;background:#f5f5f5;padding:10px;border-radius:4px;font-size:13px"><a href="${data.reviewUrl}">${data.reviewUrl}</a></p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
  <p style="color:#999;font-size:12px">— Halong24h Team</p>
</div>`;

  return { subject: 'Chia sẻ đánh giá kỳ nghỉ của bạn — Halong24h', text, html };
}

/**
 * Templates exposed to admin UI cho nút "Gửi test".
 * CHỈ liệt kê template thực sự được BE gửi tự động trong luồng nghiệp vụ —
 * không phơi các template chưa wire (tránh admin test 1 mail mà khách không bao giờ nhận).
 * Khi wire thêm template mới, thêm key vào đây + thêm sample bên dưới.
 */
export const EMAIL_TEMPLATE_KEYS = [
  'welcome_owner', // register/google/apple OWNER + admin tạo OWNER
  'welcome_sale', // accept staff invite + admin tạo SALE
  'password_reset', // forgot-password
  'booking_confirmed', // mark-paid (ghi nhận cọc) + check-in hoàn tất
  'booking_cancelled', // huỷ booking
  'kyc_approved', // admin duyệt KYC
  'kyc_rejected', // admin từ chối KYC
  'staff_invite', // OWNER/ADMIN mời SALE
  'review_invitation', // cron 12h trưa ngày checkout → mời khách đánh giá
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

const EMAIL_TEMPLATE_SAMPLES: Record<string, EmailSample> = {
  welcome_owner: renderWelcomeOwnerEmail({ to: '', name: 'Nguyễn Văn A' }),
  welcome_sale: renderWelcomeSaleEmail({ to: '', name: 'Trần Thị B' }),
  password_reset: {
    subject: 'Đặt lại mật khẩu — Halong24h',
    text: 'Bấm vào link để đặt mật khẩu mới. Link hết hạn sau 10 phút. Nếu không phải bạn, có thể bỏ qua email này.',
    html: '<p>Bấm vào link để đặt mật khẩu mới. Link hết hạn sau <strong>10 phút</strong>. Nếu không phải bạn, có thể bỏ qua email này.</p>',
  },
  booking_confirmed: renderBookingConfirmedEmail({
    to: '',
    customerName: 'Nguyễn Văn A',
    propertyName: 'Villa Bãi Cháy 3 phòng ngủ',
    propertyCode: 'HL-DEMO01',
    checkinDate: new Date('2026-07-10T00:00:00.000Z'),
    checkoutDate: new Date('2026-07-12T00:00:00.000Z'),
    paidAmount: 2000000,
    totalAmount: 4000000,
    depositAmount: 2000000,
    remainingAmount: 2000000,
    bookingCode: 'HL-ABC12345',
    ownerName: 'Trần Thị B',
    ownerPhone: '0901234567',
  }),
  booking_cancelled: {
    subject: 'Đặt phòng đã huỷ',
    text: 'Booking #SAMPLE đã bị huỷ.',
    html: '<p>Booking <b>#SAMPLE</b> đã bị huỷ.</p>',
  },
  kyc_approved: renderKycApprovedEmail({ to: '', name: 'Nguyễn Văn A', canManageNow: true }),
  kyc_rejected: renderKycRejectedEmail({
    to: '',
    name: 'Nguyễn Văn A',
    reason: 'Ảnh CCCD mờ, vui lòng chụp lại rõ nét.',
    rejectedItems: ['cccdFront', 'selfie'],
  }),
  staff_invite: {
    subject: 'Bạn được mời làm nhân viên',
    text: 'Đây là mẫu lời mời nhân viên (test render).',
    html: '<p>Đây là mẫu lời mời nhân viên (test render).</p>',
  },
  review_invitation: renderReviewInvitationEmail({
    to: '',
    customerName: 'Nguyễn Văn A',
    propertyName: 'Villa Bãi Cháy 3 phòng ngủ',
    reviewUrl: 'https://halong24h.com/my/bookings/HL-DEMO01',
    bookingCode: 'HL-ABC12345',
  }),
};
