import { resolve } from "node:path";
import { existsSync } from "node:fs";

export type Target = "desktop" | "computer" | "bots" | "all";
export type Step = { name: string; cwd: string; args: string[] };
export function buildPlan(root: string, target: Target): Step[] {
  const steps: Step[] = [];
  if (target === "desktop" || target === "all") steps.push({ name: "Desktop UI and native executable", cwd: resolve(root, "desktop"), args: ["bun", "run", "tauri", "build", "--debug", "--no-bundle", "--", "--locked"] });
  if (target === "computer" || target === "all") {
    steps.push({ name: "Base computer image", cwd: root, args: ["docker", "build", "-f", "agent-computer/Dockerfile", "-t", "openbot-agent-computer:latest", "."] });
    steps.push({ name: "Non-root sandbox computer image", cwd: root, args: ["docker", "build", "-f", "agent-computer/Dockerfile.sandbox", "-t", "openbot-agent-computer:sandbox-local", "."] });
    steps.push({ name: "Supervisor image", cwd: root, args: ["docker", "compose", "-f", "docker-compose.yml", "-f", "docker-compose.subscriptions.yml", "build", "supervisor"] });
  }
  if (target === "bots" || target === "all") steps.push({ name: "Claude and ChatGPT images", cwd: root, args: ["docker", "compose", "-f", "docker-compose.yml", "-f", "docker-compose.subscriptions.yml", "--profile", "chatgpt", "build", "agent-claude-sdk", "agent-chatgpt"] });
  return steps;
}

export function rustEnvironment(root: string, inherited: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const home = resolve(root, ".env.tools/rust");
  return { ...inherited, CARGO_HOME: resolve(home, "cargo"), RUSTUP_HOME: resolve(home, "rustup"), PATH: `${resolve(home, "cargo/bin")}:${inherited.PATH ?? ""}` };
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "..");
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: bash rebuild-openbot.command [desktop|computer|bots|all] [--apply]\nDefault: preview all build steps. Apply builds only; restart and volume migration remain separate.");
  } else {
    const target = args.find(a => a !== "--apply") ?? "all";
    if (!["desktop", "computer", "bots", "all"].includes(target) || args.filter(a => a !== "--apply").length > 1 || args.filter(a => a === "--apply").length > 1) {
      console.error("Invalid arguments. Use --help."); process.exitCode = 64;
    } else {
      let env = { ...process.env };
      if (["desktop", "all"].includes(target)) {
        if (existsSync(resolve(root, ".env.tools/rust/cargo/bin/rustup"))) env = rustEnvironment(root, env);
        if (args.includes("--apply")) {
          const cargo = Bun.which("cargo", { PATH: env.PATH });
          const rustupHome = env.RUSTUP_HOME ?? resolve(env.HOME ?? "", ".rustup");
          if (!cargo || cargo.startsWith("/private/tmp/") || cargo.startsWith("/tmp/") || rustupHome.startsWith("/private/tmp/") || rustupHome.startsWith("/tmp/")) {
            console.error("A persistent Rust toolchain is required. See docs/local-rebuild.md."); process.exit(1);
          }
        }
      }
      for (const step of buildPlan(root, target as Target)) {
        console.log(`${args.includes("--apply") ? "Building" : "Preview"}: ${step.name}\n  ${step.args.join(" ")}`);
        if (!args.includes("--apply")) continue;
        const child = Bun.spawn(step.args, { cwd: step.cwd, env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
        const code = await child.exited;
        if (code !== 0) { console.error(`Build failed: ${step.name}. Later steps were not run.`); process.exit(code || 1); }
      }
      console.log(args.includes("--apply") ? "Builds complete. Restart when ready; existing Bot computers may still use the old image. See docs/local-rebuild.md." : "Preview only. Add --apply to build. No services were restarted.");
    }
  }
}
