export type PageKey = "dashboard" | "resumes" | "jobs" | "attempts" | "settings";
export type AttemptFilter = "all" | "active" | "waiting" | "finished";
export type AttemptMode = "assisted" | "auto";

export interface ProviderOption {
  label: string;
  protocol: string;
  baseUrl: string;
}

export interface LocalStatus {
  mode: "local";
  dataDir: string;
  extensionPath: string;
  jobs: number;
  exportedAt: string;
  model: { provider: string; model: string; baseUrl: string; configured: true } | null;
  mineruConfigured: boolean;
  providers: Record<string, ProviderOption>;
}

export interface LocalDevice {
  deviceId: string;
  deviceName?: string;
  pluginVersion?: string | null;
  lastSeenAt?: string;
  capabilities?: string[];
}

export interface ApplicationAsset {
  assetId: string;
  purpose: "resume" | "portrait" | "portfolio" | "other";
  fileRef: string;
  name: string;
  mediaType: string;
  sha256: string;
}

export interface ResumeVersion {
  id: string;
  createdAt: string;
  confirmedAt: string | null;
  profile: Record<string, unknown>;
  assets: ApplicationAsset[];
  text: string;
}

export interface JobCapability {
  key?: string;
  label?: string;
  reason?: string;
  allowedModes?: AttemptMode[];
}

export interface LocalJob {
  jobId: string;
  companyName: string;
  title: string;
  locations: string[];
  applicationUrl: string;
  description: string;
  channel: string;
  tags: string[];
  salary: string;
  verifiedAt: string | null;
  capability?: JobCapability;
  loginRequirement?: { status: "not_required" | "required" | "unknown"; verifiedAt?: string | null };
  deliveryEvidence?: { successfulOn?: string | null };
}

export interface JobsResponse {
  total: number;
  snapshotTotal: number;
  exportedAt: string;
  items: LocalJob[];
  capabilityCounts?: { auto: number; assisted: number; unverified: number; unavailable: number };
  companyCounts?: { total: number; auto: number; assisted: number; mixed: number };
}

export interface RequiredFieldRequest {
  fieldId: string;
  stableFieldKey: string | null;
  label: string;
  question?: string;
  type?: string;
  inputKind?: string;
  options: string[];
}

export interface AutoApplyJob {
  batchJobId: string;
  jobId: string;
  companyName: string;
  title: string;
  status: string;
  reasonCode: string | null;
  progress?: { message: string; stage: string };
  localReviewApproval?: { reviewHash: string; expiresAt: string };
  evidence?: {
    pageUrl?: string | null;
    siteConfirmation?: string | null;
    diagnostic?: { userMessage?: string };
    requiredFieldRequests?: RequiredFieldRequest[];
    failureDetails?: { reviewHash?: string; message?: string; tabId?: number };
  } | null;
}

export interface AutoApplyBatch {
  batchId: string;
  status: string;
  pauseReason?: string | null;
  updatedAt?: string;
  safety?: { allowConsentClick?: boolean };
  jobs: AutoApplyJob[];
}

export interface Attempt {
  id: string;
  mode: AttemptMode;
  deviceId: string;
  versionId: string;
  createdAt: string;
  jobIds: string[];
  batchId?: string;
  batch?: AutoApplyBatch | null;
  retryableLoginJobIds?: string[];
}

export interface PreviewRequest {
  versionId: string;
  deviceId: string;
  mode: AttemptMode;
  jobIds: string[];
  allowAutomaticFinalSubmit: boolean;
  allowConsentClick: boolean;
}

export interface PreviewResponse {
  versionId: string;
  resumeName?: string;
  mode: AttemptMode;
  jobs: Array<LocalJob & { support?: { supported?: boolean } }>;
}
