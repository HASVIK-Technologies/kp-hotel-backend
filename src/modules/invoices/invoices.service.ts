import { Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { addDaysIso, istToday } from "@/common/utils/time.util";
import { amountInWords, computeInvoice, stateCodeOf, type Discount, type LineInput } from "@/domain/tax";
import { SettingsService } from "@/modules/settings/settings.service";
import { StorageService } from "@/modules/storage/storage.service";
import { PdfService } from "./pdf.service";
import { InvoicesRepository } from "./invoices.repository";
import type { DocType, Invoice, Ledger, Party, Payment } from "./invoice.types";

/** Indian financial year (Apr–Mar) label, e.g. 2026-10-14 → "26-27". */
export function financialYear(d = new Date()): { key: string; label: string } {
  const ist = new Date(d.getTime() + 5.5 * 3600_000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  const a = String(start).slice(2);
  const b = String(start + 1).slice(2);
  return { key: `${a}${b}`, label: `${a}-${b}` };
}

export interface CreateInvoiceInput {
  party: Party;
  items: LineInput[];
  discount?: Discount;
  discountNote?: string;
  dueDate?: string; // yyyy-mm-dd
  bookingRef?: string;
  notes?: string;
  createdBy: string;
  docType?: DocType;
  relatesToInvoiceId?: string;
  reason?: string;
  issuedAt?: Date;
}

export interface InvoiceRow {
  invoice: Invoice;
  ledger: Ledger;
  overdue: boolean;
  daysOverdue: number;
}

/** Creates immutable GST invoices / credit notes (number series, PDF snapshot, tax rule snapshot). */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly repo: InvoicesRepository,
    private readonly settings: SettingsService,
    private readonly pdf: PdfService,
    private readonly storage: StorageService,
  ) {}

  async create(input: CreateInvoiceInput): Promise<{ invoice: Invoice; ledger: Ledger }> {
    const [settings, rules] = await Promise.all([this.settings.getSettings(), this.settings.getTaxRules()]);
    const issued = input.issuedAt ?? new Date();
    const docType = input.docType ?? "TAX_INVOICE";

    const customerState = input.party.stateCode ?? stateCodeOf(input.party.gstin);
    const { lines, totals } = computeInvoice(input.items, {
      rules,
      discount: input.discount ?? null,
      customerStateCode: customerState,
      hotelStateCode: settings.stateCode,
    });

    const fy = financialYear(issued);
    const n = await this.repo.nextNumber(docType === "CREDIT_NOTE" ? `CN#${fy.key}` : `INV#${fy.key}`);
    const prefix = docType === "CREDIT_NOTE" ? "KP/CN" : "KP";
    const number = `${prefix}/${fy.label}/${String(n).padStart(5, "0")}`;

    const id = `inv_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const party: Party = { ...input.party, stateCode: customerState ?? settings.stateCode };
    const ruleSnapshot = lines.map((l) => ({ code: l.ruleCode, sac: l.sac, rate: l.gstRate, verified: rules.find((r) => r.code === l.ruleCode)?.verified ?? false }));

    const draft: Omit<Invoice, "pdfKey" | "pdfSha256"> = {
      id,
      number,
      docType,
      issuedAt: issued.toISOString(),
      dueDate: input.dueDate ?? addDaysIso(issued, party.type === "B2B" ? settings.defaultCreditDays : 0),
      party,
      lines,
      totals,
      discountNote: input.discountNote,
      placeOfSupply: `${settings.stateCode}-Uttar Pradesh`,
      bookingRef: input.bookingRef,
      relatesToInvoiceId: input.relatesToInvoiceId,
      reason: input.reason,
      notes: input.notes,
      seller: {
        name: settings.name,
        gstin: settings.gstin,
        address: settings.address,
        stateCode: settings.stateCode,
        phone: settings.phone,
        email: settings.email,
        bank: settings.bankAccount ? { name: settings.bankName, account: settings.bankAccount, ifsc: settings.bankIfsc, upiId: settings.upiId } : undefined,
      },
      ruleSnapshot,
      createdBy: input.createdBy,
    };

    // Render first (so the stored hash matches the stored PDF exactly), then persist immutably.
    const pdfKey = `invoices/${fy.label}/${number.replace(/\//g, "_")}.pdf`;
    const provisional = { ...draft, pdfKey, pdfSha256: "" } as Invoice;
    const pdf = await this.pdf.render(provisional);
    const pdfSha256 = createHash("sha256").update(pdf).digest("hex");
    await this.storage.put(pdfKey, pdf, "application/pdf");

    const invoice: Invoice = { ...provisional, pdfSha256 };
    const ledger: Ledger = {
      invoiceId: id,
      paidPaise: 0,
      balancePaise: docType === "CREDIT_NOTE" ? 0 : totals.grandTotalPaise,
      status: docType === "CREDIT_NOTE" ? "CREDITED" : "UNPAID",
      pendingChequePaise: 0,
      refundDuePaise: 0,
      version: 1,
      updatedAt: issued.toISOString(),
    };
    await this.repo.insertInvoice(invoice, ledger);
    return { invoice, ledger };
  }

  get(id: string) {
    return this.repo.findInvoice(id);
  }
  getLedger(id: string) {
    return this.repo.findLedger(id);
  }
  getPayments(id: string): Promise<Payment[]> {
    return this.repo.findPayments(id);
  }
  listPayments(limit = 500) {
    return this.repo.listPayments(limit);
  }

  static decorate(invoice: Invoice, ledger: Ledger): InvoiceRow {
    const today = istToday();
    const overdue = invoice.docType === "TAX_INVOICE" && ledger.balancePaise > 0 && invoice.dueDate < today;
    const daysOverdue = overdue ? Math.floor((Date.parse(today) - Date.parse(invoice.dueDate)) / 86400_000) : 0;
    return { invoice, ledger, overdue, daysOverdue };
  }

  async list(limit = 500): Promise<InvoiceRow[]> {
    const invs = await this.repo.listInvoices(limit);
    const ledgers = await Promise.all(invs.map((i) => this.repo.findLedger(i.id)));
    return invs.map((inv, i) => InvoicesService.decorate(inv, ledgers[i]!));
  }

  /** Invoice + ledger + payments, as shown on the invoice detail screen. */
  async detail(id: string) {
    const [invoice, ledger, payments] = await Promise.all([this.repo.findInvoice(id), this.repo.findLedger(id), this.repo.findPayments(id)]);
    if (!invoice || !ledger) return null;
    return { ...InvoicesService.decorate(invoice, ledger), payments, amountInWords: amountInWords(Math.abs(invoice.totals.grandTotalPaise)) };
  }
}
