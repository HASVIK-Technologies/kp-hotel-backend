import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import type { SessionUser } from "@/common/types/session-user";
import { StaffGuard } from "@/modules/auth/guards/staff.guard";
import { AuditService } from "@/modules/audit/audit.service";
import { CreateUserDto, UpdateUserDto } from "./dto/user.dto";
import { UsersService } from "./users.service";

@ApiTags("Admin · Staff users")
@ApiCookieAuth()
@UseGuards(StaffGuard)
@RequirePermission("users:manage")
@Controller("admin")
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  @Get("users")
  @ApiOperation({ summary: "List staff accounts (owner only)." })
  async list() {
    return { users: await this.users.list() };
  }

  @Post("users")
  @ApiOperation({ summary: "Create a staff account." })
  async create(@Body() body: CreateUserDto, @CurrentUser() actor: SessionUser) {
    await this.users.create(body);
    await this.audit.record(actor.email, "user.create", body.email, { role: body.role });
    return { ok: true };
  }

  @Patch("users/:email")
  @HttpCode(200)
  @ApiOperation({ summary: "Enable/disable an account or reset its password." })
  async update(@Param("email") email: string, @Body() body: UpdateUserDto, @CurrentUser() actor: SessionUser) {
    if (body.active !== undefined) await this.users.setActive(email, body.active);
    if (body.password) await this.users.resetPassword(email, body.password);
    await this.audit.record(actor.email, "user.update", email, { active: body.active, passwordReset: !!body.password });
    return { ok: true };
  }

  @Get("audit")
  @ApiOperation({ summary: "Recent audit trail entries (current month, newest first)." })
  async auditTrail() {
    return { entries: await this.audit.recent() };
  }
}
