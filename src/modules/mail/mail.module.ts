import { Global, Module } from "@nestjs/common";
import { MailService } from "./mail.service";
import { MailTemplates } from "./mail.templates";

@Global()
@Module({ providers: [MailService, MailTemplates], exports: [MailService, MailTemplates] })
export class MailModule {}
