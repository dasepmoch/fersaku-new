/**
 * Browser-safe SHA-256 for upload complete (SEL-230).
 * Streams via File.arrayBuffer for files within product size caps.
 */

/** Lowercase hex SHA-256 of file bytes. */
export async function sha256HexOfFile(
  file: File,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const buffer = await file.arrayBuffer();
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return bufferToHex(digest);
}

export function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Normalize client-declared checksum to lowercase hex (no validation throw). */
export function normalizeChecksumHex(raw: string): string {
  return raw.trim().toLowerCase();
}
