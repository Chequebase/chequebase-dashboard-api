import { CreatePinDto } from './dto/create-pin.dto';
import { ChangePinDto } from './dto/change-pin.dto';
import { Service } from 'typedi';
import User from '@/models/user.model';
import { BadRequestError, ForbiddenError } from 'routing-controllers';
import bcrypt from 'bcryptjs';
@Service()
export class SettingsService {
  constructor(
  ) { }

  async createPin(userId: string, createPinDto: CreatePinDto) {
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
    const user = await User.findById(userId).select('pin')
    if (!user) {
      throw new BadRequestError('User not found')
    }

    if (!user.pin) {
      throw new ForbiddenError('Pin does not exist');
    }
    await User.updateOne({ _id: userId }, { pin: await bcrypt.hash(changePinDto.pin, 12), })
    return { message: "pin changed" };
  }
}