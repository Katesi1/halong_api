-- Sweep legacy `moderationStatus='pending'` properties → 'approved'.
-- Lý do: từ v1.9 BE auto-approve khi OWNER (đã KYC + entitled) tạo property.
-- Property cũ tạo thời code trước v1.9 vẫn còn 'pending' → bị filter chặn ở
-- /properties/public, /properties/search, /properties/public/:slug, /properties/share/:id
-- và /properties/public/by-owner/:ownerId (xem §4.1 visibility rule).
--
-- Chỉ approve cho OWNER thoả điều kiện auto-approve hiện tại:
--   - User active (isActive=true, bannedAt IS NULL, deletedAt IS NULL)
--   - KYC approved HOẶC kycBypass=true (gate KYC hiện hành)
-- Property đang bị admin reject/suspend (không phải pending) → giữ nguyên.
-- Property đã bị soft delete → giữ nguyên.
UPDATE "properties" p
SET "moderationStatus" = 'approved',
    "moderationReviewedAt" = NOW()
FROM "users" u
WHERE p."ownerId" = u.id
  AND p."moderationStatus" = 'pending'
  AND p."deletedAt" IS NULL
  AND u."isActive" = true
  AND u."bannedAt" IS NULL
  AND u."deletedAt" IS NULL
  AND (u."kycStatus" = 'approved' OR u."kycBypass" = true);
