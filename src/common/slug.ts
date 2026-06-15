// Vietnamese-aware slug helper. Used by Property create/update.
// Keep table in sync with SQL backfill in
// prisma/migrations/20260615132743_property_customer_web_fields/migration.sql

const VN_FROM = 'àáạảãâầấậẩẫăằắặẳẵÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴèéẹẻẽêềếệểễÈÉẸẺẼÊỀẾỆỂỄìíịỉĩÌÍỊỈĨòóọỏõôồốộổỗơờớợởỡÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠùúụủũưừứựửữÙÚỤỦŨƯỪỨỰỬỮỳýỵỷỹỲÝỴỶỸđĐ';
const VN_TO = 'aaaaaaaaaaaaaaaaaAAAAAAAAAAAAAAAAAeeeeeeeeeeeEEEEEEEEEEEiiiiiIIIIIooooooooooooooooooOOOOOOOOOOOOOOOOOuuuuuuuuuuuUUUUUUUUUUUyyyyyYYYYYdD';

function transliterate(input: string): string {
  let out = '';
  for (const ch of input) {
    const idx = VN_FROM.indexOf(ch);
    out += idx === -1 ? ch : VN_TO[idx];
  }
  return out;
}

export function slugify(input: string): string {
  return transliterate(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Compose property slug from name + a stable suffix (lowercased code).
// Caller is still responsible for uniqueness — see ensureUniqueSlug below.
export function buildPropertySlug(name: string, code: string): string {
  const base = slugify(`${name}-${code}`);
  return base || `property-${code.toLowerCase()}`;
}

// Returns a slug guaranteed not to collide with existing values.
// `lookup` returns true when a slug is already taken.
export async function ensureUniqueSlug(
  base: string,
  lookup: (candidate: string) => Promise<boolean>,
): Promise<string> {
  if (!(await lookup(base))) return base;
  for (let i = 2; i < 50; i++) {
    const candidate = `${base}-${i}`;
    if (!(await lookup(candidate))) return candidate;
  }
  // Extremely unlikely fallback: append timestamp.
  return `${base}-${Date.now().toString(36)}`;
}
