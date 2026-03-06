import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const nextDir = path.join(root, ".next");
const manifestPath = path.join(nextDir, "build-manifest.json");
const appManifestPath = path.join(nextDir, "app-build-manifest.json");
const outputPath = path.join(root, "docs", "bundle-report.json");

function bytesFor(relativeFile) {
  const normalized = relativeFile.startsWith("/") ? relativeFile.slice(1) : relativeFile;
  const target = path.join(nextDir, normalized);
  if (!fs.existsSync(target)) return 0;
  return fs.statSync(target).size;
}

function collectFiles(manifest) {
  const files = new Set();
  for (const value of Object.values(manifest.pages ?? {})) {
    for (const file of value) files.add(file);
  }
  for (const file of manifest.lowPriorityFiles ?? []) files.add(file);
  return [...files];
}

if (!fs.existsSync(manifestPath)) {
  console.error("Missing .next/build-manifest.json. Run `npm run build` first.");
  process.exit(1);
}

const buildManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const appManifest = fs.existsSync(appManifestPath)
  ? JSON.parse(fs.readFileSync(appManifestPath, "utf8"))
  : { pages: {} };

const pageFiles = collectFiles(buildManifest);
const appFiles = collectFiles(appManifest);
const allFiles = [...new Set([...pageFiles, ...appFiles])];

const rows = allFiles.map((file) => ({
  file,
  bytes: bytesFor(file),
})).filter((row) => row.bytes > 0);

rows.sort((a, b) => b.bytes - a.bytes);

const summary = {
  generated_at: new Date().toISOString(),
  file_count: rows.length,
  total_bytes: rows.reduce((sum, row) => sum + row.bytes, 0),
  largest_files: rows.slice(0, 30),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

console.log(`Bundle report written to ${outputPath}`);
console.log(`Total JS bytes: ${summary.total_bytes}`);
console.log("Top files:");
for (const row of summary.largest_files.slice(0, 10)) {
  console.log(`- ${row.file}: ${row.bytes}`);
}
