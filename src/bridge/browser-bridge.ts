import type { ApplicationItem, FormRequirement } from "../domain.js";

export interface ComputerUsePolicy {
  maxSteps: number;
  requireFreshObservationAfterEachAction: true;
  forbiddenActions: Array<"final_submit" | "credential_entry" | "captcha" | "legal_consent_inference">;
}

export type BrowserCommand =
  | {
      id: string;
      type: "open_job";
      applicationItemId: string;
      url: string;
    }
  | {
      id: string;
      type: "inspect_login";
      applicationItemId: string;
      url: string;
    }
  | {
      id: string;
      type: "observe_form";
      applicationItemId: string;
      url: string;
    }
  | {
      id: string;
      type: "fill_form";
      applicationItemId: string;
      answers: Record<string, unknown>;
      requirements: FormRequirement[];
      strategy: "dom_first";
    }
  | {
      id: string;
      type: "computer_use_fill";
      applicationItemId: string;
      unresolvedFieldIds: string[];
      valueRefs: Record<string, string>;
      policy: ComputerUsePolicy;
    }
  | {
      id: string;
      type: "submit";
      applicationItemId: string;
      approvalManifestHash: string;
    };

export interface BrowserCommandReceipt {
  commandId: string;
  deviceId: string;
  status: "queued" | "running" | "completed" | "failed";
  result?: Record<string, unknown>;
  error?: string;
}

export interface DeviceBridge {
  dispatch(
    userId: string,
    command: BrowserCommand
  ): Promise<BrowserCommandReceipt>;
}

export class MemoryDeviceBridge implements DeviceBridge {
  readonly commands: Array<{ userId: string; command: BrowserCommand }> = [];

  async dispatch(
    userId: string,
    command: BrowserCommand
  ): Promise<BrowserCommandReceipt> {
    this.commands.push({ userId, command: structuredClone(command) });
    return {
      commandId: command.id,
      deviceId: "memory-device",
      status: "queued"
    };
  }
}

export function openJobCommand(item: ApplicationItem): BrowserCommand {
  return {
    id: crypto.randomUUID(),
    type: "open_job",
    applicationItemId: item.id,
    url: item.job.applicationUrl
  };
}
