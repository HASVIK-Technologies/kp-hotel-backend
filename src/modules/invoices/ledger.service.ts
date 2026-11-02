import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { BillingException } from "@/common/errors/app.exception";
import { isConditionFailed } from "@/database/prisma.service";
import type { LineInput } from "@/domain/tax";
import { InvoicesRepository } from "./invoices.repository";
import { financialYear, InvoicesService } from "./invoices.service";
import type { Invoice, Ledger, Payment, PaymentMethod } from "./invoice.types";

export interface RecordPaymentInput {
  invoiceId: string;
  amountPaise: number;
  method: PaymentMethod;
  recordedBy: string;
  paidAt?: string;
  upiTransactionId?: string;
  upiVpa?: string;
  bankReference?: string;
  cardLast4?: string;
  chequeNumber?: string;
  chequeBank?: string;
  chequeDate?: string;
  cashfreeOrderId?: string;
  cashfreePaymentId?: string;
  note?: string;
  kind?: "PAYMENT" | "REFUND";
}

const statusOf = (l: Pick<Ledger, "paidPaise" | "balancePaise">): Ledger["status"] => (l.balancePaise <= 0 ? "PAID" : l.paidPaise > 0 ? "PARTIAL" : "UNPAID");
const MAX_RETRIES = 6;

/** Payments, cheque clearance and credit notes against an invoice ledger. */
@Injectable()
export class LedgerService {
  constructor(
    private readonly repo: InvoicesRepository,
    private readonly invoices: InvoicesService,
  ) {}

  /**
   * Appends a payment and updates the ledger with optimistic concurrency.
   * Over-payment is impossible: amount must be ≤ outstanding balance (net of cheques awaiting clearance).
   */
  async recordPayment(input: RecordPaymentInput): Promise<{ payment: Payment; ledger: Ledger; duplicate?: boolean }> {
    const inv = await this.repo.findInvoice(input.invoiceId);
    if (!inv) throw new BillingException("Invoice not found", 404, "NOT_FOUND");
    if (inv.docType === "CREDIT_NOTE") throw new BillingException("Payments cannot be recorded against a credit note");
    if (input.amountPaise <= 0 || !Number.isInteger(input.amountPaise)) throw new BillingException("Amount must be a positive number");

    const kind = input.kind ?? "PAYMENT";
    const isCheque = input.method === "CHEQUE" && kind === "PAYMENT";

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const cur = await this.repo.findLedger(input.invoiceId);
      if (!cur) throw new BillingException("Ledger missing", 500);

      // Idempotency for gateway callbacks (webhook + return-page verify may race / be retried).
      if (input.cashfreePaymentId) {
        const dup = (await this.repo.findPayments(input.invoiceId)).find((p) => p.cashfreePaymentId === input.cashfreePaymentId && p.kind === kind);
        if (dup) return { payment: dup, ledger: cur, duplicate: true };
      }

      const next: Ledger = { ...cur, version: cur.version + 1, updatedAt: new Date().toISOString() };
      if (kind === "REFUND") {
        if (input.amountPaise > cur.refundDuePaise) throw new BillingException("Refund exceeds the refund due on this invoice");
        next.refundDuePaise = cur.refundDuePaise - input.amountPaise;
      } else if (isCheque) {
        if (input.amountPaise > cur.balancePaise - cur.pendingChequePaise) throw new BillingException("Amount exceeds the outstanding balance");
        next.pendingChequePaise = cur.pendingChequePaise + input.amountPaise;
      } else {
        if (cur.status === "CREDITED") throw new BillingException("This invoice has been credited");
        if (input.amountPaise > cur.balancePaise - cur.pendingChequePaise) {
          throw new BillingException(`Amount exceeds the outstanding balance of ₹${((cur.balancePaise - cur.pendingChequePaise) / 100).toFixed(2)}`);
        }
        next.paidPaise = cur.paidPaise + input.amountPaise;
        next.balancePaise = cur.balancePaise - input.amountPaise;
        next.status = statusOf(next);
      }

      const id = `pay_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const paidAt = input.paidAt ?? new Date().toISOString();
      const receiptNumber = kind === "PAYMENT" && !isCheque ? await this.nextReceipt() : undefined;
      const payment: Payment = {
        id,
        receiptNumber,
        invoiceId: input.invoiceId,
        kind,
        amountPaise: input.amountPaise,
        method: input.method,
        status: isCheque ? "PENDING_CLEARANCE" : "SUCCESS",
        paidAt,
        recordedBy: input.recordedBy,
        upiTransactionId: input.upiTransactionId,
        upiVpa: input.upiVpa,
        bankReference: input.bankReference,
        cardLast4: input.cardLast4,
        chequeNumber: input.chequeNumber,
        chequeBank: input.chequeBank,
        chequeDate: input.chequeDate,
        cashfreeOrderId: input.cashfreeOrderId,
        cashfreePaymentId: input.cashfreePaymentId,
        note: input.note,
      };

      try {
        await this.repo.commitPayment(cur.version, next, payment);
        return { payment, ledger: next };
      } catch (e) {
        if (isConditionFailed(e)) continue; // concurrent update → retry
        throw e;
      }
    }
    throw new BillingException("Could not update the ledger, please retry", 409, "CONFLICT");
  }

  private async nextReceipt() {
    const fy = financialYear();
    const n = await this.repo.nextNumber(`RCPT#${fy.key}`);
    return `KP/RCPT/${fy.label}/${String(n).padStart(5, "0")}`;
  }

  /** Mark a pending cheque as cleared (counts towards paid) or bounced (released). */
  async resolveCheque(invoiceId: string, paymentId: string, outcome: "CLEARED" | "BOUNCED", by: string) {
    const rows = await this.repo.findPaymentRows(invoiceId);
    const item = rows.find((p) => p.id === paymentId);
    if (!item) throw new BillingException("Payment not found", 404, "NOT_FOUND");
    if (item.status !== "PENDING_CLEARANCE") throw new BillingException("This cheque has already been resolved");

    for (let a = 0; a < MAX_RETRIES; a++) {
      const cur = (await this.repo.findLedger(invoiceId))!;
      const next: Ledger = { ...cur, version: cur.version + 1, updatedAt: new Date().toISOString(), pendingChequePaise: cur.pendingChequePaise - item.amountPaise };
      if (outcome === "CLEARED") {
        next.paidPaise += item.amountPaise;
        next.balancePaise -= item.amountPaise;
        next.status = statusOf(next);
      }
      try {
        await this.repo.commitChequeResolution(cur.version, next, item, outcome, by);
        return next;
      } catch (e) {
        if (isConditionFailed(e)) continue;
        throw e;
      }
    }
    throw new BillingException("Could not update the ledger, please retry", 409, "CONFLICT");
  }

  /** Full credit note: immutable document that neutralises the original invoice. */
  async issueCreditNote(invoiceId: string, reason: string, by: string): Promise<{ creditNote: Invoice; ledger: Ledger }> {
    const inv = await this.repo.findInvoice(invoiceId);
    if (!inv) throw new BillingException("Invoice not found", 404, "NOT_FOUND");
    if (inv.docType !== "TAX_INVOICE") throw new BillingException("Only tax invoices can be credited");
    const ledger = (await this.repo.findLedger(invoiceId))!;
    if (ledger.status === "CREDITED") throw new BillingException("This invoice is already credited", 409, "ALREADY_CREDITED");
    if (ledger.pendingChequePaise > 0) throw new BillingException("Resolve pending cheques before issuing a credit note");

    const items: LineInput[] = inv.lines.map((l) => ({
      description: `Credit: ${l.description}`,
      ruleCode: l.ruleCode,
      qty: l.qty,
      unitPricePaise: l.unitPricePaise,
      discountPaise: l.discountPaise,
      tariffPaise: l.unitPricePaise,
    }));
    const { invoice: cn } = await this.invoices.create({
      party: inv.party,
      items,
      createdBy: by,
      docType: "CREDIT_NOTE",
      relatesToInvoiceId: inv.id,
      reason,
      bookingRef: inv.bookingRef,
      dueDate: inv.dueDate,
      notes: `Against invoice ${inv.number}`,
    });

    const next: Ledger = { ...ledger, status: "CREDITED", balancePaise: 0, refundDuePaise: ledger.paidPaise, version: ledger.version + 1, updatedAt: new Date().toISOString() };
    await this.repo.markCredited(invoiceId, ledger.version, next, cn.id);
    return { creditNote: cn, ledger: next };
  }
}
