import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { HostAccessGrant } from "./schema";
export type GrantStore = {
  load(): HostAccessGrant[];
  save(grants: HostAccessGrant[]): void;
};
export function validSavedGrant(g: any): g is HostAccessGrant {
  return (
    g &&
    [g.id, g.botId, g.actorId, g.displayName].every(
      (v) => typeof v === "string" && v.length > 0 && v.length <= 512,
    ) &&
    typeof g.revoked === "boolean"
  );
}
export function fileGrantStore(path: string): GrantStore {
  return {
    load() {
      if (!existsSync(path)) return [];
      try {
        const data = JSON.parse(readFileSync(path, "utf8"));
        if (
          data.version !== 1 ||
          !Array.isArray(data.grants) ||
          !data.grants.every(validSavedGrant)
        )
          throw new Error();
        return data.grants;
      } catch {
        throw new Error(
          "Saved host grant state is unreadable; folder restoration is disabled.",
        );
      }
    },
    save(grants) {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      const tmp = `${path}.${randomUUID()}.tmp`;
      writeFileSync(tmp, JSON.stringify({ version: 1, grants }), {
        mode: 0o600,
        flag: "wx",
      });
      renameSync(tmp, path);
    },
  };
}
