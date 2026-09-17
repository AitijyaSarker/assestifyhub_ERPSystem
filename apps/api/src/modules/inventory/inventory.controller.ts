import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ShopScoped } from '../../common/decorators/shop-scoped.decorator';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { PrismaService } from '../../database/prisma.service';
import { assertShopAccess, scopedShopIds } from '../../common/utils/shop-scope';

@Controller('inventory')
@ShopScoped()
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @RequirePermissions('inventory.view')
  list(@CurrentUser() user: AuthUser, @Query('shopId') shopId?: string) {
    return this.inventory.list(user, shopId);
  }

  @Get('movements')
  @RequirePermissions('inventory.view')
  movements(@CurrentUser() user: AuthUser, @Query('shopId') shopId?: string) {
    const ids = scopedShopIds(user, shopId);
    return this.prisma.stockMovement.findMany({
      where: ids.length ? { shopId: { in: ids } } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { variant: { include: { product: true } }, shop: true },
    });
  }

  @Post('adjust')
  @RequirePermissions('inventory.adjust')
  adjust(@CurrentUser() user: AuthUser, @Body() dto: AdjustStockDto) {
    assertShopAccess(user, dto.shopId);
    return this.inventory.adjust(user, dto);
  }
}
