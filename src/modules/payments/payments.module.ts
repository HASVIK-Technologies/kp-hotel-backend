import { Module } from "@nestjs/common";
import { BookingsModule } from "@/modules/bookings/bookings.module";
import { GatewayModule } from "@/modules/gateway/gateway.module";
import { InvoicesModule } from "@/modules/invoices/invoices.module";
import { PaymentsController } from "./payments.controller";
import { SettlementService } from "./settlement.service";

@Module({
  imports: [BookingsModule, InvoicesModule, GatewayModule],
  controllers: [PaymentsController],
  providers: [SettlementService],
  exports: [SettlementService],
})
export class PaymentsModule {}
