---
name: brownbook-coast-review
description: Compare the user's live BrownBook tasks and completion history with Coast's local screen-activity evidence. Use for questions about planned work versus actual activity, daily or weekly productivity reviews, task prioritization, and identifying work that Coast did or did not observe.
---

# BrownBook Coast Review

Use BrownBook tools to establish the task plan and completion record. Use Coast separately to reconstruct visible activity for the matching time range.

1. Call `get_brownbook_today` for current-day questions, or `get_brownbook_week` for weekly questions.
2. Use Coast sessions and representative frames to identify actual on-screen activity.
3. Report three distinct categories: BrownBook-completed, Coast-observed, and not observed / needs confirmation.
4. Do not mark a task complete from Coast alone. A task title on screen or a plausible activity match is evidence, not confirmation.
5. State the BrownBook task date and its 6 AM reset when timing might otherwise be confusing.

Use `search_brownbook_tasks` only when a specific task or phrase needs investigation. Use `get_brownbook_task_snapshot` when a detailed plan or historical context is necessary. Keep queries focused so task notes and history are not retrieved unnecessarily.

Never ask the user to paste their BrownBook key into chat. The MCP server reads it from the local macOS Keychain and exposes no write tools.
