import { Module } from "@nestjs/common";
import { CustomersModule } from "@/modules/customers/customers.module";
import { GatewayModule } from "@/modules/gateway/gateway.module";
import { AdminInvoicesController } from "./admin-invoices.controller";
import { CustomerStatementController } from "./customer-statement.controller";
import { InvoiceComposerService } from "./invoice-composer.service";
import { InvoiceDeliveryService } from "./invoice-delivery.service";
import { InvoiceLinksController } from "./invoice-links.controller";
import { InvoicePayLinkService } from "./invoice-pay-link.service";
import { InvoicesRepository } from "./invoices.repository";
import { InvoicesService } from "./invoices.service";
import { LedgerService } from "./ledger.service";
import { PdfService } from "./pdf.service";

@Module({
  imports: [CustomersModule, GatewayModule],
  controllers: [AdminInvoicesController, InvoiceLinksController, CustomerStatementController],
  providers: [InvoicesRepository, PdfService, InvoicesService, LedgerService, InvoiceDeliveryService, InvoiceComposerService, InvoicePayLinkService],
  exports: [InvoicesRepository, InvoicesService, LedgerService, InvoiceDeliveryService, PdfService],
})
export class InvoicesModule {}
