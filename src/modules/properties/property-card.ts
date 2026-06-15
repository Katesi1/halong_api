// Shapes a Property row + its images/owner into the public "card" payload
// consumed by the customer web list (and any other anonymous surface).

import {
  GUEST_FAVORITE_MIN_RATING,
  GUEST_FAVORITE_MIN_REVIEWS,
} from './property-enums';

type ImageRow = {
  id: string;
  imageUrl: string;
  isCover: boolean;
  order: number;
};

type PropertyRow = {
  id: string;
  slug: string;
  name: string;
  code: string;
  type: number;
  view: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  bedrooms: number;
  bathrooms: number;
  standardGuests: number;
  maxGuests: number;
  floorArea: number | null;
  amenities: string[];
  weekdayPrice: number | null;
  weekendPrice: number | null;
  holidayPrice: number | null;
  ratingAvg: number;
  reviewCount: number;
  images: ImageRow[];
};

export interface PropertyCardDto {
  id: string;
  slug: string;
  name: string;
  code: string;
  type: number;
  view: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  bedrooms: number;
  bathrooms: number;
  standardGuests: number;
  maxGuests: number;
  floorArea: number | null;
  amenities: string[];
  weekdayPrice: number | null;
  weekendPrice: number | null;
  holidayPrice: number | null;
  minPrice: number | null;
  rating: number;
  reviewCount: number;
  isGuestFavorite: boolean;
  // True nếu user hiện tại (từ JWT) đã save property này.
  // Anonymous request luôn false. Cập nhật bằng POST/DELETE /properties/:id/favorite.
  isFavorited: boolean;
  coverImageUrl: string | null;
  images: ImageRow[];
}

function computeMinPrice(row: PropertyRow): number | null {
  const candidates = [row.weekdayPrice, row.weekendPrice, row.holidayPrice]
    .filter((v): v is number => typeof v === 'number' && v > 0);
  return candidates.length === 0 ? null : Math.min(...candidates);
}

function pickCoverUrl(images: ImageRow[]): string | null {
  if (!images || images.length === 0) return null;
  const cover = images.find((img) => img.isCover);
  return (cover ?? images[0]).imageUrl;
}

export function toPropertyCard(
  row: PropertyRow,
  favoriteIds?: Set<string>,
): PropertyCardDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    code: row.code,
    type: row.type,
    view: row.view,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    standardGuests: row.standardGuests,
    maxGuests: row.maxGuests,
    floorArea: row.floorArea,
    amenities: row.amenities ?? [],
    weekdayPrice: row.weekdayPrice,
    weekendPrice: row.weekendPrice,
    holidayPrice: row.holidayPrice,
    minPrice: computeMinPrice(row),
    rating: row.ratingAvg ?? 0,
    reviewCount: row.reviewCount ?? 0,
    isGuestFavorite:
      (row.ratingAvg ?? 0) >= GUEST_FAVORITE_MIN_RATING &&
      (row.reviewCount ?? 0) >= GUEST_FAVORITE_MIN_REVIEWS,
    isFavorited: favoriteIds ? favoriteIds.has(row.id) : false,
    coverImageUrl: pickCoverUrl(row.images),
    images: row.images,
  };
}

export const PROPERTY_CARD_SELECT = {
  id: true,
  slug: true,
  name: true,
  code: true,
  type: true,
  view: true,
  address: true,
  latitude: true,
  longitude: true,
  bedrooms: true,
  bathrooms: true,
  standardGuests: true,
  maxGuests: true,
  floorArea: true,
  amenities: true,
  weekdayPrice: true,
  weekendPrice: true,
  holidayPrice: true,
  ratingAvg: true,
  reviewCount: true,
  images: {
    select: { id: true, imageUrl: true, isCover: true, order: true },
    orderBy: { order: 'asc' as const },
  },
} as const;
