import { Module } from "@nestjs/common";
import { CustomersModule } from "@/modules/customers/customers.module";
import { GatewayModule } from "@/modules/gateway/gateway.module";
import { InvoicesModule } from "@/modules/invoices/invoices.module";
import { RoomsModule } from "@/modules/rooms/rooms.module";
import { AdminBookingsController } from "./admin-bookings.controller";
import { BookingInvoicingService } from "./booking-invoicing.service";
import { BookingsController } from "./bookings.controller";
import { BookingsRepository } from "./bookings.repository";
import { BookingsService } from "./bookings.service";

@Module({
  imports: [RoomsModule, InvoicesModule, CustomersModule, GatewayModule],
  controllers: [BookingsController, AdminBookingsController],
  providers: [BookingsRepository, BookingInvoicingService, BookingsService],
  exports: [BookingsService, BookingInvoicingService, BookingsRepository],
})
export class BookingsModule {}
