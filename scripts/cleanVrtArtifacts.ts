import { rm } from "node:fs/promises";
import path from "node:path";

const artifactDirs = ["vrt-actual", "vrt-work"];

await Promise.all(
  artifactDirs.map((dir) =>
    rm(path.resolve(process.cwd(), dir), {
      force: true,
      recursive: true,
    }),
  ),
);
