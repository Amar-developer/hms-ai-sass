import { readdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(scriptDirectory, "../frontend");
const currentBuildName = ".next-build";
const staleBuildPrefix = ".next-build-stale-";
const cleanLegacyDirectories = process.argv.includes("--all");

const buildDirectories = readdirSync(frontendDirectory, { withFileTypes: true })
  .filter(
    (entry) =>
      (entry.isDirectory() || entry.isSymbolicLink()) &&
      (entry.name === currentBuildName ||
        (cleanLegacyDirectories && entry.name.startsWith(staleBuildPrefix))),
  )
  .map((entry) => entry.name);

const failedDirectories = [];
for (const directoryName of buildDirectories) {
  try {
    rmSync(resolve(frontendDirectory, directoryName), {
      force: true,
      maxRetries: 3,
      recursive: true,
      retryDelay: 100,
    });
  } catch (error) {
    failedDirectories.push({ directoryName, error });
  }
}

const currentBuildFailure = failedDirectories.find(
  ({ directoryName }) => directoryName === currentBuildName,
);

if (failedDirectories.length > 0) {
  for (const { directoryName, error } of failedDirectories) {
    console.error(`Could not remove frontend/${directoryName}: ${error.message}`);
  }
  const action =
    "Stop any frontend container or build process, correct ownership of the listed generated directories, and run `npm run clean:build` again.";
  if (currentBuildFailure) {
    console.error(action);
    process.exit(1);
  }
  console.warn(`Legacy stale directories were left in place. ${action}`);
}

const removedCount = buildDirectories.length - failedDirectories.length;
if (removedCount > 0) {
  console.log(
    `Removed ${removedCount} previous frontend build director${removedCount === 1 ? "y" : "ies"}.`,
  );
}
