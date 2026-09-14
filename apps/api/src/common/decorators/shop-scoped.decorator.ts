import { SetMetadata } from '@nestjs/common';

export const SHOP_SCOPED_KEY = 'shopScoped';
export const ShopScoped = () => SetMetadata(SHOP_SCOPED_KEY, true);
