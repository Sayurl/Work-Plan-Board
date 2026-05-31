# Work Plan Board

Work Plan Board is an Obsidian plugin for planning tasks and scheduled work across projects in one board.

The plugin collects tasks from `_Tasks.md` files and organizes them into planning columns such as Today, High Priority, Deadline, Prepare, and Inbox.

## Status

This plugin is in early development. The current build is a local development version and is not yet published as an official Obsidian community plugin.

## Configuration And Data

Declarative board settings are stored as `config.json` inside the plugin folder. This includes manual column definitions, smart view definitions, completed task policy, and future timeline display settings. The file is intentionally ignored by Git in this repository because local workflows may contain personal naming, but it is designed so users can manage it with Git, Nix, or another declarative setup if desired.

Vault-specific runtime state is stored by Obsidian as `data.json`. This includes Today task ordering, manual column task ordering, time blocks, task-time links, and selected UI state.

Use `config.example.json` and `data.example.json` as sanitized references for the expected structure.

## Column Settings

Manual columns can be added, renamed, reordered, moved between the top and bottom board sections, or deleted from the plugin settings.

Column definitions are saved to `config.json`. Task ordering and Today membership are saved to `data.json`.

When a column is deleted, choose another column as the destination. Tasks in the deleted column are rewritten with the destination column's Markdown tag.

Resetting columns restores the default columns and moves tasks from custom columns to Inbox.

Deadline is a smart view, not a manual category. Tasks with due dates are shown there automatically, sorted by the nearest due date, while their manual category remains High Priority, Prepare, Inbox, or another user-defined manual column.

## Today Timeline

Today includes a timeline for fixed time blocks such as meetings, site visits, travel, and planned work sessions.

Time blocks are stored in `data.json`. Tasks can be linked to a time block as `inside`, `before`, `after`, or `related`; the task remains in its normal planning column while the link gives the schedule context.

## Development Install

Clone this repository into your vault's community plugin folder:

```sh
cd <Vault>/.obsidian/plugins
git clone https://github.com/<user>/work-plan-board.git work-plan-board
```

Then enable `Work Plan Board` from Obsidian's Community plugins settings.

## Release Files

Obsidian community plugin releases require these files:

- `main.js`
- `manifest.json`
- `styles.css`

## Development

The editable source lives in `src/`. The root `main.js` file is a generated esbuild bundle.

```sh
npm run test
npm run build
npm run check
```

## Privacy

Do not commit real work data, customer names, internal project names, screenshots with confidential content, or local `config.json` / `data.json` files.
