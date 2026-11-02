import { Injectable } from "@nestjs/common";
import type { SessionUser } from "@/common/types/session-user";
import type { Role } from "@/common/constants/permissions";
import { PasswordService } from "@/modules/users/password.service";
import { UsersRepository } from "@/modules/users/users.repository";

export type LoginResult = { user: SessionUser } | { error: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
  ) {}

  /** Constant-ish time login with lockout: 5 failures → 15 minutes. */
  async login(email: string, password: string): Promise<LoginResult> {
    const u = await this.users.find(email);
    // Run a hash even for unknown users so timing doesn't reveal which emails exist.
    if (!u) {
      await this.passwords.hash(password);
      return { error: "Invalid email or password" };
    }
    if (!u.active) return { error: "This account is disabled" };
    if (u.lockedUntil && u.lockedUntil > new Date().toISOString()) return { error: "Too many attempts. Try again in a few minutes." };

    if (!(await this.passwords.verify(password, u.passwordHash))) {
      await this.users.recordFailedLogin(u, (u.failedAttempts ?? 0) + 1);
      return { error: "Invalid email or password" };
    }
    if (u.failedAttempts) await this.users.clearFailedLogins(u);
    return { user: { email: u.email, name: u.name, role: u.role as Role } };
  }
}
