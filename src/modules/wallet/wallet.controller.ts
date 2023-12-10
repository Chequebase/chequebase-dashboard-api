import { Authorized, Body, CurrentUser, Get, JsonController, Param, Post, QueryParams, Res, UseBefore } from "routing-controllers";
import { Service } from "typedi";
import WalletService from "./wallet.service";
import { CreateWalletDto, GetWalletEntriesDto, GetWalletStatementDto } from "./dto/wallet.dto";
import { AuthUser } from "@/modules/common/interfaces/auth-user";
import { PassThrough } from "stream";
import { Response } from "express";
import publicApiGuard from "../common/guards/public-api.guard";

@Service()
@JsonController('/wallet', { transformResponse: false })
export default class WalletController {
  constructor (private walletService: WalletService) { }
  
  @Post('/')
  @UseBefore(publicApiGuard)
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
    return this.walletService.getWalletEntries(auth, query)
  }

  @Get('/statement')
  @Authorized()
  async getWalletStatement(
    @Res() res: Response,
    @CurrentUser() auth: AuthUser,
    @QueryParams() query: GetWalletStatementDto
  ) {
    const passthrough = new PassThrough();
    const { filename, stream } = await this.walletService.getWalletStatement(auth.orgId, query)
    
    res.setHeader('Content-Type', 'text/csv');
    res.attachment(filename);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    stream.pipe(passthrough);

    return passthrough
  }

  @Get('/:id')
  @Authorized()
  getWallet(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.walletService.getWallet(auth.orgId, id)
  }
  
  @Get('/history/:id')
  @Authorized()
  getWalletEntry(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.walletService.getWalletEntry(auth.orgId, id)
  }
}