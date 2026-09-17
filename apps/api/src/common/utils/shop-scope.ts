import { AuthUser } from '../types/auth-user';
import { AppError } from '../errors/app-error';
import { ERROR_CODES } from '@erp/shared-types';
import { HttpStatus } from '@nestjs/common';

export function assertShopAccess(user: AuthUser, shopId: string): void {
  if (user.roles.includes('SUPER_ADMIN')) return;
  if (user.shopIds.length > 0 && !user.shopIds.includes(shopId)) {
    throw new AppError(ERROR_CODES.SHOP_ACCESS_DENIED, 'Shop access denied', HttpStatus.FORBIDDEN);
  }
}

export function scopedShopIds(user: AuthUser, requested?: string): string[] {
  if (requested) {
    assertShopAccess(user, requested);
    return [requested];
  }
  if (user.roles.includes('SUPER_ADMIN')) return [];
  return user.shopIds;
}
