import { readdirSync, readFileSync } from "node:fs";
import { defineConfig } from "vitepress";

const guide = new URL("../user-guide/", import.meta.url);
const repo = "https://github.com/jlazzz/OpenRequirements/blob/development/docs/";

// The page's first line is its title; every page in the folder is listed, so a new page needs no config.
const items = readdirSync(guide)
  .filter((name) => name.endsWith(".md") && name !== "index.md")
  .sort()
  .map((name) => ({
    text: readFileSync(new URL(name, guide), "utf8").match(/^# (.+)$/m)?.[1] ?? name,
    link: `/${name.slice(0, -3)}`,
  }));

export default defineConfig({
  title: "Open Requirements",
  description: "User guide",
  srcDir: "user-guide",
  // /help/ inside the app; GitHub Pages sets DOCS_BASE to the repository path.
  base: process.env.DOCS_BASE ?? "/help/",
  cleanUrls: true,
  // Pages link to ADRs outside the guide; those become links to the repository.
  ignoreDeadLinks: [/^\.\.\/adr\//],
  markdown: {
    config(md) {
      md.core.ruler.push("adr-links", (state) => {
        for (const token of state.tokens) {
          for (const child of token.children ?? []) {
            const href = child.type === "link_open" ? child.attrGet("href") : null;
            if (href?.startsWith("../")) child.attrSet("href", repo + href.slice(3));
          }
        }
      });
    },
  },
  themeConfig: {
    search: { provider: "local" },
    nav: [{ text: "Guide", link: "/" }],
    sidebar: [{ text: "User guide", items: [{ text: "Overview", link: "/" }, ...items] }],
  },
});
