# Rebuild local source changes

Run from the clone. Commands preview their steps by default:

```sh
bash rebuild-openbot.command desktop
bash rebuild-openbot.command computer
bash rebuild-openbot.command bots
bash rebuild-openbot.command all
```

Add `--apply` to execute a selected plan. Builds stop on the first failed step. They do not restart services, change folder grants, or migrate volumes.

| Target | Builds |
| --- | --- |
| desktop | Vite frontend and the debug native executable through Tauri, with Cargo's lockfile enforced |
| computer | Base browser image, then the non-root sandbox image, then supervisor |
| bots | Both Claude and ChatGPT images, even if ChatGPT is not yet signed in |
| all | All of the above, in that order |

Bun dependencies must already be installed. Docker builds require a running engine, configured `.env`, and generated service tokens because Compose validates interpolation. Builds can download dependencies and take several minutes. They preserve the existing subscriptions and credentials; generated toolchains, caches, and binaries remain ignored by Git.

## Persistent Rust tooling

The current workstation's existing Rust toolchain was copied from temporary storage into `.env.tools/rust`. The desktop rebuild now uses:

- `CARGO_HOME`: this clone's `.env.tools/rust/cargo`
- `RUSTUP_HOME`: this clone's `.env.tools/rust/rustup`

The build script sets these variables for its child processes only, preserving the user's home directory. The tools are local workstation files and are not committed. The launcher does not require Rust for ordinary startup.

On another machine, install Rust with its normal persistent Rustup setup, or obtain the Rustup installer and initialize clone-local tools from the clone:

```sh
CARGO_HOME="$PWD/.env.tools/rust/cargo" \
RUSTUP_HOME="$PWD/.env.tools/rust/rustup" \
rustup-init -y --no-modify-path --profile minimal
```

The installer must already be available. This workflow does not automatically fetch or execute an installer. macOS native builds also require Xcode command-line tools. Desktop apply refuses toolchains whose resolved Cargo path or configured Rustup home is under `/tmp` or `/private/tmp`.

## Activate changes

After a desktop or Bot rebuild, restart when no work needs to remain active:

```sh
bash start-openbot.command --restart
bash doctor-openbot.command
```

Desktop restart requires native folder approvals again. Bot services use the rebuilt image when recreated by startup.

Existing supervisor-owned browser containers remain running across `--restart` and can continue using the old image. A successful image build alone does not update them. Schedule recreation of the affected Bot computers separately, preserving their existing named `/profiles` and `/workspace` volumes. Do not delete volumes to activate an image. The shared Compose computer is recreated through the normal restart workflow. Use the [storage repair workflow](browser-storage-repair.md) if imported root-owned volumes prevent the non-root image from writing.

For web branding edits, the local Vite app serves source changes; browser/computer images are not needed just to change web text or styles. Desktop branding belongs to the desktop build. Server changes follow the normal service restart workflow.
