import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { LabelsService } from './labels.service';

@Module({
  providers: [ProductsService, LabelsService],
  controllers: [ProductsController],
  exports: [ProductsService],
})
export class ProductsModule {}
