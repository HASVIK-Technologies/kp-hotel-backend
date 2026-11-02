import { Injectable } from "@nestjs/common";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { AppConfig } from "@/config/app-config.service";

/**
 * Object storage for invoice PDFs. Local: filesystem. AWS: S3 bucket with Object Lock
 * (WORM) so generated invoices cannot be altered or deleted for the retention period.
 * Objects are write-once: `put` never overwrites.
 */
@Injectable()
export class StorageService {
  private s3?: { client: any; bucket: string; PutObjectCommand: any; GetObjectCommand: any };

  constructor(private readonly config: AppConfig) {}

  private get root() {
    return join(resolve(this.config.env.DATA_DIR), "objects");
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    if (this.config.env.STORAGE_MODE === "s3") {
      const s3 = await this.getS3();
      await s3.client.send(new s3.PutObjectCommand({ Bucket: s3.bucket, Key: key, Body: body, ContentType: contentType, IfNoneMatch: "*" }));
      return;
    }
    const path = join(this.root, key);
    await mkdir(dirname(path), { recursive: true });
    // flag "wx": never overwrite an existing invoice file
    await writeFile(path, body, { flag: "wx" });
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    try {
      if (this.config.env.STORAGE_MODE === "s3") {
        const s3 = await this.getS3();
        const r = await s3.client.send(new s3.GetObjectCommand({ Bucket: s3.bucket, Key: key }));
        return await r.Body.transformToByteArray();
      }
      return await readFile(join(this.root, key));
    } catch {
      return undefined;
    }
  }

  private async getS3() {
    if (!this.s3) {
      const { S3Client, PutObjectCommand, GetObjectCommand } = await import("@aws-sdk/client-s3");
      this.s3 = {
        client: new S3Client({ region: this.config.env.AWS_REGION }),
        bucket: this.config.env.INVOICE_BUCKET!,
        PutObjectCommand,
        GetObjectCommand,
      };
    }
    return this.s3;
  }
}
