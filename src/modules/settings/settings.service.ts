import { CreatePinDto } from './dto/create-pin.dto';
import { ChangeForgotCurrentPinDto, ChangePinDto, ForgotCurrentPinDto } from './dto/change-pin.dto';
import { Service } from 'typedi';
import User, { UserStatus } from '@/models/user.model';
import { BadRequestError, ForbiddenError, UnauthorizedError, UseBefore } from 'routing-controllers';
import { compare, hash } from 'bcryptjs';
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
    const hashed = await hash(createPinDto.pin, 12)
    await User.updateOne({ _id: userId }, { pin: hashed })
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
    await User.updateOne({ _id: userId }, { pin: await hash(changePinDto.newPin, 12), })
    return { message: "pin changed" };
  }

  async forgotCurrentPin(userId: string, forgotCurrentPinDto: ForgotCurrentPinDto) {
    const user = await User.findById(userId).select('+password');
    if (!user) {
      throw new BadRequestError('User not found');
    }
    if (!await compare(forgotCurrentPinDto.password, user.password)) {
      throw new UnauthorizedError('Wrong password!')
    }
    const forgotPinCode = createId()
    const hashed = await hash(forgotPinCode, 12)
    await User.updateOne({ _id: userId }, { forgotPinCode: hashed })
    return { hash: forgotPinCode }
  }

  async changeForgotCurrentPin(userId: string, changeForgotCurrentPinDto: ChangeForgotCurrentPinDto) {
    if (changeForgotCurrentPinDto.pin.length !== 4 || !/^\d+$/.test(changeForgotCurrentPinDto.pin)) {
      throw new ForbiddenError('Invalid PIN format.');
    }
    const user = await User.findById(userId).select('+pin');
    if (!user) {
      throw new BadRequestError('User not found')
    }

    if (!user.pin) {
      throw new ForbiddenError('Pin does not exist');
    }
    if (!(await compare(changeForgotCurrentPinDto.hash, user.forgotPinCode))) {
      throw new UnauthorizedError('Invalid Credentials!')
    }
    const hashed = await hash(changeForgotCurrentPinDto.pin, 12)
    await User.updateOne({ _id: userId }, { pin: hashed })
    return { message: "pin changed" };
  }

  async getPermissions(userId: string) {
    const user = await User.findById(userId);
    if (!user) {
      throw new BadRequestError('User not found');
    }
    return Permission.find().select('updatedAt role permissions _id role name description').lean()
  }

  async getUsersByRole(auth: AuthUser, role: string) {
    // check if role is allowed
    const users = await User.find({
      organization: auth.orgId,
      role,
      status: { $ne: UserStatus.DELETED },
    }).select('firstName lastName avatar email emailVerified role KYBStatus createdAt organization pin phone')
    return users
  }
}