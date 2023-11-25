import { CreateTransactionPinDto } from './dto/create-pin.dto';
import { ChangeTransactionPinDto } from './dto/change-pin.dto';
import { Service } from 'typedi';
import { Authorized, Body, Controller, CurrentUser, ForbiddenError, Post } from 'routing-controllers';
import { AuthUser } from '../common/interfaces/auth-user';
import { SettingsService } from './settings.service';
import { Role } from '../user/dto/user.dto';

@Service()
@Controller('/settings', { transformResponse: false })
export default class SettingsController {
  constructor (private readonly settingsService: SettingsService) { }

  @Authorized(Role.Owner)
  @Post('/create-pin')
  createPin(@CurrentUser() auth: AuthUser, @Body() createTransactionPinDto: CreateTransactionPinDto) {
    if (createTransactionPinDto.pin.length !== 4 || !/^\d+$/.test(createTransactionPinDto.pin)) {
        throw new ForbiddenError('Invalid PIN format.');
    }
    return this.settingsService.createPin(auth.userId, createTransactionPinDto);
  }

  @Authorized(Role.Owner)
  @Post('/change-pin')
  changePin(@CurrentUser() auth: AuthUser, @Body() changeTransactionPinDto: ChangeTransactionPinDto) {
    if (changeTransactionPinDto.pin.length !== 4 || !/^\d+$/.test(changeTransactionPinDto.pin)) {
        throw new ForbiddenError('Invalid PIN format.');
    }
    return this.settingsService.changePin(auth.userId, changeTransactionPinDto);
  }
}
