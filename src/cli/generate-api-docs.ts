/**
 * Generates the API reference from the running code, so the docs can never drift from the implementation:
 *   npm run docs:api
 * Writes  docs/openapi.json  (import into Postman / Insomnia / codegen)  and  docs/API-REFERENCE.md.
 */
import "reflect-metadata";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "../app.module";
import { API_PREFIX } from "../config/app-config.service";
import { PERMISSIONS, type Permission } from "../common/constants/permissions";
import { buildOpenApiDocument } from "../bootstrap";

type Schema = {
  $ref?: string;
  type?: string | string[];
  format?: string;
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  oneOf?: Schema[];
  anyOf?: Schema[];
  allOf?: Schema[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  default?: unknown;
  minItems?: number;
  maxItems?: number;
  description?: string;
};

let components: Record<string, Schema> = {};

const resolve$ = (s: Schema): Schema => (s.$ref ? resolve$(components[s.$ref.split("/").pop()!] ?? {}) : s);

function typeLabel(s: Schema): string {
  s = resolve$(s);
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(" \\| ");
  if (s.oneOf || s.anyOf) return [...new Set((s.oneOf ?? s.anyOf)!.map(typeLabel))].join(" \\| ");
  if (s.type === "array") return `${typeLabel(s.items ?? {})}[]`;
  const t = Array.isArray(s.type) ? s.type.join(" \\| ") : (s.type ?? "any");
  return s.format ? `${t} (${s.format})` : t;
}

function constraints(s: Schema): string {
  s = resolve$(s);
  const c: string[] = [];
  if (s.minimum !== undefined) c.push(`min ${s.minimum}`);
  if (s.maximum !== undefined) c.push(`max ${s.maximum}`);
  if (s.minLength !== undefined) c.push(`min length ${s.minLength}`);
  if (s.maxLength !== undefined) c.push(`max length ${s.maxLength}`);
  if (s.minItems !== undefined) c.push(`min items ${s.minItems}`);
  if (s.maxItems !== undefined) c.push(`max items ${s.maxItems}`);
  if (s.pattern && !s.format) c.push(`pattern \`${s.pattern.replace(/\|/g, "\\|")}\``);
  if (s.default !== undefined) c.push(`default ${JSON.stringify(s.default)}`);
  return c.join(", ");
}

/** Flatten an object schema into rows: [path, type, required, notes]. */
function rows(s: Schema, prefix = "", required = true): string[][] {
  s = resolve$(s);
  const out: string[][] = [];
  if (s.properties) {
    for (const [k, v] of Object.entries(s.properties)) {
      const r = resolve$(v);
      const path = prefix ? `${prefix}.${k}` : k;
      const req = required && (s.required ?? []).includes(k);
      out.push([`\`${path}\``, typeLabel(v), req ? "yes" : "no", [r.description, constraints(v)].filter(Boolean).join(" · ")]);
      if (r.type === "object" && r.properties) out.push(...rows(r, path, req));
      if (r.type === "array") {
        const item = resolve$(r.items ?? {});
        if (item.type === "object" && item.properties) out.push(...rows(item, `${path}[]`, req));
      }
    }
  }
  return out;
}

const table = (header: string[], body: string[][]) =>
  [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...body.map((r) => `| ${r.join(" | ")} |`)].join("\n");

function bodySection(schema: Schema): string {
  const s = resolve$(schema);
  const variants = s.oneOf ?? s.anyOf;
  if (variants) {
    return variants
      .map((v) => {
        const rv = resolve$(v);
        // the discriminator is the property that has exactly one allowed value (const, or a one-item enum)
        const only = (p: Schema) => resolve$(p).const ?? (resolve$(p).enum?.length === 1 ? resolve$(p).enum![0] : undefined);
        const disc = Object.entries(rv.properties ?? {}).find(([, p]) => only(p) !== undefined);
        const title = disc ? `Variant \`${disc[0]} = ${JSON.stringify(only(disc[1]))}\`` : "Variant";
        return `**${title}**\n\n${table(["Field", "Type", "Required", "Notes"], rows(rv))}`;
      })
      .join("\n\n");
  }
  return table(["Field", "Type", "Required", "Notes"], rows(s));
}

async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  app.setGlobalPrefix(API_PREFIX);
  await app.init();
  const doc = buildOpenApiDocument(app) as any;
  components = doc.components?.schemas ?? {};

  const docsDir = resolve(process.cwd(), "..", "docs");
  writeFileSync(join(docsDir, "openapi.json"), JSON.stringify(doc, null, 2) + "\n");

  const groups = new Map<string, string[]>();
  let count = 0;
  for (const [path, item] of Object.entries<any>(doc.paths)) {
    for (const [method, op] of Object.entries<any>(item)) {
      const tag = op.tags?.[0] ?? "Other";
      const secured = !!op.security?.length;
      const perm = op["x-permission"] as Permission | undefined;
      const access = !secured
        ? "Public"
        : perm
          ? `Staff · permission \`${perm}\` → roles: ${PERMISSIONS[perm].map((r) => `\`${r}\``).join(", ")}`
          : "Staff (any signed-in role)";
      const lines = [`#### \`${method.toUpperCase()} ${path}\``, "", op.summary ?? "", "", `- **Access:** ${access}`];
      const success = Object.keys(op.responses ?? {}).find((c) => c.startsWith("2"));
      if (success) lines.push(`- **Success status:** ${success}`);
      const params = (op.parameters ?? []).filter((p: any) => p.in !== "cookie");
      if (params.length) {
        lines.push("", table(["Parameter", "In", "Required", "Notes"], params.map((p: any) => [`\`${p.name}\``, p.in, p.required ? "yes" : "no", [p.description, p.example !== undefined ? `e.g. \`${p.example}\`` : ""].filter(Boolean).join(" · ")])));
      }
      const schema = op.requestBody?.content?.["application/json"]?.schema;
      if (schema) lines.push("", "**Request body (JSON)**", "", bodySection(schema));
      lines.push("");
      groups.set(tag, [...(groups.get(tag) ?? []), lines.join("\n")]);
      count++;
    }
  }

  const index = [...groups.entries()].map(([tag, ops]) => `- [${tag}](#${tag.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}) (${ops.length})`).join("\n");
  const md = [
    "# API reference",
    "",
    "> **Generated file: do not edit by hand.** Regenerate with `npm run docs:api` (in `backend/`). Conventions, authentication,",
    "> error format and entity schemas are described in [API.md](API.md). Machine-readable spec: [openapi.json](openapi.json).",
    "> A live, try-it-out version runs at `http://localhost:4000/api/docs` when the API is started locally.",
    "",
    `Base URL: \`{API_ORIGIN}/${API_PREFIX}\` · ${count} endpoints`,
    "",
    index,
    "",
    ...[...groups.entries()].flatMap(([tag, ops]) => [`## ${tag}`, "", ...ops]),
  ].join("\n");
  writeFileSync(join(docsDir, "API-REFERENCE.md"), md + "\n");
  console.log(`✔ docs/API-REFERENCE.md (${count} endpoints) and docs/openapi.json written`);
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
