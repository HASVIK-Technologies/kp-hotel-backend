import { Module } from "@nestjs/common";
import { BookingsModule } from "../bookings/bookings.module";
import { GatewayModule } from "../gateway/gateway.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { PaymentsController } from "./payments.controller";
import { SettlementService } from "./settlement.service";

@Module({
  imports: [BookingsModule, InvoicesModule, GatewayModule],
  controllers: [PaymentsController],
  providers: [SettlementService],
  exports: [SettlementService],
})
export class PaymentsModule {}
