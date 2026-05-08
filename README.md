# Agent Calendar

OpenClaw calendar plugin with:

- scoped per-sender/per-target calendars
- dated memos and timed events
- compact upcoming and daily agenda views
- SQLite persistence
- cron-backed reminders
- confirm-first event detection guidance for the LLM

## Architecture

This project ships as a **single OpenClaw plugin package** with reusable internal modules:

- `src/core/` - domain types, date/time helpers, detection, formatting, storage, and calendar services
- `src/openclaw/` - OpenClaw-specific owner scoping, prompt guidance, and reminder scheduling
- `src/index.ts` - plugin entry, tool registration, and prompt hooks

The internal `core/` modules are kept OpenClaw-light so they can be extracted later if another agent integration is added.

## Tools

- `cal_candidate_detect` - inspect raw text for calendar-worthy details
- `cal_entry_create` - create a memo or event
- `cal_entry_update` - update an existing entry
- `cal_entry_delete` - cancel an entry
- `cal_agenda_upcoming` - show the next few items
- `cal_agenda_day` - show the agenda for one date
- `cal_entry_search` - search entries by text/date

## Detection behavior

The plugin adds prompt guidance through `before_prompt_build` when the latest prompt looks calendar-related.

Current policy:

- **default:** `confirm_first`
- detect concrete dates, times, and calendar intent from text
- encourage the LLM to confirm inferred captures before writing data
- avoid dense table-style responses in chat/mobile clients

## Configuration

`openclaw.plugin.json` declares the runtime schema. Main settings:

| Key | Meaning | Default |
| --- | --- | --- |
| `dbPath` | Optional SQLite file path | plugin state dir |
| `defaultTimezone` | IANA timezone for parsing/formatting | current system timezone |
| `defaultAgendaLimit` | Default count for upcoming agenda | `5` |
| `detectionMode` | Inferred-capture policy | `confirm_first` |

## Development

```bash
npm install
npm run build
npm test
```

## Notes

- Reminders are written through OpenClaw's exported cron-store runtime.
- Storage uses Node's built-in `node:sqlite`, so Node 22+ is required.
- Agenda output is intentionally compact for Telegram-like chat surfaces.
