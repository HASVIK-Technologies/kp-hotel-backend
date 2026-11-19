import { Module } from "@nestjs/common";
import { BookingsModule } from "../bookings/bookings.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";

@Module({
  imports: [BookingsModule, InvoicesModule],
  controllers: [JobsController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
