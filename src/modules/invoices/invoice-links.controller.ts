import { Controller, Get, HttpCode, Param, Post, Query, Res } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { AppException, NotFoundAppException } from "@/common/errors/app.exception";
import { TokensService } from "@/modules/auth/tokens.service";
import { StorageService } from "@/modules/storage/storage.service";
import { InvoicePayLinkService } from "./invoice-pay-link.service";
import { InvoicesService } from "./invoices.service";
import { PdfService } from "./pdf.service";

/** Customer-facing invoice endpoints. Access is by a signed link token (`?t=`), no account needed. */
@ApiTags("Invoice links (public, signed)")
@ApiQuery({ name: "t", description: "Signed link token from the email / WhatsApp / confirmation page" })
@Controller("invoices")
export class InvoiceLinksController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly tokens: TokensService,
    private readonly payLinks: InvoicePayLinkService,
    private readonly pdf: PdfService,
    private readonly storage: StorageService,
  ) {}

  @Get(":id/pdf")
  @ApiOperation({ summary: "Download the invoice PDF." })
  async pdfFile(@Param("id") id: string, @Query("t") t: string | undefined, @Res() res: Response) {
    if (!(await this.tokens.verifyLink(t, "invoice", id))) throw new AppException("Link expired or invalid", 403, "FORBIDDEN");
    const inv = await this.invoices.get(id);
    if (!inv) throw new NotFoundAppException("Invoice");
    const bytes = (await this.storage.get(inv.pdfKey)) ?? (await this.pdf.render(inv));
    res
      .status(200)
      .set({ "content-type": "application/pdf", "content-disposition": `inline; filename="${inv.number.replace(/\//g, "-")}.pdf"`, "cache-control": "private, max-age=300" })
      .end(Buffer.from(bytes));
  }

  @Get(":id/summary")
  @ApiOperation({ summary: "Amount due and status, for the public pay page." })
  async summary(@Param("id") id: string, @Query("t") t: string | undefined) {
    if (!(await this.tokens.verifyLink(t, "pay", id))) throw new AppException("This payment link has expired", 403, "FORBIDDEN");
    const [inv, led] = await Promise.all([this.invoices.get(id), this.invoices.getLedger(id)]);
    if (!inv || !led) throw new NotFoundAppException("Invoice");
    return {
      number: inv.number,
      party: inv.party.company || inv.party.name,
      totalPaise: inv.totals.grandTotalPaise,
      balancePaise: led.balancePaise,
      dueDate: inv.dueDate,
      status: led.status,
    };
  }

  @Post(":id/pay")
  @HttpCode(200)
  @ApiOperation({ summary: "Start an online payment for the outstanding balance. Returns the gateway session." })
  async pay(@Param("id") id: string, @Query("t") t: string | undefined) {
    if (!(await this.tokens.verifyLink(t, "pay", id))) throw new AppException("This payment link has expired", 403, "FORBIDDEN");
    return { payment: await this.payLinks.createOrder(id) };
  }
}
