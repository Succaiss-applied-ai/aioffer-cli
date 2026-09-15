// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  applicationMutationWaitPolicy,
  applicationObservationStabilitySignature,
  applicationObservationWithFillReadback,
  fieldFillMayChangeApplicationStructure,
  readApplicationDomMutationState,
  waitForApplicationDomMutation
} from "./application-observation-refresh.js";
import type { PageObservation } from "./page-adapter.js";

const observation = {
  url: "https://example.test/apply",
  title: "Apply",
  fingerprint: "before",
  transientBusy: false,
  loginRequired: false,
  loginReason: null,
  fields: [{
    fieldId: "field-name",
    selector: "#name",
    label: "姓名",
    type: "text",
    required: true,
    requiredSource: "explicit",
    currentValue: ""
  }],
  actions: [],
  observedAt: "2026-08-27T00:00:00.000Z"
} as PageObservation;

describe("incremental application observation", () => {
  afterEach(() => {
    const scope = globalThis as typeof globalThis & {
      __recruitingAiApplicationMutationTracker?: { observer?: MutationObserver };
    };
    scope.__recruitingAiApplicationMutationTracker?.observer?.disconnect();
    delete scope.__recruitingAiApplicationMutationTracker;
    document.body.replaceChildren();
  });

  it("updates a successful field readback without rescanning the whole form", () => {
    expect(applicationObservationWithFillReadback(observation, {
      fieldId: "field-name",
      success: true,
      expected: "张三",
      actual: "张三",
      error: null
    }).fields[0]?.currentValue).toBe("张三");
  });

  it("keeps failed readbacks unchanged", () => {
    expect(applicationObservationWithFillReadback(observation, {
      fieldId: "field-name",
      success: false,
      expected: "张三",
      actual: "",
      error: "not filled"
    })).toBe(observation);
  });

  it("reserves the longer dynamic window for structure-changing controls", () => {
    expect(fieldFillMayChangeApplicationStructure({
      fieldId: "name",
      selector: "#name",
      type: "text",
      value: "张三"
    })).toBe(false);
    expect(fieldFillMayChangeApplicationStructure({
      fieldId: "city",
      selector: "#city",
      type: "combobox",
      value: "上海"
    })).toBe(true);
    expect(applicationMutationWaitPolicy({
      fieldId: "name",
      selector: "#name",
      type: "text",
      value: "张三"
    })).toEqual({ detectionWindowMs: 80, quietWindowMs: 80, maxWaitMs: 400 });
    expect(applicationMutationWaitPolicy({
      fieldId: "city",
      selector: "#city",
      type: "combobox",
      value: "上海"
    })).toEqual({ detectionWindowMs: 600, quietWindowMs: 180, maxWaitMs: 1_800 });
  });

  it("detects a dynamic field insertion and waits for the mutation to settle", async () => {
    const baseline = readApplicationDomMutationState();
    document.body.append(document.createElement("input"));

    await expect(waitForApplicationDomMutation({
      baselineVersion: baseline.version,
      detectionWindowMs: 10,
      quietWindowMs: 10,
      maxWaitMs: 200
    })).resolves.toMatchObject({ changed: true });
  });

  it("detects an existing field revealed by a dynamic class change", async () => {
    const field = document.createElement("input");
    field.className = "is-hidden";
    document.body.append(field);
    const baseline = readApplicationDomMutationState();
    field.className = "is-visible";

    await expect(waitForApplicationDomMutation({
      baselineVersion: baseline.version,
      detectionWindowMs: 10,
      quietWindowMs: 10,
      maxWaitMs: 200
    })).resolves.toMatchObject({ changed: true });
  });

  it("invalidates a snapshot when conditional fields, live options, or validation change", () => {
    const base = { ...observation, validationMessages: [] };
    const signature = applicationObservationStabilitySignature(base);
    expect(applicationObservationStabilitySignature({
      ...base,
      fields: [...base.fields, {
        ...base.fields[0]!, fieldId: "intern-start", stableFieldKey: "internship.start_date.combobox",
        label: "实习最早开始时间", type: "combobox", options: ["2026-09"]
      }]
    })).not.toBe(signature);
    expect(applicationObservationStabilitySignature({
      ...base,
      fields: [{ ...base.fields[0]!, options: ["是", "否"] }]
    })).not.toBe(signature);
    expect(applicationObservationStabilitySignature({
      ...base,
      fields: [{ ...base.fields[0]!, validationMessage: "必填项未填写 / Required items are not filled in" }],
      validationMessages: ["必填项未填写 / Required items are not filled in"]
    })).not.toBe(signature);
  });
});
