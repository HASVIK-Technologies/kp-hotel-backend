import { Body, Controller, Get, HttpCode, Put, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import type { SessionUser } from "@/common/types/session-user";
import { StaffGuard } from "@/modules/auth/guards/staff.guard";
import { AuditService } from "@/modules/audit/audit.service";
import { SettingsDto, TaxRulesDto } from "./dto/settings.dto";
import { SettingsService } from "./settings.service";

@ApiTags("Admin · Settings & tax")
@ApiCookieAuth()
@UseGuards(StaffGuard)
@Controller("admin")
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get("tax-rules")
  @ApiOperation({ summary: "GST rules (SAC codes, rates, tariff slabs)." })
  async taxRules() {
    return { rules: await this.settings.getTaxRules() };
  }

  @Put("tax-rules")
  @HttpCode(200)
  @RequirePermission("tax:edit")
  @ApiOperation({ summary: "Replace the GST rules. Issued invoices keep the snapshot they were created with." })
  async saveTaxRules(@Body() body: TaxRulesDto, @CurrentUser() user: SessionUser) {
    await this.settings.saveTaxRules(body.rules);
    await this.audit.record(user.email, "taxrules.update", "CONFIG", { rules: body.rules.map((r) => ({ code: r.code, rate: r.rate, verified: r.verified })) });
    return { ok: true };
  }

  @Get("settings")
  @ApiOperation({ summary: "Business details printed on invoices." })
  async getSettings() {
    return { settings: await this.settings.getSettings() };
  }

  @Put("settings")
  @HttpCode(200)
  @RequirePermission("settings:edit")
  @ApiOperation({ summary: "Update business details (owner only)." })
  async saveSettings(@Body() body: SettingsDto, @CurrentUser() user: SessionUser) {
    await this.settings.saveSettings(body);
    await this.audit.record(user.email, "settings.update", "CONFIG");
    return { settings: await this.settings.getSettings() };
  }
}
