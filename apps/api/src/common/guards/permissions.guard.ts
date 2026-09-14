import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PermissionKey } from '@erp/shared-types';
import { ERROR_CODES } from '@erp/shared-types';
import { AppError } from '../errors/app-error';
import { AuthUser } from '../types/auth-user';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest<{ user: AuthUser }>().user;
    if (!user) {
      throw new AppError(ERROR_CODES.PERMISSION_DENIED, 'Not authenticated', HttpStatus.FORBIDDEN);
    }
    if (user.roles.includes('SUPER_ADMIN')) return true;
    const ok = required.some((p) => user.permissions.includes(p));
    if (!ok) {
      throw new AppError(ERROR_CODES.PERMISSION_DENIED, 'Permission denied', HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
