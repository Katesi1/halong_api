import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Messages } from '../../i18n';
import { ROLE, ALL_PERMISSION_MODULES } from '../../common/constants';
import { ModulePermissionDto } from './dto/set-permissions.dto';

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get all permissions for a user.
   * Returns all 4 modules — fills in defaults (read-only) for missing entries.
   */
  async getUserPermissions(userId: string, msg: Messages) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, name: true, role: true },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);

    const existing = await this.prisma.userPermission.findMany({
      where: { userId },
    });

    const permMap = new Map(existing.map(p => [p.module, p]));

    const permissions = ALL_PERMISSION_MODULES.map(mod => {
      const p = permMap.get(mod);
      return {
        module: mod,
        canCreate: p?.canCreate ?? false,
        canRead: p?.canRead ?? true,
        canUpdate: p?.canUpdate ?? false,
        canDelete: p?.canDelete ?? false,
      };
    });

    return {
      message: msg.permissions.getSuccess,
      data: { user: { id: user.id, name: user.name, role: user.role }, permissions },
    };
  }

  /**
   * Bulk set permissions for a user (Admin only).
   * Upserts each module permission.
   */
  async setUserPermissions(userId: string, dtos: ModulePermissionDto[], msg: Messages) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, role: { in: [ROLE.OWNER, ROLE.SALE] } },
      select: { id: true, name: true, role: true },
    });
    if (!user) throw new NotFoundException(msg.users.notFound);

    // Validate modules
    for (const dto of dtos) {
      if (!ALL_PERMISSION_MODULES.includes(dto.module as any)) {
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
            canRead: dto.canRead ?? true,
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
   * ADMIN always returns true. CUSTOMER always returns true (they use their own endpoints).
   * OWNER/SALE: check UserPermission record; no record = read-only default.
   */
  async hasPermission(
    userId: string,
    role: number,
    module: string,
    action: 'canCreate' | 'canRead' | 'canUpdate' | 'canDelete',
  ): Promise<boolean> {
    // ADMIN bypasses all permission checks
    if (role === ROLE.ADMIN) return true;

    // CUSTOMER uses their own endpoints, not affected
    if (role === ROLE.CUSTOMER) return true;

    // Read is always allowed by default
    if (action === 'canRead') return true;

    const permission = await this.prisma.userPermission.findUnique({
      where: { userId_module: { userId, module } },
    });

    // No record = default (read-only)
    if (!permission) return false;

    return permission[action];
  }
}
