import fs from "node:fs";
import path from "node:path";

export interface ReportStorage {
  upload(key: string, buffer: Buffer, contentType: string): Promise<void>;
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

export class LocalReportStorage implements ReportStorage {
  constructor(private baseDir: string) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  async upload(key: string, buffer: Buffer, _contentType: string): Promise<void> {
    const filePath = path.join(this.baseDir, key);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buffer);
  }

  async getSignedUrl(key: string, _expiresInSeconds: number): Promise<string> {
    const filePath = path.join(this.baseDir, key);
    return `file://${filePath}`;
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.baseDir, key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
