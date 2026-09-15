import { describe, expect, it } from "vitest";
import {
  CONTROL_ADAPTER_REGISTRY,
  resolveControlAdapter
} from "./registry.js";

const base = {
  applicationUrl: "https://example.com/apply",
  label: "毕业时间",
  semanticKey: "education.graduationDate",
  type: "text",
  controlKind: "date",
  tagName: "INPUT",
  readOnly: true,
  placeholder: "日期（年月日）",
  classNames: ["custom-date"]
};

describe("control adapter evidence routing", () => {
  it("routes only the exact evidenced ZTE work-city signature", () => {
    const zte = {
      applicationUrl: "https://app.mokahr.com/campus-recruitment/ztehr4/150449#/job/job-1/apply",
      label: "意向工作城市", semanticKey: "intention.preferred_city.combobox", type: "text", controlKind: "combobox",
      tagName: "INPUT", readOnly: false, placeholder: "选择意向工作城市",
      classNames: ["sd-Input-input-10L0t", "sd-Select-container-1Eq4x", "sd-Dropdown-container-1CigZ"]
    };
    expect(resolveControlAdapter(zte)).toMatchObject({ code: "moka.zte.location.trusted-focus.v1", requiresForeground: false });
    for (const changes of [
      { applicationUrl: zte.applicationUrl.replace("150449", "150450") },
      { applicationUrl: zte.applicationUrl.replace("ztehr4", "another") },
      { readOnly: true }, { classNames: ["unrelated"] }, { label: "姓名", placeholder: "请输入姓名", semanticKey: "basic.name" }
    ]) expect(resolveControlAdapter({ ...zte, ...changes }).code).not.toBe("moka.zte.location.trusted-focus.v1");
  });
  it("keeps the evidenced Garena birth month control in the existing Moka Driver, not a text fallback", () => {
    const garena = {
      ...base,
      applicationUrl: "https://app.mokahr.com/campus-recruitment/garena/148076#/job/fixture/apply",
      label: "出生日期 (年龄)", semanticKey: "basic.birth_date.native", controlKind: "native",
      placeholder: "出生日期 (年龄)", classNames: ["sd-Input-input", "sd-Input-container day_info", "sd-Dropdown-container"]
    };
    expect(resolveControlAdapter(garena)).toMatchObject({ code: "moka.date-picker.trusted-pointer.v9" });
    expect(resolveControlAdapter({ ...garena, placeholder: "" })).toMatchObject({
      code: "moka.date-picker.trusted-pointer.v9", driver: "site_deterministic",
      requiresForeground: false, executionSurface: "background_tab"
    });
    const registration = CONTROL_ADAPTER_REGISTRY.find((entry) =>
      entry.registrationId === "moka.date-picker.trusted-pointer.v9"
    )!;
    expect(registration.readbackStrategy).toBe("structured_temporal");
    expect(registration.evidence).toEqual(expect.arrayContaining([
      expect.stringContaining("only a positively observed closed control"),
      expect.stringContaining("Garena campus tenant 148076"),
      expect.stringContaining("unconfirmed transitions fail closed")
    ]));
    expect(resolveControlAdapter({ ...garena, classNames: ["sd-Input-input", "sd-Dropdown-container"],
      label: "其他选项", semanticKey: "basic.other.native", placeholder: "选择选项"
    })).toMatchObject({ code: "unresolved.custom.v1" });
  });

  it("keeps every registered control on a background execution surface", () => {
    const foreground = CONTROL_ADAPTER_REGISTRY.filter((registration) =>
      registration.requiresForeground || registration.executionSurface === "foreground_tab"
    );
    expect(foreground).toEqual([]);
    expect(CONTROL_ADAPTER_REGISTRY.every((registration) =>
      !registration.requiresForeground && registration.executionSurface === "background_tab"
    )).toBe(true);
  });

  it("keeps every executable route in a serializable structured registration", () => {
    expect(CONTROL_ADAPTER_REGISTRY).toEqual(expect.arrayContaining([
      expect.objectContaining({
        registrationId: "feishu.month-period.trusted-pointer.v3",
        site: expect.objectContaining({ code: "feishu.jobs", name: "飞书招聘" }),
        field: expect.objectContaining({ category: "date", name: "飞书经历年月区间" }),
        control: expect.objectContaining({ type: "custom_date_picker", name: "飞书年月区间控件" }),
        driver: "site_deterministic",
        requiresForeground: false,
        executionSurface: "background_tab"
      }),
      expect.objectContaining({
        registrationId: "xtool.formily-repeat-native.v1",
        site: expect.objectContaining({ code: "xtool.feishu", name: "xTool / 飞书招聘" }),
        field: expect.objectContaining({ category: "repeat_native", name: "xTool 经历动态文本字段" }),
        control: expect.objectContaining({
          type: "formily_repeat_native",
          name: "xTool Formily 动态经历原生输入控件"
        }),
        driver: "site_deterministic",
        requiresForeground: false,
        executionSurface: "background_tab"
      }),
      expect.objectContaining({
        registrationId: "generic.consent-confirmation.trusted-pointer.v1",
        site: expect.objectContaining({ code: "cross_site", name: "跨站点" }),
        field: expect.objectContaining({ category: "consent", name: "隐私、授权或协议确认" }),
        control: expect.objectContaining({
          type: "native_or_aria_consent_checkbox",
          name: "原生或标准 ARIA 协议复选框"
        }),
        targetRoles: ["consent_control", "agreement_scroll_surface", "agreement_confirmation"],
        driver: "generic_native",
        requiresForeground: false,
        executionSurface: "background_tab"
      }),
      expect.objectContaining({
        registrationId: "moka.recruiting-source.trusted-focus.v1",
        site: expect.objectContaining({ code: "moka", name: "Moka" }),
        field: expect.objectContaining({
          category: "recruiting_source",
          name: "招聘信息来源字段"
        }),
        control: expect.objectContaining({
          type: "custom_recruiting_source_select",
          name: "Moka 招聘信息来源自定义下拉控件"
        }),
        driver: "site_deterministic",
        requiresForeground: false,
        executionSurface: "background_tab"
      }),
      expect.objectContaining({
        registrationId: "moka.deepseek.location.trusted-focus.v4",
        site: expect.objectContaining({ code: "moka.deepseek", name: "DeepSeek / Moka" }),
        field: expect.objectContaining({ category: "location", name: "意向工作城市字段" }),
        control: expect.objectContaining({
          type: "custom_location_cascader",
          name: "DeepSeek Moka 城市级联控件"
        }),
        driver: "site_deterministic",
        requiresForeground: false,
        executionSurface: "background_tab"
      }),
      expect.objectContaining({
        registrationId: "moka.phlexing.location.trusted-focus.v1",
        site: expect.objectContaining({ code: "moka.phlexing", name: "Phlexing / Moka" }),
        field: expect.objectContaining({ category: "location", name: "意向工作城市字段" }),
        control: expect.objectContaining({
          type: "custom_location_cascader",
          name: "Phlexing Moka 城市级联控件"
        }),
        driver: "site_deterministic",
        requiresForeground: false,
        executionSurface: "background_tab"
      }),
      expect.objectContaining({
        registrationId: "moka.year-month-select.trusted-pointer.v1",
        site: expect.objectContaining({ code: "moka", name: "Moka" }),
        field: expect.objectContaining({ category: "date", name: "Moka 独立年/月日期字段" }),
        control: expect.objectContaining({
          type: "custom_year_month_select",
          name: "Moka 年/月分离下拉控件"
        }),
        targetRoles: ["control", "year_option", "month_option"],
        driver: "site_deterministic",
        requiresForeground: false,
        executionSurface: "background_tab"
      }),
      expect.objectContaining({
        registrationId: "moka.native-place.cascader.trusted-pointer.v1",
        site: expect.objectContaining({ code: "moka", name: "Moka" }),
        field: expect.objectContaining({ category: "location", name: "籍贯字段" }),
        control: expect.objectContaining({
          type: "custom_native_place_cascader",
          name: "Moka 省市区籍贯级联控件"
        }),
        driver: "site_deterministic",
        requiresForeground: false,
        executionSurface: "background_tab"
      }),
      expect.objectContaining({
        registrationId: "moka.zuoyebang.education-end-month.trusted-pointer.v1",
        site: expect.objectContaining({ code: "moka.zuoyebang", name: "作业帮 / Moka" }),
        field: expect.objectContaining({
          category: "date",
          name: "作业帮教育经历结束年月字段"
        }),
        control: expect.objectContaining({
          type: "custom_date_picker",
          name: "作业帮 Moka 教育结束年月日历控件"
        }),
        driver: "site_deterministic",
        requiresForeground: false,
        executionSurface: "background_tab"
      }),
      expect.objectContaining({
        registrationId: "moka.tap4fun.birth-date.trusted-pointer.v2",
        site: expect.objectContaining({ code: "moka.tap4fun", name: "tap4fun / Moka" }),
        field: expect.objectContaining({ category: "date", name: "tap4fun 出生日期字段" }),
        control: expect.objectContaining({
          type: "custom_date_picker",
          name: "tap4fun Moka 日历型出生日期控件"
        }),
        targetRoles: [
          "control", "year_header", "decade_navigation", "year_option",
          "month_header", "month_option", "day_option"
        ],
        driver: "site_deterministic",
        requiresForeground: false,
        executionSurface: "background_tab"
      }),
      expect.objectContaining({
        registrationId: "moka.date-picker.trusted-pointer.v9",
        site: expect.objectContaining({ code: "moka", name: "Moka" }),
        field: expect.objectContaining({
          category: "date",
          name: "日期字段",
          fieldNamePatterns: expect.arrayContaining([expect.stringContaining("毕业")]),
          semanticKeyPatterns: expect.arrayContaining([expect.stringContaining("graduation")])
        }),
        control: expect.objectContaining({
          type: "custom_date_picker",
          name: "Moka 只读日期弹层控件"
        }),
        driver: "site_deterministic",
        requiresForeground: false,
        executionSurface: "background_tab"
      }),
      expect.objectContaining({
        registrationId: "generic.native.text.v1",
        site: expect.objectContaining({ code: "cross_site", name: "跨站点" }),
        field: expect.objectContaining({ category: "text", name: "原生文本字段" }),
        control: expect.objectContaining({
          type: "native_text_input",
          name: "原生文本输入控件"
        }),
        driver: "generic_native",
        requiresForeground: false,
        executionSurface: "background_tab"
      })
    ]));
    expect(() => JSON.stringify(CONTROL_ADAPTER_REGISTRY)).not.toThrow();
  });

  it("routes both documented Feishu month-range variants to the dedicated driver", () => {
    const evidence = {
      applicationUrl: "https://example.jobs.feishu.cn/615803/resume/7674912673033029929/apply",
      label: "教育经历 1 · 开始时间",
      semanticKey: "education[0].start_date.custom_date_picker",
      type: "custom_date_picker",
      controlKind: "custom_date_picker",
      tagName: "DIV",
      readOnly: false,
      placeholder: "",
      classNames: ["atsx-date-picker-period-month-label", "atsx-date-picker-period-month", "education[0].periodInputBegin"]
    };
    expect(resolveControlAdapter(evidence)).toMatchObject({
      code: "feishu.month-period.trusted-pointer.v3",
      driver: "site_deterministic",
      reason: "feishu_month_period_signature"
    });
    expect(resolveControlAdapter({ ...evidence, applicationUrl: "https://careers.example.com/apply" }).code)
      .not.toBe("feishu.month-period.trusted-pointer.v3");
    expect(resolveControlAdapter({ ...evidence, classNames: ["atsx-date-picker-period-month-label", "unrelated"] }).code)
      .not.toBe("feishu.month-period.trusted-pointer.v3");
    expect(resolveControlAdapter({
      ...evidence,
      applicationUrl: "https://xtool.jobs.feishu.cn/index/resume/7678562627672541486/apply",
      label: "工作经历 1 · 结束时间",
      semanticKey: "work[0].end_date.custom_date_picker",
      classNames: [
        "throne-biz-date-range-picker-input",
        "throne-biz-date-range-picker-wrapper",
        "formily-item-works_list"
      ]
    })).toMatchObject({
      code: "feishu.month-period.trusted-pointer.v3",
      driver: "site_deterministic",
      reason: "feishu_month_period_signature"
    });
  });

  it("routes Feishu Formily readonly-search Selects without leaking into native text or Moka", () => {
    const evidence = {
      applicationUrl: "https://xtool.jobs.feishu.cn/index/resume/7678562627672541486/apply",
      label: "教育经历 1 · 学历",
      semanticKey: "education[0].degree.combobox",
      type: "search",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: true,
      placeholder: "请选择",
      classNames: [
        "ud__select__selector__search__input ud__native-input",
        "ud__select__selector",
        "ud__select",
        "ud-formily-item-control",
        "ud-formily-item"
      ]
    };
    expect(resolveControlAdapter(evidence)).toMatchObject({
      code: "feishu.formily-flat-select.trusted-pointer.v1",
      driver: "site_deterministic",
      reason: "feishu_formily_flat_select_signature"
    });
    expect(resolveControlAdapter({ ...evidence, readOnly: false }).code)
      .not.toBe("feishu.formily-flat-select.trusted-pointer.v1");
    expect(resolveControlAdapter({ ...evidence,
      applicationUrl: "https://app.mokahr.com/campus-recruitment/x/1#/job/a/apply" }).code)
      .not.toBe("feishu.formily-flat-select.trusted-pointer.v1");
    expect(resolveControlAdapter({ ...evidence, classNames: ["ud__native-input", "ordinary-form"] }).code)
      .not.toBe("feishu.formily-flat-select.trusted-pointer.v1");
  });

  it("keeps Formily flat selection scoped by component structure across legal Feishu tenant paths", () => {
    const evidence = {
      applicationUrl: "https://is35svcbne.jobs.feishu.cn/youcash/resume/7641043112992131347/apply",
      label: "性别", semanticKey: "basic.gender_gender_性别.combobox",
      type: "search", controlKind: "combobox", tagName: "INPUT", readOnly: true,
      classNames: [
        "ud__select__selector__search__input ud__native-input", "ud__select__selector__search",
        "ud__select__selector__content", "ud__select__selector ud__select__selector-readOnly",
        "ud__select", "ud-formily-item-control-content-component", "ud-formily-item-control-content",
        "ud-formily-item-control", "ud-formily-item data-form-field-name:gender"
      ]
    };
    const adapter = "feishu.formily-flat-select.trusted-pointer.v1";
    for (const scope of ["youcash", "index", "campus", "900011", "a-company"]) {
      expect(resolveControlAdapter({ ...evidence, applicationUrl:
        `https://is35svcbne.jobs.feishu.cn/${scope}/resume/7641043112992131347/apply` }).code).toBe(adapter);
    }
    for (const applicationUrl of [
      "https://is35svcbne.jobs.feishu.cn/youcash/other/resume/7641043112992131347/apply",
      "https://is35svcbne.jobs.feishu.cn/youcash/resume/applied",
      "https://is35svcbne.jobs.feishu.cn.evil.example/youcash/resume/7641043112992131347/apply"
    ]) expect(resolveControlAdapter({ ...evidence, applicationUrl }).code).not.toBe(adapter);
    expect(resolveControlAdapter({ ...evidence, readOnly: false }).code).not.toBe(adapter);
    expect(resolveControlAdapter({ ...evidence, classNames: ["ud__native-input", "plain-input"] }).code).not.toBe(adapter);
  });

  it("routes only xTool Formily repeat native fields to the stable-identity driver", () => {
    const evidence = {
      applicationUrl: "https://xtool.jobs.feishu.cn/index/resume/7678562627672541486/apply",
      label: "项目经历 2 · 项目名称",
      semanticKey: "project[1].project_name.native",
      type: "text",
      controlKind: "native",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "",
      classNames: [
        "ud__native-input",
        "formily-item-project_list",
        "data-form-field-name:name",
        "data-form-field-i18n-name:项目名称"
      ]
    };
    expect(resolveControlAdapter(evidence)).toMatchObject({
      code: "xtool.formily-repeat-native.v1",
      driver: "site_deterministic",
      reason: "xtool_formily_repeat_native_signature"
    });
    expect(resolveControlAdapter({
      ...evidence,
      applicationUrl: "https://shoplazza.jobs.feishu.cn/index/resume/7678562627672541486/apply"
    }).code).not.toBe("xtool.formily-repeat-native.v1");
    expect(resolveControlAdapter({
      ...evidence,
      classNames: ["ud__native-input", "ordinary-form"]
    }).code).not.toBe("xtool.formily-repeat-native.v1");
  });

  it("routes cross-site native and ARIA agreement checkboxes to the generic consent driver", () => {
    for (const evidence of [
      {
        applicationUrl: "https://app.mokahr.com/campus-recruitment/vwa/118095#/job/job-1/apply",
        label: "我已阅读并同意《隐私协议》",
        semanticKey: "consent agreement privacy authorization declaration",
        type: "checkbox",
        controlKind: "checkbox",
        tagName: "INPUT",
        readOnly: false,
        placeholder: "",
        classNames: ["sd-Checkbox-input"]
      },
      {
        applicationUrl: "https://careers.example.org/application/42",
        label: "I agree to the candidate privacy notice",
        semanticKey: "privacy.consent",
        type: "checkbox",
        controlKind: "checkbox",
        tagName: "DIV",
        readOnly: false,
        placeholder: "",
        classNames: ["accessible-consent-toggle"]
      }
    ]) {
      expect(resolveControlAdapter(evidence)).toMatchObject({
        code: "generic.consent-confirmation.trusted-pointer.v1",
        kind: "generic",
        driver: "generic_native",
        requiresForeground: false,
        executionSurface: "background_tab",
        reason: "generic_consent_signature"
      });
    }
  });

  it("does not route unrelated checkboxes or submit controls to the consent driver", () => {
    for (const evidence of [
      {
        applicationUrl: "https://careers.example.org/application/42",
        label: "同步更新在线简历",
        semanticKey: "profile.sync",
        type: "checkbox",
        controlKind: "checkbox",
        tagName: "INPUT",
        readOnly: false,
        placeholder: "",
        classNames: []
      },
      {
        applicationUrl: "https://careers.example.org/application/42",
        label: "确认提交",
        semanticKey: "final.submit",
        type: "button",
        controlKind: "button",
        tagName: "BUTTON",
        readOnly: false,
        placeholder: "",
        classNames: []
      }
    ]) {
      expect(resolveControlAdapter(evidence).code).not.toBe("generic.consent-confirmation.trusted-pointer.v1");
      expect(resolveControlAdapter(evidence).driver).toBe(evidence.type === "checkbox" ? "generic_native" : "unsupported");
    }
  });

  it("routes only the evidenced DeepSeek work-city control to its dedicated driver", () => {
    expect(resolveControlAdapter({
      applicationUrl: "https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/job-1/apply",
      label: "意向工作城市",
      semanticKey: "preferences.preferredCity",
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "选择意向工作城市",
      classNames: [
        "sd-Input-input-10L0t",
        "sd-Input-container sd-Select-container-1Eq4x",
        "sd-Dropdown-container-1CigZ"
      ]
    })).toMatchObject({
      code: "moka.deepseek.location.trusted-focus.v4",
      kind: "specialized",
      driver: "site_deterministic",
      requiresForeground: false,
      executionSurface: "background_tab",
      reason: "deepseek_location_signature",
      diagnostic: {
        registrationId: "moka.deepseek.location.trusted-focus.v4",
        siteCode: "moka.deepseek",
        siteName: "DeepSeek / Moka",
        fieldName: "意向工作城市",
        controlType: "custom_location_cascader",
        adapterCode: "moka.deepseek.location.trusted-focus.v4"
      }
    });
  });

  it("routes the evidenced Linctex work-city control to its dedicated driver", () => {
    expect(resolveControlAdapter({
      applicationUrl: "https://app.mokahr.com/social-recruitment/linctex/46055#/job/job-1/apply",
      label: "意向工作城市",
      semanticKey: "intention.preferred_city.combobox",
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "选择意向工作城市",
      classNames: [
        "sd-Input-input-10L0t",
        "sd-Input-container sd-Select-container-1Eq4x",
        "sd-Dropdown-container-1CigZ"
      ]
    })).toMatchObject({
      code: "moka.linctex.location.trusted-focus.v1",
      kind: "specialized",
      driver: "site_deterministic",
      requiresForeground: false,
      executionSurface: "background_tab",
      reason: "linctex_location_signature",
      diagnostic: {
        registrationId: "moka.linctex.location.trusted-focus.v1",
        siteCode: "moka.linctex",
        siteName: "Linctex / Moka",
        fieldName: "意向工作城市",
        controlType: "custom_location_cascader",
        adapterCode: "moka.linctex.location.trusted-focus.v1"
      }
    });
  });

  it.each([
    {
      name: "Yadea",
      applicationUrl: "https://app.mokahr.com/social-recruitment/yadea/144891#/job/job-1/apply",
      code: "moka.yadea.location.trusted-focus.v1",
      siteCode: "moka.yadea",
      siteName: "Yadea / Moka",
      reason: "yadea_location_signature"
    },
    {
      name: "Brother",
      applicationUrl: "https://app.mokahr.com/social-recruitment/brother/150715#/job/job-1/apply",
      code: "moka.brother.location.trusted-focus.v1",
      siteCode: "moka.brother",
      siteName: "Brother / Moka",
      reason: "brother_location_signature"
    },
    {
      name: "Sina",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/sina/43536#/job/job-1/apply",
      code: "moka.sina.location.trusted-focus.v1",
      siteCode: "moka.sina",
      siteName: "新浪 / Moka",
      reason: "sina_location_signature"
    },
    {
      name: "Xiwang",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/xiwang/146380#/job/job-1/apply",
      code: "moka.xiwang.location.trusted-focus.v1",
      siteCode: "moka.xiwang",
      siteName: "希望学 / Moka",
      reason: "xiwang_location_signature"
    },
    {
      name: "Yinli",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/yinli/148676#/job/job-1/apply",
      code: "moka.yinli.location.trusted-focus.v1",
      siteCode: "moka.yinli",
      siteName: "引力传媒 / Moka",
      reason: "yinli_location_signature"
    },
    {
      name: "WZ Group",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/wzgroup/76099#/job/job-1/apply",
      code: "moka.wzgroup.location.trusted-focus.v1",
      siteCode: "moka.wzgroup",
      siteName: "物产中大 / Moka",
      reason: "wzgroup_location_signature"
    },
    {
      name: "Transwarp",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/transwarp/3196#/job/job-1/apply",
      code: "moka.transwarp.location.trusted-focus.v1",
      siteCode: "moka.transwarp",
      siteName: "星环科技 / Moka",
      reason: "transwarp_location_signature"
    },
    {
      name: "Newgrand",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/newgrand/151701#/job/job-1/apply",
      code: "moka.newgrand.location.trusted-focus.v1",
      siteCode: "moka.newgrand",
      siteName: "新中大科技 / Moka",
      reason: "newgrand_location_signature"
    },
    {
      name: "Newonder",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/newonder/146673#/job/job-1/apply",
      code: "moka.newonder.location.trusted-focus.v1",
      siteCode: "moka.newonder",
      siteName: "新华都 / Moka",
      reason: "newonder_location_signature"
    },
    {
      name: "Wandacm",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/wandacm/164049#/job/job-1/apply",
      code: "moka.wandacm.location.trusted-focus.v1",
      siteCode: "moka.wandacm",
      siteName: "珠海万达商管 / Moka",
      reason: "wandacm_location_signature"
    },
    {
      name: "Innostar",
      applicationUrl: "https://app.mokahr.com/social-recruitment/innostar1/46008#/job/job-1/apply",
      code: "moka.innostar.location.trusted-focus.v1",
      siteCode: "moka.innostar",
      siteName: "昕原半导体 / Moka",
      reason: "innostar_location_signature"
    },
    {
      name: "Ascenpower",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/ascenpower/166280#/job/job-1/apply",
      code: "moka.ascenpower.location.trusted-focus.v1",
      siteCode: "moka.ascenpower",
      siteName: "芯粤能半导体 / Moka",
      reason: "ascenpower_location_signature"
    },
    {
      name: "GCL Power",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/gclpower/140979#/job/job-1/apply",
      code: "moka.gclpower.location.trusted-focus.v1",
      siteCode: "moka.gclpower",
      siteName: "协鑫能科 / Moka",
      reason: "gclpower_location_signature"
    },
    {
      name: "Xiaoying",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/xiaoying/148851#/job/job-1/apply",
      code: "moka.xiaoying.location.trusted-focus.v1",
      siteCode: "moka.xiaoying",
      siteName: "小赢科技 / Moka",
      reason: "xiaoying_location_signature"
    },
    {
      name: "SimcereDx",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/simceredx/74124#/job/job-1/apply",
      code: "moka.simceredx.location.trusted-focus.v1",
      siteCode: "moka.simceredx",
      siteName: "先声诊断 / Moka",
      reason: "simceredx_location_signature"
    },
    {
      name: "EQHR",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/eqhr/39786#/job/job-1/apply",
      code: "moka.eqhr.location.trusted-focus.v1",
      siteCode: "moka.eqhr",
      siteName: "易控智驾 / Moka",
      reason: "eqhr_location_signature"
    },
    {
      name: "XGD",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/xgd/7850#/job/job-1/apply",
      code: "moka.xgd.location.trusted-focus.v1",
      siteCode: "moka.xgd",
      siteName: "新国都 / Moka",
      reason: "xgd_location_signature"
    }
  ])("routes the evidenced $name work-city control only to its dedicated driver", (input) => {
    expect(resolveControlAdapter({
      applicationUrl: input.applicationUrl,
      label: "意向工作城市",
      semanticKey: "intention.preferred_city.combobox",
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "选择意向工作城市",
      classNames: [
        "sd-Input-input-10L0t",
        "sd-Input-container sd-Select-container-1Eq4x",
        "sd-Dropdown-container-1CigZ"
      ]
    })).toMatchObject({
      code: input.code,
      kind: "specialized",
      driver: "site_deterministic",
      requiresForeground: false,
      executionSurface: "background_tab",
      reason: input.reason,
      diagnostic: {
        registrationId: input.code,
        siteCode: input.siteCode,
        siteName: input.siteName,
        fieldName: "意向工作城市",
        controlType: "custom_location_cascader",
        adapterCode: input.code
      }
    });
  });

  it("routes the evidenced Phlexing work-city control to its dedicated driver", () => {
    expect(resolveControlAdapter({
      applicationUrl: "https://app.mokahr.com/campus-recruitment/phlexing/100123#/job/job-1/apply",
      label: "意向工作城市",
      semanticKey: "preferences.preferredCity",
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "选择意向工作城市",
      classNames: [
        "sd-Input-input-10L0t",
        "sd-Input-container sd-Select-container-1Eq4x",
        "sd-Dropdown-container-1CigZ"
      ]
    })).toMatchObject({
      code: "moka.phlexing.location.trusted-focus.v1",
      kind: "specialized",
      driver: "site_deterministic",
      requiresForeground: false,
      executionSurface: "background_tab",
      reason: "phlexing_location_signature"
    });
  });

  it("routes the evidenced MetaX work-city control to its dedicated driver", () => {
    expect(resolveControlAdapter({
      applicationUrl: "https://app.mokahr.com/campus-recruitment/metax-tech/58131#/job/job-1/apply",
      label: "申请信息 · 意向工作城市",
      semanticKey: "intention.preferred_city.combobox",
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "选择意向工作城市",
      classNames: [
        "sd-Input-input-10L0t",
        "sd-Input-container sd-Select-container-1Eq4x",
        "sd-Dropdown-container-1CigZ"
      ]
    })).toMatchObject({
      code: "moka.metax.location.trusted-focus.v1",
      kind: "specialized",
      driver: "site_deterministic",
      requiresForeground: false,
      executionSurface: "background_tab",
      reason: "metax_location_signature"
    });
  });

  it("routes the evidenced JSTI bilingual work-city control to its dedicated driver", () => {
    expect(resolveControlAdapter({
      applicationUrl: "https://app.mokahr.com/campus-recruitment/jsti/144121#/job/job-1/apply",
      label: "意向工作城市 / Preferred work city",
      semanticKey: "intention.preferred_city.combobox",
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "选择意向工作城市 / Select preferred work city",
      classNames: [
        "sd-Input-input-10L0t",
        "sd-Select-container-1Eq4x",
        "sd-Dropdown-container-1CigZ"
      ]
    })).toMatchObject({
      code: "moka.jsti.location.trusted-focus.v1",
      kind: "specialized",
      driver: "site_deterministic",
      requiresForeground: false,
      executionSurface: "background_tab",
      reason: "jsti_location_signature"
    });
  });

  it.each(["xyzrobotics/26847", "ztehr4/150449"])("does not route the %s text city field to a Moka select Driver", (campaign) => {
    expect(resolveControlAdapter({
      applicationUrl: `https://app.mokahr.com/campus-recruitment/${campaign}#/job/job-1/apply`,
      label: "期望城市",
      semanticKey: "intention.preferred_city.native",
      type: "text",
      controlKind: "native",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "期望城市",
      classNames: [
        "sd-Input-input-10L0t",
        "sd-Input-container string_info"
      ]
    })).toMatchObject({
      code: "generic.native.v1",
      kind: "generic",
      driver: "generic_native",
      requiresForeground: false,
      executionSurface: "background_tab",
      reason: "native_control"
    });
  });

  it.each([
    {
      name: "another Moka tenant with copied classes",
      applicationUrl: "https://app.mokahr.com/social-recruitment/other/140576#/job/job-1/apply",
      label: "意向工作城市",
      semanticKey: "preferences.preferredCity",
      placeholder: "选择意向工作城市",
      expectedCode: "moka.work-city.trusted-focus.v1",
      expectedDriver: "site_deterministic"
    },
    {
      name: "another Phlexing campaign with copied classes",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/phlexing/100124#/job/job-1/apply",
      label: "意向工作城市",
      semanticKey: "preferences.preferredCity",
      placeholder: "选择意向工作城市",
      expectedCode: "moka.work-city.trusted-focus.v1",
      expectedDriver: "site_deterministic"
    },
    {
      name: "another Linctex campaign with copied classes",
      applicationUrl: "https://app.mokahr.com/social-recruitment/linctex/46056#/job/job-1/apply",
      label: "意向工作城市",
      semanticKey: "intention.preferred_city.combobox",
      placeholder: "选择意向工作城市",
      expectedCode: "moka.work-city.trusted-focus.v1",
      expectedDriver: "site_deterministic"
    },
    {
      name: "another Yadea campaign with copied classes",
      applicationUrl: "https://app.mokahr.com/social-recruitment/yadea/144892#/job/job-1/apply",
      label: "意向工作城市",
      semanticKey: "intention.preferred_city.combobox",
      placeholder: "选择意向工作城市",
      expectedCode: "moka.work-city.trusted-focus.v1",
      expectedDriver: "site_deterministic"
    },
    {
      name: "another Brother campaign with copied classes",
      applicationUrl: "https://app.mokahr.com/social-recruitment/brother/150716#/job/job-1/apply",
      label: "意向工作城市",
      semanticKey: "intention.preferred_city.combobox",
      placeholder: "选择意向工作城市",
      expectedCode: "moka.work-city.trusted-focus.v1",
      expectedDriver: "site_deterministic"
    },
    {
      name: "another Sina campaign with copied classes",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/sina/43537#/job/job-1/apply",
      label: "意向工作城市",
      semanticKey: "intention.preferred_city.combobox",
      placeholder: "选择意向工作城市",
      expectedCode: "moka.work-city.trusted-focus.v1",
      expectedDriver: "site_deterministic"
    },
    {
      name: "another Xiwang campaign with copied classes",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/xiwang/146381#/job/job-1/apply",
      label: "意向工作城市",
      semanticKey: "intention.preferred_city.combobox",
      placeholder: "选择意向工作城市",
      expectedCode: "moka.work-city.trusted-focus.v1",
      expectedDriver: "site_deterministic"
    },
    {
      name: "another Yinli campaign with copied classes",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/yinli/148677#/job/job-1/apply",
      label: "意向工作城市",
      semanticKey: "intention.preferred_city.combobox",
      placeholder: "选择意向工作城市",
      expectedCode: "moka.work-city.trusted-focus.v1",
      expectedDriver: "site_deterministic"
    },
    {
      name: "another WZ Group campaign with copied classes",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/wzgroup/76100#/job/job-1/apply",
      label: "意向工作城市",
      semanticKey: "intention.preferred_city.combobox",
      placeholder: "选择意向工作城市",
      expectedCode: "moka.work-city.trusted-focus.v1",
      expectedDriver: "site_deterministic"
    },
    {
      name: "another Transwarp campaign with copied classes",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/transwarp/3197#/job/job-1/apply",
      label: "意向工作城市",
      semanticKey: "intention.preferred_city.combobox",
      placeholder: "选择意向工作城市",
      expectedCode: "moka.work-city.trusted-focus.v1",
      expectedDriver: "site_deterministic"
    },
    {
      name: "another Newgrand campaign with copied classes",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/newgrand/151702#/job/job-1/apply",
      label: "意向工作城市",
      semanticKey: "intention.preferred_city.combobox",
      placeholder: "选择意向工作城市",
      expectedCode: "moka.work-city.trusted-focus.v1",
      expectedDriver: "site_deterministic"
    },
    {
      name: "another Newonder campaign with copied classes",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/newonder/146674#/job/job-1/apply",
      label: "意向工作城市",
      semanticKey: "intention.preferred_city.combobox",
      placeholder: "选择意向工作城市",
      expectedCode: "moka.work-city.trusted-focus.v1",
      expectedDriver: "site_deterministic"
    },
    {
      name: "another Wandacm campaign with copied classes",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/wandacm/164050#/job/job-1/apply",
      label: "意向工作城市",
      semanticKey: "intention.preferred_city.combobox",
      placeholder: "选择意向工作城市",
      expectedCode: "moka.work-city.trusted-focus.v1",
      expectedDriver: "site_deterministic"
    },
    {
      name: "another Innostar campaign with copied classes",
      applicationUrl: "https://app.mokahr.com/social-recruitment/innostar1/46009#/job/job-1/apply",
      label: "意向工作城市",
      semanticKey: "intention.preferred_city.combobox",
      placeholder: "选择意向工作城市",
      expectedCode: "moka.work-city.trusted-focus.v1",
      expectedDriver: "site_deterministic"
    },
    {
      name: "another Ascenpower campaign with copied classes",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/ascenpower/166281#/job/job-1/apply",
      label: "意向工作城市",
      semanticKey: "intention.preferred_city.combobox",
      placeholder: "选择意向工作城市",
      expectedCode: "moka.work-city.trusted-focus.v1",
      expectedDriver: "site_deterministic"
    },
    {
      name: "another XGD campaign with copied classes",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/xgd/7851#/job/job-1/apply",
      label: "意向工作城市",
      semanticKey: "intention.preferred_city.combobox",
      placeholder: "选择意向工作城市",
      expectedCode: "moka.work-city.trusted-focus.v1",
      expectedDriver: "site_deterministic"
    },
    {
      name: "an unrelated DeepSeek dropdown",
      applicationUrl: "https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/job-1/apply",
      label: "招聘渠道",
      semanticKey: "source.channel",
      placeholder: "选择招聘渠道",
      expectedCode: "moka.recruiting-source.trusted-focus.v1",
      expectedDriver: "site_deterministic"
    },
    {
      name: "an unrelated site with the same DOM signature",
      applicationUrl: "https://careers.example.com/apply",
      label: "意向工作城市",
      semanticKey: "preferences.preferredCity",
      placeholder: "选择意向工作城市",
      expectedCode: "unresolved.custom.v1",
      expectedDriver: "unsupported"
    }
  ])("does not route $name to the DeepSeek location driver", (input) => {
    expect(resolveControlAdapter({
      ...input,
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: false,
      classNames: [
        "sd-Input-input-10L0t",
        "sd-Input-container sd-Select-container-1Eq4x",
        "sd-Dropdown-container-1CigZ"
      ]
    })).toMatchObject({
      code: input.expectedCode,
      driver: input.expectedDriver
    });
  });

  it("routes the evidenced Moka recruiting-source Select to its dedicated background driver", () => {
    expect(resolveControlAdapter({
      applicationUrl: "https://app.mokahr.com/campus-recruitment/canrui/42687#/job/job-1/apply",
      label: "请选择信息来源渠道",
      semanticKey: "basic.recruiting_source.combobox",
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "请选择",
      classNames: [
        "sd-Input-input-10L0t",
        "sd-Input-container sd-Select-container-1Eq4x",
        "sd-Dropdown-container-1CigZ"
      ]
    })).toMatchObject({
      code: "moka.recruiting-source.trusted-focus.v1",
      kind: "specialized",
      driver: "site_deterministic",
      requiresForeground: false,
      executionSurface: "background_tab",
      reason: "moka_recruiting_source_signature",
      diagnostic: {
        registrationId: "moka.recruiting-source.trusted-focus.v1",
        siteName: "Moka",
        fieldName: "请选择信息来源渠道",
        controlType: "custom_recruiting_source_select",
        adapterCode: "moka.recruiting-source.trusted-focus.v1"
      }
    });
  });

  it.each(["select", "checkbox", "radio"])("keeps a native %s city-transfer question in its native Driver", type => {
    expect(resolveControlAdapter({applicationUrl:"https://app.mokahr.com/campus-recruitment/gehc/142250#/job/example/apply",
      label:"是否接受意向城市调剂？",semanticKey:"intention.preferred_city",type,controlKind:type,
      tagName:type==="select" ? "SELECT" : "INPUT",readOnly:false,placeholder:"",classNames:[]
    })).toMatchObject({code:"generic.native.v1",driver:"generic_native"});
  });

  it("does not mistake a containing class name for the boolean component marker", () => {
    expect(resolveControlAdapter({applicationUrl:"https://app.mokahr.com/campus-recruitment/unrelated/1#/job/example/apply",
      label:"意向工作城市",semanticKey:"intention.preferred_city.combobox",type:"text",controlKind:"combobox",
      tagName:"INPUT",readOnly:false,placeholder:"选择意向工作城市",
      classNames:["sd-Input-input", "sd-Select-container not_bool_info", "sd-Dropdown-container"]
    })).toMatchObject({code:"moka.work-city.trusted-focus.v1",driver:"site_deterministic"});
  });

  it("routes only the exact Sina Weibo-frequency Select to its dedicated background driver", () => {
    const evidence = {
      applicationUrl: "https://app.mokahr.com/campus-recruitment/sina/43536#/job/job-1/apply",
      label: "您使用微博的频率",
      semanticKey: "custom.weibo_use_frequency.combobox",
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "请选择",
      classNames: [
        "sd-Input-input-10L0t",
        "sd-Input-container sd-Select-container-1Eq4x",
        "sd-Dropdown-container-1CigZ"
      ]
    };
    expect(resolveControlAdapter(evidence)).toMatchObject({
      code: "moka.sina.weibo-frequency.trusted-focus.v1",
      driver: "site_deterministic",
      requiresForeground: false,
      reason: "sina_weibo_frequency_signature"
    });
    expect(resolveControlAdapter({
      ...evidence,
      applicationUrl: "https://app.mokahr.com/campus-recruitment/sina/43537#/job/job-1/apply"
    })).toMatchObject({ code: "moka.flat-select.trusted-focus.v1", driver: "site_deterministic" });
  });

  it("routes only the exact EQHR travel-acceptance Select to its trusted background driver", () => {
    const evidence = {
      applicationUrl: "https://app.mokahr.com/campus-recruitment/eqhr/39786#/job/job-1/apply",
      label: "是否接受出差",
      semanticKey: "custom.travel_acceptance.combobox",
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "请选择",
      classNames: [
        "sd-Input-input-10L0t",
        "sd-Input-container sd-Select-container-1Eq4x",
        "sd-Dropdown-container-1CigZ"
      ]
    };
    expect(resolveControlAdapter(evidence)).toMatchObject({
      code: "moka.eqhr.travel-acceptance.trusted-focus.v1",
      driver: "site_deterministic",
      requiresForeground: false,
      reason: "eqhr_travel_acceptance_signature"
    });
    expect(resolveControlAdapter({
      ...evidence,
      applicationUrl: "https://app.mokahr.com/campus-recruitment/eqhr/39787#/job/job-1/apply"
    })).toMatchObject({ code: "moka.flat-select.trusted-focus.v1", driver: "site_deterministic" });
  });

  it("routes only the exact Yongxing ethnicity Select to its trusted background driver", () => {
    const evidence = {
      applicationUrl: "https://app.mokahr.com/campus-recruitment/yongxingsec/27127#/job/job-1/apply",
      label: "民族",
      semanticKey: "basic.ethnicity.combobox",
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "请输入民族",
      classNames: [
        "sd-Input-input-3PM8a",
        "sd-Input-container sd-Select-container-7ui5W",
        "sd-Dropdown-container-3gjeL"
      ]
    };
    expect(resolveControlAdapter(evidence)).toMatchObject({
      code: "moka.yongxing.ethnicity.trusted-focus.v1",
      driver: "site_deterministic",
      requiresForeground: false,
      reason: "yongxing_ethnicity_signature"
    });
    expect(resolveControlAdapter({
      ...evidence,
      applicationUrl: evidence.applicationUrl.replace("27127", "27128")
    })).toMatchObject({ code: "moka.flat-select.trusted-focus.v1", driver: "site_deterministic" });
  });

  it.each(["招聘信息获取渠道", "简历渠道"])("routes the Moka source alias %s to the source Driver", (label) => {
    expect(resolveControlAdapter({
      applicationUrl: "https://app.mokahr.com/campus-recruitment/sina/43536#/job/job-1/apply",
      label,
      semanticKey: "other.recruiting_source.combobox",
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "请选择",
      classNames: [
        "sd-Input-input-10L0t",
        "sd-Input-container sd-Select-container-1Eq4x",
        "sd-Dropdown-container-1CigZ"
      ]
    })).toMatchObject({ code: "moka.recruiting-source.trusted-focus.v1" });
  });

  it("serializes malformed DOM signature values without throwing an internal error", () => {
    expect(() => resolveControlAdapter({
      ...base,
      classNames: ["custom-date", 7, null] as unknown as string[],
      ancestorIds: [false, { id: "unexpected" }] as unknown as string[]
    })).not.toThrow();
  });

  it.each([
    {
      label: "证件号码",
      semanticKey: "basic.identity_document_type.combobox",
      code: "moka.sungrow.identity-document-type.trusted-focus.v1",
      reason: "sungrow_identity_document_type_signature"
    },
    {
      label: "有无直系或旁系亲属在本单位（含其他关联公司）任职？",
      semanticKey: "custom.relative_employment.combobox",
      code: "moka.sungrow.relative-employment.trusted-focus.v1",
      reason: "sungrow_relative_employment_signature"
    }
  ])("routes the exact Sungrow $label Select through its dedicated Driver", (input) => {
    const evidence = {
      applicationUrl: "https://app.mokahr.com/campus-recruitment/sungrow/94416#/job/job-1/apply",
      label: input.label,
      semanticKey: input.semanticKey,
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "请选择",
      classNames: [
        "sd-Input-input-10L0t",
        "sd-Input-container sd-Select-container-1Eq4x",
        "sd-Dropdown-container-1CigZ"
      ]
    };
    expect(resolveControlAdapter(evidence)).toMatchObject({
      code: input.code,
      driver: "site_deterministic",
      requiresForeground: false,
      reason: input.reason
    });
    expect(resolveControlAdapter({
      ...evidence,
      applicationUrl: "https://app.mokahr.com/campus-recruitment/sungrow/94417#/job/job-1/apply"
    })).toMatchObject({ code: "moka.flat-select.trusted-focus.v1", driver: "site_deterministic" });
  });

  it.each([
    {
      name: "same custom Select on a non-Moka site",
      applicationUrl: "https://careers.example.com/apply",
      classNames: [
        "sd-Input-input-10L0t",
        "sd-Input-container sd-Select-container-1Eq4x",
        "sd-Dropdown-container-1CigZ"
      ]
    },
    {
      name: "Moka source field without the Select/Dropdown signature",
      applicationUrl: "https://app.mokahr.com/campus-recruitment/canrui/42687#/job/job-1/apply",
      classNames: ["sd-Input-input-10L0t", "plain-input"]
    }
  ])("does not route $name to the recruiting-source driver", (input) => {
    expect(resolveControlAdapter({
      applicationUrl: input.applicationUrl,
      label: "请选择信息来源渠道",
      semanticKey: "basic.recruiting_source.combobox",
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "请选择",
      classNames: input.classNames
    })).toMatchObject({
      code: "unresolved.custom.v1",
      driver: "unsupported"
    });
  });

  it("fails closed when the DeepSeek location field lacks the registered control signature", () => {
    expect(resolveControlAdapter({
      applicationUrl: "https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/job-1/apply",
      label: "意向工作城市",
      semanticKey: "preferences.preferredCity",
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "选择意向工作城市",
      classNames: ["sd-Input-input-10L0t", "unrelated-select"]
    })).toMatchObject({
      code: "unresolved.custom.v1",
      driver: "unsupported",
      registration: null
    });
  });

  it("routes an evidenced Moka readonly dropdown date to the specialized adapter", () => {
    expect(resolveControlAdapter({
      ...base,
      applicationUrl: "https://app.mokahr.com/campus-recruitment/acme/1#/job/2/apply",
      classNames: ["sd-Input-input", "day_info", "sd-Dropdown-container"]
    })).toMatchObject({
      code: "moka.date-picker.trusted-pointer.v9",
      kind: "specialized",
      driver: "site_deterministic",
      requiresForeground: false,
      executionSurface: "background_tab",
      reason: "moka_date_signature",
      diagnostic: {
        schemaVersion: "control-adapter-diagnostic.v1",
        registrationId: "moka.date-picker.trusted-pointer.v9",
        siteCode: "moka",
        siteName: "Moka",
        hostname: "app.mokahr.com",
        fieldName: "毕业时间",
        semanticKey: "education.graduationDate",
        controlType: "custom_date_picker",
        controlName: "Moka 只读日期弹层控件",
        adapterCode: "moka.date-picker.trusted-pointer.v9",
        driver: "site_deterministic",
        requiresForeground: false,
        executionSurface: "background_tab"
      }
    });
  });

  it("routes a structurally evidenced Moka calendar even when the tenant field name is custom", () => {
    expect(resolveControlAdapter({
      ...base,
      applicationUrl: "https://app.mokahr.com/campus-recruitment/acme/1#/job/2/apply",
      label: "自定义周期节点",
      semanticKey: "custom.opaque.native",
      type: "text",
      controlKind: "combobox",
      placeholder: "请选择",
      classNames: ["sd-Input-input", "day_info", "sd-Dropdown-container"]
    })).toMatchObject({
      code: "moka.date-picker.trusted-pointer.v9",
      reason: "moka_date_signature"
    });
    expect(resolveControlAdapter({
      ...base,
      applicationUrl: "https://app.mokahr.com/campus-recruitment/acme/1#/job/2/apply",
      label: "自定义只读下拉",
      semanticKey: "custom.opaque.native",
      type: "text",
      controlKind: "combobox",
      placeholder: "请选择",
      classNames: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container"]
    })).toMatchObject({
      code: "unresolved.custom.v1",
      driver: "unsupported"
    });
  });

  it("records nested calendar containers without changing the Moka background Driver", () => {
    const registration = CONTROL_ADAPTER_REGISTRY.find((entry) =>
      entry.registrationId === "moka.date-picker.trusted-pointer.v9"
    );
    expect(registration).toMatchObject({
      driver: "site_deterministic",
      executionSurface: "background_tab",
      readbackStrategy: "structured_temporal",
      evidence: expect.arrayContaining([
        "nested dropdown and panel-menu wrappers share one control-owned outer visible calendar container; independent popup roots remain ambiguous"
      ])
    });
  });

  it("routes Moka split graduation year and month Selects before the generic combobox", () => {
    const splitSelect = {
      applicationUrl: "https://app.mokahr.com/campus-recruitment/yokagames/41940#/job/job-1/apply",
      label: "教育经历 · 结束时间 · 年",
      semanticKey: "resume.education.0.endDate",
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: true,
      placeholder: "年",
      classNames: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container"]
    };
    expect(resolveControlAdapter(splitSelect)).toMatchObject({
      code: "moka.year-month-select.trusted-pointer.v1",
      kind: "specialized",
      driver: "site_deterministic",
      requiresForeground: false,
      executionSurface: "background_tab",
      reason: "moka_year_month_select_signature"
    });
    expect(resolveControlAdapter({
      ...splitSelect,
      label: "教育经历 · 结束时间 · 月",
      placeholder: "月"
    })).toMatchObject({
      code: "moka.year-month-select.trusted-pointer.v1"
    });
    expect(resolveControlAdapter({
      ...splitSelect,
      applicationUrl: "https://careers.example.com/apply"
    })).not.toMatchObject({ code: "moka.year-month-select.trusted-pointer.v1" });
    expect(resolveControlAdapter({
      ...splitSelect,
      label: "性别",
      semanticKey: "candidate.gender",
      placeholder: "请选择"
    })).not.toMatchObject({ code: "moka.year-month-select.trusted-pointer.v1" });
    expect(resolveControlAdapter({
      ...splitSelect,
      classNames: ["sd-Input-input", "unrelated-control"]
    })).not.toMatchObject({ code: "moka.year-month-select.trusted-pointer.v1" });
  });

  it("routes only the evidenced tap4fun birth-date day grid to its dedicated Driver", () => {
    const tap4funBirthDate = {
      ...base,
      applicationUrl: "https://app.mokahr.com/campus-recruitment/tap4fun/291#/job/job-1/apply",
      label: "出生日期",
      semanticKey: "basic.birth_date.native",
      placeholder: "请选择出生日期",
      classNames: ["sd-Input-input", "day_info", "sd-Dropdown-container"]
    };
    expect(resolveControlAdapter(tap4funBirthDate)).toMatchObject({
      code: "moka.tap4fun.birth-date.trusted-pointer.v2",
      kind: "specialized",
      driver: "site_deterministic",
      requiresForeground: false,
      executionSurface: "background_tab",
      reason: "moka_tap4fun_birth_date_signature"
    });
    expect(resolveControlAdapter({
      ...tap4funBirthDate,
      applicationUrl: "https://app.mokahr.com/campus-recruitment/other/291#/job/job-1/apply"
    })).toMatchObject({ code: "moka.date-picker.trusted-pointer.v9" });
    expect(resolveControlAdapter({
      ...tap4funBirthDate,
      label: "毕业日期",
      semanticKey: "education.graduationDate",
      placeholder: "请选择毕业日期"
    })).toMatchObject({ code: "moka.date-picker.trusted-pointer.v9" });
    expect(resolveControlAdapter({
      ...tap4funBirthDate,
      readOnly: false
    })).not.toMatchObject({ code: "moka.tap4fun.birth-date.trusted-pointer.v2" });
  });

  it("locks the Zuoyebang education end-month field to its exact registered Driver", () => {
    const evidence = {
      ...base,
      applicationUrl: "https://app.mokahr.com/campus-recruitment/zuoyebang/144908#/job/job-1/apply",
      label: "教育背景 · 教育经历 · 结束时间",
      semanticKey: "education.end_date.native profile.education.endDate",
      placeholder: "结束（YYYY/MM）",
      classNames: ["sd-Input-input", "day_info", "sd-Dropdown-container"]
    };
    expect(resolveControlAdapter(evidence)).toMatchObject({
      code: "moka.zuoyebang.education-end-month.trusted-pointer.v1",
      driver: "site_deterministic",
      requiresForeground: false,
      executionSurface: "background_tab",
      readbackStrategy: "structured_temporal",
      reason: "moka_zuoyebang_education_end_month_signature"
    });
    expect(resolveControlAdapter({
      ...evidence,
      applicationUrl: "https://app.mokahr.com/campus-recruitment/other/144908#/job/job-1/apply"
    })).toMatchObject({ code: "moka.date-picker.trusted-pointer.v9" });
    expect(resolveControlAdapter({
      ...evidence,
      semanticKey: "education.start_date.native"
    })).toMatchObject({ code: "moka.date-picker.trusted-pointer.v9" });
    expect(resolveControlAdapter({
      ...evidence,
      placeholder: "结束（YYYY/MM/DD）"
    })).toMatchObject({ code: "moka.date-picker.trusted-pointer.v9" });
  });

  it("routes only an evidenced Moka 籍贯 dropdown to its dedicated driver", () => {
    expect(resolveControlAdapter({
      applicationUrl: "https://app.mokahr.com/campus-recruitment/metax-tech/58131#/job/job-1/apply",
      label: "个人信息 · 籍贯",
      semanticKey: "candidate.basic.nativePlace",
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: true,
      placeholder: "请输入籍贯",
      classNames: [
        "sd-Input-input-10L0t",
        "sd-Input-container",
        "sd-Dropdown-container-1CigZ", "location_info-test"
      ]
    })).toMatchObject({
      code: "moka.native-place.cascader.trusted-pointer.v1",
      kind: "specialized",
      driver: "site_deterministic",
      requiresForeground: false,
      executionSurface: "background_tab",
      diagnostic: {
        registrationId: "moka.native-place.cascader.trusted-pointer.v1",
        fieldName: "个人信息 · 籍贯",
        controlType: "custom_native_place_cascader",
        adapterCode: "moka.native-place.cascader.trusted-pointer.v1"
      }
    });
  });

  it.each([
    {applicationUrl:"https://example.com/apply"},
    {readOnly:false},
    {classNames:["unrelated-cascader"]}
  ])("does not route unrelated custom controls into native-place execution: %j", overrides => {
    expect(resolveControlAdapter({
      applicationUrl:"https://app.mokahr.com/campus-recruitment/jxw/166492#/job/job-1/apply",
      label:"籍贯",semanticKey:"candidate.basic.nativePlace",type:"text",controlKind:"combobox",
      tagName:"INPUT",readOnly:true,placeholder:"请输入籍贯",classNames:["sd-Dropdown-container","location_info-test"],
      ...overrides
    }).code).not.toBe("moka.native-place.cascader.trusted-pointer.v1");
  });

  it("routes the same Moka region component under a different title",()=>{
    expect(resolveControlAdapter({applicationUrl:"https://app.mokahr.com/campus-recruitment/jxw/166492#/job/job-1/apply",
      label:"任意问题",semanticKey:"unknown",type:"text",controlKind:"combobox",tagName:"INPUT",readOnly:true,
      placeholder:"请选择",classNames:["sd-Dropdown-container","location_info-test"]}).code)
      .toBe("moka.native-place.cascader.trusted-pointer.v1");
  });

  it("keeps an editable native date in the generic adapter", () => {
    expect(resolveControlAdapter({
      ...base,
      type: "date",
      controlKind: "native",
      readOnly: false,
      placeholder: ""
    })).toMatchObject({
      code: "generic.native.v1",
      kind: "generic",
      driver: "generic_native",
      requiresForeground: false,
      executionSurface: "background_tab",
      diagnostic: {
        siteName: "example.com",
        fieldName: "毕业时间",
        controlType: "native_temporal_input",
        adapterCode: "generic.native.v1"
      }
    });
  });

  it("routes the evidenced RoboSense referral code to the generic native text driver", () => {
    expect(resolveControlAdapter({
      applicationUrl: "https://app.mokahr.com/campus-recruitment/robosense/141961#/job/job-1/apply",
      label: "申请信息 · 推荐码",
      semanticKey: "job.requiredField.stable:other.referral.native",
      type: "text",
      controlKind: "native",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "推荐码",
      classNames: ["sd-Input-input-10L0t", "string_info-UOJxKN5mtC"]
    })).toMatchObject({
      code: "generic.native.v1",
      kind: "generic",
      driver: "generic_native",
      reason: "native_control",
      diagnostic: {
        registrationId: "generic.native.text.v1",
        fieldName: "申请信息 · 推荐码",
        controlType: "native_text_input",
        adapterCode: "generic.native.v1"
      }
    });
  });

  it("routes the evidenced Moka emergency-contact name only through the native text driver", () => {
    const evidence = {
      applicationUrl: "https://app.mokahr.com/campus-recruitment/tap4fun/291#/job/job-1/apply",
      label: "紧急联系人姓名",
      semanticKey: "job.requiredField.stable:third_party.name.native",
      type: "text",
      controlKind: "native",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "紧急联系人姓名",
      classNames: ["sd-Input-input-emergency", "string_info-emergency"]
    };
    expect(resolveControlAdapter(evidence)).toMatchObject({
      code: "generic.native.v1",
      kind: "generic",
      driver: "generic_native",
      reason: "native_control",
      diagnostic: {
        registrationId: "generic.native.text.v1",
        fieldName: "紧急联系人姓名",
        controlType: "native_text_input"
      }
    });
    expect(resolveControlAdapter({
      ...evidence,
      controlKind: "combobox",
      tagName: "DIV",
      readOnly: true,
      classNames: ["unrelated-custom-control"]
    })).toMatchObject({
      code: "unresolved.custom.v1",
      driver: "unsupported"
    });
  });

  it("rejects a preferred-city instruction targeting an intrinsic referral control", () => {
    expect(resolveControlAdapter({
      applicationUrl: "https://app.mokahr.com/campus-recruitment/robosense/141961#/job/job-1/apply",
      label: "申请信息 · 意向工作城市",
      semanticKey: "job.answers.preferredCity",
      type: "text",
      controlKind: "native",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "推荐码",
      classNames: ["sd-Input-input-10L0t", "string_info-UOJxKN5mtC"]
    })).toMatchObject({
      code: "unresolved.custom.v1",
      driver: "unsupported",
      reason: "field_semantic_conflict",
      diagnostic: {
        registrationId: "unresolved.custom.v1",
        adapterCode: "unresolved.custom.v1",
        reason: "field_semantic_conflict"
      }
    });
  });

  it("does not route a custom referral combobox to the native text driver", () => {
    expect(resolveControlAdapter({
      applicationUrl: "https://careers.example.com/apply",
      label: "推荐码",
      semanticKey: "application.referralCode",
      type: "text",
      controlKind: "combobox",
      tagName: "INPUT",
      readOnly: false,
      placeholder: "推荐码",
      classNames: ["custom-referral-combobox"]
    })).toMatchObject({
      code: "unresolved.custom.v1",
      driver: "unsupported"
    });
  });

  it("fails closed for a readonly custom date without a verified site signature", () => {
    expect(resolveControlAdapter(base)).toMatchObject({
      code: "unresolved.custom.v1",
      kind: "unresolved",
      driver: "unsupported",
      reason: "custom_control_without_adapter",
      registration: null,
      diagnostic: {
        siteName: "example.com",
        fieldName: "毕业时间",
        controlType: "unresolved_control",
        controlName: "未识别控件",
        adapterCode: "unresolved.custom.v1"
      }
    });
  });

  it("does not route an unrelated Moka dropdown from domain evidence alone", () => {
    expect(resolveControlAdapter({
      ...base,
      applicationUrl: "https://app.mokahr.com/campus-recruitment/acme/1#/job/2/apply",
      label: "能否提前实习",
      semanticKey: "availability.earlyInternship",
      controlKind: "combobox",
      placeholder: "请选择",
      classNames: ["sd-Input-input", "sd-Dropdown-container"]
    })).toMatchObject({
      code: "unresolved.custom.v1",
      kind: "unresolved",
      diagnostic: {
        siteCode: "moka",
        siteName: "Moka",
        fieldName: "能否提前实习",
        controlType: "unresolved_control"
      }
    });
  });

  it.each([
    {
      name: "real Moka readonly date",
      evidence: {
        ...base,
        applicationUrl: "https://app.mokahr.com/campus-recruitment/acme/1#/job/2/apply",
        classNames: ["day_info", "sd-Dropdown-container"]
      },
      code: "moka.date-picker.trusted-pointer.v9",
      driver: "site_deterministic"
    },
    {
      name: "local Moka evidence fixture",
      evidence: {
        ...base,
        applicationUrl: "http://localhost/__recruiting_ai_test__/moka",
        classNames: ["picker-addon", "sd-Dropdown-container"]
      },
      code: "moka.date-picker.trusted-pointer.v9",
      driver: "site_deterministic"
    },
    ...(["date", "month", "datetime-local"] as const).map((type) => ({
      name: `cross-site native ${type}`,
      evidence: {
        ...base,
        applicationUrl: "https://unrelated.example/apply",
        type,
        controlKind: "native",
        readOnly: false,
        placeholder: "",
        classNames: []
      },
      code: "generic.native.v1",
      driver: "generic_native"
    })),
    {
      name: "Moka non-date dropdown",
      evidence: {
        ...base,
        applicationUrl: "https://app.mokahr.com/campus-recruitment/acme/1#/job/2/apply",
        label: "能否提前实习",
        semanticKey: "availability.earlyInternship",
        controlKind: "combobox",
        placeholder: "请选择",
        classNames: ["sd-Dropdown-container"]
      },
      code: "unresolved.custom.v1",
      driver: "unsupported"
    },
    {
      name: "Moka date without the registered DOM signature",
      evidence: {
        ...base,
        applicationUrl: "https://app.mokahr.com/campus-recruitment/acme/1#/job/2/apply",
        classNames: ["some-other-calendar"]
      },
      code: "unresolved.custom.v1",
      driver: "unsupported"
    },
    {
      name: "unrelated site copying Moka classes",
      evidence: {
        ...base,
        applicationUrl: "https://unrelated.example/apply",
        classNames: ["day_info", "sd-Dropdown-container"]
      },
      code: "unresolved.custom.v1",
      driver: "unsupported"
    }
  ])("preserves the registered route for $name", ({ evidence, code, driver }) => {
    expect(resolveControlAdapter(evidence)).toMatchObject({ code, driver });
  });
});
