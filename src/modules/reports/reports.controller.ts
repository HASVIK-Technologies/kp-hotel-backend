import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import { StaffGuard } from "@/modules/auth/guards/staff.guard";
import { ReportsService } from "./reports.service";

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
class DateRangeQuery extends createZodDto(rangeSchema) {}

const resolveRange = (q: DateRangeQuery) => {
  const to = q.to ?? new Date().toISOString().slice(0, 10);
  const from = q.from ?? `${to.slice(0, 8)}01`;
  return { from, to };
};

@ApiTags("Admin · Reports")
@ApiCookieAuth()
@UseGuards(StaffGuard)
@RequirePermission("reports:view")
@Controller("admin")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("dashboard")
  @ApiOperation({ summary: "KPIs: collections, outstanding, occupancy, enquiries, 6-month revenue by service, recent bookings." })
  dashboard() {
    return this.reports.dashboard();
  }

  @Get("reports/outstanding")
  @ApiOperation({ summary: "Receivables ageing buckets + per-invoice list." })
  outstanding() {
    return this.reports.outstandingAging();
  }

  @Get("reports/gst")
  @ApiQuery({ name: "from", required: false, example: "2026-10-01" })
  @ApiQuery({ name: "to", required: false, example: "2026-10-31" })
  @ApiOperation({ summary: "GSTR-1 style summary by SAC/rate, B2B register and B2C totals (credit notes netted)." })
  gst(@Query() q: DateRangeQuery) {
    const { from, to } = resolveRange(q);
    return this.reports.gstSummary(from, to);
  }

  @Get("reports/collections")
  @ApiQuery({ name: "from", required: false })
  @ApiQuery({ name: "to", required: false })
  @ApiOperation({ summary: "Money collected per payment method (refunds netted)." })
  collections(@Query() q: DateRangeQuery) {
    const { from, to } = resolveRange(q);
    return this.reports.collections(from, to);
  }
}
