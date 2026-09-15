import { describe, expect, it } from "vitest";
import type { PageFieldObservation, PageObservation } from "./page-adapter.js";
import { resolveControlAdapter } from "./control-adapters/registry.js";
import { evidenceForField } from "./control-adapters/field-routing.js";
import {
  authoritativeCandidateFactForField,
  candidateBlockingRequiredFieldFailures,
  candidateInformationRequestForField,
  candidateInformationRequestForUnavailableOptions,
  candidateInformationRequestsForFields,
  candidateInformationRequestsForMissingFields,
  classifyVisualFailureReason,
  confirmedCurrentJobFactForField,
  deterministicKnownFactActions,
  enrichVisionCandidateFacts,
  findDynamicReadbackField,
  isThirdPartyPersonField,
  isVisionValueTraceable,
  iterativeVisionPolicy,
  isMokaAuthenticityDeclarationField,
  isPhoneCallingCodeField,
  phoneCallingCodeReadbackMatches,
  nextDeterministicKnownFactAction,
  optionalFieldEnrichmentPending,
  registerVisionFieldAttempt,
  soleRequiredMokaPreferredCityOption,
  thirdPartyIdentityCollision,
  visionPlanningObservation,
  visualFailureDetails,
  visualFieldFailureBlocksSubmission,
  visionFormReadyForFinalReview,
  visionObservationStateFingerprint,
  visualSemanticConflict,
  visionReadbackMatches
} from "./vision-form-runtime.js";

function field(input: Partial<PageFieldObservation> = {}): PageFieldObservation {
  return {
    fieldId: "field-1",
    stableFieldKey: "basic.first_work_start_year.native",
    selector: "#year",
    label: "基本信息 · 开始工作年月 · 年",
    sectionKey: "basic",
    groupIndex: null,
    labelPath: ["开始工作年月", "年"],
    controlKind: "native",
    // Tests override this base field for names, cities, degrees, etc. Do not
    // accidentally give every unrelated control a year-only placeholder.
    domHints: { name: null, dataFieldName: null, dataFieldId: null, placeholder: null, ariaControls: null, ariaOwns: null, ariaLabel: null, testId: null },
    popupBinding: null,
    type: "text",
    required: true,
    options: [],
    currentValue: "",
    ...input
  };
}

function observation(fields: PageFieldObservation[]): PageObservation {
  return {
    url: "https://app.mokahr.com/example/apply",
    title: "Moka",
    loginRequired: false,
    loginReason: null,
    formDetected: true,
    fingerprint: "fnv1a-test",
    fields,
    actions: [],
    submitCandidates: [],
    validationMessages: [],
    transientBusy: false,
    observedAt: new Date(0).toISOString()
  };
}

describe("visual form runtime", () => {
  const zuoyebangGraduationDay = () => field({
    fieldId: "field-20",
    stableFieldKey: "education.end_date.native",
    label: "教育背景 · 教育经历 · 结束时间",
    sectionKey: "education",
    type: "text",
    controlKind: "native",
    domHints: {
      placeholder: "日期（年月日）",
      classNames: ["day_info", "sd-Dropdown-container-1CigZ"]
    }
  });

  it("returns missing date information instead of planning the failed Zuoyebang month-only fill", () => {
    const date = zuoyebangGraduationDay();
    const facts = { "resume.education.0.endDate": "2026-06" };
    expect(authoritativeCandidateFactForField(date, facts)).toBeNull();
    expect(deterministicKnownFactActions(observation([date]), facts)).toEqual([]);
    expect(nextDeterministicKnownFactAction(observation([date]), facts)).toBeNull();
    expect(candidateInformationRequestsForMissingFields([date], facts)).toEqual([
      expect.objectContaining({
        fieldId: "field-20",
        stableFieldKey: "education.end_date.native",
        reasonCode: "candidate_information_missing",
        type: "date",
        controlKind: "date",
        question: expect.stringContaining("完整日期（年、月、日）")
      })
    ]);
  });

  it("accepts a complete confirmed date without borrowing or inventing the missing day", () => {
    const date = zuoyebangGraduationDay();
    const facts = {
      "resume.education.0.endDate": "2026-06",
      "job.requiredField.stable:education.end_date.native": "2026-06-30"
    };
    expect(deterministicKnownFactActions(observation([date]), facts)).toEqual([
      expect.objectContaining({ value: "2026-06-30", semanticKey: "job.requiredField.stable:education.end_date.native" })
    ]);
    expect(candidateInformationRequestsForMissingFields([date], facts)).toEqual([]);
  });

  it("uses an explicit complete graduation fact when the education end month is insufficient", () => {
    expect(authoritativeCandidateFactForField(zuoyebangGraduationDay(), {
      "resume.education.0.endDate": "2026-06",
      "resume.education.0.graduationDate": "2026-06-30"
    })).toEqual({ key: "resume.education.0.graduationDate", value: "2026-06-30" });
  });

  it.each(["2026-06", "2026-02-30"])("does not execute an incomplete or invalid confirmed date: %s", value => {
    const date = zuoyebangGraduationDay();
    const facts = { "job.requiredField.stable:education.end_date.native": value };
    expect(confirmedCurrentJobFactForField(date, facts)).toBeNull();
    expect(deterministicKnownFactActions(observation([date]), facts)).toEqual([]);
    expect(candidateInformationRequestsForMissingFields([date], facts)).toHaveLength(1);
    const optional = { ...date, required: false };
    expect(deterministicKnownFactActions(observation([optional]), facts)).toEqual([]);
    expect(candidateInformationRequestsForMissingFields([optional], facts)).toEqual([]);
  });

  it("does not change month-only controls, split year/month fields, or ordinary dropdowns", () => {
    const date = zuoyebangGraduationDay();
    const month = { ...date, domHints: { placeholder: "结束（YYYY/MM）" } };
    const facts = { "resume.education.0.endDate": "2026-06" };
    expect(deterministicKnownFactActions(observation([month]), facts)).toHaveLength(1);
    expect(candidateInformationRequestsForMissingFields([month], facts)).toEqual([]);
    const choice = field({ type: "combobox", options: ["2026-06"], domHints: { placeholder: "请选择" } });
    expect(confirmedCurrentJobFactForField(choice, {
      [`job.requiredField.stable:${choice.stableFieldKey}`]: "2026-06"
    })).not.toBeNull();
  });

  it("treats one live required Moka work-city leaf as a page-constrained value", () => {
    const city = field({
      fieldId: "preferred-city",
      stableFieldKey: "application.preferred_city.combobox",
      label: "申请信息 · 意向工作城市",
      type: "combobox",
      controlKind: "combobox",
      options: ["上海市", "上海市"]
    });

    expect(soleRequiredMokaPreferredCityOption(city)).toBe("上海市");
    expect(soleRequiredMokaPreferredCityOption({ ...city, options: ["南京市", "上海市"] })).toBeNull();
    expect(soleRequiredMokaPreferredCityOption({ ...city, required: false })).toBeNull();
    expect(soleRequiredMokaPreferredCityOption({ ...city, currentValue: "上海市" })).toBeNull();
  });

  it("turns a required live option mismatch into a concrete user choice request", () => {
    const city = field({
      stableFieldKey: "intention.preferred_city.custom",
      label: "意向工作城市",
      sectionKey: "intention",
      controlKind: "combobox",
      options: []
    });

    expect(candidateInformationRequestForUnavailableOptions(
      city,
      "深圳市",
      ["北京市", "杭州市", "北京市"]
    )).toMatchObject({
      label: "意向工作城市",
      reasonCode: "candidate_information_missing",
      options: ["北京市", "杭州市"],
      description: "信息包中的“深圳市”不在招聘页面当前有效选项中；插件未尝试键盘输入或猜测近似选项。",
      question: "招聘表单必填“意向工作城市”，当前“深圳市”不可用，可选项为：北京市 / 杭州市。请选择一项。"
    });
  });

  it("does not block an optional field or classify an unknown option surface as unavailable", () => {
    const optionalCity = field({
      label: "意向工作城市",
      required: false,
      controlKind: "combobox"
    });
    expect(candidateInformationRequestForUnavailableOptions(
      optionalCity,
      "深圳市",
      ["北京市", "杭州市"]
    )).toBeNull();
    expect(candidateInformationRequestForUnavailableOptions(
      { ...optionalCity, required: true },
      "深圳市",
      []
    )).toBeNull();
    expect(candidateInformationRequestForUnavailableOptions(
      { ...optionalCity, required: true },
      "北京市",
      ["北京市", "杭州市"]
    )).toBeNull();
  });

  it("retains the same live ATSX Driver proof when returning unavailable options", () => {
    const gender = field({fieldId: "field-7", stableFieldKey: "basic.gender.combobox", label: "基本信息 · 性别",
      type: "combobox", controlKind: "combobox", controlApplicationUrl: "https://example.jobs.feishu.cn/900011/resume/123/apply",
      fieldSource: {dialect: "feishu_atsx", fieldPath: "gender", moduleId: null, groupIndex: null},
      domHints: {tagName: "DIV", inputType: "combobox", readOnly: false,
        classNames: ["atsx-select-selection--single", "atsx-select", "atsx-form-item"]}});
    const diagnostic = resolveControlAdapter(evidenceForField({url: gender.controlApplicationUrl!},
      {...gender, observedControlKind: "atsx_flat"})).diagnostic;
    expect(diagnostic.adapterCode).toBe("feishu.atsx-flat-select.trusted-pointer.v1");
    const result = {fieldId: gender.fieldId, controlAdapter: diagnostic};
    expect(candidateInformationRequestForUnavailableOptions(gender, "男 / Male", ["男", "女", "保密"], result))
      .toMatchObject({fieldId: "field-7", stableFieldKey: gender.stableFieldKey, type: "combobox", options: ["男", "女", "保密"]});
    expect(gender.observedControlKind).toBeUndefined();
    for (const invalid of [undefined, {...result, fieldId: "field-8"},
      {...result, controlAdapter: {...diagnostic, semanticKey: "education[1].gender.combobox"}},
      {...result, controlAdapter: {...diagnostic, fieldName: "学历"}},
      {...result, controlAdapter: {...diagnostic, registrationId: "unrelated"}}]) {
      expect(() => candidateInformationRequestForUnavailableOptions(gender, "男 / Male", ["男", "女", "保密"], invalid)).toThrow();
    }
    expect(() => candidateInformationRequestForUnavailableOptions({...gender,
      domHints: {...gender.domHints, classNames: ["unrelated-select"]}}, "男 / Male", ["男", "女"], result)).toThrow();
  });

  it("derives one candidate-level first-work month and highest degree", () => {
    const facts = enrichVisionCandidateFacts({
      candidate: {
        educations: [{ degree: "本科" }, { degree: "硕士" }],
        workExperiences: [
          { company: "B", startDate: "2023-03" },
          { company: "A", startDate: "2021年7月" }
        ]
      }
    }, {
      "resume.work.0.startDate": "2021年7月",
      "resume.work.1.startDate": "2023-03"
    });

    expect(facts["candidate.basic.highestDegree"]).toBe("硕士");
    expect(facts["candidate.basic.firstWorkStartDate"]).toBe("2021-07");
    expect(facts["candidate.basic.firstWorkStartYear"]).toBe("2021");
    expect(facts["candidate.basic.firstWorkStartMonth"]).toBe("7");
  });

  it("promotes package identity fields to authoritative candidate aliases", () => {
    const facts = enrichVisionCandidateFacts({
      candidate: {
        basic: {
          fullName: "周测试",
          phone: "13900000001",
          email: "zhou.test@example.com",
          currentCity: "深圳",
          birthDate: "2000-03-18"
        }
      }
    }, {
      "resume.basic.0.fullName": "旧解析姓名",
      "basic.fullName": "旧字段事实"
    });

    expect(facts).toMatchObject({
      "candidate.basic.fullName": "周测试",
      "candidate.basic.phone": "13900000001",
      "candidate.basic.email": "zhou.test@example.com",
      "candidate.basic.currentCity": "深圳",
      "candidate.basic.birthDate": "2000-03-18"
    });
    expect(facts["basic.fullName"]).toBe("周测试");
  });

  it("maps and verifies the bilingual Moka birth-date month control", () => {
    const birthDate = field({
      fieldId: "birth-date",
      stableFieldKey: "basic.birth_date.native",
      label: "出生日期 (年龄) / Birth Date (Age)",
      sectionKey: "basic",
      type: "text",
      controlKind: "native"
    });
    const facts = { "candidate.basic.birthDate": "2000-03-18" };

    expect(authoritativeCandidateFactForField(birthDate, facts)).toEqual({
      key: "candidate.basic.birthDate",
      value: "2000-03-18"
    });
    expect(candidateInformationRequestsForMissingFields([birthDate], facts)).toEqual([]);
    expect(visionReadbackMatches({
      ...birthDate,
      currentValue: "2000-03 (26岁 / Years old)"
    }, "2000-03-18")).toBe(true);
  });

  it("uses the job-confirmed city ahead of broad resume preferences", () => {
    const facts = enrichVisionCandidateFacts({
      candidate: {
        preferences: { preferredCities: ["深圳", "广州"] }
      }
    }, {}, {
      answers: {
        preferredCity: {
          value: "北京市",
          source: "user_confirmed",
          confirmedAt: "2026-08-23T00:00:00.000Z"
        }
      }
    });
    const city = field({
      fieldId: "field-city",
      stableFieldKey: "application.preferred_city.combobox",
      label: "申请信息 · 意向工作城市",
      type: "combobox",
      controlKind: "combobox",
      options: ["北京", "杭州"],
      currentValue: "北京"
    });
    expect(facts["job.answers.preferredCity"]).toBe("北京市");
    expect(authoritativeCandidateFactForField(city, facts)).toEqual({
      key: "job.answers.preferredCity",
      value: "北京市"
    });
    expect(visionReadbackMatches(city, "北京市")).toBe(true);
    expect(isVisionValueTraceable(facts, "北京")).toBe(true);
  });

  it("does not treat a historical job location inference as a candidate city preference", () => {
    const facts = enrichVisionCandidateFacts({}, {}, {
      answers: {
        preferredCity: {
          value: "上海市",
          source: "confirmed_single_job_location",
          confirmedAt: "2026-09-02T00:00:00.000Z"
        }
      }
    });
    const city = field({
      fieldId: "field-city",
      stableFieldKey: "intention.preferred_city.native#0",
      label: "求职意向 · 期望城市",
      required: false,
      currentValue: ""
    });

    expect(facts["job.answers.preferredCity"]).toBeUndefined();
    expect(authoritativeCandidateFactForField(city, facts)).toBeNull();
    expect(deterministicKnownFactActions(observation([city]), facts)).toEqual([]);
  });

  it("accepts an optional native Moka city when fresh page readback matches", () => {
    const city = field({
      fieldId: "field-city",
      stableFieldKey: "intention.preferred_city.native#0",
      label: "求职意向 · 期望城市",
      type: "text",
      controlKind: "native",
      required: false,
      currentValue: "上海市"
    });

    expect(visionReadbackMatches(city, "上海市")).toBe(true);
  });

  it("keeps a current recruitment-page option exact instead of accepting a substring", () => {
    const source = field({
      fieldId: "field-source",
      stableFieldKey: "basic.recruiting_source.combobox",
      label: "招聘信息来源",
      type: "combobox",
      controlKind: "combobox",
      currentValue: "校园招聘"
    });

    expect(visionReadbackMatches(
      source,
      "校园",
      "job.requiredField.stable:basic.recruiting_source.combobox"
    )).toBe(false);
    expect(visionReadbackMatches(
      source,
      "校园招聘",
      "job.requiredField.stable:basic.recruiting_source.combobox"
    )).toBe(true);
  });

  it("accepts Moka native-place display aliases after the specialized driver commits", () => {
    const nativePlace = field({
      fieldId: "field-native-place",
      stableFieldKey: "basic.native_place.native",
      label: "籍贯",
      type: "text",
      controlKind: "native",
      currentValue: "内蒙古 包头市 东河区"
    });

    expect(visionReadbackMatches(nativePlace, "内蒙古自治区包头市东河区")).toBe(true);
    expect(visionReadbackMatches(nativePlace, "内蒙古自治区呼和浩特市新城区")).toBe(false);
  });

  it("never reuses a preferred-city fact for a referral control", () => {
    const facts = { "job.answers.preferredCity": "深圳市" };
    const referral = field({
      fieldId: "referral-code",
      stableFieldKey: "intention.preferred_city.native",
      label: "申请信息 · 意向工作城市",
      required: false,
      domHints: {
        name: null,
        dataFieldName: null,
        dataFieldId: null,
        placeholder: "推荐码",
        ariaControls: null,
        ariaOwns: null,
        ariaLabel: null,
        testId: null
      }
    });

    expect(authoritativeCandidateFactForField(referral, facts)).toBeNull();
    expect(deterministicKnownFactActions(observation([referral]), facts)).toEqual([]);
    expect(visualSemanticConflict(referral)).toMatch(/推荐\/内推字段与城市稳定语义冲突/);
    expect(authoritativeCandidateFactForField(referral, {
      ...facts,
      "job.requiredField.stable:intention.preferred_city.native": "REF-123"
    })).toEqual({
      key: "job.requiredField.stable:intention.preferred_city.native",
      value: "REF-123"
    });
  });

  it("binds an AI-side required-field answer back to the exact page field", () => {
    const facts = enrichVisionCandidateFacts({ candidate: {} }, {}, {
      requiredFieldAnswers: [{
        fieldId: "gender",
        stableFieldKey: "basic.gender.combobox",
        value: "女",
        source: "user_confirmed",
        answeredAt: "2026-08-25T06:00:00.000Z"
      }]
    });
    const gender = field({
      fieldId: "gender",
      stableFieldKey: "basic.gender.combobox",
      label: "个人信息 · 性别",
      type: "combobox",
      controlKind: "combobox",
      options: ["男", "女"]
    });

    expect(authoritativeCandidateFactForField(gender, facts)).toEqual({
      key: "job.requiredField.stable:basic.gender.combobox",
      value: "女"
    });
    expect(deterministicKnownFactActions(observation([gender]), facts)).toEqual([
      expect.objectContaining({
        type: "select_option",
        fieldId: "gender",
        value: "女"
      })
    ]);
    expect(facts["job.requiredField.field:gender"]).toBeUndefined();
  });

  it("never reuses an ordinal answer for a different stable field after xTool rebuilds", () => {
    const recycledMajor = field({
      fieldId: "field-30",
      stableFieldKey: "education[0].major.native",
      label: "教育经历 · 专业",
      sectionKey: "education",
      groupIndex: 0,
      currentValue: ""
    });
    const legacyFacts = { "job.requiredField.field:field-30": "无" };

    expect(authoritativeCandidateFactForField(recycledMajor, legacyFacts)).toBeNull();
    expect(deterministicKnownFactActions(observation([recycledMajor]), legacyFacts)).toEqual([]);

    const legacyFieldWithoutStableIdentity = { ...recycledMajor, stableFieldKey: undefined };
    expect(authoritativeCandidateFactForField(legacyFieldWithoutStableIdentity, legacyFacts)).toEqual({
      key: "job.requiredField.field:field-30",
      value: "无"
    });
  });

  it("reuses a persisted application-profile fact without mixing it into the resume package", () => {
    const facts = enrichVisionCandidateFacts({ candidate: {} }, {}, {
      applicationUrl: "https://app.mokahr.com/example/apply"
    }, {
      schemaVersion: "candidate-application-profile.v1",
      revision: "a".repeat(64),
      facts: [{
        schemaVersion: "candidate-application-profile-fact.v1",
        semanticKey: "candidate.current_position",
        stableFieldKeys: ["basic.current_position.input"],
        label: "个人信息 · 目前职位",
        normalizedLabel: "个人信息目前职位",
        controlType: "text",
        observedSites: ["app.mokahr.com"],
        value: "产品经理",
        source: "user_confirmed",
        confirmedAt: "2026-08-30T06:00:00.000Z",
        updatedAt: "2026-08-30T06:00:00.000Z"
      }]
    });
    const currentPosition = field({
      fieldId: "current-position",
      stableFieldKey: "basic.current_position.input",
      label: "个人信息 · 目前职位",
      type: "text"
    });

    expect(authoritativeCandidateFactForField(currentPosition, facts)).toEqual({
      key: "profile.requiredField.stableLabel:basic.current_position.input:个人信息目前职位",
      value: "产品经理"
    });
  });

  it("rejects a cross-job stable-key collision between school region and school name", () => {
    const facts = enrichVisionCandidateFacts({}, {
      "resume.education.0.school": "广东海洋大学"
    }, {}, {
      facts: [{
        schemaVersion: "candidate-application-profile-fact.v1",
        semanticKey: "candidate.school_region",
        stableFieldKeys: ["education.school.combobox"],
        label: "院校所在地区",
        normalizedLabel: "院校所在地区",
        observedSites: ["app.mokahr.com"],
        value: "海外院校",
        source: "user_confirmed"
      }]
    });
    const school = field({
      fieldId: "field-17",
      stableFieldKey: "education.school.combobox",
      label: "教育背景 · 学校名称",
      labelPath: ["教育背景", "学校名称"],
      sectionKey: "education",
      type: "combobox",
      controlKind: "combobox",
      currentValue: "广东海洋大学"
    });

    expect(facts["profile.requiredField.stable:education.school.combobox"]).toBeUndefined();
    expect(facts["profile.requiredField.stableLabel:education.school.combobox:院校所在地区"]).toBe("海外院校");
    expect(authoritativeCandidateFactForField(school, facts)).toEqual({
      key: "resume.education.0.school",
      value: "广东海洋大学"
    });
    expect(deterministicKnownFactActions(observation([school]), facts)).toEqual([]);
  });

  it("reuses a cross-job stable-key fact only when its visible field label also matches", () => {
    const facts = enrichVisionCandidateFacts({}, {}, {}, {
      facts: [{
        schemaVersion: "candidate-application-profile-fact.v1",
        stableFieldKeys: ["education.school.combobox"],
        label: "教育背景 · 学校名称",
        normalizedLabel: "教育背景学校名称",
        observedSites: ["app.mokahr.com"],
        value: "广东海洋大学",
        source: "user_confirmed"
      }]
    });
    const school = field({
      fieldId: "school-name",
      stableFieldKey: "education.school.combobox",
      label: "学校名称",
      labelPath: ["教育背景", "学校名称"],
      sectionKey: "education",
      type: "combobox",
      controlKind: "combobox"
    });

    expect(authoritativeCandidateFactForField(school, facts)).toEqual({
      key: "profile.requiredField.stableLabel:education.school.combobox:学校名称",
      value: "广东海洋大学"
    });
  });

  it("reuses an information-pool fact on a different recruiting site", () => {
    const profile = {
      facts: [{
        schemaVersion: "candidate-application-profile-fact.v1",
        semanticKey: "candidate.teacher_qualification",
        stableFieldKeys: ["custom.teacher_certificate.combobox"],
        label: "是否有教师资格证",
        normalizedLabel: "是否有教师资格证",
        observedSites: ["app.mokahr.com"],
        value: "否",
        source: "user_confirmed",
        confirmedAt: "2026-08-30T06:00:00.000Z",
        updatedAt: "2026-08-30T06:00:00.000Z"
      }]
    };
    const matching = enrichVisionCandidateFacts({}, {}, {
      applicationUrl: "https://app.mokahr.com/example/apply"
    }, profile);
    const different = enrichVisionCandidateFacts({}, {}, {
      applicationUrl: "https://jobs.example.com/apply"
    }, profile);

    expect(matching["profile.requiredField.stableLabel:custom.teacher_certificate.combobox:是否有教师资格证"]).toBe("否");
    expect(different["profile.requiredField.stableLabel:custom.teacher_certificate.combobox:是否有教师资格证"]).toBe("否");
    expect(authoritativeCandidateFactForField(field({
      fieldId: "teacher-certificate-b",
      stableFieldKey: "candidate.teacherQualification.radio",
      label: "是否持有教师资格证",
      type: "radio",
      options: ["是", "否"]
    }), different)).toEqual({
      key: "profile.semantic:candidate.teacher_qualification",
      value: "否"
    });
  });

  it("does not autofill an information-pool choice when the target options reject its value", () => {
    const facts = enrichVisionCandidateFacts({}, {}, {}, {
      facts: [{
        semanticKey: "candidate.teacher_qualification",
        stableFieldKeys: [], label: "是否有教师资格证", normalizedLabel: "是否有教师资格证",
        observedSites: ["app.mokahr.com"], value: "否", source: "user_confirmed"
      }]
    });
    const incompatible = field({
      fieldId: "teacher-certificate",
      label: "是否持有教师资格证",
      type: "select",
      options: ["持有且有效", "正在办理"]
    });

    expect(authoritativeCandidateFactForField(incompatible, facts)).toBeNull();
  });

  it("lets the current job answer override a persisted profile fact", () => {
    const facts = enrichVisionCandidateFacts({}, {}, {
      applicationUrl: "https://app.mokahr.com/example/apply",
      requiredFieldAnswers: [{
        fieldId: "gender", stableFieldKey: "basic.gender.combobox", value: "男",
        source: "user_confirmed", answeredAt: "2026-08-30T07:00:00.000Z"
      }]
    }, {
      facts: [{
        stableFieldKeys: ["basic.gender.combobox"], label: "性别", normalizedLabel: "性别",
        semanticKey: "candidate.gender", observedSites: ["app.mokahr.com"], value: "女", source: "user_confirmed"
      }]
    });
    const gender = field({
      fieldId: "gender", stableFieldKey: "basic.gender.combobox", label: "性别", type: "combobox"
    });

    expect(authoritativeCandidateFactForField(gender, facts)).toEqual({
      key: "job.requiredField.stable:basic.gender.combobox",
      value: "男"
    });
  });

  it("does not reuse candidate highest degree for a plain degree field in another section", () => {
    const highest = field({
      fieldId: "highest-degree",
      stableFieldKey: "education.highest_degree.combobox",
      label: "个人信息 · 最高学历",
      type: "combobox",
      controlKind: "combobox"
    });
    const workDegree = field({
      fieldId: "work-degree",
      stableFieldKey: "work.degree.combobox",
      label: "工作经历 · 学历",
      sectionKey: "work",
      type: "combobox",
      controlKind: "combobox"
    });
    const facts = { "candidate.basic.highestDegree": "本科" };

    expect(authoritativeCandidateFactForField(highest, facts)).toEqual({
      key: "candidate.basic.highestDegree",
      value: "本科"
    });
    expect(authoritativeCandidateFactForField(workDegree, facts)).toBeNull();
    expect(deterministicKnownFactActions(observation([workDegree]), facts)).toEqual([]);
  });

  it("turns missing user-specific required facts into a concrete information request", () => {
    const gender = field({
      fieldId: "gender",
      stableFieldKey: "basic.gender.combobox",
      label: "个人信息 · 性别",
      type: "combobox",
      controlKind: "combobox",
      options: ["男", "女"]
    });

    expect(candidateInformationRequestForField(gender)).toEqual({
      schemaVersion: "required-field-request.v1",
      fieldId: "gender",
      stableFieldKey: "basic.gender.combobox",
      label: "个人信息 · 性别",
      sectionKey: "basic",
      groupIndex: null,
      type: "combobox",
      controlKind: "combobox",
      inputKind: "select",
      required: true,
      reasonCode: "candidate_information_missing",
      description: "该字段为招聘页面必填选择项，必须使用页面当前提供的有效选项；AI 侧应向用户确认，不能自行猜测。",
      question: "招聘表单必填“个人信息 · 性别”，可选项为：男 / 女。请选择一项。",
      options: ["男", "女"]
    });
  });

  it("returns all missing candidate required fields in one request array", () => {
    const missing = [
      field({
        fieldId: "gender",
        stableFieldKey: "basic.gender.combobox",
        label: "性别",
        type: "combobox",
        controlKind: "combobox",
        options: ["男", "女"]
      }),
      field({
        fieldId: "source",
        stableFieldKey: "basic.recruiting_source.combobox",
        label: "招聘信息来源",
        type: "combobox",
        controlKind: "combobox",
        options: ["校园宣讲会", "招聘网站"]
      }),
      field({
        fieldId: "privacy",
        stableFieldKey: "basic.privacy.checkbox",
        label: "同意隐私协议",
        type: "checkbox",
        controlKind: "checkbox"
      })
    ];

    expect(candidateInformationRequestsForFields(missing)).toEqual([
      expect.objectContaining({ fieldId: "gender", options: ["男", "女"] }),
      expect.objectContaining({ fieldId: "source", options: ["校园宣讲会", "招聘网站"] })
    ]);
  });

  it("returns all required relation-person fields without borrowing candidate identity", () => {
    const relationFields = [
      field({
        fieldId: "relation-name",
        stableFieldKey: "relation[0].name.native",
        label: "与公司员工是否有亲属关系（如有） · 姓名",
        sectionKey: "relation"
      }),
      field({
        fieldId: "relation-department-position",
        stableFieldKey: "relation[0].department_position.native",
        label: "与公司员工是否有亲属关系（如有） · 部门/职位",
        sectionKey: "relation"
      }),
      field({
        fieldId: "relation-relationship",
        stableFieldKey: "relation[0].relationship.native",
        label: "与公司员工是否有亲属关系（如有） · 与本人关系",
        sectionKey: "relation"
      })
    ];
    const facts = {
      "candidate.basic.fullName": "候选人本人",
      "candidate.basic.positionTitle": "候选人职位"
    };

    expect(relationFields.map((item) => authoritativeCandidateFactForField(item, facts)))
      .toEqual([null, null, null]);
    expect(candidateInformationRequestsForMissingFields(relationFields, facts)).toEqual([
      expect.objectContaining({
        fieldId: "relation-name",
        label: "与公司员工是否有亲属关系（如有） · 姓名",
        reasonCode: "candidate_information_missing"
      }),
      expect.objectContaining({
        fieldId: "relation-department-position",
        label: "与公司员工是否有亲属关系（如有） · 部门/职位"
      }),
      expect.objectContaining({
        fieldId: "relation-relationship",
        label: "与公司员工是否有亲属关系（如有） · 与本人关系"
      })
    ]);
    expect(candidateInformationRequestForField({ ...relationFields[0]!, required: false })).toBeNull();
  });

  it("returns every required emergency-contact field without borrowing candidate identity", () => {
    const emergencyFields = [
      field({
        fieldId: "emergency-name",
        stableFieldKey: "third_party.name.native",
        label: "紧急联系人姓名",
        sectionKey: "third_party"
      }),
      field({
        fieldId: "emergency-relationship",
        stableFieldKey: "third_party.relationship.combobox",
        label: "紧急联系人与你的关系",
        sectionKey: "third_party",
        type: "combobox",
        controlKind: "combobox",
        options: ["父母", "配偶", "其他"]
      }),
      field({
        fieldId: "emergency-phone",
        stableFieldKey: "third_party.phone.native",
        label: "紧急联系人电话号码",
        sectionKey: "third_party"
      })
    ];
    const facts = {
      "candidate.basic.fullName": "候选人本人",
      "candidate.basic.phone": "13900000000"
    };

    expect(emergencyFields.every(isThirdPartyPersonField)).toBe(true);
    expect(emergencyFields.map((item) => authoritativeCandidateFactForField(item, facts)))
      .toEqual([null, null, null]);
    expect(deterministicKnownFactActions(observation(emergencyFields), facts)).toEqual([]);
    expect(candidateInformationRequestsForMissingFields(emergencyFields, facts)).toEqual([
      expect.objectContaining({ fieldId: "emergency-name", label: "紧急联系人姓名" }),
      expect.objectContaining({
        fieldId: "emergency-relationship",
        label: "紧急联系人与你的关系",
        options: ["父母", "配偶", "其他"]
      }),
      expect.objectContaining({ fieldId: "emergency-phone", label: "紧急联系人电话号码" })
    ]);
  });

  it("turns an old candidate-name copy in a required emergency field back into missing information", () => {
    const emergencyName = field({
      fieldId: "emergency-name",
      stableFieldKey: "third_party.name.native",
      label: "紧急联系人姓名",
      sectionKey: "third_party",
      currentValue: "候选人本人"
    });
    const facts = { "candidate.basic.fullName": "候选人本人" };

    expect(thirdPartyIdentityCollision(emergencyName, facts)).toBe(true);
    expect(candidateBlockingRequiredFieldFailures([emergencyName], facts)).toEqual([emergencyName]);
    expect(candidateInformationRequestsForMissingFields([emergencyName], facts)).toEqual([
      expect.objectContaining({ fieldId: "emergency-name", label: "紧急联系人姓名" })
    ]);
    expect(deterministicKnownFactActions(observation([emergencyName]), facts)).toEqual([]);
  });

  it("uses an exact supplemental emergency-contact answer and preserves unrelated manual values", () => {
    const pollutedEmergencyName = field({
      fieldId: "emergency-name",
      stableFieldKey: "third_party.name.native",
      label: "紧急联系人姓名",
      sectionKey: "third_party",
      currentValue: "候选人本人"
    });
    const confirmedFacts = {
      "candidate.basic.fullName": "候选人本人",
      "job.requiredField.stable:third_party.name.native": "王女士"
    };
    expect(thirdPartyIdentityCollision(pollutedEmergencyName, confirmedFacts)).toBe(false);
    expect(candidateInformationRequestsForMissingFields([pollutedEmergencyName], confirmedFacts)).toEqual([]);
    expect(deterministicKnownFactActions(observation([pollutedEmergencyName]), confirmedFacts)).toEqual([
      expect.objectContaining({
        fieldId: "emergency-name",
        semanticKey: "job.requiredField.stable:third_party.name.native",
        value: "王女士"
      })
    ]);

    const manuallyEntered = { ...pollutedEmergencyName, currentValue: "已由用户填写的联系人" };
    const candidateFactsOnly = { "candidate.basic.fullName": "候选人本人" };
    expect(thirdPartyIdentityCollision(manuallyEntered, candidateFactsOnly)).toBe(false);
    expect(candidateBlockingRequiredFieldFailures([manuallyEntered], candidateFactsOnly)).toEqual([]);
    expect(candidateInformationRequestsForMissingFields([manuallyEntered], candidateFactsOnly)).toEqual([]);
    expect(deterministicKnownFactActions(observation([manuallyEntered]), candidateFactsOnly)).toEqual([]);
  });

  it("does not ask AI Offer for a required value already present in the candidate package", () => {
    const highestDegree = field({
      fieldId: "highest-degree",
      stableFieldKey: "basic.highest_degree.combobox",
      label: "最高学历",
      type: "combobox",
      controlKind: "combobox",
      options: ["本科", "硕士"]
    });
    const graduationDate = field({
      fieldId: "graduation-date",
      stableFieldKey: "education[0].end_date.native",
      label: "毕业时间",
      type: "month",
      controlKind: "native"
    });

    expect(candidateInformationRequestsForMissingFields(
      [highestDegree, graduationDate],
      { "candidate.basic.highestDegree": "本科" }
    )).toEqual([
      expect.objectContaining({ fieldId: "graduation-date", label: "毕业时间" })
    ]);
  });

  it("uses indexed package dates for complete Moka date pickers", () => {
    const fields = [
      field({
        fieldId: "education-end",
        stableFieldKey: "education[0].end_date.native",
        label: "教育背景 · 教育经历 · 结束时间",
        sectionKey: "education",
        groupIndex: 0,
        type: "text",
        controlKind: "custom_date_picker"
      }),
      field({
        fieldId: "work-end",
        stableFieldKey: "work[0].end_date.native",
        label: "工作经历 · 结束时间",
        sectionKey: "work",
        groupIndex: 0,
        type: "text",
        controlKind: "custom_date_picker"
      })
    ];
    const facts = {
      "resume.education.0.endDate": "2026-06-30",
      "resume.work.0.endDate": "2025-12-31"
    };

    expect(fields.map((item) => authoritativeCandidateFactForField(item, facts))).toEqual([
      { key: "resume.education.0.endDate", value: "2026-06-30" },
      { key: "resume.work.0.endDate", value: "2025-12-31" }
    ]);
    expect(candidateInformationRequestsForMissingFields(fields, facts)).toEqual([]);
    expect(deterministicKnownFactActions(observation(fields), facts)).toEqual([
      expect.objectContaining({ fieldId: "education-end", value: "2026-06-30" }),
      expect.objectContaining({ fieldId: "work-end", value: "2025-12-31" })
    ]);
  });

  it("does not borrow a package date for an unrelated complete date field", () => {
    const contractEnd = field({
      fieldId: "contract-end",
      stableFieldKey: "other.contract_end_date.native",
      label: "其他信息 · 合同结束日期",
      sectionKey: "other",
      groupIndex: null,
      type: "text",
      controlKind: "custom_date_picker"
    });

    expect(authoritativeCandidateFactForField(contractEnd, {
      "resume.education.0.endDate": "2026-06-30",
      "resume.work.0.endDate": "2025-12-31"
    })).toBeNull();
  });

  it("does not ask AI Offer for structured fields that are traceable in the package", () => {
    const fields = [
      field({
        fieldId: "education-degree",
        stableFieldKey: "education.degree.combobox",
        label: "教育背景 · 学历",
        sectionKey: "education",
        type: "combobox",
        controlKind: "combobox",
        options: ["本科", "硕士"]
      }),
      field({
        fieldId: "current-location",
        stableFieldKey: "other.所在地.native",
        label: "其他信息 · 所在地",
        sectionKey: "other"
      }),
      field({
        fieldId: "work-years",
        stableFieldKey: "basic.work_experience.combobox",
        label: "工作经验",
        sectionKey: "basic",
        type: "combobox",
        controlKind: "combobox",
        options: ["7 年", "8 年"]
      }),
      field({
        fieldId: "arrival-date",
        stableFieldKey: "other.到岗时间.native",
        label: "其他信息 · 到岗时间",
        sectionKey: "other"
      })
    ];

    expect(candidateInformationRequestsForMissingFields(fields, {
      "resume.education.0.degree": "本科",
      "candidate.basic.currentCity": "深圳",
      "candidate.basic.workExperienceYears": "8 年"
    })).toEqual([
      expect.objectContaining({ fieldId: "arrival-date", label: "其他信息 · 到岗时间" })
    ]);
  });

  it("maps a Moka native-place field only from the candidate native-place fact", () => {
    const nativePlace = field({
      fieldId: "native-place",
      stableFieldKey: "basic.native_place.combobox",
      label: "个人信息 · 籍贯",
      sectionKey: "basic",
      type: "combobox",
      controlKind: "combobox",
      domHints: {
        name: null,
        dataFieldName: null,
        dataFieldId: null,
        placeholder: "请输入籍贯",
        ariaControls: null,
        ariaOwns: null,
        ariaLabel: null,
        testId: null
      }
    });
    const facts = {
      "candidate.basic.nativePlace": "广东省 深圳市 南山区",
      "candidate.basic.currentCity": "上海市",
      "job.answers.preferredCity": "北京市"
    };

    expect(authoritativeCandidateFactForField(nativePlace, facts)).toEqual({
      key: "candidate.basic.nativePlace",
      value: "广东省 深圳市 南山区"
    });
    expect(deterministicKnownFactActions(observation([nativePlace]), facts)).toEqual([
      expect.objectContaining({
        fieldId: "native-place",
        semanticKey: "candidate.basic.nativePlace",
        value: "广东省 深圳市 南山区"
      })
    ]);
  });

  it("ignores Moka's empty optional internship template when the candidate has no internship facts", () => {
    const internshipCompany = field({
      fieldId: "intern-company",
      stableFieldKey: "work.公司名称.native#1",
      label: "实习经历 · 公司名称",
      sectionKey: "work",
      groupIndex: 0
    });
    const arrivalDate = field({
      fieldId: "arrival-date",
      stableFieldKey: "other.到岗时间.native",
      label: "其他信息 · 到岗时间",
      sectionKey: "other"
    });

    expect(candidateInformationRequestsForMissingFields(
      [internshipCompany, arrivalDate],
      { "resume.work.0.companyName": "广州讯方信息技术有限公司" }
    )).toEqual([
      expect.objectContaining({ fieldId: "arrival-date" })
    ]);
    expect(visionPlanningObservation(
      observation([internshipCompany, arrivalDate]),
      new Set(),
      { candidateFacts: { "resume.work.0.companyName": "广州讯方信息技术有限公司" } }
    ).fields.map((item) => item.fieldId)).toEqual(["arrival-date"]);
  });

  it("returns all empty Moka date parts as one missing-information payload before model planning", () => {
    const dateParts = [
      field({
        fieldId: "study-start-year",
        stableFieldKey: "education[0].start_date.combobox#0",
        label: "教育背景 · 开始时间 · 年",
        sectionKey: "education",
        groupIndex: 0,
        type: "combobox",
        controlKind: "combobox",
        temporal: {
          groupKey: "study-time",
          layout: "year_month_range",
          edge: "start",
          part: "year"
        }
      }),
      field({
        fieldId: "study-start-month",
        stableFieldKey: "education[0].start_date.combobox#1",
        label: "教育背景 · 开始时间 · 月",
        sectionKey: "education",
        groupIndex: 0,
        type: "combobox",
        controlKind: "combobox",
        temporal: {
          groupKey: "study-time",
          layout: "year_month_range",
          edge: "start",
          part: "month"
        }
      }),
      field({
        fieldId: "study-end-year",
        stableFieldKey: "education[0].end_date.combobox#0",
        label: "教育背景 · 结束时间 · 年",
        sectionKey: "education",
        groupIndex: 0,
        type: "combobox",
        controlKind: "combobox",
        temporal: {
          groupKey: "study-time",
          layout: "year_month_range",
          edge: "end",
          part: "year"
        }
      }),
      field({
        fieldId: "study-end-month",
        stableFieldKey: "education[0].end_date.combobox#1",
        label: "教育背景 · 结束时间 · 月",
        sectionKey: "education",
        groupIndex: 0,
        type: "combobox",
        controlKind: "combobox",
        temporal: {
          groupKey: "study-time",
          layout: "year_month_range",
          edge: "end",
          part: "month"
        }
      })
    ];

    expect(candidateInformationRequestsForMissingFields(dateParts, {})).toEqual([
      expect.objectContaining({ fieldId: "study-start-year" }),
      expect.objectContaining({ fieldId: "study-start-month" }),
      expect.objectContaining({ fieldId: "study-end-year" }),
      expect.objectContaining({ fieldId: "study-end-month" })
    ]);
    expect(candidateInformationRequestsForMissingFields(dateParts, {
      "resume.education.0.startDate": "2018-09",
      "resume.education.0.endDate": "2022-06"
    })).toEqual([]);
  });

  it("asks for corrected dates instead of driving an inverted education range", () => {
    const dateParts = [
      field({
        fieldId: "study-start-year",
        stableFieldKey: "education[0].start_date.combobox#0",
        label: "教育背景 · 开始时间 · 年",
        sectionKey: "education",
        groupIndex: 0,
        type: "combobox",
        controlKind: "combobox",
        temporal: { groupKey: "study-time", layout: "year_month_range", edge: "start", part: "year" }
      }),
      field({
        fieldId: "study-end-year",
        stableFieldKey: "education[0].end_date.combobox#0",
        label: "教育背景 · 结束时间 · 年",
        sectionKey: "education",
        groupIndex: 0,
        type: "combobox",
        controlKind: "combobox",
        temporal: { groupKey: "study-time", layout: "year_month_range", edge: "end", part: "year" }
      })
    ];
    const invalidFacts = {
      "resume.education.0.startDate": "2027-12",
      "resume.education.0.endDate": "2026-09"
    };

    expect(dateParts.map((item) => authoritativeCandidateFactForField(item, invalidFacts)))
      .toEqual([null, null]);
    expect(deterministicKnownFactActions(observation(dateParts), invalidFacts)).toEqual([]);
    expect(candidateInformationRequestsForMissingFields(dateParts, invalidFacts)).toEqual([
      expect.objectContaining({ fieldId: "study-start-year", reasonCode: "candidate_information_missing" }),
      expect.objectContaining({ fieldId: "study-end-year", reasonCode: "candidate_information_missing" })
    ]);
  });

  it("returns structured JSON for any missing candidate required field", () => {
    const educationEnd = field({
      fieldId: "education-end",
      stableFieldKey: "education[0].end_date.native",
      label: "教育经历 · 结束时间",
      sectionKey: "education",
      groupIndex: 0,
      type: "month",
      controlKind: "native"
    });

    expect(candidateInformationRequestForField(educationEnd)).toMatchObject({
      schemaVersion: "required-field-request.v1",
      fieldId: "education-end",
      stableFieldKey: "education[0].end_date.native",
      label: "教育经历 · 结束时间（第1条）",
      sectionKey: "education",
      groupIndex: 0,
      type: "month",
      controlKind: "month",
      required: true,
      reasonCode: "candidate_information_missing",
      description: expect.stringContaining("日期精确到年、月"),
      question: "招聘表单必填“教育经历 · 结束时间（第1条）”，请补充完整日期（年、月）。",
      options: []
    });
  });

  it("recovers a useful AI-side label when Moka exposes only its validation message", () => {
    expect(candidateInformationRequestForField(field({
      fieldId: "arrival-date",
      stableFieldKey: "other.到岗时间.native",
      label: "必填项未填写",
      sectionKey: "other",
      type: "text",
      controlKind: "native"
    }))).toMatchObject({
      label: "其他信息 · 到岗时间",
      question: "招聘表单必填“其他信息 · 到岗时间”，请补充该信息。"
    });

    expect(candidateInformationRequestForField(field({
      fieldId: "job-intention",
      stableFieldKey: "intention.job_intention.native#0",
      label: "求职意向 · 必填项未填写",
      sectionKey: "intention",
      type: "text",
      controlKind: "native"
    }))).toMatchObject({
      label: "求职意向 · 当前薪资",
      question: "招聘表单必填“求职意向 · 当前薪资”，请补充该信息。"
    });

    expect(candidateInformationRequestForField(field({
      fieldId: "intern-company",
      stableFieldKey: "work.公司名称.native#1",
      label: "实习经历 · 必填项未填写",
      sectionKey: "work",
      type: "text",
      controlKind: "native"
    }))).toMatchObject({
      label: "实习经历 · 公司名称",
      question: "招聘表单必填“实习经历 · 公司名称”，请补充该信息。"
    });
  });

  it("does not ask AI to supplement batch assets or bounded consent controls", () => {
    expect(candidateInformationRequestForField(field({
      fieldId: "resume",
      label: "上传简历",
      type: "file"
    }))).toBeNull();
    expect(candidateInformationRequestForField(field({
      fieldId: "privacy",
      label: "同意隐私协议",
      type: "checkbox",
      controlKind: "checkbox"
    }))).toBeNull();
  });

  it("keeps Xiaopeng work start and end dates bound to different package facts", () => {
    const page = observation([
      field({
        fieldId: "work-start",
        stableFieldKey: "work[0].date.native#0",
        label: "工作经历 · 起止时间",
        sectionKey: "work",
        groupIndex: 0,
        currentValue: ""
      }),
      field({
        fieldId: "work-end",
        stableFieldKey: "work[0].date.native#1",
        label: "工作经历 · 起止时间",
        sectionKey: "work",
        groupIndex: 0,
        currentValue: ""
      })
    ]);
    page.url = "https://xiaopeng.jobs.feishu.cn/index/resume/test/apply";

    expect(deterministicKnownFactActions(page, {
      "resume.work.0.startDate": "2023-07",
      "resume.work.0.endDate": "2026-07"
    })).toEqual([
      expect.objectContaining({ fieldId: "work-start", value: "2023-07" }),
      expect.objectContaining({ fieldId: "work-end", value: "2026-07" })
    ]);
  });

  it("splits Moka education date facts into year and month deterministic actions", () => {
    const page = observation([
      field({
        fieldId: "education-start-year",
        stableFieldKey: "education[0].start_date.combobox#0",
        label: "教育背景 · 开始时间 · 年",
        sectionKey: "education",
        groupIndex: 0,
        type: "combobox",
        controlKind: "combobox",
        temporal: {
          groupKey: "education-study-time",
          layout: "year_month_range",
          edge: "start",
          part: "year"
        }
      }),
      field({
        fieldId: "education-start-month",
        stableFieldKey: "education[0].start_date.combobox#1",
        label: "教育背景 · 开始时间 · 月",
        sectionKey: "education",
        groupIndex: 0,
        type: "combobox",
        controlKind: "combobox",
        temporal: {
          groupKey: "education-study-time",
          layout: "year_month_range",
          edge: "start",
          part: "month"
        }
      }),
      field({
        fieldId: "education-end-year",
        stableFieldKey: "education[0].end_date.combobox#0",
        label: "教育背景 · 结束时间 · 年",
        sectionKey: "education",
        groupIndex: 0,
        type: "combobox",
        controlKind: "combobox",
        temporal: {
          groupKey: "education-study-time",
          layout: "year_month_range",
          edge: "end",
          part: "year"
        }
      }),
      field({
        fieldId: "education-end-month",
        stableFieldKey: "education[0].end_date.combobox#1",
        label: "教育背景 · 结束时间 · 月",
        sectionKey: "education",
        groupIndex: 0,
        type: "combobox",
        controlKind: "combobox",
        temporal: {
          groupKey: "education-study-time",
          layout: "year_month_range",
          edge: "end",
          part: "month"
        }
      })
    ]);

    expect(deterministicKnownFactActions(page, {
      "resume.education.0.startDate": "2017-09",
      "resume.education.0.endDate": "2021-06"
    })).toEqual([
      expect.objectContaining({ fieldId: "education-start-year", value: "2017" }),
      expect.objectContaining({ fieldId: "education-start-month", value: "9" }),
      expect.objectContaining({ fieldId: "education-end-year", value: "2021" }),
      expect.objectContaining({ fieldId: "education-end-month", value: "6" })
    ]);
  });

  it("splits same-job supplemental date answers before continuing a Moka field", () => {
    const graduationMonth = field({
      fieldId: "graduation-month",
      stableFieldKey: "education[0].end_date.combobox#1",
      label: "教育经历 · 结束时间 · 月",
      sectionKey: "education",
      groupIndex: 0,
      type: "combobox",
      controlKind: "combobox",
      temporal: {
        groupKey: "education-graduation",
        layout: "year_month",
        edge: "end",
        part: "month"
      }
    });

    expect(authoritativeCandidateFactForField(graduationMonth, enrichVisionCandidateFacts({}, {}, {
      requiredFieldAnswers: [{
        fieldId: "graduation-month",
        stableFieldKey: "education[0].end_date.combobox#1",
        value: "2022-07"
      }]
    }))).toEqual({
      key: "job.requiredField.stable:education[0].end_date.combobox#1",
      value: "7"
    });
  });

  it("preserves Xiaopeng parser values but repairs a duplicated work end date", () => {
    const page = observation([
      field({
        fieldId: "education-end",
        stableFieldKey: "education[0].endDate.native",
        label: "教育经历 · 结束时间",
        sectionKey: "education",
        groupIndex: 0,
        // Some Feishu observations momentarily bind the end-field identity to
        // the rendered start value while React is rebuilding the date range.
        currentValue: "2017-09"
      }),
      field({
        fieldId: "work-end",
        stableFieldKey: "work[0].endDate.native",
        label: "工作经历 · 结束时间",
        sectionKey: "work",
        groupIndex: 0,
        currentValue: "2023-07"
      })
    ]);
    page.url = "https://xiaopeng.jobs.feishu.cn/index/resume/test/apply";

    expect(deterministicKnownFactActions(page, {
      "resume.education.0.startDate": "2017-09",
      "resume.education.0.endDate": "2021-06",
      "resume.work.0.startDate": "2023-07",
      "resume.work.0.endDate": "2026-07"
    })).toEqual([
      expect.objectContaining({ fieldId: "work-end", value: "2026-07" })
    ]);
  });

  it("rebinds a field after the ATS reconstructs the form", () => {
    const before = field();
    const rebuilt = field({
      fieldId: "field-8",
      selector: "#rebuilt-year",
      currentValue: "2021"
    });
    const rebound = findDynamicReadbackField(before, observation([rebuilt]));
    expect(rebound?.fieldId).toBe("field-8");
    expect(visionReadbackMatches(rebound, "2021")).toBe(true);
  });

  it("accepts a complete date read back with another separator", () => {
    const graduationDate = field({
      fieldId: "graduation-date",
      stableFieldKey: "education[0].end_date.native",
      label: "教育背景 · 毕业时间",
      currentValue: "2025/2/28"
    });

    expect(visionReadbackMatches(graduationDate, "2025-02-28")).toBe(true);
    expect(visionReadbackMatches(graduationDate, "2025-02-27")).toBe(false);
  });

  it("does not use substring matching for split temporal selects", () => {
    const month = field({
      fieldId: "graduation-month",
      stableFieldKey: "education[0].end_date.combobox#1",
      label: "教育经历 · 毕业时间 · 月",
      type: "combobox",
      controlKind: "combobox",
      currentValue: "10月",
      temporal: {
        groupKey: "education-end",
        layout: "year_month",
        edge: "end",
        part: "month"
      }
    });

    expect(visionReadbackMatches(month, "1")).toBe(false);
    expect(visionReadbackMatches({ ...month, currentValue: "01月" }, "1")).toBe(true);
  });

  it("maps duplicate-suffixed education fields to their matching resume row", () => {
    const fields = [
      field({
        fieldId: "education-0-degree",
        stableFieldKey: "education.degree.combobox#0",
        label: "教育背景 · 教育经历 · 学历",
        sectionKey: "education",
        groupIndex: null,
        type: "combobox",
        controlKind: "combobox"
      }),
      field({
        fieldId: "education-0-graduation",
        stableFieldKey: "education.graduation_date.native#0",
        label: "教育背景 · 教育经历 · 毕业时间",
        sectionKey: "education",
        groupIndex: null
      }),
      field({
        fieldId: "education-1-degree",
        stableFieldKey: "education.degree.combobox#1",
        label: "教育背景 · 教育经历 · 学历",
        sectionKey: "education",
        groupIndex: null,
        type: "combobox",
        controlKind: "combobox"
      }),
      field({
        fieldId: "education-1-graduation",
        stableFieldKey: "education.graduation_date.native#1",
        label: "教育背景 · 教育经历 · 毕业时间",
        sectionKey: "education",
        groupIndex: null
      })
    ];
    const facts = {
      "resume.education.0.degree": "硕士",
      "resume.education.0.endDate": "2026-06-30",
      "resume.education.1.degree": "本科",
      "resume.education.1.endDate": "2023-06-30"
    };

    expect(deterministicKnownFactActions(observation(fields), facts).map((action) => ({
      fieldId: action.fieldId,
      semanticKey: action.semanticKey,
      value: action.value
    }))).toEqual([
      { fieldId: "education-0-degree", semanticKey: "resume.education.0.degree", value: "硕士" },
      { fieldId: "education-0-graduation", semanticKey: "resume.education.0.endDate", value: "2026-06-30" },
      { fieldId: "education-1-degree", semanticKey: "resume.education.1.degree", value: "本科" },
      { fieldId: "education-1-graduation", semanticKey: "resume.education.1.endDate", value: "2023-06-30" }
    ]);
  });

  it("fills a known graduation date before requesting an unknown internship answer", () => {
    const graduationDate = field({
      fieldId: "graduation-date",
      stableFieldKey: "education.end_date.native",
      label: "教育背景 · 教育经历 · 结束时间",
      currentValue: ""
    });
    const earlyInternship = field({
      fieldId: "early-internship",
      stableFieldKey: "preferences.能否提前实习.combobox",
      label: "求职意向 · 能否提前实习",
      sectionKey: "preferences",
      type: "combobox",
      controlKind: "combobox",
      options: ["是", "否"],
      currentValue: ""
    });
    const facts = {
      "profile.requiredField.stableLabel:education.end_date.native:教育背景教育经历结束时间": "2025-02-28"
    };

    expect(nextDeterministicKnownFactAction(
      observation([graduationDate, earlyInternship]),
      facts
    )).toMatchObject({
      fieldId: "graduation-date",
      value: "2025-02-28"
    });

    const afterDateReadback = observation([
      { ...graduationDate, currentValue: "2025-02-28" },
      earlyInternship
    ]);
    const missing = candidateBlockingRequiredFieldFailures(afterDateReadback.fields, facts);
    expect(candidateInformationRequestsForMissingFields(missing, facts)).toEqual([
      expect.objectContaining({
        fieldId: "early-internship",
        label: "求职意向 · 能否提前实习",
        options: ["是", "否"]
      })
    ]);
  });

  it("never reuses a recycled ordinal field id when the stable identity disappeared", () => {
    const before = field({
      fieldId: "field-7",
      stableFieldKey: "education.degree.combobox",
      label: "最高学历",
      sectionKey: "education",
      controlKind: "combobox"
    });
    const recycledEmail = field({
      fieldId: "field-7",
      stableFieldKey: "basic.email.native",
      label: "邮箱",
      sectionKey: "basic",
      controlKind: "native",
      currentValue: "validation@example.com"
    });
    expect(findDynamicReadbackField(before, observation([recycledEmail]))).toBeNull();
  });

  it("allows exact candidate facts and deterministic date components only", () => {
    const facts = {
      "candidate.basic.fullName": "陈子航",
      "candidate.basic.firstWorkStartDate": "2021-07",
      "candidate.preferences.preferredCities": "北京、杭州"
    };
    expect(isVisionValueTraceable(facts, "陈子航")).toBe(true);
    expect(isVisionValueTraceable(facts, "2021")).toBe(true);
    expect(isVisionValueTraceable(facts, "7")).toBe(true);
    expect(isVisionValueTraceable(facts, "杭州")).toBe(true);
    expect(isVisionValueTraceable(facts, "上海")).toBe(false);
    expect(isVisionValueTraceable(facts, "另一位候选人")).toBe(false);
  });

  it("forces a single action followed by a fresh observation", () => {
    const pendingEmail = field({
      fieldId: "field-email-2",
      stableFieldKey: "basic.email.native#1",
      label: "申请信息 · 个人邮箱",
      currentValue: ""
    });
    expect(iterativeVisionPolicy([], observation([pendingEmail]))).toMatchObject({
      executionMode: "observe_decide_execute_reobserve",
      iterativeSingleAction: true,
      maxActions: 1,
      dynamicDom: true,
      pendingRequiredFields: [expect.objectContaining({
        fieldId: "field-email-2",
        stableFieldKey: "basic.email.native#1"
      })]
    });
  });

  it("prioritizes the second required duplicate email independently", () => {
    const action = nextDeterministicKnownFactAction(observation([
      field({
        fieldId: "field-email-1",
        stableFieldKey: "basic.email.native#0",
        label: "申请信息 · 邮箱",
        currentValue: "validation@example.com"
      }),
      field({
        fieldId: "field-email-2",
        stableFieldKey: "basic.email.native#1",
        label: "申请信息 · 个人邮箱",
        currentValue: ""
      }),
      field({
        fieldId: "field-degree",
        stableFieldKey: "education.degree.combobox",
        label: "申请信息 · 最高学历",
        type: "combobox",
        controlKind: "combobox",
        currentValue: "本科"
      })
    ]), {
      "basic.email": "validation@example.com",
      "candidate.basic.highestDegree": "本科"
    });
    expect(action).toMatchObject({
      type: "fill_field",
      fieldId: "field-email-2",
      stableFieldKey: "basic.email.native#1",
      semanticKey: "basic.email",
      value: "validation@example.com"
    });
  });

  it("repairs a required name even when stale DOM identity says email", () => {
    const action = nextDeterministicKnownFactAction(observation([
      field({
        fieldId: "field-name",
        stableFieldKey: "basic.email.native",
        label: "个人信息 · 姓名",
        domHints: {
          name: "email",
          dataFieldName: null,
          dataFieldId: null,
          placeholder: "姓名",
          ariaControls: null,
          ariaOwns: null,
          ariaLabel: null,
          testId: null
        },
        currentValue: "validation@example.com"
      })
    ]), {
      "candidate.basic.fullName": "张明",
      "candidate.basic.email": "validation@example.com"
    });
    expect(action).toMatchObject({
      type: "fill_field",
      fieldId: "field-name",
      semanticKey: "candidate.basic.fullName",
      value: "张明"
    });
  });

  it("builds deterministic required identity corrections before visual planning", () => {
    const actions = deterministicKnownFactActions(observation([
      field({
        fieldId: "field-name",
        stableFieldKey: "basic.full_name.native",
        label: "申请信息 · 姓名",
        currentValue: "旧解析姓名"
      }),
      field({
        fieldId: "field-email",
        stableFieldKey: "basic.email.native",
        label: "申请信息 · 邮箱",
        currentValue: "zhou.test@example.com"
      })
    ]), {
      "candidate.basic.fullName": "周测试",
      "candidate.basic.email": "zhou.test@example.com"
    });

    expect(actions).toEqual([expect.objectContaining({
      fieldId: "field-name",
      semanticKey: "candidate.basic.fullName",
      value: "周测试"
    })]);
  });

  it("never lets a traceable email override an authoritative visible name", () => {
    const name = field({
      fieldId: "field-name",
      stableFieldKey: "basic.full_name.native",
      label: "个人信息 · 姓名",
      currentValue: ""
    });
    expect(authoritativeCandidateFactForField(name, {
      "candidate.basic.fullName": "张明",
      "candidate.basic.email": "validation@example.com"
    })).toEqual({ key: "candidate.basic.fullName", value: "张明" });
  });

  it("removes only the confirmed fixed Moka declaration from generic blockers", () => {
    const declaration = field({
      fieldId: "field-declaration",
      stableFieldKey: "consent.authenticity.native",
      label: "声明 · 本人确保以上所有信息真实有效。",
      type: "checkbox",
      required: true,
      currentValue: "false"
    });
    expect(isMokaAuthenticityDeclarationField(declaration)).toBe(true);
    expect(visionFormReadyForFinalReview(observation([declaration]), [])).toBe(false);
    const confirmedPlanning = visionPlanningObservation(observation([declaration]), new Set(), {
      confirmedMokaAuthenticityDeclaration: true
    });
    expect(confirmedPlanning.fields).toEqual([]);
    expect(visionFormReadyForFinalReview(confirmedPlanning, [])).toBe(true);

    expect(isMokaAuthenticityDeclarationField(field({
      fieldId: "field-silver-authenticity",
      label: "语言能力 · 本人已郑重承诺上述信息属实",
      type: "checkbox",
      required: true,
      currentValue: "false"
    }))).toBe(true);

    const privacy = field({
      fieldId: "field-privacy",
      label: "我已阅读并同意隐私政策",
      type: "checkbox",
      required: true,
      currentValue: "false"
    });
    expect(visionPlanningObservation(observation([privacy]), new Set(), {
      confirmedMokaAuthenticityDeclaration: true
    }).fields).toHaveLength(1);
  });

  it("detects real form progress while ignoring React ordinal field-id churn", () => {
    const before = observation([field({
      fieldId: "field-7",
      stableFieldKey: "basic.full_name.native",
      label: "姓名",
      currentValue: ""
    })]);
    const rebuiltWithoutProgress = observation([field({
      fieldId: "field-19",
      stableFieldKey: "basic.full_name.native",
      label: "姓名",
      currentValue: ""
    })]);
    const after = observation([field({
      fieldId: "field-20",
      stableFieldKey: "basic.full_name.native",
      label: "姓名",
      currentValue: "张明"
    })]);
    expect(visionObservationStateFingerprint(rebuiltWithoutProgress))
      .toBe(visionObservationStateFingerprint(before));
    expect(visionObservationStateFingerprint(after))
      .not.toBe(visionObservationStateFingerprint(before));
  });

  it("does not plan or block an optional personal email derived only from the resume", () => {
    const optionalEmail = field({
      stableFieldKey: "basic.email.native#1",
      label: "申请信息 · 个人邮箱",
      required: false,
      currentValue: ""
    });
    expect(visualFieldFailureBlocksSubmission(optionalEmail)).toBe(false);
    expect(iterativeVisionPolicy([], observation([optionalEmail]))).toMatchObject({
      pendingRequiredFields: [],
      optionalFieldPolicy: expect.stringContaining("非必填字段默认不新增内容")
    });
    expect(candidateInformationRequestForField(optionalEmail)).toBeNull();
    const facts = { "candidate.basic.email": "candidate@example.com" };
    expect(optionalFieldEnrichmentPending(observation([optionalEmail]), facts)).toBe(false);
    expect(visionPlanningObservation(observation([optionalEmail]), new Set(), {
      candidateFacts: facts
    }).fields).toEqual([]);
    expect(optionalFieldEnrichmentPending(
      observation([{ ...optionalEmail, currentValue: "known@example.com" }]),
      facts
    )).toBe(false);
    expect(optionalFieldEnrichmentPending(
      observation([{ ...optionalEmail, type: "file" }]),
      facts
    )).toBe(false);
  });

  it("never reuses candidate identity for optional third-party person fields", () => {
    const externalReferrer = field({
      fieldId: "external-referrer",
      stableFieldKey: "application.external_referrer.native",
      label: "外部推荐人",
      required: false,
      currentValue: ""
    });
    const emergencyPhone = field({
      fieldId: "emergency-phone",
      stableFieldKey: "application.emergency_contact_phone.native",
      label: "紧急联系人电话",
      required: false,
      currentValue: ""
    });
    const facts = {
      "candidate.basic.fullName": "候选人本人",
      "candidate.basic.phone": "13900000000",
      "candidate.basic.email": "candidate@example.com"
    };

    expect(authoritativeCandidateFactForField(externalReferrer, facts)).toBeNull();
    expect(authoritativeCandidateFactForField(emergencyPhone, facts)).toBeNull();
    expect(deterministicKnownFactActions(observation([externalReferrer, emergencyPhone]), facts)).toEqual([]);
    expect(optionalFieldEnrichmentPending(observation([externalReferrer, emergencyPhone]), facts)).toBe(false);
    expect(visionPlanningObservation(observation([externalReferrer, emergencyPhone]), new Set(), {
      candidateFacts: facts
    }).fields).toEqual([]);
  });

  it("treats a package value absent from live dropdown options as unavailable", () => {
    const city = field({
      fieldId: "preferred-city",
      stableFieldKey: "intention.preferred_city.combobox",
      label: "意向工作城市",
      type: "combobox",
      controlKind: "combobox",
      options: ["杭州市", "北京市"],
      required: true,
      currentValue: ""
    });
    const facts = {
      "job.answers.preferredCity": "上海市",
      "profile.requiredField.label:意向工作城市": "杭州市"
    };

    expect(authoritativeCandidateFactForField(city, facts)).toBeNull();
    expect(deterministicKnownFactActions(observation([city]), facts)).toEqual([]);
    expect(candidateInformationRequestsForMissingFields([city], facts)).toEqual([
      expect.objectContaining({
        fieldId: "preferred-city",
        options: ["杭州市", "北京市"]
      })
    ]);
  });

  it("returns a dropdown information request when the user has no preferred city", () => {
    const city = field({
      fieldId: "preferred-city",
      stableFieldKey: "intention.preferred_city.combobox",
      label: "意向工作城市",
      type: "combobox",
      controlKind: "combobox",
      options: ["杭州市"],
      required: true,
      currentValue: ""
    });

    expect(authoritativeCandidateFactForField(city, {})).toBeNull();
    expect(deterministicKnownFactActions(observation([city]), {})).toEqual([]);
    expect(candidateInformationRequestsForMissingFields([city], {})).toEqual([
      expect.objectContaining({
        schemaVersion: "required-field-request.v1",
        fieldId: "preferred-city",
        type: "combobox",
        controlKind: "combobox",
        options: ["杭州市"],
        question: expect.stringContaining("杭州市")
      })
    ]);
  });

  it("leaves a blank optional field untouched for resume and reusable profile facts", () => {
    const optionalEmail = field({
      fieldId: "optional-email",
      stableFieldKey: "basic.email.native#1",
      label: "申请信息 · 个人邮箱",
      required: false,
      currentValue: ""
    });

    const facts = {
      "candidate.basic.email": "candidate@example.com",
      "profile.requiredField.stableLabel:basic.email.native#1:个人邮箱": "profile@example.com"
    };

    expect(authoritativeCandidateFactForField(optionalEmail, facts)).toEqual({
      key: "profile.requiredField.stableLabel:basic.email.native#1:个人邮箱",
      value: "profile@example.com"
    });
    expect(confirmedCurrentJobFactForField(optionalEmail, facts)).toBeNull();
    expect(deterministicKnownFactActions(observation([optionalEmail]), facts)).toEqual([]);
    expect(optionalFieldEnrichmentPending(observation([optionalEmail]), facts)).toBe(false);
    expect(visionPlanningObservation(observation([optionalEmail]), new Set(), {
      candidateFacts: facts
    }).fields).toEqual([]);
  });

  it("fills a blank optional field only from the answer confirmed for this job and field", () => {
    const optionalEmail = field({
      fieldId: "optional-email",
      stableFieldKey: "basic.email.native#1",
      label: "申请信息 · 个人邮箱",
      required: false,
      currentValue: ""
    });
    const facts = {
      "candidate.basic.email": "resume@example.com",
      "job.requiredField.stable:basic.email.native#1": "confirmed@example.com"
    };

    expect(confirmedCurrentJobFactForField(optionalEmail, facts)).toEqual({
      key: "job.requiredField.stable:basic.email.native#1",
      value: "confirmed@example.com"
    });
    expect(deterministicKnownFactActions(observation([optionalEmail]), facts)).toEqual([
      expect.objectContaining({
        fieldId: "optional-email",
        semanticKey: "job.requiredField.stable:basic.email.native#1",
        value: "confirmed@example.com",
        reason: "用户已为当前岗位明确确认该非必填字段"
      })
    ]);
    expect(optionalFieldEnrichmentPending(observation([optionalEmail]), facts)).toBe(true);
    expect(visionPlanningObservation(observation([optionalEmail]), new Set(), {
      candidateFacts: facts
    }).fields).toEqual([optionalEmail]);
  });

  it("preserves an existing optional value even when the current job has a confirmed answer", () => {
    const optionalEmail = field({
      fieldId: "optional-email",
      stableFieldKey: "basic.email.native#1",
      label: "申请信息 · 个人邮箱",
      required: false,
      currentValue: "site-parser@example.com"
    });

    expect(deterministicKnownFactActions(observation([optionalEmail]), {
      "candidate.basic.email": "candidate@example.com",
      "job.requiredField.stable:basic.email.native#1": "confirmed@example.com"
    })).toEqual([]);
    expect(visionPlanningObservation(observation([optionalEmail]), new Set(), {
      candidateFacts: {
        "job.requiredField.stable:basic.email.native#1": "confirmed@example.com"
      }
    }).fields).toEqual([]);
  });

  it("skips an unconfirmed optional field and advances to the required field", () => {
    const optionalEmail = field({
      fieldId: "optional-email",
      stableFieldKey: "basic.email.native#1",
      label: "申请信息 · 个人邮箱",
      required: false,
      currentValue: ""
    });
    const requiredName = field({
      fieldId: "required-name",
      stableFieldKey: "basic.full_name.native",
      label: "申请信息 · 姓名",
      currentValue: ""
    });
    const facts = {
      "candidate.basic.fullName": "张明",
      "candidate.basic.email": "candidate@example.com"
    };

    expect(nextDeterministicKnownFactAction(
      observation([optionalEmail, requiredName]),
      facts
    )).toMatchObject({ fieldId: "required-name" });
    expect(nextDeterministicKnownFactAction(
      observation([optionalEmail]),
      facts,
      new Set(["basic.email.native#1"])
    )).toBeNull();
  });

  it("preserves a committed Moka preferred city instead of replaying a stale job answer", () => {
    const preferredCity = field({
      fieldId: "preferred-city",
      stableFieldKey: "intention.preferred_city.combobox",
      label: "申请信息 · 意向工作城市",
      type: "combobox",
      controlKind: "combobox",
      currentValue: "上海市"
    });
    const facts = { "job.answers.preferredCity": "南京市" };

    expect(deterministicKnownFactActions({
      ...observation([preferredCity]),
      url: "https://app.mokahr.com/campus-recruitment/metax-tech/58131#/job/example/apply"
    }, facts)).toEqual([]);

    expect(deterministicKnownFactActions({
      ...observation([{ ...preferredCity, currentValue: "" }]),
      url: "https://app.mokahr.com/campus-recruitment/metax-tech/58131#/job/example/apply"
    }, facts)).toEqual([
      expect.objectContaining({
        fieldId: "preferred-city",
        value: "南京市"
      })
    ]);
  });

  it("skips every failed optional field once without consuming a required-field breaker", () => {
    const requiredFailures = new Map<string, number>();
    const optionalEducationEnd = field({
      fieldId: "education-end",
      stableFieldKey: "education.end_date.native#0",
      label: "教育经历 · 结束时间",
      required: false
    });
    const optionalLanguageName = field({
      fieldId: "language-name",
      stableFieldKey: "language[4].full_name.native",
      label: "语言能力 · 姓名",
      required: false
    });

    expect(registerVisionFieldAttempt(requiredFailures, optionalEducationEnd, "2026-06", false))
      .toEqual({ action: "skip_optional", failureCount: 1 });
    expect(registerVisionFieldAttempt(requiredFailures, optionalLanguageName, "英语", false))
      .toEqual({ action: "skip_optional", failureCount: 1 });
    expect(requiredFailures.size).toBe(0);

    const skipped = new Set([
      optionalEducationEnd.stableFieldKey!,
      optionalLanguageName.stableFieldKey!
    ]);
    const ready = visionPlanningObservation(
      observation([optionalEducationEnd, optionalLanguageName]),
      skipped
    );
    expect(ready.fields).toEqual([]);
    expect(visionFormReadyForFinalReview(ready)).toBe(true);
  });

  it("breaks on the first required failure and keeps field counters independent", () => {
    const requiredFailures = new Map<string, number>();
    const requiredEducationEnd = field({
      fieldId: "education-end",
      stableFieldKey: "education[0].end_date.custom_date_picker",
      label: "教育经历 · 结束时间",
      required: true
    });
    const requiredLanguage = field({
      fieldId: "language-name",
      stableFieldKey: "language[0].name.combobox",
      label: "语言能力 · 语种",
      required: true
    });

    expect(registerVisionFieldAttempt(requiredFailures, requiredEducationEnd, "2026-06", false))
      .toEqual({ action: "break_required", failureCount: 1 });
    expect(registerVisionFieldAttempt(requiredFailures, requiredEducationEnd, "2026-06", false))
      .toEqual({ action: "break_required", failureCount: 2 });
    expect(registerVisionFieldAttempt(requiredFailures, requiredLanguage, "英语", false))
      .toEqual({ action: "break_required", failureCount: 1 });
    expect(registerVisionFieldAttempt(requiredFailures, requiredEducationEnd, "2026-06", false))
      .toEqual({ action: "break_required", failureCount: 3 });
  });

  it("clears a required-field breaker after authoritative readback succeeds", () => {
    const requiredFailures = new Map<string, number>();
    const requiredName = field({
      fieldId: "required-name",
      stableFieldKey: "basic.full_name.native",
      label: "申请信息 · 姓名",
      required: true
    });

    expect(registerVisionFieldAttempt(requiredFailures, requiredName, "张明", false).failureCount).toBe(1);
    expect(registerVisionFieldAttempt(requiredFailures, requiredName, "张明", true))
      .toEqual({ action: "completed", failureCount: 0 });
    expect(registerVisionFieldAttempt(requiredFailures, requiredName, "张明", false))
      .toEqual({ action: "break_required", failureCount: 1 });
  });

  it("does not block final review for a non-empty optional field that differs from the package", () => {
    const parserGeneratedStartYear = field({
      stableFieldKey: "candidate.basic.first_work_start_year.combobox",
      label: "申请信息 · 基本信息 · 开始工作年月 · 年",
      type: "combobox",
      required: false,
      currentValue: "2020"
    });
    expect(visualFieldFailureBlocksSubmission(parserGeneratedStartYear)).toBe(false);
  });

  it("does not audit an optional phone calling-code selector as the phone answer", () => {
    const callingCode = field({
      stableFieldKey: "basic.phone.combobox",
      label: "申请信息 · 手机号码",
      type: "combobox",
      controlKind: "combobox",
      required: false,
      currentValue: "+86"
    });
    expect(visualFieldFailureBlocksSubmission(callingCode)).toBe(false);
  });

  it("plans the bounded phone calling-code default from committed and query state", () => {
    const callingCode = (input: Partial<PageFieldObservation> = {}) => field({
      fieldId: "calling-code",
      stableFieldKey: "basic.phone.combobox",
      selector: "#calling-code",
      label: "申请信息 · 手机号码",
      type: "combobox",
      controlKind: "combobox",
      required: false,
      currentValue: "",
      compound: { kind: "phone_number", role: "calling_code", groupKey: "#phone-field", queryValue: "" },
      ...input
    });
    const expectedDefault = expect.objectContaining({
      fieldId: "calling-code",
      semanticKey: "policy.phone_calling_code.default",
      value: "+86",
      optionSelectionPolicy: "phone_calling_code_default"
    });

    expect(isPhoneCallingCodeField(callingCode())).toBe(true);
    expect(deterministicKnownFactActions(observation([callingCode()]), {})).toEqual([expectedDefault]);
    expect(deterministicKnownFactActions(observation([callingCode({ currentValue: "1" })]), {}))
      .toEqual([expectedDefault]);
    expect(deterministicKnownFactActions(observation([callingCode({
      currentValue: "+86",
      compound: { kind: "phone_number", role: "calling_code", groupKey: "#phone-field", queryValue: "1" }
    })]), {})).toEqual([expectedDefault]);
    expect(deterministicKnownFactActions(observation([callingCode({ currentValue: "+86" })]), {})).toEqual([]);
    expect(phoneCallingCodeReadbackMatches(callingCode({ currentValue: "+86" }), "+86")).toBe(true);
    expect(phoneCallingCodeReadbackMatches(callingCode({
      currentValue: "+86",
      compound: { kind: "phone_number", role: "calling_code", groupKey: "#phone-field", queryValue: "1" }
    }), "+86")).toBe(false);
    expect(visionPlanningObservation(observation([callingCode({
      currentValue: "+86",
      compound: { kind: "phone_number", role: "calling_code", groupKey: "#phone-field", queryValue: "1" }
    })]), new Set(), { candidateFacts: {} }).fields).toHaveLength(1);

    const soleNonDefaultComplete = callingCode({ currentValue: "+1" });
    expect(deterministicKnownFactActions(observation([soleNonDefaultComplete]), {},
      new Set([soleNonDefaultComplete.stableFieldKey!]))).toEqual([]);

    const disabled = callingCode({ currentValue: "+1", domHints: { disabled: true } });
    expect(deterministicKnownFactActions(observation([disabled]), {})).toEqual([]);
    expect(visionPlanningObservation(observation([disabled]), new Set(), { candidateFacts: {} }).fields).toEqual([]);
  });

  it("keeps an exact current-job calling-code answer ahead of the default, including query cleanup", () => {
    const callingCode = field({
      fieldId: "calling-code-confirmed",
      stableFieldKey: "basic.phone.combobox",
      selector: "#calling-code",
      label: "手机号码",
      type: "combobox",
      controlKind: "combobox",
      required: false,
      currentValue: "+86",
      compound: { kind: "phone_number", role: "calling_code", groupKey: "#phone-field", queryValue: "" }
    });
    const key = `job.requiredField.stable:${callingCode.stableFieldKey}`;
    expect(deterministicKnownFactActions(observation([callingCode]), { [key]: "+1" })).toEqual([
      expect.objectContaining({
        semanticKey: key,
        value: "+1",
        optionSelectionPolicy: "phone_calling_code_confirmed"
      })
    ]);
    expect(deterministicKnownFactActions(observation([{ ...callingCode, currentValue: "+1" }]), { [key]: "+1" }))
      .toEqual([]);
    expect(deterministicKnownFactActions(observation([{ ...callingCode, currentValue: "+886" }]), { [key]: "+86" }))
      .toEqual([expect.objectContaining({ value: "+86", optionSelectionPolicy: "phone_calling_code_confirmed" })]);
    expect(phoneCallingCodeReadbackMatches({ ...callingCode, currentValue: "+86" }, "+886")).toBe(false);
    expect(deterministicKnownFactActions(observation([{ ...callingCode,
      compound: { kind: "phone_number", role: "calling_code", groupKey: "#phone-field", queryValue: "1" }
    }]), { [key]: "+86" })).toEqual([
      expect.objectContaining({ value: "+86", optionSelectionPolicy: "phone_calling_code_confirmed" })
    ]);
  });

  it("never borrows the candidate phone number for a required calling-code member", () => {
    const callingCode = field({
      fieldId: "required-calling-code",
      stableFieldKey: "basic.phone.combobox",
      selector: "#calling-code",
      label: "手机号码",
      type: "combobox",
      controlKind: "combobox",
      required: true,
      currentValue: "",
      compound: { kind: "phone_number", role: "calling_code", groupKey: "#phone-field", queryValue: "" }
    });
    expect(deterministicKnownFactActions(observation([callingCode]), {
      "candidate.basic.phone": "13800000000"
    })).toEqual([
      expect.objectContaining({ semanticKey: "policy.phone_calling_code.default", value: "+86" })
    ]);
  });

  it.each([
    { label: "手机号码", stableFieldKey: "basic.phone.combobox" },
    { label: "邮政编码", stableFieldKey: "basic.postal_code.combobox" },
    { label: "普通数字", stableFieldKey: "custom.quantity.combobox" }
  ])("does not grant the calling-code policy to an ordinary combobox: $label", (identity) => {
    const ordinary = field({ ...identity, type: "combobox", controlKind: "combobox", required: false });
    expect(isPhoneCallingCodeField(ordinary)).toBe(false);
    expect(deterministicKnownFactActions(observation([ordinary]), {})).toEqual([]);
    expect(visionPlanningObservation(observation([ordinary]), new Set(), { candidateFacts: {} }).fields).toEqual([]);
  });

  it("does not retain the number member through the calling-code planning exception", () => {
    const number = field({
      fieldId: "phone-number",
      stableFieldKey: "basic.phone.native",
      label: "手机号码",
      type: "text",
      controlKind: "native",
      required: false,
      currentValue: "13800000000",
      compound: { kind: "phone_number", role: "number", groupKey: "#phone-field" }
    });
    expect(visionPlanningObservation(observation([number]), new Set(), { candidateFacts: {} }).fields).toEqual([]);
  });

  it("uses the same calling-code policy for a third-party compound without borrowing the candidate phone", () => {
    const thirdPartyCode = field({
      fieldId: "emergency-calling-code",
      stableFieldKey: "third_party.phone.combobox",
      label: "紧急联系人 · 手机号码",
      sectionKey: "third_party",
      type: "combobox",
      controlKind: "combobox",
      required: true,
      compound: { kind: "phone_number", role: "calling_code", groupKey: "#emergency-phone", queryValue: "1" }
    });
    expect(isPhoneCallingCodeField(thirdPartyCode)).toBe(true);
    expect(deterministicKnownFactActions(observation([thirdPartyCode]), {
      "candidate.basic.phone": "13800000000"
    })).toEqual([
      expect.objectContaining({ semanticKey: "policy.phone_calling_code.default", value: "+86" })
    ]);
  });

  it("converges locally once required fields are complete without waiting for another model turn", () => {
    const completedName = field({
      stableFieldKey: "basic.full_name.native",
      label: "个人信息 · 姓名",
      currentValue: "张明"
    });
    const optionalPhoto = field({
      fieldId: "field-photo",
      stableFieldKey: "attachments.identity_photo.native",
      label: "上传 · 证件照",
      type: "file",
      required: false,
      currentValue: ""
    });
    expect(visionFormReadyForFinalReview(observation([completedName, optionalPhoto]), [])).toBe(true);
    expect(visionFormReadyForFinalReview(observation([completedName]), ["姓名回读不一致"])).toBe(false);
    expect(visionFormReadyForFinalReview(observation([
      field({ stableFieldKey: "basic.full_name.native", label: "姓名", currentValue: "" })
    ]), [])).toBe(false);
  });

  it("removes all file controls from visual planning and pending required fields", () => {
    const resume = field({
      fieldId: "field-resume",
      stableFieldKey: "attachments.resume_file.native",
      label: "上传 · 简历",
      type: "file",
      required: true,
      currentValue: ""
    });
    const photo = field({
      fieldId: "field-photo",
      stableFieldKey: "attachments.identity_photo.native",
      label: "上传 · 证件照",
      type: "file",
      required: false,
      currentValue: ""
    });
    const name = field({
      fieldId: "field-name",
      stableFieldKey: "basic.full_name.native",
      label: "个人信息 · 姓名",
      type: "text",
      required: true,
      currentValue: ""
    });
    const planning = visionPlanningObservation(observation([resume, photo, name]));
    expect(planning.fields.map((item) => item.fieldId)).toEqual(["field-name"]);
    expect(iterativeVisionPolicy([], observation([resume, photo, name]))).toMatchObject({
      pendingRequiredFields: [expect.objectContaining({ fieldId: "field-name" })]
    });
  });

  it("does not let a degree fragment hide simultaneous dynamic-field failures", () => {
    const details = visualFailureDetails(
      "回读不一致：最高学历；字段已从页面消失：工作经历 · 开始时间"
    );
    expect(classifyVisualFailureReason(details)).toBe("site_validation_blocked");
    expect(classifyVisualFailureReason(["最高学历 连续两次回读不一致"])).toBe("required_degree_missing");
    expect(classifyVisualFailureReason(["工作经历 · 学历 连续两次回读不一致"])).toBe("site_validation_blocked");
  });

  it("rejects an email value observed through a degree field identity", () => {
    expect(visualSemanticConflict(field({
      stableFieldKey: "education.degree.native",
      label: "申请信息 · 最高学历",
      currentValue: "validation@example.com"
    }))).toMatch(/邮箱格式/);
    expect(visualSemanticConflict(field({
      stableFieldKey: "basic.email.native",
      label: "申请信息 · 个人邮箱",
      currentValue: "validation@example.com"
    }))).toBeNull();
    expect(visualSemanticConflict(field({
      stableFieldKey: "basic.email.native",
      label: "个人信息 · 姓名",
      currentValue: "validation@example.com"
    }))).toMatch(/姓名字段/);
  });
});


describe("school location fact ownership", () => {
  it.each(["最高学历院校所在城市", "学校所在地", "院校地址", "School city", "University country"])("does not borrow school, degree or preferred city for %s", label => {
    const target = field({label,sectionKey:"education",stableFieldKey:"education.preferred_city.combobox",type:"combobox",controlKind:"combobox",options:[]});
    const facts={"resume.education.0.school":"广东海洋大学","candidate.basic.highestDegree":"本科","candidate.basic.currentCity":"上海","job.answers.preferredCity":"北京"};
    expect(authoritativeCandidateFactForField(target,facts)).toBeNull();
    expect(authoritativeCandidateFactForField(target,{...facts,[`job.requiredField.stable:${target.stableFieldKey}`]:"湛江"})?.value).toBe("湛江");
    expect(authoritativeCandidateFactForField({...target, groupIndex:1,stableFieldKey:"education[1].school_city.combobox"},{...facts,[`job.requiredField.stable:${target.stableFieldKey}`]:"湛江"})).toBeNull();
  });
});
