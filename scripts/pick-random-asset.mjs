#!/usr/bin/env node

import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";

const assetRoot = resolve(
  process.env.MESUGAKI_ASSET_DIR ??
    fileURLToPath(new URL("../assets", import.meta.url)),
);
const supportedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif"]);

async function collectImages(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      paths.push(...(await collectImages(path)));
      continue;
    }

    const extension = entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase();
    if (supportedExtensions.has(extension)) paths.push(resolve(path));
  }

  return paths;
}

try {
  const images = (await collectImages(assetRoot)).sort();

  if (images.length === 0) {
    console.error(`No supported local images found in ${assetRoot}`);
    process.exitCode = 2;
  } else {
    console.log(images[randomInt(images.length)]);
  }
} catch (error) {
  console.error(`Could not read local image assets in ${assetRoot}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
