import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TransfersService } from './transfers.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { CreateTransferDto } from './dto/transfer.dto';

@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Get()
  @RequirePermissions('inventory.view')
  list(@CurrentUser() user: AuthUser) {
    return this.transfers.list(user);
  }

  @Post()
  @RequirePermissions('inventory.transfer.request')
  request(@CurrentUser() user: AuthUser, @Body() dto: CreateTransferDto) {
    return this.transfers.request(user, dto);
  }

  @Post(':id/approve')
  @RequirePermissions('inventory.transfer.approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transfers.approve(user, id);
  }

  @Post(':id/dispatch')
  @RequirePermissions('inventory.transfer.dispatch')
  dispatch(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transfers.dispatch(user, id);
  }

  @Post(':id/receive')
  @RequirePermissions('inventory.transfer.receive')
  receive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transfers.receive(user, id);
  }
}
