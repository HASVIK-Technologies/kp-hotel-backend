import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AppConfig } from "@/config/app-config.service";
import { PrismaService, isConditionFailed } from "@/database/prisma.service";
import { NotFoundAppException } from "@/common/errors/app.exception";
import { stripKeys } from "@/common/utils/storage-item.util";
import { MailService } from "@/modules/mail/mail.service";
import { MailTemplates } from "@/modules/mail/mail.templates";
import type { CreateEnquiryDto } from "./dto/enquiry.dto";
import type { Enquiry } from "./enquiry.types";

const summarise = (e: CreateEnquiryDto): string =>
  e.kind === "Table"
    ? `Table for ${e.guests} · ${e.date} ${e.time}${e.occasion ? ` · ${e.occasion}` : ""}`
    : e.kind === "Banquet"
      ? `${e.eventType} · ${e.guests} guests · ${e.date} · ${e.hall}${e.pkg ? ` · ${e.pkg}` : ""}`
      : e.kind === "Conference"
        ? `${e.attendees} attendees · ${e.layout} · ${e.duration} day · ${e.date}`
        : `${e.subject}: ${e.message.slice(0, 100)}`;

/** Website enquiries (table, banquet, conference, contact) and the staff inbox workflow. */
@Injectable()
export class EnquiriesService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: AppConfig,
    private readonly mail: MailService,
    private readonly templates: MailTemplates,
  ) {}

  async create(dto: CreateEnquiryDto): Promise<Enquiry> {
    const now = new Date().toISOString();
    const summary = summarise(dto);
    const enquiry: Enquiry = {
      id: `ENQ-${randomUUID().slice(0, 6).toUpperCase()}`,
      kind: dto.kind,
      name: dto.name,
      email: "email" in dto ? dto.email : undefined,
      mobile: "mobile" in dto ? (dto.mobile as string) : undefined,
      date: "date" in dto ? dto.date : undefined,
      summary,
      details: dto as unknown as Record<string, unknown>,
      status: "New",
      createdAt: now,
    };
    await this.db.put({ pk: `ENQ#${enquiry.id}`, sk: "META", gsi1pk: "ENQUIRY", gsi1sk: `${now}#${enquiry.id}`, ...enquiry });

    if (enquiry.email) await this.mail.sendSafe({ to: enquiry.email, ...this.templates.enquiryAck(enquiry.kind, enquiry.name, summary) });
    await this.mail.sendSafe({
      to: this.config.env.STAFF_ALERT_EMAIL,
      ...this.templates.staffAlert(`New ${enquiry.kind} enquiry`, [
        ["Name", enquiry.name],
        ["Contact", `${enquiry.mobile ?? ""} ${enquiry.email ?? ""}`],
        ["Request", summary],
      ]),
    });
    return enquiry;
  }

  async list(): Promise<Enquiry[]> {
    return (await this.db.listByType("ENQUIRY", { limit: 500 })).map((e) => stripKeys<Enquiry>(e));
  }

  async setStatus(id: string, status: Enquiry["status"]) {
    try {
      await this.db.update({ pk: `ENQ#${id}`, sk: "META" }, { set: { status } });
    } catch (e) {
      if (isConditionFailed(e)) throw new NotFoundAppException("Enquiry");
      throw e;
    }
  }

  async subscribe(email: string) {
    await this.db.put({ pk: `NEWSLETTER#${email.toLowerCase()}`, sk: "META", at: new Date().toISOString() });
  }
}
