import { Controller, Get, Post } from "routing-controllers";
import { Service } from "typedi";
import WalletService from "./wallet.service";

@Service()
@Controller('/wallet', { transformResponse: false })
export default class WalletController {
  constructor (private walletService: WalletService) { }
  
  @Post('/')
  createWallet() {
    return this.walletService.createWallet()
  }

  @Get('/')
  getWallets() {
    return this.walletService.getWallets()
  }

  @Get('/history')
  getWalletHistory() {
    return this.walletService.getWalletEntries()
  }

  // TODO: return csv
  @Get('/statement')
  getWalletStatement() {
    return this.walletService.getWalletEntries()
  }

  @Get('/history/:id')
  getWalletEntry() {
    return this.walletService.getWalletEntry()
  }
}