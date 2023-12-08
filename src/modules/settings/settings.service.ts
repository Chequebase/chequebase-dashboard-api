import { CreatePinDto } from './dto/create-pin.dto';
import { ChangeForgotCurrentPinDto, ChangePinDto, ForgotCurrentPinDto } from './dto/change-pin.dto';
import { Service } from 'typedi';
import User, { UserStatus } from '@/models/user.model';
import { BadRequestError, ForbiddenError, UnauthorizedError } from 'routing-controllers';
import bcrypt, { compare } from 'bcryptjs';
import { createId } from '@paralleldrive/cuid2';
import Permission from '@/models/permission.model';
import { AuthUser } from '../common/interfaces/auth-user';
@Service()
export class SettingsService {
  constructor(
  ) { }

  async createPin(userId: string, createPinDto: CreatePinDto) {
    if (createPinDto.pin.length !== 4 || !/^\d+$/.test(createPinDto.pin)) {
      throw new ForbiddenError('Invalid PIN format.');
    }
    const user = await User.findById(userId).select('pin')
    if (!user) {
      throw new BadRequestError('User not found')
    }

    if (user.pin) {
      throw new ForbiddenError('Pin has already been set');
    }
    await User.updateOne({ _id: userId }, { pin: await bcrypt.hash(createPinDto.pin, 12) })
    return { message: "pin created" };
  }

  async changePin(userId: string, changePinDto: ChangePinDto) {
    if (changePinDto.newPin.length !== 4 || !/^\d+$/.test(changePinDto.newPin)) {
      throw new ForbiddenError('Invalid PIN format.');
    }
    const user = await User.findById(userId).select('pin')
    if (!user) {
      throw new BadRequestError('User not found')
    }

    if (!user.pin) {
      throw new ForbiddenError('Pin does not exist');
    }
    if (!await compare(changePinDto.currentPin, user.pin)) {
      throw new UnauthorizedError('Wrong current pin!')
    }
    await User.updateOne({ _id: userId }, { pin: await bcrypt.hash(changePinDto.newPin, 12), })
    return { message: "pin changed" };
  }

  async forgotCurrentPin(userId: string, forgotCurrentPinDto: ForgotCurrentPinDto) {
    const { password } = forgotCurrentPinDto
    const user = await User.findById(userId);
    if (!user) {
      throw new BadRequestError('User not found');
    }
    if (!await compare(password, user.password)) {
      throw new UnauthorizedError('Wrong password!')
    }
    const forgotPinCode = createId()
    await User.updateOne({ _id: userId }, { forgotPinCode })
    return { hash: await bcrypt.hash(forgotPinCode, 12) }
  }

  async changeForgotCurrentPin(userId: string, changeForgotCurrentPinDto: ChangeForgotCurrentPinDto) {
    if (changeForgotCurrentPinDto.pin.length !== 4 || !/^\d+$/.test(changeForgotCurrentPinDto.pin)) {
      throw new ForbiddenError('Invalid PIN format.');
    }
    const user = await User.findById(userId);
    if (!user) {
      throw new BadRequestError('User not found')
    }

    if (!user.pin) {
      throw new ForbiddenError('Pin does not exist');
    }
    if (!await compare(changeForgotCurrentPinDto.hash, user.forgotPinCode)) {
      throw new UnauthorizedError('Invalid Credentials!')
    }
    await User.updateOne({ _id: userId }, { pin: await bcrypt.hash(changeForgotCurrentPinDto.pin, 12), })
    return { message: "pin changed" };
  }

  async getPermissions(userId: string) {
    const user = await User.findById(userId);
    if (!user) {
      throw new BadRequestError('User not found');
    }
    return Permission.find().select('updatedAt role permissions _id role name').lean()
  }

  async getUsersByRole(auth: AuthUser, role: string) {
    // check if role is allowed
    const users = await User.find({
      organization: auth.orgId,
      role,
      status: { $ne: UserStatus.DELETED },
    })
    return users
  }
}