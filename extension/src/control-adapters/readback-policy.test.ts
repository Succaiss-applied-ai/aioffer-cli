import { describe, expect, it } from "vitest";
import type { PageFieldObservation } from "../page-adapter.js";
import { resolveControlAdapter, CONTROL_ADAPTER_REGISTRY } from "./registry.js";
import {
  readbackValueProvenance,
  registeredControlReadbackMatches
} from "./readback-policy.js";

function observedField(input: {
  label: string;
  stableFieldKey: string;
  type: string;
  currentValue: string;
}): PageFieldObservation {
  return {
    fieldId: "field-1",
    stableFieldKey: input.stableFieldKey,
    label: input.label,
    type: input.type,
    controlKind: input.type,
    currentValue: input.currentValue
  } as PageFieldObservation;
}

function nativePlaceDiagnostic(semanticKey: string) {
  return resolveControlAdapter({
    applicationUrl: "https://app.mokahr.com/campus-recruitment/jxw/166492#/job/job-1/apply",
    label: "籍贯",
    semanticKey,
    type: "text",
    controlKind: "combobox",
    tagName: "INPUT",
    readOnly: true,
    placeholder: "请输入籍贯",
    classNames: ["sd-Input-input", "sd-Dropdown-container", "location_info-test"]
  }).diagnostic;
}

function cityDiagnostic(semanticKey: string) {
  return resolveControlAdapter({
    applicationUrl: "https://app.mokahr.com/social-recruitment/linctex/46055#/job/job-1/apply",
    label: "意向工作城市",
    semanticKey,
    type: "text",
    controlKind: "combobox",
    tagName: "INPUT",
    readOnly: false,
    placeholder: "选择意向工作城市",
    classNames: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container"]
  }).diagnostic;
}

function flatSelectDiagnostic() {
  return resolveControlAdapter({
    applicationUrl: "https://app.mokahr.com/campus-recruitment/tap4fun/291#/job/job-1/apply",
    label: "性别 / Gender",
    semanticKey: "basic.gender.combobox",
    type: "text",
    controlKind: "combobox",
    tagName: "INPUT",
    readOnly: false,
    placeholder: "请选择",
    classNames: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container"]
  }).diagnostic;
}

describe("registered control readback policy", () => {
  it("declares one readback strategy for every executable registration", () => {
    expect(CONTROL_ADAPTER_REGISTRY.every((registration) =>
      registration.driver === "unsupported" || registration.readbackStrategy !== "unsupported"
    )).toBe(true);
  });

  it("keeps Moka bilingual flat-select readback aligned with its dedicated Driver", () => {
    const field = observedField({
      label: "性别 / Gender",
      stableFieldKey: "basic.gender.combobox",
      type: "combobox",
      currentValue: "女"
    });
    expect(registeredControlReadbackMatches({
      controlAdapter: flatSelectDiagnostic(),
      field,
      expected: "女/Female",
      semanticKey: "candidate.basic.gender"
    })).toMatchObject({ matches: true, effectiveStrategy: "page_option_exact" });
    expect(registeredControlReadbackMatches({
      controlAdapter: flatSelectDiagnostic(),
      field: { ...field, currentValue: "男女不限" },
      expected: "男/Male",
      semanticKey: "candidate.basic.gender"
    }).matches).toBe(false);
  });

  it("uses administrative hierarchy semantics for AI Offer native-place values", () => {
    const semanticKey = "candidate.basic.nativePlace";
    const decision = registeredControlReadbackMatches({
      controlAdapter: nativePlaceDiagnostic(semanticKey),
      field: observedField({
        label: "籍贯",
        stableFieldKey: "basic.native_place.native",
        type: "text",
        currentValue: "广东 / 深圳 / 南山"
      }),
      expected: "广东省 深圳市 南山区",
      semanticKey
    });

    expect(decision).toEqual({
      matches: true,
      configuredStrategy: "administrative_hierarchy_semantic",
      effectiveStrategy: "administrative_hierarchy_semantic",
      provenance: "ai_offer_taxonomy",
      temporalPrecision: null
    });
  });

  it("does not hide a genuinely different administrative district", () => {
    const semanticKey = "candidate.basic.nativePlace";
    expect(registeredControlReadbackMatches({
      controlAdapter: nativePlaceDiagnostic(semanticKey),
      field: observedField({
        label: "籍贯",
        stableFieldKey: "basic.native_place.native",
        type: "text",
        currentValue: "广东省 深圳市 福田区"
      }),
      expected: "广东省 深圳市 南山区",
      semanticKey
    }).matches).toBe(false);
  });

  it("keeps recruitment-page option answers presentation-exact", () => {
    const semanticKey = "job.requiredField.stable:basic.native_place.combobox";
    const decision = registeredControlReadbackMatches({
      controlAdapter: nativePlaceDiagnostic(semanticKey),
      field: observedField({
        label: "籍贯",
        stableFieldKey: "basic.native_place.combobox",
        type: "combobox",
        currentValue: "广东 / 深圳 / 南山"
      }),
      expected: "广东省 / 深圳市 / 南山区",
      semanticKey
    });

    expect(decision.matches).toBe(false);
    expect(decision.effectiveStrategy).toBe("page_option_exact");
    expect(decision.provenance).toBe("live_page_option");
  });

  it("reconciles city display with the city fact for both taxonomy and user-confirmed city answers", () => {
    const canonicalKey = "job.answers.preferredCity";
    expect(registeredControlReadbackMatches({
      controlAdapter: cityDiagnostic(canonicalKey),
      field: observedField({
        label: "意向工作城市",
        stableFieldKey: "intention.preferred_city.combobox",
        type: "combobox",
        currentValue: "北京市"
      }),
      expected: "北京",
      semanticKey: canonicalKey
    }).matches).toBe(true);

    const pageOptionKey = "job.requiredField.stable:intention.preferred_city.combobox";
    const pageOptionDecision = registeredControlReadbackMatches({
      controlAdapter: cityDiagnostic(pageOptionKey),
      field: observedField({
        label: "意向工作城市",
        stableFieldKey: "intention.preferred_city.combobox",
        type: "combobox",
        currentValue: "北京市"
      }),
      expected: "北京",
      semanticKey: pageOptionKey
    });
    expect(pageOptionDecision.matches).toBe(true);
    expect(pageOptionDecision.effectiveStrategy).toBe("administrative_city_semantic");
  });

  it("preserves the provenance of a live Moka city while using city display semantics", () => {
    const semanticKey = "site.liveRequiredSingleOption.preferredCity";
    const decision = registeredControlReadbackMatches({
      controlAdapter: cityDiagnostic(semanticKey),
      field: observedField({
        label: "意向工作城市",
        stableFieldKey: "intention.preferred_city.combobox",
        type: "text",
        controlKind: "native",
        currentValue: "南京市 / Nanjing"
      }),
      expected: "南京市 / Nanjing",
      semanticKey
    });

    expect(readbackValueProvenance(semanticKey)).toBe("live_page_option");
    expect(decision.matches).toBe(true);
    expect(decision.effectiveStrategy).toBe("administrative_city_semantic");
  });

  it("keeps MetaX sole-city readback executable after registry integration", () => {
    const semanticKey = "site.liveRequiredSingleOption.preferredCity";
    const adapter = resolveControlAdapter({
      applicationUrl: "https://app.mokahr.com/campus-recruitment/metax-tech/58131#/job/job-1/apply",
      label: "意向工作城市",
      semanticKey,
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "选择意向工作城市",
      classNames: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container"]
    }).diagnostic;
    const decision = registeredControlReadbackMatches({
      controlAdapter: adapter,
      field: observedField({
        label: "意向工作城市",
        stableFieldKey: "intention.preferred_city.combobox",
        type: "text",
        controlKind: "native",
        currentValue: "上海市"
      }),
      expected: "上海市",
      semanticKey
    });

    expect(adapter.registrationId).toBe("moka.metax.location.trusted-focus.v1");
    expect(adapter.readbackStrategy).toBe("administrative_city_semantic");
    expect(decision.matches).toBe(true);
    expect(decision.effectiveStrategy).toBe("administrative_city_semantic");
  });

  it("keeps flat page options and native text values strict", () => {
    const source = resolveControlAdapter({
      applicationUrl: "https://app.mokahr.com/campus-recruitment/canrui/42687#/job/job-1/apply",
      label: "信息来源渠道",
      semanticKey: "job.requiredField.stable:basic.recruiting_source.combobox",
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "请选择",
      classNames: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container"]
    }).diagnostic;
    expect(registeredControlReadbackMatches({
      controlAdapter: source,
      field: observedField({
        label: "信息来源渠道",
        stableFieldKey: "basic.recruiting_source.combobox",
        type: "combobox",
        currentValue: "校园招聘"
      }),
      expected: "校园",
      semanticKey: "job.requiredField.stable:basic.recruiting_source.combobox"
    }).matches).toBe(false);

    const repeat = resolveControlAdapter({
      applicationUrl: "https://xtool.jobs.feishu.cn/index/resume/123/apply",
      label: "项目经历 1 · 项目名称",
      semanticKey: "project[0].project_name.native",
      type: "text",
      controlKind: "native",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "",
      classNames: [
        "formily-item-project_list",
        "data-form-field-name:name",
        "data-form-field-i18n-name:项目名称"
      ]
    }).diagnostic;
    expect(registeredControlReadbackMatches({
      controlAdapter: repeat,
      field: observedField({
        label: "项目经历 1 · 项目名称",
        stableFieldKey: "project[0].project_name.native",
        type: "text",
        currentValue: "芯片验证平台"
      }),
      expected: "验证平台",
      semanticKey: "resume.project.0.name"
    }).matches).toBe(false);
  });

  it("matches temporal controls structurally instead of by display formatting", () => {
    const diagnostic = resolveControlAdapter({
      applicationUrl: "https://example.jobs.feishu.cn/index/resume/123/apply",
      label: "教育经历 1 · 开始时间",
      semanticKey: "education[0].start_date.custom_date_picker",
      type: "custom_date_picker",
      controlKind: "custom_date_picker",
      tagName: "DIV",
      readOnly: false,
      placeholder: "",
      classNames: ["atsx-date-picker-period-month-label", "atsx-date-picker-period-month"]
    }).diagnostic;
    const decision = registeredControlReadbackMatches({
      controlAdapter: diagnostic,
      field: observedField({
        label: "教育经历 1 · 开始时间",
        stableFieldKey: "education[0].start_date.custom_date_picker",
        type: "custom_date_picker",
        currentValue: "2025年9月"
      }),
      expected: "2025-09",
      semanticKey: "resume.education.0.startDate"
    });
    expect(decision.matches).toBe(true);
    expect(decision.temporalPrecision).toBe("month");
  });

  it("reads native month inputs in their authoritative platform format", () => {
    const diagnostic = resolveControlAdapter({
      applicationUrl: "https://careers.example.com/apply",
      label: "预计毕业年月",
      semanticKey: "resume.education.0.endDate",
      type: "month",
      controlKind: "native",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "",
      classNames: []
    }).diagnostic;
    const decision = registeredControlReadbackMatches({
      controlAdapter: diagnostic,
      field: observedField({
        label: "预计毕业年月",
        stableFieldKey: "education[0].end_date.native",
        type: "month",
        currentValue: "2025-09"
      }),
      expected: "2025-09",
      semanticKey: "resume.education.0.endDate"
    });

    expect(decision.matches).toBe(true);
    expect(decision.configuredStrategy).toBe("native_value_exact");
    expect(decision.temporalPrecision).toBeNull();
  });

  it("keeps the tap4fun birth calendar at day precision", () => {
    const diagnostic = resolveControlAdapter({
      applicationUrl: "https://app.mokahr.com/campus-recruitment/tap4fun/291#/job/job-1/apply",
      label: "出生日期",
      semanticKey: "candidate.basic.birthDate",
      type: "text",
      controlKind: "custom_date_picker",
      tagName: "INPUT",
      readOnly: true,
      placeholder: "请选择出生日期",
      classNames: ["sd-Input-input", "day_info", "sd-Dropdown-container"]
    }).diagnostic;
    const input = {
      controlAdapter: diagnostic,
      field: observedField({
        label: "出生日期",
        stableFieldKey: "basic.birth_date.native",
        type: "custom_date_picker",
        currentValue: "2000-03-17"
      }),
      expected: "2000-03-18",
      semanticKey: "candidate.basic.birthDate",
      dateValue: { year: 2000, month: 3, day: 18 },
      // A generic birth-month hint must never lower this registered day-grid.
      datePrecision: "month" as const
    };
    const decision = registeredControlReadbackMatches(input);

    expect(decision.matches).toBe(false);
    expect(decision.temporalPrecision).toBe("day");
  });

  it("requires the complete native datetime value instead of discarding time precision", () => {
    const diagnostic = resolveControlAdapter({
      applicationUrl: "https://careers.example.com/apply",
      label: "毕业日期",
      semanticKey: "resume.education.0.endDate",
      type: "datetime-local",
      controlKind: "native",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "",
      classNames: []
    }).diagnostic;
    const field = observedField({
      label: "毕业日期",
      stableFieldKey: "education[0].end_date.native",
      type: "datetime-local",
      currentValue: "2025-09-30T18:30"
    });

    expect(registeredControlReadbackMatches({
      controlAdapter: diagnostic,
      field,
      expected: "2025年9月30日",
      semanticKey: "resume.education.0.endDate"
    })).toMatchObject({ matches: false, temporalPrecision: null });
    expect(registeredControlReadbackMatches({ controlAdapter: diagnostic, field,
      expected: "2025-09-30T18:30" }).matches).toBe(true);
    expect(registeredControlReadbackMatches({ controlAdapter: diagnostic, field,
      expected: "2025-09-30T19:30" }).matches).toBe(false);
    expect(registeredControlReadbackMatches({
      controlAdapter: diagnostic,
      field,
      expected: "2025-09-29",
      semanticKey: "resume.education.0.endDate"
    }).matches).toBe(false);
  });

  it("strictly reads each Moka split year/month part instead of comparing it as a whole date", () => {
    const diagnostic = resolveControlAdapter({
      applicationUrl: "https://app.mokahr.com/campus-recruitment/bjwgby/118127#/job/job-1/apply",
      label: "项目经验 · 项目时间 · 开始时间 · 年",
      semanticKey: "resume.project.0.startDate",
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: true,
      placeholder: "年",
      classNames: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container"]
    }).diagnostic;
    const field = {
      ...observedField({ label: "项目经验 · 项目时间 · 开始时间 · 年",
        stableFieldKey: "project.start_date.combobox#0", type: "combobox", currentValue: "2025" }),
      temporal: { layout: "year_month_range", part: "year", groupKey: "project.range#0" }
    } as PageFieldObservation;

    expect(registeredControlReadbackMatches({ controlAdapter: diagnostic, field,
      expected: "2025", semanticKey: "resume.project.0.startDate",
      dateValue: { year: 2025, month: 10, day: 1 }, datePrecision: "month" }))
      .toMatchObject({ matches: true, temporalPrecision: "month" });
    expect(registeredControlReadbackMatches({ controlAdapter: diagnostic, field,
      expected: "2026", semanticKey: "resume.project.0.startDate",
      dateValue: { year: 2026, month: 10, day: 1 }, datePrecision: "month" }).matches).toBe(false);
  });

  it("classifies the two location value sources explicitly", () => {
    expect(readbackValueProvenance("candidate.basic.nativePlace")).toBe("ai_offer_taxonomy");
    expect(readbackValueProvenance("candidate.preferences.preferredCities")).toBe("ai_offer_taxonomy");
    expect(readbackValueProvenance("job.answers.preferredCity")).toBe("ai_offer_taxonomy");
    expect(readbackValueProvenance("job.requiredField.stable:basic.native_place.combobox"))
      .toBe("live_page_option");
  });
});
