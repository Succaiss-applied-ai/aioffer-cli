// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  executeConsentConfirmationDriver,
  inspectConsentConfirmationInPage,
  type ConsentConfirmationPoint,
  type ConsentConfirmationProbe
} from "./consent-confirmation-driver.js";

const html = String.raw;

function installDomPrimitives() {
  if (!("innerText" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "innerText", {
      configurable: true,
      get() {
        return this.textContent ?? "";
      }
    });
  }
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    const element = this as HTMLElement;
    const top = Number(element.dataset.top ?? 0);
    const left = Number(element.dataset.left ?? 0);
    const width = Number(element.dataset.width ?? 0);
    const height = Number(element.dataset.height ?? 0);
    return {
      x: left,
      y: top,
      top,
      left,
      right: left + width,
      bottom: top + height,
      width,
      height,
      toJSON: () => ({ top, left, width, height })
    } as DOMRect;
  });
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: (x: number, y: number) => [...document.querySelectorAll<HTMLElement>("*")]
      .reverse()
      .find((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && x >= rect.left && x <= rect.right &&
          y >= rect.top && y <= rect.bottom && style.display !== "none" && style.visibility !== "hidden";
      }) ?? null
  });
}

function installVwaConsentRow() {
  document.body.innerHTML = html`
    <div class="sd-Spacing-spacing-inline-2zHeO" data-top="40" data-left="40" data-width="520" data-height="32">
      <label class="sd-Checkbox-container-3IoOq" data-top="44" data-left="40" data-width="20" data-height="20">
        <span class="sd-Checkbox-box-1tF62" data-top="44" data-left="40" data-width="20" data-height="20">
          <span class="sd-Checkbox-checker-Y9ZGJ" data-top="44" data-left="40" data-width="20" data-height="20">
            <input id="vwa-privacy" class="sd-Checkbox-input-1uFHv" type="checkbox"
              data-top="48" data-left="44" data-width="1" data-height="1" />
          </span>
        </span>
      </label>
      <div class="desc-MBfEV36lU0" data-top="40" data-left="72" data-width="450" data-height="28">
        我已阅读并同意<span id="vwa-policy-link" class="cursor-pointer-TmFk2kg1Qs"
          data-top="40" data-left="170" data-width="100" data-height="28">《隐私协议》</span>
      </div>
    </div>
    <button id="final-submit" data-top="680" data-left="240" data-width="140" data-height="40">预览并提交</button>
  `;
}

const action = {
  actionId: "vwa-policy-action",
  selector: "#vwa-policy-link",
  text: "《隐私协议》",
  kind: "consent",
  disabled: false,
  context: "我已阅读并同意《隐私协议》"
};

const point = (className: string): ConsentConfirmationPoint => ({
  x: 20,
  y: 20,
  tagName: "DIV",
  className
});

const probe = (value: Partial<ConsentConfirmationProbe>): ConsentConfirmationProbe => ({
  status: "control_missing",
  text: "我已阅读并同意《隐私协议》",
  checked: false,
  controlPoint: null,
  modalOpen: false,
  scrollPoint: null,
  confirmationPoint: null,
  confirmationText: null,
  matchingControlCount: 1,
  matchingConfirmationCount: 0,
  scrollTargetKind: null,
  controlTagName: "INPUT",
  controlInputType: "checkbox",
  controlReadOnly: false,
  controlClassNames: [],
  ...value
});

describe("generic consent confirmation driver", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installDomPrimitives();
    installVwaConsentRow();
  });

  it("binds VWA's sibling policy text to the empty-label checkbox row", () => {
    const state = inspectConsentConfirmationInPage(action);

    expect(state).toMatchObject({
      status: "ready_to_activate",
      checked: false,
      matchingControlCount: 1,
      modalOpen: false,
      text: "我已阅读并同意《隐私协议》",
      controlPoint: { tagName: "LABEL" }
    });
  });

  it("reuses the same semantic binding for an unrelated site's ARIA checkbox", () => {
    document.body.innerHTML = html`
      <section data-top="30" data-left="30" data-width="500" data-height="44">
        <div id="cross-site-consent" role="checkbox" aria-checked="false"
          data-top="40" data-left="40" data-width="24" data-height="24"></div>
        <span data-top="36" data-left="76" data-width="410" data-height="28">
          I agree to the candidate privacy notice
        </span>
      </section>
    `;

    expect(inspectConsentConfirmationInPage({
      actionId: "cross-site-consent-action",
      selector: "#cross-site-consent",
      text: "I agree to the candidate privacy notice",
      kind: "consent",
      disabled: false,
      context: "candidate privacy notice"
    })).toMatchObject({
      status: "ready_to_activate",
      matchingControlCount: 1,
      controlTagName: "DIV",
      controlInputType: "checkbox",
      checked: false
    });
  });

  it("recognizes VWA's cross-origin policy iframe and generic confirm button without touching submit", () => {
    document.body.insertAdjacentHTML("beforeend", html`
      <div class="sd-Modal-modal-mEoeY" data-top="100" data-left="120" data-width="700" data-height="560">
        <header class="sd-Modal-header-7dWsr sd-Modal-modal-header-M5h8F"
          data-top="100" data-left="120" data-width="700" data-height="48">隐私协议</header>
        <div class="sd-Modal-content-3yjyC sd-Modal-modal-content-1WURr"
          data-top="150" data-left="120" data-width="700" data-height="420">
          <iframe src="https://public-cdn.mokahr.com/MokaPrivacyPolicyV4.html"
            data-top="150" data-left="140" data-width="660" data-height="420"></iframe>
        </div>
        <footer class="sd-Modal-modal-footer-uXRhY"
          data-top="580" data-left="120" data-width="700" data-height="70">
          <button id="privacy-confirm" data-top="600" data-left="650" data-width="140" data-height="40">
            我已阅读并同意
          </button>
        </footer>
      </div>
    `);

    const state = inspectConsentConfirmationInPage(action);

    expect(state).toMatchObject({
      status: "modal_ready",
      modalOpen: true,
      scrollTargetKind: "iframe",
      confirmationText: "我已阅读并同意",
      matchingConfirmationCount: 1,
      confirmationPoint: { tagName: "BUTTON" }
    });
  });

  it.each(["确认", "我已阅读并同意"])("recognizes a personal-information disclosure consent modal with %s", confirmation => {
    document.body.insertAdjacentHTML("beforeend", html`
      <div class="sd-Modal-modal-mEoeY sd-Modal-lg-3L7_q"
        data-top="100" data-left="120" data-width="700" data-height="560">
        <header class="sd-Modal-header-7dWsr sd-Modal-modal-header-M5h8F"
          data-top="100" data-left="120" data-width="700" data-height="48">个人信息提供知情同意书</header>
        <div class="sd-Modal-content-3yjyC sd-Modal-modal-content-1WURr"
          data-top="150" data-left="120" data-width="700" data-height="420">
          取得您的单独同意后，将简历信息同步至所投递岗位的所属单位。
        </div>
        <footer class="sd-Modal-modal-footer-uXRhY"
          data-top="580" data-left="120" data-width="700" data-height="70">
          <button data-top="600" data-left="650" data-width="140" data-height="40">${confirmation}</button>
        </footer>
      </div>`);
    const before = (document.querySelector("#vwa-privacy") as HTMLInputElement).checked;
    expect(inspectConsentConfirmationInPage(action)).toMatchObject({
      status: "modal_ready", modalOpen: true, matchingConfirmationCount: 1,
      confirmationText: confirmation, confirmationPoint: {tagName: "BUTTON"}
    });
    expect((document.querySelector("#vwa-privacy") as HTMLInputElement).checked).toBe(before);
    expect(document.querySelector(".sd-Modal-modal-mEoeY")).not.toBeNull();
  });

  it("does not interpret a generic consent word as a personal-data agreement", () => {
    document.body.insertAdjacentHTML("beforeend", html`
      <div role="dialog" data-top="100" data-left="120" data-width="700" data-height="560">
        <header>是否同意参加问卷</header>
        <button data-top="600" data-left="650" data-width="140" data-height="40">确认</button>
      </div>`);
    expect(inspectConsentConfirmationInPage(action).modalOpen).toBe(false);
  });

  it("confirms an enabled agreement immediately and verifies checkbox readback", async () => {
    let phase = 0;
    const scrollPoint = vi.fn(async () => undefined);
    const waits: number[] = [];
    const clicks: string[] = [];
    const result = await executeConsentConfirmationDriver({
      action,
      inspect: async () => phase === 0
        ? probe({ status: "ready_to_activate", controlPoint: point("control") })
        : phase === 1
          ? probe({
              status: "modal_ready",
              modalOpen: true,
              scrollPoint: point("iframe"),
              confirmationPoint: point("confirmation"),
              confirmationText: "确认",
              matchingConfirmationCount: 1,
              scrollTargetKind: "iframe"
            })
          : probe({ status: "checked", checked: true }),
      clickPoint: async (target) => {
        clicks.push(target.className);
        phase += 1;
      },
      scrollPoint,
      wait: async (milliseconds) => { waits.push(milliseconds); }
    });

    expect(result).toMatchObject({ found: true, checked: true, changed: true, error: null });
    expect(clicks).toEqual(["control", "confirmation"]);
    expect(scrollPoint).not.toHaveBeenCalled();
    expect(waits).not.toContain(10_000);
  });

  it("prepares an offscreen checkbox before sending the trusted control click", async () => {
    let phase = 0;
    const inspectedPhases: string[] = [];
    const result = await executeConsentConfirmationDriver({
      action,
      inspect: async (driverPhase = "observe") => {
        inspectedPhases.push(driverPhase);
        if (phase === 0 && driverPhase === "observe") {
          return probe({ status: "control_not_clickable", controlPoint: null });
        }
        return phase === 0
          ? probe({ status: "ready_to_activate", controlPoint: point("control") })
          : probe({ status: "checked", checked: true });
      },
      clickPoint: async () => { phase = 1; },
      scrollPoint: async () => undefined,
      wait: async () => undefined
    });

    expect(result).toMatchObject({ found: true, checked: true, error: null });
    expect(inspectedPhases).toEqual(["observe", "prepare_control", "observe"]);
    expect(result.diagnostics.ledger.controlPrepareCount).toBe(1);
    expect(result.diagnostics.ledger.controlClickCount).toBe(1);
  });

  it("re-prepares a consent checkbox when a reactive form moves it after the first click", async () => {
    let phase = 0;
    const inspectedPhases: string[] = [];
    const result = await executeConsentConfirmationDriver({
      action,
      inspect: async (driverPhase = "observe") => {
        inspectedPhases.push(driverPhase);
        if (phase === 0 && driverPhase === "observe") {
          return probe({ status: "control_not_clickable", controlPoint: null });
        }
        if (phase === 0 && driverPhase === "prepare_control") {
          return probe({ status: "ready_to_activate", controlPoint: point("first-control") });
        }
        if (phase === 1 && driverPhase === "observe") {
          return probe({ status: "control_not_clickable", controlPoint: null });
        }
        if (phase === 1 && driverPhase === "prepare_control") {
          return probe({ status: "ready_to_activate", controlPoint: point("moved-control") });
        }
        return probe({ status: "checked", checked: true });
      },
      clickPoint: async () => { phase += 1; },
      scrollPoint: async () => undefined,
      wait: async () => undefined
    });

    expect(result).toMatchObject({ found: true, checked: true, error: null });
    expect(inspectedPhases).toEqual([
      "observe", "prepare_control", "observe", "prepare_control", "observe"
    ]);
    expect(result.diagnostics.ledger.controlPrepareCount).toBe(2);
    expect(result.diagnostics.ledger.controlClickCount).toBe(2);
  });

  it("scrolls to the bottom and waits ten seconds when confirmation is initially disabled", async () => {
    let unlocked = false;
    let confirmed = false;
    const scrollDeltas: number[] = [];
    const waits: number[] = [];
    const result = await executeConsentConfirmationDriver({
      action,
      inspect: async () => confirmed
        ? probe({ status: "checked", checked: true })
        : unlocked
          ? probe({
              status: "modal_ready",
              modalOpen: true,
              scrollPoint: point("iframe"),
              confirmationPoint: point("confirmation"),
              confirmationText: "确认",
              matchingConfirmationCount: 1,
              scrollTargetKind: "iframe"
            })
          : probe({
              status: "modal_confirmation_disabled",
              modalOpen: true,
              scrollPoint: point("iframe"),
              matchingConfirmationCount: 1,
              scrollTargetKind: "iframe"
            }),
      clickPoint: async () => { confirmed = true; },
      scrollPoint: async (_target, deltaY) => { scrollDeltas.push(deltaY); },
      wait: async (milliseconds) => {
        waits.push(milliseconds);
        if (milliseconds === 10_000) unlocked = true;
      }
    });

    expect(result).toMatchObject({ found: true, checked: true, error: null });
    expect(scrollDeltas).toEqual([8_000, 8_000, 8_000]);
    expect(waits).toContain(10_000);
    expect(result.diagnostics.ledger).toMatchObject({
      modalScrollCount: 3,
      confirmationClickCount: 1,
      confirmationWaitMs: 10_000
    });
  });

  it("falls back to scrolling when a direct confirmation click has no effect", async () => {
    let directAttempts = 0;
    let unlocked = false;
    let confirmed = false;
    const scrollPoint = vi.fn(async () => undefined);
    const result = await executeConsentConfirmationDriver({
      action,
      inspect: async () => confirmed
        ? probe({ status: "checked", checked: true })
        : probe({
            status: "modal_ready",
            modalOpen: true,
            scrollPoint: point("iframe"),
            confirmationPoint: point("confirmation"),
            confirmationText: "确认",
            matchingConfirmationCount: 1,
            scrollTargetKind: "iframe"
          }),
      clickPoint: async () => {
        directAttempts += 1;
        if (unlocked) confirmed = true;
      },
      scrollPoint,
      wait: async (milliseconds) => {
        if (milliseconds === 10_000) unlocked = true;
      }
    });

    expect(result).toMatchObject({ found: true, checked: true, error: null });
    expect(directAttempts).toBe(2);
    expect(scrollPoint).toHaveBeenCalledTimes(3);
    expect(result.diagnostics.ledger.confirmationWaitMs).toBe(10_000);
  });

  it("lets a lazy privacy modal settle before choosing the scroll fallback", async () => {
    let phase = 0;
    const waits: number[] = [];
    const scrollPoint = vi.fn(async () => undefined);
    const result = await executeConsentConfirmationDriver({
      action,
      inspect: async () => {
        if (phase === 0) return probe({ status: "ready_to_activate", controlPoint: point("control") });
        if (phase < 3) {
          phase += 1;
          return probe({
            status: "modal_confirmation_missing",
            modalOpen: true,
            scrollPoint: point("modal"),
            scrollTargetKind: "modal"
          });
        }
        if (phase === 3) {
          return probe({
            status: "modal_ready",
            modalOpen: true,
            scrollPoint: point("iframe"),
            confirmationPoint: point("confirmation"),
            confirmationText: "我已阅读并同意",
            matchingConfirmationCount: 1,
            scrollTargetKind: "iframe"
          });
        }
        return probe({ status: "checked", checked: true });
      },
      clickPoint: async () => { phase += 1; },
      scrollPoint,
      wait: async (milliseconds) => { waits.push(milliseconds); }
    });

    expect(result).toMatchObject({ found: true, checked: true, error: null });
    expect(scrollPoint).not.toHaveBeenCalled();
    expect(waits).not.toContain(10_000);
    expect(result.diagnostics.ledger.modalSettleWaitMs).toBe(500);
  });

  it("never treats a final-submit control outside a privacy dialog as agreement confirmation", () => {
    const state = inspectConsentConfirmationInPage(action);

    expect(state.modalOpen).toBe(false);
    expect(state.confirmationPoint).toBeNull();
    expect(state.status).toBe("ready_to_activate");
  });
});
