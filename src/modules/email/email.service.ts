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
}
