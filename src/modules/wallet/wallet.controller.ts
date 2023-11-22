import { Authorized, Body, Controller, CurrentUser, Get, Param, Post, QueryParams } from "routing-controllers";
import { Service } from "typedi";
import WalletService from "./wallet.service";
import { CreateWalletDto, GetWalletEntriesDto } from "./dto/wallet.dto";
import { AuthUser } from "@/modules/common/interfaces/auth-user";

@Service()
@Controller('/wallet', { transformResponse: false })
export default class WalletController {
  constructor (private walletService: WalletService) { }
  
  // TODO: create guard middleware requiring api key
  @Post('/')
  createWallet(@Body() dto: CreateWalletDto) {
    return this.walletService.createWallet(dto)
  }

  @Get('/')
  @Authorized()
  getWallets(@CurrentUser() auth: AuthUser) {
    return this.walletService.getWallets(auth.orgId)
  }

  @Get('/history')
  @Authorized()
  getWalletHistory(@CurrentUser() auth: AuthUser, @QueryParams() query: GetWalletEntriesDto) {
    return this.walletService.getWalletEntries(auth.orgId, query)
  }

  // TODO: return csv
  // @Get('/statement')
  // getWalletStatement() {
  //   return this.walletService.getWalletEntries()
  // }

  @Get('/history/:id')
  @Authorized()
  getWalletEntry(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.walletService.getWalletEntry(auth.orgId, id)
  }
}