import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Messages } from '../../i18n';
import {
  ROLE,
  ALL_PERMISSION_MODULES,
  OWNER_SCOPE_MODULES,
  isAdminScopeModule,
  USER_SCOPE,
} from '../../common/constants';
import { ModulePermissionDto } from './dto/set-permissions.dto';

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get all permissions for a user.
   * Returns all configured modules — fills in defaults for missing entries.
   * - Owner-scope modules: default canRead=true (read luôn cho phép cho SALE owner).
   * - Admin-scope modules: default ALL false (SALE hệ thống cần admin cấp tường minh).
   */
  async getUserPermissions(userId: string, msg: Messages) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, name: true, role: true, scope: true },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);

    const existing = await this.prisma.userPermission.findMany({
      where: { userId },
    });

    const permMap = new Map(existing.map(p => [p.module, p]));

    const permissions = ALL_PERMISSION_MODULES.map(mod => {
      const p = permMap.get(mod);
      const isAdminModule = isAdminScopeModule(mod);
      return {
        module: mod,
        canCreate: p?.canCreate ?? false,
        // Admin-scope mặc định false (admin module cần cấp tường minh).
        // Owner-scope giữ default canRead=true (SALE owner luôn được đọc).
        canRead: p?.canRead ?? (isAdminModule ? false : true),
        canUpdate: p?.canUpdate ?? false,
        canDelete: p?.canDelete ?? false,
      };
    });

    return {
      message: msg.permissions.getSuccess,
      data: { user: { id: user.id, name: user.name, role: user.role, scope: user.scope }, permissions },
    };
  }

  /**
   * Bulk set permissions for a user (Admin only).
   * - SALE owner-scope: cấu hình được các module trong OWNER_SCOPE_MODULES.
   * - SALE system-scope: cấu hình được toàn bộ ALL_PERMISSION_MODULES (cả admin-scope).
   * - OWNER/CUSTOMER/ADMIN: không hỗ trợ.
   */
  async setUserPermissions(userId: string, dtos: ModulePermissionDto[], msg: Messages) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, name: true, role: true, scope: true },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);

    if (user.role !== ROLE.SALE) {
      throw new BadRequestException(msg.permissions.onlyForSale);
    }

    const isSystem = user.scope === USER_SCOPE.SYSTEM;
    const allowedModules: readonly string[] = isSystem ? ALL_PERMISSION_MODULES : OWNER_SCOPE_MODULES;

    // Validate modules
    for (const dto of dtos) {
      if (!allowedModules.includes(dto.module)) {
        throw new BadRequestException(msg.permissions.invalidModule(dto.module));
      }
    }

    const results = await this.prisma.$transaction(
      dtos.map(dto =>
        this.prisma.userPermission.upsert({
          where: { userId_module: { userId, module: dto.module } },
          create: {
            userId,
            module: dto.module,
            canCreate: dto.canCreate ?? false,
            // Admin-scope mặc định false khi tạo mới (yêu cầu cấp tường minh).
            canRead: dto.canRead ?? (isAdminScopeModule(dto.module) ? false : true),
            canUpdate: dto.canUpdate ?? false,
            canDelete: dto.canDelete ?? false,
          },
          update: {
            ...(dto.canCreate !== undefined && { canCreate: dto.canCreate }),
            ...(dto.canRead !== undefined && { canRead: dto.canRead }),
            ...(dto.canUpdate !== undefined && { canUpdate: dto.canUpdate }),
            ...(dto.canDelete !== undefined && { canDelete: dto.canDelete }),
          },
        }),
      ),
    );

    const permissions = results.map(p => ({
      module: p.module,
      canCreate: p.canCreate,
      canRead: p.canRead,
      canUpdate: p.canUpdate,
      canDelete: p.canDelete,
    }));

    return { message: msg.permissions.setSuccess, data: { userId, permissions } };
  }

  /**
   * Check if a user has a specific permission.
   * - ADMIN          → always allowed (system-wide bypass)
   * - OWNER          → owner-scope modules allow; admin-scope modules deny
   * - CUSTOMER       → owner-scope modules allow (uses dedicated customer endpoints);
   *                    admin-scope modules deny
   * - SALE owner     → checked against UserPermission table for owner-scope modules;
   *                    default canRead=true. Admin-scope modules → always deny.
   * - SALE system    → checked against UserPermission for cả 2 scope; default ALL false
   *                    (admin phải cấp tường minh). canRead admin-scope cũng phải cấp.
   */
  async hasPermission(
    userId: string,
    role: number,
    module: string,
    action: 'canCreate' | 'canRead' | 'canUpdate' | 'canDelete',
  ): Promise<boolean> {
    // ADMIN bypasses all permission checks
    if (role === ROLE.ADMIN) return true;

    const isAdminModule = isAdminScopeModule(module);

    // OWNER: admin-scope deny, owner-scope allow (their own data scope).
    if (role === ROLE.OWNER) return !isAdminModule;

    // CUSTOMER: same as OWNER — owner-scope allow (dedicated endpoints), admin-scope deny.
    if (role === ROLE.CUSTOMER) return !isAdminModule;

    // SALE — distinguish owner-scope SALE vs system-scope SALE.
    if (role === ROLE.SALE) {
      // Resolve scope from DB (cached/normalized by guard; here we re-fetch to be safe).
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { scope: true },
      });
      const isSystem = user?.scope === USER_SCOPE.SYSTEM;

      // Owner SALE accessing admin-scope module → deny.
      if (!isSystem && isAdminModule) return false;

      // Owner SALE on owner-scope module: read luôn cho phép theo default.
      if (!isSystem && action === 'canRead') return true;

      const permission = await this.prisma.userPermission.findUnique({
        where: { userId_module: { userId, module } },
      });

      if (!permission) {
        // System SALE: không có row → mặc định false (kể cả read).
        // Owner SALE: chỉ tới đây khi action ≠ canRead → false (cần admin/owner cấp).
        return false;
      }

      return permission[action];
    }

    return false;
  }
}
