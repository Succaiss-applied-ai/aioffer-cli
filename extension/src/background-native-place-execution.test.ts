import { withInterruptionDependencies } from "./test-utils/interruption-dependencies.js";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { lockedControlRouteFailure } from "./control-adapters/field-routing.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareFocusEmulatedTrustedPointerSurface, prepareTrustedPointerSurface,
  releaseTrustedPointerSurface } from "./trusted-pointer-driver.js";

const background = readFileSync(new URL("./background.ts", import.meta.url), "utf8");
const start = background.indexOf("async function executeMokaNativePlaceInstructionWithTrustedPointerDriver(");
const end = background.indexOf("async function discoverEvidencedMokaLocationFieldOptionsWithTrustedFocusDriver(", start);
const javascript = transformSync(background.slice(start, end), { loader: "ts", target: "es2023" }).code;
afterEach(() => vi.unstubAllGlobals());

function setup({ active = false, failAt = "" } = {}) {
  const commands: string[] = [];
  const driver = vi.fn(async () => {
    if (failAt === "driver") throw new Error("driver interrupted");
    return {success:true,actual:"广东 深圳市 南山区",error:null,stage:"readback",availableOptions:[],
      diagnostics:{status:"committed"}};
  });
  const api = {
    tabs:{get:vi.fn(async () => ({id:22,windowId:7,active})),
      query:vi.fn(async () => [{id:11,windowId:7,active:true}]),update:vi.fn(),reload:vi.fn()},
    windows:{update:vi.fn()},
    scripting:{executeScript:vi.fn(async () => [{result:{tag:"INPUT",type:"text",readOnly:true,
      placeholder:"请输入籍贯",classNames:["sd-Dropdown-container"],value:""}}])},
    debugger:{attach:vi.fn(async () => { if (failAt === "attach") throw new Error("already attached"); }),
      sendCommand:vi.fn(async (_target, method, params) => {
        commands.push(`${method}:${JSON.stringify(params)}`);
        if (failAt === "focus" && method === "Emulation.setFocusEmulationEnabled" && params.enabled) throw new Error("focus failed");
      }),detach:vi.fn(async () => undefined)}
  };
  vi.stubGlobal("chrome", api);
  const dependencies = {
    lockedControlRouteFailure,
    isMokaApplicationUrl:() => true,isMokaNativePlaceField:() => true,
    resolveControlAdapter:() => ({code:"moka.native-place.cascader.trusted-pointer.v1",
      diagnostic:{controlName:"Moka 籍贯"},registration:{informationRequirement:{kind:"region",level:"city"}}}),
    guardFieldInformation:() => null, unsupportedRequiredControlFailure:() => "unsupported",
    prepareFocusEmulatedTrustedPointerSurface,prepareTrustedPointerSurface,releaseTrustedPointerSurface,
    executeMokaNativePlaceDriver:driver,dispatchTrustedPointerClick:vi.fn(),dispatchTrustedPointerScroll:vi.fn(),
    recruitingAiPluginInfo:() => ({buildCommit:"test"})
  };
  const run = new Function(...Object.keys(withInterruptionDependencies(dependencies)), `${javascript}\nreturn executeMokaNativePlaceInstructionWithTrustedPointerDriver;`)(...Object.values(withInterruptionDependencies(dependencies)));
  return {api,commands,driver,run:() => run(22,{url:"https://app.mokahr.com/"},
    {fieldId:"native",label:"籍贯",stableFieldKey:"basic.native_place.native",domHints:{}},
    {selector:"#native",value:"广东省 深圳市 南山区",semanticKey:"candidate.basic.nativePlace"})};
}

describe("Moka native-place production execution surface", () => {
  it("runs the same registered driver on an inactive tab without activation, reload or a fallback", async () => {
    const test = setup();
    expect(await test.run()).toMatchObject({success:true,driverFailureCode:"committed"});
    expect(test.driver).toHaveBeenCalledOnce();
    expect(test.api.tabs.update).not.toHaveBeenCalled();
    expect(test.api.tabs.reload).not.toHaveBeenCalled();
    expect(test.api.windows.update).not.toHaveBeenCalled();
    expect(test.commands).toEqual([
      'Emulation.setFocusEmulationEnabled:{"enabled":true}',
      'Input.setIgnoreInputEvents:{"ignore":false}',
      'Emulation.setFocusEmulationEnabled:{"enabled":false}'
    ]);
    expect(test.api.debugger.detach).toHaveBeenCalledOnce();
  });
  it.each(["driver", "focus"])("cleans up focus and debugger after a %s failure without repeating", async failAt => {
    const test = setup({failAt});
    expect(await test.run()).toMatchObject({success:false,driverFailureCode:"driver_interrupted"});
    expect(test.commands.at(-1)).toBe('Emulation.setFocusEmulationEnabled:{"enabled":false}');
    expect(test.api.debugger.attach).toHaveBeenCalledOnce();
    expect(test.api.debugger.detach).toHaveBeenCalledOnce();
    expect(test.driver).toHaveBeenCalledTimes(failAt === "driver" ? 1 : 0);
  });
  it("does not detach another debugger when attachment fails", async () => {
    const test = setup({failAt:"attach"});
    expect(await test.run()).toMatchObject({success:false,driverFailureCode:"driver_interrupted"});
    expect(test.driver).not.toHaveBeenCalled();
    expect(test.api.debugger.detach).not.toHaveBeenCalled();
    expect(test.commands).toEqual([]);
  });
});
