# Local startup, health and browser recovery

Start or restart this clone with `bash start-openbot.command` or `bash start-openbot.command --restart`. The native launcher supplies the same temporary broker token to the desktop and API, preserving native folder access. Direct subscription startup refuses to replace the API while a desktop instance is active. Restart retains browser containers, sign-ins, workspaces and database volumes. Run `bash doctor-openbot.command` to verify readiness.

Admin > Computers now includes System health. Refresh it to check configured model services, Intelligence, desktop attachment and running browsers. Failed or degraded checks include recovery instructions. Diagnostics require administrator access and the local subscription profile; configuration values and command output are excluded.

Each isolated Bot computer has **Restart browser**. It interrupts current browser work, stops the container gracefully, invalidates stale element references and starts the same Bot computer again. Named profile and workspace volumes remain attached. This action does not install a new image; use Update computer for that. Reset is the separate destructive action that clears stored browser data.

## Source updates

Keep upstream updates separate from feature changes. Commit changes first. Fetch with `git fetch upstream`, inspect with `bash update-openbot.command --check upstream/main`, then apply the reviewed revision with `bash update-openbot.command --apply <revision>`. The command requires a clean checkout, saves the original and target revisions, copies `.env` and takes a PostgreSQL custom-format dump and validates its archive before merging. Backup failure prevents the merge; merge conflicts are aborted. Services are not restarted automatically.

Recovery bundles are private, ignored files under `.env.tools/backups/`. Keep them out of Git and protect them as credentials. The bundle covers source revisions, database and `.env`; browser files and subscription authentication remain in their existing persistent storage and should be backed up separately before changes that migrate them.

The development web server may hot-reload source changes; use a maintenance window for updates. Run focused checks appropriate to the update, restart with the supported launcher, then verify Doctor and the dashboard. If the update fails before further commits, `bash update-openbot.command --rollback <bundle-path>` reverts the merge with a new commit. It refuses rollback after further commits so it cannot discard later work. Run checks and restart again. The full app suite remains a separate validation step.

Rollback does not automatically overwrite database or configuration: doing so can discard work created after the backup. If a migration requires database restoration, stop OpenBot writers first and have the operator review the dump with `pg_restore --list`. Restore the chosen dump into the local PostgreSQL database using `pg_restore --clean --if-exists --no-owner -U openbot -d openbot`, then restore `config.env` only if needed and restart. Source reversion alone cannot undo a database migration.


## Validation of this change

125 focused startup, update/rollback, Doctor, authorization, browser gateway and client mutation regressions pass. App and server typechecks pass. A supported full-stack restart returned Doctor to ready with the desktop broker attached. Clicking Knowledge (Local)'s Restart browser retained the same named volumes and temporary test markers in both `/profiles` and `/workspace`; the markers were removed after verification. The restarted browser returned a successful snapshot. A real PostgreSQL dump was also validated with `pg_restore --list`. The full app suite was not run, as requested.
