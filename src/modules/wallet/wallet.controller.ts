import { Authorized, Body, CurrentUser, Get, JsonController, Param, Patch, Post, Put, QueryParams, Req, Res, UseBefore } from "routing-controllers";
import { Service } from "typedi";
import { Request } from "express";
import WalletService from "./wallet.service";
import { CreateSubaccoubtDto, CreateWalletDto, GetLinkedAccountDto, GetWalletEntriesDto, GetWalletStatementDto, PayVendorDto, ReportTransactionDto, SetRate } from "./dto/wallet.dto";
import { AuthUser } from "@/modules/common/interfaces/auth-user";
import { PassThrough } from "stream";
import { Response } from "express";
import publicApiGuard from "../common/guards/public-api.guard";
import { EPermission } from "@/models/role-permission.model";
import { logAuditTrail } from "../common/audit-logs/logs";
import multer from "multer";
import { LogAction } from "@/models/logs.model";
import { InitiateInternalTransferDto, InitiateTransferDto } from "../budget/dto/budget-transfer.dto";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { WalletTransferService } from "./wallet-transfer.service";
import { PlanUsageService } from "../billing/plan-usage.service";

const whitelist = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp'
]
@Service()
@JsonController('/wallet', { transformResponse: false })
export default class WalletController {
  constructor (private walletService: WalletService, private walletTransferService: WalletTransferService, private usageService: PlanUsageService) { }
  
  @Post('/')
  @UseBefore(publicApiGuard)
  createWallet(@Body() dto: CreateWalletDto) {
    return this.walletService.createWallet(dto)
  }

  @Post('/subaccount')
  // @UseBefore(publicApiGuard)
  @Authorized([EPermission.WalletSubaccountCreate])
  async createSubaccount(@CurrentUser() auth: AuthUser, @Body() dto: CreateSubaccoubtDto) {
    await this.usageService.checkSubaccountsUsage(auth.orgId);
    return this.walletService.createSubaccount(auth, dto)
  }

  @Get('/subaccount')
  @Authorized([EPermission.WalletSubaccountCreate])
  getSubaccounts(@CurrentUser() auth: AuthUser) {
    return this.walletService.getSubaccounts(auth.orgId)
  }

  @Get('/subaccount/:id')
  @Authorized(EPermission.WalletSubaccountCreate)
  getSubaccount(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.walletService.getWallet(auth.orgId, id)
  }

  @Get('/subaccount/history/:id')
  @Authorized(EPermission.WalletSubaccountCreate)
  getSubaccountHistoryId(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.walletService.getWalletEntry(auth.orgId, id)
  }

  @Get('/')
  @Authorized([EPermission.WalletFund, EPermission.WalletTransfer])
  getWallets(@CurrentUser() auth: AuthUser, @QueryParams() query: GetLinkedAccountDto) {
    return this.walletService.getWallets(auth.orgId, query)
  }

  @Get('/history')
  @Authorized(EPermission.TransactionRead)
  getWalletHistory(@CurrentUser() auth: AuthUser, @QueryParams() query: GetWalletEntriesDto) {
    return this.walletService.getWalletEntries(auth, query)
  }

  @Get('/partner/history')
  @Authorized(EPermission.TransactionRead)
  getPartnerWalletHistory(@CurrentUser() auth: AuthUser, @QueryParams() query: GetWalletEntriesDto) {
    return this.walletService.getPartnerWalletEntries(auth, query)
  }

  @Get('/statement/csv')
  @Authorized(EPermission.TransactionDownload)
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
  @Authorized(EPermission.TransactionRead)
  async getAccountStatement(@CurrentUser() auth: AuthUser, @QueryParams() query: GetWalletStatementDto) {
    return this.walletService.sendWalletStatement(auth.orgId, query)
  }

  @Get('/balances')
  @Authorized(EPermission.TransactionRead)
  getBalances(@CurrentUser() auth: AuthUser) {
    return this.walletService.getBalances(auth.orgId)
  }

  @Get('/:id')
  @Authorized(EPermission.TransactionRead)
  getWallet(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.walletService.getWallet(auth.orgId, id)
  }
  
  @Get('/history/:id')
  @Authorized(EPermission.TransactionRead)
  getWalletEntry(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.walletService.getWalletEntry(auth.orgId, id)
  }

  @Post('/report-transaction')
  @Authorized(EPermission.TransactionRead)
  reportTransaction(@CurrentUser() auth: AuthUser, @Body() dto: ReportTransactionDto) {
    return this.walletService.reportTransactionToSlack(auth.orgId, dto)
  }

  @Post('/:id/transfer/initiate')
  @Authorized(EPermission.WalletTransfer)
  @UseBefore(multer().single('invoice'))
  @UseBefore(logAuditTrail(LogAction.INITIATE_TRANSFER))
  async initiateTransfer(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const file = req.file as any
    const dto = plainToInstance(InitiateTransferDto, { fileExt: file?.mimetype.toLowerCase().trim().split('/')[1] || 'pdf', invoice: file?.buffer, ...req.body })
    const errors = await validate(dto)
    if (errors.length) {
      throw { errors }
    }

    return this.walletTransferService.initiateTransfer(auth, id, dto)
  }

  @Post('/:id/transfer/initiate/internal')
  @Authorized(EPermission.WalletTransferOwnAccount)
  @UseBefore(logAuditTrail(LogAction.INITIATE_TRANSFER))
  async initiateInternalTransfer(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body() body: InitiateInternalTransferDto,
  ) {
    return this.walletTransferService.initiateInternalTransfer(auth, id, body)
  }

  @Post('/linked/initiate')
  @Authorized(EPermission.WalletLinkedaccountCreate)
  @UseBefore(logAuditTrail(LogAction.INITIATE_TRANSFER))
  async initiateAccountLink(
    @CurrentUser() auth: AuthUser,
  ) {

    return this.walletTransferService.initiateAccountLink(auth)
  }

  @Post('/linked/:id/debit')
  @Authorized(EPermission.WalletLinkedaccountDebit)
  @UseBefore(multer().single('invoice'))
  @UseBefore(logAuditTrail(LogAction.INITIATE_TRANSFER))
  async initiateDirectDebit(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const file = req.file as any
    const dto = plainToInstance(InitiateTransferDto, { fileExt: file?.mimetype.toLowerCase().trim().split('/')[1] || 'pdf', invoice: file?.buffer, ...req.body })
    const errors = await validate(dto)
    if (errors.length) {
      throw { errors }
    }
    return this.walletTransferService.initiateDirectDebit(auth, id, dto)
  }

  @Post('/linked/:id/inflow')
  @Authorized(EPermission.WalletLinkedaccountDebit)
  @UseBefore(logAuditTrail(LogAction.INITIATE_TRANSFER))
  async initiateLinkedInflow(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Body() body: InitiateInternalTransferDto,
  ) {
    return this.walletTransferService.initiateLinkedInflow(auth, id, body)
  }

  @Put('/linked/:id/pause')
  @Authorized(EPermission.WalletLinkedaccountDebit)
  @UseBefore(logAuditTrail(LogAction.INITIATE_TRANSFER))
  async pauseMandate(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
  ) {
    return this.walletTransferService.pauseMandate(auth, id)
  }

  @Put('/linked/:id/reinstate')
  @Authorized(EPermission.WalletLinkedaccountDebit)
  @UseBefore(logAuditTrail(LogAction.INITIATE_TRANSFER))
  async reinstateMandate(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
  ) {
    return this.walletTransferService.reinstateMandate(auth, id)
  }

  @Post('/:id/vendor/pay')
  @Authorized(EPermission.WalletTransfer)
  @UseBefore(multer().single('recipient'))
  @UseBefore(logAuditTrail(LogAction.INITIATE_TRANSFER))
  async payVendor(
    @CurrentUser() auth: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const file = req.file as any
    const dto = plainToInstance(PayVendorDto, { fileExt: file?.mimetype.toLowerCase().trim().split('/')[1] || 'pdf', receipient: file?.buffer, ...req.body })
    const errors = await validate(dto)
    if (errors.length) {
      throw { errors }
    }
    return this.walletTransferService.payVendor(auth, id, dto)
  }

  @Put('/rate/:partnerId/:currency')
  @Authorized(EPermission.TransactionRead)
  setRate(@CurrentUser() auth: AuthUser, @Param('partnerId') partnerId: string, @Param('currency') currency: string, @Body() dto: SetRate) {
    return this.walletService.setRate(auth.orgId, partnerId, currency, dto.rate)
  }

  @Get('/rate/:partnerId/:currency')
  @Authorized(EPermission.TransactionRead)
  getRate(@CurrentUser() auth: AuthUser, @Param('partnerId') partnerId: string, @Param('currency') currency: string) {
    return this.walletService.getRate(auth.orgId, partnerId, currency)
  }

  @Post('/partner/complete/:id')
  @Authorized(EPermission.TransactionRead)
  @UseBefore(multer().single('receipt'))
  async completeParterTx(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Req() req: Request) {
    const file = req.file as any
    return this.walletService.completePartnerTx(auth.orgId, id, file)
  }

  // TODO: Rollback endpoint for cases where tx is not completed on partner side before timeout
}