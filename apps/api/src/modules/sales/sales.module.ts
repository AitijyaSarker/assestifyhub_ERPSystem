import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { SalesController } from './sales.controller';
import { ReceiptsService } from './receipts.service';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  providers: [CheckoutService, ReceiptsService],
  controllers: [SalesController],
  exports: [CheckoutService],
})
export class SalesModule {}
