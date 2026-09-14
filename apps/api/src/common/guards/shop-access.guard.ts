import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SHOP_SCOPED_KEY } from '../decorators/shop-scoped.decorator';
import { AppError } from '../errors/app-error';
import { ERROR_CODES } from '@erp/shared-types';
import { AuthUser } from '../types/auth-user';

@Injectable()
export class ShopAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const shopScoped = this.reflector.getAllAndOverride<boolean>(SHOP_SCOPED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!shopScoped) return true;

    const req = context.switchToHttp().getRequest<Request & { user: AuthUser }>();
    const user = req.user;
    if (user.roles.includes('SUPER_ADMIN')) return true;

    const shopId =
      (req.params.shopId as string | undefined) ??
      (req.query.shopId as string | undefined) ??
      (req.body?.shopId as string | undefined);

    if (!shopId) return true;
    if (!user.shopIds.includes(shopId)) {
      throw new AppError(ERROR_CODES.SHOP_ACCESS_DENIED, 'Shop access denied', HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
