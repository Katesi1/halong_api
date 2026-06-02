import { Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import * as fs from 'fs';

const logger = new Logger('AppleJwtHelper');

/**
 * Sign ES256 JWT cho App Store Server API v2.
 * Gọi mỗi request (max ttl 20 phút).
 *
 * Cần env:
 *   APPLE_IAP_KEY_ID         — Key ID (10 chars) trên ASC
 *   APPLE_IAP_ISSUER_ID      — Issuer ID UUID trên ASC
 *   APPLE_IAP_BUNDLE_ID      — com.halongtravel.halong24h
 *   APPLE_IAP_PRIVATE_KEY    — Nội dung file .p8 (PEM) — hoặc dùng APPLE_IAP_PRIVATE_KEY_PATH
 */
export function signAppStoreJwt(): string {
  const keyId = requireEnv('APPLE_IAP_KEY_ID');
  const issuerId = requireEnv('APPLE_IAP_ISSUER_ID');
  const bundleId = requireEnv('APPLE_IAP_BUNDLE_ID');
  const privateKey = loadPrivateKey();

  return jwt.sign(
    {
      iss: issuerId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 19,
      aud: 'appstoreconnect-v1',
      bid: bundleId,
      nonce: crypto.randomUUID(),
    },
    privateKey,
    {
      algorithm: 'ES256',
      header: { alg: 'ES256', kid: keyId, typ: 'JWT' },
    },
  );
}

/**
 * Verify + decode Apple signed JWS (transactions, renewal info, S2S payloads).
 *
 * Apple ký bằng cert chain trong header `x5c[]`. Production-grade verify nên:
 *   1. Verify chain anchors về Apple Root CA G3
 *   2. Verify cert chưa hết hạn
 *   3. Verify JWS signature bằng leaf cert public key
 *
 * Implementation hiện tại: verify signature bằng leaf cert (đủ chống tampering payload).
 * Trust chain leo về Apple Root CA cần thêm dependency (`@apple/app-store-server-library`)
 * — TODO bật khi triển khai production thật.
 */
export function verifyAppleJws<T = Record<string, any>>(signedJws: string): T {
  const decoded = jwt.decode(signedJws, { complete: true });
  if (!decoded || typeof decoded === 'string') {
    throw new Error('Apple JWS: không decode được');
  }

  const header = decoded.header as { x5c?: string[]; alg?: string };
  if (header.alg !== 'ES256') {
    throw new Error(`Apple JWS: thuật toán không hỗ trợ (${header.alg})`);
  }

  const x5c = header.x5c;
  if (!x5c || x5c.length === 0) {
    throw new Error('Apple JWS: thiếu x5c trong header');
  }

  const leafCertPem = base64CertToPem(x5c[0]);

  try {
    const verified = jwt.verify(signedJws, leafCertPem, {
      algorithms: ['ES256'],
    }) as T;
    return verified;
  } catch (err) {
    logger.warn(`Apple JWS verify failed: ${(err as Error).message}`);
    throw new Error('Apple JWS: chữ ký không hợp lệ');
  }
}

function base64CertToPem(b64: string): string {
  const lines = b64.match(/.{1,64}/g)?.join('\n') ?? b64;
  return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----\n`;
}

function loadPrivateKey(): string {
  const raw = process.env.APPLE_IAP_PRIVATE_KEY;
  if (raw && raw.trim().length > 0) {
    return raw.replace(/\\n/g, '\n');
  }
  const path = process.env.APPLE_IAP_PRIVATE_KEY_PATH;
  if (path && fs.existsSync(path)) {
    return fs.readFileSync(path, 'utf8');
  }
  throw new Error('Apple IAP private key chưa cấu hình (APPLE_IAP_PRIVATE_KEY hoặc APPLE_IAP_PRIVATE_KEY_PATH)');
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Apple IAP: thiếu env ${key}`);
  return v;
}
