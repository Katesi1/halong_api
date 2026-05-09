/**
 * Build a VietQR (NAPAS QR) EMV payload string.
 *
 * Reference: https://vietqr.net/portal/document
 *
 * Tag layout:
 *   00 — Payload Format Indicator   = "01"
 *   01 — Point of Initiation Method = "12" (dynamic) | "11" (static)
 *   38 — Merchant Account Information (NAPAS)
 *      00 — GUID = "A000000727"
 *      01 — Beneficiary
 *         00 — BIN (6 digits)
 *         01 — Account number
 *      02 — Service code = "QRIBFTTA" | "QRIBFTTC"
 *   53 — Currency code = "704" (VND)
 *   54 — Transaction amount (optional for static, required for dynamic)
 *   58 — Country code = "VN"
 *   62 — Additional data
 *      08 — Purpose of transaction (the transfer message)
 *   63 — CRC (4 hex chars, CRC-16/CCITT-FALSE)
 */

function tlv(tag: string, value: string): string {
  const length = value.length.toString().padStart(2, '0');
  return `${tag}${length}${value}`;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF). */
function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface VietQrParams {
  bankBin: string;          // e.g. "970436" (Vietcombank)
  accountNumber: string;
  amount: number;           // VND
  content: string;          // transfer description (no diacritics, ≤ 50 chars recommended)
  service?: 'QRIBFTTA' | 'QRIBFTTC'; // default QRIBFTTA (account)
}

/** Build EMV string for VietQR. Caller is responsible for ASCII-safe content. */
export function buildVietQrPayload(params: VietQrParams): string {
  const merchantAccount =
    tlv('00', 'A000000727') +
    tlv(
      '01',
      tlv('00', params.bankBin) + tlv('01', params.accountNumber),
    ) +
    tlv('02', params.service ?? 'QRIBFTTA');

  const additionalData = tlv('08', params.content);

  const payloadWithoutCrc =
    tlv('00', '01') +
    tlv('01', '12') +
    tlv('38', merchantAccount) +
    tlv('53', '704') +
    tlv('54', String(params.amount)) +
    tlv('58', 'VN') +
    tlv('62', additionalData) +
    '6304'; // CRC tag + length placeholder

  const crc = crc16(payloadWithoutCrc);
  return payloadWithoutCrc + crc;
}

/** Strip Vietnamese diacritics + non-alphanumeric for safe transfer content. */
export function sanitizeTransferContent(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, 50);
}
