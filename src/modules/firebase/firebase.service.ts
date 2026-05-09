import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

export interface FcmPayload {
  title: string;
  body?: string;
  /** Custom data (target route, ID, etc.) — phải là Record<string,string> */
  data?: Record<string, string>;
}

export interface SendResult {
  successCount: number;
  failureCount: number;
  /** Các token bị reject vĩnh viễn (unregistered/invalid) — caller nên xoá khỏi DB */
  invalidTokens: string[];
}

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app: admin.app.App | null = null;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const credPath = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');
    if (!credPath) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT_PATH missing — FCM push disabled');
      return;
    }

    const absPath = path.isAbsolute(credPath) ? credPath : path.resolve(process.cwd(), credPath);
    if (!fs.existsSync(absPath)) {
      this.logger.warn(`Firebase service account not found at ${absPath} — FCM push disabled`);
      return;
    }

    try {
      const serviceAccount = JSON.parse(fs.readFileSync(absPath, 'utf-8'));
      this.app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      this.logger.log(`Firebase Admin initialized for project ${serviceAccount.project_id}`);
    } catch (err) {
      this.logger.error(`Failed to init Firebase Admin: ${(err as Error).message}`);
      this.app = null;
    }
  }

  isEnabled(): boolean {
    return this.app !== null;
  }

  /**
   * Gửi push tới N tokens (fan out). Trả về số thành công/thất bại + các token cần xoá.
   * Không throw — Firebase fail không được làm hỏng business flow.
   */
  async sendToTokens(tokens: string[], payload: FcmPayload): Promise<SendResult> {
    const result: SendResult = { successCount: 0, failureCount: 0, invalidTokens: [] };
    if (!this.app || tokens.length === 0) return result;

    const message: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data,
      android: {
        priority: 'high',
        notification: { sound: 'default' },
      },
      apns: {
        payload: {
          aps: { sound: 'default', badge: 1 },
        },
      },
    };

    try {
      const resp = await admin.messaging().sendEachForMulticast(message);
      result.successCount = resp.successCount;
      result.failureCount = resp.failureCount;

      resp.responses.forEach((r, idx) => {
        if (r.success) return;
        const code = r.error?.code || '';
        // Token không còn hợp lệ → caller xoá khỏi DB
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/invalid-argument'
        ) {
          result.invalidTokens.push(tokens[idx]);
        }
      });

      if (result.failureCount > 0) {
        this.logger.warn(`FCM partial fail: ${result.failureCount}/${tokens.length} (invalid: ${result.invalidTokens.length})`);
      }
    } catch (err) {
      this.logger.error(`FCM send error: ${(err as Error).message}`);
      result.failureCount = tokens.length;
    }

    return result;
  }
}
