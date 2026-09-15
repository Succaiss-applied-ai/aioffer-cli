import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("production extension has no independent-window execution strategy", () => {
  it("routes explicit manual job opens through the normal-window tab helper too", () => {
    const source = readFileSync(new URL("./background.ts", import.meta.url), "utf8");
    expect(source).toContain("await openManualApplicationTab(chrome, applicationUrl)");
    expect(source).toContain("await openManualApplicationTab(chrome, url)");
    // The only remaining inline creation is the unrelated user checkout URL.
    expect(source.match(/chrome\.tabs\.create\(/g)).toHaveLength(1);
    expect(source).toContain("chrome.tabs.create({ url: checkoutUrl, active: true })");
  });
  it("contains no window creation, restoration, whole-window cleanup or retired routing symbols", () => {
    const root = fileURLToPath(new URL("./", import.meta.url));
    const violations: string[] = [];
    const retired = /^(?:isolatedWindow|isolatedWindowId|isolatedExecutionWindow|waitForAutoApplyTabVisible|requiresXiaopengVisibleExecutionWindow|requiresFeishuDetailVisibleExecutionWindow|ISOLATED_AUTO_APPLY_WINDOW_WIDTH|ISOLATED_AUTO_APPLY_WINDOW_HEIGHT)$/;
    const files = readdirSync(root, { recursive: true }).filter((file): file is string =>
      typeof file === "string" && file.endsWith(".ts") && !file.endsWith(".test.ts"));
    for (const file of files) {
      const ast = ts.createSourceFile(file, readFileSync(`${root}/${file}`, "utf8"), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && retired.test(node.text)) violations.push(`${file}: ${node.text}`);
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const call = node.expression;
          if (/^(?:create|update|remove)$/.test(call.name.text) && /(?:^|\.)windows$/.test(call.expression.getText(ast))) {
            violations.push(`${file}: ${call.getText(ast)}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(ast);
    }
    expect(files.length).toBeGreaterThan(20);
    expect(violations).toEqual([]);
  });
});
