import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ZodValidationPipe } from "nestjs-zod";
import { RequirePermission } from "@/common/decorators/require-permission.decorator";
import { StaffGuard } from "@/modules/auth/guards/staff.guard";
import { CreateEnquiryDto, NewsletterDto, UpdateEnquiryDto } from "./dto/enquiry.dto";
import { EnquiriesService } from "./enquiries.service";

@ApiTags("Enquiries (public)")
@Controller()
export class EnquiriesController {
  constructor(private readonly enquiries: EnquiriesService) {}

  @Post("enquiries")
  @ApiOperation({ summary: "Submit a table reservation, banquet, conference or contact enquiry. Emails an acknowledgement + staff alert." })
  @ApiBody({ type: CreateEnquiryDto })
  async create(@Body(new ZodValidationPipe(CreateEnquiryDto)) body: CreateEnquiryDto) {
    const e = await this.enquiries.create(body);
    return { id: e.id };
  }

  @Post("newsletter")
  @HttpCode(200)
  @ApiOperation({ summary: "Subscribe an email address to the newsletter." })
  async subscribe(@Body() body: NewsletterDto) {
    await this.enquiries.subscribe(body.email);
    return { ok: true };
  }
}

@ApiTags("Admin · Enquiries")
@ApiCookieAuth()
@UseGuards(StaffGuard)
@Controller("admin/enquiries")
export class AdminEnquiriesController {
  constructor(private readonly enquiries: EnquiriesService) {}

  @Get()
  @ApiOperation({ summary: "Latest 500 enquiries, newest first." })
  async list() {
    return { enquiries: await this.enquiries.list() };
  }

  @Patch(":id")
  @HttpCode(200)
  @RequirePermission("enquiry:manage")
  @ApiOperation({ summary: "Move an enquiry through New → Contacted → Closed." })
  async setStatus(@Param("id") id: string, @Body() body: UpdateEnquiryDto) {
    await this.enquiries.setStatus(id, body.status);
    return { ok: true };
  }
}
