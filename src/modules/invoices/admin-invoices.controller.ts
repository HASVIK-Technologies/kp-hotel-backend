import { Body, Controller, Get, HttpCode, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ZodValidationPipe } from "nestjs-zod";
import type { Response } from "express";
import { NotFoundAppException } from "@/common/errors/app.exception";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import type { SessionUser } from "@/common/types/session-user";
import { paise } from "@/domain/tax";
import { StaffGuard } from "@/modules/auth/guards/staff.guard";
import { AuditService } from "@/modules/audit/audit.service";
import { CreateInvoiceDto, CreditNoteDto, EmailInvoiceDto, PreviewInvoiceDto, RefundDto } from "./dto/invoice.dto";
import { RecordPaymentDto, ResolveChequeDto } from "./dto/payment.dto";
import { InvoiceComposerService } from "./invoice-composer.service";
import { InvoiceDeliveryService } from "./invoice-delivery.service";
import { InvoicesService } from "./invoices.service";
import { LedgerService } from "./ledger.service";
import { PdfService } from "./pdf.service";
import { StorageService } from "@/modules/storage/storage.service";

@ApiTags("Admin · Invoices & payments")
@ApiCookieAuth()
@UseGuards(StaffGuard)
@Controller("admin")
export class AdminInvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly composer: InvoiceComposerService,
    private readonly delivery: InvoiceDeliveryService,
    private readonly ledger: LedgerService,
    private readonly pdf: PdfService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  @Get("invoices")
  @ApiOperation({ summary: "Latest 500 invoices and credit notes with ledger status and overdue flags." })
  async list() {
    return { invoices: await this.invoices.list() };
  }

  @Get("invoices/:id")
  @ApiOperation({ summary: "Invoice detail with ledger and all payments." })
  async get(@Param("id") id: string) {
    const detail = await this.invoices.detail(id);
    if (!detail) throw new NotFoundAppException("Invoice");
    return detail;
  }

  @Get("invoices/:id/pdf")
  @ApiQuery({ name: "statement", required: false, description: "1 = statement copy including payment summary" })
  @ApiOperation({ summary: "Invoice PDF (the stored, immutable original, or a statement copy)." })
  async pdfFile(@Param("id") id: string, @Query("statement") statement: string | undefined, @Res() res: Response) {
    const inv = await this.invoices.get(id);
    if (!inv) throw new NotFoundAppException("Invoice");
    let bytes: Uint8Array | undefined;
    if (statement === "1") {
      const payments = (await this.invoices.getPayments(id)).filter((p) => p.status !== "FAILED");
      bytes = await this.pdf.render(inv, { ledger: (await this.invoices.getLedger(id))!, payments, copyLabel: "STATEMENT COPY" });
    } else {
      bytes = (await this.storage.get(inv.pdfKey)) ?? (await this.pdf.render(inv));
    }
    const fname = `${inv.number.replace(/\//g, "-")}${statement === "1" ? "-statement" : ""}.pdf`;
    res.status(200).set({ "content-type": "application/pdf", "content-disposition": `inline; filename="${fname}"`, "cache-control": "private, max-age=300" }).end(Buffer.from(bytes));
  }

  @Post("invoices/preview")
  @HttpCode(200)
  @RequirePermission("invoice:create")
  @ApiOperation({ summary: "Live GST breakdown for the new-invoice form. Nothing is saved." })
  preview(@Body() body: PreviewInvoiceDto) {
    return this.composer.preview(body);
  }

  @Post("invoices")
  @RequirePermission("invoice:create")
  @ApiOperation({ summary: "Issue a B2C/B2B GST invoice (rooms, restaurant, banquet, conference…)." })
  async create(@Body() body: CreateInvoiceDto, @CurrentUser() user: SessionUser) {
    return this.composer.compose(body, user.email);
  }

  @Post("invoices/:id/email")
  @HttpCode(200)
  @RequirePermission("invoice:create")
  @ApiOperation({ summary: "Email the invoice PDF and a pay link to the customer (or another address)." })
  async email(@Param("id") id: string, @Body() body: EmailInvoiceDto, @CurrentUser() user: SessionUser) {
    const inv = await this.invoices.get(id);
    if (!inv) throw new NotFoundAppException("Invoice");
    const to = (body.to ?? inv.party.email).trim();
    await this.delivery.emailInvoice(inv.id, to, body.message);
    await this.audit.record(user.email, "invoice.email", inv.number, { to });
    return { ok: true, to };
  }

  @Get("invoices/:id/share")
  @ApiOperation({ summary: "Download link, pay link and a ready-made WhatsApp click-to-chat URL." })
  share(@Param("id") id: string) {
    return this.delivery.shareLinks(id);
  }

  @Post("invoices/:id/pay-link")
  @HttpCode(200)
  @RequirePermission("invoice:create")
  @ApiOperation({ summary: "Create a signed online-payment link (valid 30 days)." })
  async payLink(@Param("id") id: string) {
    if (!(await this.invoices.get(id))) throw new NotFoundAppException("Invoice");
    return { url: await this.delivery.payUrl(id, 30), expiresInDays: 30 };
  }

  @Post("invoices/:id/payments")
  @RequirePermission("payment:record")
  @ApiOperation({ summary: "Record an offline payment (cash, card, UPI, net banking, bank transfer, cheque). Partial payments allowed." })
  @ApiBody({ type: RecordPaymentDto })
  async recordPayment(@Param("id") id: string, @Body(new ZodValidationPipe(RecordPaymentDto)) b: RecordPaymentDto, @CurrentUser() user: SessionUser) {
    const r = await this.ledger.recordPayment({
      invoiceId: id,
      amountPaise: paise(b.amount),
      method: b.method,
      recordedBy: user.email,
      paidAt: b.paidAt,
      note: b.note || undefined,
      upiTransactionId: b.method === "UPI" ? b.upiTransactionId : undefined,
      upiVpa: b.method === "UPI" ? b.upiVpa || undefined : undefined,
      bankReference: "bankReference" in b ? b.bankReference || undefined : undefined,
      cardLast4: b.method === "CARD" ? b.cardLast4 : undefined,
      chequeNumber: b.method === "CHEQUE" ? b.chequeNumber : undefined,
      chequeBank: b.method === "CHEQUE" ? b.chequeBank : undefined,
      chequeDate: b.method === "CHEQUE" ? b.chequeDate : undefined,
    });
    await this.audit.record(user.email, "payment.record", id, { method: b.method, amountPaise: r.payment.amountPaise, id: r.payment.id });
    if (r.payment.status === "SUCCESS") {
      const inv = await this.invoices.get(id);
      if (inv) await this.delivery.sendReceipt(inv, r.payment, r.ledger);
    }
    return r;
  }

  @Post("invoices/:id/payments/:pid/resolve")
  @HttpCode(200)
  @RequirePermission("payment:resolve")
  @ApiOperation({ summary: "Mark a pending cheque as CLEARED or BOUNCED." })
  async resolveCheque(@Param("id") id: string, @Param("pid") pid: string, @Body() body: ResolveChequeDto, @CurrentUser() user: SessionUser) {
    const ledger = await this.ledger.resolveCheque(id, pid, body.outcome, user.email);
    await this.audit.record(user.email, `cheque.${body.outcome.toLowerCase()}`, pid);
    return { ledger };
  }

  @Post("invoices/:id/credit-note")
  @RequirePermission("invoice:credit")
  @ApiOperation({ summary: "Issue a full credit note. The original invoice is never edited." })
  async creditNote(@Param("id") id: string, @Body() body: CreditNoteDto, @CurrentUser() user: SessionUser) {
    const r = await this.ledger.issueCreditNote(id, body.reason, user.email);
    await this.audit.record(user.email, "invoice.credit", id, { creditNote: r.creditNote.number });
    return r;
  }

  @Post("invoices/:id/refund")
  @RequirePermission("payment:resolve")
  @ApiOperation({ summary: "Record a refund against the refund due after a credit note." })
  async refund(@Param("id") id: string, @Body() body: RefundDto, @CurrentUser() user: SessionUser) {
    const r = await this.ledger.recordPayment({ invoiceId: id, amountPaise: paise(body.amount), method: body.method, recordedBy: user.email, kind: "REFUND", bankReference: body.reference || undefined });
    await this.audit.record(user.email, "payment.refund", id, { amountPaise: r.payment.amountPaise });
    return r;
  }

  @Get("payments")
  @ApiOperation({ summary: "Latest 500 receipts and refunds across all invoices." })
  async payments() {
    return { payments: await this.invoices.listPayments() };
  }
}
