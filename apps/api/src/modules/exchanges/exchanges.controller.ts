import { Body, Controller, Param, Post } from '@nestjs/common';
import { ExchangesService } from './exchanges.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ShopScoped } from '../../common/decorators/shop-scoped.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { CompleteExchangeDto } from './dto/exchange.dto';

@Controller('returns')
@ShopScoped()
export class ExchangesController {
  constructor(private readonly exchanges: ExchangesService) {}

  @Post(':id/exchange')
  @RequirePermissions('exchanges.process')
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CompleteExchangeDto) {
    return this.exchanges.complete(user, id, dto);
  }
}
