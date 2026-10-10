# Upstream compatibility review

Reviewed and activated October 10, 2026. The running checkout is `codex/local-reliability`, with the reviewed upstream merge applied.

## Prepared candidate

- Local review branch: `codex/upstream-sync-review`.
- Merge commit: `ec7b737f7b83396b82ed22a590e18dc7ab5bf80f`.
- Local reliability parent: `60c0f535a67ffa330c1bdfd81dac5e92b204e362`.
- Upstream parent: `a4dce8c47c7253ecd9bd6f4e2626f4205817a104`.
- Tested source tree: `904cb53cef403c916668c2ef956e145c3e445a1c`.

The three upstream commits merge without conflicts. They update Bots/Skills
navigation, introduce team-owned app accounts, and fix an Anthropic endpoint test.
The change spans 223 files and includes migration
`0052_shared_brokered_accounts.sql`. No dependency manifest or lockfile update
was needed. The local folder persistence and supervisor improvements are retained.

## Validation

The merged tree was exported to a temporary directory with the existing installed
dependencies. No live credentials were copied into it.

- App, server, and supervisor type checks passed.
- 119 targeted reliability, host-access, computer, and shared-account tests passed.
- Existing migrations followed by the candidate migrations passed on a newly
  created disposable PostgreSQL database.
- 49 database integration tests passed; the disposable database was removed.

This is targeted compatibility validation, not the full project test suite.
The new UI and account flows have not received interactive acceptance testing.
The live database has not been upgraded, and running services were not restarted.

## Applying the reviewed update

1. Confirm the working tree is clean and back up the live PostgreSQL database
   using the normal local backup procedure. Keep the backup outside Git.
2. Merge `codex/upstream-sync-review` into `codex/local-reliability`. Preserve any
   newer local commits; do not reset the reliability branch to the review branch.
3. Apply the repository database migrations using the configured local database.
4. Rebuild affected app/server services and Bot images using the local rebuild
   workflow, then restart OpenBot using `start-openbot.command --restart`.
5. Run Doctor and verify Bots/Skills navigation, a Claude conversation, a ChatGPT
   conversation, browser use, and restored native folder access.

Rolling back source alone does not undo the database migration. Retain the
pre-upgrade database backup until acceptance checks pass.

## Activation result

The reviewed branch was merged into the reliability branch. Before activation,
PostgreSQL was backed up in custom format to the ignored, private local file
`.env.tools/backups/pre-upstream-20261010-134452.dump`; its archive manifest was
successfully read with `pg_restore --list` (a full restore was not performed).

Desktop and both subscription Bot images rebuilt successfully. The standard
restart applied the migration and retained both existing Bot computers and their
volumes. Doctor reported **ready**, including managed Intelligence, PostgreSQL,
web/API, supervisor, browser image/storage/sandbox configuration, and native broker.
Claude and ChatGPT each completed an authenticated local endpoint test with an
`OK` response and a `RUN_FINISHED` event. The existing ChatGPT channel remained
accessible in the in-app browser with its conversation history visible.

No active native folder grants were present after restart. Folder access requires
an initial user selection per Bot. Full interactive acceptance of the new team
account workflows remains outside this activation check.
