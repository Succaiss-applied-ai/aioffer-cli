import type { AutoApplyRuntimeCredential } from "./auto-apply-client.js";

interface HeartbeatDependencies {
  credential(): Promise<AutoApplyRuntimeCredential | null>;
  send(credential: AutoApplyRuntimeCredential): Promise<void>;
  active(): boolean;
  generation(): number;
}

/** Coalesces network calls only; a running ATS job never owns the heartbeat. */
export function createAutoApplyHeartbeat(dependencies: HeartbeatDependencies) {
  let pending: Promise<AutoApplyRuntimeCredential | null> | null = null;
  let pendingGeneration: number | undefined;
  return (): Promise<AutoApplyRuntimeCredential | null> => {
    const generation = dependencies.generation();
    if (pending && pendingGeneration === generation) return pending;
    const current = () => dependencies.active() && dependencies.generation() === generation;
    const attempt = async () => {
      if (!current()) return null;
      const credential = await dependencies.credential();
      if (!credential || !current()) return null;
      await dependencies.send(credential);
      return current() ? credential : null;
    };
    const flight = attempt().finally(() => {
      if (pending === flight) pending = null;
    });
    pending = flight;
    pendingGeneration = generation;
    return flight;
  };
}
