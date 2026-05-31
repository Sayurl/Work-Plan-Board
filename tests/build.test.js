const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("bundled main.js does not depend on local src require at runtime", () => {
  const mainPath = path.join(__dirname, "..", "main.js");
  const main = fs.readFileSync(mainPath, "utf8");

  assert.match(main, /GENERATED\/BUNDLED FILE BY ESBUILD/);
  assert.equal(main.includes('require("./src/main")'), false);
  assert.match(main, /require\("obsidian"\)/);
});
