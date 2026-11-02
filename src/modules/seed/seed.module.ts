import { Module } from "@nestjs/common";
import { BookingsModule } from "@/modules/bookings/bookings.module";
import { CustomersModule } from "@/modules/customers/customers.module";
import { InvoicesModule } from "@/modules/invoices/invoices.module";
import { RoomsModule } from "@/modules/rooms/rooms.module";
import { UsersModule } from "@/modules/users/users.module";
import { SeedService } from "./seed.service";

@Module({
  imports: [UsersModule, RoomsModule, BookingsModule, CustomersModule, InvoicesModule],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
