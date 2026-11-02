import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { AppConfig } from "@/config/app-config.service";
import { AppException } from "@/common/errors/app.exception";
import { TokensService } from "@/modules/auth/tokens.service";
import { CashfreeService } from "@/modules/gateway/cashfree.service";
import { MockCompleteDto } from "./dto/payment.dto";
import { SettlementService } from "./settlement.service";

@ApiTags("Payments (public)")
@Controller("payments")
export class PaymentsController {
  constructor(
    private readonly config: AppConfig,
    private readonly settlement: SettlementService,
    private readonly gateway: CashfreeService,
    private readonly tokens: TokensService,
  ) {}

  @Get("verify")
  @ApiOperation({ summary: "Called by the payment-return page. Re-reads the order from the gateway and settles it (idempotent)." })
  async verify(@Query("order_id") orderId?: string) {
    if (!orderId) throw new AppException("order_id is required");
    const r = await this.settlement.settleOrder(orderId);
    const accessToken = r.bookingRef ? await this.tokens.signLink("booking", r.bookingRef, 60) : undefined;
    return { ...r, accessToken };
  }

  @Post("cashfree/webhook")
  @HttpCode(200)
  @ApiOperation({ summary: "Cashfree webhook. Signature (HMAC-SHA256) is verified; the order is then re-checked with the gateway." })
  async webhook(@Req() req: Request & { rawBody?: Buffer }, @Headers("x-webhook-timestamp") ts?: string, @Headers("x-webhook-signature") sig?: string) {
    const raw = req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(req.body ?? {});
    const ok = this.config.env.CASHFREE_MODE === "mock" || this.gateway.verifyWebhookSignature(raw, ts, sig);
    if (!ok) throw new AppException("Invalid signature", 401, "BAD_SIGNATURE");
    const orderId: string | undefined = (req.body as any)?.data?.order?.order_id;
    if (orderId) await this.settlement.settleOrder(orderId); // re-verified against the gateway, idempotent
    return { ok: true };
  }

  @Post("mock/:orderId/complete")
  @HttpCode(200)
  @ApiOperation({ summary: "Local/dev only (CASHFREE_MODE=mock): simulate completing a payment." })
  async mockComplete(@Param("orderId") orderId: string, @Body() body: MockCompleteDto) {
    if (this.config.env.CASHFREE_MODE !== "mock") throw new AppException("Not found", 404, "NOT_FOUND");
    await this.gateway.mockComplete(orderId, body.outcome, body.method);
    return { ok: true };
  }

}
