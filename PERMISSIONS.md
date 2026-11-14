# Repository agent permissions

This file records the repository's intended agent policy. It is guidance for contributors and agents; actual filesystem and approval enforcement is controlled by the Codex host configuration.

- Treat all paths as read-only by default.
- Ask the user before writing, deleting, moving, or overwriting project files. Exception: changes the user explicitly requested in the current task are pre-authorized within that task's stated scope.
- Ask before any write outside the repository, permission escalation, deployment, publishing, external message, or irreversible action.
- Prefer read-only inspection and narrow diffs. Never broaden access or change host-level security settings as part of ordinary project work.
- Review changes for security, privacy, correctness, migration impact, and unintended scope before handoff.

For Codex Code Review, apply the security-specific review checklist in `AGENTS.md`. Repository review instructions inform reviews but do not themselves enable a hosted GitHub review integration; that must be enabled in the relevant Codex or repository settings.
