import { describe, expect, it } from "vitest";
import { applicationTabShouldOpenActive } from "./tab-focus-policy.js";

describe("application tab focus policy", () => {
  it("keeps automatic application tabs in the background", () => {
    expect(applicationTabShouldOpenActive("browser.start_application_rpa")).toBe(false);
    expect(applicationTabShouldOpenActive("browser.open_application_url")).toBe(false);
  });

  it("foregrounds only an explicit manual-assist application", () => {
    expect(applicationTabShouldOpenActive("browser.open_manual_application")).toBe(true);
  });
});
