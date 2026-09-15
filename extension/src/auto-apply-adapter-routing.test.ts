import { describe, expect, it } from "vitest";
import { resolveAutoApplyAdapter } from "./auto-apply-adapter-routing.js";

describe("auto apply adapter routing", () => {
  it("preserves the accepted DeepSeek adapter", () => {
    expect(resolveAutoApplyAdapter(
      "https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/2eb2e75d-29f3-47b5-bb10-39f12547d398/apply",
      "moka.deepseek.v1"
    )).toMatchObject({
      adapterCode: "moka.deepseek.v1",
      supported: true,
      fallbackApplied: false
    });
  });

  it("downgrades a stale DeepSeek hint to the matching Moka family adapter", () => {
    expect(resolveAutoApplyAdapter(
      "https://app.mokahr.com/social-recruitment/catl/123#/job/2eb2e75d-29f3-47b5-bb10-39f12547d398/apply",
      "moka.deepseek.v1"
    )).toMatchObject({
      adapterCode: "moka.v2",
      requestedAdapterCode: "moka.deepseek.v1",
      supported: true,
      fallbackApplied: true,
      reason: null
    });
  });

  it("routes unknown or missing adapter codes to the generic web runtime", () => {
    expect(resolveAutoApplyAdapter("https://jobs.example.com/apply/1", "legacy.site.v1"))
      .toMatchObject({ adapterCode: "generic.web.v1", supported: true, fallbackApplied: true });
    expect(resolveAutoApplyAdapter("https://jobs.example.com/apply/1", ""))
      .toMatchObject({ adapterCode: "generic.web.v1", supported: true, fallbackApplied: true });
  });

  it("prefers a known site runtime over a stale generic hint", () => {
    expect(resolveAutoApplyAdapter(
      "https://app.mokahr.com/social-recruitment/catl/123#/job/catl-job/apply",
      "generic.web.v1"
    )).toMatchObject({ adapterCode: "moka.v2", supported: true, fallbackApplied: true });
  });

  it("routes a Moka public job detail to the Moka runtime before its entry opens", () => {
    expect(resolveAutoApplyAdapter(
      "https://app.mokahr.com/campus-recruitment/shopee/170008#/job/14467caa-7995-428a-a916-5a7e7f7ffde4",
      "generic.web.v1"
    )).toMatchObject({ adapterCode: "moka.v2", supported: true, fallbackApplied: true });
  });

  it("routes a Xiaopeng campus detail URL to the Xiaopeng entry driver", () => {
    expect(resolveAutoApplyAdapter(
      "https://xiaopeng.jobs.feishu.cn/campus/position/7658239728123545907/detail",
      "generic.web.v1"
    )).toMatchObject({
      adapterCode: "feishu.xiaopeng.v1",
      supported: true,
      fallbackApplied: true
    });
  });

  it("routes Xiaopeng's index detail URL to the same entry driver", () => {
    expect(resolveAutoApplyAdapter(
      "https://xiaopeng.jobs.feishu.cn/index/position/detail/7679439372929157419",
      "generic.web.v1"
    )).toMatchObject({
      adapterCode: "feishu.xiaopeng.v1",
      supported: true,
      fallbackApplied: true
    });
  });

  it("prefers the most specific DeepSeek runtime over the broader Moka hint", () => {
    expect(resolveAutoApplyAdapter(
      "https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/2eb2e75d-29f3-47b5-bb10-39f12547d398/apply",
      "moka.v2"
    )).toMatchObject({ adapterCode: "moka.deepseek.v1", supported: true, fallbackApplied: true });
  });

  it("rejects only invalid or non-browser protocols", () => {
    expect(resolveAutoApplyAdapter("not a url", "moka.deepseek.v1"))
      .toMatchObject({ supported: false, reason: "invalid_application_url" });
    expect(resolveAutoApplyAdapter("file:///tmp/apply.html", "generic.web.v1"))
      .toMatchObject({ supported: false, reason: "unsupported_application_protocol" });
  });
});
