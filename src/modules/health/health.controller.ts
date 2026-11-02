import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { AppConfig } from "@/config/app-config.service";

@ApiTags("Health")
@Controller("health")
export class HealthController {
  constructor(private readonly config: AppConfig) {}

  @Get()
  @ApiOperation({ summary: "Liveness probe. Shows the stage and payment-gateway mode." })
  health() {
    return { ok: true, stage: this.config.env.STAGE, gateway: this.config.env.CASHFREE_MODE, time: new Date().toISOString() };
  }
}
