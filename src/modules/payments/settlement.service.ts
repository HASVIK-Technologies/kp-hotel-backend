import { Injectable } from "@nestjs/common";
import { AppConfig } from "@/config/app-config.service";
import { BillingException } from "@/common/errors/app.exception";
import { BookingsRepository } from "@/modules/bookings/bookings.repository";
import { BookingInvoicingService } from "@/modules/bookings/booking-invoicing.service";
import { BookingsService } from "@/modules/bookings/bookings.service";
import { CashfreeService } from "@/modules/gateway/cashfree.service";
import { PaymentOrdersRepository } from "@/modules/gateway/payment-orders.repository";
import { InvoiceDeliveryService } from "@/modules/invoices/invoice-delivery.service";
import { InvoicesService } from "@/modules/invoices/invoices.service";
import { LedgerService, type RecordPaymentInput } from "@/modules/invoices/ledger.service";
import type { GatewayPayment } from "@/modules/gateway/cashfree.service";

export interface SettleResult {
  status: "PAID" | "PENDING" | "FAILED" | "NOT_FOUND";
  bookingRef?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  amountPaise?: number;
}

/**
 * Turns gateway payments into confirmed bookings, invoices and ledger entries.
 * Idempotent: safe to call from both the webhook and the return-page verification.
 */
@Injectable()
export class SettlementService {
  constructor(
    private readonly config: AppConfig,
    private readonly orders: PaymentOrdersRepository,
    private readonly gateway: CashfreeService,
    private readonly bookings: BookingsService,
    private readonly bookingsRepo: BookingsRepository,
    private readonly invoicing: BookingInvoicingService,
    private readonly invoices: InvoicesService,
    private readonly ledger: LedgerService,
    private readonly delivery: InvoiceDeliveryService,
  ) {}

  async settleOrder(orderId: string): Promise<SettleResult> {
    const map = await this.orders.find(orderId);
    if (!map) return { status: "NOT_FOUND" };
    const payments = await this.gateway.fetchOrderPayments(orderId);
    const success = payments.filter((p) => p.status === "SUCCESS");
    const total = success.reduce((s, p) => s + p.amountPaise, 0);

    if (map.target.kind === "booking") return this.settleBooking(orderId, map.target.ref, payments, success, total);
    return this.settleInvoice(orderId, map.target.id, payments, success, total);
  }

  private gatewayPaymentInput(orderId: string, gp: GatewayPayment) {
    return {
      method: "ONLINE" as const,
      recordedBy: "customer:online",
      paidAt: gp.time ?? new Date().toISOString(),
      upiTransactionId: gp.group === "upi" ? gp.bankReference : undefined,
      upiVpa: gp.upiId,
      bankReference: gp.bankReference,
      cashfreeOrderId: orderId,
      cashfreePaymentId: gp.cfPaymentId,
      note: gp.group,
    } satisfies Omit<RecordPaymentInput, "invoiceId" | "amountPaise">;
  }

  /** A duplicate or no-longer-payable gateway payment is ignored instead of failing the settlement. */
  private ignoreBilling<T>(p: Promise<T>) {
    return p.catch((e) => {
      if (e instanceof BillingException) return null;
      throw e;
    });
  }

  private async settleBooking(orderId: string, ref: string, all: GatewayPayment[], success: GatewayPayment[], total: number): Promise<SettleResult> {
    if (!success.length) {
      return { status: all.some((p) => p.status === "PENDING") ? "PENDING" : all.length ? "FAILED" : "PENDING", bookingRef: ref };
    }
    let b = (await this.bookingsRepo.find(ref))!;
    if (b.status === "PENDING_PAYMENT" || b.status === "EXPIRED") await this.bookings.confirmPaid(b);

    const { invoice, created } = await this.invoicing.ensureInvoice(ref, "customer:online");
    for (const gp of success) {
      const balance = (await this.invoices.getLedger(invoice.id))!.balancePaise;
      await this.ignoreBilling(
        this.ledger.recordPayment({ invoiceId: invoice.id, amountPaise: Math.min(gp.amountPaise, balance || gp.amountPaise), ...this.gatewayPaymentInput(orderId, gp) }),
      );
    }
    b = (await this.bookingsRepo.find(ref))!;
    if (created) await this.invoicing.notifyConfirmed(b, invoice);
    return { status: "PAID", bookingRef: ref, invoiceId: invoice.id, invoiceNumber: invoice.number, amountPaise: total };
  }

  private async settleInvoice(orderId: string, invoiceId: string, all: GatewayPayment[], success: GatewayPayment[], total: number): Promise<SettleResult> {
    if (!success.length) return { status: all.length ? "FAILED" : "PENDING", invoiceId };
    const inv = await this.invoices.get(invoiceId);
    for (const gp of success) {
      const r = await this.ignoreBilling(this.ledger.recordPayment({ invoiceId, amountPaise: gp.amountPaise, ...this.gatewayPaymentInput(orderId, gp) }));
      if (r && !r.duplicate && inv) await this.delivery.sendReceipt(inv, r.payment, r.ledger);
    }
    return { status: "PAID", invoiceId, invoiceNumber: inv?.number, amountPaise: total };
  }
}
