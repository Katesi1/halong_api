// One-off script: normalize Property.amenities về canonical kebab-case keys
// (xem src/modules/properties/property-enums.ts).
//
// Chạy: npx ts-node prisma/normalize-amenities.ts
//   --dry-run  → in ra thay đổi, không update DB
//   (mặc định) → update DB

import { PrismaClient } from '@prisma/client';
import { PROPERTY_AMENITIES } from '../src/modules/properties/property-enums';

const prisma = new PrismaClient();

// Map từ raw string (lowercased, trimmed) sang canonical key.
// Không có trong map = drop khỏi danh sách.
const MAP: Record<string, string> = {
  // Wifi / network
  'wifi': 'wifi',

  // Aircon
  'điều hòa': 'ac',
  'dieu hoa': 'ac',
  'aircon': 'ac',
  'air-con': 'ac',
  'ac': 'ac',

  // Pool
  'bể bơi': 'pool',
  'be boi': 'pool',
  'pool': 'pool',

  // BBQ
  'bbq ngoài trời': 'bbq',
  'bbq': 'bbq',

  // Kitchen
  'bếp đầy đủ': 'kitchen',
  'bep day du': 'kitchen',
  'kitchen': 'kitchen',
  'bếp từ': 'induction-cooker',
  'bep tu': 'induction-cooker',

  // Parking
  'đỗ xe': 'parking',
  'do xe': 'parking',
  'parking': 'parking',

  // Breakfast / minibar / bar
  'breakfast': 'breakfast',
  'minibar': 'minibar',
  'bar': 'bar',

  // View
  'view biển': 'seaview',
  'view bien': 'seaview',
  'seaview': 'seaview',
  'sea-view': 'seaview',

  // Detail / household
  'tv': 'tv',
  'tivi': 'tv',
  'tủ lạnh': 'fridge',
  'tu lanh': 'fridge',
  'lò vi sóng': 'microwave',
  'lo vi song': 'microwave',
  'bát đũa': 'dishware',
  'bat dua': 'dishware',
  'nước lọc free': 'free-water',
  'nuoc loc free': 'free-water',
  'bồn tắm': 'bathtub',
  'bon tam': 'bathtub',
  'vòi sen': 'shower',
  'voi sen': 'shower',
  'nước nóng': 'hot-water',
  'nuoc nong': 'hot-water',
  'máy sấy tóc': 'hair-dryer',
  'may say toc': 'hair-dryer',
  'khăn tắm': 'towels',
  'khan tam': 'towels',
  'dầu gội/sữa tắm': 'toiletries',
  'dau goi/sua tam': 'toiletries',
  'máy giặt': 'washing-machine',
  'may giat': 'washing-machine',
  'tủ quần áo': 'wardrobe',
  'tu quan ao': 'wardrobe',
  'thang máy': 'elevator',
  'thang may': 'elevator',
  'khu vui chơi trẻ em': 'kids-area',
  'khu vui choi tre em': 'kids-area',
  'bàn là': 'iron',
  'ban la': 'iron',
  'đèn sưởi': 'heater',
  'den suoi': 'heater',
  'karaoke': 'karaoke',
  'két sắt': 'safe-box',
  'ket sat': 'safe-box',
  'loa di động': 'speaker',
  'loa di dong': 'speaker',
  'ban công': 'balcony',
  'ban cong': 'balcony',
  'sân thượng': 'rooftop',
  'san thuong': 'rooftop',
  'sân vườn': 'garden',
  'san vuon': 'garden',
};

const CANONICAL = new Set<string>(PROPERTY_AMENITIES);

function normalizeOne(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  // Already canonical?
  if (CANONICAL.has(key)) return key;
  // Mapped?
  if (MAP[key]) return MAP[key];
  return null;
}

function normalizeList(input: string[]): { mapped: string[]; dropped: string[] } {
  const mapped = new Set<string>();
  const dropped: string[] = [];
  for (const raw of input) {
    const k = normalizeOne(raw);
    if (k) mapped.add(k);
    else dropped.push(raw);
  }
  return { mapped: Array.from(mapped), dropped };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const props = await prisma.property.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, code: true, amenities: true },
  });

  let changed = 0;
  const totalDropped = new Map<string, number>();

  for (const p of props) {
    const { mapped, dropped } = normalizeList(p.amenities);
    for (const d of dropped) totalDropped.set(d, (totalDropped.get(d) ?? 0) + 1);

    const before = [...p.amenities].sort().join(',');
    const after = [...mapped].sort().join(',');
    if (before === after) continue;

    changed++;
    console.log(`\n[${p.code}] ${p.name}`);
    console.log(`  before: ${JSON.stringify(p.amenities)}`);
    console.log(`  after : ${JSON.stringify(mapped)}`);
    if (dropped.length) console.log(`  dropped: ${JSON.stringify(dropped)}`);

    if (!dryRun) {
      await prisma.property.update({
        where: { id: p.id },
        data: { amenities: mapped },
      });
    }
  }

  console.log(`\n──────────────────────────────────────────`);
  console.log(`${dryRun ? '[DRY-RUN] ' : ''}Properties changed: ${changed} / ${props.length}`);
  if (totalDropped.size > 0) {
    console.log(`\nDropped amenities (chưa map):`);
    for (const [k, n] of [...totalDropped.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n}× "${k}"`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
