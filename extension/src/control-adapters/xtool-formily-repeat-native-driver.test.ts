// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  executeXToolFormilyRepeatNativeDriver,
  executeXToolFormilyRepeatNativeInPage,
  inspectXToolFormilyRepeatNativeInPage,
  isXToolFormilyApplicationUrl,
  isXToolFormilyRepeatNativeField
} from "./xtool-formily-repeat-native-driver.js";

function projectCard(index: number, value = ""): string {
  return `
    <div class="apply-form-array-card__hashed" data-card="${index}">
      <div id="formily-item-name" data-form-field-id="name" data-form-field-name="name"
        data-form-field-i18n-name="项目名称">
        <input id="formily-item-name-input" class="ud__native-input"
          data-form-field-id="name" data-form-field-name="name"
          data-form-field-i18n-name="项目名称" value="${value}" />
      </div>
      <div id="formily-item-role" data-form-field-id="role" data-form-field-name="role"
        data-form-field-i18n-name="项目角色">
        <input class="ud__native-input" data-form-field-name="role"
          data-form-field-i18n-name="项目角色" />
      </div>
      <div id="formily-item-desc" data-form-field-id="desc" data-form-field-name="desc"
        data-form-field-i18n-name="描述">
        <textarea class="ud__native-input" data-form-field-name="desc"
          data-form-field-i18n-name="描述"></textarea>
      </div>
    </div>`;
}

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = `
    <section id="formily-item-project_list">
      ${projectCard(0, "第一条")}
      <div class="row-shell">${projectCard(1)}</div>
    </section>`;
});

describe("xTool Formily repeat native Driver", () => {
  it("matches only xTool application pages and repeat native semantic identities", () => {
    expect(isXToolFormilyApplicationUrl(
      "https://xtool.jobs.feishu.cn/index/resume/7678562627672541486/apply"
    )).toBe(true);
    expect(isXToolFormilyApplicationUrl(
      "https://shoplazza.jobs.feishu.cn/index/resume/7678562627672541486/apply"
    )).toBe(false);
    expect(isXToolFormilyRepeatNativeField({
      stableFieldKey: "project[1].project_name.native",
      label: "项目经历 2 · 项目名称",
      type: "text",
      controlKind: "native"
    })).toBe(true);
    expect(isXToolFormilyRepeatNativeField({
      stableFieldKey: "project[1].start_date.custom_date_picker",
      label: "项目经历 2 · 开始时间",
      type: "custom_date_picker",
      controlKind: "custom_date_picker"
    })).toBe(false);
  });

  it("ignores duplicated ids and rebinds the second project by section, index and semantic slot", () => {
    const inspection = inspectXToolFormilyRepeatNativeInPage(
      "#formily-item-name-input",
      "project[1].project_name.native",
      "项目经历 2 · 项目名称"
    );
    expect(inspection).toMatchObject({
      status: "ready",
      targetCount: 2,
      actual: "",
      classNames: expect.arrayContaining(["stable-identity-rebound"])
    });
  });

  it("writes one exact reconstructed field and reads back the replacement node", async () => {
    const first = document.querySelectorAll<HTMLInputElement>(
      "#formily-item-project_list input[data-form-field-name='name']"
    )[0]!;
    const second = document.querySelectorAll<HTMLInputElement>(
      "#formily-item-project_list input[data-form-field-name='name']"
    )[1]!;
    let firstEvents = 0;
    let secondInputEvents = 0;
    let secondChangeEvents = 0;
    first.addEventListener("input", () => { firstEvents += 1; });
    second.addEventListener("input", (event) => {
      secondInputEvents += 1;
      const value = (event.currentTarget as HTMLInputElement).value;
      document.querySelector<HTMLElement>("[data-card='1']")!.outerHTML = projectCard(1, value);
    });
    second.addEventListener("change", () => { secondChangeEvents += 1; });

    const result = await executeXToolFormilyRepeatNativeInPage(
      "#formily-item-name-input",
      "project[1].project_name.native",
      "项目经历 2 · 项目名称",
      "第二个项目"
    );

    expect(result).toMatchObject({
      success: true,
      stage: "readback",
      actual: "第二个项目",
      writeCount: 1,
      targetCount: 2
    });
    expect(first.value).toBe("第一条");
    expect(firstEvents).toBe(0);
    expect(secondInputEvents).toBe(1);
    // The input event deliberately reconstructs the row; the detached old
    // node must not be treated as readback evidence or cause a second write.
    expect(secondChangeEvents).toBeLessThanOrEqual(1);
  });

  it("remains self-contained after chrome.scripting function serialization", async () => {
    const serialized = Function(
      `return (${executeXToolFormilyRepeatNativeInPage.toString()})`
    )() as typeof executeXToolFormilyRepeatNativeInPage;

    await expect(serialized(
      "#formily-item-name-input",
      "project[1].project_name.native",
      "项目经历 2 · 项目名称",
      "序列化执行项目"
    )).resolves.toMatchObject({
      success: true,
      actual: "序列化执行项目",
      writeCount: 1
    });
  });

  it("fails closed when the requested repeat index does not exist", async () => {
    const before = document.body.innerHTML;
    await expect(executeXToolFormilyRepeatNativeInPage(
      "#formily-item-name-input",
      "project[2].project_name.native",
      "项目经历 3 · 项目名称",
      "不可写"
    )).resolves.toMatchObject({
      success: false,
      stage: "detect",
      writeCount: 0,
      error: expect.stringContaining("target_missing")
    });
    expect(document.body.innerHTML).toBe(before);
  });

  it("executes through the MAIN-world bridge without retries or refresh", async () => {
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        scripting: {
          executeScript: vi.fn(async (input: {
            func: (...args: never[]) => unknown;
            args?: never[];
          }) => [{ result: await input.func(...(input.args ?? [])) }])
        }
      }
    });
    await expect(executeXToolFormilyRepeatNativeDriver({
      tabId: 7,
      selector: "#formily-item-name-input",
      stableFieldKey: "project[1].project_name.native",
      label: "项目经历 2 · 项目名称",
      value: "第二个项目"
    })).resolves.toMatchObject({ success: true, writeCount: 1 });
    expect(chrome.scripting.executeScript).toHaveBeenCalledTimes(1);
  });
});
