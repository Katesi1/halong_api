import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { getMessages } from '../../i18n';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<number[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) return true;

    const request = context.switchToHttp().getRequest();
    const { user } = request;
    const hasRole = requiredRoles.includes(user?.role);
    if (!hasRole) {
      const msg = getMessages(request.headers?.['accept-language']);
      throw new ForbiddenException(msg.common.forbidden);
    }
    return true;
  }
}
