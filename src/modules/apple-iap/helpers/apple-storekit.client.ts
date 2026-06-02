import { Logger } from '@nestjs/common';
import { signAppStoreJwt, verifyAppleJws } from './apple-jwt.helper';

const logger = new Logger('AppleStoreKitClient');

const PROD_BASE = 'https://api.storekit.itunes.apple.com';
const SANDBOX_BASE = 'https://api.storekit-sandbox.itunes.apple.com';

export type AppleTransactionInfo = {
  productId: string;
  bundleId: string;
  transactionId: string;
  originalTransactionId: string;
  purchaseDate: Date;
  expiresAt: Date;
  environment: 'Production' | 'Sandbox';
  raw: Record<string, any>;
};

/**
 * Lookup transaction theo originalTransactionId.
 * Apple yêu cầu thử production trước, fallback sandbox khi 404.
 */
export async function fetchTransactionInfo(
  originalTransactionId: string,
): Promise<AppleTransactionInfo> {
  const path = `/inApps/v1/transactions/${originalTransactionId}`;
  const token = signAppStoreJwt();

  let res = await callAppleApi(`${PROD_BASE}${path}`, token);
  if (res.status === 404) {
    logger.debug(`Tx ${originalTransactionId} not in prod, falling back to sandbox`);
    res = await callAppleApi(`${SANDBOX_BASE}${path}`, token);
  }

  if (!res.ok) {
    throw new Error(`Apple API trả ${res.status}: ${await safeText(res)}`);
  }

  const body = (await res.json()) as { signedTransactionInfo?: string };
  if (!body.signedTransactionInfo) {
    throw new Error('Apple API: thiếu signedTransactionInfo');
  }

  return decodeTransactionInfo(body.signedTransactionInfo);
}

/** Decode + verify signedTransactionInfo JWS từ Apple */
export function decodeTransactionInfo(signedJws: string): AppleTransactionInfo {
  const payload = verifyAppleJws<{
    productId: string;
    bundleId: string;
    transactionId: string;
    originalTransactionId: string;
    purchaseDate: number;
    expiresDate?: number;
    environment: 'Production' | 'Sandbox';
  }>(signedJws);

  if (!payload.expiresDate) {
    throw new Error('Apple transaction không có expiresDate (chỉ subscription mới support)');
  }

  return {
    productId: payload.productId,
    bundleId: payload.bundleId,
    transactionId: payload.transactionId,
    originalTransactionId: payload.originalTransactionId,
    purchaseDate: new Date(payload.purchaseDate),
    expiresAt: new Date(payload.expiresDate),
    environment: payload.environment,
    raw: payload,
  };
}

async function callAppleApi(url: string, token: string): Promise<Response> {
  return fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
