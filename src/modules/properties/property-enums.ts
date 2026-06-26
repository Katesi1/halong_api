// Shared vocabulary for Property filters / DTOs. Keep in sync with FE.

export const PROPERTY_VIEWS = ['sea', 'city', 'mountain', 'garden', 'pool'] as const;
export type PropertyView = typeof PROPERTY_VIEWS[number];

// Canonical amenity keys (kebab-case). FE must use the exact same strings.
// Đã gom cả nhóm tiện nghi cơ bản (filterable trên card) lẫn nhóm chi tiết
// (chỉ hiển thị ở trang detail). FE chọn subset nào dùng làm chip filter.
export const PROPERTY_AMENITIES = [
  // Core / filterable
  'wifi',
  'pool',
  'bbq',
  'kitchen',
  'parking',
  'ac',
  'gym',
  'breakfast',
  'spa',
  'restaurant',
  'jacuzzi',
  'bar',
  // Views
  'seaview',
  'bayview',
  'cityview',
  'gardenview',
  'mountainview',
  // Detail amenities (hiển thị ở detail page hoặc filter mở rộng)
  'tv',
  'fridge',
  'microwave',
  'induction-cooker',
  'dishware',
  'free-water',
  'bathtub',
  'shower',
  'hot-water',
  'hair-dryer',
  'towels',
  'toiletries',
  'washing-machine',
  'wardrobe',
  'elevator',
  'kids-area',
  'iron',
  'heater',
  'karaoke',
  'safe-box',
  'speaker',
  'balcony',
  'rooftop',
  'garden',
  'minibar',
  // Safety / policy
  'pet-friendly',
  'security-camera',
  'smoke-detector',
  'first-aid-kit',
] as const;
export type PropertyAmenity = typeof PROPERTY_AMENITIES[number];

export const PROPERTY_SORTS = ['price_asc', 'price_desc', 'rating', 'newest', 'featured'] as const;
export type PropertySort = typeof PROPERTY_SORTS[number];

// Threshold for derived isGuestFavorite. Tunable here without DB migration.
export const GUEST_FAVORITE_MIN_RATING = 4.8;
export const GUEST_FAVORITE_MIN_REVIEWS = 5;
