/**
 * Bank webhook payload normalization for Casso & Sepay.
 *
 * Casso payload (https://docs.casso.vn):
 *   { id, amount, description, tid, when, ... }
 *
 * Sepay payload (https://sepay.vn):
 *   { id, gateway, transactionDate, accountNumber, content, transferAmount, transferType, referenceCode, ... }
 *
 * Description / content always carries the unique session prefix we set when
 * generating the VietQR (e.g. "HALONG24H PAY_XXXXXX").
 */

export interface NormalizedBankTxn {
  provider: 'casso' | 'sepay';
  externalId: string;
  amount: number;
  description: string;
  referenceCode?: string;
  occurredAt?: Date;
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

/** Auto-detect provider and normalize. Returns null if shape is unrecognized. */
export function parseBankWebhookPayload(
  payload: Record<string, any>,
): NormalizedBankTxn | null {
  // Sepay markers: `transferAmount`, `transferType`, `gateway`
  if (
    payload.transferAmount !== undefined ||
    payload.gateway !== undefined ||
    payload.transferType !== undefined
  ) {
    const amountRaw = payload.transferAmount ?? payload.amount;
    const amount = typeof amountRaw === 'string' ? Number(amountRaw) : amountRaw;
    if (!Number.isFinite(amount)) return null;
    return {
      provider: 'sepay',
      externalId: String(payload.id ?? payload.referenceCode ?? ''),
      amount: Math.round(amount),
      description: String(payload.content ?? payload.description ?? ''),
      referenceCode: payload.referenceCode
        ? String(payload.referenceCode)
        : undefined,
      occurredAt: parseDate(payload.transactionDate ?? payload.when),
    };
  }

  // Casso markers: `tid`, `when`, `description`
  if (payload.description !== undefined && payload.amount !== undefined) {
    const amount =
      typeof payload.amount === 'string' ? Number(payload.amount) : payload.amount;
    if (!Number.isFinite(amount)) return null;
    return {
      provider: 'casso',
      externalId: String(payload.id ?? payload.tid ?? ''),
      amount: Math.round(amount),
      description: String(payload.description ?? ''),
      referenceCode: payload.tid ? String(payload.tid) : undefined,
      occurredAt: parseDate(payload.when),
    };
  }

  return null;
}

/** Extract our session id (UUID) from a transfer description. */
export function extractSessionIdFromDescription(
  description: string,
): string | null {
  // We embed the session id as `HALONG24H <SHORT-ID-OR-UUID>` in transfer content.
  // First try a UUID match (full payment session id).
  const uuidMatch = description.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  if (uuidMatch) return uuidMatch[0].toLowerCase();

  // Fallback: short prefix style "PAY_XXXXXX" if older content reaches us.
  const shortMatch = description.match(/PAY[_-]?[A-Z0-9]+/i);
  if (shortMatch) return shortMatch[0].toUpperCase();

  return null;
}
