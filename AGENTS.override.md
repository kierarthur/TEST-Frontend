# CloudTMS Frontend — Desktop Override

This is a Codex desktop workspace, not the former `/workspace` cloud container.

The authoritative shared rules are in the parent workspace file:

```text
C:\Users\KierArthur\OneDrive - Arthur Rai\Documents\GitHub\AGENTS.md
```

Apply that file in full. Ignore cloud-only assumptions in the legacy `AGENTS.md` in this directory, including `/workspace` paths, frontend-primary container ownership, backend GitHub read-only status, forced backend restoration, and mandatory patch/replacement handoff solely because of cloud permissions.

Frontend-specific desktop rules:

- Work directly in this local frontend clone when requested.
- Preserve unrelated local and user changes.
- Keep UI dates/times as `DD/MM/YYYY hh:mm:ss`, 24-hour clock.
- Verify frontend patches using a proven patched asset, not merely the deployed old TEST asset.
- Never expose Playwright environment variables or authentication state.
- Do not deploy TEST or production unless the user explicitly requests the exact deployment.
- Do not mutate TEST data without explicit approval for the exact action and identifiers.
- Do not modify backend code unless the task includes backend work.
- If backend work is included, edit the local backend clone directly and follow its desktop override.

