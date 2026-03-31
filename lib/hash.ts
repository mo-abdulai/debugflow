import { createHash } from "crypto";

export function sha256Hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
