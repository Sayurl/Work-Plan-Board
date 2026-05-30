const { TFile } = require("obsidian");

async function ensureFile(app, path) {
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) return;
  const folder = path.split("/").slice(0, -1).join("/");
  if (folder) await ensureFolder(app, folder);
  await app.vault.create(path, "");
}

async function ensureFolder(app, folder) {
  const parts = folder.split("/");
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}

module.exports = {
  ensureFile,
  ensureFolder
};
