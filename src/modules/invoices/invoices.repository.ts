import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";
import { stripKeys } from "@/common/utils/storage-item.util";
import type { Invoice, Ledger, Payment } from "./invoice.types";

/**
 * Persistence for invoices, ledgers and payments. Invoices are immutable: they are written once,
 * together with their ledger and a number-uniqueness guard, in a single transaction.
 */
@Injectable()
export class InvoicesRepository {
  constructor(private readonly db: PrismaService) {}

  async findInvoice(id: string): Promise<Invoice | undefined> {
    const it = await this.db.get(`INVOICE#${id}`, "META");
    return it ? stripKeys<Invoice>(it) : undefined;
  }

  async findLedger(id: string): Promise<Ledger | undefined> {
    const it = await this.db.get(`INVOICE#${id}`, "LEDGER");
    return it ? stripKeys<Ledger>(it) : undefined;
  }

  async findPayments(invoiceId: string): Promise<Payment[]> {
    return (await this.db.queryPartition(`INVOICE#${invoiceId}`, { skPrefix: "PAY#" })).map((p) => stripKeys<Payment>(p));
  }

  /** Raw payment rows including their keys (needed to update a cheque in place). */
  findPaymentRows(invoiceId: string) {
    return this.db.queryPartition<any>(`INVOICE#${invoiceId}`, { skPrefix: "PAY#" });
  }

  async listInvoices(limit: number): Promise<Invoice[]> {
    return (await this.db.listByType("INVOICE", { limit })).map((i) => stripKeys<Invoice>(i));
  }

  async listPayments(limit: number): Promise<Payment[]> {
    return (await this.db.listByType("PAYMENT", { limit })).map((p) => stripKeys<Payment>(p));
  }

  nextNumber(series: string) {
    return this.db.nextCounter(series);
  }

  /** Invoice + ledger + number-uniqueness guard are written atomically. Never deleted afterwards. */
  async insertInvoice(invoice: Invoice, ledger: Ledger) {
    const custKey = invoice.party.customerId ? `CUST#${invoice.party.customerId}` : `EMAIL#${invoice.party.email.toLowerCase()}`;
    const invoiceItem = {
      pk: `INVOICE#${invoice.id}`,
      sk: "META",
      gsi1pk: "INVOICE",
      gsi1sk: `${invoice.issuedAt}#${invoice.id}`,
      gsi2pk: custKey,
      gsi2sk: `INVOICE#${invoice.issuedAt}#${invoice.id}`,
      ...invoice,
    };
    await this.db.transaction([
      { put: { item: invoiceItem, ifNotExists: true } },
      { put: { item: { pk: `INVOICE#${invoice.id}`, sk: "LEDGER", ...ledger }, ifNotExists: true } },
      { put: { item: { pk: `INVNUM#${invoice.number}`, sk: "META", invoiceId: invoice.id }, ifNotExists: true } },
    ]);
  }

  /** Optimistic-concurrency ledger update + payment append. Throws a condition error if the ledger changed. */
  async commitPayment(expectedVersion: number, next: Ledger, payment: Payment) {
    await this.db.transaction([
      {
        update: {
          key: { pk: `INVOICE#${next.invoiceId}`, sk: "LEDGER" },
          mutation: {
            set: {
              paidPaise: next.paidPaise, balancePaise: next.balancePaise, status: next.status,
              pendingChequePaise: next.pendingChequePaise, refundDuePaise: next.refundDuePaise,
              version: next.version, updatedAt: next.updatedAt,
            },
            conditions: { equals: { version: expectedVersion } },
          },
        },
      },
      {
        put: {
          item: { pk: `INVOICE#${payment.invoiceId}`, sk: `PAY#${payment.paidAt}#${payment.id}`, gsi1pk: "PAYMENT", gsi1sk: `${payment.paidAt}#${payment.id}`, ...payment },
          ifNotExists: true,
        },
      },
    ]);
  }

  /** Ledger update + cheque status change, atomically. */
  async commitChequeResolution(expectedVersion: number, next: Ledger, chequeRow: { pk: string; sk: string }, outcome: "CLEARED" | "BOUNCED", by: string) {
    await this.db.transaction([
      {
        update: {
          key: { pk: `INVOICE#${next.invoiceId}`, sk: "LEDGER" },
          mutation: {
            set: {
              paidPaise: next.paidPaise, balancePaise: next.balancePaise, status: next.status,
              pendingChequePaise: next.pendingChequePaise, version: next.version, updatedAt: next.updatedAt,
            },
            conditions: { equals: { version: expectedVersion } },
          },
        },
      },
      {
        update: {
          key: { pk: chequeRow.pk, sk: chequeRow.sk },
          mutation: {
            set: { status: outcome === "CLEARED" ? "SUCCESS" : "BOUNCED", resolvedAt: next.updatedAt, resolvedBy: by },
            conditions: { equals: { status: "PENDING_CLEARANCE" } },
          },
        },
      },
    ]);
  }

  /** Mark the original invoice credited (optimistic concurrency). */
  async markCredited(invoiceId: string, expectedVersion: number, next: Ledger, creditNoteId: string) {
    await this.db.update(
      { pk: `INVOICE#${invoiceId}`, sk: "LEDGER" },
      {
        set: { status: next.status, balancePaise: 0, refundDuePaise: next.refundDuePaise, version: next.version, updatedAt: next.updatedAt, creditNoteId },
        conditions: { equals: { version: expectedVersion } },
      },
    );
  }

  async setLastReminder(invoiceId: string, at: string) {
    await this.db.update({ pk: `INVOICE#${invoiceId}`, sk: "LEDGER" }, { set: { lastReminderAt: at } });
  }
}
