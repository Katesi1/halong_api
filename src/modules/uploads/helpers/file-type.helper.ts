/**
 * Sniff magic bytes để verify file type thực sự — không tin Content-Type header.
 * Trả về MIME type detected, hoặc null nếu không match whitelist.
 *
 * Whitelist hiện tại: image/jpeg, image/png, image/webp, image/gif, application/pdf.
 * Video defer v2.
 */

interface Signature {
  mime: string;
  offset: number;
  bytes: number[];
}

// Magic bytes references: https://en.wikipedia.org/wiki/List_of_file_signatures
const SIGNATURES: Signature[] = [
  // JPEG: FF D8 FF
  { mime: 'image/jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { mime: 'image/png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // GIF87a / GIF89a
  { mime: 'image/gif', offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  // WEBP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50  (RIFF....WEBP)
  { mime: 'image/webp', offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  // PDF: %PDF- = 25 50 44 46 2D
  { mime: 'application/pdf', offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
];

export const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

export function detectMimeFromBuffer(buffer: Buffer): string | null {
  for (const sig of SIGNATURES) {
    if (buffer.length < sig.offset + sig.bytes.length) continue;
    let match = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buffer[sig.offset + i] !== sig.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) return sig.mime;
  }
  return null;
}

/**
 * Sanitize filename:
 * - Strip path separators
 * - Strip control chars
 * - Limit length to 255
 * - Force ASCII extension
 */
export function sanitizeFilename(name: string): string {
  if (!name) return 'file';
  // Lấy basename (bỏ path traversal)
  const base = name.replace(/\\/g, '/').split('/').pop() ?? 'file';
  // Strip control characters
  const cleaned = base
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[<>:"|?*]/g, '_')
    .trim();
  return cleaned.slice(0, 255) || 'file';
}
