import { Controller, Get, Post, Body, Param, Patch } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CreateShopDto } from './dto/create-shop.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { AuditService } from '../audit/audit.service';
import { IsBoolean, IsOptional, Matches } from 'class-validator';
import { assertShopAccess } from '../../common/utils/shop-scope';

class ShopSettingsDto {
  @IsOptional()
  @Matches(/^\d+(\.\d{1,2})?$/)
  taxRate?: string;

  @IsOptional()
  @IsBoolean()
  allowNegativeStock?: boolean;
}

@Controller('shops')
export class ShopsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('shops.manage', 'sales.view.own_shop')
  list(@CurrentUser() user: AuthUser) {
    if (user.roles.includes('SUPER_ADMIN')) {
      return this.prisma.shop.findMany({ include: { settings: true }, orderBy: { name: 'asc' } });
    }
    return this.prisma.shop.findMany({
      where: { id: { in: user.shopIds } },
      include: { settings: true },
    });
  }

  @Post()
  @RequirePermissions('shops.manage')
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateShopDto) {
    const shop = await this.prisma.shop.create({
      data: { ...dto, settings: { create: {} } },
    });
    await this.audit.write(user, 'SHOP_CREATE', 'Shop', shop.id);
    return shop;
  }

  @Patch(':shopId/settings')
  @RequirePermissions('shops.manage')
  async settings(
    @CurrentUser() user: AuthUser,
    @Param('shopId') shopId: string,
    @Body() dto: ShopSettingsDto,
  ) {
    assertShopAccess(user, shopId);
    const row = await this.prisma.shopSettings.upsert({
      where: { shopId },
      update: dto,
      create: { shopId, taxRate: dto.taxRate ?? '0', allowNegativeStock: dto.allowNegativeStock ?? false },
    });
    await this.audit.write(user, 'SHOP_SETTINGS_UPDATE', 'ShopSettings', shopId, null, dto as never);
    return row;
  }
}
