import { Module } from "@nestjs/common";
import { APP_FILTER, APP_PIPE } from "@nestjs/core";
import { ZodValidationPipe } from "nestjs-zod";
import { AllExceptionsFilter } from "@/common/filters/all-exceptions.filter";
import { ConfigModule } from "@/config/config.module";
import { DatabaseModule } from "@/database/database.module";
import { AuditModule } from "@/modules/audit/audit.module";
import { AuthModule } from "@/modules/auth/auth.module";
import { BookingsModule } from "@/modules/bookings/bookings.module";
import { CatalogModule } from "@/modules/catalog/catalog.module";
import { CustomersModule } from "@/modules/customers/customers.module";
import { EnquiriesModule } from "@/modules/enquiries/enquiries.module";
import { HealthModule } from "@/modules/health/health.module";
import { InvoicesModule } from "@/modules/invoices/invoices.module";
import { JobsModule } from "@/modules/jobs/jobs.module";
import { MailModule } from "@/modules/mail/mail.module";
import { PaymentsModule } from "@/modules/payments/payments.module";
import { QuotesModule } from "@/modules/quotes/quotes.module";
import { ReportsModule } from "@/modules/reports/reports.module";
import { RoomsModule } from "@/modules/rooms/rooms.module";
import { SeedModule } from "@/modules/seed/seed.module";
import { SettingsModule } from "@/modules/settings/settings.module";
import { StorageModule } from "@/modules/storage/storage.module";
import { UsersModule } from "@/modules/users/users.module";

@Module({
  imports: [
    // infrastructure (global)
    ConfigModule,
    DatabaseModule,
    StorageModule,
    MailModule,
    AuditModule,
    SettingsModule,
    AuthModule,
    // features
    HealthModule,
    CatalogModule,
    RoomsModule,
    QuotesModule,
    BookingsModule,
    PaymentsModule,
    InvoicesModule,
    CustomersModule,
    EnquiriesModule,
    ReportsModule,
    UsersModule,
    JobsModule,
    SeedModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe }, // validates every @Body()/@Query() DTO built with createZodDto
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
