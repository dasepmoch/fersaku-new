import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const root = join(process.cwd(), ".next", "static", "chunks");
const maxChunkBytes = 500_000;
const maxTotalBytes = 3_500_000;

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(path)));
    else if (entry.name.endsWith(".js")) files.push(path);
  }
  return files;
}

const files = await collect(root);
const sizes = await Promise.all(
  files.map(async (path) => ({ path, bytes: (await stat(path)).size })),
);
const total = sizes.reduce((sum, file) => sum + file.bytes, 0);
const oversized = sizes.filter((file) => file.bytes > maxChunkBytes);

if (oversized.length || total > maxTotalBytes) {
  console.error("Bundle budget exceeded.");
  for (const file of oversized) {
    console.error(
      `Chunk ${file.path} is ${file.bytes} bytes (max ${maxChunkBytes}).`,
    );
  }
  console.error(`Total client chunks: ${total} bytes (max ${maxTotalBytes}).`);
  process.exit(1);
}

console.log(
  `Bundle budget OK: ${files.length} JS chunks, ${total} bytes total; max chunk ${Math.max(...sizes.map((file) => file.bytes))} bytes.`,
);
