import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { ShopsModule } from './modules/shops/shops.module';
import { ProductsModule } from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { SalesModule } from './modules/sales/sales.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { ExchangesModule } from './modules/exchanges/exchanges.module';
import { TransfersModule } from './modules/transfers/transfers.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ReportsModule } from './modules/reports/reports.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { SecurityModule } from './modules/security/security.module';
import { BackupModule } from './modules/backup/backup.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { SessionGuard } from './common/guards/session.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { ShopAccessGuard } from './common/guards/shop-access.guard';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    RolesModule,
    ShopsModule,
    ProductsModule,
    InventoryModule,
    PurchasesModule,
    SalesModule,
    PaymentsModule,
    CustomersModule,
    SuppliersModule,
    ReturnsModule,
    ExchangesModule,
    TransfersModule,
    SettingsModule,
    ReportsModule,
    NotificationsModule,
    AuditModule,
    SecurityModule,
    BackupModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ShopAccessGuard },
  ],
})
export class AppModule {}
