import { z } from "zod";
import { gstinChecksumOk } from "@/domain/tax/gstin";

/**
 * Reusable Zod building blocks for every DTO. The frontend keeps its own mirror of the
 * user-facing rules (for instant form feedback); this file is the authoritative copy.
 */
export const nameSchema = z
  .string()
  .trim()
  .min(2, "Please enter your full name")
  .max(80, "Name is too long")
  .regex(/^[\p{L}][\p{L}\s.'-]*$/u, "Name can only contain letters and spaces");

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address"));

/** Indian mobile: optional +91/0 prefix, 10 digits starting 6-9. */
export const normaliseMobile = (v: string) => v.replace(/[\s()-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "");
export const mobileSchema = z
  .string()
  .trim()
  .min(1, "Enter your mobile number")
  .refine((v) => /^[6-9]\d{9}$/.test(normaliseMobile(v)), "Enter a valid 10-digit Indian mobile number")
  .transform(normaliseMobile);

const GSTIN_FORMAT = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
/** Empty string is allowed (no GSTIN); anything else must be a valid, checksum-correct GSTIN. */
export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => v === "" || GSTIN_FORMAT.test(v), "Enter a valid 15-character GSTIN")
  .refine((v) => v === "" || gstinChecksumOk(v), "This GSTIN failed the checksum, please re-check it");

export const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use yyyy-mm-dd");

/** Rupee amount with at most two decimals. */
export const moneySchema = z
  .number()
  .positive("Must be greater than 0")
  .max(10_000_000)
  .refine((n) => Math.round(n * 100) / 100 === n, "Max 2 decimal places");
