import { describe, expect, it } from "vitest";
import { modelHttpError, toPublicError } from "./errors.js";

describe("public error contract", () => {
  it("maps workflow failures to a stable code and user action", () => {
    expect(toPublicError(new Error("仍有岗位尚未读取真实表单"))).toEqual({
      code: "FORM_NOT_OBSERVED",
      stage: "form_observation",
      message: "仍有岗位尚未读取真实表单",
      retryable: true,
      userAction: "保持招聘页面打开；若要求登录，请先完成登录。"
    });
  });

  it("declares rate limits as retryable but authentication failures as final", () => {
    expect(modelHttpError(429, "too many requests").publicError).toMatchObject({
      code: "MODEL_RATE_LIMITED",
      retryable: true
    });
    expect(modelHttpError(401, "invalid token").publicError).toMatchObject({
      code: "MODEL_AUTH_FAILED",
      retryable: false
    });
  });
});
