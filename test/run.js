// Minimal dependency-free test runner. Works on the Node bundled with Electron 4 as well as
// current Node releases:  npm test
const path = require("path");

const tests = [];
global.test = (name, fn) => tests.push({ name, fn });

["navigation-policy.test.js", "update-checker.test.js", "toolbar-theme.test.js"].forEach((file) => {
  require(path.join(__dirname, file));
});

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log("  ok   " + name);
    } catch (error) {
      failed += 1;
      console.log("  FAIL " + name + "\n       " + (error && error.stack ? error.stack.split("\n").slice(0, 3).join("\n       ") : error));
    }
  }
  console.log("\n" + (tests.length - failed) + "/" + tests.length + " passed");
  process.exitCode = failed ? 1 : 0;
})();
