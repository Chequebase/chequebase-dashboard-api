import { Authorized, Body, CurrentUser, Get, JsonController, Param, Post, QueryParams, Req, Res, UseBefore } from "routing-controllers";
import { Service } from "typedi";
import WalletService from "./wallet.service";
import { CreateWalletDto, GetWalletEntriesDto, GetWalletStatementDto } from "./dto/wallet.dto";
import { AuthUser } from "@/modules/common/interfaces/auth-user";
import { PassThrough } from "stream";
import { Request, Response } from "express";
import publicApiGuard from "../common/guards/public-api.guard";
import { Role } from "../user/dto/user.dto";

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
  getWallets(@CurrentUser() auth: AuthUser, @Req() req: Request) {
    console.log({ session: req.session })
    return this.walletService.getWallets(auth.orgId)
  }

  @Get('/history')
  @Authorized()
  getWalletHistory(@CurrentUser() auth: AuthUser, @QueryParams() query: GetWalletEntriesDto) {
    return this.walletService.getWalletEntries(auth, query)
  }

  @Get('/statement/csv')
  @Authorized(Role.Owner)
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

  @Get('/statement')
  @Authorized(Role.Owner)
  async getAccountStatement(@CurrentUser() auth: AuthUser, @QueryParams() query: GetWalletStatementDto) {
    return this.walletService.sendWalletStatement(auth.orgId, query)
  }

  @Get('/balances')
  @Authorized(Role.Owner)
  getBalances(@CurrentUser() auth: AuthUser) {
    return this.walletService.getBalances(auth.orgId)
  }

  @Get('/:id')
  @Authorized(Role.Owner)
  getWallet(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.walletService.getWallet(auth.orgId, id)
  }
  
  @Get('/history/:id')
  @Authorized(Role.Owner)
  getWalletEntry(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.walletService.getWalletEntry(auth.orgId, id)
  }
}