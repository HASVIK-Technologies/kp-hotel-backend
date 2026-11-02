import { Injectable } from "@nestjs/common";
import { AppConfig } from "@/config/app-config.service";
import { NotFoundAppException } from "@/common/errors/app.exception";
import { TokensService } from "@/modules/auth/tokens.service";
import { MailService } from "@/modules/mail/mail.service";
import { MailTemplates } from "@/modules/mail/mail.templates";
import { StorageService } from "@/modules/storage/storage.service";
import { InvoicesService } from "./invoices.service";
import type { Invoice, Ledger, Payment } from "./invoice.types";

/** Everything about getting an invoice to a customer: signed links, email, WhatsApp text. */
@Injectable()
export class InvoiceDeliveryService {
  constructor(
    private readonly config: AppConfig,
    private readonly invoices: InvoicesService,
    private readonly tokens: TokensService,
    private readonly mail: MailService,
    private readonly templates: MailTemplates,
    private readonly storage: StorageService,
  ) {}

  /** Signed, expiring URL to download the invoice PDF without logging in. */
  async pdfUrl(invoiceId: string, days = 90) {
    return `${this.config.apiUrl}/invoices/${invoiceId}/pdf?t=${await this.tokens.signLink("invoice", invoiceId, days)}`;
  }

  /** Signed URL of the website's "pay this invoice" page. */
  async payUrl(invoiceId: string, days = 30) {
    return `${this.config.webUrl}/pay?invoice=${invoiceId}&t=${await this.tokens.signLink("pay", invoiceId, days)}`;
  }

  async emailInvoice(id: string, to: string, message?: string) {
    const [inv, led] = await Promise.all([this.invoices.get(id), this.invoices.getLedger(id)]);
    if (!inv || !led) throw new NotFoundAppException("Invoice");
    const pdf = await this.storage.get(inv.pdfKey);
    const mail = this.templates.invoiceShare(inv, led, await this.pdfUrl(inv.id, 90), await this.payUrl(inv.id), message);
    await this.mail.sendSafe({
      to,
      ...mail,
      attachments: pdf ? [{ filename: `${inv.number.replace(/\//g, "-")}.pdf`, content: pdf, contentType: "application/pdf" }] : undefined,
    });
  }

  async sendReceipt(inv: Invoice, payment: Payment, ledger: Ledger) {
    await this.mail.sendSafe({ to: inv.party.email, ...this.templates.paymentReceipt(inv, payment, ledger, await this.pdfUrl(inv.id)) });
  }

  /** WhatsApp click-to-chat link now; the WhatsApp Cloud API can be slotted in behind this later. */
  async shareLinks(id: string) {
    const [inv, led] = await Promise.all([this.invoices.get(id), this.invoices.getLedger(id)]);
    if (!inv || !led) throw new NotFoundAppException("Invoice");
    const url = await this.pdfUrl(inv.id);
    const payUrl = led.balancePaise > 0 ? await this.payUrl(inv.id) : undefined;
    const text = `Hello ${inv.party.name}, your invoice ${inv.number} from Hotel KP is ₹${(inv.totals.grandTotalPaise / 100).toLocaleString("en-IN")}.\nDownload: ${url}${payUrl ? `\nPay online: ${payUrl}` : ""}`;
    const phone = (inv.party.mobile ?? "").replace(/\D/g, "");
    const whatsappUrl = phone ? `https://wa.me/${phone.length === 10 ? "91" + phone : phone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
    return { url, payUrl, text, whatsappUrl };
  }
}
