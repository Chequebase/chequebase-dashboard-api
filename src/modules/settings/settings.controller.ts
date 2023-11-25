import { CreatePinDto } from './dto/create-pin.dto';
import { ChangePinDto } from './dto/change-pin.dto';
import { Service } from 'typedi';
import { Authorized, Body, CurrentUser, ForbiddenError, JsonController, Post } from 'routing-controllers';
import { AuthUser } from '../common/interfaces/auth-user';
import { SettingsService } from './settings.service';
import { Role } from '../user/dto/user.dto';

@Service()
@JsonController('/settings', { transformResponse: false })
export default class SettingsController {
  constructor (private readonly settingsService: SettingsService) { }

  @Authorized(Role.Owner)
  @Post('/create-pin')
  createPin(@CurrentUser() auth: AuthUser, @Body() createPinDto: CreatePinDto) {
    if (createPinDto.pin.length !== 4 || !/^\d+$/.test(createPinDto.pin)) {
        throw new ForbiddenError('Invalid PIN format.');
    }
    return this.settingsService.createPin(auth.userId, createPinDto);
  }

  @Authorized(Role.Owner)
  @Post('/change-pin')
  changePin(@CurrentUser() auth: AuthUser, @Body() changePinDto: ChangePinDto) {
    if (changePinDto.pin.length !== 4 || !/^\d+$/.test(changePinDto.pin)) {
        throw new ForbiddenError('Invalid PIN format.');
    }
    return this.settingsService.changePin(auth.userId, changePinDto);
  }
}
