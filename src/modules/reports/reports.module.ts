import { Module } from "@nestjs/common";
import { BookingsModule } from "@/modules/bookings/bookings.module";
import { EnquiriesModule } from "@/modules/enquiries/enquiries.module";
import { InvoicesModule } from "@/modules/invoices/invoices.module";
import { RoomsModule } from "@/modules/rooms/rooms.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [BookingsModule, EnquiriesModule, InvoicesModule, RoomsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
