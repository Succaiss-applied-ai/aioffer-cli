import {
  requestedApplicationEngineFromPayload,
  type ApplicationEngine,
  type ApplicationEngineCode,
  type ApplicationEngineRoute
} from "./contracts.js";

export class ApplicationEngineRouter<TCommand, TCredential, TResult> {
  private readonly engines = new Map<ApplicationEngineCode, ApplicationEngine<TCommand, TCredential, TResult>>();

  constructor(engines: Array<ApplicationEngine<TCommand, TCredential, TResult>>) {
    for (const engine of engines) this.engines.set(engine.code, engine);
    if (!this.engines.has("legacy")) throw new Error("Application Engine Router 必须注册 legacy 内核");
  }

  route(payload: unknown): ApplicationEngineRoute {
    const requested = requestedApplicationEngineFromPayload(payload);
    if (this.engines.has(requested)) {
      return { requested, selected: requested, fellBack: false, fallbackReason: null };
    }
    return {
      requested,
      selected: "legacy",
      fellBack: requested !== "legacy",
      fallbackReason: requested === "legacy" ? null : `${requested} 尚未注册，提交边界前使用 legacy`
    };
  }

  async execute(command: TCommand, credential: TCredential, payload: unknown): Promise<TResult> {
    const route = this.route(payload);
    return this.engines.get(route.selected)!.execute(command, credential);
  }
}
