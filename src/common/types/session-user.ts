import type { Role } from "../constants/permissions";

export interface SessionUser {
  email: string;
  name: string;
  role: Role;
}
