import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import { StaffGuard } from "@/modules/auth/guards/staff.guard";
import { JobsService } from "./jobs.service";

@ApiTags("Admin · Jobs")
@ApiCookieAuth()
@UseGuards(StaffGuard)
@Controller("admin/jobs")
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post("reminders")
  @HttpCode(200)
  @RequirePermission("invoice:create")
  @ApiOperation({ summary: "Send payment reminders now (normally runs daily on a schedule)." })
  async reminders() {
    return { sent: await this.jobs.runReminders() };
  }
}
