# Repair imported browser volumes

Older browser volumes may be owned by root. The local sandbox image runs as UID/GID 1000, so these volumes can prevent browser startup or workspace writes. Doctor detects whether the current runtime user can write the volume directories. Repair is for this deployment's non-root local browser image only.

Preview a specific computer using its Docker container ID:

```sh
bash repair-browser-storage.command CONTAINER_ID
```

The preview is read-only and lists exactly the `/profiles` and `/workspace` volume names, pinned local image digest, and container running state. Review these targets and back up both named volumes before applying. There is no automatic backup. Do not apply to healthy volumes just because a browser service is stopped.

Before repair, stop active Bot work and the supervisor so it cannot recreate computers. Stop the selected browser and any other containers sharing those volumes. Keep the selected container present for ownership validation; do not remove it or run Compose `down` before repair.

```sh
docker compose -f docker-compose.yml -f docker-compose.subscriptions.yml stop supervisor
docker stop CONTAINER_ID
bash repair-browser-storage.command CONTAINER_ID --apply
bash start-openbot.command --restart
bash doctor-openbot.command
```

The command refuses unrelated deployments, unexpected image users, bind mounts, non-local volumes, custom volume driver options, changed container configuration, and running volume consumers. Deployment identity uses the shared Compose container or supervisor namespace labels. Recheck and rerun preview if it refuses. Keep services stopped throughout repair; checks cannot atomically prevent an external process from restarting a consumer.

Apply recursively changes ownership of both named volumes to **1000:1000**. It preserves content and permission bits, and does not follow symlinks. This includes files with deliberately different owners, so review the target volumes before applying. The helper uses the selected container's local image digest with downloads disabled, no network, a read-only root filesystem, dropped capabilities except CHOWN/DAC_OVERRIDE, and mounts only the two selected volumes. It does not delete volumes or change Chromium sandbox settings.

A timeout or failure triggers cleanup of that helper's unique container name. If Docker becomes unreachable, cleanup may also fail; inspect `openbot-volume-repair-*` containers once Docker recovers before restarting browser services. Ownership changes can be partial after failure; the operation can be rerun after resolving the cause. Very large volumes may exceed the two-minute repair deadline.

Restart interrupts active work and requires native folder approvals again. Browser profiles, workspace data, and database volumes are retained.

Regression tests use injected Docker responses. The opt-in Docker integration test creates and removes disposable volumes, verifies preserved file contents and access as UID 1000, and checks a symlink pointing outside the volume. Supply a local sandbox image digest via `OPENBOT_STORAGE_REPAIR_TEST_IMAGE` to run it; normal tests skip it.
