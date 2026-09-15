import { describe, expect, it } from "vitest";
import {
  controlAdapterFailureDetails,
  isUnsupportedRequiredControlFailure,
  unsupportedRequiredControlFailure
} from "./failures.js";
import { resolveControlAdapter } from "./registry.js";

describe("unsupported required control failure", () => {
  it("preserves an outer readback failure separately from driver interaction failures", () => {
    expect(controlAdapterFailureDetails({
      reasonCode: "field_fill_readback_failed",
      fieldId: "source-1",
      stableFieldKey: "other.recruiting_source.combobox",
      fieldName: "请选择信息来源渠道",
      expectedValue: "公司官网",
      actualValue: "校园招聘",
      driverStage: "readback"
    })).toMatchObject({
      reasonCode: "field_fill_readback_failed",
      fieldName: "请选择信息来源渠道",
      expectedValue: "公司官网",
      actualValue: "校园招聘",
      driverStage: "readback"
    });
  });

  it("identifies the exact field and control without suggesting another driver", () => {
    const error = unsupportedRequiredControlFailure({
      label: "毕业时间",
      controlType: "自定义日期控件",
      adapterCode: "unresolved.custom.v1",
      detail: "没有命中已登记控件签名"
    });
    expect(error).toContain("暂不支持必填项「毕业时间」的自定义日期控件");
    expect(error).toContain("unresolved.custom.v1");
    expect(isUnsupportedRequiredControlFailure(error)).toBe(true);
    expect(isUnsupportedRequiredControlFailure("date_control_interaction_failed: 打开失败")).toBe(false);
  });

  it("returns site, field and control identity as structured failure JSON", () => {
    const resolution = resolveControlAdapter({
      applicationUrl: "https://app.mokahr.com/campus-recruitment/acme/1#/job/2/apply",
      label: "毕业时间",
      semanticKey: "education.graduationDate",
      type: "text",
      controlKind: "date",
      tagName: "INPUT",
      readOnly: true,
      placeholder: "日期（年月日）",
      classNames: ["day_info", "sd-Dropdown-container"]
    });
    expect(controlAdapterFailureDetails({
      reasonCode: "date_control_interaction_failed",
      fieldId: "field-7",
      stableFieldKey: "education.graduation_date.date",
      fieldName: "毕业时间",
      expectedValue: "2025-06-30",
      actualValue: "",
      controlAdapter: resolution.diagnostic
    })).toMatchObject({
      schemaVersion: "control-adapter-failure.v1",
      siteName: "Moka",
      fieldName: "毕业时间",
      controlType: "custom_date_picker",
      adapterCode: "moka.date-picker.trusted-pointer.v9",
      controlAdapter: {
        schemaVersion: "control-adapter-diagnostic.v1",
        driver: "site_deterministic"
      }
    });
  });
});
