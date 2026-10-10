# Update one Bot's Docker computer

After rebuilding the browser image and activating the new supervisor/server code, open **Admin > Computers**. Computers whose image differs from the configured local image show **Update available** and an **Update computer** button.

Select the Bot, review the confirmation, and choose **Update it** after its current work finishes. The confirmation explains that open pages and in-memory work are interrupted while files and sign-ins are retained. The action is authenticated and audited through the existing OpenBot computer routes.

The Docker provider now supports this existing UI:

- A running stale computer is replaced through the supervisor's normal ensure path. The supervisor waits for Docker health before reporting success.
- A stopped stale computer is retired without starting it. Its named volumes remain; the next Bot use creates a computer on the configured image.
- A current or absent computer is left alone.
- Neither profile nor workspace volumes are removed. **Reset computer** is a separate operation that clears saved state; do not use it to update an image.

Listing computers is a read-only preview. It compares resolved local image IDs, rather than mutable tag names. It does not pull images or recreate containers. If Docker cannot establish the image identity, the existing conservative comparison leaves the computer alone; use Doctor to diagnose unknown image metadata.

After update, refresh Admin > Computers and run:

```sh
bash doctor-openbot.command
```

A healthy running replacement should match the configured image. Updating a stopped computer leaves it absent until the Bot next needs it. Replacement failures are returned as errors rather than successful updates. Volumes remain available for diagnosis/retry; the operation does not promise that an old container can be restored after a failed replacement.

This feature is for supervisor-owned per-Bot Docker computers. The shared Compose computer follows normal Compose recreation. The existing sandbox provider retains its own update behavior.
