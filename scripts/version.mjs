#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const versionFile = fileURLToPath(new URL("../VERSION", import.meta.url));
const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function validate(version) {
  if (!semverPattern.test(version)) {
    throw new Error(
      `Invalid version "${version}". Use Semantic Versioning, for example 1.2.44.`,
    );
  }
  return version;
}

async function currentVersion() {
  return validate((await readFile(versionFile, "utf8")).trim());
}

const [command = "show", requestedVersion] = process.argv.slice(2);

try {
  if (command === "show" || command === "check") {
    const version = await currentVersion();
    process.stdout.write(`${version}\n`);
  } else if (command === "set") {
    if (!requestedVersion) {
      throw new Error("Usage: node scripts/version.mjs set <major.minor.patch>");
    }
    const nextVersion = validate(requestedVersion.trim());
    await writeFile(versionFile, `${nextVersion}\n`, "utf8");
    process.stdout.write(
      `VERSION is now ${nextVersion}. Update CHANGELOG.md, commit, tag v${nextVersion}, and deploy.\n`,
    );
  } else {
    throw new Error("Usage: node scripts/version.mjs [show|check|set <version>]");
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
}
