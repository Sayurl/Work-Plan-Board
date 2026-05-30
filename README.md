# Work Plan Board

Work Plan Board is an Obsidian plugin for planning tasks and scheduled work across projects in one board.

The plugin collects tasks from `_Tasks.md` files and organizes them into planning columns such as Today, High Priority, Deadline, Prepare, and Inbox.

## Status

This plugin is in early development. The current build is a local development version and is not yet published as an official Obsidian community plugin.

## Data

Vault-specific board state is stored by Obsidian as `data.json` inside the plugin folder. This file can contain local task IDs, column order, and personal workflow settings, so it is intentionally ignored by Git.

Use `data.example.json` as a sanitized reference for the expected structure.

## Column Settings

Columns can be added, renamed, reordered, moved between the top and bottom board sections, or deleted from the plugin settings.

When a column is deleted, choose another column as the destination. Tasks in the deleted column are rewritten with the destination column's Markdown tag.

Resetting columns restores the default columns and moves tasks from custom columns to Inbox.

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

## Privacy

Do not commit real work data, customer names, internal project names, screenshots with confidential content, or local `data.json` files.
