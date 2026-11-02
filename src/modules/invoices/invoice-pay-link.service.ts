import { Injectable } from "@nestjs/common";
import { AppConfig } from "@/config/app-config.service";
import { AppException, NotFoundAppException } from "@/common/errors/app.exception";
import { CashfreeService } from "@/modules/gateway/cashfree.service";
import { PaymentOrdersRepository } from "@/modules/gateway/payment-orders.repository";
import { InvoicesService } from "./invoices.service";

/** Starts an online (gateway) payment for the outstanding balance of an invoice. */
@Injectable()
export class InvoicePayLinkService {
  constructor(
    private readonly config: AppConfig,
    private readonly invoices: InvoicesService,
    private readonly gateway: CashfreeService,
    private readonly orders: PaymentOrdersRepository,
  ) {}

  async createOrder(invoiceId: string) {
    const [inv, led] = await Promise.all([this.invoices.get(invoiceId), this.invoices.getLedger(invoiceId)]);
    if (!inv || !led) throw new NotFoundAppException("Invoice");
    const due = led.balancePaise - led.pendingChequePaise;
    if (inv.docType !== "TAX_INVOICE" || due <= 0) throw new AppException("Nothing is due on this invoice", 409, "NOTHING_DUE");

    const rand = Math.random().toString(36).slice(2, 8);
    const orderId = `${invoiceId.slice(4, 16)}-${Date.now().toString(36)}-${rand}`;
    const order = await this.gateway.createOrder({
      orderId,
      amountPaise: due,
      customerId: `c_${(inv.party.customerId ?? inv.party.email).replace(/[^a-z0-9]/gi, "").slice(0, 30)}`,
      name: inv.party.name,
      email: inv.party.email,
      mobile: inv.party.mobile || "9999999999",
      returnUrl: `${this.config.webUrl}/payment/return?order_id=${orderId}`,
      notifyUrl: `${this.config.apiUrl}/payments/cashfree/webhook`,
      expiresAt: new Date(Date.now() + 30 * 60_000),
      note: `Invoice ${inv.number}`,
    });
    await this.orders.save(orderId, { kind: "invoice", id: invoiceId }, due);
    return { orderId, paymentSessionId: order.paymentSessionId, mode: order.mode, amountPaise: due };
  }
}
