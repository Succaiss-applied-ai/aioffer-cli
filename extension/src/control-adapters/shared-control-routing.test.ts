import { describe, expect, it, vi } from "vitest";
import { CONTROL_ADAPTER_REGISTRY, resolveControlAdapter } from "./registry.js";
import { dispatchControlInstruction } from "./field-routing.js";
import type { ControlAdapterEvidence } from "./types.js";
import type { PageObservation } from "../page-adapter.js";

const city: ControlAdapterEvidence = {
  applicationUrl: "https://app.mokahr.com/campus-recruitment/bjwgby/118127#/job/fixture/apply",
  label: "申请信息 · 意向工作城市", semanticKey: "intention.preferred_city.combobox",
  type: "text", controlKind: "combobox", tagName: "INPUT", readOnly: false,
  placeholder: "选择意向工作城市 / Select preferred work city",
  classNames: ["sd-Input-input-10L0t", "sd-Input-container-2S_vM sd-Select-container-1Eq4x",
    "sd-Dropdown-container-1CigZ"]
};

describe("type-driven shared routes and narrow company exceptions", () => {
  it.each(["bjwgby/118127", "unregistered-company/1", "another-company/2"])("reuses the city component for %s", tenant => {
    const result = resolveControlAdapter({ ...city,
      applicationUrl: `https://app.mokahr.com/campus-recruitment/${tenant}#/job/fixture/apply` });
    expect(result).toMatchObject({ code: "moka.work-city.trusted-focus.v1", driver: "site_deterministic",
      diagnostic: { routingScope: "shared_component", controlType: "custom_location_cascader" } });
  });

  it("selects the registered exception independently of array order, only for that control", () => {
    const applicationUrl = "https://app.mokahr.com/social-recruitment/high-flyer/140576#/job/fixture/apply";
    for (const registry of [CONTROL_ADAPTER_REGISTRY, [...CONTROL_ADAPTER_REGISTRY].reverse()]) {
      expect(resolveControlAdapter({ ...city, applicationUrl }, registry).code).toBe("moka.deepseek.location.trusted-focus.v4");
      expect(resolveControlAdapter({ ...city, applicationUrl, label: "信息来源渠道", semanticKey: "other.recruiting_source.combobox",
        placeholder: "请选择" }, registry).code).toBe("moka.recruiting-source.trusted-focus.v1");
    }
    expect(CONTROL_ADAPTER_REGISTRY.every(registration => registration.routingScope)).toBe(true);
  });

  it.each(["https://a.example/apply", "https://b.example/apply", city.applicationUrl])("uses actual native semantics on %s", applicationUrl => {
    for (const [type, tagName, kind, expected] of [
      ["text", "INPUT", "native", "generic.native.text.v1"],
      ["select", "SELECT", "native", "generic.native.select.v1"],
      ["date", "INPUT", "native", "generic.native.temporal.v1"]
    ]) {
      expect(resolveControlAdapter({ ...city, applicationUrl, type, tagName, controlKind: kind, classNames: [],
        placeholder: "期望城市" }).diagnostic.registrationId).toBe(expected);
    }
  });

  it.each([
    { readOnly: true }, { classNames: ["custom-select"] },
    { applicationUrl: "https://unrelated.example/apply" },
    { applicationUrl: city.applicationUrl.replace("/apply", "") },
    { placeholder: "推荐码", label: "意向工作城市" },
    { label: "籍贯", placeholder: "籍贯", semanticKey: "basic.native_place.combobox", classNames: ["custom-cascader"] }
  ])("never guesses an unknown, conflicting or unrelated control: %j", change => {
    expect(resolveControlAdapter({ ...city, ...change }).driver).toBe("unsupported");
  });

  it("fails ambiguous registrations before any Driver, even if their adapter codes agree", () => {
    const registration = CONTROL_ADAPTER_REGISTRY.find(item => item.adapterCode === "moka.work-city.trusted-focus.v1")!;
    const result = resolveControlAdapter(city, [registration, { ...registration, registrationId: "duplicate" }]);
    expect(result).toMatchObject({ driver: "unsupported", reason: "ambiguous_control_registration",
      diagnostic: { matchedRegistrationIds: [registration.registrationId, "duplicate"] } });
  });

  it("executes the shared route once and never falls through to native on failure", async () => {
    const field = { fieldId: "city", stableFieldKey: city.semanticKey, label: city.label,
      selector: "#city", type: "combobox", controlKind: "combobox", required: true, currentValue: "", options: [],
      domHints: { ...city, inputType: "text" } };
    const shared = vi.fn(async () => ({ fieldId: "city", success: false, expected: "北京", actual: "",
      error: "location_control_interaction_failed: open", driverStage: "open" }));
    const native = vi.fn();
    const result = await dispatchControlInstruction({ url: city.applicationUrl, pageStage: "application_form", fields: [field] } as PageObservation,
      { fieldId: "city", stableFieldKey: city.semanticKey, expectedLabel: city.label, selector: "#stale", type: "combobox", value: "北京" },
      { "moka.work-city.trusted-focus.v1": shared, "generic.native.v1": native });
    expect(result).toMatchObject({ success: false, driverStage: "open" });
    expect(shared).toHaveBeenCalledOnce();
    expect(native).not.toHaveBeenCalled();
  });
});
