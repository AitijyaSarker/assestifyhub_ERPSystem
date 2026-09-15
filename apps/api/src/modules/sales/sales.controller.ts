import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ShopScoped } from '../../common/decorators/shop-scoped.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { CheckoutDto, VoidSaleDto } from './dto/checkout.dto';

@Controller('sales')
@ShopScoped()
export class SalesController {
  constructor(private readonly checkout: CheckoutService) {}

  @Get()
  @RequirePermissions('sales.view', 'sales.view.own_shop')
  list(@CurrentUser() user: AuthUser, @Query('shopId') shopId?: string, @Query('search') search?: string, @Query('cashierId') cashierId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.checkout.list(user, shopId, search, cashierId, from, to);
  }

  @Get(':id')
  @RequirePermissions('sales.view', 'sales.view.own_shop')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.checkout.get(user, id);
  }

  @Post('checkout')
  @RequirePermissions('sales.create')
  checkoutSale(@CurrentUser() user: AuthUser, @Body() dto: CheckoutDto) {
    return this.checkout.checkout(user, dto);
  }

  @Post(':id/void')
  @RequirePermissions('sales.void')
  voidSale(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VoidSaleDto) {
    return this.checkout.voidSale(user, id, dto.reason);
  }
}
