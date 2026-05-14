import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/permission.decorator';
import { PermissionsService } from '../../modules/permissions/permissions.service';
import { getMessages } from '../../i18n';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<{ module: string; action: string }>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Permission decorator → allow
    if (!permission) return true;

    const request = context.switchToHttp().getRequest();
    const { user } = request;

    // No user (public route) → allow
    if (!user) return true;

    const allowed = await this.permissionsService.hasPermission(
      user.id,
      user.role,
      permission.module,
      permission.action as any,
    );

    if (!allowed) {
      const msg = getMessages(request.headers?.['accept-language']);
      throw new ForbiddenException(msg.permissions.forbidden);
    }

    return true;
  }
}
