import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';

/**
 * Decorator to require a specific permission for a route.
 * Used together with PermissionGuard (global guard).
 *
 * @param module - The module name (properties, bookings, calendar, reviews)
 * @param action - The action (canCreate, canRead, canUpdate, canDelete)
 *
 * @example
 * @Permission('properties', 'canCreate')
 */
export const Permission = (module: string, action: 'canCreate' | 'canRead' | 'canUpdate' | 'canDelete') =>
  SetMetadata(PERMISSION_KEY, { module, action });
