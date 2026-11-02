import { Injectable, Logger } from "@nestjs/common";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { AppConfig } from "@/config/app-config.service";

export interface Mail {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: { filename: string; content: Uint8Array; contentType: string }[];
}

/**
 * Transactional email. Local: .eml files in .data/outbox (inspectable). AWS: SES v2.
 * Cost note: SES is $0.10 per 1,000 emails; attachments are PDFs of a few KB.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Transporter;

  constructor(private readonly config: AppConfig) {}

  private async getTransporter(): Promise<Transporter> {
    if (this.transporter) return this.transporter;
    if (this.config.env.MAIL_MODE === "ses") {
      const { SESv2Client, SendEmailCommand } = await import("@aws-sdk/client-sesv2");
      this.transporter = nodemailer.createTransport({ SES: { sesClient: new SESv2Client({ region: this.config.env.AWS_REGION }), SendEmailCommand } } as any);
    } else {
      this.transporter = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
    }
    return this.transporter;
  }

  async send(m: Mail): Promise<void> {
    const { MAIL_MODE, MAIL_FROM, HOTEL_EMAIL, DATA_DIR } = this.config.env;
    const t = await this.getTransporter();
    const info: any = await t.sendMail({
      from: MAIL_FROM,
      to: m.to,
      subject: m.subject,
      html: m.html,
      text: m.text ?? m.html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      replyTo: m.replyTo ?? HOTEL_EMAIL,
      attachments: m.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content), contentType: a.contentType })),
    });
    if (MAIL_MODE === "console") this.logger.log(`→ ${[m.to].flat().join(", ")} · ${m.subject}`);
    if (MAIL_MODE === "file") {
      const dir = join(resolve(DATA_DIR), "outbox");
      await mkdir(dir, { recursive: true });
      const name = `${new Date().toISOString().replace(/[:.]/g, "-")}-${[m.to].flat()[0].replace(/[^a-z0-9@.]/gi, "_")}.eml`;
      await writeFile(join(dir, name), info.message as Buffer);
    }
  }

  /** Fire-and-forget wrapper: a failed email must never fail a booking or payment. */
  async sendSafe(m: Mail): Promise<void> {
    try {
      await this.send(m);
    } catch (e) {
      this.logger.error(`Email failed: ${(e as Error).message}`);
    }
  }
}
