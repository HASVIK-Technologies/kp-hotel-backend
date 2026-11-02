import { Module } from "@nestjs/common";
import { CashfreeService } from "./cashfree.service";
import { PaymentOrdersRepository } from "./payment-orders.repository";

@Module({ providers: [CashfreeService, PaymentOrdersRepository], exports: [CashfreeService, PaymentOrdersRepository] })
export class GatewayModule {}
