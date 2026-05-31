const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const targets = [path.join(root, "main.js"), path.join(root, "scripts"), path.join(root, "src"), path.join(root, "tests")];
const files = [];

for (const target of targets) collectJsFiles(target, files);

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`Checked ${files.length} JavaScript files`);

function collectJsFiles(target, output) {
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (target.endsWith(".js")) output.push(target);
    return;
  }
  for (const entry of fs.readdirSync(target)) {
    collectJsFiles(path.join(target, entry), output);
  }
}
