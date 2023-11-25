import { CreateTransactionPinDto } from './dto/create-pin.dto';
import { ChangeTransactionPinDto } from './dto/change-pin.dto';
import { Service } from 'typedi';
@Service()
export class SettingsService {
  constructor(
  ) { }

  async createPin(userId: string, createTransactionPinDto: CreateTransactionPinDto) {
    // const pinSetAlready = await this.dynamoClient.getItem(authTable, { id: userId, sKey: pinSKey });
    // if (pinSetAlready) throw new ForbiddenException('Pin has already been set');
    // const pin = await hash(createTransactionPinDto.pin, 12);
    // await this.dynamoClient.updateItem(authTable, { id: userId, sKey: pinSKey }, { pin });
    // await this.dynamoClient.updateItem(authTable, { id: userId, sKey: detailsSkey }, { pinSet: true });
    // return { message: "Transaction pin created" };
  }

  async changePin(userId: string, changeTransactionPinDto: ChangeTransactionPinDto) {
    // const pinSetAlready = await this.dynamoClient.getItem(authTable, { id: userId, sKey: pinSKey });
    // if (!pinSetAlready) throw new ForbiddenException('Pin does not exist');
    // const pin = await hash(changeTransactionPinDto.pin, 12);
    // await this.dynamoClient.updateItem(authTable, { id: userId, sKey: pinSKey }, { pin });
    // return { message: "Transaction pin changed" };
  }
}