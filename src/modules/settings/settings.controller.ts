import { CreatePinDto } from './dto/create-pin.dto';
import { ChangeForgotCurrentPinDto, ChangePinDto, ForgotCurrentPinDto } from './dto/change-pin.dto';
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
    return this.settingsService.createPin(auth.userId, createPinDto);
  }

  @Authorized(Role.Owner)
  @Post('/change-pin')
  async changePin(@CurrentUser() auth: AuthUser, @Body() changePinDto: ChangePinDto) {
    return this.settingsService.changePin(auth.userId, changePinDto);
  }

  @Authorized(Role.Owner)
  @Post('/forgot-pin')
  async forgotPin(@CurrentUser() auth: AuthUser, @Body() forgotCurrentPinDto: ForgotCurrentPinDto) {
    return this.settingsService.forgotCurrentPin(auth.userId, forgotCurrentPinDto);
  }

  @Authorized(Role.Owner)
  @Post('/change-forgot-pin')
  async changeForgotPin(@CurrentUser() auth: AuthUser, @Body() changeForgotCurrentPinDto: ChangeForgotCurrentPinDto) {
    return this.settingsService.changeForgotCurrentPin(auth.userId, changeForgotCurrentPinDto);
  }
}
