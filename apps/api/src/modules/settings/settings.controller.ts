import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrencySwitchService } from './currency-switch.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { SetRateDto, SwitchCurrencyDto } from './dto/currency.dto';

@Controller('settings')
export class SettingsController {
  constructor(private readonly currency: CurrencySwitchService) {}

  @Get('currency')
  @RequirePermissions('settings.manage', 'sales.create')
  active() {
    return this.currency.active();
  }

  @Get('currency/rates')
  @RequirePermissions('settings.manage')
  rates() {
    return this.currency.rates();
  }

  @Post('currency/rates')
  @RequirePermissions('settings.manage')
  setRate(@CurrentUser() user: AuthUser, @Body() dto: SetRateDto) {
    return this.currency.setRate(user, dto);
  }

  @Post('currency/switch')
  @RequirePermissions('settings.manage')
  switchCurrency(@CurrentUser() user: AuthUser, @Body() dto: SwitchCurrencyDto) {
    return this.currency.switchCurrency(user, dto);
  }
}
