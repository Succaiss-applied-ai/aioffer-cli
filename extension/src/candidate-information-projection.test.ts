import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { projectCandidateInformation } from "./candidate-information-projection.js";
import {
  authoritativeCandidateFactForField,
  enrichVisionCandidateFacts,
} from "./vision-form-runtime.js";
import { siteRepairReadbackFailures } from "./auto-apply-site-validation.js";
import type { PageFieldObservation, PageObservation } from "./page-adapter.js";
const at = new Date("2026-09-09T12:00:00Z");
const city: PageFieldObservation = {
  fieldId: "city",
  stableFieldKey: "intention.preferred_city.combobox",
  label: "意向工作城市",
  selector: "#city",
  sectionKey: "intention",
  groupIndex: null,
  labelPath: ["意向工作城市"],
  type: "combobox",
  controlKind: "combobox",
  required: true,
  currentValue: "",
  options: ["深圳市", "上海市", "北京市"],
};
const gender: PageFieldObservation = {
  ...city,
  fieldId: "gender",
  stableFieldKey: "basic.gender.combobox",
  label: "性别",
  sectionKey: "basic",
  options: ["男", "女"],
};

describe("effective candidate information → existing field resolution → readback", () => {
  it("replaces a unique fact without changing the base package or another person’s field", () => {
    const base = { candidate: { basic: { gender: "男" } } };
    const profile = {
      overrides: [{ semanticKey: "candidate.gender", value: "女" }],
      facts: [
        {
          semanticKey: "candidate.gender",
          value: "女",
          label: "性别",
          stableFieldKeys: [],
          source: "user_confirmed",
        },
      ],
    };
    const projected = projectCandidateInformation(base, profile, at);
    expect(projected).toEqual({ candidate: { basic: { gender: "女" } } });
    expect(base.candidate.basic.gender).toBe("男");
    const facts = enrichVisionCandidateFacts(
      projected,
      { "candidate.basic.gender": "男" },
      {},
      profile,
    );
    expect(authoritativeCandidateFactForField(gender, facts)?.value).toBe("女");
    expect(
      authoritativeCandidateFactForField(
        {
          ...gender,
          label: "紧急联系人 · 性别",
          stableFieldKey: "contact[0].gender.native",
          sectionKey: "contact",
          groupIndex: 0,
        },
        facts,
      ),
    ).toBeNull();
    const page = {
      url: "https://example.test/apply",
      fields: [{ ...gender, currentValue: "女" }],
    } as PageObservation;
    expect(siteRepairReadbackFailures([gender], page, facts)).toEqual([]);
    expect(
      siteRepairReadbackFailures(
        [gender],
        { ...page, fields: [{ ...gender, currentValue: "男" }] },
        facts,
      ),
    ).toHaveLength(1);
  });
  it("deduplicates added cities, projects deletions, and keeps this job’s exact answer", () => {
    const base = {
      candidate: {
        basic: { currentCity: "深圳" },
        preferences: { preferredCities: ["深圳", "北京"] },
      },
    };
    const profile = {
      facts: [],
      overrides: [
        {
          semanticKey: "candidate.preferences.preferredCities",
          values: ["上海市", "北京"],
          removedValues: ["深圳市"],
        },
      ],
    };
    const projected = projectCandidateInformation(base, profile, at);
    expect((projected.candidate as any).preferences.preferredCities).toEqual([
      "北京",
      "上海市",
    ]);
    const later = enrichVisionCandidateFacts(
      projected,
      {
        "candidate.preferences.preferredCity": "深圳",
        "candidate.basic.currentCity": "深圳",
      },
      {},
      profile,
    );
    expect(authoritativeCandidateFactForField(city, later)?.value).toBe("北京");
    expect(
      authoritativeCandidateFactForField(
        { ...city, options: ["深圳市"] },
        later,
      ),
    ).toBeNull();
    const thisJob = enrichVisionCandidateFacts(
      projected,
      {},
      {
        requiredFieldAnswers: [
          {
            fieldId: "city",
            stableFieldKey: city.stableFieldKey,
            value: "深圳市",
          },
        ],
      },
      profile,
    );
    expect(authoritativeCandidateFactForField(city, thisJob)?.value).toBe(
      "深圳市",
    );
    expect(
      authoritativeCandidateFactForField(
        { ...city, options: ["上海市"] },
        later,
      )?.value,
    ).toBe("上海市");
  });
  it("does not resurrect cleared cities via residence or old preference aliases", () => {
    const profile = {
      facts: [],
      overrides: [
        {
          semanticKey: "candidate.preferences.preferredCities",
          cleared: true,
          replaceBase: true,
        },
      ],
    };
    const values = enrichVisionCandidateFacts(
      {
        candidate: {
          basic: { currentCity: "深圳" },
          preferences: { preferredCities: ["深圳"] },
        },
      },
      { "candidate.preferences.preferredCity": "深圳" },
      {},
      profile,
    );
    expect(authoritativeCandidateFactForField(city, values)).toBeNull();
  });
  it("preserves date precision and expires age observations without inventing DOB", () => {
    const base = { candidate: { basic: { birthDate: "2000-05-20" } } };
    const p = projectCandidateInformation(
      base,
      {
        overrides: [
          { semanticKey: "candidate.basic.birthDate", value: "2000-05" },
        ],
      },
      at,
    );
    expect((p.candidate as any).basic).toEqual({
      birthDate: "2000-05-20",
      age: "26",
    });
    const p2 = projectCandidateInformation(
      { candidate: { basic: { age: "99" } } },
      {
        overrides: [
          {
            semanticKey: "candidate.age",
            value: "0",
            validUntil: "2026-09-10T00:00:00Z",
          },
        ],
      },
      at,
    );
    expect((p2.candidate as any).basic).toEqual({ age: "0" });
    const expired = projectCandidateInformation(
      p2,
      {
        overrides: [
          {
            semanticKey: "candidate.age",
            value: "0",
            validUntil: "2026-09-10T00:00:00Z",
          },
        ],
      },
      new Date("2026-09-11"),
    );
    expect((expired.candidate as any).basic).toEqual({});
  });
  it("retains exact language metadata and updates sets by item identity", () => {
    const base = {
      candidate: {
        languages: [{ name: "English", level: "C1" }],
        skills: [{ summary: "Java" }],
      },
    };
    const result = projectCandidateInformation(
      base,
      {
        overrides: [
          { semanticKey: "candidate.languages", values: ["English", "中文"] },
          {
            semanticKey: "candidate.skills",
            values: ["Go"],
            removedValues: ["Java"],
          },
        ],
      },
      at,
    );
    expect(result.candidate).toEqual({
      languages: [{ name: "English", level: "C1" }, { name: "中文" }],
      skills: [{ summary: "Go" }],
    });
  });
  it("drops old districts after a region move and preserves compatible precision", () => {
    const profile = {
      overrides: [
        { semanticKey: "candidate.basic.currentCity", value: "浙江省/杭州市" },
      ],
    };
    expect(
      projectCandidateInformation(
        { candidate: { basic: { currentCity: "广东省/深圳市/南山区" } } },
        profile,
        at,
      ),
    ).toEqual({ candidate: { basic: { currentCity: "浙江省/杭州市" } } });
    expect(
      projectCandidateInformation(
        { candidate: { basic: { currentCity: "浙江省/杭州市/西湖区" } } },
        profile,
        at,
      ),
    ).toEqual({
      candidate: { basic: { currentCity: "浙江省/杭州市/西湖区" } },
    });
    expect(
      projectCandidateInformation(
        { candidate: { basic: { currentCity: "浙江省/杭州市/西湖区" } } },
        {
          overrides: [{ ...profile.overrides[0], replaceBase: true }],
        },
        at,
      ),
    ).toEqual({ candidate: { basic: { currentCity: "浙江省/杭州市" } } });
  });
});

it("consumes the fixture emitted by the real Backend supplement/save/package path", () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL(
        "../../docs/supplement-merge/roundtrip-fixture.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const later = enrichVisionCandidateFacts(
    fixture.package,
    {},
    { jobId: "a-different-job" },
    fixture.profile,
  );
  expect(authoritativeCandidateFactForField(gender, later)?.value).toBe("男");
  expect(
    authoritativeCandidateFactForField({ ...city, options: ["上海市"] }, later)
      ?.value,
  ).toBe("上海市");
  expect(
    authoritativeCandidateFactForField({ ...city, options: ["北京市"] }, later),
  ).toBeNull();
  const current = enrichVisionCandidateFacts(
    fixture.package,
    {},
    { jobId: "job-001" },
    fixture.profile,
  );
  expect(authoritativeCandidateFactForField(city, current)?.value).toBe(
    "上海市",
  );
  const page = {
    url: "https://example.test/apply",
    fields: [
      { ...city, currentValue: "上海市" },
      { ...gender, currentValue: "男" },
    ],
  } as PageObservation;
  expect(siteRepairReadbackFailures([city, gender], page, current)).toEqual([]);
  const removed = enrichVisionCandidateFacts(
    fixture.afterRemoval.package,
    {},
    { jobId: "a-different-job" },
    fixture.afterRemoval.profile,
  );
  expect(
    authoritativeCandidateFactForField(
      { ...city, options: ["深圳市"] },
      removed,
    ),
  ).toBeNull();
  expect(
    authoritativeCandidateFactForField(
      { ...city, options: ["上海市"] },
      removed,
    )?.value,
  ).toBe("上海市");
});
