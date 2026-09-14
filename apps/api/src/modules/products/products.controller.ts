import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ProductsService } from './products.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CreateBrandDto, UpdateBrandDto } from './dto/brand.dto';
import { LabelsService } from './labels.service';

@Controller()
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly labels: LabelsService,
  ) {}

  @Get('categories')
  @RequirePermissions('products.view')
  categories() {
    return this.products.categories();
  }

  @Post('categories')
  @RequirePermissions('categories.manage')
  createCategory(@CurrentUser() user: AuthUser, @Body() dto: CreateCategoryDto) {
    return this.products.createCategory(user, dto);
  }

  @Patch('categories/:id')
  @RequirePermissions('categories.manage')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.products.updateCategory(id, dto);
  }

  @Get('brands')
  @RequirePermissions('products.view')
  brands() {
    return this.products.brands();
  }

  @Post('brands')
  @RequirePermissions('brands.manage')
  createBrand(@CurrentUser() user: AuthUser, @Body() dto: CreateBrandDto) {
    return this.products.createBrand(user, dto);
  }

  @Patch('brands/:id')
  @RequirePermissions('brands.manage')
  updateBrand(@Param('id') id: string, @Body() dto: UpdateBrandDto) {
    return this.products.updateBrand(id, dto);
  }

  @Get('products')
  @RequirePermissions('products.view')
  list(@Query('search') search?: string) {
    return this.products.list(search);
  }

  @Get('products/barcode/:value')
  @RequirePermissions('products.view', 'sales.create')
  byBarcode(@Param('value') value: string) {
    return this.products.findByBarcode(value);
  }

  @Get('products/:id')
  @RequirePermissions('products.view')
  get(@Param('id') id: string) {
    return this.products.get(id);
  }

  @Post('products')
  @RequirePermissions('products.create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.products.create(user, dto);
  }

  @Patch('products/:id')
  @RequirePermissions('products.update')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(user, id, dto);
  }

  @Post('products/:id/archive')
  @RequirePermissions('products.archive')
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.products.archive(user, id);
  }

  @Post('products/labels')
  @RequirePermissions('products.view')
  labelsPdf(@Body() body: { variantIds: string[]; layout: 'single' | 'a4' | 'thermal'; quantity?: number }) {
    return this.labels.generate(body.variantIds, body.layout ?? 'a4', body.quantity ?? 1);
  }
}
