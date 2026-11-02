import { Injectable } from "@nestjs/common";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1 };

/** scrypt password hashing (memory-hard, built into Node, no native dependency). */
@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await scrypt(password, salt, 64, PARAMS);
    return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const [, saltHex, keyHex] = stored.split("$");
    if (!saltHex || !keyHex) return false;
    const key = await scrypt(password, Buffer.from(saltHex, "hex"), 64, PARAMS);
    const expected = Buffer.from(keyHex, "hex");
    return key.length === expected.length && timingSafeEqual(key, expected);
  }
}
