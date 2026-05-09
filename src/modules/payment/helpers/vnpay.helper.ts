import * as crypto from 'crypto';

export interface VnpayConfig {
  tmnCode: string;
  hashSecret: string;
  apiUrl: string;       // gateway pay URL
  returnUrl: string;
  ipnUrl?: string;
}

/** Sort object keys alphabetically (VNPay requirement). */
function sortObject(obj: Record<string, string | number>): Record<string, string> {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = encodeURIComponent(String(obj[key])).replace(/%20/g, '+');
  }
  return sorted;
}

/** Format Date as YYYYMMDDHHMMSS in Asia/Ho_Chi_Minh (UTC+7). */
export function formatVnpayDate(date: Date = new Date()): string {
  const tz = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    tz.getUTCFullYear().toString() +
    pad(tz.getUTCMonth() + 1) +
    pad(tz.getUTCDate()) +
    pad(tz.getUTCHours()) +
    pad(tz.getUTCMinutes()) +
    pad(tz.getUTCSeconds())
  );
}

/** Build the VNPay Gateway pay URL with HMAC-SHA512 signature. */
export function buildVnpayPayUrl(
  config: VnpayConfig,
  params: {
    sessionId: string;
    amount: number;       // VND, will be ×100 for VNPay
    orderInfo: string;
    ipAddr: string;
    locale?: 'vn' | 'en';
    bankCode?: string;    // optional: VNPAYQR | VNBANK | INTCARD
    expireMinutes?: number;
  },
): { payUrl: string; createDate: string; expireDate: string } {
  const createDate = formatVnpayDate();
  const expireMs = (params.expireMinutes ?? 15) * 60 * 1000;
  const expireDate = formatVnpayDate(new Date(Date.now() + expireMs));

  const vnpParams: Record<string, string | number> = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: config.tmnCode,
    vnp_Amount: params.amount * 100,
    vnp_CurrCode: 'VND',
    vnp_TxnRef: params.sessionId,
    vnp_OrderInfo: params.orderInfo,
    vnp_OrderType: 'other',
    vnp_Locale: params.locale ?? 'vn',
    vnp_ReturnUrl: config.returnUrl,
    vnp_IpAddr: params.ipAddr || '127.0.0.1',
    vnp_CreateDate: createDate,
    vnp_ExpireDate: expireDate,
  };
  if (params.bankCode) {
    vnpParams.vnp_BankCode = params.bankCode;
  }

  const sorted = sortObject(vnpParams);
  const signData = Object.entries(sorted)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const secureHash = crypto
    .createHmac('sha512', config.hashSecret)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');

  const payUrl = `${config.apiUrl}?${signData}&vnp_SecureHash=${secureHash}`;
  return { payUrl, createDate, expireDate };
}

/**
 * Verify HMAC-SHA512 signature from a VNPay IPN/return payload.
 * VNPay sends `vnp_SecureHash` (and historically `vnp_SecureHashType`) — these are
 * excluded before signing the rest.
 */
export function verifyVnpaySignature(
  payload: Record<string, string>,
  hashSecret: string,
): boolean {
  const received = payload.vnp_SecureHash;
  if (!received) return false;

  const filtered: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (k === 'vnp_SecureHash' || k === 'vnp_SecureHashType') continue;
    if (v === undefined || v === null || v === '') continue;
    filtered[k] = v;
  }
  const sorted = sortObject(filtered);
  const signData = Object.entries(sorted)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const expected = crypto
    .createHmac('sha512', hashSecret)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');

  // timing-safe compare
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(received.toLowerCase(), 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
