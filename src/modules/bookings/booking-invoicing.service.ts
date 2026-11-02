import { Injectable } from "@nestjs/common";
import { AppConfig } from "@/config/app-config.service";
import { BookingException } from "@/common/errors/app.exception";
import { bookingLineItems } from "@/domain/pricing/pricing";
import { TokensService } from "@/modules/auth/tokens.service";
import { CustomersService } from "@/modules/customers/customers.service";
import { InvoicesService } from "@/modules/invoices/invoices.service";
import type { Invoice, Party } from "@/modules/invoices/invoice.types";
import { MailService } from "@/modules/mail/mail.service";
import { MailTemplates } from "@/modules/mail/mail.templates";
import { SettingsService } from "@/modules/settings/settings.service";
import { StorageService } from "@/modules/storage/storage.service";
import { BookingsRepository, type StoredBooking } from "./bookings.repository";
import { toPublicBooking } from "./booking.mapper";

/** Creates the GST invoice for a confirmed booking (exactly once, even under concurrent requests) and notifies the guest. */
@Injectable()
export class BookingInvoicingService {
  constructor(
    private readonly config: AppConfig,
    private readonly repo: BookingsRepository,
    private readonly invoices: InvoicesService,
    private readonly customers: CustomersService,
    private readonly settings: SettingsService,
    private readonly tokens: TokensService,
    private readonly mail: MailService,
    private readonly templates: MailTemplates,
    private readonly storage: StorageService,
  ) {}

  async ensureInvoice(ref: string, by: string): Promise<{ invoice: Invoice; created: boolean }> {
    let b = (await this.repo.find(ref))!;
    if (b.invoiceId) return { invoice: (await this.invoices.get(b.invoiceId))!, created: false };

    if (!(await this.repo.claimInvoiceCreation(ref))) {
      for (let i = 0; i < 20; i++) {
        // another request is creating it, wait for it
        await new Promise((r) => setTimeout(r, 250));
        b = (await this.repo.find(ref))!;
        if (b.invoiceId) return { invoice: (await this.invoices.get(b.invoiceId))!, created: false };
      }
      throw new BookingException("Invoice is being generated, please retry", 409, "BUSY");
    }

    const { items } = bookingLineItems({
      room: { name: b.roomName, price: b.roomPriceRupees },
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      nights: b.nights,
      rooms: b.rooms,
      ratePlan: b.ratePlan,
      addonIds: b.addonIds,
      promo: b.promo,
    });
    const settings = await this.settings.getSettings();
    const stateCode = b.guest.gstin?.slice(0, 2) ?? settings.stateCode;
    const customerId = await this.customers.upsertForGstin(b.guest, stateCode);
    const party: Party = {
      type: b.guest.gstin ? "B2B" : "B2C",
      name: b.guest.name,
      email: b.guest.email,
      mobile: b.guest.mobile,
      company: b.guest.company || undefined,
      gstin: b.guest.gstin || undefined,
      stateCode,
      customerId,
    };
    const { invoice } = await this.invoices.create({
      party,
      items,
      bookingRef: ref,
      createdBy: by,
      dueDate: b.payMode === "online" ? new Date().toISOString().slice(0, 10) : b.checkIn,
      notes: `Stay ${b.checkIn} to ${b.checkOut}`,
    });
    await this.repo.attachInvoice(ref, invoice.id, invoice.number, invoice.totals.grandTotalPaise);
    return { invoice, created: true };
  }

  async notifyConfirmed(b: StoredBooking, invoice: Invoice) {
    const pdf = await this.storage.get(invoice.pdfKey);
    const link = await this.tokens.signLink("invoice", invoice.id);
    const mail = this.templates.bookingConfirmation(toPublicBooking(b), invoice, `${this.config.apiUrl}/invoices/${invoice.id}/pdf?t=${link}`, `${this.config.webUrl}/manage-booking?ref=${b.ref}`);
    await this.mail.sendSafe({
      to: b.guest.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      attachments: pdf ? [{ filename: `${invoice.number.replace(/\//g, "-")}.pdf`, content: pdf, contentType: "application/pdf" }] : undefined,
    });
    await this.mail.sendSafe({
      to: this.config.env.STAFF_ALERT_EMAIL,
      ...this.templates.staffAlert(`New booking ${b.ref}`, [
        ["Guest", b.guest.name],
        ["Room", b.roomName],
        ["Dates", `${b.checkIn} → ${b.checkOut}`],
        ["Mode", b.payMode],
        ["Total", `₹${(b.totalPaise / 100).toLocaleString("en-IN")}`],
      ]),
    });
  }
}
