# BrownBook Coast

This local Codex plugin reads current BrownBook tasks from Firestore and pairs them with Coast activity analysis. It exposes only read-only task tools and does not modify BrownBook data.

## One-time setup

1. Copy the **Secret Save Key** from BrownBook's Link Device screen.
2. Run this command in Terminal, then paste the key only when macOS prompts:

   ```bash
   security add-generic-password -U -a "$USER" -s brownbook-codex-read-key -w
   ```

3. From this repository root, install the local plugin marketplace and plugin:

   ```bash
   codex plugin marketplace add .
   codex plugin add brownbook-coast@personal
   ```

4. Start a new Codex task and ask it to compare BrownBook with Coast.

## What it reads

- Current open tasks and deadlines
- Recurring task schedules, including BrownBook's 6 AM reset
- Completion history and task stats

The plugin fetches Firestore only when a BrownBook tool is called. It does not poll, write, delete, or change the BrownBook app.

## Example prompts

- `Compare my BrownBook tasks for today with Coast activity.`
- `What did I plan this week versus what did Coast show me doing?`
- `What BrownBook tasks are remaining, and what should I work on next?`
