import { Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { AppConfig } from "@/config/app-config.service";
import { PrismaService } from "@/database/prisma.service";

/**
 * Cashfree Payment Gateway (PG) adapter.
 *  - sandbox / production: real REST calls (x-api-version pinned via CASHFREE_API_VERSION)
 *  - mock: in-database simulator so the full flow is testable offline
 * Card / UPI / net-banking details are captured on Cashfree's hosted checkout; they never touch our servers
 * (PCI scope stays minimal).
 */
const BASE = { sandbox: "https://sandbox.cashfree.com/pg", production: "https://api.cashfree.com/pg" } as const;

export interface GatewayOrder {
  orderId: string;
  cfOrderId?: string;
  paymentSessionId: string;
  mode: "mock" | "sandbox" | "production";
}

export interface GatewayPayment {
  cfPaymentId: string;
  status: "SUCCESS" | "FAILED" | "PENDING" | "USER_DROPPED" | "OTHER";
  amountPaise: number;
  group?: string;
  upiId?: string;
  bankReference?: string;
  time?: string;
  message?: string;
}

export interface CreateOrderInput {
  orderId: string;
  amountPaise: number;
  customerId: string;
  name: string;
  email: string;
  mobile: string;
  returnUrl: string;
  notifyUrl: string;
  expiresAt: Date;
  note?: string;
}

@Injectable()
export class CashfreeService {
  constructor(
    private readonly config: AppConfig,
    private readonly db: PrismaService,
  ) {}

  get mode() {
    return this.config.env.CASHFREE_MODE;
  }

  private headers() {
    const e = this.config.env;
    return { "content-type": "application/json", "x-client-id": e.CASHFREE_CLIENT_ID, "x-client-secret": e.CASHFREE_CLIENT_SECRET, "x-api-version": e.CASHFREE_API_VERSION };
  }

  async createOrder(p: CreateOrderInput): Promise<GatewayOrder> {
    const mode = this.mode;
    if (mode === "mock") {
      await this.db.put({ pk: `MOCKORDER#${p.orderId}`, sk: "META", amountPaise: p.amountPaise, createdAt: new Date().toISOString() });
      return { orderId: p.orderId, paymentSessionId: `mock_session_${p.orderId}`, mode };
    }
    const res = await fetch(`${BASE[mode]}/orders`, {
      method: "POST",
      headers: { ...this.headers(), "x-idempotency-key": p.orderId },
      body: JSON.stringify({
        order_id: p.orderId,
        order_amount: Number((p.amountPaise / 100).toFixed(2)),
        order_currency: "INR",
        customer_details: { customer_id: p.customerId, customer_name: p.name, customer_email: p.email, customer_phone: p.mobile },
        order_meta: { return_url: p.returnUrl, notify_url: p.notifyUrl },
        order_expiry_time: p.expiresAt.toISOString(),
        order_note: p.note,
      }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || !body.payment_session_id) throw new Error(`Cashfree order failed (${res.status}): ${body.message ?? "unknown error"}`);
    return { orderId: body.order_id, cfOrderId: String(body.cf_order_id), paymentSessionId: body.payment_session_id, mode };
  }

  /** Source of truth for settlement: always re-read from the gateway, never trust client/webhook payload amounts. */
  async fetchOrderPayments(orderId: string): Promise<GatewayPayment[]> {
    const mode = this.mode;
    if (mode === "mock") {
      const items = await this.db.queryPartition<any>(`MOCKORDER#${orderId}`, { skPrefix: "PAY#" });
      return items.map((i) => ({
        cfPaymentId: i.cfPaymentId,
        status: i.status,
        amountPaise: i.amountPaise,
        group: i.group,
        upiId: i.upiId,
        bankReference: i.bankReference,
        time: i.time,
        message: i.message,
      }));
    }
    const res = await fetch(`${BASE[mode]}/orders/${encodeURIComponent(orderId)}/payments`, { headers: this.headers() });
    if (!res.ok) throw new Error(`Cashfree payments lookup failed (${res.status})`);
    const list = (await res.json()) as any[];
    return list.map((p) => ({
      cfPaymentId: String(p.cf_payment_id),
      status: (["SUCCESS", "FAILED", "PENDING", "USER_DROPPED"].includes(p.payment_status) ? p.payment_status : "OTHER") as GatewayPayment["status"],
      amountPaise: Math.round(Number(p.payment_amount) * 100),
      group: p.payment_group,
      upiId: p.payment_method?.upi?.upi_id,
      bankReference: p.bank_reference,
      time: p.payment_time,
      message: p.payment_message,
    }));
  }

  /** signature = base64( HMAC_SHA256( timestamp + rawBody, clientSecret ) ) */
  verifyWebhookSignature(rawBody: string, timestamp: string | undefined, signature: string | undefined): boolean {
    if (!timestamp || !signature) return false;
    const expected = createHmac("sha256", this.config.env.CASHFREE_CLIENT_SECRET).update(timestamp + rawBody).digest("base64");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Mock-mode only: simulate the customer finishing a payment on the hosted page. */
  async mockComplete(orderId: string, outcome: "SUCCESS" | "FAILED", method: "upi" | "card" | "net_banking") {
    if (this.mode !== "mock") throw new Error("Mock gateway is disabled");
    const order = await this.db.get<any>(`MOCKORDER#${orderId}`);
    if (!order) throw new Error("Unknown order");
    const n = Date.now();
    await this.db.put({
      pk: `MOCKORDER#${orderId}`,
      sk: `PAY#${n}`,
      cfPaymentId: `mock_${n}`,
      status: outcome,
      amountPaise: order.amountPaise,
      group: method === "card" ? "credit_card" : method,
      upiId: method === "upi" ? "guest@okbank" : undefined,
      bankReference: `MOCKREF${n}`,
      time: new Date().toISOString(),
      message: outcome === "SUCCESS" ? "Simulated success" : "Simulated failure",
    });
  }

  /** Full/partial refund against an order. Mock mode records a synthetic refund. */
  async createRefund(orderId: string, amountPaise: number, refundId: string, note: string): Promise<{ ok: boolean; refundId: string; message?: string }> {
    const mode = this.mode;
    if (mode === "mock") return { ok: true, refundId };
    const res = await fetch(`${BASE[mode]}/orders/${encodeURIComponent(orderId)}/refunds`, {
      method: "POST",
      headers: { ...this.headers(), "x-idempotency-key": refundId },
      body: JSON.stringify({ refund_amount: Number((amountPaise / 100).toFixed(2)), refund_id: refundId, refund_note: note }),
    });
    const body: any = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, refundId: body.refund_id ?? refundId } : { ok: false, refundId, message: body.message ?? `HTTP ${res.status}` };
  }
}
