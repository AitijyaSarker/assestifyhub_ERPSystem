import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ShopScoped } from '../../common/decorators/shop-scoped.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { CreatePurchaseDto, ReceivePurchaseDto } from './dto/purchase.dto';

@Controller('purchases')
@ShopScoped()
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get()
  @RequirePermissions('purchases.view')
  list(@CurrentUser() user: AuthUser, @Query('shopId') shopId?: string) {
    return this.purchases.list(user, shopId);
  }

  @Post()
  @RequirePermissions('purchases.create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePurchaseDto) {
    return this.purchases.create(user, dto);
  }

  @Post(':id/receive')
  @RequirePermissions('inventory.add')
  receive(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReceivePurchaseDto) {
    return this.purchases.receive(user, id, dto);
  }
}
