import { describe, expect, it } from "vitest";
import {
  isMokaAuthenticityDeclarationText,
  isSiteResumeParserActionText,
  isXiaopengPrivacyConsentText,
  shouldPrioritizeSiteResumeParser
} from "./page-adapter.js";

describe("site resume parser action detection", () => {
  it("recognizes parse-and-overwrite actions exposed by ATS pages", () => {
    expect(isSiteResumeParserActionText("解析并覆盖")).toBe(true);
    expect(isSiteResumeParserActionText("解析简历并填充")).toBe(true);
    expect(isSiteResumeParserActionText("将简历内容解析到下方表单？ 解析并覆盖")).toBe(true);
  });

  it("never treats final application actions as resume parsing", () => {
    expect(isSiteResumeParserActionText("提交简历")).toBe(false);
    expect(isSiteResumeParserActionText("确认投递申请")).toBe(false);
  });

  it("never proactively invokes ATS parsing, including after upload or on a blank form", () => {
    expect(shouldPrioritizeSiteResumeParser({
      resumeUploadedThisCycle: true,
      structuredResumeFieldsBlank: false
    })).toBe(false);
    expect(shouldPrioritizeSiteResumeParser({
      resumeUploadedThisCycle: false,
      structuredResumeFieldsBlank: true
    })).toBe(false);
    expect(shouldPrioritizeSiteResumeParser({
      resumeUploadedThisCycle: false,
      structuredResumeFieldsBlank: false
    })).toBe(false);
  });

  it("only accepts the exact Moka authenticity declaration for automatic checking", () => {
    expect(isMokaAuthenticityDeclarationText("本人确保以上所有信息真实有效。")).toBe(true);
    expect(isMokaAuthenticityDeclarationText("本人已郑重承诺上述信息属实")).toBe(true);
    expect(isMokaAuthenticityDeclarationText("我已阅读并同意隐私政策")).toBe(false);
  });

  it("only accepts the exact Xiaopeng privacy consent text", () => {
    expect(isXiaopengPrivacyConsentText("我已阅读并同意隐私政策")).toBe(true);
    expect(isXiaopengPrivacyConsentText("我已阅读并同意隐私政策。")).toBe(true);
    expect(isXiaopengPrivacyConsentText("我已阅读并同意隐私政策和用户授权条款")).toBe(false);
    expect(isXiaopengPrivacyConsentText("我同意用户协议")).toBe(false);
  });
});
