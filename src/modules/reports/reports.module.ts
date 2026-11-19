import { Module } from "@nestjs/common";
import { BookingsModule } from "../bookings/bookings.module";
import { EnquiriesModule } from "../enquiries/enquiries.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { RoomsModule } from "../rooms/rooms.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [BookingsModule, EnquiriesModule, InvoicesModule, RoomsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
