import { Module } from '@nestjs/common';
import { CurrencySwitchService } from './currency-switch.service';
import { SettingsController } from './settings.controller';
import { BackupModule } from '../backup/backup.module';

@Module({
  imports: [BackupModule],
  providers: [CurrencySwitchService],
  controllers: [SettingsController],
  exports: [CurrencySwitchService],
})
export class SettingsModule {}
