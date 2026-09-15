import { describe, expect, it } from "vitest";
import {
  autoApplyBoundTabUrlMatchesApplication,
  autoApplyTerminalNavigationFromUrl,
  autoApplyTerminalNavigationMatchesSubmission,
  autoApplyTabUrlMatchesApplication,
  isFeishuApplicationSuccessUrl,
  isFeishuJobDetailUrl,
  isMokaApplicationSuccessUrl,
  isMokaJobDetailUrl,
  isXiaopengApplicationUrl,
  isXiaopengJobDetailUrl,
  selectExactLocalValidationTab
} from "./auto-apply-navigation.js";

const application = "https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/01416da2-3c8a-4a20-bbb3-1c925d0facf1/apply";

describe("auto apply navigation recovery", () => {
  it("attributes jobless Feishu terminal navigation only to an already submitted bound attempt", () => {
    const application = "https://xtool.jobs.feishu.cn/index/resume/job-1/apply";
    const terminal = { outcome: "succeeded" as const, url: "https://xtool.jobs.feishu.cn/index/resume/applied",
      observedAt: "2026-09-09T00:00:05.000Z" };
    expect(autoApplyTerminalNavigationMatchesSubmission(terminal, application, "2026-09-09T00:00:00.000Z")).toBe(true);
    expect(autoApplyTerminalNavigationMatchesSubmission(terminal, application)).toBe(false);
    expect(autoApplyTerminalNavigationMatchesSubmission(terminal, application, "2026-09-09T00:00:06.000Z")).toBe(false);
    expect(autoApplyTerminalNavigationMatchesSubmission(terminal, application.replace("xtool.", "other."), "2026-09-09T00:00:00.000Z")).toBe(false);
  });
  it.each(["index", "campus", "285572", ""])("recognizes and binds a Feishu %s receipt only inside its original tenant and scope", scope => {
    const prefix = scope ? `/${scope}` : "";
    const form = `https://xtool.jobs.feishu.cn${prefix}/resume/job-1/apply`;
    const receipt = `https://xtool.jobs.feishu.cn${prefix}/resume/applied`;
    expect(isFeishuApplicationSuccessUrl(receipt)).toBe(true);
    expect(autoApplyBoundTabUrlMatchesApplication(receipt, form)).toBe(true);
    // URL discovery still cannot adopt an unrelated existing receipt tab.
    expect(autoApplyTabUrlMatchesApplication(receipt, form)).toBe(false);
    expect(autoApplyTerminalNavigationFromUrl(receipt, "2026-09-09T00:00:00.000Z"))
      .toEqual({ outcome: "succeeded", url: receipt, observedAt: "2026-09-09T00:00:00.000Z" });
    expect(autoApplyBoundTabUrlMatchesApplication(receipt.replace("xtool.", "other."), form)).toBe(false);
    expect(autoApplyBoundTabUrlMatchesApplication(receipt.replace(`${prefix}/resume`, "/other-scope/resume"), form)).toBe(false);
  });

  it.each([
    "https://xtool.jobs.feishu.cn/index/resume/job-1/apply",
    "https://xtool.jobs.feishu.cn/index/resume/applied-later",
    "https://xtool.jobs.feishu.cn/index/login?redirect=/index/resume/applied",
    "https://xtool.jobs.feishu.cn.evil.test/index/resume/applied",
    "https://example.test/index/resume/applied",
    "https://xtool.jobs.feishu.cn/index/extra/resume/applied"
  ])("does not register another route as Feishu receipt: %s", url => {
    expect(isFeishuApplicationSuccessUrl(url)).toBe(false);
    expect(autoApplyTerminalNavigationFromUrl(url)).toBeNull();
  });
  it("recognizes the Moka receipt route as authoritative success", () => {
    expect(isMokaApplicationSuccessUrl(
      "https://app.mokahr.com/social-recruitment/high-flyer/140576#/apply/thanks"
    )).toBe(true);
    expect(isMokaApplicationSuccessUrl(
      "https://app.mokahr.com/apply/thanks"
    )).toBe(true);
    expect(isMokaApplicationSuccessUrl(
      "https://app.mokahr.com/campus-recruitment/phlexing/100123#/job/9e27eae4-6aa9-404f-aec8-90ac908ad98f/campus_apply/thanks?jobId=9e27eae4-6aa9-404f-aec8-90ac908ad98f"
    )).toBe(true);
  });

  it("recognizes only a Moka job detail route for the equivalent-entry driver", () => {
    expect(isMokaJobDetailUrl(
      "https://app.mokahr.com/campus-recruitment/shopee/170008#/job/14467caa-7995-428a-a916-5a7e7f7ffde4"
    )).toBe(true);
    expect(isMokaJobDetailUrl(application)).toBe(false);
    expect(isMokaJobDetailUrl(
      "https://app.mokahr.com/campus-recruitment/shopee/170008#/apply/thanks"
    )).toBe(false);
  });

  it("reuses the same application route after a React navigation", () => {
    expect(autoApplyTabUrlMatchesApplication(application, application)).toBe(true);
  });

  it("allows the receipt route to resume the bound Moka application", () => {
    expect(autoApplyTabUrlMatchesApplication(
      "https://app.mokahr.com/social-recruitment/high-flyer/140576#/apply/thanks",
      application
    )).toBe(true);
  });

  it("keeps a campus_apply receipt bound to its original Moka job", () => {
    const campusApplication = "https://app.mokahr.com/campus-recruitment/phlexing/100123#/job/9e27eae4-6aa9-404f-aec8-90ac908ad98f/apply";
    const campusReceipt = "https://app.mokahr.com/campus-recruitment/phlexing/100123#/job/9e27eae4-6aa9-404f-aec8-90ac908ad98f/campus_apply/thanks?jobId=9e27eae4-6aa9-404f-aec8-90ac908ad98f";

    expect(autoApplyTabUrlMatchesApplication(campusReceipt, campusApplication)).toBe(true);
    expect(autoApplyBoundTabUrlMatchesApplication(campusReceipt, campusApplication)).toBe(true);
    expect(autoApplyTabUrlMatchesApplication(
      campusReceipt.replace("phlexing/100123", "other/100124"),
      campusApplication
    )).toBe(false);
  });

  it("captures the Moka thanks navigation before a script-opened tab can close", () => {
    const receipt = "https://app.mokahr.com/campus-recruitment/bjwgby/118127#/job/b6d725c5-9972-44df-a513-3fbbea7806a2/campus_apply/thanks?candidateId=798424465";
    expect(autoApplyTerminalNavigationFromUrl(receipt, "2026-09-05T14:05:00.000Z"))
      .toEqual({
        outcome: "succeeded",
        url: receipt,
        observedAt: "2026-09-05T14:05:00.000Z"
      });
  });

  it("does not convert ordinary form, guidance or non-Moka thanks URLs into terminal navigation", () => {
    expect(autoApplyTerminalNavigationFromUrl(
      "https://app.mokahr.com/campus-recruitment/bjwgby/118127#/job/b6d725c5-9972-44df-a513-3fbbea7806a2/apply"
    )).toBeNull();
    expect(autoApplyTerminalNavigationFromUrl(
      "https://other.example/apply/thanks"
    )).toBeNull();
  });

  it("rejects a different Moka job that is not a receipt route", () => {
    expect(autoApplyTabUrlMatchesApplication(
      "https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/apply",
      application
    )).toBe(false);
  });

  it("rejects a receipt on another ATS tenant", () => {
    expect(autoApplyTabUrlMatchesApplication(
      "https://app.mokahr.com/social-recruitment/other/999#/apply/thanks",
      application
    )).toBe(false);
  });

  it("binds generic Moka social and campus tenants without cross-tenant reuse", () => {
    const social = "https://app.mokahr.com/social-recruitment/bshg/140686#/job/a871a3d5-67a3-4dc9-aa18-f993166dbda9/apply";
    const campus = "https://app.mokahr.com/campus-recruitment/mbcloud/150116#/job/a989fb77-19c3-4667-b7be-e5a7c8eabd19/apply";
    expect(autoApplyTabUrlMatchesApplication(
      "https://app.mokahr.com/social-recruitment/bshg/140686#/apply/thanks",
      social
    )).toBe(true);
    expect(autoApplyTabUrlMatchesApplication(
      "https://app.mokahr.com/campus-recruitment/mbcloud/150116#/apply/thanks",
      campus
    )).toBe(true);
    expect(autoApplyTabUrlMatchesApplication(
      "https://app.mokahr.com/campus-recruitment/tal/146099#/apply/thanks",
      campus
    )).toBe(false);
  });

  it("allows submit-disabled local acceptance to reclaim only the exact open URL", () => {
    const otherJob = application.replace("01416da2-3c8a-4a20-bbb3-1c925d0facf1", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    const tabs = [
      { id: 11, url: application },
      { id: 12, url: otherJob }
    ];
    expect(selectExactLocalValidationTab(tabs, application)?.id).toBe(11);
    expect(selectExactLocalValidationTab([tabs[1]!], application)).toBeUndefined();
  });

  it("matches Xiaopeng apply/applyv and resume/position routes only for the same job", () => {
    const xiaopeng = "https://xiaopeng.jobs.feishu.cn/index/resume/7627105760351177010/applyv";
    expect(autoApplyTabUrlMatchesApplication(
      "https://xiaopeng.jobs.feishu.cn/index/resume/7627105760351177010/apply",
      xiaopeng
    )).toBe(true);
    expect(autoApplyTabUrlMatchesApplication(
      "https://xiaopeng.jobs.feishu.cn/index/position/7627105760351177010/applyv",
      xiaopeng
    )).toBe(true);
    expect(autoApplyTabUrlMatchesApplication(
      "https://xiaopeng.jobs.feishu.cn/index/resume/other-job/applyv",
      xiaopeng
    )).toBe(false);
  });

  it("recognizes Xiaopeng campus job details and keeps the same job bound through apply/login", () => {
    const canonicalDetail = "https://xiaopeng.jobs.feishu.cn/campus/position/7658239728123545907/detail";
    const legacyDetail = "https://xiaopeng.jobs.feishu.cn/campus/position/detail/7658239728123545907";
    const apply = "https://xiaopeng.jobs.feishu.cn/campus/resume/7658239728123545907/apply";
    const login = "https://xiaopeng.jobs.feishu.cn/campus/login?redirect_path=%2Fresume%2F7658239728123545907%2Fapply";
    expect(isXiaopengJobDetailUrl(canonicalDetail)).toBe(true);
    expect(isXiaopengJobDetailUrl(legacyDetail)).toBe(true);
    expect(isXiaopengJobDetailUrl(
      "https://xiaopeng.jobs.feishu.cn/index/position/detail/7679439372929157419"
    )).toBe(true);
    expect(isXiaopengApplicationUrl(
      "https://xiaopeng.jobs.feishu.cn/index/position/detail/7679439372929157419"
    )).toBe(true);
    expect(isXiaopengApplicationUrl(canonicalDetail)).toBe(true);
    expect(autoApplyTabUrlMatchesApplication(apply, canonicalDetail)).toBe(true);
    expect(autoApplyBoundTabUrlMatchesApplication(login, canonicalDetail)).toBe(true);
    expect(autoApplyBoundTabUrlMatchesApplication(
      "https://xiaopeng.jobs.feishu.cn/campus/login?redirect_path=%2Fresume%2Fother-job%2Fapply",
      canonicalDetail
    )).toBe(false);
  });

  it("routes every Feishu tenant detail family to the guarded Feishu entry driver", () => {
    expect(isFeishuJobDetailUrl(
      "https://xtool.jobs.feishu.cn/index/position/7678562627672541486/detail"
    )).toBe(true);
    expect(isFeishuJobDetailUrl(
      "https://another.jobs.feishu.cn/campus/position/detail/job-1"
    )).toBe(true);
    expect(isFeishuJobDetailUrl(
      "https://dexmal-inc.jobs.feishu.cn/285572/position/7675695124068534534/detail"
    )).toBe(true);
    expect(isFeishuJobDetailUrl(
      "https://dexmal-inc.jobs.feishu.cn/285572/position/detail/7675695124068534534"
    )).toBe(true);
    expect(isFeishuJobDetailUrl(
      "https://everrising.jobs.feishu.cn/graduate/position/7679341586716002596/detail"
    )).toBe(true);
    expect(isFeishuJobDetailUrl(
      "https://xtool.jobs.feishu.cn/index/login"
    )).toBe(false);
    expect(isFeishuJobDetailUrl(
      "https://jobs.example.com/index/position/job-1/detail"
    )).toBe(false);
  });

  it.each(["dcar", "xtool", "xiaopeng", "unrelated"])("preserves a bound %s tab across canonicalization, apply and login", tenant => {
    const origin = `https://${tenant}.jobs.feishu.cn`;
    const detail = `${origin}/campus/position/detail/job-1`;
    for (const path of ["/campus/position/job-1/detail", "/campus/resume/job-1/apply",
      "/campus/login?redirect_path=%2Fresume%2Fjob-1%2Fapply"]) {
      expect(autoApplyBoundTabUrlMatchesApplication(`${origin}${path}`, detail)).toBe(true);
    }
    for (const path of ["/campus/resume/job-2/apply", "/index/resume/job-1/apply", "/campus/login",
      "/campus/login?redirect_path=%2Fresume%2Fjob-2%2Fapply",
      "/campus/login?redirect_path=%2Findex%2Fresume%2Fjob-1%2Fapply",
      "/campus/login?redirect_path=https%3A%2F%2Fother.jobs.feishu.cn%2Fresume%2Fjob-1%2Fapply"]) {
      expect(autoApplyBoundTabUrlMatchesApplication(`${origin}${path}`, detail)).toBe(false);
    }
    expect(autoApplyBoundTabUrlMatchesApplication(`https://other.jobs.feishu.cn/campus/resume/job-1/apply`, detail)).toBe(false);
  });

  it("does not choose an arbitrary identical URL during explicit local acceptance", () => {
    expect(selectExactLocalValidationTab([{id: 1, url: application}, {id: 2, url: application}], application)).toBeUndefined();
  });

  it("allows only the explicit local Xiaopeng fixture route", () => {
    const localApplication = "http://127.0.0.1:33250/__recruiting_ai_test__/xiaopeng/apply?jobId=local-1";
    expect(isXiaopengApplicationUrl(localApplication)).toBe(true);
    expect(isXiaopengApplicationUrl(
      "http://127.0.0.1:33250/not-a-xiaopeng-fixture"
    )).toBe(false);
    expect(autoApplyTabUrlMatchesApplication(localApplication, localApplication)).toBe(true);
    expect(autoApplyTabUrlMatchesApplication(
      "http://127.0.0.1:33250/__recruiting_ai_test__/xiaopeng/apply?jobId=local-2",
      localApplication
    )).toBe(false);
  });

  it("allows only the persisted Xiaopeng tab to remain bound through login", () => {
    const xiaopeng = "https://xiaopeng.jobs.feishu.cn/index/resume/7627105760351177010/applyv";
    const login = "https://xiaopeng.jobs.feishu.cn/index/login?redirect_path=%2Findex%2Fresume%2F7627105760351177010%2Fapplyv";
    expect(autoApplyTabUrlMatchesApplication(login, xiaopeng)).toBe(false);
    expect(autoApplyBoundTabUrlMatchesApplication(login, xiaopeng)).toBe(true);
    expect(autoApplyBoundTabUrlMatchesApplication(
      "https://xiaopeng.jobs.feishu.cn/index/login?redirect_path=%2Findex%2Fresume%2Fother-job%2Fapplyv",
      xiaopeng
    )).toBe(false);
  });

});
