import { Module } from '@nestjs/common';
import { InventoryLedgerService } from './inventory-ledger.service';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';

@Module({
  providers: [InventoryLedgerService, InventoryService],
  controllers: [InventoryController],
  exports: [InventoryLedgerService, InventoryService],
})
export class InventoryModule {}
