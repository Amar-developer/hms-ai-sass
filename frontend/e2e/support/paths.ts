import path from "node:path";

export const stateDir = path.resolve(process.cwd(), "e2e/.state");
export const seedFile = path.join(stateDir, "seed.json");

export function authFile(actor: ActorName) {
  return path.join(stateDir, `${actor}.json`);
}

export type ActorName =
  | "super-admin"
  | "tenant-admin"
  | "receptionist"
  | "reader"
  | "doctor"
  | "limited-admin";
