export function attemptPostSubmitSlider(options: {
  binding: {ownerId: string; deviceId: string; pageSessionKey: string; submissionAttemptId: string; tabId: number};
  read: () => Promise<{documentId?: string; observation?: unknown}>;
  currentDocumentId: () => Promise<string | undefined>;
  assertActive: () => void;
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  storage: unknown;
  locks: unknown;
  signal?: AbortSignal;
}): Promise<{status: string; reason?: string}>;
