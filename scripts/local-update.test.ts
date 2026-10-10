import { expect, test } from "bun:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  chmod,
  rm,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

async function fixture(
  run: (
    root: string,
    command: (...args: string[]) => Promise<{ code: number; out: string }>,
  ) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), "openbot-update-"));
  const command = async (...args: string[]) => {
    const child = Bun.spawn(args, {
      cwd: root,
      env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}` },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, out, err] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { code, out: out + err };
  };
  try {
    await mkdir(join(root, "bin"));
    await writeFile(
      join(root, "update-openbot.command"),
      await readFile(resolve(import.meta.dir, "../update-openbot.command")),
    );
    await writeFile(join(root, ".gitignore"), ".env\n.env.tools/\nbin/\n");
    await writeFile(join(root, ".env"), "PRIVATE_FIXTURE=do-not-print\n");
    await writeFile(
      join(root, "bin/docker"),
      "#!/bin/bash\nif [[ -f fail-backup ]]; then exit 1; fi\necho private-database-backup\n",
    );
    await chmod(join(root, "bin/docker"), 0o755);
    for (const args of [
      ["init", "-b", "base"],
      ["config", "user.email", "test@example.invalid"],
      ["config", "user.name", "Test"],
      ["add", "."],
      ["commit", "-m", "base"],
      ["checkout", "-b", "incoming"],
    ])
      expect((await command("git", ...args)).code).toBe(0);
    await writeFile(join(root, "feature.txt"), "upstream feature");
    await command("git", "add", "feature.txt");
    await command("git", "commit", "-m", "feature");
    await command("git", "checkout", "base");
    await run(root, command);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test("update backs up privately before merge; rollback reverts source without erasing recovery data", async () =>
  fixture(async (root, cmd) => {
    expect(
      (await cmd("bash", "update-openbot.command", "--check", "incoming")).code,
    ).toBe(0);
    const applied = await cmd(
      "bash",
      "update-openbot.command",
      "--apply",
      "incoming",
    );
    expect(applied.code).toBe(0);
    expect(applied.out).not.toContain("do-not-print");
    expect(await readFile(join(root, "feature.txt"), "utf8")).toBe(
      "upstream feature",
    );
    const bundle = join(
      root,
      ".env.tools/backups",
      (await readdir(join(root, ".env.tools/backups")))[0]!,
    );
    expect(await readFile(join(bundle, "database.dump"), "utf8")).toContain(
      "private-database-backup",
    );
    expect(
      (await cmd("bash", "update-openbot.command", "--rollback", bundle)).code,
    ).toBe(0);
    expect(await Bun.file(join(root, "feature.txt")).exists()).toBe(false);
    expect(await Bun.file(join(bundle, "database.dump")).exists()).toBe(true);
  }));
test("failed backup prevents source merge", async () =>
  fixture(async (root, cmd) => {
    await writeFile(join(root, "fail-backup"), "");
    await cmd("git", "add", "fail-backup");
    await cmd("git", "commit", "-m", "fixture");
    expect(
      (await cmd("bash", "update-openbot.command", "--apply", "incoming")).code,
    ).not.toBe(0);
    expect(await Bun.file(join(root, "feature.txt")).exists()).toBe(false);
  }));
test("dirty checkout prevents update", async () =>
  fixture(async (root, cmd) => {
    await writeFile(join(root, "dirty.txt"), "");
    expect(
      (await cmd("bash", "update-openbot.command", "--apply", "incoming")).code,
    ).not.toBe(0);
    expect(await Bun.file(join(root, ".env.tools/backups")).exists()).toBe(
      false,
    );
  }));

test("rollback refuses to discard commits made after update", async () =>
  fixture(async (root, cmd) => {
    expect(
      (await cmd("bash", "update-openbot.command", "--apply", "incoming")).code,
    ).toBe(0);
    const bundle = join(
      root,
      ".env.tools/backups",
      (await readdir(join(root, ".env.tools/backups")))[0]!,
    );
    await writeFile(join(root, "later.txt"), "keep");
    await cmd("git", "add", "later.txt");
    await cmd("git", "commit", "-m", "later work");
    expect(
      (await cmd("bash", "update-openbot.command", "--rollback", bundle)).code,
    ).not.toBe(0);
    expect(await readFile(join(root, "later.txt"), "utf8")).toBe("keep");
    expect(await Bun.file(join(root, "feature.txt")).exists()).toBe(true);
  }));
test("conflicted update is aborted and the previous source is retained", async () =>
  fixture(async (root, cmd) => {
    await writeFile(join(root, "feature.txt"), "local feature");
    await cmd("git", "add", "feature.txt");
    await cmd("git", "commit", "-m", "local feature");
    const before = (await cmd("git", "rev-parse", "HEAD")).out;
    expect(
      (await cmd("bash", "update-openbot.command", "--apply", "incoming")).code,
    ).not.toBe(0);
    expect((await cmd("git", "rev-parse", "HEAD")).out).toBe(before);
    expect((await cmd("git", "status", "--porcelain")).out).toBe("");
    expect(await readFile(join(root, "feature.txt"), "utf8")).toBe(
      "local feature",
    );
  }));
