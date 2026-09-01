// GitHub Pages runs Jekyll by default, which strips files/folders starting
// with an underscore (like Next's _next directory). .nojekyll disables that.
const fs = require("node:fs");
const path = require("node:path");
const out = path.join(__dirname, "..", "out");
if (fs.existsSync(out)) {
  fs.writeFileSync(path.join(out, ".nojekyll"), "");
  // Serve index.html for unknown routes on GitHub Pages.
  fs.copyFileSync(path.join(out, "index.html"), path.join(out, "404.html"));
  console.log("postbuild: wrote out/.nojekyll and out/404.html");
}
