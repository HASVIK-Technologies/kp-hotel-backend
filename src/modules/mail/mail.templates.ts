import { Injectable } from "@nestjs/common";
import { AppConfig } from "@/config/app-config.service";
import type { Booking } from "@/modules/bookings/booking.types";
import type { Invoice, Ledger, Payment } from "@/modules/invoices/invoice.types";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fdate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

const h = (t: string) => `<h1 style="font-family:Georgia,serif;font-size:26px;color:#1f3d33;margin:0 0 12px">${esc(t)}</h1>`;
const p = (t: string) => `<p style="font-size:15px;line-height:1.6;margin:0 0 12px">${t}</p>`;
const kv = (rows: [string, string][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0;border:1px solid #e3dacb;border-radius:10px">${rows
    .map(([k, v]) => `<tr><td style="padding:9px 14px;color:#5b625e;font-size:13px;border-bottom:1px solid #f3ece1">${esc(k)}</td><td style="padding:9px 14px;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #f3ece1">${v}</td></tr>`)
    .join("")}</table>`;

/** Brand-consistent, responsive transactional emails (table layout for email-client compatibility). */
@Injectable()
export class MailTemplates {
  constructor(private readonly config: AppConfig) {}

  private shell(title: string, body: string, cta?: { label: string; href: string }) {
    const { HOTEL_ADDRESS, HOTEL_PHONE, HOTEL_EMAIL } = this.config.env;
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f3ece1;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#14161a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#1f3d33;padding:22px 28px"><span style="font-family:Georgia,serif;font-size:24px;color:#fff;font-weight:bold;letter-spacing:1px">HOTEL KP</span><span style="color:#d9bc8a;font-size:11px;letter-spacing:3px;margin-left:8px">&amp; RESTAURANT</span></td></tr>
<tr><td style="padding:28px">${body}
${cta ? `<p style="margin:28px 0 0"><a href="${esc(cta.href)}" style="background:#2f7d4f;color:#fff;text-decoration:none;padding:13px 26px;border-radius:999px;font-weight:600;display:inline-block">${esc(cta.label)}</a></p>` : ""}
</td></tr>
<tr><td style="background:#faf7f2;padding:18px 28px;font-size:12px;color:#5b625e">${esc(HOTEL_ADDRESS)}<br>${esc(HOTEL_PHONE)} · ${esc(HOTEL_EMAIL)}</td></tr>
</table></td></tr></table></body></html>`;
  }

  bookingConfirmation(b: Booking, inv: Invoice | undefined, invoiceUrl?: string, manageUrl?: string) {
    const paid = b.status === "PENDING_PAYMENT" ? false : b.payMode !== "hotel";
    return {
      subject: `Booking confirmed · ${b.ref} · ${b.roomName}`,
      html: this.shell("Booking confirmed",
        h(b.payMode === "hotel" ? "Your room is reserved" : "Booking confirmed") +
        p(`Dear ${esc(b.guest.name)}, thank you for choosing Hotel KP &amp; Restaurant. Your reservation <b>${esc(b.ref)}</b> is ${b.payMode === "hotel" ? "held, please pay at the front desk on arrival" : "confirmed and paid"}.`) +
        kv([
          ["Room", esc(b.roomName)],
          ["Check-in", `${esc(fdate(b.checkIn))} · from 12:00 PM`],
          ["Check-out", `${esc(fdate(b.checkOut))} · until 11:00 AM`],
          ["Guests", `${b.adults} adult${b.adults > 1 ? "s" : ""}${b.children ? `, ${b.children} child${b.children > 1 ? "ren" : ""}` : ""}`],
          ["Invoice", esc(inv?.number ?? "—")],
          [paid ? "Total paid" : "Total due at hotel", inr(b.totalPaise)],
        ]) +
        p("Your GST tax invoice is attached. Free cancellation applies up to 48 hours before check-in on room-only rates."),
        manageUrl ? { label: "Manage booking", href: manageUrl } : undefined),
      text: `Booking ${b.ref} confirmed. ${b.roomName}, ${b.checkIn} to ${b.checkOut}. ${invoiceUrl ?? ""}`,
    };
  }

  paymentReceipt(inv: Invoice, pay: Payment, ledger: Ledger, invoiceUrl?: string) {
    return {
      subject: `Payment received ${inr(pay.amountPaise)} · ${inv.number}`,
      html: this.shell("Payment received",
        h("Payment received") +
        p(`Dear ${esc(inv.party.company || inv.party.name)}, we have received your payment. Thank you.`) +
        kv([
          ["Invoice", esc(inv.number)],
          ["Amount received", inr(pay.amountPaise)],
          ["Method", esc(pay.method.replace("_", " "))],
          ...(pay.upiTransactionId ? ([["UPI transaction ID", esc(pay.upiTransactionId)]] as [string, string][]) : []),
          ...(pay.bankReference ? ([["Reference", esc(pay.bankReference)]] as [string, string][]) : []),
          ...(pay.receiptNumber ? ([["Receipt no.", esc(pay.receiptNumber)]] as [string, string][]) : []),
          ["Balance due", inr(ledger.balancePaise)],
        ]),
        invoiceUrl ? { label: "Download invoice", href: invoiceUrl } : undefined),
    };
  }

  invoiceShare(inv: Invoice, ledger: Ledger, invoiceUrl: string, payUrl?: string, message?: string) {
    return {
      subject: `${inv.docType === "CREDIT_NOTE" ? "Credit note" : "Tax invoice"} ${inv.number} from Hotel KP`,
      html: this.shell("Invoice",
        h(inv.docType === "CREDIT_NOTE" ? "Credit note" : "Your invoice") +
        p(`Dear ${esc(inv.party.company || inv.party.name)}, please find ${inv.docType === "CREDIT_NOTE" ? "credit note" : "invoice"} <b>${esc(inv.number)}</b> attached.`) +
        (message ? p(esc(message)) : "") +
        kv([
          ["Invoice date", esc(fdate(inv.issuedAt))],
          ["Due date", esc(fdate(inv.dueDate))],
          ["Invoice total", inr(inv.totals.grandTotalPaise)],
          ["Balance due", inr(ledger.balancePaise)],
        ]),
        payUrl && ledger.balancePaise > 0 ? { label: `Pay ${inr(ledger.balancePaise)} online`, href: payUrl } : { label: "Download invoice (PDF)", href: invoiceUrl }),
    };
  }

  paymentReminder(inv: Invoice, ledger: Ledger, daysOverdue: number, payUrl: string) {
    return {
      subject: daysOverdue > 0 ? `Payment overdue · ${inv.number}` : `Payment due soon · ${inv.number}`,
      html: this.shell("Payment reminder",
        h(daysOverdue > 0 ? "Payment overdue" : "Payment due soon") +
        p(`Dear ${esc(inv.party.company || inv.party.name)}, this is a courtesy reminder that invoice <b>${esc(inv.number)}</b> ${daysOverdue > 0 ? `was due on ${esc(fdate(inv.dueDate))} (${daysOverdue} day${daysOverdue > 1 ? "s" : ""} ago)` : `is due on ${esc(fdate(inv.dueDate))}`}.`) +
        kv([["Outstanding", inr(ledger.balancePaise)]]) +
        p("If you have already paid, please ignore this message or share the transaction reference with us."),
        { label: `Pay ${inr(ledger.balancePaise)} online`, href: payUrl }),
    };
  }

  enquiryAck(kind: string, name: string, summary: string) {
    return {
      subject: `We received your ${kind.toLowerCase()} enquiry`,
      html: this.shell("Enquiry received",
        h("Thank you, we're on it") +
        p(`Dear ${esc(name)}, we have received your ${esc(kind.toLowerCase())} request and our team will reply within 4 business hours.`) +
        kv([["Your request", esc(summary)]])),
    };
  }

  staffAlert(title: string, rows: [string, string][]) {
    return { subject: `[KP] ${title}`, html: this.shell(title, h(title) + kv(rows.map(([k, v]) => [k, esc(v)] as [string, string]))) };
  }

  bookingCancelled(b: Booking, refundNote: string) {
    return {
      subject: `Booking ${b.ref} cancelled`,
      html: this.shell("Booking cancelled", h("Booking cancelled") + p(`Dear ${esc(b.guest.name)}, your booking <b>${esc(b.ref)}</b> for ${esc(b.roomName)} (${esc(fdate(b.checkIn))} – ${esc(fdate(b.checkOut))}) has been cancelled.`) + p(esc(refundNote))),
    };
  }

}
