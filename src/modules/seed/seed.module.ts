import { Module } from "@nestjs/common";
import { BookingsModule } from "../bookings/bookings.module";
import { CustomersModule } from "../customers/customers.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { RoomsModule } from "../rooms/rooms.module";
import { UsersModule } from "../users/users.module";
import { SeedService } from "./seed.service";

@Module({
  imports: [UsersModule, RoomsModule, BookingsModule, CustomersModule, InvoicesModule],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
