import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";
import type { Role } from "@/common/constants/permissions";

export interface UserRecord {
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  active: boolean;
  failedAttempts?: number;
  lockedUntil?: string;
  createdAt: string;
}
export type StoredUser = UserRecord & { pk: string; sk: string };
export type PublicUser = Omit<UserRecord, "passwordHash" | "failedAttempts" | "lockedUntil">;

@Injectable()
export class UsersRepository {
  constructor(private readonly db: PrismaService) {}

  find(email: string) {
    return this.db.get<StoredUser>(`USER#${email.toLowerCase()}`);
  }

  async insert(u: { email: string; name: string; role: Role; passwordHash: string }) {
    const email = u.email.toLowerCase();
    const now = new Date().toISOString();
    await this.db.put(
      { pk: `USER#${email}`, sk: "META", gsi1pk: "USER", gsi1sk: now, email, name: u.name, role: u.role, passwordHash: u.passwordHash, active: true, createdAt: now },
      { ifNotExists: true },
    );
  }

  async list(): Promise<PublicUser[]> {
    const rows = await this.db.listByType<StoredUser>("USER", { newestFirst: false });
    return rows.map(({ passwordHash, failedAttempts, lockedUntil, pk, sk, ...user }: any) => user);
  }

  async setActive(email: string, active: boolean) {
    await this.db.update({ pk: `USER#${email.toLowerCase()}`, sk: "META" }, { set: { active } });
  }

  async setPassword(email: string, passwordHash: string) {
    await this.db.update(
      { pk: `USER#${email.toLowerCase()}`, sk: "META" },
      { set: { passwordHash, failedAttempts: 0 }, remove: ["lockedUntil"] },
    );
  }

  async recordFailedLogin(u: StoredUser, fails: number) {
    const lock = fails >= 5;
    await this.db.update(
      { pk: u.pk, sk: u.sk },
      { set: lock ? { failedAttempts: 0, lockedUntil: new Date(Date.now() + 15 * 60_000).toISOString() } : { failedAttempts: fails } },
    );
  }

  async clearFailedLogins(u: StoredUser) {
    await this.db.update({ pk: u.pk, sk: u.sk }, { set: { failedAttempts: 0 } });
  }
}
