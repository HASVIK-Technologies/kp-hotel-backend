import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "@/database/prisma.service";

export interface AuditEntry {
  at: string;
  actor: string;
  action: string;
  target: string;
  detail?: Record<string, unknown>;
}

/** Append-only audit trail of every staff mutation. */
@Injectable()
export class AuditService {
  constructor(private readonly db: PrismaService) {}

  async record(actor: string, action: string, target: string, detail?: Record<string, unknown>) {
    const at = new Date().toISOString();
    await this.db.put({
      pk: `AUDIT#${at.slice(0, 7)}`,
      sk: `${at}#${randomUUID().slice(0, 8)}`,
      gsi1pk: "AUDIT",
      gsi1sk: at,
      actor,
      action,
      target,
      detail,
      at,
    });
  }

  /** Newest first, current month. */
  async recent(limit = 200): Promise<AuditEntry[]> {
    const month = new Date().toISOString().slice(0, 7);
    const items = await this.db.queryPartition<any>(`AUDIT#${month}`, { forward: false, limit });
    return items.map(({ pk, sk, gsi1pk, gsi1sk, ...entry }) => entry as AuditEntry);
  }
}
