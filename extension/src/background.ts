import { installLocalTransportGuard } from "./local-network.js";
import { startAutoApplyLeaseWatchdog } from "./auto-apply-lease-watchdog.js";
import { readExecutionProfile } from "./execution-profile.js";
import { rememberAutoApplyProductOrigin } from "./auto-apply-client.js";
import { projectCandidateInformation } from "./candidate-information-projection.js";
import { applicationCallsSettled } from "./auto-apply-interruption.js";
import { AutoApplyJobStoppedError, watchAutoApplyJobStop, reconcileAutoApplyJobStops } from "./auto-apply-job-stop.js";
import { pendingAutoApplyJobStops, acknowledgeAutoApplyJobStop, type AutoApplyJobStop } from "./auto-apply-client.js";
import {
  expiredInterruptionReceipt, AutoApplyUserInterruptedError, interruptionDiagnostic,
  armApplicationInterruption, disarmApplicationInterruption, executeInterruptibleScript,
  sendInterruptibleDebuggerCommand, INTERRUPTION_JOURNAL_KEY, INTERRUPTION_SESSION_KEY,
  interruptionOwner, isControlledReload, recoveredInterruption,
  type ControlledExecution, type InterruptionKind
} from "./auto-apply-interruption.js";
import { createAutoApplyCompletionOutbox, type CompletionOutboxFlushResult } from "./auto-apply-completion-outbox.js";
import { createAutoApplyStorageQueue } from "./auto-apply-storage-queue.js";
import { createAutoApplyHeartbeat } from "./auto-apply-heartbeat.js";
import { openTalentBrewApplicationFromDetailPage,
  type TalentBrewEntryResult, type TalentBrewEntryTarget } from "./talentbrew-application-entry.js";
import { executeWithAutoApplySubmissionLifecycleGuard, AutoApplySubmissionGuardTimeoutError, submissionPhaseCall } from "./auto-apply-submit-lifecycle.js";
import { attemptPostSubmitSliderWithDebugger, type PostSubmitSliderContext } from "./post-submit-slider.js";
import { submissionActionPatterns, isPreviewSubmissionText, type SubmissionActionPatterns } from "./submission-action-policy.js";
import { executeMokaSharedSelectDriver,
  isMokaFlatSelectInteractionFailure } from "./control-adapters/moka-shared-select-driver.js";
import {executeMokaSearchSelectDriver} from "./control-adapters/moka-search-select-driver.js";
import {executeMokaCityMultiDriver} from "./control-adapters/moka-city-multi-driver.js";
import {
  executeFeishuFormilySelectDriver,
  inspectFeishuFormilySelectInPage
} from "./control-adapters/feishu-formily-select-driver.js";
import { uniqueCityOption } from "./city-option-matching.js";
import { isPreferredWorkCityField } from "./preferred-city-policy.js";
import {
  createSearchPlanFromFilters,
  refineSearchPlanFromFilters
} from "../../src/search/search-plan.js";
import {
  resumeKnowledgeSnapshotSchema,
  type JobRecord,
  type ResumeKnowledgeSnapshot,
  type SearchPlan
} from "../../src/domain.js";
import type { DiscoveryRun } from "../../src/search/job-discovery.js";
import {
  CloudServiceClient,
  CloudServiceError,
  type CloudFormField
} from "../../src/cloud/cloud-service-client.js";
import {
  modelHttpError,
  RecruitingError,
  toPublicError
} from "../../src/errors.js";
import {
  auditFilledFormWithModel,
  mapFormFieldsWithModel,
  parseSearchPromptWithModel,
  prepareFormPrefillWithModel,
  type BrowserModelSettings,
  type ModelExecutionEvidence
} from "../../src/model/model-tasks.js";
import {
  executeObservedPageAction,
  isMokaAuthenticityDeclarationText,
  isXiaopengPrivacyConsentText,
  openFeishuApplicationFromDetailPage,
  openMokaApplicationFromDetailPage,
  observeApplicationPage,
  openGenericApplicationFromDetailPage,
  openXiaopengApplicationFromDetailPage,
  prepareApplicationFormValidationBlur,
  resolveApplicationUserAction,
  type FillInstruction,
  type FillResult,
  type ApplicationUserAction,
  type FinalSubmitExecutionResult,
  type PageFieldObservation,
  type PageObservation,
  type PageActionExecutionResult,
  type MokaApplicationEntryTarget,
  type ResumeFilePayload
} from "./page-adapter.js";
import {
  executeConsentConfirmationDriver,
  inspectConsentConfirmationInPage
} from "./control-adapters/consent-confirmation-driver.js";
import {
  calendarControlHasTemporalEvidence,
  calendarControlUsesMonthPrecision,
  dateControlInteractionFailure,
  datePickerInputTargetTop,
  datePickerNavigationPlan,
  isDateControlInteractionFailure,
  mokaCalendarPanelStructureMatches,
  mokaPickerHeaderParserExpression,
  mokaPickerMonthParserExpression,
  structuredDateFromValue,
  structuredMonthDateFromValue,
  structuredDateReadbackMatches,
  yearRangeNavigationPlan
} from "./date-control-strategy.js";
import {
  openMokaCalendarOnce,
  isGarenaZeroYearMonthPanel,
  mokaCalendarOpeningFailureMessage,
  type MokaCalendarProbe
} from "./control-adapters/moka-calendar-opening.js";
import {
  CALENDAR_VISIBILITY_MAX_CORRECTIONS,
  calendarTargetVisibilityCorrection,
  calendarTargetVisibilityProgress,
  calendarTargetVisibilityStep,
  settleCalendarTargetGeometry,
  settleCalendarVisibilityProgress,
  shiftCalendarSurfaceInPage,
  type CalendarTargetGeometry
} from "./calendar-target-visibility.js";
import {
  dispatchTrustedPointerClick,
  dispatchTrustedPointerScroll,
  prepareFocusEmulatedTrustedPointerSurface,
  releaseTrustedPointerSurface,
  trustedPointerViewportCandidates,
  trustedPointerViewportPoint,
  type CdpCommandSender
} from "./trusted-pointer-driver.js";
import { withBackgroundTabEntrySurface } from "./background-tab-entry-surface.js";
import { resolveControlAdapter } from "./control-adapters/registry.js";
import { bindObservedInstruction, controlRoutingFailure, dispatchControlInstruction, evidenceForField, executeSelectedControl, lockedControlRouteFailure } from "./control-adapters/field-routing.js";
import { executeMokaRangePresentInTab } from "./control-adapters/moka-range-present.js";
import { executeNativeControlInTab, executeFeishuResumeUploadInTab } from "./control-adapters/browser-dispatch.js";
import {
  assessFieldInformation,
  fieldInformationRequirement,
  temporalFieldPartValue,
  withFieldInformationRequirements
} from "./field-information.js";
import { guardFieldInformation } from "./field-information-guard.js";
import { applicationTabShouldOpenActive } from "./tab-focus-policy.js";
import {
  controlAdapterFailureDetails,
  isUnsupportedRequiredControlFailure,
  unsupportedRequiredControlFailure
} from "./control-adapters/failures.js";
import {
  executeDeepSeekLocationDriver,
  inspectDeepSeekLocationCommitPointInPage,
  isDeepSeekLocationApplicationUrl,
  isDeepSeekLocationField,
  isDeepSeekLocationInteractionFailure
} from "./control-adapters/deepseek-location-driver.js";
import type { DeepSeekLocationDriverDiagnostics } from "./control-adapters/deepseek-location-driver.js";
import {
  executeMokaLocationOptionDiscoveryDriver
} from "./control-adapters/moka-location-option-discovery-driver.js";
import {
  executeMokaNativePlaceDriver,
  isMokaNativePlaceInteractionFailure
} from "./control-adapters/moka-native-place-driver.js";
import {
  executeMokaRecruitingSourceDriver,
  inspectMokaRecruitingSourceCommitPointInPage,
  isMokaEqhrTravelAcceptanceApplicationUrl,
  isMokaEqhrTravelAcceptanceField,
  isMokaYongxingEthnicityApplicationUrl,
  isMokaYongxingEthnicityField,
  isMokaRecruitingSourceApplicationUrl,
  isMokaRecruitingSourceField,
  isMokaRecruitingSourceInteractionFailure,
  isMokaSinaWeiboFrequencyApplicationUrl,
  isMokaSinaWeiboFrequencyField,
  isMokaSungrowApplicationUrl,
  isMokaSungrowIdentityDocumentTypeField,
  isMokaSungrowRelativeEmploymentField
} from "./control-adapters/moka-recruiting-source-driver.js";
import {
  executeMokaYearMonthSelectDriver,
  isMokaYearMonthSelectApplicationUrl,
  isMokaYearMonthSelectField,
  isMokaYearMonthSelectInteractionFailure,
  type MokaYearMonthSelectDriverDiagnostics
} from "./control-adapters/moka-year-month-select-driver.js";
import type {
  MokaRecruitingSourceDriverDiagnostics
} from "./control-adapters/moka-recruiting-source-driver.js";
import {
  executeMokaTap4funBirthDateDriver
} from "./control-adapters/moka-tap4fun-birth-date-driver.js";
import {
  registeredControlReadbackMatches
} from "./control-adapters/readback-policy.js";
import type {
  MokaTap4funBirthDateDriverDiagnostics
} from "./control-adapters/moka-tap4fun-birth-date-driver.js";
import {
  executeFeishuMonthPeriodDriver,
  isFeishuMonthPeriodApplicationUrl,
  isFeishuMonthPeriodField,
  observeFeishuMonthPeriodFieldsInPage
} from "./control-adapters/feishu-month-period-driver.js";
import {
  isFeishuFormilyApplicationUrl,
  observeFeishuFormilyFieldPatchesInPage
} from "./form-dialects/feishu-formily.js";
import { applyApplicationFieldDialects } from "./form-dialects/application-field-dialects.js";
import { observeApplicationWithDialectsInTab } from "./control-adapters/browser-dispatch.js";
import { needsFeishuAtsxChoiceDiscovery, prepareFeishuAtsxChoiceInTab, executeFeishuAtsxChoiceInTab } from "./control-adapters/feishu-atsx-choice-runtime.js";
import { executeFeishuSchoolSearchInTab } from "./control-adapters/feishu-school-search-runtime.js";
import { executeFeishuSelectorSearchInTab } from "./control-adapters/feishu-selector-search-runtime.js";
import { executeFeishuYearInTab } from "./control-adapters/feishu-year-runtime.js";
import { executeFeishuMultiSelectInTab } from "./control-adapters/feishu-multi-select-runtime.js";
import { executeFeishuRadioGroupInTab } from "./control-adapters/feishu-radio-group-runtime.js";
import {decodeExactOptionSet,isFeishuFormilyOptionSet,nativeSelectRequestedValues} from "./form-dialects/feishu-option-set.js";
import { selectorSearchValues } from "./selector-search-values.js";
import { needsFeishuSelectorDiscovery, isFeishuLocationTree } from "./control-adapters/feishu-selector-discovery.js";
import { prepareFeishuSelectorInTab } from "./control-adapters/feishu-selector-discovery-runtime.js";
import {
  executeXToolFormilyRepeatNativeDriver,
  inspectXToolFormilyRepeatNativeInPage,
  isXToolFormilyApplicationUrl,
  isXToolFormilyRepeatNativeField
} from "./control-adapters/xtool-formily-repeat-native-driver.js";
import {
  authoritativeCandidateFactForField,
  candidateBlockingRequiredFieldFailures,
  candidateInformationRequestForUnavailableOptions,
  candidateInformationRequestsForMissingFields,
  siteRejectedInformationRequests,
  classifyVisualFailureReason,
  confirmedCurrentJobFactForField,
  enrichVisionCandidateFacts,
  findDynamicReadbackField,
  isThirdPartyPersonField,
  isVisionValueTraceable,
  rangeEndChoiceForField,
  iterativeVisionPolicy,
  nextDeterministicKnownFactAction,
  isPhoneCallingCodeField,
  phoneCallingCodeReadbackMatches,
  optionalFieldEnrichmentPending,
  registerVisionFieldAttempt,
  soleRequiredMokaPreferredCityOption,
  thirdPartyIdentityCollision,
  visionPlanningObservation,
  visualFieldFailureBlocksSubmission,
  visualFailureDetails,
  visionFormReadyForFinalReview,
  visionReadbackMatches,
  visionObservationStateFingerprint,
  visualSemanticConflict,
  type VisionFillAttempt
} from "./vision-form-runtime.js";
import { prepareScopedWorkCityChoices } from "./preferred-city-preflight.js";
import { isInvalidVisionPlanWarning } from "./vision-plan-failure.js";
import {
  attachVisionDiagnosticsToFailure,
  appendVisionDiagnosticRing,
  redactVisionDiagnosticText,
  summarizeVisionDiagnosticValue,
  type VisionDiagnosticPhase,
  type VisionIterationDiagnostic
} from "./vision-diagnostics.js";
import { observedFieldHasValue, requiredFieldFailures } from "./form-validation.js";
import {
  autoApplyFillObservation,
  isSiteManagedDisabledField,
  isUnconfirmedFieldReadback,
  newSiteValidationErrors,
  partitionSiteRejectedFields,
  rejectedSubmissionFields,
  requireUniqueFinalSubmitAction,
  siteRepairReadbackFailures,
  siteRejectedFields,
  siteValidationFieldKey,
  submissionRejectedFields
} from "./auto-apply-site-validation.js";
import { nativeSubmitValidationProbeInPage, reassertedSubmitValidationProbeInPage } from "./submit-validation-probe.js";
import {
  type BrowserResumeParseResult,
  type BrowserResumeParserName
} from "./resume-local.js";
import { resumeKnowledgeFromBrowserText } from "./resume-knowledge-local.js";
import { localizeFieldAnswer } from "./field-answer.js";
import {
  AutoApplyCommandLeaseRejectedError,
  AutoApplyCommandCompletionRejectedError,
  AutoApplyCommandClaimFenceRejectedError,
  AutoApplyDeviceRequestTimeoutError,
  autoApplyControl,
  autoApplyCredential,
  clearAutoApplyCredential,
  claimAutoApplyCommand,
  commandWithClaimedExecutionDeadline,
  completeAutoApplyCommand,
  createAutoApplyVisionSession,
  exchangeAutoApplyBootstrap,
  heartbeatAutoApplyDevice,
  reportAutoApplyCommandProgress,
  reportAutoApplyBrowserState,
  renewAutoApplyCommandLease,
  planAutoApplyVision,
  setAutoApplyControl,
  verifyAutoApplySubmission,
  type AutoApplyRuntimeCredential,
  type ClaimedAutoApplyCommand
} from "./auto-apply-client.js";
import {
  acceptRecruitingAiWake,
  recruitingAiDeviceContext
} from "./device-context.js";
import {
  applicationMutationWaitPolicy,
  applicationObservationStabilitySignature,
  readApplicationDomMutationState,
  waitForApplicationDomMutation,
  type ApplicationDomMutationState
} from "./application-observation-refresh.js";
import {
  advanceApplicationPageReadiness,
  resolveApplicationPageReadinessRegistration,
  type ApplicationPageReadinessDecision,
  type ApplicationPageReadinessState,
  type ApplicationPageStage
} from "./application-page-readiness.js";
import {
  createAutoApplyProgressReporter,
  type AutoApplyProgressReporter
} from "./auto-apply-progress.js";
import { submissionFailureEvidence, unconfirmedPreviewDiagnostic } from "./submission-failure-evidence.js";
import { siteRejectedUploadError, siteRejectedUploadEvidence } from "./site-upload-rejection.js";
import { recruitingAiPluginInfo } from "./plugin-info.js";
import {
  isAllowedBridgeUrl,
  isAllowedProductBridgeUrl
} from "./bridge-hosts.js";
import { ApplicationEngineRouter } from "./auto-apply-engine/engine-router.js";
import {
  closeAutoApplyExecutionSurface,
  openAutoApplyExecutionSurface,
  openManualApplicationTab
} from "./auto-apply-execution-surface.js";
import {
  applicationAccessHintFromTags,
  requestedApplicationEngineFromPayload
} from "./auto-apply-engine/contracts.js";
import { buildLayeredShadowReport } from "./auto-apply-engine/shadow-analysis.js";
import { buildLayeredObservationSnapshot } from "./auto-apply-engine/observation/snapshot.js";
import {
  autoApplyBoundTabUrlMatchesApplication,
  autoApplyTerminalNavigationFromUrl,
  autoApplyTerminalNavigationMatchesSubmission,
  autoApplyTabUrlMatchesApplication,
  isFeishuJobDetailUrl,
  isMokaJobDetailUrl,
  isMokaApplicationSuccessUrl,
  isXiaopengApplicationUrl,
  isXiaopengJobDetailUrl,
  selectExactLocalValidationTab
} from "./auto-apply-navigation.js";
import { resolveAutoApplyAdapter } from "./auto-apply-adapter-routing.js";
import { readApplicationReceiptInPage } from "./application-receipt.js";
import {
  readSiteApplicationPolicyBlockInPage,
  type SiteApplicationPolicyBlock
} from "./site-application-policy.js";
import {
  buildVisionRepairRequest,
  validateVisionRepairResponse
} from "./auto-apply-engine/planning/vision-repair.js";
import {
  AUTO_APPLY_PAGE_SESSIONS_STORAGE_KEY,
  autoApplyPageSessionDisposition,
  autoApplyPageSessionOwnsTab,
  autoApplyPageSessionRequiresOriginalTab,
  autoApplyPageSessionKey,
  autoApplyUserActionOutcome,
  beginAutoApplySubmission,
  beginSingleAutomaticSiteValidationRepair,
  canResumeAutoApplyAfterSiteValidation,
  completeAutoApplyPageSession,
  createAutoApplyPageSession,
  failAutoApplyPageSession,
  isRemovedActiveSubmissionTab,
  isRemovedCaptchaWaitingTab,
  isRemovedSubmissionReceiptTab,
  resumeAutoApplyAfterSiteValidation,
  shouldCloseAutoApplyTab,
  updateAutoApplyPageSession,
  waitAutoApplyForUser,
  type AutoApplyPageSession,
  type AutoApplyPageStageSource,
  type AutoApplyTabResultDisposition
} from "./auto-apply-page-session.js";
import {
  confirmedFinalSubmitCaptcha,
  pendingFinalSubmitCaptchaAtDeadline,
  createFinalSubmitCaptchaObservation,
  observeFinalSubmitCaptcha
} from "./final-submit-captcha-arbitration.js";

type ModelServiceMode = "local" | "direct" | "unified_gateway" | "managed_gateway";

interface ModelServiceSettings {
  mode: ModelServiceMode;
  serviceCode: string;
  baseUrl: string;
  textModel: string;
  visionModel: string;
  apiKeyConfigured: boolean;
  connectionStatus: "not_configured" | "offline" | "connected";
}

interface CloudServiceSettings {
  baseUrl: string;
  tenantId: string;
  deviceId: string;
  tokenConfigured: boolean;
  connectionStatus: "not_configured" | "offline" | "connected";
  indexRevision: number | null;
  indexUpdatedAt: string | null;
}

interface EntitlementState {
  baseUrl: string;
  tenantId: string;
  deviceId: string;
  tokenConfigured: boolean;
  status: "inactive" | "active" | "quota_exhausted" | "offline";
  account: {
    accountId: string;
    displayName: string;
  } | null;
  plan: {
    planCode: string;
    name: string;
  } | null;
  quota: {
    feature: "llm_one_click_fill";
    total: number;
    used: number;
    remaining: number;
    resetAt: string | null;
  } | null;
  features: {
    manualCopy: boolean;
    currentPageObservation: boolean;
    llmOneClickFill: boolean;
  };
  rechargeUrl: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
}

interface CandidateProfile {
  values: Record<string, string>;
  reusableAnswers: Record<string, string>;
  updatedAt: string | null;
}

interface CandidateFileAssets {
  resume: {
    name: string;
    type: string;
    size: number;
    updatedAt: string;
    storage: "extension_local";
    parser: BrowserResumeParserName;
    parsedAt: string;
  } | null;
  identityPhoto: {
    name: string;
    type: string;
    size: number;
    updatedAt: string;
    storage: "extension_local";
  } | null;
}

interface ApplicationMapping {
  fieldId: string;
  stableFieldKey?: string;
  semanticKey: string;
  confidence: number;
  source: "resume" | "local_profile" | "user_required";
  evidenceRef: string | null;
}

interface ApplicationMissingField {
  fieldId: string;
  stableFieldKey?: string;
  label: string;
  semanticKey: string | null;
  type: string;
  options: string[];
  memoryKey: string | null;
  rememberedValue: string;
}

interface AiPluginCommand {
  schemaVersion: "ai-plugin-command.v1";
  commandId: string;
  conversationId: string;
  tenantId: string;
  userId: string;
  issuedAt?: string;
  expiresAt: string;
  type: string;
  idempotencyKey: string;
  requiresUserGesture?: boolean;
  payload?: Record<string, unknown>;
  safety?: {
    allowFinalSubmit?: boolean;
    allowConsentClick?: boolean;
    allowCaptchaHandling?: boolean;
  };
}

interface AiPluginEvent {
  schemaVersion: "ai-plugin-event.v1";
  eventId: string;
  commandId: string;
  conversationId: string;
  tenantId: string;
  userId: string;
  type: string;
  status: "accepted" | "completed" | "waiting_for_user" | "failed" | "rejected";
  occurredAt: string;
  payload: Record<string, unknown>;
  error: ReturnType<typeof toPublicError> | null;
}

interface AiSideFileRef {
  fileRef?: string;
  name: string;
  mediaType?: string;
  type?: string;
  base64?: string;
  expiresAt?: string;
  sha256?: string;
}

interface ManualAssistField {
  id: string;
  label: string;
  value: string;
  valueSource: string;
  sectionId?: string;
  sectionTitle?: string;
  sectionKind?: "basic" | "education" | "work" | "project" | "award" | "skill" | "narrative" | "other";
  groupIndex?: number;
  fieldId?: string;
  stableFieldKey?: string;
  fieldKey?: string;
  type?: string;
  required?: boolean;
  options?: string[];
  observed?: boolean;
  confirmedForCurrentApplication?: boolean;
  note?: string;
}

interface ManualAssistSection {
  id: string;
  title: string;
  kind: "basic" | "education" | "work" | "project" | "award" | "skill" | "narrative" | "other";
  note?: string;
  items: ManualAssistField[];
}

interface ManualObservedField {
  fieldId: string;
  stableFieldKey?: string;
  label: string;
  type: string;
  required: boolean;
  options: string[];
  currentValue: string;
  hasValue: boolean;
  hasSuggestion: boolean;
}

interface ManualInformationRequest {
  id: string;
  label: string;
  question: string;
  reason: "ai_value_missing" | "required_form_field_unmatched";
  sectionId?: string;
  sectionTitle?: string;
  fieldId?: string;
  stableFieldKey?: string;
  type?: string;
  options: string[];
  valueSource?: string;
}

interface ManualAssistState {
  mode: "copy_paste";
  applicationUrl: string;
  job: {
    companyName?: string;
    title?: string;
    city?: string;
  } | null;
  note?: string;
  items: ManualAssistField[];
  sections: ManualAssistSection[];
  observedFields: ManualObservedField[];
  unmatchedRequiredFields: ManualObservedField[];
  informationRequests: ManualInformationRequest[];
  updatedAt: string;
  observedAt: string | null;
}

interface CandidateInfoPackageState {
  schemaVersion: "candidate-info-package-state.v1";
  sourceSchemaVersion: string;
  fileName: string;
  packageId: string | null;
  uploadedAt: string;
  confirmedAt: string | null;
  status: "draft" | "confirmed";
  warnings: string[];
  manualAssist: ManualAssistState;
}

interface ActiveApplication {
  jobId: string;
  tabId: number;
  entryMode?: "selected_job" | "current_page";
  status: "opening" | "login_required" | "observing" | "information_required" | "ready_to_fill" | "filling" | "ready_for_review" | "failed";
  observation: PageObservation | null;
  mappings: ApplicationMapping[];
  prefillDraft?: Array<{
    fieldId: string;
    stableFieldKey?: string;
    label: string;
    semanticKey: string;
    value: string;
    confidence: number;
  }>;
  customAnswers: Record<string, string>;
  missing: ApplicationMissingField[];
  readback: FillResult[];
  lastError: string | null;
  reviewConfirmedAt: string | null;
  manualAssist?: ManualAssistState;
  rpaTrace?: Array<{
    stage: "entitlement" | "upload" | "observe_actions" | "select_action" | "execute_action" | "prepare_sections" | "audit_form" | "correct_form" | "readback" | "manual_assist";
    status: "completed" | "skipped" | "failed";
    detail: string;
    at: string;
  }>;
}

interface ExtensionState {
  plan: SearchPlan | null;
  jobs: JobRecord[];
  selectedJobIds: string[];
  lastDiscovery: DiscoveryRun | null;
  deviceBridgeUrl: string;
  connectionStatus: "not_configured" | "offline" | "connected";
  cloudService: CloudServiceSettings;
  entitlement: EntitlementState;
  modelService: ModelServiceSettings;
  modelExecutions: ModelExecutionEvidence[];
  candidatePackage: CandidateInfoPackageState | null;
  candidateProfile: CandidateProfile;
  resumeKnowledge: ResumeKnowledgeSnapshot | null;
  fileAssets: CandidateFileAssets;
  activeApplication: ActiveApplication | null;
  autoApplyRuntime: {
    connection: "unpaired" | "ready" | "offline";
    status: "idle" | "running" | "paused" | "cancelled" | "failed";
    batchId: string | null;
    jobId: string | null;
    companyName: string | null;
    title: string | null;
    updatedAt: string | null;
    lastError: string | null;
  };
}

installLocalTransportGuard();
const defaultEntitlementBaseUrl = "http://127.0.0.1:19876/automation/recruiting/v2";
const legacyEntitlementBaseUrls = new Set([
  "http://127.0.0.1:19876/automation/recruiting/v2",
  "http://127.0.0.1:19093/automation/recruiting/v2",
  "http://localhost:19093/automation/recruiting/v2"
]);
const legacyCloudBaseUrls = new Set([
  "http://127.0.0.1:19876/automation/recruiting/v2",
  "http://127.0.0.1:19876/automation/recruiting/v2",
  "http://127.0.0.1:19876/automation/recruiting/v2"
]);

const defaults: ExtensionState = {
  plan: null,
  jobs: [],
  selectedJobIds: [],
  lastDiscovery: null,
  deviceBridgeUrl: "",
  connectionStatus: "not_configured",
  cloudService: {
    baseUrl: "",
    tenantId: "",
    deviceId: "",
    tokenConfigured: false,
    connectionStatus: "not_configured",
    indexRevision: null,
    indexUpdatedAt: null
  },
  entitlement: {
    baseUrl: defaultEntitlementBaseUrl,
    tenantId: "zhencai-dev",
    deviceId: "",
    tokenConfigured: false,
    status: "inactive",
    account: null,
    plan: null,
    quota: null,
    features: {
      manualCopy: true,
      currentPageObservation: true,
      llmOneClickFill: false
    },
    rechargeUrl: null,
    activatedAt: null,
    expiresAt: null,
    lastCheckedAt: null,
    lastError: null
  },
  modelExecutions: [],
  candidatePackage: null,
  candidateProfile: { values: {}, reusableAnswers: {}, updatedAt: null },
  resumeKnowledge: null,
  fileAssets: { resume: null, identityPhoto: null },
  activeApplication: null,
  autoApplyRuntime: {
    connection: "unpaired",
    status: "idle",
    batchId: null,
    jobId: null,
    companyName: null,
    title: null,
    updatedAt: null,
    lastError: null
  },
  modelService: {
    mode: "managed_gateway",
    serviceCode: "zhencai",
    baseUrl: "",
    textModel: "qwen-plus",
    visionModel: "qwen-plus",
    apiKeyConfigured: false,
    connectionStatus: "connected"
  }
};

const modelApiKeyStorageKey = "modelApiKey";
const cloudAccessTokenStorageKey = "cloudAccessToken";
const entitlementTokenStorageKey = "pluginEntitlementToken";
const identityPhotoPayloadStorageKey = "candidateIdentityPhotoPayload";
const resumePayloadStorageKey = "candidateResumePayload";
const errorReportQueueStorageKey = "recruitingErrorReportQueue";
const supportReportUrlStorageKey = "recruitingSupportReportUrl";
const autoApplyVisionDiagnosticsStorageKey = "autoApplyVisionDiagnosticsV1";
const autoApplyTabRefsStorageKey = "autoApplyTabRefsV1";
const autoApplyPendingTabClosureStorageKey = "autoApplyPendingTabClosureV1";
const manualLoginPollTabs = new Set<number>();
const sessionStateKeys: Array<keyof ExtensionState> = [
  "plan",
  "jobs",
  "selectedJobIds",
  "lastDiscovery",
  "activeApplication",
  "autoApplyRuntime"
];
const persistentDefaults = Object.fromEntries(
  Object.entries(defaults).filter(([key]) =>
    !sessionStateKeys.includes(key as keyof ExtensionState)
  )
) as Partial<ExtensionState>;

async function migrateModelDefaults(): Promise<void> {
  const stored = await chrome.storage.local.get({
    modelService: null,
    [modelApiKeyStorageKey]: ""
  });
  const previous = stored.modelService as Partial<ModelServiceSettings> | null;
  if (!previous || previous.mode !== "managed_gateway" || !previous.serviceCode) {
    await chrome.storage.local.set({ modelService: defaults.modelService });
    await chrome.storage.local.remove(modelApiKeyStorageKey);
    return;
  }
  if (previous.serviceCode !== "zhencai") {
    await chrome.storage.local.set({ modelService: defaults.modelService });
  }
}

async function state(): Promise<ExtensionState> {
  const stored = await chrome.storage.local.get({
    ...defaults,
    [modelApiKeyStorageKey]: "",
    [cloudAccessTokenStorageKey]: "",
    [entitlementTokenStorageKey]: "",
    [identityPhotoPayloadStorageKey]: null,
    [resumePayloadStorageKey]: null
  });
  const session = await chrome.storage.session.get({
    plan: defaults.plan,
    jobs: defaults.jobs,
    selectedJobIds: defaults.selectedJobIds,
    lastDiscovery: defaults.lastDiscovery,
    activeApplication: defaults.activeApplication,
    autoApplyRuntime: defaults.autoApplyRuntime
  });
  const modelService = {
    ...defaults.modelService,
    ...(stored.modelService as Partial<ModelServiceSettings> | undefined),
    apiKeyConfigured: Boolean(stored[modelApiKeyStorageKey])
  };
  if (modelService.mode === "managed_gateway" && modelService.serviceCode === "zhencai") {
    if (!modelService.textModel || modelService.textModel === "zhencai") {
      modelService.textModel = defaults.modelService.textModel;
    }
    if (!modelService.visionModel || modelService.visionModel === "zhencai") {
      modelService.visionModel = defaults.modelService.visionModel;
    }
    modelService.connectionStatus = "connected";
  }
  const storedCloudService = stored.cloudService as Partial<CloudServiceSettings> | undefined;
  const storedCloudBaseUrl = String(storedCloudService?.baseUrl ?? "").trim();
  const cloudService = {
    ...defaults.cloudService,
    ...storedCloudService,
    ...(legacyCloudBaseUrls.has(storedCloudBaseUrl)
      ? { baseUrl: defaultEntitlementBaseUrl }
      : {}),
    tokenConfigured: Boolean(stored[cloudAccessTokenStorageKey])
  };
  const storedEntitlement = stored.entitlement as Partial<EntitlementState> | undefined;
  const storedEntitlementBaseUrl = String(storedEntitlement?.baseUrl ?? "").trim();
  const entitlementBaseUrl =
    !storedEntitlementBaseUrl || legacyEntitlementBaseUrls.has(storedEntitlementBaseUrl)
      ? defaultEntitlementBaseUrl
      : storedEntitlementBaseUrl;
  const entitlement = {
    ...defaults.entitlement,
    ...storedEntitlement,
    baseUrl: entitlementBaseUrl,
    features: {
      ...defaults.entitlement.features,
      ...(storedEntitlement?.features ?? {})
    },
    tokenConfigured: Boolean(stored[entitlementTokenStorageKey])
  };
  const {
    [modelApiKeyStorageKey]: _secret,
    [cloudAccessTokenStorageKey]: _cloudSecret,
    [entitlementTokenStorageKey]: _entitlementSecret,
    [identityPhotoPayloadStorageKey]: _identityPhotoPayload,
    [resumePayloadStorageKey]: _resumePayload,
    ...publicStored
  } = stored;
  return {
    ...defaults,
    ...publicStored,
    ...session,
    plan: normalizeStoredPlan(session.plan as SearchPlan | null),
    modelService,
    cloudService,
    entitlement,
    fileAssets: {
      ...defaults.fileAssets,
      ...((publicStored.fileAssets as Partial<CandidateFileAssets> | undefined) ?? {})
    },
    candidateProfile: {
      ...defaults.candidateProfile,
      ...((publicStored.candidateProfile as Partial<CandidateProfile> | undefined) ?? {}),
      values: {
        ...(((publicStored.candidateProfile as Partial<CandidateProfile> | undefined)?.values) ?? {})
      },
      reusableAnswers: {
        ...(((publicStored.candidateProfile as Partial<CandidateProfile> | undefined)?.reusableAnswers) ?? {})
      }
    }
  };
}

function normalizeStoredPlan(plan: SearchPlan | null): SearchPlan | null {
  if (!plan) return null;
  const runtimeFilters = plan.filters as SearchPlan["filters"] & { locationMode?: "specified" | "anywhere" };
  const hasLegacyHistory = plan.sourcePrompt.includes("\n") || !plan.displayPrompt || !runtimeFilters.locationMode;
  if (!hasLegacyHistory) return plan;
  const latestPrompt = plan.displayPrompt ?? plan.sourcePrompt
    .split("\n")
    .map((line) => line.replace(/^(?:调整：|用户补充：)/, "").trim())
    .filter(Boolean)
    .at(-1) ?? plan.sourcePrompt;
  const concreteLocations = runtimeFilters.locations.filter((location) =>
    !/^(?:所有|全部|任意)城市$|^不限城市$|^全国(?:均可|可投)?$|^anywhere$/i.test(location.trim())
  );
  const locationMode = runtimeFilters.locationMode ?? (
    concreteLocations.length < runtimeFilters.locations.length ? "anywhere" : "specified"
  );
  const rebuilt = createSearchPlanFromFilters(latestPrompt, {
    ...runtimeFilters,
    locationMode,
    locations: locationMode === "anywhere" ? [] : concreteLocations
  });
  return {
    ...rebuilt,
    id: plan.id,
    version: plan.version,
    createdAt: plan.createdAt
  };
}

async function update(patch: Partial<ExtensionState>): Promise<ExtensionState> {
  const sessionPatch: Partial<ExtensionState> = {};
  const localPatch: Partial<ExtensionState> = {};
  for (const [key, value] of Object.entries(patch) as Array<
    [keyof ExtensionState, ExtensionState[keyof ExtensionState]]
  >) {
    if (sessionStateKeys.includes(key)) {
      Object.assign(sessionPatch, { [key]: value });
    } else {
      Object.assign(localPatch, { [key]: value });
    }
  }
  await Promise.all([
    Object.keys(sessionPatch).length ? chrome.storage.session.set(sessionPatch) : Promise.resolve(),
    Object.keys(localPatch).length ? chrome.storage.local.set(localPatch) : Promise.resolve()
  ]);
  return state();
}

async function removeLegacyLocalJobState(): Promise<void> {
  await chrome.storage.local.remove([
    ...sessionStateKeys,
    "webJobIndex",
    "webJobIndexToken"
  ]);
}

async function savedIdentityPhoto(): Promise<ResumeFilePayload | null> {
  const stored = await chrome.storage.local.get({ [identityPhotoPayloadStorageKey]: null });
  return (stored[identityPhotoPayloadStorageKey] as ResumeFilePayload | null) ?? null;
}

async function savedResumeFile(): Promise<ResumeFilePayload | null> {
  const stored = await chrome.storage.local.get({ [resumePayloadStorageKey]: null });
  return (stored[resumePayloadStorageKey] as ResumeFilePayload | null) ?? null;
}

async function parseResumeLocally(payload: ResumeFilePayload): Promise<{
  snapshot: ResumeKnowledgeSnapshot;
  parser: BrowserResumeParserName;
}> {
  const offscreenUrl = chrome.runtime.getURL("offscreen.html");
  try {
    const runtime = chrome.runtime as typeof chrome.runtime & {
      getContexts?: (filter: { contextTypes: string[]; documentUrls?: string[] }) => Promise<unknown[]>;
    };
    const contexts = runtime.getContexts
      ? await runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [offscreenUrl] })
      : [];
    if (!contexts.length) {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: [chrome.offscreen.Reason.DOM_PARSER],
        justification: "在用户浏览器内解析 PDF 和 DOCX 简历，不上传文件"
      });
    }
    const response = await chrome.runtime.sendMessage({
      type: "RESUME_PARSE_OFFSCREEN",
      file: payload
    }) as { ok?: boolean; result?: BrowserResumeParseResult; error?: string };
    if (!response?.ok || !response.result) throw new Error(response?.error || "浏览器解析器没有返回结果");
    const snapshot = resumeKnowledgeSnapshotSchema.parse(
      resumeKnowledgeFromBrowserText(response.result, { filename: payload.name })
    );
    if (!snapshot.sections.length) throw new Error("已提取简历文字，但未识别出可填写的个人信息");
    return { snapshot, parser: response.result.parser };
  } catch (error) {
    throw new RecruitingError({
      code: "INVALID_INPUT",
      stage: "resume",
      message: error instanceof Error ? error.message : "浏览器本地简历解析失败",
      retryable: true,
      userAction: /扫描件|可复制文字/.test(error instanceof Error ? error.message : "")
        ? "请上传文字版 PDF/DOCX；扫描版可在后续接入视觉模型或服务端 MinerU 识别。"
        : "请确认文件未损坏，或改用 DOCX、文字版 PDF 后重试。"
    });
  }
}

interface SystemErrorReport {
  id: string;
  occurredAt: string;
  extensionVersion: string;
  operation: string;
  code: string;
  stage: string;
  message: string;
  uploadedAt: string | null;
}

async function recordSystemError(error: ReturnType<typeof toPublicError>, operation: string): Promise<void> {
  const report: SystemErrorReport = {
    id: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    extensionVersion: chrome.runtime.getManifest().version,
    operation,
    code: error.code,
    stage: error.stage,
    message: error.message.slice(0, 2_000),
    uploadedAt: null
  };
  const stored = await chrome.storage.local.get([errorReportQueueStorageKey, supportReportUrlStorageKey]);
  const queue = Array.isArray(stored[errorReportQueueStorageKey])
    ? stored[errorReportQueueStorageKey] as SystemErrorReport[]
    : [];
  const nextQueue = [...queue.slice(-49), report];
  const endpoint = String(stored[supportReportUrlStorageKey] ?? "").trim();
  if (endpoint && /^https:\/\//i.test(endpoint)) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schemaVersion: "client-error-report.v1", report })
      });
      if (response.ok) {
        report.uploadedAt = new Date().toISOString();
      }
    } catch {
      // The sanitized report remains queued for the next cloud-assisted retry.
    }
  }
  await chrome.storage.local.set({ [errorReportQueueStorageKey]: [...nextQueue.slice(0, -1), report] });
}

function modelBaseUrl(value: unknown, mode: ModelServiceMode): string {
  const parsed = new URL(String(value ?? "").trim());
  if (mode === "local") {
    if (
      parsed.protocol !== "http:" ||
      !["127.0.0.1", "localhost"].includes(parsed.hostname)
    ) {
      throw new RecruitingError({
        code: "INVALID_INPUT",
        stage: "configuration",
        message: "本地服务只能使用 http://127.0.0.1 或 http://localhost 地址",
        retryable: false,
        userAction: "修改服务地址，或切换到远程 OpenAI-compatible API 模式。"
      });
    }
  } else if (parsed.protocol !== "https:") {
    throw new RecruitingError({
      code: "INVALID_INPUT",
      stage: "configuration",
      message: "远程模型 API 必须使用 HTTPS",
      retryable: false,
      userAction: "将服务地址改为 HTTPS。"
    });
  }
  return parsed.href.replace(/\/$/, "");
}

function cloudBaseUrl(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) throw new RecruitingError({
    code: "CLOUD_SYNC_NOT_CONFIGURED",
    stage: "configuration",
    message: "尚未配置招聘云服地址",
    retryable: false,
    userAction: "在招聘云服设置中填写接口地址、租户和访问令牌。"
  });
  const parsed = new URL(raw);
  const local = ["127.0.0.1", "localhost"].includes(parsed.hostname);
  if (!local || parsed.port !== "19876" || parsed.protocol !== "http:") {
    throw new RecruitingError({
      code: "INVALID_INPUT",
      stage: "configuration",
      message: "本地版仅允许连接本机 19876 端口",
      retryable: false,
      userAction: "修改招聘云服地址后重试。"
    });
  }
  return parsed.href.replace(/\/$/, "");
}

function entitlementBaseUrl(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) throw new RecruitingError({
    code: "CLOUD_SYNC_NOT_CONFIGURED",
    stage: "configuration",
    message: "权益服务地址未配置",
    retryable: false,
    userAction: "请安装最新插件包；如仍失败，请联系服务端管理员。"
  });
  const parsed = new URL(raw);
  const local = ["127.0.0.1", "localhost"].includes(parsed.hostname);
  if (!local || parsed.port !== "19876" || parsed.protocol !== "http:") {
    throw new RecruitingError({
      code: "INVALID_INPUT",
      stage: "configuration",
      message: "本地版不使用云端权益服务",
      retryable: false,
      userAction: "请更新插件安装包或联系服务端管理员。"
    });
  }
  return parsed.href.replace(/\/$/, "");
}

function entitlementFromResponse(
  payload: Record<string, unknown>,
  current: EntitlementState,
  patch: Partial<EntitlementState> = {}
): EntitlementState {
  const quota = asRecord(payload.quota);
  const account = asRecord(payload.account);
  const plan = asRecord(payload.plan);
  const features = asRecord(payload.features);
  const status = String(payload.status || "inactive");
  return {
    ...current,
    ...patch,
    status: ["active", "quota_exhausted"].includes(status)
      ? status as EntitlementState["status"]
      : "inactive",
    account: account ? {
      accountId: String(account.accountId || ""),
      displayName: String(account.displayName || "已激活账号")
    } : null,
    plan: plan ? {
      planCode: String(plan.planCode || "unknown"),
      name: String(plan.name || "一键填写权益")
    } : null,
    quota: quota ? {
      feature: "llm_one_click_fill",
      total: Number(quota.total || 0),
      used: Number(quota.used || 0),
      remaining: Number(quota.remaining || 0),
      resetAt: quota.resetAt ? String(quota.resetAt) : null
    } : null,
    features: {
      manualCopy: features?.manualCopy !== false,
      currentPageObservation: features?.currentPageObservation !== false,
      llmOneClickFill: features?.llmOneClickFill === true
    },
    rechargeUrl: payload.rechargeUrl ? String(payload.rechargeUrl) : current.rechargeUrl,
    activatedAt: payload.activatedAt ? String(payload.activatedAt) : current.activatedAt,
    expiresAt: payload.expiresAt ? String(payload.expiresAt) : current.expiresAt,
    lastCheckedAt: new Date().toISOString(),
    lastError: null
  };
}

async function entitlementRequest(
  settings: EntitlementState,
  path: string,
  init: RequestInit & { includeToken?: boolean } = {}
): Promise<Record<string, unknown>> {
  const tokenStore = await chrome.storage.local.get({ [entitlementTokenStorageKey]: "" });
  const token = String(tokenStore[entitlementTokenStorageKey] || "");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "X-Tenant-Id": settings.tenantId || defaults.entitlement.tenantId,
    "X-Device-Id": settings.deviceId || crypto.randomUUID()
  };
  if (init.includeToken !== false && token) headers.Authorization = `Bearer ${token}`;
  let response: Response;
  try {
    response = await fetch(`${entitlementBaseUrl(settings.baseUrl)}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(init.headers as Record<string, string> | undefined)
      },
      signal: init.signal ?? AbortSignal.timeout(12_000)
    });
  } catch (error) {
    throw new RecruitingError(
      {
        code: "CLOUD_SYNC_UNAVAILABLE",
        stage: "configuration",
        message: error instanceof Error ? error.message : "无法连接权益服务",
        retryable: true,
        userAction: "稍后重试；若仍失败，请确认当前网络可访问 AI Offer 招聘小助手 服务。"
      },
      { cause: error }
    );
  }
  const text = await response.text();
  const payload = text ? JSON.parse(text) as Record<string, unknown> : {};
  if (response.ok) return payload;
  const serverError = asRecord(payload.error);
  const serverCode = String(serverError?.code || "");
  throw new RecruitingError({
    code: response.status === 401 || response.status === 403
      ? "CLOUD_SYNC_AUTH_FAILED"
      : response.status === 402
        ? "MODEL_RATE_LIMITED"
        : "CLOUD_SYNC_UNAVAILABLE",
    stage: "configuration",
    message: String(serverError?.message || `权益服务返回 HTTP ${response.status}`),
    retryable: response.status >= 500,
    userAction: String(serverError?.userAction || (
      serverCode === "SPECIAL_CODE_INVALID"
        ? "请重新输入有效特殊码，或前往充值。"
        : "刷新权益状态后重试。"
    )),
    details: {
      status: response.status,
      serverCode,
      requestId: serverError?.requestId
    }
  });
}

async function refreshEntitlementState(current?: ExtensionState): Promise<ExtensionState> {
  current ??= await state();
  const deviceId = current.entitlement.deviceId || crypto.randomUUID();
  if (!current.entitlement.tokenConfigured) {
    return update({
      entitlement: {
        ...current.entitlement,
        deviceId,
        status: "inactive",
        lastCheckedAt: new Date().toISOString()
      }
    });
  }
  try {
    const payload = await entitlementRequest(
      { ...current.entitlement, deviceId },
      "/plugin-entitlements/me",
      { method: "GET" }
    );
    return update({
      entitlement: entitlementFromResponse(payload, current.entitlement, {
        deviceId,
        tokenConfigured: true
      })
    });
  } catch (error) {
    const publicError = toPublicError(error);
    return update({
      entitlement: {
        ...current.entitlement,
        deviceId,
        status: "offline",
        lastCheckedAt: new Date().toISOString(),
        lastError: publicError.message
      }
    });
  }
}

async function activateEntitlement(code: string): Promise<ExtensionState> {
  const current = await state();
  const activationCode = code.trim();
  if (!activationCode) throw new RecruitingError({
    code: "INVALID_INPUT",
    stage: "configuration",
    message: "请输入特殊码",
    retryable: true,
    userAction: "输入平台提供的特殊码后再确认激活。"
  });
  const deviceId = current.entitlement.deviceId || crypto.randomUUID();
  const payload = await entitlementRequest(
    { ...current.entitlement, deviceId },
    "/plugin-entitlements/activations",
    {
      method: "POST",
      includeToken: false,
      body: JSON.stringify({
        schemaVersion: "plugin-entitlement-activation-request.v1",
        activationCode,
        pluginVersion: chrome.runtime.getManifest().version,
        tenantId: current.entitlement.tenantId || defaults.entitlement.tenantId,
        deviceId
      })
    }
  );
  const token = String(payload.entitlementToken || "");
  if (!token) throw new RecruitingError({
    code: "CLOUD_SYNC_UNAVAILABLE",
    stage: "configuration",
    message: "权益服务没有返回激活令牌",
    retryable: true,
    userAction: "稍后重试；若仍失败，请联系服务端管理员。"
  });
  await chrome.storage.local.set({ [entitlementTokenStorageKey]: token });
  return update({
    entitlement: entitlementFromResponse(payload, current.entitlement, {
      deviceId,
      tokenConfigured: true,
      status: "active"
    })
  });
}

async function openEntitlementCheckout(): Promise<ExtensionState> {
  const current = await state();
  if (!current.entitlement.tokenConfigured) throw new RecruitingError({
    code: "CLOUD_SYNC_AUTH_FAILED",
    stage: "configuration",
    message: "一键填写尚未激活",
    retryable: false,
    userAction: "请输入特殊码激活后再充值。"
  });
  const payload = await entitlementRequest(current.entitlement, "/plugin-entitlements/checkout-sessions", {
    method: "POST",
    body: JSON.stringify({ schemaVersion: "plugin-entitlement-checkout-session.v1" })
  });
  const checkoutUrl = String(payload.checkoutUrl || current.entitlement.rechargeUrl || "");
  if (checkoutUrl) await chrome.tabs.create({ url: checkoutUrl, active: true });
  return refreshEntitlementState(current);
}

async function reserveOneClickFillUsage(
  current: ExtensionState,
  application: ActiveApplication,
  idempotencyKey: string
): Promise<ExtensionState> {
  if (!current.entitlement.tokenConfigured) {
    throw new RecruitingError({
      code: "CLOUD_SYNC_AUTH_FAILED",
      stage: "configuration",
      message: "一键填写尚未激活",
      retryable: false,
      userAction: "请输入特殊码激活，或前往充值获取可用次数。"
    });
  }
  const fresh = current.entitlement.status === "active"
    ? current
    : await refreshEntitlementState(current);
  const quota = fresh.entitlement.quota;
  if (fresh.entitlement.status !== "active" || (quota && quota.remaining <= 0)) {
    throw new RecruitingError({
      code: "MODEL_RATE_LIMITED",
      stage: "configuration",
      message: "一键填写可用次数不足",
      retryable: false,
      userAction: "请前往充值后刷新权益状态。"
    });
  }
  const payload = await entitlementRequest(fresh.entitlement, "/plugin-entitlements/usage-reservations", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      schemaVersion: "plugin-entitlement-usage-reservation-request.v1",
      feature: "llm_one_click_fill",
      idempotencyKey,
      pluginVersion: chrome.runtime.getManifest().version,
      jobId: application.jobId,
      tabId: application.tabId,
      entryMode: application.entryMode ?? "current_page"
    })
  });
  const entitlementPayload = asRecord(payload.entitlement) ?? payload;
  return update({
    entitlement: entitlementFromResponse(entitlementPayload, fresh.entitlement, {
      tokenConfigured: true,
      deviceId: fresh.entitlement.deviceId || crypto.randomUUID()
    })
  });
}

function cloudError(error: unknown, stage: "configuration" | "search" | "cloud_sync"): RecruitingError {
  if (error instanceof RecruitingError) return error;
  if (error instanceof CloudServiceError) {
    const code = error.code === "AUTH_REQUIRED" || error.code === "FORBIDDEN_SCOPE"
      ? "CLOUD_SYNC_AUTH_FAILED" as const
      : error.code === "REVISION_CONFLICT"
        ? "REVISION_CONFLICT" as const
        : error.code === "SHARED_DATA_CONTAINS_PII"
          ? "SHARED_DATA_CONTAINS_PII" as const
          : "CLOUD_SYNC_UNAVAILABLE" as const;
    return new RecruitingError({
      code,
      stage,
      message: error.message,
      retryable: error.retryable,
      userAction: error.userAction ?? (error.retryable
        ? "稍后重试；若仍失败，请检查招聘云服状态。"
        : "检查招聘云服登录状态和访问权限。"),
      details: {
        status: error.status,
        cloudCode: error.code,
        requestId: error.requestId
      }
    });
  }
  return new RecruitingError({
    code: "CLOUD_SYNC_UNAVAILABLE",
    stage,
    message: error instanceof Error ? error.message : "招聘云服不可用",
    retryable: true,
    userAction: "检查招聘云服地址、网络和访问令牌后重试。"
  });
}

async function configuredCloudClient(settings: CloudServiceSettings): Promise<CloudServiceClient> {
  const stored = await chrome.storage.local.get({ [cloudAccessTokenStorageKey]: "" });
  const accessToken = String(stored[cloudAccessTokenStorageKey] ?? "");
  if (!accessToken || !settings.tenantId) {
    throw new RecruitingError({
      code: "CLOUD_SYNC_NOT_CONFIGURED",
      stage: "configuration",
      message: "招聘云服的租户或访问令牌尚未配置",
      retryable: false,
      userAction: "在招聘云服设置中补充租户 ID 和访问令牌。"
    });
  }
  return new CloudServiceClient({
    baseUrl: cloudBaseUrl(settings.baseUrl),
    accessToken,
    tenantId: settings.tenantId,
    deviceId: settings.deviceId || crypto.randomUUID()
  });
}

async function testCloudService(settings: CloudServiceSettings) {
  try {
    return await (await configuredCloudClient(settings)).capabilities(AbortSignal.timeout(15_000));
  } catch (error) {
    throw cloudError(error, "configuration");
  }
}

function shouldUseQwenThinkingFlag(baseUrl: string, model: string): boolean {
  return /(?:dashscope|aliyuncs|maas\.aliyuncs)\./i.test(baseUrl) || /^qwen/i.test(model);
}

async function assertChatCompletion(
  settings: ModelServiceSettings,
  apiKey: string,
  model: string,
  messages: unknown[],
  label: string
): Promise<void> {
  let response: Response;
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: 8,
    temperature: 0
  };
  if (shouldUseQwenThinkingFlag(settings.baseUrl, model)) {
    body.enable_thinking = false;
  }
  try {
    response = await globalThis.fetch(`${settings.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000)
    });
  } catch (error) {
    throw new RecruitingError(
      {
        code: "MODEL_UNAVAILABLE",
        stage: "transport",
        message: error instanceof Error ? error.message : "无法连接模型服务",
        retryable: true,
        userAction: "确认模型服务地址可访问，百炼 API Key 已填写，并已允许插件访问该 API 域名。"
      },
      { cause: error }
    );
  }
  if (!response.ok) {
    const responseBody = (await response.text()).slice(0, 500);
    throw modelHttpError(
      response.status,
      `${label}返回 HTTP ${response.status}${responseBody ? `：${responseBody}` : ""}`
    );
  }
}

async function testModelService(settings: ModelServiceSettings): Promise<void> {
  if (settings.mode === "managed_gateway") {
    if (settings.serviceCode !== "zhencai") {
      throw new RecruitingError({
        code: "MODEL_NOT_CONFIGURED",
        stage: "configuration",
        message: `不支持的模型服务代码：${settings.serviceCode}`,
        retryable: false,
        userAction: "当前内置通道只支持 zhencai。"
      });
    }
    return;
  }
  const secret = await chrome.storage.local.get({ [modelApiKeyStorageKey]: "" });
  const apiKey = String(secret[modelApiKeyStorageKey] ?? "");
  await assertChatCompletion(
    settings,
    apiKey,
    settings.textModel,
    [{ role: "user", content: "只回复 OK" }],
    "文本模型连接测试"
  );
  if (settings.visionModel) {
    await assertChatCompletion(
      settings,
      apiKey,
      settings.visionModel,
      [{
        role: "user",
        content: [
          { type: "text", text: "这是一张 1x1 测试图。只回复 OK。" },
          {
            type: "image_url",
            image_url: {
              url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
            }
          }
        ]
      }],
      "视觉模型连接测试"
    );
  }
}

async function browserModelSettings(
  settings: ModelServiceSettings
): Promise<BrowserModelSettings> {
  if (settings.mode === "managed_gateway") {
    const current = await state();
    const secret = await chrome.storage.local.get({ [entitlementTokenStorageKey]: "" });
    const token = String(secret[entitlementTokenStorageKey] ?? "");
    if (!token || !current.entitlement.tokenConfigured) {
      throw new RecruitingError({
        code: "MODEL_AUTH_FAILED",
        stage: "configuration",
        message: "一键填写尚未激活",
        retryable: false,
        userAction: "请输入特殊码激活后再使用托管模型填写。"
      });
    }
    return {
      baseUrl: `${entitlementBaseUrl(current.entitlement.baseUrl)}/plugin-llm`,
      model: settings.textModel || settings.visionModel || settings.serviceCode || "zhencai",
      apiKey: token,
      timeoutMs: 45_000
    };
  }
  if (!settings.baseUrl || !settings.textModel) {
    throw new RecruitingError({
      code: "MODEL_NOT_CONFIGURED",
      stage: "configuration",
      message: "缺少模型服务地址或文本模型名称",
      retryable: false,
      userAction: "在大模型服务中填写地址和模型名称并保存。"
    });
  }
  const secret = await chrome.storage.local.get({ [modelApiKeyStorageKey]: "" });
  const apiKey = String(secret[modelApiKeyStorageKey] ?? "");
  if (settings.mode !== "local" && !apiKey) {
    throw new RecruitingError({
      code: "MODEL_AUTH_FAILED",
      stage: "configuration",
      message: "远程模型 API 尚未配置 API Key",
      retryable: false,
      userAction: "填写 API Key 后保存并测试连接。"
    });
  }
  return {
    baseUrl: settings.baseUrl,
    model: settings.textModel,
    ...(apiKey ? { apiKey } : {}),
    timeoutMs: 30_000
  };
}

function withExecution(
  executions: ModelExecutionEvidence[],
  evidence: ModelExecutionEvidence
): ModelExecutionEvidence[] {
  return [...executions, evidence].slice(-20);
}

const availableProfileKeys = [
  "basic.fullName",
  "basic.phone",
  "basic.email",
  "basic.currentCity",
  "basic.gender",
  "basic.birthDate",
  "basic.highestDegree",
  "education.school",
  "education.degree",
  "education.major",
  "education.graduationYear",
  "education.startDate",
  "education.endDate",
  "work.years",
  "work.company",
  "work.title",
  "work.startDate",
  "work.endDate",
  "work.description",
  "project.name",
  "project.role",
  "project.startDate",
  "project.endDate",
  "project.description",
  "research.title",
  "research.description",
  "award.name",
  "award.date",
  "language.name",
  "language.level",
  "skills.summary",
  "narrative.selfIntroduction",
  "resume.file",
  "consent.privacy"
];

const resumeFactAliases: Record<string, string> = {
  fullName: "basic.fullName",
  name: "basic.fullName",
  phone: "basic.phone",
  mobile: "basic.phone",
  email: "basic.email",
  currentCity: "basic.currentCity",
  city: "basic.currentCity",
  gender: "basic.gender",
  birthDate: "basic.birthDate",
  highestDegree: "basic.highestDegree",
  school: "education.school",
  degree: "education.degree",
  major: "education.major",
  graduationYear: "education.graduationYear",
  company: "work.company",
  position: "work.title",
  jobTitle: "work.title",
  years: "work.years",
  summary: "skills.summary",
  selfIntroduction: "narrative.selfIntroduction"
};

function sectionSemanticKey(kind: ResumeKnowledgeSnapshot["sections"][number]["kind"], key: string): string {
  if (key.includes(".")) return key;
  if (resumeFactAliases[key]) return resumeFactAliases[key];
  const prefix = kind === "internship" ? "work" : kind;
  return `${prefix}.${key}`;
}

function resumeSemanticValues(snapshot: ResumeKnowledgeSnapshot | null): Record<string, string> {
  if (!snapshot?.userApproved) return {};
  const values: Record<string, string> = {};
  const sectionIndexes = new Map<string, number>();
  for (const section of snapshot.sections) {
    const sectionIndex = sectionIndexes.get(section.kind) ?? 0;
    sectionIndexes.set(section.kind, sectionIndex + 1);
    for (const [key, value] of Object.entries(section.facts)) {
      if (value === null || value === undefined || value === "") continue;
      const semanticKey = sectionSemanticKey(section.kind, key);
      const rendered = Array.isArray(value)
        ? value.map((item) => String(item)).join("、")
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
      const prefix = section.kind === "internship" ? "work" : section.kind;
      const rawKey = key.includes(".") ? key.split(".").at(-1) ?? key : key;
      for (const alias of [semanticKey, `${prefix}[${sectionIndex}].${rawKey}`]) {
        if (!(alias in values)) values[alias] = rendered;
      }
    }
  }
  return values;
}

function fieldMemoryKey(
  field: Pick<PageObservation["fields"][number], "label" | "type">,
  semanticKey: string | null
): string | null {
  if (field.type === "file" || field.type === "checkbox" || field.type === "radio") return null;
  return semanticKey
    ? `semantic:${semanticKey}`
    : `label:${field.label.replace(/\s+/g, "").toLowerCase()}`;
}

function resolvedFieldAnswer(
  field: PageObservation["fields"][number],
  semanticKey: string | null,
  profile: CandidateProfile,
  customAnswers: Record<string, string>,
  resumeKnowledge: ResumeKnowledgeSnapshot | null
): string | undefined {
  const memoryKey = fieldMemoryKey(field, semanticKey);
  const resumeValues = resumeSemanticValues(resumeKnowledge);
  const raw = customAnswers[field.fieldId] ??
    (field.stableFieldKey ? customAnswers[field.stableFieldKey] : undefined) ??
    (semanticKey ? resumeValues[semanticKey] : undefined) ??
    (semanticKey ? profile.values[semanticKey] : undefined) ??
    (memoryKey ? profile.reusableAnswers[memoryKey] : undefined);
  return raw === undefined ? undefined : localizeFieldAnswer(field, semanticKey, raw);
}

function stripTrailingParserArtifact(value: string): string {
  return value.replace(/[|｜·・]+\s*$/g, "").trim();
}

function parserArtifactRepairValue(
  field: PageObservation["fields"][number],
  semanticKey: string | null
): string | null {
  if (["file", "checkbox", "radio", "hidden"].includes(field.type)) return null;
  if (!field.currentValue || !/[|｜·・]\s*$/.test(field.currentValue)) return null;
  const semanticLooksLikeShortTitle = /^(?:project(?:\[\d+\])?\.name|work(?:\[\d+\])?\.(?:company|title)|award(?:\[\d+\])?\.name|research(?:\[\d+\])?\.title)$/.test(semanticKey ?? "");
  const labelLooksLikeShortTitle = /(?:项目|作品|公司|职位|岗位|获奖|奖项|论文|科研|学校).{0,6}(?:名称|名字|标题|题目)|^(?:名称|标题|题目)$/i.test(field.label);
  if (!semanticLooksLikeShortTitle && !labelLooksLikeShortTitle) return null;
  const repaired = stripTrailingParserArtifact(field.currentValue);
  return repaired && repaired !== field.currentValue ? repaired : null;
}

function missingFields(
  observation: PageObservation,
  mappings: ApplicationMapping[],
  profile: CandidateProfile,
  customAnswers: Record<string, string>,
  resumeKnowledge: ResumeKnowledgeSnapshot | null,
  availableFileIds = new Set<string>()
): ApplicationMissingField[] {
  const byField = new Map(mappings
    .filter((mapping) => mapping.confidence >= 0.8)
    .map((mapping) => [mapping.fieldId, mapping]));
  return observation.fields.flatMap((field) => {
    if (!field.required || observedFieldHasValue(field)) return [];
    const mapping = byField.get(field.fieldId);
    const semanticKey = mapping?.semanticKey ?? null;
    const memoryKey = fieldMemoryKey(field, semanticKey);
    const answer = resolvedFieldAnswer(field, semanticKey, profile, customAnswers, resumeKnowledge);
    const hasAnswer = field.type === "checkbox" || field.type === "radio"
      ? answer === "true"
      : Boolean(answer);
    if (hasAnswer || (field.type === "file" && availableFileIds.has(field.fieldId))) return [];
    return [{
      fieldId: field.fieldId,
      ...(field.stableFieldKey ? { stableFieldKey: field.stableFieldKey } : {}),
      label: field.label,
      semanticKey,
      type: field.type,
      options: field.options,
      memoryKey,
      rememberedValue: answer ?? ""
    }];
  });
}

function deterministicFieldMappings(
  observation: PageObservation,
  proposed: Array<Omit<ApplicationMapping, "evidenceRef"> & { evidenceRef?: string | null }>,
  availableSemanticKeys: Set<string>
): ApplicationMapping[] {
  const fieldById = new Map(observation.fields.map((field) => [field.fieldId, field]));
  const dateFields = observation.fields.filter((field) =>
    /起止时间|开始时间|结束时间|入学时间|毕业时间/.test(field.label)
  );
  const datePrefix = (field: PageObservation["fields"][number]): "work" | "project" | "education" =>
    /工作经历|实习经历/.test(field.label) ? "work" :
      /项目经历/.test(field.label) ? "project" : "education";
  const dateEdge = (field: PageObservation["fields"][number]): "startDate" | "endDate" => {
    if (/入学\/开始时间|(?:^|·\s*)开始时间/.test(field.label)) return "startDate";
    if (/毕业\/结束时间|(?:^|·\s*)结束时间/.test(field.label)) return "endDate";
    const prefix = datePrefix(field);
    const peers = dateFields.filter((candidate) => datePrefix(candidate) === prefix &&
      (field.groupIndex === null || field.groupIndex === undefined || candidate.groupIndex === field.groupIndex));
    return Math.max(0, peers.findIndex((candidate) => candidate.fieldId === field.fieldId)) % 2 === 0
      ? "startDate" : "endDate";
  };
  const repeatedKey = (
    prefix: "work" | "project" | "education",
    attribute: string,
    fieldId: string,
    matches: (candidate: PageObservation["fields"][number]) => boolean
  ): string | null => {
    const field = fieldById.get(fieldId);
    if (typeof field?.groupIndex === "number" && field.groupIndex >= 0) {
      const indexed = `${prefix}[${field.groupIndex}].${attribute}`;
      if (availableSemanticKeys.has(indexed)) return indexed;
      return field.groupIndex === 0 && availableSemanticKeys.has(`${prefix}.${attribute}`)
        ? `${prefix}.${attribute}`
        : null;
    }
    const peers = observation.fields.filter(matches);
    if (peers.length <= 1) return `${prefix}.${attribute}`;
    return null;
  };
  const deterministic = observation.fields.flatMap((field): ApplicationMapping[] => {
    let semanticKey: string | null = null;
    let source: ApplicationMapping["source"] = "resume";
    const inEducation = /教育经历/.test(field.label);
    const inWork = /工作经历|实习经历/.test(field.label);
    const inProject = /项目经历/.test(field.label);
    const inAward = /获奖/.test(field.label);
    const inResearch = /科研|论文/.test(field.label);
    const inLanguage = /语言能力/.test(field.label);
    const inRepeatableSection = inEducation || inWork || inProject || inAward || inResearch || inLanguage ||
      /作品/.test(field.label);
    const isThirdPartyPersonField = /紧急联系人|应急联系人|外部推荐人|推荐人|内推人|介绍人|联系人关系|与本人关系/i.test(field.label);
    if (field.type === "file") {
      semanticKey = /照片|头像|证件照|photo/i.test(field.label)
        ? "upload.identity_photo"
        : /简历|附件|resume|cv/i.test(field.label)
          ? "resume.file"
          : `upload.${field.fieldId}`;
      source = "user_required";
    } else if (/意向.*(?:工作)?城市|期望.*城市|工作城市|意向地点|工作地点/.test(field.label)) {
      semanticKey = "basic.currentCity";
      source = "local_profile";
    } else if (inWork && /公司|单位|company/i.test(field.label)) {
      semanticKey = repeatedKey("work", "company", field.fieldId, (candidate) =>
        /工作经历|实习经历/.test(candidate.label) && /公司|单位|company/i.test(candidate.label));
    } else if (inWork && /岗位|职位|职务|title|position/i.test(field.label)) {
      semanticKey = repeatedKey("work", "title", field.fieldId, (candidate) =>
        /工作经历|实习经历/.test(candidate.label) && /岗位|职位|职务|title|position/i.test(candidate.label));
    } else if (inWork && /描述|内容|职责|desc|description/i.test(field.label)) {
      semanticKey = repeatedKey("work", "description", field.fieldId, (candidate) =>
        /工作经历|实习经历/.test(candidate.label) && /描述|内容|职责|desc|description/i.test(candidate.label));
    } else if (inProject && /项目名称|名称|name/i.test(field.label)) {
      semanticKey = repeatedKey("project", "name", field.fieldId, (candidate) =>
        /项目经历/.test(candidate.label) && /项目名称|名称|name/i.test(candidate.label));
    } else if (inProject && /角色|职责|职位|role/i.test(field.label)) {
      semanticKey = repeatedKey("project", "role", field.fieldId, (candidate) =>
        /项目经历/.test(candidate.label) && /角色|职责|职位|role/i.test(candidate.label));
    } else if (inProject && /描述|内容|成果|desc|description/i.test(field.label)) {
      semanticKey = repeatedKey("project", "description", field.fieldId, (candidate) =>
        /项目经历/.test(candidate.label) && /描述|内容|成果|desc|description/i.test(candidate.label));
    } else if (inResearch && /标题|名称|title|name/i.test(field.label)) {
      semanticKey = "research.title";
    } else if (inResearch && /描述|内容|成果|desc|description/i.test(field.label)) {
      semanticKey = "research.description";
    } else if (inAward && /奖项|获奖名称|名称|title|name/i.test(field.label)) {
      semanticKey = "award.name";
    } else if (inAward && /时间|日期|date/i.test(field.label)) {
      semanticKey = "award.date";
    } else if (inLanguage && /语言|语种|language/i.test(field.label)) {
      semanticKey = "language.name";
    } else if (inLanguage && /等级|水平|熟练|level|proficiency/i.test(field.label)) {
      semanticKey = "language.level";
    } else if (/学校|院校|school/i.test(field.label)) semanticKey = "education.school";
    else if (/学历|学位|degree/i.test(field.label)) semanticKey = "education.degree";
    else if (/专业|major/i.test(field.label)) semanticKey = "education.major";
    else if (/起止时间|开始时间|结束时间|入学时间|毕业时间/.test(field.label)) {
      const edge = dateEdge(field);
      const prefix = datePrefix(field);
      semanticKey = repeatedKey(prefix, edge, field.fieldId, (candidate) => {
        if (!/起止时间|开始时间|结束时间|入学时间|毕业时间/.test(candidate.label)) return false;
        return datePrefix(candidate) === prefix && dateEdge(candidate) === edge;
      });
    } else if (!inRepeatableSection && !isThirdPartyPersonField &&
      /姓名|名字|full\s*name|(?:^|[·\s:：])name(?:$|[·\s:：])/i.test(field.label)) {
      semanticKey = "basic.fullName";
    } else if (!inRepeatableSection && !isThirdPartyPersonField &&
      /手机|电话|mobile|phone/i.test(field.label)) semanticKey = "basic.phone";
    else if (!inRepeatableSection && !isThirdPartyPersonField &&
      /邮箱|电子邮件|e-?mail/i.test(field.label)) semanticKey = "basic.email";
    else if (/工作年限|工作经验|经验年限/.test(field.label)) semanticKey = "work.years";
    else if (/技能|技术栈/.test(field.label)) semanticKey = "skills.summary";
    else if (/自我评价|个人总结|自我介绍/.test(field.label)) semanticKey = "narrative.selfIntroduction";
    else if (/隐私政策|同意.*条款/.test(field.label)) {
      semanticKey = "consent.privacy";
      source = "user_required";
    }
    return semanticKey ? [attachMappingIdentity(field, {
      fieldId: field.fieldId,
      semanticKey,
      confidence: 1,
      source,
      evidenceRef: null
    })] : [];
  });
  const sectionCompatible = (mapping: typeof proposed[number]) => {
    const label = fieldById.get(mapping.fieldId)?.label ?? "";
    if (/教育经历/.test(label)) return /^education(?:\[\d+\])?\./.test(mapping.semanticKey);
    if (/工作经历|实习经历/.test(label)) return /^work(?:\[\d+\])?\./.test(mapping.semanticKey);
    if (/项目经历/.test(label)) return /^project(?:\[\d+\])?\./.test(mapping.semanticKey);
    return false;
  };
  // A prefill candidate backed by an exact resume fact is more reliable for
  // repeated sections than occurrence counting. Keep deterministic mappings
  // for unambiguous basic fields and as a fallback when the model abstains.
  const preferredProposalIds = new Set(proposed
    .filter((mapping) => mapping.source === "resume" && mapping.confidence >= 0.9 &&
      availableSemanticKeys.has(mapping.semanticKey) && sectionCompatible(mapping))
    .map((mapping) => mapping.fieldId));
  const proposalIsStrictlyCompatible = (mapping: typeof proposed[number]) => {
    const field = fieldById.get(mapping.fieldId);
    if (!field || !availableSemanticKeys.has(mapping.semanticKey)) return false;
    if (/紧急联系人|应急联系人|外部推荐人|推荐人|内推人|介绍人|联系人关系|与本人关系/i.test(field.label) &&
      !/emergency|referr|referral|recommender|紧急联系人|推荐人/i.test(mapping.semanticKey)) return false;
    if (sectionCompatible(mapping)) return true;
    const fieldCategory = formLabelSemanticCategory(field.label);
    const semanticCategory = formLabelSemanticCategory(mapping.semanticKey);
    return Boolean(fieldCategory && semanticCategory && fieldCategory === semanticCategory);
  };
  const safeDeterministic = deterministic.filter((mapping) => !preferredProposalIds.has(mapping.fieldId));
  const deterministicIds = new Set(safeDeterministic.map((mapping) => mapping.fieldId));
  const retained: ApplicationMapping[] = proposed
    .filter((mapping) => proposalIsStrictlyCompatible(mapping) &&
      (preferredProposalIds.has(mapping.fieldId) || !deterministicIds.has(mapping.fieldId)))
    .map((mapping) => {
      const field = fieldById.get(mapping.fieldId);
      const normalized = { ...mapping, evidenceRef: mapping.evidenceRef ?? null };
      return field ? attachMappingIdentity(field, normalized) : normalized;
    });
  return [...retained, ...safeDeterministic];
}

function normalizedFormLabel(label: string): string {
  return label
    .replace(/[＊*]\s*(?:必填)?/g, "")
    .replace(/[（(]\s*(?:必填|选填|required|optional)\s*[）)]/gi, "")
    .replace(/\b(?:required|optional)\b/gi, "")
    .replace(/(?:^|\s)(?:必填|选填)(?=\s|$)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500) || "未命名字段";
}

function compactFormLabelForMatch(label: string): string {
  return normalizedFormLabel(label)
    .replace(/(?:请输入|请填写|请选择|输入|填写|选择|对应文件|下方|上方|本次|页面|申请信息|基本信息)/g, "")
    .replace(/[()[\]{}（）【】「」《》“”"'`~!@#$%^&*_+=,，.。;；:：?？/／\\|｜·•>\-—–\s]+/g, "")
    .trim();
}

function formLabelSemanticCategory(label: string): string | null {
  const text = compactFormLabelForMatch(label);
  if (!text) return null;
  if (/姓名|名字|fullname|name/i.test(text) && !/公司|项目|学校|院校|专业/.test(text)) return "basic.fullName";
  if (/手机|手机号|手机号码|电话|联系方式|联系电话|mobile|phone/i.test(text)) return "basic.phone";
  if (/邮箱|电子邮箱|邮件|email|mail/i.test(text)) return "basic.email";
  if (/意向城市|期望城市|工作城市|所在城市|目标城市|城市|base|location|city/i.test(text)) return "intention.city";
  if (/项目名称|项目名|projectname/i.test(text)) return "project.name";
  if (/项目角色|担任角色|角色|projectrole/i.test(text)) return "project.role";
  if (/项目描述|项目介绍|项目内容|项目职责|项目成果|projectdescription|projectdesc/i.test(text)) return "project.description";
  if (/公司名称|公司名|所在公司|单位名称|公司|company/i.test(text)) return "work.company";
  if (/职位名称|岗位名称|职位|岗位|职务|title|position/i.test(text) && !/类别|类型|分类/.test(text)) return "work.title";
  if (/(?:工作|实习|任职|经历|入职|入学|开始).*?(?:开始|起始|入职|入学)|开始时间|起始时间|startdate|from/i.test(text)) return "period.start";
  if (/(?:工作|实习|任职|经历|离职|毕业|结束).*?(?:结束|截止|离职|毕业)|结束时间|截止时间|毕业时间|enddate|to/i.test(text)) return "period.end";
  if (/负责内容|工作内容|职责描述|岗位职责|主要职责|职责|描述|description|responsibilit/i.test(text)) return "description";
  if (/学校|院校|大学|教育|school|university/i.test(text)) return "education.school";
  if (/学历|学位|degree/i.test(text)) return "education.degree";
  if (/专业|major/i.test(text)) return "education.major";
  return null;
}

function normalizedFormLabelSegments(label: string): string[] {
  const normalized = normalizedFormLabel(label);
  const segments = normalized
    .split(/\s*(?:[·•|｜>／/]|-{1,2}|—|–|:|：)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);
  return segments.length ? segments : [normalized];
}

function formLabelsSemanticallyMatch(left: string, right: string): boolean {
  const leftNormalized = normalizedFormLabel(left);
  const rightNormalized = normalizedFormLabel(right);
  if (leftNormalized === rightNormalized) return true;
  const leftCompact = compactFormLabelForMatch(leftNormalized);
  const rightCompact = compactFormLabelForMatch(rightNormalized);
  if (leftCompact && rightCompact && leftCompact === rightCompact) return true;
  const leftCategory = formLabelSemanticCategory(leftNormalized);
  const rightCategory = formLabelSemanticCategory(rightNormalized);
  if (leftCategory && rightCategory && leftCategory === rightCategory) return true;
  const leftSegments = normalizedFormLabelSegments(leftNormalized);
  const rightSegments = normalizedFormLabelSegments(rightNormalized);
  const leftTail = leftSegments[leftSegments.length - 1];
  const rightTail = rightSegments[rightSegments.length - 1];
  if (leftTail && rightTail && leftTail === rightTail) return true;
  // 招聘页常把字段显示为「基本信息 · 姓名」「申请信息 · 意向城市」；
  // AI 侧准备内容通常只传末级表头「姓名」「意向城市」。这里做保守后缀匹配，
  // 只在短标签完整出现在长标签的分段末尾时认为相同，避免把「项目名称」误配到「公司名称」。
  const shorter = leftNormalized.length <= rightNormalized.length ? leftNormalized : rightNormalized;
  const longer = leftNormalized.length <= rightNormalized.length ? rightNormalized : leftNormalized;
  const shorterCompact = leftCompact.length <= rightCompact.length ? leftCompact : rightCompact;
  const longerCompact = leftCompact.length <= rightCompact.length ? rightCompact : leftCompact;
  return (shorter.length >= 2 && (
    longer.endsWith(`· ${shorter}`) ||
    longer.endsWith(`·${shorter}`) ||
    longer.endsWith(`：${shorter}`) ||
    longer.endsWith(`:${shorter}`)
  )) || (shorterCompact.length >= 2 && longerCompact.startsWith(shorterCompact));
}

function stableIdentityKey(field: Pick<PageObservation["fields"][number], "fieldId" | "stableFieldKey" | "label" | "type">): string {
  return field.stableFieldKey || `label:${normalizedFormLabel(field.label).toLowerCase()}:${field.type}`;
}

function fieldsShareStableIdentity(
  left: Pick<PageObservation["fields"][number], "fieldId" | "stableFieldKey" | "label" | "type">,
  right: Pick<PageObservation["fields"][number], "fieldId" | "stableFieldKey" | "label" | "type">
): boolean {
  return Boolean(left.stableFieldKey && right.stableFieldKey && left.stableFieldKey === right.stableFieldKey) ||
    formLabelsSemanticallyMatch(left.label, right.label);
}

function attachMappingIdentity(
  field: PageObservation["fields"][number],
  mapping: Omit<ApplicationMapping, "stableFieldKey">
): ApplicationMapping {
  return {
    ...mapping,
    ...(field.stableFieldKey ? { stableFieldKey: field.stableFieldKey } : {})
  };
}

function cloudFieldType(field: PageObservation["fields"][number]): CloudFormField["type"] {
  if (field.type === "textarea") return "textarea";
  if (field.type === "file") return "file";
  if (field.type === "radio") return "radio";
  if (field.type === "checkbox") return "checkbox";
  if (field.type === "number") return "number";
  if (field.type === "date" || field.type === "month" || field.type === "datetime-local") return "date";
  if (field.type === "select" || field.type === "combobox") return "single_select";
  if (field.type === "contenteditable") return "rich_text";
  if (["text", "email", "tel", "url", "password"].includes(field.type)) return "text";
  return "unknown";
}

function cloudSectionKind(
  label: string,
  semanticKey: string | null
): CloudFormField["sectionKind"] {
  const value = `${label} ${semanticKey ?? ""}`;
  if (/教育|学校|学历|专业|education/.test(value)) return "education";
  if (/工作经历|实习经历|work\[|work\./.test(value)) return "work_experience";
  if (/项目经历|project\[|project\./.test(value)) return "project_experience";
  if (/科研|论文|专利|research|publication/.test(value)) return "research";
  if (/意向|期望|工作城市|preference/.test(value)) return "job_preference";
  if (/简历|附件|照片|头像|upload|resume\.file/.test(value)) return "attachments";
  if (/隐私|授权|条款|consent/.test(value)) return "consent";
  if (/姓名|电话|手机|邮箱|性别|出生|basic\./.test(value)) return "basic_information";
  return "custom";
}

export function cloudFormFields(
  observation: PageObservation,
  mappings: ApplicationMapping[]
): CloudFormField[] {
  const mappingByField = new Map(mappings.map((mapping) => [mapping.fieldId, mapping]));
  const semanticCounts = new Map<string, number>();
  return observation.fields.map((field, order) => {
    const mapping = mappingByField.get(field.fieldId);
    const semanticKey = mapping?.semanticKey ?? null;
    const normalizedLabel = normalizedFormLabel(field.label);
    const identity = semanticKey ?? stableIdentityKey(field);
    const repeatIndex = semanticCounts.get(identity) ?? 0;
    semanticCounts.set(identity, repeatIndex + 1);
    const stableRepeatIndex = typeof field.groupIndex === "number" ? field.groupIndex : repeatIndex;
    return {
      fieldKey: field.stableFieldKey ?? (repeatIndex ? `${identity}[${repeatIndex}]` : identity),
      label: field.label.slice(0, 500),
      normalizedLabel,
      type: cloudFieldType(field),
      required: field.required,
      sectionKind: cloudSectionKind(field.label, semanticKey),
      repeatable: stableRepeatIndex > 0 || /\[\d+\]/.test(semanticKey ?? ""),
      ...(stableRepeatIndex > 0 ? { repeatIndex: stableRepeatIndex } : {}),
      order,
      semanticKey,
      mappingConfidence: mapping?.confidence ?? null,
      options: field.options.slice(0, 1_000),
      controlHints: {
        role: field.type === "combobox" ? "combobox" : null,
        inputMode: ["email", "tel", "number", "url"].includes(field.type) ? field.type : null,
        stableFieldKey: field.stableFieldKey ?? null,
        sectionKey: field.sectionKey ?? null,
        controlKind: field.controlKind ?? null
      }
    };
  });
}

async function syncObservedForm(
  current: ExtensionState,
  application: ActiveApplication,
  observation: PageObservation,
  mappings: ApplicationMapping[]
): Promise<void> {
  if (application.entryMode !== "selected_job" || application.jobId.startsWith("manual:")) return;
  if (!current.cloudService.tokenConfigured || !current.cloudService.baseUrl) return;
  const job = current.jobs.find((entry) => entry.id === application.jobId);
  if (!job) return;
  try {
    const client = await configuredCloudClient(current.cloudService);
    await client.recordApplicationFormObservation(application.jobId, {
      status: observation.loginRequired
        ? "login_required"
        : observation.formDetected ? "observed" : "not_applicable",
      applicationUrl: observation.url || job.applicationUrl,
      siteHost: new URL(observation.url || job.applicationUrl).host,
      channel: job.channels[0],
      loginRequired: observation.loginRequired,
      fingerprint: observation.fingerprint || null,
      fields: observation.loginRequired ? [] : cloudFormFields(observation, mappings),
      observedAt: observation.observedAt
    }, crypto.randomUUID(), AbortSignal.timeout(15_000));
  } catch (error) {
    const publicError = toPublicError(cloudError(error, "cloud_sync"));
    await recordSystemError(publicError, "FORM_SCHEMA_SYNC");
  }
}

async function observeApplicationPageWithControlAdapters(tabId: number): Promise<PageObservation | undefined> {
  const execution = await executeInterruptibleScript({
    target: { tabId },
    func: observeApplicationPage,
    args: [submissionActionPatterns]
  });
  const generic = execution[0]?.result as PageObservation | undefined;
  if (!generic) return generic;
  if (isFeishuFormilyApplicationUrl(generic.url) || isFeishuMonthPeriodApplicationUrl(generic.url)) {
    // The bundled observer gathers roots and logical date fields synchronously
    // in one document. Planning and the executing Driver share this exact view.
    return observeApplicationWithDialectsInTab(tabId);
  }
  return withFieldInformationRequirements(generic);
}

async function stableApplicationObservation(tabId: number, options: { forControlDispatch?: boolean } = {}): Promise<PageObservation> {
  let previousSignature = "";
  let stableReads = 0;
  let latest: PageObservation | undefined;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, options.forControlDispatch ? (attempt === 0 ? 0 : 100) : attempt === 0 ? 1_200 : 600));
    latest = await observeApplicationPageWithControlAdapters(tabId);
    if (latest && isXiaopengApplicationUrl(latest.url)) {
      // Xiaopeng's Feishu form does not expose native required/aria-required
      // attributes for its application schema. Materialize the adapter's known
      // required controls so an empty form cannot falsely converge before the
      // visual planner runs. Repeated education/work controls remain explicit
      // field instances and are never collapsed as inferred duplicates.
      latest = {
        ...latest,
        fields: latest.fields.map((field) => {
          const identity = `${field.sectionTitle ?? ""} ${field.label} ${field.stableFieldKey ?? ""}`;
          const adapterRequired = /意向.*城市|期望.*城市|(?:^|[·\s])姓名|手机(?:号码)?|邮箱|简历|学校(?:名称)?|院校|学历|学位|专业|教育经历.*(?:起止时间|开始时间|结束时间|入学时间|毕业时间)|工作经历.*(?:公司(?:名称)?|职位(?:名称)?|起止时间|开始时间|结束时间|描述|职责)|我已阅读并同意隐私政策/.test(identity);
          return adapterRequired && !field.required
            ? { ...field, required: true, requiredSource: "explicit" as const }
            : field;
        })
      };
    }
    if (!latest || latest.transientBusy) {
      stableReads = 0;
      continue;
    }
    const signature = applicationObservationStabilitySignature(latest);
    stableReads = signature === previousSignature ? stableReads + 1 : 1;
    previousSignature = signature;
    if (stableReads >= 2) return latest;
  }
  if (!latest) throw new Error("无法重新读取真实表单");
  if (options.forControlDispatch) throw new Error("control_page_not_stable: 页面持续变化，未开始控件操作");
  return latest;
}

async function applicationDomMutationState(tabId: number): Promise<ApplicationDomMutationState> {
  const execution = await executeInterruptibleScript({
    target: { tabId },
    func: readApplicationDomMutationState
  });
  return execution[0]?.result ?? { version: 0, lastMutationAt: Date.now() };
}

async function settleApplicationDomAfterFill(
  tabId: number,
  baselineVersion: number,
  instruction: FillInstruction
): Promise<ApplicationDomMutationState & { changed: boolean }> {
  const policy = applicationMutationWaitPolicy(instruction);
  const execution = await executeInterruptibleScript({
    target: { tabId },
    func: waitForApplicationDomMutation,
    args: [{
      baselineVersion,
      ...policy
    }]
  });
  return execution[0]?.result ?? {
    version: baselineVersion,
    lastMutationAt: Date.now(),
    changed: true
  };
}

/** One capability table serves normal filling and read-only option discovery.
 * Keeping the routes together prevents a registered Select Driver from being
 * fillable while silently losing its choices during user supplementation. */
function mokaFlatSelectControlExecutors(
  tabId: number,
  page: PageObservation,
  discoverOptions = false
) {
  const specialized = (field: PageFieldObservation, instruction: FillInstruction) =>
    executeMokaRecruitingSourceInstructionWithTrustedFocusDriver(
      tabId, page, field, instruction, discoverOptions
    );
  return {
    "moka.flat-select.trusted-focus.v1": (field: PageFieldObservation, instruction: FillInstruction) =>
      executeMokaSharedSelectInstruction(tabId, field, instruction, discoverOptions),
    "moka.legacy-school-search.trusted-focus.v1": (field: PageFieldObservation, instruction: FillInstruction) =>
      executeMokaSharedSelectInstruction(tabId, field, instruction, discoverOptions),
    "moka.readonly-calling-code.trusted-focus.v1": (field: PageFieldObservation, instruction: FillInstruction) =>
      executeMokaSharedSelectInstruction(tabId, field, instruction, discoverOptions),
    "moka.search-select.trusted-focus.v1": (field: PageFieldObservation, instruction: FillInstruction) =>
      executeMokaSharedSelectInstruction(tabId, field, instruction, discoverOptions),
    "moka.work-city-multi.trusted-focus.v1": (field: PageFieldObservation, instruction: FillInstruction) =>
      executeMokaSharedSelectInstruction(tabId, field, instruction, discoverOptions),
    "moka.recruiting-source.trusted-focus.v1": specialized,
    "moka.sina.weibo-frequency.trusted-focus.v1": specialized,
    "moka.eqhr.travel-acceptance.trusted-focus.v1": specialized,
    "moka.yongxing.ethnicity.trusted-focus.v1": specialized,
    "moka.sungrow.identity-document-type.trusted-focus.v1": specialized,
    "moka.sungrow.relative-employment.trusted-focus.v1": specialized
  };
}

async function withDiscoveredRequiredFieldOptions(
  tabId: number,
  fields: PageFieldObservation[]
): Promise<PageFieldObservation[]> {
  // Search versus tree comes from the owned popup, never from a location label.
  for (const before of fields.filter(field=>field.required&&needsFeishuSelectorDiscovery(field))) {
    const page=await stableApplicationObservation(tabId,{forControlDispatch:true});
    const instruction:FillInstruction={fieldId:before.fieldId,stableFieldKey:before.stableFieldKey,selector:before.selector,expectedLabel:before.label,type:before.type,value:""};
    const prepared=await prepareFeishuSelectorInTab(tabId,page,instruction);
    if(prepared.failure) throw controlExecutionError(before,prepared.failure);
    const after=bindObservedInstruction(prepared.page,instruction);
    if(after) fields=fields.map(field=>field===before?{...field,observedControlKind:after.observedControlKind,optionSource:after.optionSource}:field);
  }
  const optionsByKey = new Map<string, string[]>();
  const observedKindsByKey = new Map<string, PageFieldObservation["observedControlKind"]>();
  const targets = fields.filter(field => field.required && !field.options.length &&
    field.optionSource !== "search" &&
    !fieldInformationRequirement(field) && /select|combobox|radio/i.test(`${field.type} ${field.controlKind ?? ""}`));
  for (const before of targets) {
    const page = await stableApplicationObservation(tabId, { forControlDispatch: true });
    const instruction: FillInstruction = { fieldId: before.fieldId, stableFieldKey: before.stableFieldKey,
      selector: before.selector, expectedLabel: before.label, type: before.type, value: "" };
    const observed = bindObservedInstruction(page, instruction);
    if (observed?.fieldSource && needsFeishuAtsxChoiceDiscovery(observed)) {
      const prepared = await prepareFeishuAtsxChoiceInTab(tabId, page, instruction);
      if (prepared.failure) throw controlExecutionError(before, prepared.failure);
      const after = bindObservedInstruction(prepared.page, instruction);
      if (before.stableFieldKey && after) {
        optionsByKey.set(before.stableFieldKey, after.options);
        observedKindsByKey.set(before.stableFieldKey, after.observedControlKind);
      }
      continue;
    }
    const result = await dispatchControlInstruction(page, instruction, {
      "generic.native.v1": async field => ({ fieldId: field.fieldId, success: true,
        expected: "", actual: field.currentValue, error: null, availableOptions: field.options }),
      "feishu.formily-flat-select.trusted-pointer.v1": (field, next) =>
        executeFeishuFormilySelectInstruction(tabId, field, next, true),
      "feishu.formily-multi-select.trusted-pointer.v1": (_field, next) => executeFeishuMultiSelectInTab(tabId,page,next,true),
      ...mokaFlatSelectControlExecutors(tabId, page, true),
      ...Object.fromEntries([...MOKA_LOCATION_DRIVER_CODES].map(code => [code,
        async (field: PageFieldObservation, _instruction: FillInstruction, route: ReturnType<typeof resolveControlAdapter>) => {
          const options = await discoverEvidencedMokaLocationFieldOptionsWithTrustedFocusDriver(tabId, page.url, field,
            route.diagnostic.registrationId);
          return options === null ? null : { fieldId: field.fieldId, success: true,
            expected: "", actual: field.currentValue, error: null, availableOptions: options };
        }]))
    });
    if (!result.success) throw controlExecutionError(before, result);
    if (before.stableFieldKey) optionsByKey.set(before.stableFieldKey, result.availableOptions ?? []);
  }
  return fields.map(field => ({ ...field,
    ...(observedKindsByKey.has(field.stableFieldKey ?? "") ? {observedControlKind: observedKindsByKey.get(field.stableFieldKey ?? "")} : {}),
    options: optionsByKey.get(field.stableFieldKey ?? "") ?? field.options }));
}

/** Option discovery is enrichment, never a gate that hides a site's rejection. */
async function collectSiteRejectedInformation(tabId: number, fields: PageFieldObservation[]) {
  const optionDiscoveryFailures: Array<{ stableFieldKey: string; message: string }> = [];
  const enriched: PageFieldObservation[] = [];
  for (const field of fields) {
    try {
      enriched.push(...await withDiscoveredRequiredFieldOptions(tabId, [field]));
    } catch (error) {
      enriched.push(field);
      optionDiscoveryFailures.push({ stableFieldKey: siteValidationFieldKey(field),
        message: error instanceof Error ? error.message : "未能读取选项" });
    }
  }
  try {
    return { requiredFieldRequests: siteRejectedInformationRequests(enriched), optionDiscoveryFailures };
  } catch (error) {
    if (error instanceof RecruitingError) {
      throw new RecruitingError({ ...error.publicError,
        details: { ...error.publicError.details, optionDiscoveryFailures } });
    }
    throw error;
  }
}

function aiBridgeEvent(
  command: AiPluginCommand,
  type: string,
  status: AiPluginEvent["status"],
  payload: Record<string, unknown>,
  error: ReturnType<typeof toPublicError> | null = null
): AiPluginEvent {
  return {
    schemaVersion: "ai-plugin-event.v1",
    eventId: crypto.randomUUID(),
    commandId: command.commandId,
    conversationId: command.conversationId,
    tenantId: command.tenantId,
    userId: command.userId,
    type,
    status,
    occurredAt: new Date().toISOString(),
    payload,
    error
  };
}

function ensureAiCommand(command: unknown): AiPluginCommand {
  const candidate = command as Partial<AiPluginCommand> | null;
  if (!candidate || candidate.schemaVersion !== "ai-plugin-command.v1" ||
    !candidate.commandId || !candidate.conversationId || !candidate.tenantId ||
    !candidate.userId || !candidate.type || !candidate.idempotencyKey || !candidate.expiresAt) {
    throw new RecruitingError({
      code: "INVALID_INPUT",
      stage: "transport",
      message: "AI Bridge 命令信封不完整",
      retryable: false,
      userAction: "AI 侧按 ai-plugin-command.v1 重新下发命令。"
    });
  }
  const expiresAt = Date.parse(candidate.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new RecruitingError({
      code: "APPROVAL_EXPIRED",
      stage: "approval",
      message: "AI Bridge 命令已过期",
      retryable: false,
      userAction: "AI 侧重新生成短期命令。"
    });
  }
  return {
    ...candidate,
    payload: candidate.payload ?? {},
    safety: {
      allowFinalSubmit: false,
      allowConsentClick: false,
      allowCaptchaHandling: false,
      ...(candidate.safety ?? {})
    }
  } as AiPluginCommand;
}

function expiredAutoApplyCommandEvent(rawCommand: unknown): AiPluginEvent | null {
  const candidate = rawCommand as Partial<AiPluginCommand> | null;
  if (!candidate || candidate.schemaVersion !== "ai-plugin-command.v1" ||
    candidate.type !== "browser.execute_batch_auto_apply_job" || !candidate.commandId ||
    !candidate.conversationId || !candidate.tenantId || !candidate.userId ||
    !candidate.idempotencyKey || !candidate.expiresAt ||
    !Number.isFinite(Date.parse(candidate.expiresAt)) || Date.parse(candidate.expiresAt) > Date.now()) {
    return null;
  }
  const payload = asRecord(candidate.payload) ?? {};
  const batchId = String(payload.batchId ?? "");
  const batchJobId = String(payload.batchJobId ?? "");
  const jobId = String(asRecord(payload.job)?.jobId ?? "");
  if (!batchId || !batchJobId || !jobId) return null;
  const command: AiPluginCommand = {
    ...candidate,
    payload,
    safety: {
      allowFinalSubmit: false,
      allowConsentClick: false,
      allowCaptchaHandling: false,
      ...(candidate.safety ?? {})
    }
  } as AiPluginCommand;
  return batchResultEvent(command, {
    batchId,
    batchJobId,
    jobId,
    status: "failed",
    reasonCode: "command_expired",
    evidence: {
      screenshotRef: null,
      redacted: true,
      pageUrl: null,
      siteConfirmation: null,
      diagnostic: autoApplyDiagnostic("command_expired")
    }
  });
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return hexFromBytes(new Uint8Array(digest));
}

function hexFromBytes(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256HexFromArrayBuffer(value: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function observationReadbackHash(observation: PageObservation): Promise<string> {
  const stable = observation.fields.map((field) => ({
    key: field.stableFieldKey ?? field.fieldId,
    label: field.label,
    type: field.type,
    value: field.currentValue
  })).sort((left, right) => left.key.localeCompare(right.key));
  return `sha256:${await sha256Hex(JSON.stringify({
    url: observation.url,
    fingerprint: observation.fingerprint,
    fields: stable
  }))}`;
}

function base64FromArrayBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function boundedFetch<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
  consume: (response: Response) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const effectiveCallerSignal = callerSignal ?? init.signal;
  const abortFromCaller = () => controller.abort(effectiveCallerSignal?.reason);
  const timeout = setTimeout(
    () => controller.abort(new DOMException("网络请求超时", "TimeoutError")),
    timeoutMs
  );
  if (effectiveCallerSignal) {
    if (effectiveCallerSignal.aborted) abortFromCaller();
    else effectiveCallerSignal.addEventListener("abort", abortFromCaller, { once: true });
  }
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return await consume(response);
  } finally {
    clearTimeout(timeout);
    effectiveCallerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

async function resumePayloadFromAiFileRef(
  file: AiSideFileRef,
  signal?: AbortSignal
): Promise<ResumeFilePayload> {
  if (file.expiresAt && Date.parse(file.expiresAt) <= Date.now()) {
    throw new RecruitingError({
      code: "APPROVAL_EXPIRED",
      stage: "approval",
      message: "AI 侧 fileRef 已过期",
      retryable: false,
      userAction: "AI 侧重新生成短期 fileRef 后再下发上传命令。"
    });
  }
  if (file.base64) {
    return {
      name: file.name,
      type: file.mediaType ?? file.type ?? "application/octet-stream",
      base64: file.base64
    };
  }
  const fileRef = String(file.fileRef ?? "");
  if (!/^https?:\/\//i.test(fileRef)) {
    throw new RecruitingError({
      code: "INVALID_INPUT",
      stage: "transport",
      message: "当前插件直连上传只支持 HTTP(S) 短期签名 fileRef",
      retryable: false,
      userAction: "AI 侧将私有文件转换为短期 HTTPS 下载 URL，或通过本机 Bridge 代取后再下发。"
    });
  }
  const buffer = await boundedFetch(
    fileRef,
    { method: "GET", cache: "no-store" },
    15_000,
    signal,
    async (response) => {
      if (!response.ok) {
        throw new RecruitingError({
          code: "TRANSPORT_FAILED",
          stage: "transport",
          message: `下载 fileRef 失败：HTTP ${response.status}`,
          retryable: true,
          userAction: "AI 侧检查 fileRef 是否过期或权限是否正确。"
        });
      }
      return response.arrayBuffer();
    }
  );
  if (file.sha256) {
    const actual = await sha256HexFromArrayBuffer(buffer);
    if (actual !== file.sha256.toLowerCase()) {
      throw new RecruitingError({
        code: "INVALID_INPUT",
        stage: "transport",
        message: "fileRef 文件 SHA-256 校验失败",
        retryable: false,
        userAction: "AI 侧重新生成文件引用。"
      });
    }
  }
  return {
    name: file.name,
    type: file.mediaType ?? file.type ?? response.headers.get("content-type") ?? "application/octet-stream",
    base64: base64FromArrayBuffer(buffer)
  };
}

function findObservedField(
  observation: PageObservation,
  key: unknown
): PageObservation["fields"][number] | null {
  const value = String(key ?? "");
  if (!value) return null;
  return observation.fields.find((field) =>
    field.fieldId === value ||
    field.stableFieldKey === value ||
    field.label === value ||
    normalizedFormLabel(field.label) === normalizedFormLabel(value)
  ) ?? null;
}

function manualSectionKind(value: unknown): ManualAssistSection["kind"] {
  const normalized = String(value ?? "").toLowerCase();
  if (["basic", "education", "work", "project", "award", "skill", "narrative"].includes(normalized)) {
    return normalized as ManualAssistSection["kind"];
  }
  if (normalized === "internship") return "work";
  if (normalized === "research" || normalized === "publication") return "project";
  if (normalized === "intention") return "basic";
  return "other";
}

function sectionKindTitle(kind: ManualAssistSection["kind"]): string {
  return {
    basic: "基本信息",
    education: "教育经历",
    work: "工作经历",
    project: "项目经历",
    award: "获奖经历",
    skill: "技能信息",
    narrative: "自我评价",
    other: "其他信息"
  }[kind];
}

function manualString(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean).join("、");
  if (typeof value === "boolean") return value ? "是" : "否";
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function degreeRank(value: string): number {
  if (/博士|phd|doctor/i.test(value)) return 5;
  if (/硕士|研究生|master/i.test(value)) return 4;
  if (/本科|学士|bachelor/i.test(value)) return 3;
  if (/大专|专科|associate|college/i.test(value)) return 2;
  if (/高中|中专|中职|high/i.test(value)) return 1;
  return 0;
}

function deriveHighestDegreeFromCandidate(candidate: Record<string, unknown>): string {
  const direct = manualString(
    asRecord(candidate.basic)?.highestDegree ??
    asRecord(candidate.profile)?.highestDegree ??
    asRecord(candidate.personal)?.highestDegree ??
    candidate.highestDegree ??
    candidate.degree
  ).trim();
  if (direct) return direct;
  const educations = candidate.educations ?? candidate.education;
  if (!Array.isArray(educations)) return "";
  const ranked = educations.flatMap((raw) => {
    const record = asRecord(raw);
    const degree = manualString(record?.degree ?? record?.educationLevel ?? record?.学历).trim();
    return degree ? [{ degree, rank: degreeRank(degree) }] : [];
  }).sort((left, right) => right.rank - left.rank);
  return ranked[0]?.degree ?? "";
}

function cleanManualValue(label: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/项目|经历|公司|岗位|职位|学校|专业|名称/.test(label)) {
    return trimmed.replace(/[|｜/／、，,;；:：\s]+$/g, "").trim();
  }
  return trimmed;
}

function manualAssistItemFromRaw(
  raw: unknown,
  index: number,
  context: {
    sectionId?: string;
    sectionTitle?: string;
    sectionKind?: ManualAssistSection["kind"];
    groupIndex?: number;
    idPrefix?: string;
  } = {}
): ManualAssistField | null {
  const item = raw as Record<string, unknown> | null;
  if (!item || typeof item !== "object") return null;
  const label = String(item.label ?? item.expectedLabel ?? item.fieldLabel ?? item.name ?? "").trim();
  const value = cleanManualValue(label, manualString(item.value ?? item.proposedValue ?? item.answer ?? item.text ?? ""));
  const fieldId = String(item.fieldId ?? "").trim();
  const stableFieldKey = String(item.stableFieldKey ?? "").trim();
  const fieldKey = String(item.fieldKey ?? item.key ?? "").trim();
  if (!label && !fieldId && !stableFieldKey && !fieldKey) return null;
  const options = Array.isArray(item.options)
    ? item.options.map((option) => String(option)).filter(Boolean)
    : undefined;
  return {
    id: String(item.id ?? fieldId ?? stableFieldKey ?? fieldKey ?? `${context.idPrefix ?? "manual-field"}-${index + 1}`),
    label: label || fieldKey || stableFieldKey || fieldId || `字段 ${index + 1}`,
    value,
    valueSource: String(item.valueSource ?? item.source ?? item.factKey ?? "ai_side"),
    ...(context.sectionId ? { sectionId: context.sectionId } : {}),
    ...(context.sectionTitle ? { sectionTitle: context.sectionTitle } : {}),
    ...(context.sectionKind ? { sectionKind: context.sectionKind } : {}),
    ...(Number.isInteger(context.groupIndex) ? { groupIndex: context.groupIndex } : {}),
    ...(fieldId ? { fieldId } : {}),
    ...(stableFieldKey ? { stableFieldKey } : {}),
    ...(fieldKey ? { fieldKey } : {}),
    ...(typeof item.type === "string" || typeof item.controlKind === "string"
      ? { type: String(item.type ?? item.controlKind) }
      : {}),
    ...(typeof item.required === "boolean" ? { required: item.required } : {}),
    ...(options ? { options } : {}),
    ...(typeof item.note === "string" ? { note: item.note } : {})
  };
}

function manualSectionFromRaw(raw: unknown, index: number): ManualAssistSection | null {
  const section = raw as Record<string, unknown> | null;
  if (!section || typeof section !== "object") return null;
  const kind = manualSectionKind(section.kind ?? section.type);
  const id = String(section.id ?? `${kind}-section-${index + 1}`).trim();
  const title = String(section.title ?? section.label ?? section.name ?? `${sectionKindTitle(kind)} ${index + 1}`).trim();
  const rawItems = Array.isArray(section.items)
    ? section.items
    : Array.isArray(section.fields)
      ? section.fields
      : Array.isArray(section.subItems)
        ? section.subItems
        : Array.isArray(section.values)
          ? section.values
          : [];
  const items = rawItems
    .map((item, itemIndex) => manualAssistItemFromRaw(item, itemIndex, {
      sectionId: id,
      sectionTitle: title,
      sectionKind: kind,
      groupIndex: index,
      idPrefix: id
    }))
    .filter((item): item is ManualAssistField => Boolean(item));
  if (!items.length) return null;
  return {
    id,
    title,
    kind,
    ...(typeof section.note === "string" ? { note: section.note } : {}),
    items
  };
}

function factItems(
  sectionId: string,
  sectionTitle: string,
  sectionKind: ManualAssistSection["kind"],
  facts: Record<string, unknown>,
  mappings: Array<[string, string]>,
  groupIndex: number
): ManualAssistField[] {
  return mappings
    .filter(([factKey]) => factKey in facts)
    .map(([factKey, label], index) => manualAssistItemFromRaw({
      id: `${sectionId}-${factKey}`,
      label,
      value: facts[factKey],
      valueSource: `resume.${sectionKind}.${groupIndex}.${factKey}`
    }, index, {
      sectionId,
      sectionTitle,
      sectionKind,
      groupIndex,
      idPrefix: sectionId
    }))
    .filter((item): item is ManualAssistField => Boolean(item));
}

function manualSectionsFromResumeKnowledge(resumeKnowledge: unknown): ManualAssistSection[] {
  const snapshot = resumeKnowledge as { sections?: Array<{ kind?: string; id?: string; facts?: Record<string, unknown>; polishedText?: string }> } | null;
  if (!snapshot || !Array.isArray(snapshot.sections)) return [];
  return snapshot.sections.map((section, index) => {
    const kind = manualSectionKind(section.kind);
    const facts = section.facts ?? {};
    const id = String(section.id ?? `${kind}-${index + 1}`);
    const title = (() => {
      if (kind === "work") return `工作经历 ${index + 1}${facts.company ? `｜${manualString(facts.company)}` : ""}`;
      if (kind === "project") return `项目经历 ${index + 1}${facts.name ? `｜${manualString(facts.name)}` : ""}`;
      if (kind === "education") return `教育经历 ${index + 1}${facts.school ? `｜${manualString(facts.school)}` : ""}`;
      return sectionKindTitle(kind);
    })();
    const mappingByKind: Record<ManualAssistSection["kind"], Array<[string, string]>> = {
      basic: [["fullName", "姓名"], ["phone", "手机号码"], ["email", "邮箱"], ["currentCity", "当前城市"], ["nativePlace", "籍贯"], ["hometown", "籍贯"], ["placeOfOrigin", "籍贯"], ["birthDate", "出生日期"], ["highestDegree", "最高学历"], ["preferredCities", "意向城市"], ["targetRole", "目标岗位"], ["employmentType", "求职类型"], ["expectedSalary", "期望薪资"]],
      education: [["school", "学校名称"], ["degree", "学历"], ["major", "专业"], ["startDate", "开始时间"], ["endDate", "结束时间"], ["graduationYear", "毕业年份"], ["gpa", "GPA"]],
      work: [["company", "公司名称"], ["title", "职位名称"], ["city", "工作城市"], ["startDate", "开始时间"], ["endDate", "结束时间"], ["responsibilities", "主要职责"], ["description", "工作描述"]],
      project: [["name", "项目名称"], ["role", "项目角色"], ["startDate", "开始时间"], ["endDate", "结束时间"], ["technologies", "技术栈"], ["responsibilities", "项目职责"], ["description", "项目成果"]],
      award: [["name", "奖项名称"], ["date", "获奖时间"], ["description", "奖项说明"]],
      skill: [["summary", "技能总结"], ["languages", "语言能力"]],
      narrative: [["selfIntroduction", "自我评价"], ["summary", "自我评价"]],
      other: Object.keys(facts).map((key) => [key, key])
    };
    const items = factItems(id, title, kind, facts, mappingByKind[kind], index);
    if (section.polishedText) {
      const polished = manualAssistItemFromRaw({
        id: `${id}-polishedText`,
        label: kind === "project" ? "项目亮点" : kind === "work" ? "工作亮点" : "润色文本",
        value: section.polishedText,
        valueSource: `resume.${kind}.${index}.polishedText`
      }, items.length, { sectionId: id, sectionTitle: title, sectionKind: kind, groupIndex: index, idPrefix: id });
      if (polished) items.push(polished);
    }
    return items.length ? { id, title, kind, items } : null;
  }).filter((section): section is ManualAssistSection => Boolean(section));
}

function manualSectionsFromParsedResume(payload: Record<string, unknown>): ManualAssistSection[] {
  const resume = (payload.parsedResume ?? payload.resume ?? payload.resumeSnapshot) as Record<string, unknown> | undefined;
  if (!resume || typeof resume !== "object") return [];
  const sections: ManualAssistSection[] = [];
  const basicFacts = (resume.basic ?? resume.profile ?? resume.personal ?? resume) as Record<string, unknown>;
  const basicItems = factItems("basic-1", "基本信息", "basic", basicFacts, [
    ["fullName", "姓名"],
    ["name", "姓名"],
    ["phone", "手机号码"],
    ["mobile", "手机号码"],
    ["email", "邮箱"],
    ["currentCity", "当前城市"],
    ["nativePlace", "籍贯"],
    ["hometown", "籍贯"],
    ["placeOfOrigin", "籍贯"],
    ["highestDegree", "最高学历"],
    ["preferredCities", "意向城市"],
    ["targetRole", "目标岗位"],
    ["employmentType", "求职类型"],
    ["expectedSalary", "期望薪资"]
  ], 0);
  if (basicItems.length) sections.push({ id: "basic-1", title: "基本信息", kind: "basic", items: basicItems });
  const pushStructured = (
    rawList: unknown,
    kind: ManualAssistSection["kind"],
    titlePrefix: string,
    mapping: Array<[string, string]>
  ) => {
    if (!Array.isArray(rawList)) return;
    rawList.forEach((raw, index) => {
      const facts = raw as Record<string, unknown>;
      if (!facts || typeof facts !== "object") return;
      const id = `${kind}-${index + 1}`;
      const title = `${titlePrefix} ${index + 1}${facts.companyName || facts.company || facts.projectName || facts.name || facts.school ? `｜${manualString(facts.companyName ?? facts.company ?? facts.projectName ?? facts.name ?? facts.school)}` : ""}`;
      const items = factItems(id, title, kind, facts, mapping, index);
      if (items.length) sections.push({ id, title, kind, items });
    });
  };
  pushStructured(resume.education ?? resume.educations, "education", "教育经历", [["school", "学校名称"], ["degree", "学历"], ["major", "专业"], ["startDate", "开始时间"], ["endDate", "结束时间"], ["graduationYear", "毕业年份"]]);
  pushStructured(resume.workExperiences ?? resume.workExperience ?? resume.work ?? resume.internships, "work", "工作经历", [["companyName", "公司名称"], ["company", "公司名称"], ["positionTitle", "职位名称"], ["title", "职位名称"], ["city", "工作城市"], ["startDate", "开始时间"], ["endDate", "结束时间"], ["responsibilities", "主要职责"], ["description", "工作描述"]]);
  pushStructured(resume.projectExperiences ?? resume.projects ?? resume.project, "project", "项目经历", [["projectName", "项目名称"], ["name", "项目名称"], ["role", "项目角色"], ["startDate", "开始时间"], ["endDate", "结束时间"], ["technologies", "技术栈"], ["responsibilities", "项目职责"], ["description", "项目成果"]]);
  return sections;
}

function manualSectionsFromCandidate(candidate: unknown): ManualAssistSection[] {
  const resume = candidate as Record<string, unknown> | null;
  if (!resume || typeof resume !== "object") return [];
  const sections: ManualAssistSection[] = [];
  const pushFacts = (
    id: string,
    title: string,
    kind: ManualAssistSection["kind"],
    facts: unknown,
    mapping: Array<[string, string]>,
    groupIndex = 0
  ) => {
    const record = facts as Record<string, unknown> | null;
    if (!record || typeof record !== "object") return;
    const items = factItems(id, title, kind, record, mapping, groupIndex);
    if (items.length) sections.push({ id, title, kind, items });
  };
  const pushList = (
    rawList: unknown,
    kind: ManualAssistSection["kind"],
    titlePrefix: string,
    mapping: Array<[string, string]>
  ) => {
    const list = Array.isArray(rawList) ? rawList : [];
    list.forEach((raw, index) => {
      if (typeof raw === "string") {
        const item = manualAssistItemFromRaw({
          id: `${kind}-${index + 1}-value`,
          label: titlePrefix,
          value: raw,
          valueSource: `candidate.${kind}[${index}]`
        }, 0, {
          sectionId: `${kind}-${index + 1}`,
          sectionTitle: `${titlePrefix} ${index + 1}`,
          sectionKind: kind,
          groupIndex: index
        });
        if (item) sections.push({ id: `${kind}-${index + 1}`, title: `${titlePrefix} ${index + 1}`, kind, items: [item] });
        return;
      }
      const facts = raw as Record<string, unknown> | null;
      if (!facts || typeof facts !== "object") return;
      const name = facts.companyName ?? facts.company ?? facts.projectName ?? facts.name ?? facts.school ?? facts.title;
      const id = `${kind}-${index + 1}`;
      const title = `${titlePrefix} ${index + 1}${name ? `｜${manualString(name)}` : ""}`;
      const items = factItems(id, title, kind, facts, mapping, index);
      if (items.length) sections.push({ id, title, kind, items });
    });
  };

  const basicRecord = asRecord(resume.basic) ?? asRecord(resume.profile) ?? asRecord(resume.personal);
  const derivedHighestDegree = deriveHighestDegreeFromCandidate(resume);
  const basicWithDerivedDegree = basicRecord
    ? {
      ...basicRecord,
      ...(!manualString(basicRecord.highestDegree).trim() && derivedHighestDegree
        ? { highestDegree: derivedHighestDegree }
        : {})
    }
    : derivedHighestDegree
      ? { highestDegree: derivedHighestDegree }
      : null;
  pushFacts("basic-1", "基本信息", "basic", basicWithDerivedDegree, [
    ["fullName", "姓名"],
    ["name", "姓名"],
    ["phone", "手机号码"],
    ["mobile", "手机号码"],
    ["email", "邮箱"],
    ["currentCity", "当前城市"],
    ["nativePlace", "籍贯"],
    ["hometown", "籍贯"],
    ["placeOfOrigin", "籍贯"],
    ["gender", "性别"],
    ["birthDate", "出生日期"],
    ["highestDegree", "最高学历"],
    ["idNumber", "证件号码"]
  ]);
  pushFacts("preferences-1", "求职偏好", "basic", resume.preferences ?? resume.intention, [
    ["preferredCities", "意向城市"],
    ["targetRole", "目标岗位"],
    ["jobType", "岗位类型"],
    ["employmentType", "求职类型"],
    ["expectedSalary", "期望薪资"],
    ["industries", "意向行业"]
  ], 1);
  pushList(resume.educations ?? resume.education, "education", "教育经历", [
    ["school", "学校名称"],
    ["degree", "学历"],
    ["major", "专业"],
    ["startDate", "开始时间"],
    ["endDate", "结束时间"],
    ["graduationYear", "毕业年份"],
    ["gpa", "GPA"],
    ["description", "教育经历说明"]
  ]);
  pushList(resume.workExperiences ?? resume.workExperience ?? resume.work ?? resume.internships, "work", "工作经历", [
    ["companyName", "公司名称"],
    ["company", "公司名称"],
    ["positionTitle", "职位名称"],
    ["title", "职位名称"],
    ["city", "工作城市"],
    ["startDate", "开始时间"],
    ["endDate", "结束时间"],
    ["responsibilities", "主要职责"],
    ["description", "工作描述"]
  ]);
  pushList(resume.projectExperiences ?? resume.projects ?? resume.project, "project", "项目经历", [
    ["projectName", "项目名称"],
    ["name", "项目名称"],
    ["role", "项目角色"],
    ["startDate", "开始时间"],
    ["endDate", "结束时间"],
    ["technologies", "技术栈"],
    ["responsibilities", "项目职责"],
    ["description", "项目成果"]
  ]);
  pushList(resume.research ?? resume.publications, "project", "科研成果", [
    ["title", "成果名称"],
    ["name", "成果名称"],
    ["date", "发表时间"],
    ["description", "成果说明"]
  ]);
  pushList(resume.awards ?? resume.certificates, "award", "获奖证书", [
    ["name", "名称"],
    ["title", "名称"],
    ["date", "时间"],
    ["issuer", "颁发机构"],
    ["description", "说明"]
  ]);
  pushList(resume.skills, "skill", "技能信息", [
    ["summary", "技能总结"],
    ["name", "技能名称"],
    ["level", "熟练程度"],
    ["description", "技能说明"]
  ]);
  pushList(resume.languages, "skill", "语言能力", [
    ["name", "语言"],
    ["level", "熟练程度"],
    ["score", "成绩"]
  ]);
  pushFacts("narrative-1", "自我评价", "narrative", {
    selfEvaluation: resume.selfEvaluation ?? resume.selfIntroduction ?? resume.summary
  }, [["selfEvaluation", "自我评价"]]);
  return sections;
}

function sectionKindFromSemanticKey(value: unknown): ManualAssistSection["kind"] {
  const key = String(value ?? "");
  if (/^education\./i.test(key)) return "education";
  if (/^(work|internship)\./i.test(key)) return "work";
  if (/^(project|research|publication)\./i.test(key)) return "project";
  if (/^(award|certificate)\./i.test(key)) return "award";
  if (/^(skill|language)\./i.test(key)) return "skill";
  if (/^(narrative|self)\./i.test(key)) return "narrative";
  return "basic";
}

function manualSectionsFromFieldFacts(rawFacts: unknown): ManualAssistSection[] {
  const facts = Array.isArray(rawFacts) ? rawFacts : [];
  const sections = new Map<string, ManualAssistSection>();
  facts.forEach((raw, index) => {
    const fact = raw as Record<string, unknown> | null;
    if (!fact || typeof fact !== "object") return;
    const semanticKey = String(fact.semanticKey ?? fact.key ?? fact.fieldKey ?? "").trim();
    const kind = manualSectionKind(fact.sectionKind ?? fact.kind ?? sectionKindFromSemanticKey(semanticKey));
    const groupIndex = Number.isInteger(fact.groupIndex) ? Number(fact.groupIndex) : 0;
    const sectionId = String(fact.sectionId ?? `${kind}-facts-${groupIndex + 1}`).trim();
    const sectionTitle = String(fact.sectionTitle ?? sectionKindTitle(kind)).trim();
    const item = manualAssistItemFromRaw({
      id: fact.id ?? semanticKey ?? `field-fact-${index + 1}`,
      label: fact.label ?? fact.name ?? semanticKey,
      value: fact.value,
      valueSource: semanticKey || "fieldFacts",
      fieldKey: semanticKey,
      note: Array.isArray(fact.aliases) && fact.aliases.length
        ? `别名：${fact.aliases.map(String).filter(Boolean).join(" / ")}`
        : fact.note
    }, index, {
      sectionId,
      sectionTitle,
      sectionKind: kind,
      groupIndex,
      idPrefix: sectionId
    });
    if (!item) return;
    if (!sections.has(sectionId)) sections.set(sectionId, {
      id: sectionId,
      title: sectionTitle,
      kind,
      items: []
    });
    sections.get(sectionId)!.items.push(item);
  });
  return [...sections.values()].filter((section) => section.items.length);
}

function dedupeManualSections(sections: ManualAssistSection[]): ManualAssistSection[] {
  const seen = new Set<string>();
  return sections.flatMap((section) => {
    const items = section.items.filter((item) => {
      const key = [
        item.valueSource,
        item.fieldKey,
        item.label,
        item.value
      ].filter(Boolean).join("::");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return items.length ? [{ ...section, items }] : [];
  });
}

function groupManualFlatItems(items: ManualAssistField[]): ManualAssistSection[] {
  const sections = new Map<string, ManualAssistSection>();
  const ensure = (item: ManualAssistField, fallbackIndex: number) => {
    const kind = manualSectionKind(item.sectionKind ?? (
      /项目/.test(item.label) ? "project" :
        /工作|实习|公司|职位/.test(item.label) ? "work" :
          /学校|学历|专业|教育/.test(item.label) ? "education" :
            /技能|语言/.test(item.label) ? "skill" :
              /自我|评价|介绍/.test(item.label) ? "narrative" : "basic"
    ));
    const id = item.sectionId ?? `${kind}-flat-${Number.isInteger(item.groupIndex) ? item.groupIndex : fallbackIndex}`;
    const title = item.sectionTitle ?? sectionKindTitle(kind);
    if (!sections.has(id)) sections.set(id, { id, title, kind, items: [] });
    return sections.get(id)!;
  };
  items.forEach((item, index) => ensure(item, index).items.push(item));
  return [...sections.values()];
}

function manualAssistContentFromPayload(payload: Record<string, unknown>): {
  items: ManualAssistField[];
  sections: ManualAssistSection[];
} {
  const rawItems = Array.isArray(payload.fillItems)
    ? payload.fillItems
    : Array.isArray(payload.fields)
      ? payload.fields
      : Array.isArray(payload.values)
        ? payload.values
        : Array.isArray(payload.instructions)
          ? payload.instructions
          : [];
  const flatItems = rawItems
    .map((item, index) => manualAssistItemFromRaw(item, index))
    .filter((item): item is ManualAssistField => Boolean(item));
  const explicitSections = (Array.isArray(payload.sections)
    ? payload.sections
    : Array.isArray(payload.fillSections)
      ? payload.fillSections
      : Array.isArray(payload.resumeSections)
        ? payload.resumeSections
        : [])
    .map((section, index) => manualSectionFromRaw(section, index))
    .filter((section): section is ManualAssistSection => Boolean(section));
  const resumeSnapshot = payload.resumeSnapshot as Record<string, unknown> | undefined;
  const structuredSections = dedupeManualSections([
    ...explicitSections,
    ...manualSectionsFromResumeKnowledge(payload.resumeKnowledge),
    ...manualSectionsFromResumeKnowledge(resumeSnapshot?.resumeKnowledge),
    ...manualSectionsFromCandidate(payload.candidate),
    ...manualSectionsFromFieldFacts(payload.fieldFacts ?? resumeSnapshot?.fieldFacts),
    ...manualSectionsFromParsedResume(payload)
  ]);
  const sections = dedupeManualSections([
    ...(flatItems.length ? groupManualFlatItems(flatItems) : []),
    ...structuredSections
  ]);
  return {
    items: sections.flatMap((section) => section.items),
    sections
  };
}

function manualAssistItemsFromPayload(payload: Record<string, unknown>): ManualAssistField[] {
  return manualAssistContentFromPayload(payload).items;
}

function manualInformationRequests(manualAssist: ManualAssistState): ManualInformationRequest[] {
  const requests = new Map<string, ManualInformationRequest>();
  for (const item of manualAssist.items) {
    if (item.value.trim()) continue;
    const id = `item:${item.id}`;
    requests.set(id, {
      id,
      label: item.label,
      question: item.sectionTitle
        ? `请补充「${item.sectionTitle}」中的「${item.label}」。`
        : `请补充「${item.label}」。`,
      reason: "ai_value_missing",
      ...(item.sectionId ? { sectionId: item.sectionId } : {}),
      ...(item.sectionTitle ? { sectionTitle: item.sectionTitle } : {}),
      ...(item.fieldId ? { fieldId: item.fieldId } : {}),
      ...(item.stableFieldKey ? { stableFieldKey: item.stableFieldKey } : {}),
      ...(item.type ? { type: item.type } : {}),
      options: item.options ?? [],
      valueSource: item.valueSource
    });
  }
  for (const field of manualAssist.unmatchedRequiredFields) {
    const id = `field:${field.stableFieldKey ?? field.fieldId}`;
    requests.set(id, {
      id,
      label: field.label,
      question: field.options.length
        ? `招聘表单必填「${field.label}」，可选项为：${field.options.slice(0, 8).join(" / ")}。请向用户确认应选择哪一项。`
        : `招聘表单必填「${field.label}」，但 AI 侧没有提供对应内容。请向用户索要。`,
      reason: "required_form_field_unmatched",
      fieldId: field.fieldId,
      ...(field.stableFieldKey ? { stableFieldKey: field.stableFieldKey } : {}),
      type: field.type,
      options: field.options
    });
  }
  return [...requests.values()];
}

function withManualInformationRequests(manualAssist: ManualAssistState): ManualAssistState {
  return {
    ...manualAssist,
    informationRequests: manualInformationRequests(manualAssist)
  };
}

function parseManualSupplementAnswers(rawAnswers: unknown): Array<{
  requestId: string;
  fieldId: string;
  stableFieldKey: string;
  label: string;
  type: string;
  options: string[];
  value: string;
}> {
  if (!Array.isArray(rawAnswers)) return [];
  return rawAnswers.flatMap((raw) => {
    const answer = raw as Record<string, unknown> | null;
    if (!answer || typeof answer !== "object") return [];
    const label = String(answer.label ?? "").trim();
    const value = cleanManualValue(label, manualString(answer.value ?? ""));
    if (!value) return [];
    const options = Array.isArray(answer.options)
      ? answer.options.map((option) => String(option ?? "").trim()).filter(Boolean)
      : [];
    return [{
      requestId: String(answer.requestId ?? "").trim(),
      fieldId: String(answer.fieldId ?? "").trim(),
      stableFieldKey: String(answer.stableFieldKey ?? "").trim(),
      label,
      type: String(answer.type ?? "").trim(),
      options,
      value
    }];
  });
}

function regroupManualAssistItems(
  items: ManualAssistField[],
  previousSections: ManualAssistSection[]
): ManualAssistSection[] {
  const sections = new Map<string, ManualAssistSection>();
  for (const section of previousSections) {
    sections.set(section.id, {
      id: section.id,
      title: section.title,
      kind: section.kind,
      ...(section.note ? { note: section.note } : {}),
      items: []
    });
  }
  const inferKind = (item: ManualAssistField) => manualSectionKind(item.sectionKind ?? (
    /项目/.test(item.label) ? "project" :
      /工作|实习|公司|职位/.test(item.label) ? "work" :
        /学校|学历|专业|教育/.test(item.label) ? "education" :
          /技能|语言/.test(item.label) ? "skill" :
            /自我|评价|介绍/.test(item.label) ? "narrative" : "basic"
  ));
  for (const item of items) {
    const kind = inferKind(item);
    const sectionId = item.sectionId ?? `${kind}-supplement`;
    if (!sections.has(sectionId)) {
      sections.set(sectionId, {
        id: sectionId,
        title: item.sectionTitle ?? (sectionId === "user-supplement" ? "用户补充信息" : sectionKindTitle(kind)),
        kind,
        items: []
      });
    }
    sections.get(sectionId)!.items.push(item);
  }
  return [...sections.values()].filter((section) => section.items.length);
}

function supplementManualAssistAnswers(
  manualAssist: ManualAssistState,
  rawAnswers: unknown
): ManualAssistState {
  const answers = parseManualSupplementAnswers(rawAnswers);
  if (!answers.length) return withManualInformationRequests(manualAssist);
  const requestById = new Map(
    (manualAssist.informationRequests.length ? manualAssist.informationRequests : manualInformationRequests(manualAssist))
      .map((request) => [request.id, request])
  );
  const items = manualAssist.items.map((item) => ({ ...item }));
  const itemIndexById = new Map(items.map((item, index) => [item.id, index]));
  const existingIds = new Set(items.map((item) => item.id));
  const uniqueId = (base: string) => {
    const safeBase = base.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "supplement";
    let id = safeBase;
    let counter = 2;
    while (existingIds.has(id)) {
      id = `${safeBase}-${counter}`;
      counter += 1;
    }
    existingIds.add(id);
    return id;
  };

  for (const answer of answers) {
    const request = requestById.get(answer.requestId);
    const requestItemId = request?.id.startsWith("item:") ? request.id.slice(5) : "";
    const targetIndex = requestItemId
      ? itemIndexById.get(requestItemId)
      : items.findIndex((item) =>
        (answer.fieldId && item.fieldId === answer.fieldId) ||
        (answer.stableFieldKey && item.stableFieldKey === answer.stableFieldKey)
      );
    const fieldId = answer.fieldId || request?.fieldId || "";
    const stableFieldKey = answer.stableFieldKey || request?.stableFieldKey || "";
    const type = answer.type || request?.type || "";
    const options = answer.options.length ? answer.options : request?.options ?? [];
    if (typeof targetIndex === "number" && targetIndex >= 0) {
      const currentItem = items[targetIndex];
      items[targetIndex] = {
        ...currentItem,
        value: answer.value,
        ...(fieldId ? { fieldId } : {}),
        ...(stableFieldKey ? { stableFieldKey, fieldKey: currentItem.fieldKey ?? stableFieldKey } : {}),
        ...(type ? { type } : {}),
        ...(options.length ? { options } : {}),
        required: currentItem.required ?? request?.reason === "required_form_field_unmatched",
        confirmedForCurrentApplication: true,
        note: currentItem.note ?? "用户在插件内补充"
      };
      continue;
    }
    const sectionId = request?.sectionId ?? "user-supplement";
    const sectionTitle = request?.sectionTitle ?? "用户补充信息";
    const item: ManualAssistField = {
      id: uniqueId(`supplement-${fieldId || stableFieldKey || answer.requestId || answer.label}`),
      label: request?.label || answer.label || "补充信息",
      value: answer.value,
      valueSource: `user.supplement.${stableFieldKey || fieldId || answer.requestId || answer.label || crypto.randomUUID()}`,
      sectionId,
      sectionTitle,
      sectionKind: manualSectionKind(sectionId === "user-supplement" ? "basic" : undefined),
      ...(fieldId ? { fieldId } : {}),
      ...(stableFieldKey ? { stableFieldKey, fieldKey: stableFieldKey } : {}),
      ...(type ? { type } : {}),
      required: true,
      ...(options.length ? { options } : {}),
      observed: Boolean(fieldId),
      confirmedForCurrentApplication: true,
      note: "用户在插件内补充"
    };
    items.push(item);
  }
  return withManualInformationRequests({
    ...manualAssist,
    items,
    sections: regroupManualAssistItems(items, manualAssist.sections),
    updatedAt: new Date().toISOString()
  });
}

function manualJobFromPayload(payload: Record<string, unknown>): ManualAssistState["job"] {
  const job = payload.job as Record<string, unknown> | undefined;
  if (!job || typeof job !== "object") return null;
  const companyName = String(job.companyName ?? job.company ?? "").trim();
  const title = String(job.title ?? job.jobTitle ?? "").trim();
  const city = String(job.city ?? job.location ?? "").trim();
  return companyName || title || city
    ? {
      ...(companyName ? { companyName } : {}),
      ...(title ? { title } : {}),
      ...(city ? { city } : {})
    }
    : null;
}

function createManualAssistFromPayload(
  payload: Record<string, unknown>,
  applicationUrl: string
): ManualAssistState {
  const content = manualAssistContentFromPayload(payload);
  return withManualInformationRequests({
    mode: "copy_paste",
    applicationUrl,
    job: manualJobFromPayload(payload),
    ...(typeof payload.note === "string" ? { note: payload.note } : {}),
    items: content.items,
    sections: content.sections,
    observedFields: [],
    unmatchedRequiredFields: [],
    informationRequests: [],
    updatedAt: new Date().toISOString(),
    observedAt: null
  });
}

const candidateInfoPackageSchemaVersions = new Set([
  "zcandidate.resume_package.v1",
  "recruiting-ai.candidate-info-package.v1",
  "candidate-info-package.v1"
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requiredFieldRequestsFromFailure(details: unknown): Record<string, unknown>[] {
  const record = asRecord(details);
  const raw = record?.requiredFieldRequests ?? record?.informationRequests;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const request = asRecord(entry);
    return request?.schemaVersion === "required-field-request.v1" ? [request] : [];
  });
}

function normalizePackageSchemaVersion(payload: Record<string, unknown>): string {
  return String(payload.schemaVersion ?? payload.version ?? "").trim();
}

function requiredInformationEvidence(requiredFieldRequests: Record<string, unknown>[]): {
  missingFields: string[];
  requiredFieldRequests?: Record<string, unknown>[];
} {
  // Empty/unreached controls are not missing candidate facts. Only questions
  // produced by the information-request pipeline belong in the supplement UI.
  const missingFields = [...new Set(requiredFieldRequests.flatMap((request) =>
    typeof request.label === "string" && request.label.trim() ? [request.label.trim()] : []))];
  return { missingFields, ...(requiredFieldRequests.length ? { requiredFieldRequests } : {}) };
}

function createCandidatePackageFromPayload(
  payload: Record<string, unknown>,
  fileName: string
): CandidateInfoPackageState {
  const schemaVersion = normalizePackageSchemaVersion(payload);
  if (!candidateInfoPackageSchemaVersions.has(schemaVersion)) {
    throw new RecruitingError({
      code: "INVALID_INPUT",
      stage: "resume",
      message: schemaVersion ? `不支持的信息包版本：${schemaVersion}` : "信息包缺少 schemaVersion",
      retryable: true,
      userAction: "请上传 AI 侧按 zcandidate.resume_package.v1 导出的 .zcresume.json 标准信息包。"
    });
  }
  const content = manualAssistContentFromPayload(payload);
  const hasUsableValue = content.items.some((item) => item.value.trim());
  if (!content.items.length || !hasUsableValue) {
    throw new RecruitingError({
      code: "INVALID_INPUT",
      stage: "resume",
      message: "信息包中没有可用于填写的简历字段",
      retryable: true,
      userAction: "请在 AI 侧重新导出包含基本信息、教育经历、工作经历或项目经历的标准信息包。"
    });
  }
  const candidate = asRecord(payload.candidate);
  const basic = asRecord(candidate?.basic) ?? asRecord(candidate?.profile) ?? asRecord(candidate?.personal);
  const warnings = [
    ...(!manualString(basic?.fullName ?? basic?.name).trim() ? ["缺少姓名"] : []),
    ...(!manualString(basic?.phone ?? basic?.mobile).trim() ? ["缺少手机号"] : []),
    ...(!manualString(basic?.email).trim() ? ["缺少邮箱"] : [])
  ];
  const uploadedAt = new Date().toISOString();
  return {
    schemaVersion: "candidate-info-package-state.v1",
    sourceSchemaVersion: schemaVersion,
    fileName,
    packageId: String(payload.packageId ?? payload.id ?? "").trim() || null,
    uploadedAt,
    confirmedAt: null,
    status: "draft",
    warnings,
    manualAssist: withManualInformationRequests({
      mode: "copy_paste",
      applicationUrl: "",
      job: manualJobFromPayload(payload),
      note: typeof payload.note === "string"
        ? payload.note
        : `来自信息包：${fileName}`,
      items: content.items,
      sections: content.sections,
      observedFields: [],
      unmatchedRequiredFields: [],
      informationRequests: [],
      updatedAt: uploadedAt,
      observedAt: null
    })
  };
}

function profileValuesFromCandidateInfoPackage(payload: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {};
  const put = (key: string, value: unknown) => {
    const rendered = manualString(value).trim();
    if (rendered) values[key] = rendered;
  };
  const candidate = asRecord(payload.candidate) ?? {};
  const basic = asRecord(candidate.basic) ?? asRecord(candidate.profile) ?? asRecord(candidate.personal) ?? {};
  const preferences = asRecord(candidate.preferences) ?? asRecord(candidate.intention) ?? {};
  put("basic.fullName", basic.fullName ?? basic.name);
  put("basic.phone", basic.phone ?? basic.mobile);
  put("basic.email", basic.email);
  put("basic.currentCity", basic.currentCity ?? basic.city);
  put("basic.gender", basic.gender);
  put("basic.birthDate", basic.birthDate);
  put("basic.highestDegree", basic.highestDegree ?? deriveHighestDegreeFromCandidate(candidate));
  put("work.years", candidate.workYears ?? candidate.experienceYears ?? preferences.experienceYears);
  put("skills.summary", candidate.skillsSummary ?? preferences.skillsSummary);
  put("narrative.selfIntroduction", candidate.selfEvaluation ?? candidate.selfIntroduction ?? candidate.summary);
  return Object.fromEntries(Object.entries(values).filter(([key]) => availableProfileKeys.includes(key)));
}

function resumeKnowledgeFromCandidateInfoPackage(payload: Record<string, unknown>): ResumeKnowledgeSnapshot | null {
  const explicit = asRecord(payload.resumeKnowledge);
  if (explicit) {
    const parsed = resumeKnowledgeSnapshotSchema.safeParse(explicit);
    if (parsed.success) return parsed.data;
  }
  const candidate = asRecord(payload.candidate);
  if (!candidate) return null;
  const sections: ResumeKnowledgeSnapshot["sections"] = [];
  const addSection = (
    kind: ResumeKnowledgeSnapshot["sections"][number]["kind"],
    id: string,
    facts: Record<string, unknown>,
    polishedText?: string
  ) => {
    const cleanedFacts = Object.fromEntries(
      Object.entries(facts).filter(([, value]) => manualString(value).trim())
    );
    if (!Object.keys(cleanedFacts).length && !polishedText) return;
    sections.push({
      kind,
      id,
      facts: cleanedFacts,
      ...(polishedText ? { polishedText } : {}),
      evidenceRefs: []
    });
  };
  const addList = (
    rawList: unknown,
    kind: ResumeKnowledgeSnapshot["sections"][number]["kind"],
    prefix: string
  ) => {
    if (!Array.isArray(rawList)) return;
    rawList.forEach((raw, index) => {
      const record = asRecord(raw);
      if (!record) return;
      addSection(kind, `${prefix}-${index + 1}`, record, String(record.polishedText ?? "").trim() || undefined);
    });
  };
  const basic = asRecord(candidate.basic) ?? asRecord(candidate.profile) ?? asRecord(candidate.personal);
  const derivedHighestDegree = deriveHighestDegreeFromCandidate(candidate);
  if (basic || derivedHighestDegree) {
    addSection("basic", "basic-1", {
      ...(basic ?? {}),
      ...(!manualString(basic?.highestDegree).trim() && derivedHighestDegree
        ? { highestDegree: derivedHighestDegree }
        : {})
    });
  }
  const preferences = asRecord(candidate.preferences) ?? asRecord(candidate.intention);
  if (preferences) addSection("intention", "intention-1", preferences);
  addList(candidate.educations ?? candidate.education, "education", "education");
  addList(candidate.workExperiences ?? candidate.workExperience ?? candidate.work, "work", "work");
  addList(candidate.internships, "internship", "internship");
  addList(candidate.projectExperiences ?? candidate.projects ?? candidate.project, "project", "project");
  addList(candidate.research, "research", "research");
  addList(candidate.publications, "publication", "publication");
  addList(candidate.awards ?? candidate.certificates, "award", "award");
  addList(candidate.skills, "skill", "skill");
  const narrative = candidate.selfEvaluation ?? candidate.selfIntroduction ?? candidate.summary;
  if (manualString(narrative).trim()) {
    addSection("narrative", "narrative-1", { selfIntroduction: narrative });
  }
  if (!sections.length) return null;
  return resumeKnowledgeSnapshotSchema.parse({
    id: crypto.randomUUID(),
    userId: "extension-local",
    version: 1,
    title: String(payload.title ?? payload.fileName ?? "AI侧标准简历信息包"),
    sourceModule: "candidate-info-package",
    sourceDocumentRef: String(payload.packageId ?? payload.id ?? "").trim() || undefined,
    userApproved: true,
    sections,
    createdAt: new Date().toISOString()
  });
}

function cloneManualAssistForCurrentPage(
  packageState: CandidateInfoPackageState,
  applicationUrl: string
): ManualAssistState {
  return withManualInformationRequests({
    ...packageState.manualAssist,
    applicationUrl,
    observedFields: [],
    unmatchedRequiredFields: [],
    informationRequests: [],
    items: packageState.manualAssist.items.map((item) => ({ ...item, observed: false })),
    sections: packageState.manualAssist.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => ({ ...item, observed: false }))
    })),
    updatedAt: new Date().toISOString(),
    observedAt: null
  });
}

async function currentActiveHttpTab(explicitTabId: unknown): Promise<chrome.tabs.Tab> {
  const tabId = Number(explicitTabId);
  const tab = Number.isInteger(tabId) && tabId >= 0
    ? await chrome.tabs.get(tabId)
    : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  const url = String(tab?.url ?? "");
  if (tab?.id === undefined || !/^https?:\/\//i.test(url)) {
    throw new RecruitingError({
      code: "INVALID_INPUT",
      stage: "form_observation",
      message: "当前标签页不是可读取的网页",
      retryable: false,
      userAction: "请先打开 http 或 https 招聘申请页面，再点击“读取当前招聘页”。"
    });
  }
  return tab;
}

function itemMatchesObservedField(item: ManualAssistField, field: PageObservation["fields"][number]): boolean {
  const possibleKeys = [
    item.fieldId,
    item.stableFieldKey,
    item.fieldKey,
    item.label
  ].filter(Boolean).map((value) => String(value));
  return possibleKeys.some((key) =>
    field.fieldId === key ||
    field.stableFieldKey === key ||
    field.label === key ||
    formLabelsSemanticallyMatch(field.label, key)
  );
}

function fieldTextForSection(field: PageObservation["fields"][number]): string {
  return [
    field.sectionKey,
    ...(field.labelPath ?? []),
    field.label
  ].filter(Boolean).join(" ");
}

function sectionKindMatchesObservedField(
  kind: ManualAssistField["sectionKind"],
  field: PageObservation["fields"][number]
): boolean {
  const text = fieldTextForSection(field);
  if (kind === "education") return /教育|学校|院校|学历|专业|入学|毕业|education/i.test(text);
  if (kind === "work") return /工作|实习|公司|职位|岗位|职责|work|intern/i.test(text);
  if (kind === "project") return /项目|作品|技术栈|成果|project/i.test(text);
  if (kind === "award") return /获奖|证书|奖项|荣誉|award|certificate/i.test(text);
  if (kind === "skill") return /技能|语言|能力|skill|language/i.test(text);
  if (kind === "narrative") return /自我|评价|介绍|优势|summary|introduction/i.test(text);
  return /基本|个人|姓名|手机|邮箱|意向|城市|basic|profile|personal/i.test(text);
}

function manualTemporalItemForObservedField(
  items: ManualAssistField[],
  field: PageObservation["fields"][number]
): { item: ManualAssistField; value: string } | null {
  if (!field.temporal || !["year", "month"].includes(field.temporal.part)) return null;
  const candidates = items.flatMap((item) => {
    const identity = `${item.label} ${item.fieldKey ?? ""} ${item.valueSource ?? ""}`;
    const start = /(?:^|[._])startDate(?:$|[._])|开始时间|入学时间/i.test(identity);
    const end = /(?:^|[._])endDate(?:$|[._])|graduation(?:Date|Year)|结束时间|毕业/i.test(identity);
    const edge = start !== end ? (start ? "start" : "end") : null;
    if (!edge || edge !== field.temporal?.edge) return [];
    if (item.sectionKind && !sectionKindMatchesObservedField(item.sectionKind, field)) return [];
    if (typeof item.groupIndex === "number" && typeof field.groupIndex === "number" &&
      item.groupIndex !== field.groupIndex) return [];
    // A standalone graduation pair represents the highest education record.
    // Do not borrow dates from a later repeated education row.
    if (field.groupIndex == null && item.sectionKind === "education" &&
      typeof item.groupIndex === "number" && item.groupIndex !== 0) return [];
    const value = temporalFieldPartValue(field, item.value);
    if (!value) return [];
    let score = 0;
    if (item.sectionKind && field.sectionKey === item.sectionKind) score += 30;
    if (typeof item.groupIndex === "number" && item.groupIndex === field.groupIndex) score += 40;
    if (/(?:^|[._])(?:startDate|endDate)(?:$|[._])/i.test(identity)) score += 20;
    if (field.groupIndex == null && item.groupIndex === 0) score += 10;
    return [{ item, value, score }];
  }).sort((left, right) => right.score - left.score);
  const best = candidates[0];
  return best ? { item: best.item, value: best.value } : null;
}

function findBestObservedFieldForManualItem(
  item: ManualAssistField,
  observation: PageObservation,
  claimedFieldIds: Set<string>
): PageObservation["fields"][number] | null {
  const scored = observation.fields.flatMap((field) => {
    if (claimedFieldIds.has(field.fieldId)) return [];
    if (!itemMatchesObservedField(item, field)) return [];
    let score = 10;
    if (item.fieldId && field.fieldId === item.fieldId) score += 100;
    if (item.stableFieldKey && field.stableFieldKey === item.stableFieldKey) score += 95;
    if (item.fieldKey && (field.stableFieldKey === item.fieldKey || field.fieldId === item.fieldKey)) score += 80;
    if (formLabelsSemanticallyMatch(field.label, item.label)) score += 35;
    if (typeof item.groupIndex === "number" && typeof field.groupIndex === "number") {
      score += item.groupIndex === field.groupIndex ? 30 : -30;
    }
    if (item.sectionKind && sectionKindMatchesObservedField(item.sectionKind, field)) score += 18;
    if (item.sectionTitle && fieldTextForSection(field).includes(item.sectionTitle.replace(/\s+\d+.*$/g, ""))) score += 8;
    return [{ field, score }];
  });
  scored.sort((left, right) => right.score - left.score);
  return scored[0]?.field ?? null;
}

function mergeManualAssistWithObservation(
  manualAssist: ManualAssistState,
  observation: PageObservation
): ManualAssistState {
  const matchedFieldIds = new Set<string>();
  const claimedFieldIds = new Set<string>();
  const items = manualAssist.items.map((item) => {
    const field = findBestObservedFieldForManualItem(item, observation, claimedFieldIds);
    if (field) claimedFieldIds.add(field.fieldId);
    if (field && item.value.trim() && assessFieldInformation(field, item.value).status !== "insufficient") {
      matchedFieldIds.add(field.fieldId);
    }
    return {
      ...item,
      ...(field ? {
        fieldId: field.fieldId,
        ...(field.stableFieldKey ? { stableFieldKey: field.stableFieldKey } : {}),
        label: item.label || field.label,
        type: field.type,
        required: field.required,
        options: field.options,
        observed: true
      } : { observed: false })
    };
  });
  for (const field of observation.fields) {
    if (manualTemporalItemForObservedField(items, field)) matchedFieldIds.add(field.fieldId);
  }
  const observedFields = observation.fields.map((field) => ({
    fieldId: field.fieldId,
    ...(field.stableFieldKey ? { stableFieldKey: field.stableFieldKey } : {}),
    label: field.label,
    type: field.type,
    required: field.required,
    options: field.options,
    currentValue: field.currentValue,
    hasValue: observedFieldHasValue(field),
    hasSuggestion: matchedFieldIds.has(field.fieldId)
  }));
  const itemById = new Map(items.map((item) => [item.id, item]));
  const baseSections = manualAssist.sections?.length ? manualAssist.sections : groupManualFlatItems(items);
  return withManualInformationRequests({
    ...manualAssist,
    items,
    sections: baseSections.map((section) => ({
      ...section,
      items: section.items.map((item) => itemById.get(item.id) ?? item)
    })),
    observedFields,
    unmatchedRequiredFields: observedFields.filter((field) =>
      field.required && !field.hasValue && !field.hasSuggestion
    ),
    observedAt: observation.observedAt,
    updatedAt: new Date().toISOString()
  });
}

async function updateManualApplicationFromObservation(
  current: ExtensionState,
  application: ActiveApplication,
  observation: PageObservation
): Promise<ExtensionState> {
  const manualAssist = mergeManualAssistWithObservation(
    application.manualAssist ?? createManualAssistFromPayload({}, observation.url),
    observation
  );
  const formDetected = observation.formDetected || observation.fields.length > 0;
  const pendingOpeningWithoutForm = application.status === "opening" &&
    !observation.loginRequired &&
    !formDetected;
  void syncObservedForm(current, application, observation, []);
  const nextState = await update({
    activeApplication: {
      ...application,
      status: observation.loginRequired
        ? "login_required"
        : pendingOpeningWithoutForm
          ? "opening"
          : formDetected
            ? manualAssist.informationRequests.length ? "information_required" : "ready_to_fill"
            : "failed",
      observation,
      mappings: [],
      prefillDraft: manualAssist.items.map((item) => ({
        fieldId: item.fieldId ?? item.id,
        ...(item.stableFieldKey ? { stableFieldKey: item.stableFieldKey } : {}),
        label: item.label,
        semanticKey: item.valueSource,
        value: item.value,
        confidence: item.observed ? 0.9 : 0.65
      })),
      missing: [],
      readback: [],
      lastError: observation.loginRequired || formDetected || pendingOpeningWithoutForm
        ? null
        : "当前页面未检测到招聘申请表单。请先进入该岗位的“立即申请/投递”页面。",
      reviewConfirmedAt: null,
      manualAssist
    }
  });
  if (observation.loginRequired) scheduleManualLoginPolling(application.tabId);
  return nextState;
}

function manualAssistResumeFacts(manualAssist: ManualAssistState): Record<string, string> {
  const facts: Record<string, string> = {};
  const put = (key: unknown, value: string) => {
    const normalizedKey = String(key ?? "").trim();
    if (!normalizedKey || facts[normalizedKey]) return;
    facts[normalizedKey] = stripTrailingParserArtifact(value);
  };
  manualAssist.items.forEach((item, index) => {
    const value = String(item.value ?? "").trim();
    if (!value) return;
    put(item.valueSource, value);
    put(item.fieldKey, value);
    put(`${item.sectionId ?? item.sectionKind ?? "manual"}.${item.id}`, value);
    put(`manual.${index + 1}.${item.label}`, value);
  });
  return facts;
}

function unsafeAutoFillField(field: PageObservation["fields"][number]): boolean {
  return field.type === "hidden" ||
    field.type === "password" ||
    /验证码|校验码|短信|密码|captcha|password/i.test(field.label) ||
    (/隐私|协议|条款|授权|承诺|声明|同意|privacy|terms|consent/i.test(field.label) &&
      ["checkbox", "radio"].includes(field.type));
}

function currentJobFieldSemanticKey(field: PageObservation["fields"][number]): string {
  return field.stableFieldKey
    ? `job.requiredField.stable:${field.stableFieldKey}`
    : `job.requiredField.field:${field.fieldId}`;
}

function currentApplicationAnswerForField(
  field: PageObservation["fields"][number],
  customAnswers: Record<string, string>
): string {
  return String(
    (field.stableFieldKey ? customAnswers[field.stableFieldKey] : undefined) ??
    customAnswers[field.fieldId] ??
    ""
  ).trim();
}

function optionalInstructionHasCurrentJobConfirmation(
  field: PageObservation["fields"][number],
  instruction: FillInstruction
): boolean {
  if (field.required || field.type === "file") return true;
  if (instruction.rangeEndChoice && field.observedControlKind === "moka_range_present" &&
    field.dateRange?.role === "present" && /^(?:true|false)$/u.test(String(instruction.value))) return true;
  if (instruction.optionSelectionPolicy?.startsWith("phone_calling_code_") &&
    isPhoneCallingCodeField(field)) return true;
  if (observedFieldHasValue(field)) return false;
  const semanticKey = String(instruction.semanticKey ?? "");
  return semanticKey === "job.answers.preferredCity" ||
    semanticKey === currentJobFieldSemanticKey(field);
}

function instructionFromObservedField(
  field: PageObservation["fields"][number],
  value: string,
  semanticKey: string | null
): FillInstruction | null {
  if (isFeishuLocationTree(field)) {
    const multiple=isFeishuFormilyOptionSet(field);
    let values=multiple?selectorSearchValues(value):[value];
    if (!values?.length) return null;
    // Cardinality is a business policy on an already proven tree, not type inference.
    if (multiple&&isPreferredWorkCityField(field)) values=values.slice(0,1);
    return {fieldId:field.fieldId,stableFieldKey:field.stableFieldKey,selector:field.selector,expectedLabel:field.label,
      semanticKey,type:field.type,value:multiple?JSON.stringify(values):values[0]!,...(multiple?{selectedOptionValues:values}:{}),popupBinding:field.popupBinding};
  }
  if (isFeishuFormilyOptionSet(field) || field.optionMultiplicity === "multiple" ||
    field.domHints?.tagName === "SELECT" && field.domHints.multiple) {
    const values=isFeishuFormilyOptionSet(field) ? field.optionSource==="search" ? selectorSearchValues(value) : decodeExactOptionSet(value) : nativeSelectRequestedValues(value, true);
    return values?.length ? {fieldId:field.fieldId,stableFieldKey:field.stableFieldKey,selector:field.selector,expectedLabel:field.label,
      semanticKey,type:field.type,value:JSON.stringify(values),selectedOptionValues:values,popupBinding:field.popupBinding} : null;
  }
  const nextValue = localizeFieldAnswer(field, semanticKey, stripTrailingParserArtifact(value));
  if (!nextValue || unsafeAutoFillField(field)) return null;
  if (field.type === "file") return null;
  if (assessFieldInformation(field, nextValue).status === "insufficient") return null;
  const selectedCityOption = isPreferredWorkCityField(field) && ["select", "combobox"].includes(field.type) && field.options.length
    ? uniqueCityOption(field.options, nextValue) : null;
  const informationRequirement = fieldInformationRequirement(field);
  const identity = `${field.label} ${field.stableFieldKey ?? ""} ${semanticKey ?? ""} ${field.type} ${field.controlKind ?? ""}`;
  const monthPeriodDateValue = (field.type === "custom_date_picker" || field.controlKind === "custom_date_picker") &&
    isFeishuMonthPeriodField({
    label: field.label,
    stableFieldKey: field.stableFieldKey,
    semanticKey
  }) ? structuredMonthDateFromValue(nextValue) : null;
  const calendarMonthHint = calendarControlUsesMonthPrecision({
    type: field.type,
    temporalLayout: field.temporal?.layout,
    placeholder: field.domHints?.placeholder
  });
  const calendarMonthDateValue = calendarMonthHint
    ? structuredMonthDateFromValue(nextValue)
    : null;
  const calendarDateHint = calendarControlHasTemporalEvidence({
    type: field.type,
    temporalLayout: field.temporal?.layout,
    placeholder: field.domHints?.placeholder,
    classNames: field.domHints?.classNames
  });
  const structurallyBoundMonthDateValue = calendarDateHint
    ? structuredMonthDateFromValue(nextValue)
    : null;
  const nativeText = field.domHints?.readOnly === false &&
    ["native", "textarea"].includes(field.controlKind ?? "") &&
    !["date", "month", "datetime-local"].includes(field.type);
  const dateValue = !nativeText && (calendarDateHint ||
    /日期|时间|毕业|入学|到岗|截止|date|time|graduation|start[_\s.-]?date|end[_\s.-]?date/i.test(identity))
    ? structuredDateFromValue(nextValue) ?? monthPeriodDateValue ?? calendarMonthDateValue ??
      structurallyBoundMonthDateValue
    : null;
  const datePrecision = informationRequirement?.kind === "date" && informationRequirement.precision === "day"
    ? "day" as const
    : dateValue && (monthPeriodDateValue || calendarMonthDateValue ||
    /出生(?:日期|年月)|birth[_\s.-]*date/i.test(identity))
    ? "month" as const
    : undefined;
  return {
    fieldId: field.fieldId,
    ...(field.stableFieldKey ? { stableFieldKey: field.stableFieldKey } : {}),
    selector: field.selector,
    expectedLabel: field.label,
    semanticKey,
    popupBinding: field.popupBinding,
    type: field.type,
    ...(dateValue ? { dateValue } : {}),
    ...(datePrecision ? { datePrecision } : {}),
    value: ["checkbox", "radio"].includes(field.type)
      ? /^(true|是|有|同意|yes|y|1)$/i.test(nextValue)
      : selectedCityOption ?? nextValue
  };
}

function mergeFillInstructions(...groups: FillInstruction[][]): FillInstruction[] {
  const byField = new Map<string, FillInstruction>();
  for (const instruction of groups.flat()) {
    if (!byField.has(instruction.fieldId)) byField.set(instruction.fieldId, instruction);
  }
  return [...byField.values()].sort((left, right) => {
    const rank = (instruction: FillInstruction) =>
      ["combobox", "select"].includes(instruction.type) ? 2 :
        ["checkbox", "radio"].includes(instruction.type) ? 1 : 0;
    return rank(left) - rank(right);
  });
}

function readbackMatchesInstruction(
  instruction: FillInstruction,
  field: PageObservation["fields"][number] | null | undefined,
  result: FillResult | undefined
): boolean {
  if (!field || !result?.success || !result.controlAdapter) return false;
  const expected = instruction.optionSelectionPolicy?.startsWith("phone_calling_code_")
    ? result.expected
    : instruction.file?.name ?? instruction.value;
  return registeredControlReadbackMatches({ field, expected,
    semanticKey: instruction.semanticKey, dateValue: instruction.dateValue, datePrecision: instruction.datePrecision,
    controlAdapter: result.controlAdapter }).matches;
}

function manualFillBlockers(
  observation: PageObservation,
  instructions: FillInstruction[],
  files: Record<string, ResumeFilePayload>
): ApplicationMissingField[] {
  const instructionFieldIds = new Set(instructions.map((instruction) => instruction.fieldId));
  return observation.fields.flatMap((field) => {
    if (!field.required || observedFieldHasValue(field) || instructionFieldIds.has(field.fieldId)) return [];
    if (unsafeAutoFillField(field)) return [{
      fieldId: field.fieldId,
      ...(field.stableFieldKey ? { stableFieldKey: field.stableFieldKey } : {}),
      label: field.label,
      semanticKey: null,
      type: field.type,
      options: field.options,
      memoryKey: null,
      rememberedValue: ""
    }];
    if (field.type === "file" && files[field.fieldId]) return [];
    return [{
      fieldId: field.fieldId,
      ...(field.stableFieldKey ? { stableFieldKey: field.stableFieldKey } : {}),
      label: field.label,
      semanticKey: null,
      type: field.type,
      options: field.options,
      memoryKey: null,
      rememberedValue: ""
    }];
  });
}

async function fillManualApplicationFromInfoPackage(
  current: ExtensionState,
  application: ActiveApplication,
  requireEntitlement: boolean,
  idempotencyKey: string,
  providedFiles: { resume?: ResumeFilePayload | null; identityPhoto?: ResumeFilePayload | null } = {}
): Promise<ExtensionState> {
  const firstObservation = await stableApplicationObservation(application.tabId);
  if (firstObservation.loginRequired) {
    throw new RecruitingError({
      code: "LOGIN_REQUIRED",
      stage: "login",
      message: firstObservation.loginReason ?? "招聘页面要求登录",
      retryable: true,
      userAction: "请先在招聘页面完成登录，然后点击“登录后继续检测”。"
    });
  }
  if (!firstObservation.formDetected && !firstObservation.fields.length) {
    throw new RecruitingError({
      code: "FORM_FILL_NOT_READY",
      stage: "form_observation",
      message: "当前页面未检测到招聘申请表单",
      retryable: true,
      userAction: "请进入岗位申请表单页后重新读取当前招聘页。"
    });
  }

  const manualAssist = mergeManualAssistWithObservation(
    application.manualAssist ?? createManualAssistFromPayload({}, firstObservation.url),
    firstObservation
  );
  const facts = manualAssistResumeFacts(manualAssist);
  let modelExecutions = current.modelExecutions;
  const rpaTrace: NonNullable<ActiveApplication["rpaTrace"]> = [];
  const trace = (
    stage: NonNullable<ActiveApplication["rpaTrace"]>[number]["stage"],
    status: NonNullable<ActiveApplication["rpaTrace"]>[number]["status"],
    detail: string
  ) => rpaTrace.push({ stage, status, detail, at: new Date().toISOString() });
  trace("observe_actions", "completed", `读取到 ${firstObservation.fields.length} 个页面字段`);

  let modelInstructions: FillInstruction[] = [];
  if (Object.keys(facts).length) {
    try {
      const prefill = await prepareFormPrefillWithModel(
        await browserModelSettings(current.modelService),
        firstObservation.fields
          .filter((field) => field.required)
          .map(({ fieldId, stableFieldKey, label, sectionKey, groupIndex, labelPath, controlKind, type, required, options }) => ({
            fieldId, stableFieldKey, label, sectionKey, groupIndex, labelPath, controlKind, type, required, options
          })),
        facts
      );
      modelExecutions = withExecution(modelExecutions, prefill.evidence);
      const byField = new Map(firstObservation.fields.map((field) => [field.fieldId, field]));
      modelInstructions = prefill.candidates.flatMap((candidate) => {
        const field = byField.get(candidate.fieldId);
        if (!field) return [];
        const instruction = instructionFromObservedField(field, candidate.proposedValue, candidate.semanticKey);
        return instruction ? [instruction] : [];
      });
      trace(
        "manual_assist",
        "completed",
        modelInstructions.length
          ? `托管模型生成 ${modelInstructions.length} 条预填指令`
          : "托管模型未生成可执行预填指令，使用信息包字段匹配兜底"
      );
    } catch (error) {
      trace("manual_assist", "skipped", `托管模型预填计划不可用，使用信息包字段匹配兜底：${toPublicError(error).message}`);
    }
  }

  const fieldById = new Map(firstObservation.fields.map((field) => [field.fieldId, field]));
  const directDeterministicInstructions = manualAssist.items.flatMap((item) => {
    if (!item.fieldId || !String(item.value ?? "").trim()) return [];
    const field = fieldById.get(item.fieldId);
    if (!field) return [];
    if (!field.required && !item.confirmedForCurrentApplication) return [];
    const semanticKey = item.confirmedForCurrentApplication
      ? currentJobFieldSemanticKey(field)
      : item.valueSource || item.fieldKey || null;
    const instruction = instructionFromObservedField(field, item.value, semanticKey);
    return instruction ? [instruction] : [];
  });
  const directlyBoundFieldIds = new Set(directDeterministicInstructions.map((instruction) => instruction.fieldId));
  const temporalDeterministicInstructions = firstObservation.fields.flatMap((field) => {
    if (!field.required || directlyBoundFieldIds.has(field.fieldId)) return [];
    const binding = manualTemporalItemForObservedField(manualAssist.items, field);
    if (!binding) return [];
    const semanticKey = binding.item.valueSource || binding.item.fieldKey || null;
    const instruction = instructionFromObservedField(field, binding.value, semanticKey);
    return instruction ? [instruction] : [];
  });
  const deterministicInstructions = mergeFillInstructions(
    directDeterministicInstructions,
    temporalDeterministicInstructions
  );

  const files: Record<string, ResumeFilePayload> = {};
  const storedPhoto = providedFiles.identityPhoto ?? await savedIdentityPhoto();
  const storedResume = providedFiles.resume ?? await savedResumeFile();
  for (const field of firstObservation.fields) {
    if (field.type !== "file") continue;
    if (!files[field.fieldId] && field.required && storedPhoto && /照片|头像|证件照|photo/i.test(field.label)) files[field.fieldId] = storedPhoto;
    if (!files[field.fieldId] && storedResume && /简历|附件|resume|cv/i.test(field.label)) files[field.fieldId] = storedResume;
  }
  const fileInstructions = firstObservation.fields.flatMap((field) => {
    const file = files[field.fieldId];
    if (field.type !== "file" || !file || field.currentValue.includes(file.name)) return [];
    return [{
      fieldId: field.fieldId,
      ...(field.stableFieldKey ? { stableFieldKey: field.stableFieldKey } : {}),
      selector: field.selector,
      expectedLabel: field.label,
      semanticKey: /照片|头像|证件照|photo/i.test(field.label) ? "upload.identity_photo" : "resume.file",
      popupBinding: field.popupBinding,
      type: field.type,
      value: file.name,
      file
    } satisfies FillInstruction];
  });
  const shouldPreserveObservedField = (instruction: FillInstruction) => {
    const field = fieldById.get(instruction.fieldId);
    if (!field || !observedFieldHasValue(field)) return false;
    if (!field.required) return true;
    const labelText = `${field.label} ${field.stableFieldKey ?? ""} ${instruction.semanticKey ?? ""}`;
    // Lever and similar ATS pages often expose location as a text input backed
    // by an autocomplete/geocoder. If the site resume parser has already put a
    // value there, programmatic text replacement can clear the hidden selected
    // place and fail readback. Preserve the ATS-parsed value and only fill this
    // class of field when it is still blank.
    return /current location|location\.native|所在|地点|城市/i.test(labelText) &&
      field.type === "text" &&
      field.options.length === 0;
  };
  const rawInstructions = mergeFillInstructions(fileInstructions, deterministicInstructions, modelInstructions);
  const instructions = rawInstructions.filter((instruction) => !shouldPreserveObservedField(instruction));
  const preservedInstructionCount = rawInstructions.length - instructions.length;
  if (preservedInstructionCount) {
    trace("correct_form", "skipped", `保留 ${preservedInstructionCount} 个招聘网站已解析的地点字段`);
  }
  const blockers = manualFillBlockers(firstObservation, instructions, files);
  if (blockers.length) {
    await update({
      activeApplication: {
        ...application,
        status: "information_required",
        observation: firstObservation,
        manualAssist,
        prefillDraft: manualAssist.items.map((item) => ({
          fieldId: item.fieldId ?? item.id,
          ...(item.stableFieldKey ? { stableFieldKey: item.stableFieldKey } : {}),
          label: item.label,
          semanticKey: item.valueSource,
          value: item.value,
          confidence: item.observed ? 0.9 : 0.65
        })),
        lastError: `仍有 ${blockers.length} 个必填字段无法自动填写`,
        reviewConfirmedAt: null
      }
    });
    throw new RecruitingError({
      code: "MISSING_INFORMATION",
      stage: "missing_information",
      message: `仍有 ${blockers.length} 个必填字段无法自动填写`,
      retryable: false,
      userAction: "可在插件内补充文字/选项类信息；文件、协议勾选等用户专属项请在招聘网页中处理，然后重新检测。",
      details: { fields: blockers.map((field) => field.label) }
    });
  }
  if (!instructions.length) {
    const validationFailure = firstObservation.validationMessages.join("；");
    if (validationFailure) {
      throw new RecruitingError({
        code: "FORM_FILL_VALIDATION_FAILED",
        stage: "readback",
        message: validationFailure,
        retryable: true,
        userAction: "请处理招聘页面仍显示的校验错误后重新检测。"
      });
    }
    trace("correct_form", "skipped", "必填字段已完成，未对空白非必填字段新增内容");
    trace("readback", "completed", "必填字段校验通过，已停在最终提交前");
    return update({
      activeApplication: {
        ...application,
        status: "ready_for_review",
        observation: firstObservation,
        manualAssist,
        rpaTrace,
        readback: [],
        lastError: null,
        reviewConfirmedAt: null
      },
      modelExecutions
    });
  }
  let entitlementState = current;
  if (requireEntitlement) {
    entitlementState = await reserveOneClickFillUsage(current, application, idempotencyKey);
    trace("entitlement", "completed", "已预占用 1 次一键填写额度");
  } else {
    trace("entitlement", "skipped", "本次调用未要求权益扣次");
  }
  const fillingState = await update({
    activeApplication: {
      ...application,
      status: "filling",
      observation: firstObservation,
      manualAssist,
      rpaTrace,
      lastError: null,
      readback: [],
      reviewConfirmedAt: null
    }
  });
  const readback = await executeApplicationFillInstructions(application.tabId, firstObservation, instructions);
  let postObservation = await stableApplicationObservation(application.tabId);
  // Conditional fields may appear after any control, on any site. Discover
  // only new stable identities; never retry a failed field or reorder by ATS.
  const attemptedKeys = new Set(instructions.map(instruction => instruction.stableFieldKey));
  for (let round = 0; round < 3 && !readback.some(result => !result.success &&
    firstObservation.fields.some(field => field.fieldId === result.fieldId && field.required)); round += 1) {
    const expanded = mergeManualAssistWithObservation(manualAssist, postObservation);
    const additions = expanded.items.flatMap(item => {
      const field = postObservation.fields.find(candidate => item.stableFieldKey
        ? candidate.stableFieldKey === item.stableFieldKey : candidate.fieldId === item.fieldId);
      if (!field?.stableFieldKey || attemptedKeys.has(field.stableFieldKey) || observedFieldHasValue(field) ||
        (!field.required && !item.confirmedForCurrentApplication) || !String(item.value ?? "").trim()) return [];
      const next = instructionFromObservedField(field, item.value, item.confirmedForCurrentApplication
        ? currentJobFieldSemanticKey(field) : item.valueSource || item.fieldKey || null);
      return next ? [next] : [];
    });
    if (!additions.length) break;
    additions.forEach(instruction => attemptedKeys.add(instruction.stableFieldKey));
    const more = await executeApplicationFillInstructions(application.tabId, postObservation, additions);
    readback.push(...more);
    if (more.some(result => !result.success && postObservation.fields.some(field => field.fieldId === result.fieldId && field.required))) break;
    postObservation = await stableApplicationObservation(application.tabId);
  }
  trace("correct_form", "completed", `已执行 ${instructions.length} 条填写指令`);

  postObservation = await stableApplicationObservation(application.tabId);
  const postFieldById = new Map(instructions.map(instruction =>
    [instruction.fieldId, bindObservedInstruction(postObservation, instruction)]));
  const auditFields = instructions.flatMap((instruction) => {
    if (instruction.type === "file") return [];
    const field = postFieldById.get(instruction.fieldId);
    return field ? [{
      fieldId: instruction.fieldId,
      label: instruction.expectedLabel ?? field.label,
      semanticKey: instruction.semanticKey ?? instruction.fieldId,
      expected: String(instruction.value),
      actual: field.currentValue
    }] : [];
  });
  try {
    const audit = await auditFilledFormWithModel(await browserModelSettings(entitlementState.modelService), auditFields);
    modelExecutions = withExecution(modelExecutions, audit.evidence);
    const repairInstructions = audit.issues.flatMap((issue) => {
      const field = postFieldById.get(issue.fieldId);
      if (!field?.required || issue.confidence < 0.9 ||
        readback.some(result => result.fieldId === field.fieldId && !result.success)) return [];
      const instruction = instructionFromObservedField(field, issue.correctionValue, issue.fieldId);
      if (!instruction) return [];
      return shouldPreserveObservedField(instruction) ? [] : [instruction];
    });
    trace(
      "audit_form",
      "completed",
      audit.issues.length
        ? `核验发现 ${audit.issues.length} 个差异，尝试自动修正 ${repairInstructions.length} 个`
        : "核验未发现填写差异"
    );
    if (repairInstructions.length) {
      readback.push(...await executeApplicationFillInstructions(
        application.tabId,
        postObservation,
        repairInstructions
      ));
      postObservation = await stableApplicationObservation(application.tabId);
      trace("correct_form", "completed", `已修正 ${repairInstructions.length} 个字段`);
    }
  } catch (error) {
    trace("audit_form", "skipped", `模型核验不可用，使用 DOM 回读校验：${toPublicError(error).message}`);
  }

  const requiredFailures = requiredFieldFailures(postObservation.fields);
  const failedInstructions = instructions.filter((instruction) => {
    const originalField = firstObservation.fields.find((field) =>
      field.fieldId === instruction.fieldId ||
      Boolean(instruction.stableFieldKey && field.stableFieldKey === instruction.stableFieldKey)
    );
    if (!originalField?.required) return false;
    const finalField = bindObservedInstruction(postObservation, instruction);
    return !readbackMatchesInstruction(instruction, finalField,
      readback.filter(item => item.fieldId === instruction.fieldId).at(-1));
  });
  const validationFailure = [
    ...requiredFailures.map((field) => `必填未完成：${field.label}`),
    ...postObservation.validationMessages,
    ...failedInstructions.map((instruction) => `回读不一致：${instruction.expectedLabel ?? instruction.fieldId}`)
  ].join("；");
  const success = !validationFailure;
  trace(
    "readback",
    success ? "completed" : "failed",
    success ? "DOM 回读校验通过，已停在最终提交前" : validationFailure
  );
  const nextManualAssist = mergeManualAssistWithObservation(manualAssist, postObservation);
  return update({
    activeApplication: {
      ...fillingState.activeApplication!,
      status: success ? "ready_for_review" : "failed",
      observation: postObservation,
      manualAssist: nextManualAssist,
      prefillDraft: nextManualAssist.items.map((item) => ({
        fieldId: item.fieldId ?? item.id,
        ...(item.stableFieldKey ? { stableFieldKey: item.stableFieldKey } : {}),
        label: item.label,
        semanticKey: item.valueSource,
        value: item.value,
        confidence: item.observed ? 0.9 : 0.65
      })),
      readback,
      missing: [],
      rpaTrace,
      lastError: success ? null : validationFailure,
      reviewConfirmedAt: null
    },
    modelExecutions
  });
}

function scheduleManualLoginPolling(tabId: number): void {
  if (manualLoginPollTabs.has(tabId)) return;
  manualLoginPollTabs.add(tabId);
  void (async () => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      const current = await state();
      const application = current.activeApplication;
      if (!application?.manualAssist || application.tabId !== tabId) return;
      if (application.status !== "login_required") return;
      const snapshot = await executeInterruptibleScript({
        target: { tabId },
        func: observeApplicationPage,
        args: [submissionActionPatterns]
      });
      const observation = snapshot[0]?.result as PageObservation | undefined;
      if (!observation || observation.loginRequired) continue;
      await updateManualApplicationFromObservation(current, application, observation);
      return;
    }
  })().finally(() => {
    manualLoginPollTabs.delete(tabId);
  }).catch(async (error: unknown) => {
    const current = await state();
    if (current.activeApplication?.tabId !== tabId ||
      !current.activeApplication.manualAssist ||
      current.activeApplication.status !== "login_required") return;
    await update({
      activeApplication: {
        ...current.activeApplication,
        lastError: toPublicError(error).message
      }
    });
  });
}

async function captureApplicationScreenshot(tabId: number): Promise<string | null> {
  const target = { tabId };
  let attached = false;
  try {
    // captureVisibleTab requires activating the automation tab and therefore
    // interrupts whatever the user is doing. CDP can capture the bound task
    // target directly while it remains in the background.
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    const response = await sendInterruptibleDebuggerCommand(target, "Page.captureScreenshot", {
      format: "jpeg",
      quality: 72,
      fromSurface: true,
      captureBeyondViewport: false
    }) as { data?: unknown };
    const data = String(response.data ?? "");
    return data ? `data:image/jpeg;base64,${data}` : null;
  } catch {
    return null;
  } finally {
    if (attached) await chrome.debugger.detach(target).catch(() => undefined);
  }
}

async function observeVisualRpaState(tabId: number): Promise<Record<string, unknown>> {
  const observation = await stableApplicationObservation(tabId);
  const screenshotDataUrl = await captureApplicationScreenshot(tabId);
  const currentState = await state().catch(() => null);
  const serviceCode = currentState?.modelService.serviceCode || "zhencai";
  return {
    observation,
    screenshot: screenshotDataUrl ? {
      mediaType: "image/jpeg",
      dataUrl: screenshotDataUrl
    } : null,
    readbackHash: await observationReadbackHash(observation),
    visualPlanningHint: {
      providerCode: serviceCode,
      serverManagedModel: serviceCode === "zhencai",
      deviceBridgeVisionPath: "/automation/device-bridge/v1/vision",
      rule: "AI 侧视觉模型只能基于 observation.fields/actions 中的 fieldId/actionId 生成下一步，不得返回坐标或任意 CSS。",
      blockedActions: ["captcha", "login_credential_input", "privacy_consent", "unconfirmed_final_submit"]
    }
  };
}

function manualInformationRequestPayload(
  manualAssist: ManualAssistState,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    ...extra,
    missingInformationRequest: {
      schemaVersion: "manual-information-request.v1",
      count: manualAssist.informationRequests.length,
      questions: manualAssist.informationRequests,
      instructionForAiSide: "请由 AI 侧向用户索要这些信息；插件端不直接向用户提问。用户回答后，用 browser.set_manual_application_content 更新 fillItems/sections。"
    }
  };
}

function aiBridgeManualEvent(
  command: AiPluginCommand,
  fallbackType: string,
  fallbackStatus: AiPluginEvent["status"],
  payload: Record<string, unknown>,
  manualAssist: ManualAssistState
): AiPluginEvent {
  if (!manualAssist.informationRequests.length) {
    return aiBridgeEvent(command, fallbackType, fallbackStatus, payload);
  }
  return aiBridgeEvent(
    command,
    "browser.missing_information_required",
    "waiting_for_user",
    manualInformationRequestPayload(manualAssist, payload)
  );
}

const autoApplyAlarmName = "recruiting-ai-auto-apply-poll";
let autoApplyPollRunning = false;
let autoApplyPollPending = false;
let autoApplyLifecycleGeneration = 0;
let autoApplySessionTerminated = false;
let autoApplyExecutionAbort: AbortController | undefined;
const autoApplyHeartbeat = createAutoApplyHeartbeat({
  credential: autoApplyCredential,
  send: heartbeatAutoApplyDevice,
  active: () => !autoApplySessionTerminated,
  generation: () => autoApplyLifecycleGeneration
});
type AutoApplyTabCloseReason = "command_expired" | "task_cleanup" | "terminal_outcome" | "job_stop";
const autoApplyTabCloseIntent = new Map<number, AutoApplyTabCloseReason>();
const autoApplyPollIdleWaiters = new Set<() => void>();

function rememberAutoApplyTabCloseIntent(
  tabId: number,
  reason: AutoApplyTabCloseReason
): void {
  autoApplyTabCloseIntent.set(tabId, reason);
  setTimeout(() => {
    if (autoApplyTabCloseIntent.get(tabId) === reason) autoApplyTabCloseIntent.delete(tabId);
  }, 60_000);
}
const localAutoApplyControl = new Map<string, "continue" | "pause" | "cancel">();
const autoApplyCompletionOutbox = createAutoApplyCompletionOutbox<AiPluginEvent>(chrome.storage.local);
const autoApplyPendingTabClosuresStorageKey = "autoApplyPendingTabClosures";

function autoApplyCompletionOwner(credential: AutoApplyRuntimeCredential): string {
  return JSON.stringify([credential.gatewayBaseUrl, credential.tenantId, credential.userId, credential.deviceId]);
}

interface PendingAutoApplyTabClosure {
  schemaVersion: "auto-apply-pending-tab-closure.v1";
  commandId: string;
  batchId: string;
  batchJobId: string;
  jobId: string;
  applicationUrl: string;
  tabId: number;
  createdAt: string;
}

async function pendingAutoApplyTabClosures(): Promise<Record<string, PendingAutoApplyTabClosure>> {
  const stored = await chrome.storage.local.get({
    [autoApplyPendingTabClosuresStorageKey]: {}, [autoApplyPendingTabClosureStorageKey]: null
  });
  const closures = asRecord(stored[autoApplyPendingTabClosuresStorageKey]) ?? {};
  const legacy = asRecord(stored[autoApplyPendingTabClosureStorageKey]);
  if (legacy?.schemaVersion === "auto-apply-pending-tab-closure.v1" && typeof legacy.commandId === "string") {
    if (!closures[legacy.commandId]) closures[legacy.commandId] = legacy;
    await chrome.storage.local.set({ [autoApplyPendingTabClosuresStorageKey]: closures,
      [autoApplyPendingTabClosureStorageKey]: null });
  }
  return closures as Record<string, PendingAutoApplyTabClosure>;
}

async function readPendingAutoApplyTabClosure(commandId: string): Promise<PendingAutoApplyTabClosure | null> {
  return autoApplyStorageQueue(autoApplyPendingTabClosuresStorageKey,
    async () => (await pendingAutoApplyTabClosures())[commandId] ?? null);
}

async function clearPendingAutoApplyTabClosure(commandId: string): Promise<void> {
  await autoApplyStorageQueue(autoApplyPendingTabClosuresStorageKey, async () => {
    const closures = await pendingAutoApplyTabClosures();
    delete closures[commandId];
    await chrome.storage.local.set({ [autoApplyPendingTabClosuresStorageKey]: closures });
  });
}

async function rememberPendingAutoApplyTabClosure(
  closure: Omit<PendingAutoApplyTabClosure, "schemaVersion" | "createdAt">
): Promise<void> {
  const generation = autoApplyLifecycleGeneration;
  await autoApplyStorageQueue(autoApplyPendingTabClosuresStorageKey, async () => {
    if (autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
    const closures = await pendingAutoApplyTabClosures();
    if (autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
    closures[closure.commandId] = {
      schemaVersion: "auto-apply-pending-tab-closure.v1", ...closure, createdAt: new Date().toISOString()
    };
    await chrome.storage.local.set({ [autoApplyPendingTabClosuresStorageKey]: closures });
  });
}

async function finalizeAcknowledgedAutoApplyTabClosure(commandId: string, event: AiPluginEvent): Promise<void> {
  const record = await readPendingAutoApplyTabClosure(commandId);
  if (record?.schemaVersion !== "auto-apply-pending-tab-closure.v1" ||
    String(record.commandId ?? "") !== commandId) return;
  const tabId = Number(record.tabId);
  if (!Number.isInteger(tabId)) {
    await clearPendingAutoApplyTabClosure(commandId);
    return;
  }
  const batchId = String(record.batchId ?? "");
  const batchJobId = String(record.batchJobId ?? "");
  const pageSession = await recalledAutoApplyPageSession(
    batchId,
    batchJobId,
    String(record.jobId ?? ""),
    String(record.applicationUrl ?? "")
  );
  const interruptedResult = asRecord(event.payload?.autoApplyResult);
  if (interruptedResult?.reasonCode === "user_interrupted") {
    const refsStored = await chrome.storage.local.get({ [autoApplyTabRefsStorageKey]: {} });
    const ref = asRecord(asRecord(refsStored[autoApplyTabRefsStorageKey])?.[autoApplyTabRefKey(batchId, batchJobId)]);
    if (ref?.commandId !== commandId || ref.tabId !== tabId) {
      await clearPendingAutoApplyTabClosure(commandId);
      return;
    }
  }
  // Disarm the removal observer before closing: AI Offer has already accepted
  // the real result, so the close event must never replace it with tab_closed.
  await forgetAutoApplyTab(batchId, batchJobId, tabId);
  const result = asRecord(event.payload?.autoApplyResult);
  // Inspect the acknowledged result, including old v1 closure records replayed
  // after an upgrade/restart. Login ends the attempt but hands its exact page
  // to the user; it must not remain a CAPTCHA/receipt monitor or lose its tab.
  if (event.commandId === commandId && event.type === "browser.batch_auto_apply_job_completed" &&
    result?.schemaVersion === "auto-apply-job-result.v1" &&
    result.batchId === batchId && result.batchJobId === batchJobId && result.jobId === record.jobId &&
    result.status === "failed" && result.reasonCode === "login_required") {
    await clearPendingAutoApplyTabClosure(commandId);
    return;
  }
  if (pageSession?.tabId === tabId) {
    await persistAutoApplyPageSession(updateAutoApplyPageSession(pageSession, { tabId: null }));
  }
  rememberAutoApplyTabCloseIntent(tabId, "terminal_outcome");
  await closeAutoApplyExecutionSurface(chrome, { tabId, acknowledgedApplicationUrl: String(record.applicationUrl ?? "") });
  const remaining = await chrome.tabs.get(tabId).catch(() => undefined);
  if (remaining) throw new Error("AI Offer 已接收投递状态，但插件创建的招聘标签页未能关闭");
  await clearPendingAutoApplyTabClosure(commandId);
}

async function persistAutoApplyCompletion(commandId: string, event: AiPluginEvent): Promise<void> {
  const generation = autoApplyLifecycleGeneration;
  if (autoApplySessionTerminated) return;
  const credential = await autoApplyCredential();
  if (!credential || autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
  await autoApplyCompletionOutbox.enqueue(autoApplyCompletionOwner(credential), commandId, event,
    () => !autoApplySessionTerminated && generation === autoApplyLifecycleGeneration);
}

async function flushAutoApplyCompletionOutbox(
  credential: AutoApplyRuntimeCredential
): Promise<CompletionOutboxFlushResult> {
  const generation = autoApplyLifecycleGeneration;
  return autoApplyCompletionOutbox.flush(autoApplyCompletionOwner(credential), {
    active: () => !autoApplySessionTerminated && generation === autoApplyLifecycleGeneration,
    acknowledge: async (pending) => {
      // Conflicts are retained per command. They cannot prevent independent
      // receipts and stop acknowledgements from reaching the Gateway.
      try {
        await completeAutoApplyCommand(credential, pending.commandId, pending.event);
      } catch (error) {
        const receipt = error instanceof AutoApplyCommandCompletionRejectedError
          ? expiredInterruptionReceipt(pending.commandId, pending.event, error.status) : null;
        if (!receipt?.pageUrl) throw error;
        await reportAutoApplyBrowserState(credential, { ...receipt, pageUrl: receipt.pageUrl });
      }
      if (autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
      try {
        await finalizeAcknowledgedAutoApplyTabClosure(pending.commandId, pending.event);
      } catch (error) {
        // Cleanup failure cannot downgrade the already acknowledged result.
        await chrome.storage.local.set({ autoApplyAcknowledgedCleanupFailure: {
          commandId: pending.commandId, closure: await readPendingAutoApplyTabClosure(pending.commandId),
          message: error instanceof Error ? error.message : String(error), recordedAt: new Date().toISOString()
        } });
      }
    },
    removed: (pending) => forgetControlledExecution(pending.commandId)
  });
}

interface PersistedAutoApplyTabRef {
  batchId: string;
  batchJobId: string;
  jobId: string;
  tabId: number;
  applicationUrl: string;
  tabOwnership?: "plugin" | "user";
  updatedAt: string;
  monitorMode?: "submission_receipt";
  commandId?: string;
  validationMonitor?: FinalSubmitExecutionResult["validationMonitor"];
  pendingRequiredFieldRequests?: ReturnType<typeof siteRejectedInformationRequests>;
  pendingRejectedFieldKeys?: string[];
  pendingUploadRejection?: NonNullable<ReturnType<typeof siteRejectedUploadEvidence>>;
  pendingSitePolicyBlock?: SiteApplicationPolicyBlock;
  pendingCaptchaHandoff?: { type: "captcha"; message: string };
  receiptDeadlineAt?: string;
  reportedOutcome?: "succeeded" | "already_applied";
  observedTerminalOutcome?: "succeeded";
  observedTerminalUrl?: string;
  observedTerminalAt?: string;
  pendingOutcome?: "captcha_tab_closed" | "submission_active_tab_closed" |
    "submission_receipt_tab_closed";
}

const finalSubmitActiveVerificationTimeoutMs = 12_000;
const finalSubmitPassiveReceiptTimeoutMs = 108_000;
const finalSubmitLifecycleGuardTimeoutMs = 30_000;
const submissionReceiptAlarmPrefix = "recruiting-ai-submission-receipt:";

function submissionReceiptAlarmName(batchId: string, batchJobId: string): string {
  return `${submissionReceiptAlarmPrefix}${batchId}:${batchJobId}`;
}

async function clearSubmissionReceiptAlarms(): Promise<void> {
  const alarms = await chrome.alarms.getAll();
  await Promise.all(alarms
    .filter((alarm) => alarm.name.startsWith(submissionReceiptAlarmPrefix))
    .map((alarm) => chrome.alarms.clear(alarm.name)));
}

function autoApplyTabRefKey(batchId: string, batchJobId: string): string {
  return `${batchId}:${batchJobId}`;
}

function autoApplyPageSessionFromStored(value: unknown): AutoApplyPageSession | null {
  const record = asRecord(value);
  if (record?.schemaVersion !== "auto-apply-page-session.v1") return null;
  const batchId = String(record.batchId ?? "");
  const batchJobId = String(record.batchJobId ?? "");
  const jobId = String(record.jobId ?? "");
  const applicationUrl = String(record.applicationUrl ?? "");
  const stage = String(record.stage ?? "");
  const allowedStages = new Set([
    "opening", "observing", "filling", "validating", "submit_ready", "submit_initiated",
    "waiting_for_user_action", "reconciling", "succeeded", "already_applied", "failed",
    "outcome_unknown"
  ]);
  if (!batchId || !batchJobId || !jobId || !applicationUrl || !allowedStages.has(stage)) return null;
  const allowedPageStages = new Set(["job_detail", "login", "application_form", "unknown"]);
  const pageStage = allowedPageStages.has(String(record.pageStage ?? ""))
    ? record.pageStage as AutoApplyPageSession["pageStage"]
    : null;
  const pageStageSource = ["deterministic", "model"].includes(String(record.pageStageSource ?? ""))
    ? record.pageStageSource as AutoApplyPageSession["pageStageSource"]
    : null;
  const pageStageObservationCount = Number(record.pageStageObservationCount ?? 0);
  const pageStageWaitedMs = Number(record.pageStageWaitedMs ?? 0);
  const legacySurface = asRecord(record.executionSurface);
  const tabOwnership = record.tabOwnership === "plugin" || record.tabOwnership === "user"
    ? record.tabOwnership
    : legacySurface?.source === "new_background_tab" ? "plugin" : "user";
  return {
    ...record,
    tabOwnership,
    pageStage,
    pageStageSource,
    pageStageObservedAt: typeof record.pageStageObservedAt === "string"
      ? record.pageStageObservedAt
      : null,
    pageStageObservationCount: Number.isFinite(pageStageObservationCount) &&
      pageStageObservationCount >= 0 ? Math.floor(pageStageObservationCount) : 0,
    pageStageWaitedMs: Number.isFinite(pageStageWaitedMs) && pageStageWaitedMs >= 0
      ? Math.floor(pageStageWaitedMs)
      : 0
  } as unknown as AutoApplyPageSession;
}

async function recalledAutoApplyPageSession(
  batchId: string,
  batchJobId: string,
  jobId: string,
  applicationUrl: string
): Promise<AutoApplyPageSession | null> {
  const stored = await chrome.storage.local.get({ [AUTO_APPLY_PAGE_SESSIONS_STORAGE_KEY]: {} });
  const sessions = asRecord(stored[AUTO_APPLY_PAGE_SESSIONS_STORAGE_KEY]) ?? {};
  const session = autoApplyPageSessionFromStored(sessions[autoApplyPageSessionKey(batchId, batchJobId)]);
  if (!session || session.jobId !== jobId || session.applicationUrl !== applicationUrl) return null;
  return session;
}

const autoApplyStorageQueue = createAutoApplyStorageQueue();

async function persistAutoApplyPageSession(session: AutoApplyPageSession): Promise<boolean> {
  return autoApplyStorageQueue(AUTO_APPLY_PAGE_SESSIONS_STORAGE_KEY, async () => {
    // Persisted waits belong to their job, not the currently executing command.
    // An unrelated command timeout must not erase parked jobs or their checkpoints.
    const generation = autoApplyLifecycleGeneration;
    if (autoApplySessionTerminated) return false;
    const stored = await chrome.storage.local.get({ [AUTO_APPLY_PAGE_SESSIONS_STORAGE_KEY]: {} });
    if (generation !== autoApplyLifecycleGeneration || autoApplySessionTerminated) return false;
    const existing = asRecord(stored[AUTO_APPLY_PAGE_SESSIONS_STORAGE_KEY]) ?? {};
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const live = Object.fromEntries(Object.entries(existing).filter(([, value]) => {
      const record = asRecord(value);
      return record && Date.parse(String(record.updatedAt ?? "")) >= cutoff;
    }));
    await chrome.storage.local.set({
      [AUTO_APPLY_PAGE_SESSIONS_STORAGE_KEY]: {
        ...live,
        [session.sessionKey]: session
      }
    });
    if (generation !== autoApplyLifecycleGeneration || autoApplySessionTerminated) {
      await chrome.storage.local.set({ [AUTO_APPLY_PAGE_SESSIONS_STORAGE_KEY]: {} });
      return false;
    }
    return true;
  });
}

async function tabFromAutoApplyPageSession(
  session: AutoApplyPageSession | null
): Promise<chrome.tabs.Tab | undefined> {
  if (!session || !Number.isInteger(session.tabId)) return undefined;
  const tab = await chrome.tabs.get(session.tabId as number).catch(() => undefined);
  if (!tab?.url || !autoApplyBoundTabUrlMatchesApplication(tab.url, session.applicationUrl)) return undefined;
  return tab;
}

async function rememberAutoApplyTab(ref: PersistedAutoApplyTabRef): Promise<void> {
  return autoApplyStorageQueue(autoApplyTabRefsStorageKey, async () => {
    // Persisted waits belong to their job, not the currently executing command.
    // An unrelated command timeout must not erase parked jobs or their checkpoints.
    const generation = autoApplyLifecycleGeneration;
    if (autoApplySessionTerminated) return;
    const stored = await chrome.storage.local.get({ [autoApplyTabRefsStorageKey]: {} });
    if (generation !== autoApplyLifecycleGeneration || autoApplySessionTerminated) return;
    const existing = asRecord(stored[autoApplyTabRefsStorageKey]) ?? {};
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const live = Object.fromEntries(Object.entries(existing).filter(([, value]) => {
      const record = asRecord(value);
      return record && Date.parse(String(record.updatedAt ?? "")) >= cutoff;
    }));
    await chrome.storage.local.set({
      [autoApplyTabRefsStorageKey]: {
        ...live,
        [autoApplyTabRefKey(ref.batchId, ref.batchJobId)]: ref
      }
    });
    if (generation !== autoApplyLifecycleGeneration || autoApplySessionTerminated) {
      await chrome.storage.local.set({ [autoApplyTabRefsStorageKey]: {} });
    }
  });
}

async function forgetAutoApplyTab(
  batchId: string,
  batchJobId: string,
  tabId: number
): Promise<void> {
  return autoApplyStorageQueue(autoApplyTabRefsStorageKey, async () => {
    const key = autoApplyTabRefKey(batchId, batchJobId);
    const stored = await chrome.storage.local.get({ [autoApplyTabRefsStorageKey]: {} });
    const existing = asRecord(stored[autoApplyTabRefsStorageKey]) ?? {};
    const current = asRecord(existing[key]);
    if (!current || Number(current.tabId) !== tabId) return;
    const next = { ...existing };
    delete next[key];
    await chrome.storage.local.set({ [autoApplyTabRefsStorageKey]: next });
    await chrome.alarms.clear(submissionReceiptAlarmName(batchId, batchJobId));
  });
}

function persistedAutoApplyTabOwnedByPlugin(
  record: Record<string, unknown>,
  pageSession: AutoApplyPageSession | null
): boolean {
  if (record.tabOwnership === "plugin") return true;
  if (record.tabOwnership === "user") return false;
  return autoApplyPageSessionOwnsTab(pageSession);
}

/** Call only after Gateway has accepted the outcome/handoff. Removing the
 * binding before closing prevents tabs.onRemoved from overwriting that result
 * with submission_receipt_tab_closed. */
async function retireReportedAutoApplyTab(
  record: Record<string, unknown>,
  pageSession: AutoApplyPageSession | null,
  tabId: number
): Promise<void> {
  const batchId = String(record.batchId ?? "");
  const batchJobId = String(record.batchJobId ?? "");
  const pluginOwned = persistedAutoApplyTabOwnedByPlugin(record, pageSession);
  if (pageSession?.tabId === tabId) {
    await persistAutoApplyPageSession(updateAutoApplyPageSession(pageSession, { tabId: null }));
  }
  await forgetAutoApplyTab(batchId, batchJobId, tabId);
  if (!pluginOwned) return;
  rememberAutoApplyTabCloseIntent(tabId, "terminal_outcome");
  await closeAutoApplyExecutionSurface(chrome, { tabId, acknowledgedApplicationUrl: String(record.applicationUrl ?? "") }).catch(() => undefined);
}

async function recalledAutoApplyTab(
  batchId: string,
  batchJobId: string,
  jobId: string,
  applicationUrl: string
): Promise<chrome.tabs.Tab | undefined> {
  const stored = await chrome.storage.local.get({ [autoApplyTabRefsStorageKey]: {} });
  const refs = asRecord(stored[autoApplyTabRefsStorageKey]) ?? {};
  const ref = asRecord(refs[autoApplyTabRefKey(batchId, batchJobId)]);
  if (!ref || String(ref.jobId ?? "") !== jobId || String(ref.applicationUrl ?? "") !== applicationUrl) {
    return undefined;
  }
  const tabId = Number(ref.tabId);
  if (!Number.isInteger(tabId)) return undefined;
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (!tab?.url || !autoApplyBoundTabUrlMatchesApplication(tab.url, applicationUrl)) return undefined;
  return tab;
}

class AutoApplyCancelledError extends Error {
  constructor() {
    super("批量投递已终止");
    this.name = "AutoApplyCancelledError";
  }
}

class AutoApplyCommandExpiredError extends Error {
  constructor() {
    super("自动投递任务已超过执行时限，已停止后续页面操作");
    this.name = "AutoApplyCommandExpiredError";
  }
}

function assertAutoApplyCommandActive(command: AiPluginCommand): void {
  const abortReason = autoApplyExecutionAbort?.signal.reason;
  if (abortReason instanceof AutoApplyCommandExpiredError || abortReason instanceof AutoApplyUserInterruptedError || abortReason instanceof AutoApplyJobStoppedError) throw abortReason;
  if (autoApplySessionTerminated || autoApplyExecutionAbort?.signal.aborted) {
    throw new AutoApplyCancelledError();
  }
  const expiresAt = Date.parse(command.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new AutoApplyCommandExpiredError();
  }
}

async function clearLocalAutoApplyAccountState(clearCredential: boolean): Promise<void> {
  autoApplySessionTerminated = true;
  autoApplyLifecycleGeneration += 1;
  autoApplyPollPending = false;
  autoApplyExecutionAbort?.abort();
  localAutoApplyControl.clear();
  const cleanupTasks: Promise<unknown>[] = [
    autoApplyCompletionOutbox.clear(),
    autoApplyStorageQueue(autoApplyPendingTabClosuresStorageKey, () => chrome.storage.local.set({
      [autoApplyPendingTabClosuresStorageKey]: {}, [autoApplyPendingTabClosureStorageKey]: null
    })),
    chrome.alarms.clear(autoApplyAlarmName),
    clearSubmissionReceiptAlarms(),
    chrome.storage.local.set({
      [AUTO_APPLY_PAGE_SESSIONS_STORAGE_KEY]: {},
      [autoApplyTabRefsStorageKey]: {},
      [autoApplyVisionDiagnosticsStorageKey]: []
    })
  ];
  if (clearCredential) cleanupTasks.push(clearAutoApplyCredential());
  await Promise.all(cleanupTasks);
  await update({
    activeApplication: null,
    autoApplyRuntime: {
      ...defaults.autoApplyRuntime,
      connection: "offline",
      status: "idle",
      updatedAt: new Date().toISOString(),
      lastError: null
    }
  }).catch(() => undefined);
}

async function terminateLocalAutoApplySession(): Promise<void> {
  await clearLocalAutoApplyAccountState(true);
}

async function waitForAutoApplyPollIdle(): Promise<void> {
  if (!autoApplyPollRunning) return;
  await new Promise<void>((resolve) => autoApplyPollIdleWaiters.add(resolve));
}

async function quiesceLocalAutoApplyExecution(): Promise<void> {
  if (!autoApplyPollRunning) return;
  autoApplySessionTerminated = true;
  autoApplyLifecycleGeneration += 1;
  autoApplyPollPending = false;
  autoApplyExecutionAbort?.abort();
  await waitForAutoApplyPollIdle();
}

async function bindLocalAutoApplySession(input: {
  bootstrapToken: string;
  gatewayBaseUrl?: string;
  productOrigin?: string;
  productClientInstanceId?: string;
}): Promise<AutoApplyRuntimeCredential> {
  const previous = await autoApplyCredential();
  const wasTerminated = autoApplySessionTerminated;
  // A bootstrap can replace the device token even for the same owner. Stop an
  // execution holding the old token before exchanging it; the claimed command
  // can then be reclaimed safely under the new binding after its lease expires.
  await quiesceLocalAutoApplyExecution();
  const credential = await exchangeAutoApplyBootstrap(input);
  const ownerChanged = Boolean(previous) && (
    previous?.tenantId !== credential.tenantId || previous?.userId !== credential.userId
  );
  if (ownerChanged) {
    // The web logout bridge is best-effort. A bootstrap owned by another account is
    // therefore also a hard local account boundary and must discard every old job.
    await clearLocalAutoApplyAccountState(false);
  }
  if (wasTerminated || ownerChanged) await waitForAutoApplyPollIdle();
  autoApplyLifecycleGeneration += 1;
  autoApplySessionTerminated = false;
  await update({
    autoApplyRuntime: {
      ...defaults.autoApplyRuntime,
      connection: "ready",
      updatedAt: new Date().toISOString()
    }
  });
  await chrome.alarms.create(autoApplyAlarmName, { periodInMinutes: 0.5 });
  void pollAutoApplyOnce();
  return credential;
}

type AutoApplyUserActionType = "login" | "captcha" | "identity_verification";

class AutoApplyUserActionRequiredError extends Error {
  constructor(
    readonly actionType: AutoApplyUserActionType,
    message: string
  ) {
    super(message);
    this.name = "AutoApplyUserActionRequiredError";
  }
}

function assertApplicationFormStage(
  observation: PageObservation,
  context: string
): void {
  if (observation.pageStage === "login" || observation.loginRequired) {
    throw new AutoApplyUserActionRequiredError(
      "login",
      observation.loginReason ?? `${context}时招聘页面要求登录`
    );
  }
  if (observation.pageStage === "application_form" && observation.formDetected) return;
  if (observation.pageStage === "job_detail" || observation.jobDetailDetected) {
    throw new Error(`${context}时页面仍停留在职位详情页，未进入申请表`);
  }
  throw new Error(`${context}时无法确认当前页面是申请表（页面阶段：${observation.pageStage}），已停止自动投递`);
}

async function detectAutoApplyUserAction(tabId: number, allowOptionalLoginDismiss = true): Promise<{
  type: AutoApplyUserActionType;
  message: string;
} | null> {
  const execution = await executeInterruptibleScript({
    target: { tabId },
    func: resolveApplicationUserAction,
    args: [submissionActionPatterns, allowOptionalLoginDismiss]
  });
  return execution[0]?.result ?? null;
}

interface AutoApplySiteOutcome {
  success: boolean;
  outcome: "succeeded" | "already_applied" | null;
  source: "registered_receipt_url" | "visible_receipt" | null;
  url: string;
}

async function detectAutoApplySiteSuccess(tabId: number): Promise<AutoApplySiteOutcome> {
  const execution = await executeInterruptibleScript({
    target: { tabId },
    func: readApplicationReceiptInPage
  });
  const receipt = execution[0]?.result ?? { success: false, outcome: null, source: null, url: "" };
  if (receipt.success && receipt.source !== "registered_receipt_url" &&
    await detectAutoApplyUserAction(tabId)) {
    return { ...receipt, success: false, outcome: null, source: null };
  }
  return receipt;
}

async function detectAutoApplySitePolicyBlock(
  tabId: number, monitor?: Pick<NonNullable<FinalSubmitExecutionResult["validationMonitor"]>, "token">
): Promise<SiteApplicationPolicyBlock> {
  const execution = await executeInterruptibleScript({
    target: { tabId },
    func: readSiteApplicationPolicyBlockInPage,
    args: monitor ? [{ phase: "read", token: monitor.token }] : []
  });
  return execution[0]?.result ?? {
    blocked: false, reasonCode: null, message: null, source: null, url: ""
  };
}

async function cleanupSubmissionValidationMonitor(
  tabId: number, monitor: FinalSubmitExecutionResult["validationMonitor"]
): Promise<void> {
  if (!monitor) return;
  await executeInterruptibleScript({ target: { tabId },
    func: readSiteApplicationPolicyBlockInPage,
    args: [{ phase: "cleanup", token: monitor.token }] }).catch(() => undefined);
  await executeInterruptibleScript({ target: { tabId },
    func: nativeSubmitValidationProbeInPage, args: [monitor.token, "cleanup"] }).catch(() => undefined);
  await executeInterruptibleScript({ target: { tabId },
    func: reassertedSubmitValidationProbeInPage, args: [monitor.token, "cleanup"] }).catch(() => undefined);
}

async function captureBoundSitePolicyObservation(token: unknown, sender: chrome.runtime.MessageSender): Promise<boolean> {
  const tabId = sender.tab?.id;
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !Number.isInteger(tabId) ||
    typeof token !== "string" || !token || token.length > 200) return false;
  const stored = await chrome.storage.local.get({ [autoApplyTabRefsStorageKey]: {} });
  const refs = asRecord(stored[autoApplyTabRefsStorageKey]) ?? {};
  const binding = Object.values(refs).map(asRecord).find(record => record?.tabId === tabId &&
    (record.validationMonitor as FinalSubmitExecutionResult["validationMonitor"])?.token === token);
  if (!binding || !sender.url || !autoApplyBoundTabUrlMatchesApplication(sender.url, String(binding.applicationUrl))) return false;
  const policy = await detectAutoApplySitePolicyBlock(tabId!, { token });
  if (!policy.blocked || !policy.message || policy.url !== sender.url) return false;
  let saved = false;
  await autoApplyStorageQueue(autoApplyTabRefsStorageKey, async () => {
    const latestStored = await chrome.storage.local.get({ [autoApplyTabRefsStorageKey]: {} });
    const latestRefs = asRecord(latestStored[autoApplyTabRefsStorageKey]) ?? {};
    const key = autoApplyTabRefKey(String(binding.batchId), String(binding.batchJobId));
    const latest = asRecord(latestRefs[key]);
    if (!latest || latest.tabId !== tabId ||
      (latest.validationMonitor as FinalSubmitExecutionResult["validationMonitor"])?.token !== token) return;
    await chrome.storage.local.set({ [autoApplyTabRefsStorageKey]: { ...latestRefs,
      [key]: { ...latest, pendingSitePolicyBlock: policy, updatedAt: new Date().toISOString() }
    } });
    saved = true;
  });
  return saved;
}

/** Read only. No option-opening, fill, scroll, click or new submission here. */
async function readLateSubmissionRejection(
  tabId: number, monitor: FinalSubmitExecutionResult["validationMonitor"]
): Promise<PageFieldObservation[] | null> {
  if (!monitor || !monitor.baseline || !monitor.token) return null;
  const page = await stableApplicationObservation(tabId, { forControlDispatch: true });
  if (page.url !== monitor.baseline.url || page.pageStage !== "application_form" || page.loginRequired) return null;
  const native = await executeInterruptibleScript({ target: { tabId },
    func: nativeSubmitValidationProbeInPage, args: [monitor.token, "read",
      page.fields.map(field => ({ key: siteValidationFieldKey(field), selector: field.selector }))] });
  const reasserted = await executeInterruptibleScript({ target: { tabId },
    func: reassertedSubmitValidationProbeInPage, args: [monitor.token, "read",
      page.fields.map(field => ({ key: siteValidationFieldKey(field), selector: field.selector,
        hasError: Boolean(field.validationMessage) }))] });
  const nativeErrors = native[0]?.result ?? [];
  return submissionRejectedFields(monitor.baseline, page, {
    reassertedKeys: new Set(reasserted[0]?.result ?? []),
    nativeErrors,
    previouslyRejectedKeys: new Set(monitor.previouslyRejectedKeys ?? [])
  });
}

let autoApplyTabReconciliationRunning = false;
const autoApplyTabOutcomeReporting = new Set<number>();
const autoApplyStoppingJobs = new Set<string>();
const autoApplyActiveSubmissionTabs = new Set<number>();
const autoApplyTerminalNavigationByTabId = new Map<number, {
  outcome: "succeeded";
  url: string;
  observedAt: string;
}>();

async function persistObservedAutoApplyTerminalNavigation(
  tabId: number,
  terminal: { outcome: "succeeded"; url: string; observedAt: string }
): Promise<void> {
  await autoApplyStorageQueue(autoApplyTabRefsStorageKey, async () => {
    const stored = await chrome.storage.local.get({ [autoApplyTabRefsStorageKey]: {} });
    const refs = asRecord(stored[autoApplyTabRefsStorageKey]) ?? {};
    let changed = false;
    const next = Object.fromEntries(Object.entries(refs).map(([key, value]) => {
      const record = asRecord(value);
      if (!record || Number(record.tabId) !== tabId ||
        !autoApplyBoundTabUrlMatchesApplication(
          terminal.url,
          String(record.applicationUrl ?? "")
        )) return [key, value];
      changed = true;
      return [key, {
        ...record,
        observedTerminalOutcome: terminal.outcome,
        observedTerminalUrl: terminal.url,
        observedTerminalAt: terminal.observedAt,
        updatedAt: terminal.observedAt
      }];
    }));
    if (changed) await chrome.storage.local.set({ [autoApplyTabRefsStorageKey]: next });
  });
}

function observedAutoApplyTerminalNavigation(
  tabId: number,
  record: Record<string, unknown>,
  pageSession?: AutoApplyPageSession | null
): { outcome: "succeeded"; url: string; observedAt: string } | null {
  const candidates = [
    autoApplyTerminalNavigationByTabId.get(tabId),
    record.observedTerminalOutcome === "succeeded" &&
      typeof record.observedTerminalUrl === "string" && record.observedTerminalUrl
      ? {
          outcome: "succeeded" as const,
          url: record.observedTerminalUrl,
          observedAt: typeof record.observedTerminalAt === "string"
            ? record.observedTerminalAt
            : new Date().toISOString()
        }
      : null
  ];
  const applicationUrl = String(record.applicationUrl ?? "");
  return candidates.find((candidate) => Boolean(candidate &&
    autoApplyTerminalNavigationMatchesSubmission(candidate, applicationUrl,
      pageSession?.tabId === tabId ? pageSession.submitInitiatedAt : null))) ?? null;
}

/**
 * Reconcile only tabs that were explicitly bound to a batch job. This avoids
 * claiming a generic Moka receipt for another job when several applications
 * are open at the same time. A failed report is deliberately left unmarked so
 * the next tab update/alarm can retry it after the server has persisted the
 * waiting result.
 */
async function reconcilePersistedAutoApplyTabs(onlyTabId?: number): Promise<void> {
  if (autoApplyTabReconciliationRunning) return;
  autoApplyTabReconciliationRunning = true;
  const generation = autoApplyLifecycleGeneration;
  try {
    const stored = await chrome.storage.local.get({ [autoApplyTabRefsStorageKey]: {} });
    const refs = asRecord(stored[autoApplyTabRefsStorageKey]) ?? {};
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    const credential = await autoApplyCredential();
    if (!credential || autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
    for (const [key, value] of Object.entries(refs)) {
      const record = asRecord(value);
      if (!record || Date.parse(String(record.updatedAt ?? "")) < cutoff) continue;
      const tabId = Number(record.tabId);
      if (!Number.isInteger(tabId) || (onlyTabId !== undefined && tabId !== onlyTabId)) continue;
      const pageSession = await recalledAutoApplyPageSession(
        String(record.batchId ?? ""),
        String(record.batchJobId ?? ""),
        String(record.jobId ?? ""),
        String(record.applicationUrl ?? "")
      );
      if (autoApplyStoppingJobs.has(autoApplyTabRefKey(String(record.batchId), String(record.batchJobId)))) continue;
      // A registered success navigation is stronger than a later tab removal.
      // Moka may close its script-opened tab immediately after the thanks route;
      // retain and report that route before considering pending tab_closed state.
      const observedTerminal = observedAutoApplyTerminalNavigation(tabId, record, pageSession);
      if (observedTerminal) {
        autoApplyTabOutcomeReporting.add(tabId);
        try {
          await reportAutoApplyBrowserState(credential, {
            batchId: String(record.batchId ?? ""),
            batchJobId: String(record.batchJobId ?? ""),
            jobId: String(record.jobId ?? ""),
            outcome: observedTerminal.outcome,
            pageUrl: observedTerminal.url,
            observedAt: observedTerminal.observedAt
          });
          await cleanupSubmissionValidationMonitor(
            tabId,
            record.validationMonitor as FinalSubmitExecutionResult["validationMonitor"]
          );
          const completedSession = pageSession
            ? completeAutoApplyPageSession(pageSession, observedTerminal.outcome)
            : null;
          if (completedSession) await persistAutoApplyPageSession(completedSession);
          await retireReportedAutoApplyTab(record, completedSession, tabId);
          autoApplyTerminalNavigationByTabId.delete(tabId);
        } finally {
          autoApplyTabOutcomeReporting.delete(tabId);
        }
        continue;
      }
      if (!record.pendingSitePolicyBlock && !record.pendingUploadRejection && (record.pendingOutcome === "captcha_tab_closed" ||
        record.pendingOutcome === "submission_active_tab_closed" ||
        record.pendingOutcome === "submission_receipt_tab_closed")) {
        const captchaClosed = record.pendingOutcome === "captcha_tab_closed";
        const activeSubmissionClosed = record.pendingOutcome === "submission_active_tab_closed";
        const validClosedMonitor = captchaClosed
          ? isRemovedCaptchaWaitingTab(pageSession, tabId)
          : activeSubmissionClosed
            ? isRemovedActiveSubmissionTab(pageSession, tabId)
            : isRemovedSubmissionReceiptTab(pageSession, tabId);
        if (!pageSession || !validClosedMonitor) {
          await forgetAutoApplyTab(
            String(record.batchId ?? ""),
            String(record.batchJobId ?? ""),
            tabId
          );
          continue;
        }
        await reportAutoApplyBrowserState(credential, {
          batchId: String(record.batchId ?? ""),
          batchJobId: String(record.batchJobId ?? ""),
          jobId: String(record.jobId ?? ""),
          ...(activeSubmissionClosed && typeof record.commandId === "string"
            ? { commandId: record.commandId }
            : {}),
          outcome: captchaClosed
            ? "captcha_tab_closed"
            : activeSubmissionClosed
              ? "submission_active_tab_closed"
              : "submission_receipt_tab_closed",
          pageUrl: String(record.applicationUrl ?? ""),
          observedAt: new Date().toISOString()
        });
        await persistAutoApplyPageSession(updateAutoApplyPageSession(
          failAutoApplyPageSession(pageSession),
          { tabId: null }
        ));
        await forgetAutoApplyTab(
          String(record.batchId ?? ""),
          String(record.batchJobId ?? ""),
          tabId
        );
        continue;
      }
      const reportedOutcome = String(record.reportedOutcome ?? "");
      if (reportedOutcome === "succeeded" || reportedOutcome === "already_applied") {
        const reportedSession = pageSession
          ? completeAutoApplyPageSession(pageSession, reportedOutcome)
          : null;
        if (reportedSession && pageSession?.terminalOutcome !== reportedOutcome) {
          await persistAutoApplyPageSession(reportedSession);
        }
        await cleanupSubmissionValidationMonitor(
          tabId,
          record.validationMonitor as FinalSubmitExecutionResult["validationMonitor"]
        );
        await retireReportedAutoApplyTab(record, reportedSession, tabId);
        continue;
      }
      const storedPolicy = record.pendingSitePolicyBlock as SiteApplicationPolicyBlock | undefined;
      const tab = await chrome.tabs.get(tabId).catch(() =>
        storedPolicy?.blocked && storedPolicy.message ? { url: storedPolicy.url } :
          record.pendingUploadRejection ? { url: String(record.applicationUrl ?? "") } : undefined);
      const applicationUrl = String(record.applicationUrl ?? "");
      if (!tab?.url || !autoApplyBoundTabUrlMatchesApplication(tab.url, applicationUrl)) continue;
      autoApplyTabOutcomeReporting.add(tabId);
      try {
        const terminal = await detectAutoApplySiteSuccess(tabId).catch(() => null);
        const sitePolicyBlock = terminal?.success && terminal.source === "registered_receipt_url"
          ? null
          : (record.pendingSitePolicyBlock as SiteApplicationPolicyBlock | undefined) ??
            await detectAutoApplySitePolicyBlock(tabId,
              record.validationMonitor as FinalSubmitExecutionResult["validationMonitor"]).catch(() => null);
        if (sitePolicyBlock?.blocked && sitePolicyBlock.reasonCode && sitePolicyBlock.message) {
          if (autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
          // A report may race the command's waiting result or lose its HTTP
          // response. Preserve the observed policy before attempting delivery.
          if (!record.pendingSitePolicyBlock) await rememberAutoApplyTab({ ...record, tabId, applicationUrl,
            pendingSitePolicyBlock: sitePolicyBlock, updatedAt: new Date().toISOString()
          } as PersistedAutoApplyTabRef);
          await reportAutoApplyBrowserState(credential, {
            batchId: String(record.batchId ?? ""),
            batchJobId: String(record.batchJobId ?? ""),
            jobId: String(record.jobId ?? ""),
            commandId: typeof record.commandId === "string" ? record.commandId : undefined,
            outcome: "site_application_limit_reached",
            siteMessage: sitePolicyBlock.message,
            pageUrl: sitePolicyBlock.url || tab.url,
            observedAt: new Date().toISOString()
          });
          await chrome.alarms.clear(submissionReceiptAlarmName(
            String(record.batchId ?? ""), String(record.batchJobId ?? "")
          ));
          await cleanupSubmissionValidationMonitor(
            tabId, record.validationMonitor as FinalSubmitExecutionResult["validationMonitor"]
          );
          const failedSession = pageSession ? failAutoApplyPageSession(pageSession) : null;
          if (failedSession) await persistAutoApplyPageSession(failedSession);
          await retireReportedAutoApplyTab(record, failedSession, tabId);
          continue;
        }
        if (!terminal?.success && record.monitorMode === "submission_receipt" && pageSession &&
          (pageSession.stage === "reconciling" || record.pendingCaptchaHandoff && pageSession.waitingFor === "captcha")) {
          const gate = record.pendingCaptchaHandoff as PersistedAutoApplyTabRef["pendingCaptchaHandoff"] ??
            await detectAutoApplyUserAction(tabId, false).catch(() => null);
          if (gate?.type === "captcha") {
            // A delayed challenge is no longer a receipt timeout. Persist the
            // handoff first so transport failure cannot close or lose its page.
            if (!record.pendingCaptchaHandoff) await rememberAutoApplyTab({ ...record, tabId, applicationUrl,
              pendingCaptchaHandoff: gate, updatedAt: new Date().toISOString()
            } as PersistedAutoApplyTabRef);
            await reportAutoApplyBrowserState(credential, {
              batchId: String(record.batchId), batchJobId: String(record.batchJobId), jobId: String(record.jobId),
              commandId: String(record.commandId ?? ""), outcome: "captcha_required", pageUrl: tab.url,
              observedAt: new Date().toISOString()
            });
            if (!await persistAutoApplyPageSession(waitAutoApplyForUser(pageSession, "captcha"))) {
              throw new Error("验证码交接会话未保存");
            }
            await rememberAutoApplyTab({ ...record, tabId, applicationUrl, monitorMode: undefined,
              receiptDeadlineAt: undefined, pendingCaptchaHandoff: undefined, updatedAt: new Date().toISOString()
            } as PersistedAutoApplyTabRef);
            await chrome.alarms.clear(submissionReceiptAlarmName(String(record.batchId), String(record.batchJobId)));
            continue;
          }
        }
        if (!terminal?.success && record.monitorMode === "submission_receipt" && pageSession &&
          (pageSession.stage === "reconciling" || record.pendingUploadRejection ||
            (pageSession.waitingFor === "missing_information" && record.pendingRequiredFieldRequests))) {
          const pendingRequests = record.pendingRequiredFieldRequests as ReturnType<typeof siteRejectedInformationRequests> | undefined;
          const lateFields = pendingRequests?.length || record.pendingUploadRejection ? null : await readLateSubmissionRejection(
            tabId, record.validationMonitor as FinalSubmitExecutionResult["validationMonitor"]
          );
          const uploadRejection = record.pendingUploadRejection as PersistedAutoApplyTabRef["pendingUploadRejection"] ??
            (lateFields?.some(field => field.type === "file" && field.validationMessage)
              ? siteRejectedUploadEvidence(lateFields) : null);
          if (uploadRejection) {
            // Preserve the confirmed rejection before delivery. Never turn a
            // file into a text answer, and keep the original page for inspection.
            if (!record.pendingUploadRejection) await rememberAutoApplyTab({ ...record, tabId, applicationUrl,
              pendingUploadRejection: uploadRejection, updatedAt: new Date().toISOString()
            } as PersistedAutoApplyTabRef);
            if (autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
            await reportAutoApplyBrowserState(credential, {
              batchId: String(record.batchId), batchJobId: String(record.batchJobId), jobId: String(record.jobId),
              commandId: typeof record.commandId === "string" ? record.commandId : undefined,
              outcome: "site_validation_rejected", pageUrl: tab.url,
              observedAt: new Date().toISOString(), uploadRejection
            });
            await cleanupSubmissionValidationMonitor(tabId, record.validationMonitor as FinalSubmitExecutionResult["validationMonitor"]);
            await chrome.alarms.clear(submissionReceiptAlarmName(String(record.batchId), String(record.batchJobId)));
            if (!await persistAutoApplyPageSession(failAutoApplyPageSession(pageSession))) {
              throw new Error("网站上传拒绝会话未保存");
            }
            await forgetAutoApplyTab(String(record.batchId), String(record.batchJobId), tabId);
            continue;
          }
          const requests = pendingRequests?.length ? pendingRequests :
            lateFields?.length ? siteRejectedInformationRequests(lateFields) : [];
          const rejectedKeys = pendingRequests?.length ? record.pendingRejectedFieldKeys as string[] :
            lateFields?.map(siteValidationFieldKey) ?? [];
          if (requests.length) {
            // Persist before reporting: the command's waiting receipt can race
            // this event; a rejected report must be retried, not lost.
            await rememberAutoApplyTab({ ...record, tabId, applicationUrl,
              pendingRequiredFieldRequests: requests, pendingRejectedFieldKeys: rejectedKeys,
              updatedAt: new Date().toISOString()
            } as PersistedAutoApplyTabRef);
            const correctionSession = pageSession.waitingFor === "missing_information" ? pageSession :
              waitAutoApplyForUser(updateAutoApplyPageSession(
                resumeAutoApplyAfterSiteValidation(pageSession), { pendingRepairFieldKeys: rejectedKeys }
              ), "missing_information");
            if (!await persistAutoApplyPageSession(correctionSession)) {
              throw new Error("网站拒绝后的补充信息会话未保存");
            }
            if (autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
            await reportAutoApplyBrowserState(credential, {
              batchId: String(record.batchId), batchJobId: String(record.batchJobId), jobId: String(record.jobId),
              commandId: typeof record.commandId === "string" ? record.commandId : undefined,
              outcome: "site_validation_rejected", pageUrl: tab.url,
              observedAt: new Date().toISOString(), requiredFieldRequests: requests
            });
            await cleanupSubmissionValidationMonitor(tabId, record.validationMonitor as FinalSubmitExecutionResult["validationMonitor"]);
            await chrome.alarms.clear(submissionReceiptAlarmName(String(record.batchId), String(record.batchJobId)));
            await retireReportedAutoApplyTab(record, correctionSession, tabId);
            continue;
          }
        }
        if (terminal?.success && terminal.outcome && terminal.url) {
          if (autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
          await reportAutoApplyBrowserState(credential, {
            batchId: String(record.batchId ?? ""),
            batchJobId: String(record.batchJobId ?? ""),
            jobId: String(record.jobId ?? ""),
            outcome: terminal.outcome,
            pageUrl: terminal.url,
            observedAt: new Date().toISOString()
          });
          await chrome.alarms.clear(submissionReceiptAlarmName(
            String(record.batchId ?? ""),
            String(record.batchJobId ?? "")
          ));
          await cleanupSubmissionValidationMonitor(tabId, record.validationMonitor as FinalSubmitExecutionResult["validationMonitor"]);
          if (pageSession) {
            await persistAutoApplyPageSession(completeAutoApplyPageSession(
              pageSession,
              terminal.outcome
            ));
          }
          await autoApplyStorageQueue(autoApplyTabRefsStorageKey, async () => {
            const latestStored = await chrome.storage.local.get({ [autoApplyTabRefsStorageKey]: {} });
            if (autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
            const latestRefs = asRecord(latestStored[autoApplyTabRefsStorageKey]) ?? {};
            const latest = asRecord(latestRefs[key]);
            if (!latest || Number(latest.tabId) !== tabId) return;
            await chrome.storage.local.set({
              [autoApplyTabRefsStorageKey]: {
                ...latestRefs,
                [key]: {
                  ...latest,
                  reportedOutcome: terminal.outcome,
                  updatedAt: new Date().toISOString()
                }
              }
            });
          });
          await retireReportedAutoApplyTab(
            record,
            pageSession ? completeAutoApplyPageSession(pageSession, terminal.outcome) : null,
            tabId
          );
          continue;
        }
        const receiptDeadline = Date.parse(String(record.receiptDeadlineAt ?? ""));
        if (record.monitorMode === "submission_receipt" && Number.isFinite(receiptDeadline) &&
          Date.now() >= receiptDeadline) {
          await reportAutoApplyBrowserState(credential, {
            batchId: String(record.batchId ?? ""),
            batchJobId: String(record.batchJobId ?? ""),
            jobId: String(record.jobId ?? ""),
            outcome: "submission_receipt_timeout",
            pageUrl: tab.url,
            observedAt: new Date().toISOString()
          });
          await cleanupSubmissionValidationMonitor(tabId, record.validationMonitor as FinalSubmitExecutionResult["validationMonitor"]);
          if (pageSession) {
            await persistAutoApplyPageSession(failAutoApplyPageSession(pageSession));
          }
          await retireReportedAutoApplyTab(
            record,
            pageSession ? failAutoApplyPageSession(pageSession) : null,
            tabId
          );
          continue;
        }
      } finally {
        autoApplyTabOutcomeReporting.delete(tabId);
      }
    }
  } finally {
    if (onlyTabId !== undefined) autoApplyTabOutcomeReporting.delete(onlyTabId);
    autoApplyTabReconciliationRunning = false;
  }
}

// Durable interruption facts are separate from candidate answers and normal
// completion outbox. Only the owner of the original command may replay them.
let interruptionBrowserStartup = false;
let interruptionBrowserSession: Promise<string> | undefined;
const controlledExecutions = new Map<number, {
  record: ControlledExecution; controller: AbortController;
  executionAbort?: AbortController; isControlled: () => boolean;
}>();
function currentInterruptionSession(): Promise<string> {
  return interruptionBrowserSession ??= (async () => {
    const stored = await chrome.storage.session.get(INTERRUPTION_SESSION_KEY);
    const existing = stored[INTERRUPTION_SESSION_KEY];
    if (typeof existing === "string" && existing) return existing;
    const next = crypto.randomUUID();
    await chrome.storage.session.set({ [INTERRUPTION_SESSION_KEY]: next });
    return next;
  })();
}
async function writeControlledExecution(record: ControlledExecution): Promise<void> {
  await autoApplyStorageQueue(INTERRUPTION_JOURNAL_KEY, async () => {
    const stored = await chrome.storage.local.get({ [INTERRUPTION_JOURNAL_KEY]: {} });
    const all = asRecord(stored[INTERRUPTION_JOURNAL_KEY]) ?? {};
    await chrome.storage.local.set({ [INTERRUPTION_JOURNAL_KEY]: { ...all, [record.commandId]: record } });
  });
}
async function forgetControlledExecution(commandId: string): Promise<void> {
  await autoApplyStorageQueue(INTERRUPTION_JOURNAL_KEY, async () => {
    const stored = await chrome.storage.local.get({ [INTERRUPTION_JOURNAL_KEY]: {} });
    const all = asRecord(stored[INTERRUPTION_JOURNAL_KEY]) ?? {};
    delete all[commandId];
    await chrome.storage.local.set({ [INTERRUPTION_JOURNAL_KEY]: all });
  });
}
function interruptControlledExecution(tabId: number, kind: InterruptionKind): void {
  const active = controlledExecutions.get(tabId);
  if (!active || !active.isControlled() || active.controller.signal.aborted || autoApplyTabCloseIntent.has(tabId)) return;
  const error = new AutoApplyUserInterruptedError(kind);
  active.record = { ...active.record, interruptionKind: kind, interruptedAt: new Date().toISOString() };
  // Fence browser primitives synchronously before any storage/HTTP await.
  active.controller.abort(error);
  active.executionAbort?.abort(error);
  void writeControlledExecution(active.record).catch(() => undefined);
}
async function reconcileControlledExecutions(credential: AutoApplyRuntimeCredential): Promise<void> {
  const generation = autoApplyLifecycleGeneration;
  const owner = interruptionOwner(credential);
  const sessionId = await currentInterruptionSession();
  const stored = await chrome.storage.local.get({ [INTERRUPTION_JOURNAL_KEY]: {} });
  for (const value of Object.values(asRecord(stored[INTERRUPTION_JOURNAL_KEY]) ?? {})) {
    const record = value as ControlledExecution;
    if (record?.schemaVersion !== "controlled-execution.v1" || record.owner !== owner ||
      !record.commandId || !Number.isInteger(record.tabId) || controlledExecutions.has(record.tabId)) continue;
    const refsStored = await chrome.storage.local.get({ [autoApplyTabRefsStorageKey]: {} });
    const ref = asRecord(asRecord(refsStored[autoApplyTabRefsStorageKey])?.[autoApplyTabRefKey(record.batchId, record.batchJobId)]);
    if (!ref || ref.commandId !== record.commandId || ref.tabId !== record.tabId) {
      await forgetControlledExecution(record.commandId);
      continue; // Never fail or clear the page session belonging to a newer attempt.
    }
    const pageSession = await recalledAutoApplyPageSession(record.batchId, record.batchJobId, record.jobId, record.applicationUrl);
    if (observedAutoApplyTerminalNavigation(record.tabId, ref, pageSession)) {
      await reconcilePersistedAutoApplyTabs(record.tabId);
      continue; // Registered success receipt wins, even after browser restart.
    }
    // A durable success or human handoff is stronger than an old execution marker.
    if (!pageSession || pageSession.terminalOutcome || pageSession.stage === "waiting_for_user_action" ||
      (pageSession.stage === "failed" && !record.interruptionKind)) {
      await forgetControlledExecution(record.commandId);
      continue;
    }
    const tab = await chrome.tabs.get(record.tabId).catch(() => undefined);
    const kind = recoveredInterruption(record, sessionId, Boolean(tab), interruptionBrowserStartup);
    if (!kind) continue; // Worker restart in the same browser is not a close.
    const interruptedAt = record.interruptedAt ?? new Date().toISOString();
    await writeControlledExecution({ ...record, interruptionKind: kind, interruptedAt });
    if (autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
    await reportAutoApplyBrowserState(credential, {
      batchId: record.batchId, batchJobId: record.batchJobId, jobId: record.jobId,
      commandId: record.commandId, outcome: "user_interrupted", interruptionKind: kind,
      submissionStarted: Boolean(pageSession.submitInitiatedAt),
      pageUrl: record.applicationUrl, observedAt: interruptedAt
    });
    if (autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
    const latestStored = await chrome.storage.local.get({ [autoApplyTabRefsStorageKey]: {} });
    const latestRef = asRecord(asRecord(latestStored[autoApplyTabRefsStorageKey])?.[autoApplyTabRefKey(record.batchId, record.batchJobId)]);
    if (latestRef?.commandId !== record.commandId || latestRef.tabId !== record.tabId) {
      await forgetControlledExecution(record.commandId);
      continue;
    }
    // Replay only the event. Never create/open/activate/reload a tab here.
    await persistAutoApplyPageSession(failAutoApplyPageSession(pageSession));
    await forgetAutoApplyTab(record.batchId, record.batchJobId, record.tabId);
    await forgetControlledExecution(record.commandId);
  }
}

async function markClosedMonitoredTabForReconciliation(tabId: number): Promise<void> {
  // The live command guard owns this close while the current Service Worker is
  // alive. The persistent path below is the restart/crash recovery fallback.
  if (autoApplyActiveSubmissionTabs.has(tabId)) return;
  // If a success readback is already in flight, let that authoritative receipt
  // finish first. Closing after an observed success must not overwrite success.
  for (let attempt = 0; attempt < 20 && autoApplyTabOutcomeReporting.has(tabId); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const stored = await chrome.storage.local.get({
    [autoApplyTabRefsStorageKey]: {},
    [AUTO_APPLY_PAGE_SESSIONS_STORAGE_KEY]: {}
  });
  const refs = asRecord(stored[autoApplyTabRefsStorageKey]) ?? {};
  const sessions = asRecord(stored[AUTO_APPLY_PAGE_SESSIONS_STORAGE_KEY]) ?? {};
  const matching = Object.entries(refs).filter(([, value]) =>
    Number(asRecord(value)?.tabId) === tabId
  );
  for (const [key, value] of matching) {
    const record = asRecord(value);
    if (!record || record.reportedOutcome) continue;
    const session = autoApplyPageSessionFromStored(sessions[key]);
    const pendingOutcome = isRemovedCaptchaWaitingTab(session, tabId)
      ? "captcha_tab_closed" as const
      : isRemovedActiveSubmissionTab(session, tabId)
        ? "submission_active_tab_closed" as const
        : isRemovedSubmissionReceiptTab(session, tabId)
          ? "submission_receipt_tab_closed" as const
          : null;
    if (!pendingOutcome) continue;
    // Merge against the latest ref map so closing an older CAPTCHA page cannot
    // overwrite a newly remembered tab for another job.
    await autoApplyStorageQueue(autoApplyTabRefsStorageKey, async () => {
      const latestStored = await chrome.storage.local.get({ [autoApplyTabRefsStorageKey]: {} });
      const latestRefs = asRecord(latestStored[autoApplyTabRefsStorageKey]) ?? {};
      const latestRecord = asRecord(latestRefs[key]);
      if (!latestRecord || Number(latestRecord.tabId) !== tabId || latestRecord.reportedOutcome) return;
      await chrome.storage.local.set({
        [autoApplyTabRefsStorageKey]: {
          ...latestRefs,
          [key]: {
            ...latestRecord,
            pendingOutcome,
            updatedAt: new Date().toISOString()
          }
        }
      });
    });
  }
  await reconcilePersistedAutoApplyTabs(tabId);
}

async function waitForTabReady(tabId: number, timeoutMs = 30_000): Promise<void> {
  const existing = await chrome.tabs.get(tabId);
  if (existing.status === "complete") return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("招聘页面加载超时"));
    }, timeoutMs);
    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/**
 * Some discovery providers return a public job-detail URL. That page is not a
 * form and its “投递” control is not the final submit boundary. Advance only a
 * registered detail-page driver, then let the normal observation pipeline
 * classify the destination as login/CAPTCHA/form before doing anything else.
 */
interface AutoApplyPageStageSnapshot {
  pageStage: ApplicationPageStage;
  source: AutoApplyPageStageSource;
  observedAt: string;
  observationCount: number;
  waitedMs: number;
}

interface ApplicationPageReadinessResult {
  decision: ApplicationPageReadinessDecision;
  observation: PageObservation;
}

async function waitForApplicationPageReadiness(
  tabId: number,
  applicationUrl: string,
  input: {
    recordPageStage?: (snapshot: AutoApplyPageStageSnapshot) => Promise<void>;
    terminalStages?: ApplicationPageStage[];
    allowRegisteredApplicationChoice?: boolean;
  } = {}
): Promise<ApplicationPageReadinessResult> {
  const startedAt = Date.now();
  let state: ApplicationPageReadinessState | null = null;
  let lastRecordedStage: ApplicationPageStage | null = null;
  let latest: PageObservation | undefined;
  while (true) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) {
      const closeIntent = autoApplyTabCloseIntent.get(tabId);
      throw new Error(closeIntent
        ? `等待申请页渲染时标签页已由插件关闭（原因：${closeIntent}，tabId：${tabId}）`
        : `等待申请页渲染时标签页被外部关闭（未发现插件关闭意图，tabId：${tabId}）`);
    }
    const fallbackRegistration = resolveApplicationPageReadinessRegistration(tab.url || applicationUrl);
    if (!fallbackRegistration) throw new Error("当前页面不支持自动投递页面阶段识别");
    const pageObservation = await executeInterruptibleScript({
      target: { tabId },
      func: observeApplicationPage,
      args: [submissionActionPatterns]
    }).then((results) => results[0]?.result as PageObservation | undefined).catch(() => undefined);
    if (!pageObservation) {
      if (Date.now() - startedAt >= fallbackRegistration.waitTimeoutMs) {
        throw new Error("无法在30秒内读取当前页面并识别页面阶段，已停止自动投递");
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }
    latest = pageObservation;
    const registration = resolveApplicationPageReadinessRegistration(
      pageObservation.url || tab.url || applicationUrl
    );
    if (!registration) throw new Error("当前页面不支持自动投递页面阶段识别");
    const effectiveRegistration = input.terminalStages
      ? { ...registration, resolvedStages: input.allowRegisteredApplicationChoice && pageObservation.applicationEntry
        ? [...input.terminalStages, "job_detail" as const] : input.terminalStages }
      : registration;
    const waitedMs = Date.now() - startedAt;
    const decision = advanceApplicationPageReadiness(state, {
      loginRequired: pageObservation.loginRequired,
      formDetected: pageObservation.formDetected,
      deterministicStage: pageObservation.pageStage,
      transitionKey: `${pageObservation.url}:${pageObservation.pageStateFingerprint}`,
      stableFormKey: `${pageObservation.url}:application_form:${pageObservation.fingerprint}`
    }, waitedMs, effectiveRegistration);
    state = decision;
    if (lastRecordedStage !== decision.pageStage || decision.status !== "waiting") {
      await input.recordPageStage?.({
        pageStage: decision.pageStage,
        source: "deterministic",
        observedAt: new Date().toISOString(),
        observationCount: decision.observationCount,
        waitedMs: decision.waitedMs
      });
      lastRecordedStage = decision.pageStage;
    }
    if (decision.status !== "waiting") return { decision, observation: latest };
    await new Promise((resolve) => setTimeout(resolve, effectiveRegistration.pollIntervalMs));
  }
}

async function advanceAutoApplyApplicationEntry(
  tabId: number,
  input: {
    recordPageStage?: (snapshot: AutoApplyPageStageSnapshot) => Promise<void>;
  } = {}
): Promise<boolean> {
  return withBackgroundTabEntrySurface(chrome.debugger, tabId, (send) =>
    advanceAutoApplyApplicationEntryInBackground(tabId, input, send));
}

async function advanceAutoApplyApplicationEntryInBackground(
  tabId: number,
  input: { recordPageStage?: (snapshot: AutoApplyPageStageSnapshot) => Promise<void> },
  entrySender: CdpCommandSender
): Promise<boolean> {
  const before = await chrome.tabs.get(tabId);
  const beforeUrl = before.url ?? "";
  const readiness = await waitForApplicationPageReadiness(
    tabId,
    beforeUrl,
    { recordPageStage: input.recordPageStage }
  );
  if (readiness.decision.status === "timed_out") {
    if (readiness.observation.unavailableReason) {
      throw new Error(`application_page_unavailable: ${readiness.observation.unavailableReason === "explicit_unavailable"
        ? "招聘网站明确标记该岗位页面已关停或下线"
        : "Moka 申请路由加载完成后仍只有空站点外壳，没有岗位或申请表"}`);
    }
    throw new Error(`无法在30秒内识别当前页面阶段（当前：${readiness.decision.pageStage}），已停止自动投递`);
  }
  if (readiness.decision.pageStage === "login" ||
    readiness.decision.pageStage === "application_form") return false;
  if (readiness.decision.pageStage !== "job_detail") {
    throw new Error("当前页面不是稳定的职位详情页、登录页或填表页，已停止自动投递");
  }
  if (readiness.observation.applicationEntry) {
    return advanceRegisteredApplicationChoice(tabId, readiness.observation, input, entrySender);
  }
  const detailUrl = readiness.observation.url || beforeUrl;
  const xiaopengDetail = isXiaopengJobDetailUrl(detailUrl);
  const mokaDetail = isMokaJobDetailUrl(detailUrl);
  const feishuDetail = isFeishuJobDetailUrl(detailUrl);
  const taggedProbe = !xiaopengDetail && !mokaDetail && !feishuDetail
    ? await executeInterruptibleScript({
      target: { tabId }, func: openTalentBrewApplicationFromDetailPage, args: [{ probeOnly: true }]
    }) : null;
  const taggedDetail = taggedProbe?.[0]?.result?.matched === true;
  const execution = xiaopengDetail
    ? await executeInterruptibleScript({
      target: { tabId },
      func: openXiaopengApplicationFromDetailPage,
      args: [{ waitTimeoutMs: 30_000, pollIntervalMs: 100 }]
    })
    : mokaDetail
      ? await executeInterruptibleScript({
        target: { tabId },
        func: openMokaApplicationFromDetailPage,
        args: [{ waitTimeoutMs: 30_000, pollIntervalMs: 100 }]
      })
      : feishuDetail
        ? await executeInterruptibleScript({
          target: { tabId },
          func: openFeishuApplicationFromDetailPage,
          args: [{ waitTimeoutMs: 30_000, pollIntervalMs: 100, deferClick: true }]
        })
      : taggedDetail
        ? await executeInterruptibleScript({
          target: { tabId }, func: openTalentBrewApplicationFromDetailPage,
          args: [{ waitTimeoutMs: 30_000, pollIntervalMs: 100 }]
        })
      : await executeInterruptibleScript({
      target: { tabId },
      func: openGenericApplicationFromDetailPage,
      args: [{ scrollSteps: 5, settleMs: 200, deferClick: true }]
      });
  let navigation: TalentBrewEntryResult | undefined = execution[0]?.result;
  if (!navigation?.matched) {
    throw new Error(navigation?.error || "职位详情页未识别到唯一投递入口，已停止自动投递");
  }
  if (!navigation.clicked && !navigation.error && navigation.actionText) {
    if (mokaDetail && !navigation.entryTarget) throw new Error("Moka职位入口缺少已登记控件身份，已停止自动点击");
    if (taggedDetail && !navigation.taggedTarget) throw new Error("职位入口缺少完整岗位归属，已停止自动点击");
    const trustedClick = await activateApplicationEntryWithTrustedPointer(
      tabId,
      detailUrl,
      mokaDetail
        ? {
          kind: navigation.entryTarget!,
          text: navigation.actionText
        }
        : taggedDetail
          ? navigation.taggedTarget!
        : feishuDetail
          ? { kind: "feishu_primary_apply", text: navigation.actionText }
          : { kind: "unique_text", text: navigation.actionText },
      entrySender
    );
    navigation = { ...navigation, clicked: trustedClick };
  }
  if (!navigation.clicked) {
    throw new Error(navigation.error || "职位详情页未能打开投递入口");
  }
  let destination = await waitForApplicationPageReadiness(tabId, detailUrl, {
    recordPageStage: input.recordPageStage,
    terminalStages: ["login", "application_form"],
    allowRegisteredApplicationChoice: true
  });
  if (destination.decision.status === "resolved") {
    if (destination.observation.applicationEntry) {
      return advanceRegisteredApplicationChoice(tabId, destination.observation, input, entrySender);
    }
    return true;
  }
  throw new Error("职位详情页已点击投递入口，但30秒内没有稳定进入登录页或申请表");
}

async function advanceRegisteredApplicationChoice(
  tabId: number, page: PageObservation,
  input: { recordPageStage?: (snapshot: AutoApplyPageStageSnapshot) => Promise<void> },
  send: CdpCommandSender
): Promise<boolean> {
  const entry = page.applicationEntry;
  if (page.pageStage !== "job_detail" || !entry || entry.registrationId !== "workday.manual-application-entry.v1") {
    throw new Error("未识别到已登记的申请方式入口");
  }
  const clicked = await activateApplicationEntryWithTrustedPointer(tabId, page.url,
    { kind: "workday_manual_choice", ...entry }, send);
  if (!clicked) throw new Error("已登记的手动申请入口未能完成可信点击");
  // One additional registered choice only; do not loop across entry pages or
  // select resume parsing, a previous application, or a login provider.
  const destination = await waitForApplicationPageReadiness(tabId, page.url, {
    recordPageStage: input.recordPageStage, terminalStages: ["login", "application_form"]
  });
  if (destination.decision.status === "resolved") return true;
  throw new Error("手动申请入口已点击，但30秒内没有稳定进入登录页或申请表");
}

/**
 * A generic detail page may expose an entry that ignores a synthetic DOM
 * click when Chrome runs the task in a background tab. This helper receives
 * only an entry that the generic driver has already proved unique, then
 * rechecks the exact URL and control immediately before issuing one browser-
 * trusted pointer sequence. It never activates the recruiting tab, falls
 * back to another control, or operates a final-submit action.
 */
type TrustedApplicationEntryTarget = {
  kind: "unique_text" | MokaApplicationEntryTarget | "feishu_primary_apply";
  text: string;
} | TalentBrewEntryTarget | ({ kind: "workday_manual_choice" } & NonNullable<PageObservation["applicationEntry"]>);

async function activateApplicationEntryWithTrustedPointer(
  tabId: number,
  expectedUrl: string,
  expectedTarget: TrustedApplicationEntryTarget,
  sendDebuggerCommand: CdpCommandSender
): Promise<boolean> {
  try {
    if (expectedTarget.kind === "workday_manual_choice") {
      const page = await executeInterruptibleScript({ target: { tabId },
        func: observeApplicationPage, args: [submissionActionPatterns] }).then(results => results[0]?.result);
      const entry = page?.applicationEntry;
      if (page?.url !== expectedUrl || page.pageStage !== "job_detail" || !entry ||
        entry.registrationId !== expectedTarget.registrationId || entry.selector !== expectedTarget.selector ||
        entry.href !== expectedTarget.href || entry.text !== expectedTarget.text) return false;
      const geometry = await executeInterruptibleScript({ target: { tabId },
        func: (url: string, target: NonNullable<PageObservation["applicationEntry"]>) => {
          if (location.href !== url) return null;
          const matches = [...document.querySelectorAll<HTMLAnchorElement>(target.selector)];
          if (matches.length !== 1) return null;
          const element = matches[0]!;
          if (element.tagName !== "A" || element.getAttribute("role") !== "button" ||
            element.dataset.automationId !== "applyManually" || element.href !== target.href ||
            element.textContent?.replace(/\s+/g, " ").trim() !== target.text ||
            !element.closest("main") || element.closest("form,[hidden],[aria-hidden='true'],[aria-disabled='true'],[inert]")) return null;
          element.scrollIntoView({ block: "center", inline: "nearest" });
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.left + Math.min(24, rect.width / 2), rect.top + Math.min(12, rect.height / 2));
          return { left: rect.left, top: rect.top, width: rect.width, height: rect.height,
            viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
            hitInsideTarget: Boolean(hit && (hit === element || element.contains(hit))) };
        }, args: [expectedUrl, entry]
      }).then(results => results[0]?.result);
      const point = geometry && trustedPointerViewportPoint(geometry);
      if (!point) return false;
      await dispatchTrustedPointerClick(sendDebuggerCommand, point);
      return true;
    }
    // Rendering and clicking share the caller's focus-emulation lease for all
    // sites. No second debugger attachment or per-site visibility strategy.
    await new Promise((resolve) => setTimeout(resolve, 180));
    const mokaKind = expectedTarget.kind !== "unique_text" && expectedTarget.kind !== "feishu_primary_apply" &&
      expectedTarget.kind !== "talentbrew_job_pair"
      ? expectedTarget.kind : null;
    const mokaExecution = mokaKind ? await executeInterruptibleScript({
      target: { tabId },
      func: openMokaApplicationFromDetailPage,
      args: [{ expectedTarget: { url: expectedUrl, kind: mokaKind } }]
    }) : null;
    const taggedExecution = expectedTarget.kind === "talentbrew_job_pair"
      ? await executeInterruptibleScript({
        target: { tabId }, func: openTalentBrewApplicationFromDetailPage,
        args: [{ expectedTarget: { url: expectedUrl, target: expectedTarget } }]
      }) : null;
    const execution = mokaKind || taggedExecution ? null : await executeInterruptibleScript({
      target: { tabId },
      func: (url: string, target: TrustedApplicationEntryTarget) => {
        const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
        if (location.href !== url) return null;
        const visible = (element: HTMLElement) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" &&
            rect.width > 0 && rect.height > 0 && !element.closest("[hidden],[aria-hidden='true']");
        };
        const controls = [...document.querySelectorAll<HTMLElement>(
          "button,[role='button'],a[href],input[type='button'],input[type='submit']"
        )].filter((element) => visible(element) && !element.matches(":disabled,[aria-disabled='true']"));
        const matches = controls.filter((element) => normalize(
          element instanceof HTMLInputElement
            ? element.value
            : element.innerText || element.getAttribute("aria-label")
        ) === target.text);
        const element = target.kind === "unique_text"
          ? matches.length === 1 ? matches[0]! : null
          : (() => {
              const detailPaths = [
                /^\/(?:[^/]+\/)?position\/[^/]+\/detail\/?$/i,
                /^\/(?:[^/]+\/)?position\/detail\/[^/]+\/?$/i
              ];
              if (!/(?:^|\.)jobs\.feishu\.cn$/i.test(location.hostname) ||
                !detailPaths.some((pattern) => pattern.test(location.pathname))) return null;
              const primary = matches.filter((candidate) => candidate instanceof HTMLButtonElement &&
                candidate.type === "button" &&
                String(candidate.className || "").includes("apply-block-applyBtn"));
              return primary.length === 1 ? primary[0]! : matches.length === 1 ? matches[0]! : null;
            })();
        if (!element) return null;
        element.scrollIntoView({ block: "center", inline: "nearest" });
        const rect = element.getBoundingClientRect();
        const x = rect.left + Math.min(24, rect.width / 2);
        const y = rect.top + Math.min(12, rect.height / 2);
        const hit = document.elementFromPoint(x, y);
        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          hitInsideTarget: Boolean(hit && (hit === element || element.contains(hit)))
        };
      },
      args: [expectedUrl, expectedTarget]
    });
    const mokaResult = mokaExecution?.[0]?.result;
    const taggedResult = taggedExecution?.[0]?.result;
    const geometry = mokaKind ? (mokaResult?.error ? null : mokaResult?.trustedTarget)
      : taggedExecution ? (taggedResult?.error ? null : taggedResult?.trustedTarget) : execution?.[0]?.result;
    const point = trustedPointerViewportPoint(geometry ?? {
      left: Number.NaN,
      top: Number.NaN,
      width: Number.NaN,
      height: Number.NaN,
      viewportWidth: Number.NaN,
      viewportHeight: Number.NaN,
      hitInsideTarget: false
    });
    if (!point) return false;
    await dispatchTrustedPointerClick(sendDebuggerCommand, point);
    return true;
  } catch {
    return false;
  }
}

async function renderAutoApplyOverlay(
  tabId: number,
  input: { batchId: string; companyName: string; title: string; status: string }
): Promise<void> {
  await executeInterruptibleScript({
    target: { tabId },
    func: (view) => {
      const id = "__recruiting_ai_auto_apply_status__";
      document.getElementById(id)?.remove();
      const host = document.createElement("div");
      host.id = id;
      host.style.cssText = "all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
      const shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML = `
        <style>
          .bar{width:300px;background:#111827;color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:12px 14px;box-shadow:0 12px 32px rgba(0,0,0,.28)}
          .status{font-size:12px;color:#93c5fd;margin-bottom:5px}.job{font-size:13px;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          .actions{display:flex;gap:8px;margin-top:10px}button{border:0;border-radius:8px;padding:7px 12px;cursor:pointer;font-size:12px;background:#374151;color:#fff}button[data-action='cancel']{background:#7f1d1d}
        </style>
        <div class="bar">
          <div class="status"></div><div class="job"></div>
          <div class="actions"><button data-action="pause">暂停</button><button data-action="cancel">终止</button></div>
        </div>`;
      const status = shadow.querySelector<HTMLElement>(".status");
      const job = shadow.querySelector<HTMLElement>(".job");
      if (status) status.textContent = view.status;
      if (job) job.textContent = `${view.companyName} · ${view.title}`;
      shadow.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
        button.addEventListener("click", () => {
          const action = button.dataset.action === "pause"
            ? "pause"
            : button.dataset.action === "resume" ? "resume" : "cancel";
          void chrome.runtime.sendMessage({
            type: "AUTO_APPLY_LOCAL_CONTROL",
            batchId: view.batchId,
            action
          });
          if (action === "pause") {
            button.dataset.action = "resume";
            button.textContent = "继续";
          }
        });
      });
      document.documentElement.append(host);
    },
    args: [input]
  });
}

async function removeAutoApplyOverlay(tabId: number): Promise<boolean> {
  const execution = await executeInterruptibleScript({
    target: { tabId },
    func: () => {
      document.getElementById("__recruiting_ai_auto_apply_status__")?.remove();
      return !document.getElementById("__recruiting_ai_auto_apply_status__");
    }
  }).catch(() => []);
  return execution[0]?.result === true;
}

async function enforceAutoApplyControl(
  credential: AutoApplyRuntimeCredential,
  command: AiPluginCommand,
  batchId: string,
  tabId: number,
  job: { companyName: string; title: string },
  localValidation = false
): Promise<void> {
  assertAutoApplyCommandActive(command);
  if (localValidation) {
    await renderAutoApplyOverlay(tabId, { ...job, batchId, status: "正在自动填写" });
    return;
  }
  let action = localAutoApplyControl.get(batchId) ?? await autoApplyControl(credential, batchId);
  if (action === "cancel") throw new AutoApplyCancelledError();
  while (action === "pause") {
    assertAutoApplyCommandActive(command);
    await renderAutoApplyOverlay(tabId, { ...job, batchId, status: "已暂停" });
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    action = localAutoApplyControl.get(batchId) ?? await autoApplyControl(credential, batchId);
    if (action === "cancel") throw new AutoApplyCancelledError();
  }
  await renderAutoApplyOverlay(tabId, { ...job, batchId, status: "正在自动填写" });
}

async function candidatePackageFromFileRef(
  candidate: Record<string, unknown>,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const packageRef = String(candidate.packageRef ?? "");
  if (!/^https?:\/\//i.test(packageRef)) throw new Error("信息包 packageRef 必须是短期 HTTP(S) 下载地址");
  const text = await boundedFetch(
    packageRef,
    { cache: "no-store" },
    15_000,
    signal,
    async (response) => {
      if (!response.ok) throw new Error(`下载信息包失败：HTTP ${response.status}`);
      return response.text();
    }
  );
  const expectedSha256 = String(candidate.packageSha256 ?? "").toLowerCase();
  if (expectedSha256 && await sha256Hex(text) !== expectedSha256) throw new Error("信息包 SHA-256 校验失败");
  const payload = asRecord(JSON.parse(text));
  if (!payload) throw new Error("信息包不是 JSON 对象");
  return payload;
}

async function redactedEvidence(tabId: number): Promise<{ screenshotRef: string | null; screenshotDataUrl?: string }> {
  await executeInterruptibleScript({
    target: { tabId },
    func: () => {
      const id = "__recruiting_ai_evidence_redaction__";
      document.getElementById(id)?.remove();
      const style = document.createElement("style");
      style.id = id;
      style.textContent = `
        input,textarea,select,[contenteditable='true'],[class*='avatar'],[class*='account'],[class*='user-info'],[class*='file-name']{
          color:transparent!important;text-shadow:none!important;background:#111!important;border-color:#111!important
        }
      `;
      document.documentElement.append(style);
    }
  });
  const screenshotDataUrl = await captureApplicationScreenshot(tabId);
  await executeInterruptibleScript({
    target: { tabId },
    func: () => document.getElementById("__recruiting_ai_evidence_redaction__")?.remove()
  }).catch(() => undefined);
  return screenshotDataUrl
    ? { screenshotRef: `sha256:${await sha256Hex(screenshotDataUrl)}`, screenshotDataUrl }
    : { screenshotRef: null };
}

function batchResultEvent(
  command: AiPluginCommand,
  input: {
    batchId: string;
    batchJobId: string;
    jobId: string;
    status: string;
    reasonCode?: string | null;
    evidence?: Record<string, unknown> | null;
  }
): AiPluginEvent {
  return aiBridgeEvent(command, "browser.batch_auto_apply_job_completed", "completed", {
    autoApplyResult: {
      schemaVersion: "auto-apply-job-result.v1",
      batchId: input.batchId,
      batchJobId: input.batchJobId,
      jobId: input.jobId,
      status: input.status,
      occurredAt: new Date().toISOString(),
      reasonCode: input.reasonCode ?? null,
      evidence: input.evidence ?? null
    }
  });
}

function autoApplyFailureStatus(error: unknown): { status: string; reasonCode: string } {
  if (error instanceof AutoApplyJobStoppedError) return { status: "cancelled", reasonCode: "job_cancelled" };
  if (error instanceof AutoApplyUserInterruptedError) return { status: "failed", reasonCode: "user_interrupted" };
  if (error instanceof AutoApplyCancelledError) return { status: "cancelled", reasonCode: "batch_cancelled" };
  if (error instanceof AutoApplyCommandExpiredError) {
    return { status: "failed", reasonCode: "task_execution_timeout" };
  }
  if (error instanceof AutoApplyDeviceRequestTimeoutError) {
    return { status: "failed", reasonCode: "transport_failed" };
  }
  if (error instanceof AutoApplyUserActionRequiredError) {
    const outcome = autoApplyUserActionOutcome(error.actionType);
    return { status: outcome.status, reasonCode: outcome.reasonCode };
  }
  const publicError = toPublicError(error);
  if (publicError.details?.failureCode === "supplemental_control_unresolved") {
    const issue = Array.isArray(publicError.details.supplementalInputErrors)
      ? publicError.details.supplementalInputErrors[0] as Record<string, unknown> | undefined : undefined;
    const reasonCode = ["supplemental_control_unresolved", "supplemental_options_unavailable", "supplemental_input_contract_invalid"]
      .find(code => code === issue?.code) ?? "supplemental_control_unresolved";
    return { status: "failed", reasonCode };
  }
  if (publicError.details?.reasonCode === "control_interaction_failed") {
    return { status: "failed", reasonCode: "control_interaction_failed" };
  }
  if (publicError.details?.reasonCode === "supplemental_answer_binding_failed") {
    return { status: "failed", reasonCode: "supplemental_answer_binding_failed" };
  }
  if (publicError.details?.reasonCode === "field_fill_readback_failed") {
    return { status: "failed", reasonCode: "field_fill_readback_failed" };
  }
  if (isUnsupportedRequiredControlFailure(publicError.message)) {
    return { status: "failed", reasonCode: "unsupported_required_control" };
  }
  if (isDateControlInteractionFailure(publicError.message)) {
    return { status: "failed", reasonCode: "date_control_interaction_failed" };
  }
  if (isMokaLocationInteractionFailure(publicError.message)) {
    return { status: "failed", reasonCode: "location_control_interaction_failed" };
  }
  if (isMokaRecruitingSourceInteractionFailure(publicError.message)) {
    return { status: "failed", reasonCode: "recruiting_source_control_interaction_failed" };
  }
  if (isMokaFlatSelectInteractionFailure(publicError.message)) {
    return { status: "failed", reasonCode: "control_interaction_failed" };
  }
  if (publicError.code === "LOGIN_REQUIRED") return { status: "failed", reasonCode: "login_required" };
  if (publicError.code === "MISSING_INFORMATION" && hasMokaLocationOptionUnavailableDetails(publicError.details)) {
    return { status: "failed", reasonCode: "location_option_unavailable" };
  }
  if (publicError.code === "MISSING_INFORMATION" && hasMokaLocationSelectionUnconfirmedDetails(publicError.details)) {
    return { status: "failed", reasonCode: "location_selection_unconfirmed" };
  }
  if (publicError.code === "SITE_VALIDATION_BLOCKED" && hasRequiredControlUnconfirmedDetails(publicError.details)) {
    return { status: "failed", reasonCode: "required_control_unconfirmed" };
  }
  if (publicError.code === "MISSING_INFORMATION") return { status: "skipped_missing_information", reasonCode: "missing_information" };
  if (publicError.code === "APPROVAL_EXPIRED" && /fileRef|packageRef|信息包|附件/i.test(publicError.message)) {
    return { status: "failed", reasonCode: "asset_expired" };
  }
  if (publicError.code === "IDENTITY_FIELD_READBACK_MISMATCH") return { status: "failed", reasonCode: "identity_field_readback_mismatch" };
  if (publicError.code === "REQUIRED_DEGREE_MISSING") return { status: "failed", reasonCode: "required_degree_missing" };
  if (publicError.code === "REQUIRED_DECLARATION_UNCHECKED") return { status: "failed", reasonCode: "required_declaration_unchecked" };
  if (publicError.code === "SITE_VALIDATION_BLOCKED") return { status: "failed", reasonCode: "site_validation_blocked" };
  if (publicError.code === "PREVIEW_SUBMIT_NOT_OPENED") return { status: "failed", reasonCode: "preview_submit_not_opened" };
  if (publicError.code === "CONFIRMATION_SUBMIT_NOT_EXECUTED") return { status: "failed", reasonCode: "confirmation_submit_not_executed" };
  if (publicError.code === "SITE_SUCCESS_NOT_OBSERVED") return { status: "failed", reasonCode: "site_success_not_observed" };
  const message = error instanceof Error ? error.message : String(publicError.message ?? "");
  if (/fileRef 已过期|packageRef.{0,20}过期|信息包.{0,20}过期|附件.{0,20}过期/i.test(message)) {
    return { status: "failed", reasonCode: "asset_expired" };
  }
  if (/下载 (?:fileRef|信息包) 失败|下载附件失败|SHA-256 校验失败|packageRef 必须|fileRef.{0,20}(?:失败|不支持)/i.test(message)) {
    return { status: "failed", reasonCode: "asset_download_failed" };
  }
  if (/真实性声明|真实有效|声明/.test(message)) return { status: "failed", reasonCode: "required_declaration_unchecked" };
  if (/最高学历|学历|学位/.test(message)) {
    return {
      status: "failed",
      reasonCode: classifyVisualFailureReason(visualFailureDetails(message))
    };
  }
  if (/(姓名|邮箱|手机|电话).*回读|回读不一致.*(姓名|邮箱|手机|电话)/.test(message)) {
    return { status: "failed", reasonCode: "identity_field_readback_mismatch" };
  }
  if (/站点校验|页面验证|必填未完成/.test(message)) return { status: "failed", reasonCode: "site_validation_blocked" };
  if (/招聘页面加载超时/.test(message)) return { status: "failed", reasonCode: "transport_failed" };
  if (/application_page_unavailable:/.test(message)) {
    return { status: "failed", reasonCode: "application_page_unavailable" };
  }
  if (/职位详情页.*(?:投递(?:入口|流程)|登录页|申请表|识别失败|页面阶段)|无法在30秒内(?:读取当前页面并)?识别当前页面阶段|无法确认当前页面是申请表/.test(message)) {
    return { status: "failed", reasonCode: "application_entry_not_opened" };
  }
  if (/最终提交按钮/.test(message)) return { status: "failed", reasonCode: "preview_submit_not_opened" };
  if (/二次确认/.test(message)) return { status: "failed", reasonCode: "confirmation_submit_not_executed" };
  if (error instanceof Error && /最终提交结果不明确/.test(error.message)) {
    return { status: "failed", reasonCode: "site_success_not_observed" };
  }
  if (error instanceof Error && /批次最终提交授权/.test(error.message)) {
    return { status: "failed", reasonCode: "batch_authorization_invalid" };
  }
  return { status: "failed", reasonCode: String(publicError.code || "execution_failed").toLowerCase() };
}

function hasMokaLocationOptionUnavailableDetails(details: Record<string, unknown> | undefined): boolean {
  const optionUnavailable = details?.optionUnavailable;
  if (!optionUnavailable || typeof optionUnavailable !== "object" || Array.isArray(optionUnavailable)) return false;
  const source = (optionUnavailable as Record<string, unknown>).source;
  const fieldName = (optionUnavailable as Record<string, unknown>).fieldName;
  return source === "live_moka_popup" && /意向.*城市|期望.*城市|preferred.?city|preferred.?location/i.test(
    String(fieldName ?? "")
  );
}

function hasMokaLocationSelectionUnconfirmedDetails(details: Record<string, unknown> | undefined): boolean {
  const unconfirmed = details?.locationSelectionUnconfirmed;
  if (!unconfirmed || typeof unconfirmed !== "object" || Array.isArray(unconfirmed)) return false;
  const source = (unconfirmed as Record<string, unknown>).source;
  const fieldName = (unconfirmed as Record<string, unknown>).fieldName;
  return source === "live_moka_page" && /意向.*城市|期望.*城市|preferred.?city|preferred.?location/i.test(
    String(fieldName ?? "")
  );
}

function hasRequiredControlUnconfirmedDetails(details: Record<string, unknown> | undefined): boolean {
  const unconfirmed = details?.requiredControlUnconfirmed;
  if (!unconfirmed || typeof unconfirmed !== "object" || Array.isArray(unconfirmed)) return false;
  return (unconfirmed as Record<string, unknown>).source === "post_fill_validation" &&
    Array.isArray((unconfirmed as Record<string, unknown>).fields) &&
    (unconfirmed as Record<string, unknown>).fields.length > 0;
}

function requiredControlUnconfirmedLabels(details: Record<string, unknown> | undefined): string[] {
  const unconfirmed = details?.requiredControlUnconfirmed;
  if (!unconfirmed || typeof unconfirmed !== "object" || Array.isArray(unconfirmed)) return [];
  const fields = (unconfirmed as Record<string, unknown>).fields;
  if (!Array.isArray(fields)) return [];
  return [...new Set(fields.flatMap((field) => {
    if (!field || typeof field !== "object" || Array.isArray(field)) return [];
    const label = (field as Record<string, unknown>).fieldName;
    return typeof label === "string" && label.trim() ? [label.trim().slice(0, 80)] : [];
  }))].slice(0, 8);
}

type AutoApplyDiagnostic = {
  code: string;
  category: "human_action" | "candidate_data" | "asset" | "page" | "site_validation" | "model" |
    "transport" | "authorization" | "unsupported" | "cancelled" | "unknown";
  stage: "preflight" | "login" | "asset_download" | "form_observation" | "form_fill" | "readback" |
    "submit" | "success_verification" | "transport" | "unknown";
  userMessage: string;
  developerMessage: string;
  retryable: boolean;
  recommendedAction: "prompt_user_then_resume" | "request_candidate_information" |
    "refresh_asset_and_recreate_batch" | "retry_job" | "update_plugin" | "inspect_evidence" |
    "skip_job" | "cancel_batch" | "none";
};

function autoApplyDiagnostic(
  reasonCode: string,
  failureDetails?: Record<string, unknown>
): AutoApplyDiagnostic {
  if (reasonCode === "user_interrupted") return interruptionDiagnostic(
    failureDetails?.interruptionKind as InterruptionKind ?? "execution_session_ended",
    failureDetails?.submissionStarted === true
  );
  const unconfirmedLabels = requiredControlUnconfirmedLabels(failureDetails);
  if (["supplemental_control_unresolved", "supplemental_options_unavailable", "supplemental_input_contract_invalid"].includes(reasonCode)) {
    const labels = (Array.isArray(failureDetails?.blockedControls)
      ? failureDetails.blockedControls.map(field => String((field as Record<string, unknown>)?.label || "页面字段")).join("、")
      : "页面字段").slice(0, 200);
    const problem = reasonCode === "supplemental_options_unavailable" ? "可选项未能读取" :
      reasonCode === "supplemental_input_contract_invalid" ? "填写要求存在冲突" : "填写控件未能正确识别";
    return { code: reasonCode, category: "unsupported", stage: "form_observation",
      userMessage: `“${labels}”的${problem}，无法提供补充入口。本次投递已停止，请反馈此问题。`,
      developerMessage: "完整字段要求和未识别控件保留在诊断中；不能交给用户补充一个无法填写的字段。",
      retryable: false, recommendedAction: "inspect_evidence" };
  }
  const known: Record<string, Omit<AutoApplyDiagnostic, "code">> = {
    field_fill_readback_failed: {
      category: "page", stage: "form_fill",
      userMessage: `“${String(failureDetails?.fieldLabel || "页面字段").slice(0, 80)}”填写后回读失败，当前岗位未提交，已保留原页面。`,
      developerMessage: "已知答案的执行结果或字段身份未通过回读；已停止，不调用模型掩盖原错误，不刷新或重填。",
      retryable: false, recommendedAction: "inspect_evidence"
    },
    supplemental_answer_binding_failed: {
      category: "page", stage: "form_observation",
      userMessage: "已收到补充答案，但系统无法确认它对应的页面字段；当前岗位未提交，请勿重复补填。",
      developerMessage: "补充字段身份或重复条目存在冲突，已停止执行；这是答案关联错误，不是候选人缺少信息。",
      retryable: false, recommendedAction: "inspect_evidence"
    },
    login_required: {
      category: "human_action", stage: "login",
      userMessage: "招聘网站需要用户登录，请在保留的招聘页面登录后重新投递。",
      developerMessage: "检测到登录表单或登录态缺失；当前岗位已按投递失败结束，原因是 login_required。",
      retryable: true, recommendedAction: "retry_job"
    },
    captcha_required: {
      category: "human_action", stage: "submit",
      userMessage: "招聘网站要求完成安全验证码，请在保留的投递页面操作。",
      developerMessage: "检测到滑块、图形、短信或站点安全验证码；岗位进入 waiting_for_user_action/captcha_required，原标签页由后台监控且不占用后续岗位执行槽。",
      retryable: true, recommendedAction: "prompt_user_then_resume"
    },
    identity_verification_required: {
      category: "human_action", stage: "submit",
      userMessage: "当前招聘页面需要完成人脸、实名或身份核验。",
      developerMessage: "检测到必须由用户本人完成的身份核验；任务已暂停并保留原岗位标签页。",
      retryable: true, recommendedAction: "prompt_user_then_resume"
    },
    application_page_unavailable: {
      category: "page", stage: "form_observation",
      userMessage: "原招聘申请页面已不可用，当前岗位已停止。",
      developerMessage: "人工处理期间原任务标签页丢失；插件不会刷新、重开或重新填写申请表。",
      retryable: false, recommendedAction: "inspect_evidence"
    },
    location_control_interaction_failed: {
      category: "site_validation", stage: "form_fill",
      userMessage: "招聘页面的地点控件未能形成唯一、可验证的选中结果。",
      developerMessage: "站点地点专用 Driver 在检测、打开、级联选择、确认或回读阶段失败；未执行其他 Driver 或重试兜底。",
      retryable: false, recommendedAction: "inspect_evidence"
    },
    location_option_unavailable: {
      category: "human_action", stage: "form_fill",
      userMessage: "招聘页面不接受当前意向城市。请在 AiOffer 中从返回的可选城市确认一项后重新投递。",
      developerMessage: "Moka 地点 Driver 已打开唯一弹层并读取到实时城市选项，但未找到信息包中的目标城市；字段保持不变，插件不会猜测或选择替代城市。",
      retryable: true, recommendedAction: "prompt_user_then_resume"
    },
    location_selection_unconfirmed: {
      category: "site_validation", stage: "form_fill",
      userMessage: "插件未能完成意向工作城市的站点选择与回读，当前岗位未提交。",
      developerMessage: "Moka 城市控件填写后的页面回读不一致；任务已在最终提交前停止，原页面必须保留，不能将该字段当作可选字段跳过。",
      retryable: false, recommendedAction: "inspect_evidence"
    },
    required_control_unconfirmed: {
      category: "human_action", stage: "readback",
      userMessage: unconfirmedLabels.length
        ? `插件已完成填写，但招聘网站仍未确认以下必填项：${unconfirmedLabels.join("、")}。请在保留的招聘页面重新选择对应字段，并确认红色校验提示消失后再重新投递。`
        : "插件已完成填写，但招聘网站仍未确认部分必填选择。请在保留的招聘页面重新选择对应字段，并确认红色校验提示消失后再重新投递。",
      developerMessage: "最终提交前已执行一次安全失焦和全量回读；至少一个必填控件显示有值但字段级校验仍未清除。具体字段及站点提示位于 failureDetails.requiredControlUnconfirmed。",
      retryable: true, recommendedAction: "prompt_user_then_resume"
    },
    recruiting_source_control_interaction_failed: {
      category: "site_validation", stage: "form_fill",
      userMessage: "招聘页面的信息来源控件未能形成站点已接受的选中结果。",
      developerMessage: "Moka 招聘信息来源专用 Driver 在打开、选项选择、失焦提交或回读阶段失败；未执行其他 Driver 或重试兜底。",
      retryable: false, recommendedAction: "inspect_evidence"
    },
    missing_information: {
      category: "candidate_data", stage: "form_fill",
      userMessage: "候选人信息包缺少招聘页面要求的必填信息。",
      developerMessage: "必填字段无法从标准信息包或附件中取得，当前岗位未提交。",
      retryable: false, recommendedAction: "request_candidate_information"
    },
    asset_expired: {
      category: "asset", stage: "asset_download",
      userMessage: "简历或信息包下载地址已过期，需要重新生成投递批次。",
      developerMessage: "候选人信息包或附件引用已过期，插件未继续操作招聘页面。",
      retryable: false, recommendedAction: "refresh_asset_and_recreate_batch"
    },
    asset_download_failed: {
      category: "asset", stage: "asset_download",
      userMessage: "简历或信息包暂时无法下载。",
      developerMessage: "候选人信息包或附件下载失败；请检查 URL、有效期、媒体类型及 SHA-256。",
      retryable: true, recommendedAction: "refresh_asset_and_recreate_batch"
    },
    task_execution_timeout: {
      category: "transport", stage: "transport",
      userMessage: "插件执行超过时限，已停止后续页面操作且未继续提交。",
      developerMessage: "设备命令在最终提交前超过 expiresAt；插件返回失败，服务端不会自动重试。",
      retryable: false, recommendedAction: "inspect_evidence"
    },
    command_expired: {
      category: "transport", stage: "transport",
      userMessage: "插件领取任务时该任务已过期，未打开招聘页面。",
      developerMessage: "设备命令在领取后通过 expiresAt 校验失败，已回传终态。",
      retryable: false, recommendedAction: "inspect_evidence"
    },
    identity_field_readback_mismatch: {
      category: "page", stage: "readback",
      userMessage: "姓名、邮箱或手机号填写后与信息包不一致，已停止提交。",
      developerMessage: "确定性身份字段回读不一致；请检查字段身份绑定及受控输入组件写入。",
      retryable: true, recommendedAction: "update_plugin"
    },
    required_degree_missing: {
      category: "page", stage: "readback",
      userMessage: "最高学历没有在招聘页面正确选中。",
      developerMessage: "学历字段选择或选中值回读失败；请检查自定义下拉组件定位。",
      retryable: true, recommendedAction: "update_plugin"
    },
    date_control_interaction_failed: {
      category: "page", stage: "form_fill",
      userMessage: "招聘网站的日期控件未能正确打开或完成选择，当前岗位未提交。",
      developerMessage: "结构化日期已取得，但日历弹层打开、识别、导航、选择或完整日期回读失败；插件未回退键盘输入。",
      retryable: true, recommendedAction: "update_plugin"
    },
    unsupported_required_control: {
      category: "unsupported", stage: "form_fill",
      userMessage: "招聘页面包含当前版本暂不支持的必填控件，当前岗位未提交。",
      developerMessage: "该必填字段没有命中已登记的唯一控件 Driver；具体字段、控件类型和识别结果见 failureDetails。",
      retryable: false, recommendedAction: "update_plugin"
    },
    control_interaction_failed: {
      category: "page", stage: "form_fill",
      userMessage: "信息已提供，但招聘页面控件未能完成填写或回读，当前岗位未提交。",
      developerMessage: "唯一 Driver 执行失败或稳定字段身份变化；请按站点/公司/字段/控件签名排查，不是候选人缺少信息。",
      retryable: false, recommendedAction: "update_plugin"
    },
    required_declaration_unchecked: {
      category: "site_validation", stage: "submit",
      userMessage: "招聘页面要求的真实性声明尚未完成。",
      developerMessage: "固定真实性声明未被精确识别或安全勾选，插件未执行最终提交。",
      retryable: true, recommendedAction: "update_plugin"
    },
    site_validation_blocked: {
      category: "site_validation", stage: "submit",
      userMessage: "招聘网站仍有必填项或页面校验未通过。",
      developerMessage: "招聘站点返回校验阻塞；请读取 validationMessages、missingFields 和脱敏诊断。",
      retryable: true, recommendedAction: "inspect_evidence"
    },
    preview_submit_not_opened: {
      category: "page", stage: "submit",
      userMessage: "插件没有成功打开预览提交步骤。",
      developerMessage: "最终预览按钮未唯一定位或点击未生效。",
      retryable: true, recommendedAction: "update_plugin"
    },
    application_entry_not_opened: {
      category: "page", stage: "preflight",
      userMessage: "插件没有成功从职位详情页进入投递流程。",
      developerMessage: "站点详情页的唯一投递入口未定位、点击未生效，或点击后未进入登录页/申请表。",
      retryable: true, recommendedAction: "update_plugin"
    },
    confirmation_submit_not_executed: {
      category: "page", stage: "submit",
      userMessage: "招聘网站的二次确认提交没有成功执行。",
      developerMessage: "预览后的唯一确认提交按钮未被执行或页面状态未变化。",
      retryable: true, recommendedAction: "update_plugin"
    },
    site_success_not_observed: {
      category: "page", stage: "success_verification",
      userMessage: "已执行提交，但没有观察到明确的成功回执。",
      developerMessage: "提交结果不确定；重试前必须先查询页面或站点记录，避免重复投递。",
      retryable: false, recommendedAction: "inspect_evidence"
    },
    site_application_limit_reached: {
      category: "site_validation", stage: "submit",
      userMessage: "近期在该公司投递次数过多，已被招聘网站限制投递。",
      developerMessage: "最终提交或验证码完成后检测到可见的站点投递频次/数量限制；已作为明确失败收口，不刷新、不重填、不重新提交。",
      retryable: false, recommendedAction: "inspect_evidence"
    },
    submission_outcome_unknown: {
      category: "page", stage: "success_verification",
      userMessage: "已尝试提交，但尚未确认招聘网站是否受理。",
      developerMessage: "Submission Transaction 已进入对账模式；禁止重新点击提交，需从原标签页或站点投递记录确认终态。",
      retryable: false, recommendedAction: "inspect_evidence"
    },
    vision_service_unavailable: {
      category: "model", stage: "form_fill",
      userMessage: "智能填表服务暂时不可用，请稍后重试。",
      developerMessage: "Server 视觉模型调用失败、超时或无可用上游。",
      retryable: true, recommendedAction: "retry_job"
    },
    model_response_invalid: {
      category: "model", stage: "form_fill",
      userMessage: "智能填表结果未通过结构校验。",
      developerMessage: "模型输出不符合动作或字段映射协议；请检查模型响应和 schema。",
      retryable: false, recommendedAction: "inspect_evidence"
    },
    model_auth_failed: {
      category: "model", stage: "transport",
      userMessage: "智能填表服务配置异常，已停止本次投递。",
      developerMessage: "Server 侧模型凭据无效或权限不足。",
      retryable: false, recommendedAction: "inspect_evidence"
    },
    model_rate_limited: {
      category: "model", stage: "transport",
      userMessage: "智能填表服务繁忙，请稍后重试。",
      developerMessage: "视觉模型上游触发限流或额度限制。",
      retryable: true, recommendedAction: "retry_job"
    },
    model_unavailable: {
      category: "model", stage: "transport",
      userMessage: "智能填表服务暂时不可用，请稍后重试。",
      developerMessage: "视觉模型上游返回不可用或服务端错误。",
      retryable: true, recommendedAction: "retry_job"
    },
    transport_failed: {
      category: "transport", stage: "transport",
      userMessage: "插件与服务端或招聘网站连接失败。",
      developerMessage: "网络请求、页面导航或 Device Bridge 通信失败。",
      retryable: true, recommendedAction: "retry_job"
    },
    batch_authorization_invalid: {
      category: "authorization", stage: "submit",
      userMessage: "本批次的最终提交授权无效或已过期。",
      developerMessage: "批次级自动最终提交授权未通过 Server 校验。",
      retryable: false, recommendedAction: "cancel_batch"
    },
    adapter_url_mismatch: {
      category: "unsupported", stage: "preflight",
      userMessage: "投递网址与指定站点适配器不匹配。",
      developerMessage: "adapterHint 与 applicationUrl 的域名或路径规则不一致。",
      retryable: false, recommendedAction: "skip_job"
    },
    invalid_application_url: {
      category: "unsupported", stage: "preflight",
      userMessage: "投递网址格式无效。",
      developerMessage: "applicationUrl 无法解析为有效 URL。",
      retryable: false, recommendedAction: "correct_application_url"
    },
    unsupported_application_protocol: {
      category: "unsupported", stage: "preflight",
      userMessage: "投递网址不是可打开的网页地址。",
      developerMessage: "applicationUrl 必须使用 HTTP(S) 协议。",
      retryable: false, recommendedAction: "correct_application_url"
    },
    consent_requires_user: {
      category: "unsupported", stage: "preflight",
      userMessage: "页面包含未获批自动确认的协议或授权项。",
      developerMessage: "检测到非白名单声明或含义不明确的授权控件，已停止自动提交。",
      retryable: false, recommendedAction: "skip_job"
    },
    batch_cancelled: {
      category: "cancelled", stage: "unknown",
      userMessage: "本批次已终止。",
      developerMessage: "用户或 AI 侧取消了当前自动投递批次。",
      retryable: false, recommendedAction: "none"
    }
  };
  const fallback: Omit<AutoApplyDiagnostic, "code"> = {
    category: "unknown", stage: "unknown",
    userMessage: "自动投递未完成，请查看详细诊断。",
    developerMessage: "未归类的插件执行错误；请结合 reasonCode、failureDetails 和脱敏证据排查。",
    retryable: false, recommendedAction: "inspect_evidence"
  };
  return { code: reasonCode, ...(known[reasonCode] ?? fallback),
    ...(reasonCode === "site_validation_blocked" && failureDetails?.failureCode === "site_upload_rejected"
      ? { userMessage: typeof failureDetails.message === "string" ? failureDetails.message : "招聘网站未接受文件上传，请检查原招聘页面。",
          developerMessage: "本次提交明确拒绝文件控件；全部字段错误见 failureDetails，不创建文本补充答案，也不自动重传或再次提交。",
          retryable: false } : null),
    ...(reasonCode === "submission_outcome_unknown" ? unconfirmedPreviewDiagnostic(failureDetails) : null) };
}

function candidateFactByKey(
  facts: Record<string, string>,
  preferred: RegExp,
  fallback?: RegExp
): string {
  const entries = Object.entries(facts);
  const preferredEntry = entries.find(([key, value]) => value && preferred.test(key));
  if (preferredEntry) return preferredEntry[1];
  return fallback ? entries.find(([key, value]) => value && fallback.test(key))?.[1] ?? "" : "";
}


function isMokaApplicationUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (/(?:^|\.)mokahr\.com$/i.test(parsed.hostname)) return true;
    return ["127.0.0.1", "localhost"].includes(parsed.hostname) &&
      parsed.pathname === "/__recruiting_ai_test__/moka";
  } catch {
    return false;
  }
}

function isMokaPhlexingLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/phlexing/100123" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

function isMokaLinctexLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "app.mokahr.com" &&
      url.pathname === "/social-recruitment/linctex/46055" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

function isMokaYadeaLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "app.mokahr.com" &&
      url.pathname === "/social-recruitment/yadea/144891" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

function isMokaBrotherLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "app.mokahr.com" &&
      url.pathname === "/social-recruitment/brother/150715" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

function isMokaMetaxLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/metax-tech/58131" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

function isMokaJstiLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/jsti/144121" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

function isMokaSinaLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/sina/43536" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

function isMokaXiwangLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/xiwang/146380" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

function isMokaYinliLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/yinli/148676" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

function isMokaWzgroupLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/wzgroup/76099" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

function isMokaTranswarpLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/transwarp/3196" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

function isMokaNewgrandLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/newgrand/151701" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

function isMokaNewonderLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/newonder/146673" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

function isMokaWandacmLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/wandacm/164049" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

function isMokaInnostarLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "app.mokahr.com" &&
      url.pathname === "/social-recruitment/innostar1/46008" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

function isMokaAscenpowerLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/ascenpower/166280" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch {
    return false;
  }
}

function isMokaGclpowerLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/gclpower/140979" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch { return false; }
}

function isMokaXiaoyingLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/xiaoying/148851" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch { return false; }
}

function isMokaSimceredxLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/simceredx/74124" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch { return false; }
}

function isMokaEqhrLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/eqhr/39786" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch { return false; }
}

function isMokaXgdLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/xgd/7850" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch { return false; }
}

function isEvidencedMokaLocationApplicationUrl(value: string): boolean {
  return isDeepSeekLocationApplicationUrl(value) ||
    isMokaLinctexLocationApplicationUrl(value) ||
    isMokaYadeaLocationApplicationUrl(value) ||
    isMokaBrotherLocationApplicationUrl(value) ||
    isMokaPhlexingLocationApplicationUrl(value) ||
    isMokaZteLocationApplicationUrl(value) ||
    isMokaMetaxLocationApplicationUrl(value) ||
    isMokaJstiLocationApplicationUrl(value) ||
    isMokaSinaLocationApplicationUrl(value) ||
    isMokaXiwangLocationApplicationUrl(value) ||
    isMokaYinliLocationApplicationUrl(value) ||
    isMokaWzgroupLocationApplicationUrl(value) ||
    isMokaTranswarpLocationApplicationUrl(value) ||
    isMokaNewgrandLocationApplicationUrl(value) ||
    isMokaNewonderLocationApplicationUrl(value) ||
    isMokaWandacmLocationApplicationUrl(value) ||
    isMokaInnostarLocationApplicationUrl(value) ||
    isMokaAscenpowerLocationApplicationUrl(value) ||
    isMokaGclpowerLocationApplicationUrl(value) ||
    isMokaXiaoyingLocationApplicationUrl(value) ||
    isMokaSimceredxLocationApplicationUrl(value) ||
    isMokaEqhrLocationApplicationUrl(value) ||
    isMokaXgdLocationApplicationUrl(value);
}

function isMokaZteLocationApplicationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "app.mokahr.com" &&
      url.pathname === "/campus-recruitment/ztehr4/150449" &&
      /^#\/job\/[^/?#]+\/apply(?:[/?#]|$)/u.test(url.hash);
  } catch { return false; }
}

const MOKA_LOCATION_DRIVER_CODES = new Set([
  "moka.work-city.trusted-focus.v1",
  "moka.deepseek.location.trusted-focus.v4",
  "moka.linctex.location.trusted-focus.v1",
  "moka.yadea.location.trusted-focus.v1",
  "moka.brother.location.trusted-focus.v1",
  "moka.phlexing.location.trusted-focus.v1",
  "moka.zte.location.trusted-focus.v1",
  "moka.metax.location.trusted-focus.v1",
  "moka.jsti.location.trusted-focus.v1",
  "moka.sina.location.trusted-focus.v1",
  "moka.xiwang.location.trusted-focus.v1",
  "moka.yinli.location.trusted-focus.v1",
  "moka.wzgroup.location.trusted-focus.v1",
  "moka.transwarp.location.trusted-focus.v1",
  "moka.newgrand.location.trusted-focus.v1",
  "moka.newonder.location.trusted-focus.v1",
  "moka.wandacm.location.trusted-focus.v1",
  "moka.innostar.location.trusted-focus.v1",
  "moka.ascenpower.location.trusted-focus.v1",
  "moka.gclpower.location.trusted-focus.v1",
  "moka.xiaoying.location.trusted-focus.v1",
  "moka.simceredx.location.trusted-focus.v1",
  "moka.eqhr.location.trusted-focus.v1",
  "moka.xgd.location.trusted-focus.v1"
]);

function isMokaSelectableLocationControl(
  field: Pick<PageFieldObservation, "type" | "controlKind">
): boolean {
  return [field.type, field.controlKind].some((kind) =>
    kind === "select" || kind === "combobox"
  );
}

function isMokaPreferredLocationField(input: {
  applicationUrl: string;
  field: Pick<PageFieldObservation, "label" | "stableFieldKey" | "type" | "controlKind">;
  semanticKey?: string | null;
}): boolean {
  return isMokaApplicationUrl(input.applicationUrl) &&
    isMokaSelectableLocationControl(input.field) && isDeepSeekLocationField({
    label: input.field.label,
    stableFieldKey: input.field.stableFieldKey,
    semanticKey: input.semanticKey
  });
}

function isMokaLocationInteractionFailure(value: unknown): boolean {
  return isDeepSeekLocationInteractionFailure(value) ||
    isMokaNativePlaceInteractionFailure(value);
}


async function executeMokaTap4funBirthDateInstructionWithTrustedPointerDriver(
  tabId: number,
  field: PageObservation["fields"][number],
  instruction: FillInstruction,
  controlAdapterDiagnostic: ReturnType<typeof resolveControlAdapter>["diagnostic"],
  initialActual: string
): Promise<FillResult> {
  const expected = String(instruction.value ?? "");
  const dateValue = instruction.dateValue;
  const result = (input: {
    success: boolean;
    actual: string;
    error: string | null;
    driverStage?: string;
    driverFailureCode?: string | null;
    driverDiagnostics?: Record<string, unknown>;
  }): FillResult => ({
    fieldId: field.fieldId,
    expected,
    ...input,
    controlAdapter: controlAdapterDiagnostic
  });
  if (!dateValue) {
    return result({
      success: false,
      actual: initialActual,
      error: dateControlInteractionFailure("tap4fun 出生日期缺少结构化年月日"),
      driverStage: "detect",
      driverFailureCode: "readback_mismatch"
    });
  }
  const target = { tabId };
  let attached = false;
  let focusEmulationEnabled = false;
  const sendDebuggerCommand = async (
    method: string,
    params?: Record<string, unknown>
  ): Promise<unknown> => sendInterruptibleDebuggerCommand(target, method, params);
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    const execution = await executeMokaTap4funBirthDateDriver({
      tabId,
      selector: instruction.selector,
      dateValue,
      prepareSurface: async () => {
        focusEmulationEnabled = true;
        await prepareFocusEmulatedTrustedPointerSurface(sendDebuggerCommand);
      },
      shiftSurface: async (shiftY) => {
        const shifted = await executeInterruptibleScript({
          target: { tabId },
          world: "MAIN",
          func: shiftCalendarSurfaceInPage,
          args: [instruction.selector, shiftY]
        });
        return Number(shifted[0]?.result ?? 0);
      },
      clickPoint: (point) => dispatchTrustedPointerClick(sendDebuggerCommand, point),
      wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
    });
    const driverDiagnostics: MokaTap4funBirthDateDriverDiagnostics & {
      buildCommit: string;
      precision: "day";
    } = {
      ...execution.diagnostics,
      buildCommit: recruitingAiPluginInfo().buildCommit,
      precision: "day"
    };
    return result({
      success: execution.success,
      actual: execution.actual,
      error: execution.error ? dateControlInteractionFailure(execution.error) : null,
      driverStage: execution.stage,
      driverFailureCode: execution.diagnostics.failureCode,
      driverDiagnostics: driverDiagnostics as unknown as Record<string, unknown>
    });
  } catch (error) {
    return result({
      success: false,
      actual: initialActual,
      error: dateControlInteractionFailure(
        `tap4fun 出生日期可信指针 Driver 执行失败：${error instanceof Error ? error.message : String(error)}`
      ),
      driverStage: "readback",
      driverFailureCode: "driver_interrupted"
    });
  } finally {
    if (attached && focusEmulationEnabled) {
      await releaseTrustedPointerSurface(sendDebuggerCommand).catch(() => undefined);
    }
    if (attached) await chrome.debugger.detach(target).catch(() => undefined);
  }
}

/**
 * Moka fields are React controlled. Assigning `input.value` and dispatching a
 * synthetic event can pass an immediate DOM readback while leaving React's
 * form store unchanged. This executor uses trusted CDP mouse/keyboard input,
 * then lets the caller re-observe the rebuilt page before deciding success.
 */
async function executeMokaDateInstructionWithTrustedPointerDriver(
  tabId: number,
  observation: PageObservation,
  field: PageObservation["fields"][number],
  instruction: FillInstruction
): Promise<FillResult | null> {
  if (!instruction.dateValue) return null;
  const expected = String(instruction.value ?? "");
  const inspected = await executeInterruptibleScript({
    target: { tabId },
    world: "MAIN",
    func: (targetSelector: string) => {
      const element = document.querySelector(targetSelector);
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (rect.width <= 0 || rect.height <= 0 || style.display === "none" ||
        style.visibility === "hidden" || style.opacity === "0") return null;
      const classNames: string[] = [];
      let classNode: HTMLElement | null = element;
      for (let depth = 0; classNode && depth < 5; depth += 1) {
        classNames.push(String(classNode.className || ""));
        classNode = classNode.parentElement;
      }
      return {
        tag: element.tagName,
        type: element instanceof HTMLInputElement ? element.type : "",
        readOnly: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
          ? element.readOnly
          : false,
        placeholder: element.getAttribute("placeholder") || "",
        classNames,
        value: String((element as HTMLInputElement).value ?? element.textContent ?? "")
      };
    },
    args: [instruction.selector]
  });
  const located = inspected[0]?.result;
  if (!located) {
    return {
      fieldId: field.fieldId,
      success: false,
      expected,
      actual: "",
      error: dateControlInteractionFailure("动态页面中未重新定位到日期字段")
    };
  }
  const controlAdapter = resolveControlAdapter({
    applicationUrl: observation.url,
    label: field.label,
    semanticKey: [instruction.stableFieldKey, instruction.semanticKey].filter(Boolean).join(" "),
    type: located.type || field.type,
    controlKind: field.controlKind || "",
    tagName: located.tag,
    readOnly: located.readOnly,
    placeholder: located.placeholder,
    classNames: located.classNames
  });
  const lockedFailure = lockedControlRouteFailure(field, instruction, controlAdapter);
  if (lockedFailure) return lockedFailure;
  const liveDateField: PageFieldObservation = {
    ...field,
    type: located.type || field.type,
    currentValue: located.value,
    informationRequirement: controlAdapter.registration?.informationRequirement,
    domHints: { ...field.domHints, placeholder: located.placeholder }
  };
  const informationGate = guardFieldInformation(liveDateField, instruction.value);
  if (informationGate) return informationGate;
  if (controlAdapter.code === "generic.native.v1") return null;
  if (controlAdapter.code === "moka.tap4fun.birth-date.trusted-pointer.v2") {
    return executeMokaTap4funBirthDateInstructionWithTrustedPointerDriver(
      tabId,
      field,
      instruction,
      controlAdapter.diagnostic,
      located.value
    );
  }
  if (controlAdapter.code !== "moka.date-picker.trusted-pointer.v9" &&
    controlAdapter.code !== "moka.zuoyebang.education-end-month.trusted-pointer.v1") {
    return {
      fieldId: field.fieldId,
      success: false,
      expected,
      actual: located.value,
      error: unsupportedRequiredControlFailure({
        label: field.label,
        controlType: controlAdapter.diagnostic.controlName,
        adapterCode: controlAdapter.code,
        detail: `没有命中已登记控件签名（${controlAdapter.reason}）`
      }),
      controlAdapter: controlAdapter.diagnostic
    };
  }
  // A prior trusted interaction may already have committed this value. Avoid
  // reopening Moka's calendar after the React form expands.
  const liveRequirement = fieldInformationRequirement(liveDateField);
  const datePrecision = liveRequirement?.kind === "date" && liveRequirement.precision === "day"
    ? "day" as const
    : controlAdapter.code === "moka.zuoyebang.education-end-month.trusted-pointer.v1"
    ? "month" as const
    : instruction.datePrecision;
  if (structuredDateReadbackMatches(located.value, instruction.dateValue, datePrecision)) {
    return {
      fieldId: field.fieldId,
      success: true,
      expected,
      actual: located.value,
      error: null,
      controlAdapter: controlAdapter.diagnostic
    };
  }
  const calendarVisibilityTrace: Record<string, unknown>[] = [];
  const result = (input: {
    success: boolean; actual: string; error: string | null;
    driverStage?: string; driverFailureCode?: string; driverDiagnostics?: Record<string, unknown>;
  }): FillResult => ({
    fieldId: field.fieldId,
    expected,
    ...input,
    ...(calendarVisibilityTrace.length ? {driverDiagnostics: {...input.driverDiagnostics, calendarVisibilityTrace}} : {}),
    controlAdapter: controlAdapter.diagnostic
  });
  const monthOnlyInput = !structuredDateFromValue(instruction.value) &&
    Boolean(structuredMonthDateFromValue(instruction.value));
  if (controlAdapter.code === "moka.date-picker.trusted-pointer.v9" &&
    monthOnlyInput && datePrecision !== "month") {
    return result({
      success: false,
      actual: located.value,
      error: dateControlInteractionFailure(
        "通用 Moka 日历缺少可证明 YYYY-MM 精度的控件证据，拒绝按其他租户字段规则填写"
      )
    });
  }
  const target = { tabId };
  const selector = JSON.stringify(instruction.selector);
  let attached = false;
  let focusEmulationEnabled = false;
  const sendDebuggerCommand = async (
    method: string,
    params?: Record<string, unknown>
  ): Promise<unknown> => sendInterruptibleDebuggerCommand(target, method, params);
  let calendarProbeException: { name: string; line: number | null; column: number | null } | null = null;
  const runtimeValue = async <T>(expression: string): Promise<T | null> => {
    const response = await sendDebuggerCommand("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    }) as { result?: { value?: T }; exceptionDetails?: {
      lineNumber?: number; columnNumber?: number; exception?: {className?: string};
    } };
    // Runtime.evaluate resolves even when the page expression throws. Do not
    // collapse that into a closed popup or expose page data from exception text.
    if (response.exceptionDetails) {
      const details = response.exceptionDetails;
      const name = details.exception?.className ?? "";
      calendarProbeException = {
        name: /^(?:Type|Reference|Syntax|Range|Eval|URI)?Error$/.test(name) ? name : "Error",
        line: Number.isInteger(details.lineNumber) ? details.lineNumber! : null,
        column: Number.isInteger(details.columnNumber) ? details.columnNumber! : null
      };
      throw new Error("moka_calendar_probe_exception");
    }
    return response.result?.value ?? null;
  };
  type TrustedPoint = {
    x: number;
    y: number;
    hitTag: string;
    hitClass: string;
  };
  type PickerState = {
    mode: "day" | "month" | "year";
    year: number;
    yearHeaderText: string;
    fieldValue: string;
    month: number;
    yearRangeStart: number;
    yearRangeEnd: number;
    popupCount: number;
    yearTitleMatches: number;
    monthTitleMatches: number;
    navigationMatches: number;
    yearOptionMatches: number;
    monthOptionMatches: number;
    monthCellMatches: number;
    dayOptionMatches: number;
    viewportHeight: number;
    surfaceTargets: CalendarTargetGeometry[];
    yearTitle: TrustedPoint | null;
    previousYear: TrustedPoint | null;
    nextYear: TrustedPoint | null;
    previousDecade: TrustedPoint | null;
    nextDecade: TrustedPoint | null;
    previousMonth: TrustedPoint | null;
    nextMonth: TrustedPoint | null;
    targetYear: TrustedPoint | null;
    targetYearMatches: number;
    targetDay: TrustedPoint | null;
    targetDayMatches: number;
    targetMonth: TrustedPoint | null;
    targetMonthMatches: number;
    zeroYearRecoveryNext: TrustedPoint | null;
  };
  const pickerStateReady = (state: PickerState | null): state is PickerState =>
    Boolean(state && (
      state.mode === "year"
        ? state.yearRangeStart && state.yearRangeEnd
        : state.year && (state.mode === "month" || state.month)
    ));
  const recoverableZeroYearPanel = (state: PickerState | null): state is PickerState =>
    isGarenaZeroYearMonthPanel({
      applicationUrl: observation.url, label: field.label, classNames: located.classNames,
      readOnly: located.readOnly, datePrecision, currentValue: located.value, state
    });
  const prepareBackgroundSurface = async (): Promise<void> => {
    focusEmulationEnabled = true;
    await prepareFocusEmulatedTrustedPointerSurface(sendDebuggerCommand);
  };
  const clickTrustedPoint = async (point: TrustedPoint): Promise<void> =>
    dispatchTrustedPointerClick(sendDebuggerCommand, point);
  const locateOpenPoint = async (): Promise<(TrustedPoint & { hitAccepted: boolean }) | null> => {
    const viewportHeight = Number(await runtimeValue<number>("window.innerHeight"));
    const targetTop = datePickerInputTargetTop(viewportHeight);
    return runtimeValue(`(() => {
      const element = document.querySelector(${selector});
      if (!(element instanceof HTMLElement)) return null;
      const visible = (candidate) => {
        if (!(candidate instanceof HTMLElement)) return false;
        const rect = candidate.getBoundingClientRect();
        const style = getComputedStyle(candidate);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' &&
          style.visibility !== 'hidden' && style.opacity !== '0';
      };
      if (!visible(element)) return null;
      element.scrollIntoView({behavior:'instant',block:'center',inline:'nearest'});
      let rect = element.getBoundingClientRect();
      const correction = rect.top - ${JSON.stringify(targetTop)};
      if (Math.abs(correction) > 4) {
        window.scrollTo({top:window.scrollY + correction,left:window.scrollX,behavior:'instant'});
        rect = element.getBoundingClientRect();
      }
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      const label = element.closest('label');
      const dropdown = element.closest("[class*='Dropdown-container'],[class*='dropdown-container']");
      const hitAccepted = hit === element || element.contains(hit) ||
        Boolean(label && hit && label.contains(hit)) ||
        Boolean(dropdown && hit && dropdown.contains(hit));
      return {
        x,
        y,
        hitTag: hit instanceof HTMLElement ? hit.tagName : '',
        hitClass: hit instanceof HTMLElement ? String(hit.className || '') : '',
        hitAccepted
      };
    })()`);
  };
  let lastPickerProbe: MokaCalendarProbe<PickerState> = {
    status: "probe_unavailable", fieldMatchCount: 0, popupCount: 0, state: null
  };
  const readState = async (): Promise<PickerState | null> => {
    lastPickerProbe = await runtimeValue<MokaCalendarProbe<PickerState>>(`(() => {
    const fields = [...document.querySelectorAll(${selector})];
    const fieldMatchCount = fields.length;
    const empty = (status, popupCount = 0) => ({status, fieldMatchCount, popupCount, state:null});
    if (fields.length !== 1) return empty(fields.length ? 'control_ambiguous' : 'control_missing');
    const element = fields[0];
    if (!(element instanceof HTMLInputElement) || !element.readOnly ||
      (element.getAttribute('placeholder') || '') !== ${JSON.stringify(located.placeholder)}) {
      return empty('control_signature_changed');
    }
    const rendered = (candidate) => {
      if (!(candidate instanceof HTMLElement)) return false;
      const rect = candidate.getBoundingClientRect();
      const style = getComputedStyle(candidate);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' &&
        style.visibility !== 'hidden' && style.opacity !== '0';
    };
    // During Moka's opening transition the outer dropdown is already laid
    // out but still has opacity:0. Keep that outer wrapper in the ownership
    // set so a visible-looking inner panel cannot be mistaken for a ready
    // calendar before the transition completes.
    const positioned = (candidate) => {
      if (!(candidate instanceof HTMLElement)) return false;
      const rect = candidate.getBoundingClientRect();
      const style = getComputedStyle(candidate);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' &&
        style.visibility !== 'hidden';
    };
    const point = (candidate) => {
      if (!rendered(candidate)) return null;
      const rect = candidate.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (!(hit === candidate || candidate.contains(hit))) return null;
      return {
        x,
        y,
        hitTag: hit instanceof HTMLElement ? hit.tagName : '',
        hitClass: hit instanceof HTMLElement ? String(hit.className || '') : ''
      };
    };
    const root = element.closest("[class*='Dropdown-container'],[class*='dropdown-container']") ||
      element.parentElement;
    const popupSelector = "[class*='Dropdown-dropdown'],[class*='dropdown-dropdown']," +
      "[class*='panal-menu-wrapper'],[class*='panel-menu-wrapper']";
    const explicitLocalPopups = [...(root?.querySelectorAll(popupSelector) || [])].filter((candidate) =>
      positioned(candidate) && Boolean(candidate.querySelector("[class*='selector-year']"))
    );
    const structuralLocalPopups = explicitLocalPopups.length === 0 &&
      root instanceof HTMLElement && positioned(root) &&
      Boolean(root.querySelector("[class*='selector-year']"))
      ? [root]
      : [];
    const localPopups = [...explicitLocalPopups, ...structuralLocalPopups];
    const elementRect = element.getBoundingClientRect();
    const anchoredGlobalPopups = [...document.querySelectorAll(popupSelector)].filter((candidate) => {
      if (!positioned(candidate) || !candidate.querySelector("[class*='selector-year']")) return false;
      const owningDropdown = candidate.closest("[class*='Dropdown-container'],[class*='dropdown-container']");
      // A popup nested under a different field is never a portal for this
      // input, even when viewport geometry overlaps. Moka's detached portal
      // has no owning Dropdown container and is admitted by the anchor check.
      if (owningDropdown && owningDropdown !== root) return false;
      const rect = candidate.getBoundingClientRect();
      const horizontalOverlap = Math.min(elementRect.right, rect.right) -
        Math.max(elementRect.left, rect.left);
      const verticalGap = rect.top >= elementRect.bottom
        ? rect.top - elementRect.bottom
        : elementRect.top >= rect.bottom
          ? elementRect.top - rect.bottom
          : 0;
      return horizontalOverlap > 0 && verticalGap <= 180;
    });
    const popupCandidates = [...new Set(localPopups.length ? localPopups : anchoredGlobalPopups)];
    // Moka renders one calendar as an outer Dropdown and an inner panel-menu.
    // Keep the outer visible container; nested wrapper matches are not
    // independent popups. Separate siblings remain ambiguous.
    const popups = popupCandidates.filter((candidate) => !popupCandidates.some((other) =>
      other !== candidate && other.contains(candidate)
    ));
    if (popups.length !== 1) return empty(popups.length ? 'popup_ambiguous' : 'popup_closed', popups.length);
    const popup = popups[0];
    if (!rendered(popup)) return empty('popup_open', 1);
    const yearTitles = [...popup.querySelectorAll("[class*='selector-year']")].filter(rendered);
    const monthTitles = [...popup.querySelectorAll("[class*='selector-month']")].filter(rendered);
    const yearText = String(yearTitles[0]?.textContent || '');
    const monthText = String(monthTitles[0]?.textContent || '');
    const {year, month} = (${mokaPickerHeaderParserExpression()})(yearText, monthText);
    const yearHeaderNumbers = [...yearText.matchAll(/[12][0-9]{3}/g)].map((match) => Number(match[0]));
    const monthNodes = [...popup.querySelectorAll('td,span,div')].filter(rendered);
    const parsedMonthCells = monthNodes.map((candidate) => ({
      candidate,
      month: (${mokaPickerMonthParserExpression()})(String(candidate.textContent || ''))
    })).filter((item) => item.month > 0 && ![...item.candidate.children].some((child) =>
      rendered(child) && (${mokaPickerMonthParserExpression()})(String(child.textContent || '')) === item.month
    ));
    const monthPanel = !month && new Set(parsedMonthCells.map((item) => item.month)).size >= 10;
    const targetMonthCandidates = monthPanel
      ? parsedMonthCells.filter((item) => item.month === ${JSON.stringify(instruction.dateValue.month)})
        .map((item) => item.candidate)
      : [];
    const fadedWithinPopup = (candidate) => {
      for (let node = candidate; node instanceof HTMLElement && node !== popup; node = node.parentElement) {
        if (/fade/i.test(String(node.className || ''))) return true;
      }
      return false;
    };
    const yearNodes = [...popup.querySelectorAll('td,span,div')].filter(rendered);
    const parsedYearCells = yearNodes.map((candidate) => ({
      candidate,
      text: String(candidate.textContent || '').trim()
    })).filter((item) => /^[12][0-9]{3}$/.test(item.text) &&
      !fadedWithinPopup(item.candidate) &&
      ![...item.candidate.children].some((child) =>
        rendered(child) && String(child.textContent || '').trim() === item.text
      )
    );
    const yearCellNumbers = parsedYearCells.map((item) => Number(item.text));
    const yearPanel = !monthPanel && !month && new Set(yearCellNumbers).size >= 8;
    const inferredYearRangeStart = yearHeaderNumbers.length >= 2
      ? Math.min(yearHeaderNumbers[0], yearHeaderNumbers[1])
      : Math.min(...yearCellNumbers);
    const inferredYearRangeEnd = yearHeaderNumbers.length >= 2
      ? Math.max(yearHeaderNumbers[0], yearHeaderNumbers[1])
      : Math.max(...yearCellNumbers);
    const targetYearCandidates = yearPanel
      ? parsedYearCells.filter((item) => Number(item.text) === ${JSON.stringify(instruction.dateValue.year)})
        .map((item) => item.candidate)
      : [];
    const targetDayCandidates = [...popup.querySelectorAll('td')].flatMap((candidate) => {
      if (!rendered(candidate) || /fade/i.test(String(candidate.className || ''))) return [];
      const dateItem = candidate.querySelector("[class*='date-item'],[class*='Date-item']") || candidate;
      return String(dateItem.textContent || '').trim() === ${JSON.stringify(String(instruction.dateValue.day))}
        ? [dateItem]
        : [];
    });
    const dayOptionMatches = [...popup.querySelectorAll('td')].filter((candidate) => {
      if (!rendered(candidate) || fadedWithinPopup(candidate)) return false;
      const dateItem = candidate.querySelector("[class*='date-item'],[class*='Date-item']") || candidate;
      const day = Number(String(dateItem.textContent || '').trim());
      return Number.isInteger(day) && day >= 1 && day <= 31;
    }).length;
    const navigationCandidates = [...popup.querySelectorAll(
      "[class*='icondoubleLeft'],[class*='icondoubleRight'],[class*='iconleft'],[class*='iconright']"
    )].filter(rendered);
    const surfaceCandidates = [...new Set([
      ...navigationCandidates,
      popup.querySelector("[class*='selector-year']"),
      popup.querySelector("[class*='selector-month']"),
      ...targetYearCandidates,
      ...targetMonthCandidates,
      ...targetDayCandidates
    ].filter((candidate) => rendered(candidate)))];
    const fixedOverlays = [...document.querySelectorAll('body *')].filter((candidate) => {
      if (!(candidate instanceof HTMLElement) || candidate === popup || popup.contains(candidate)) return false;
      const rect = candidate.getBoundingClientRect();
      const style = getComputedStyle(candidate);
      return (style.position === 'fixed' || style.position === 'sticky') &&
        rect.width > 0 && rect.height > 0 && rect.top <= 12 && rect.bottom > 0;
    });
    const surfaceTargets = surfaceCandidates.map((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = x >= 0 && x < window.innerWidth && y >= 0 && y < window.innerHeight
        ? document.elementFromPoint(x, y)
        : null;
      const obstructionBottom = fixedOverlays.reduce((bottom, overlay) => {
        const overlayRect = overlay.getBoundingClientRect();
        return x >= overlayRect.left && x <= overlayRect.right
          ? Math.max(bottom, overlayRect.bottom)
          : bottom;
      }, 0);
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        hitVerified: hit === candidate || candidate.contains(hit),
        obstructionBottom
      };
    });
    const uniqueNavigationPoint = (query) => {
      const candidates = [...popup.querySelectorAll(query)].filter(rendered);
      if (candidates.length !== 1) return null;
      const candidate = candidates[0];
      const verified = point(candidate);
      if (verified) return verified;
      const rect = candidate.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      const style = getComputedStyle(candidate);
      if (!hit || !popup.contains(hit) || style.cursor !== 'pointer') return null;
      return {
        x,
        y,
        hitTag: hit instanceof HTMLElement ? hit.tagName : '',
        hitClass: hit instanceof HTMLElement ? String(hit.className || '') : ''
      };
    };
    const recoveryArrows = [...popup.querySelectorAll("span[class*='icondoubleRight'][class*='selector-icon']")]
      .filter(rendered).filter((candidate) => {
        for (let node = candidate; node instanceof HTMLElement && node !== popup; node = node.parentElement) {
          if (node.getAttribute('aria-disabled') === 'true' || node.hasAttribute('disabled') ||
            /disabled/i.test(String(node.className || ''))) return false;
        }
        return getComputedStyle(candidate).cursor === 'pointer';
      });
    return {status:'popup_open', fieldMatchCount, popupCount:popups.length, state:{
      mode: monthPanel ? 'month' : yearPanel ? 'year' : 'day',
      year,
      yearHeaderText: yearText,
      fieldValue: String(element.value || ''),
      month,
      yearRangeStart: yearPanel ? inferredYearRangeStart : 0,
      yearRangeEnd: yearPanel ? inferredYearRangeEnd : 0,
      popupCount: popups.length,
      yearTitleMatches: yearTitles.length,
      monthTitleMatches: monthTitles.length,
      navigationMatches: navigationCandidates.length,
      yearOptionMatches: new Set(yearCellNumbers).size,
      monthOptionMatches: new Set(parsedMonthCells.map((item) => item.month)).size,
      monthCellMatches: parsedMonthCells.length,
      dayOptionMatches,
      viewportHeight: window.innerHeight,
      surfaceTargets,
      yearTitle: monthPanel ? point(popup.querySelector("[class*='selector-year']")) : null,
      previousYear: uniqueNavigationPoint(monthPanel ? "[class*='iconleft']" : "[class*='icondoubleLeft']"),
      nextYear: uniqueNavigationPoint(monthPanel ? "[class*='iconright']" : "[class*='icondoubleRight']"),
      previousDecade: yearPanel ? uniqueNavigationPoint("[class*='icondoubleLeft']") : null,
      nextDecade: yearPanel ? uniqueNavigationPoint("[class*='icondoubleRight']") : null,
      previousMonth: monthPanel ? null : uniqueNavigationPoint("[class*='iconleft']"),
      nextMonth: monthPanel ? null : uniqueNavigationPoint("[class*='iconright']"),
      targetYear: targetYearCandidates.length === 1 ? point(targetYearCandidates[0]) : null,
      targetYearMatches: targetYearCandidates.length,
      targetDay: targetDayCandidates.length === 1 ? point(targetDayCandidates[0]) : null,
      targetDayMatches: targetDayCandidates.length,
      targetMonth: targetMonthCandidates.length === 1 ? point(targetMonthCandidates[0]) : null,
      targetMonthMatches: targetMonthCandidates.length,
      zeroYearRecoveryNext: recoveryArrows.length === 1 ? point(recoveryArrows[0]) : null
    }};
  })()`) ?? { status: "probe_unavailable", fieldMatchCount: 0, popupCount: 0, state: null };
    return lastPickerProbe.state;
  };

  const shiftPickerSurface = async (shiftY: number): Promise<number> => {
    const shifted = await executeInterruptibleScript({
      target: { tabId },
      world: "MAIN",
      func: shiftCalendarSurfaceInPage,
      args: [instruction.selector, shiftY]
    });
    return Number(shifted[0]?.result ?? 0);
  };
  const ensurePickerTargetsVisible = async (
    initialState: PickerState | null
  ): Promise<{ state: PickerState | null; error: string | null }> => {
    let latest = initialState;
    for (let attempt = 0; attempt < CALENDAR_VISIBILITY_MAX_CORRECTIONS; attempt += 1) {
      if (!pickerStateReady(latest) && !recoverableZeroYearPanel(latest)) {
        return { state: latest, error: "调整日历弹层位置后状态丢失" };
      }
      let correction = calendarTargetVisibilityCorrection({
        viewportHeight: latest.viewportHeight,
        targets: latest.surfaceTargets
      });
      if (correction.reason === "visible") return { state: latest, error: null };
      if (controlAdapter.code === "moka.date-picker.trusted-pointer.v9" && correction.shiftY !== 0) {
        const settled = await settleCalendarTargetGeometry({
          initial: latest as PickerState | null, read: readState,
          signature: state => (!pickerStateReady(state) && !recoverableZeroYearPanel(state)) ? null : JSON.stringify([
            state!.mode, state!.year, state!.month, state!.yearRangeStart, state!.yearRangeEnd,
            state!.viewportHeight, state!.surfaceTargets.map(target => [
              target.top, target.bottom, target.left, target.right, target.obstructionBottom
            ].map(value => Math.round(value * 10) / 10).concat([Number(target.hitVerified)]))
          ]),
          wait: ms => new Promise(resolve => setTimeout(resolve, ms))
        });
        calendarVisibilityTrace.push({ phase: "before_correction", stable: settled.stable, reads: settled.reads });
        latest = settled.state;
        if (!settled.stable || (!pickerStateReady(latest) && !recoverableZeroYearPanel(latest))) {
          return { state: latest, error: "日历导航后的目标位置持续变化，未执行位置校正" };
        }
        correction = calendarTargetVisibilityCorrection({
          viewportHeight: latest.viewportHeight, targets: latest.surfaceTargets
        });
        if (correction.reason === "visible") return { state: latest, error: null };
      }
      if (correction.shiftY === 0) {
        return {
          state: latest,
          error: correction.reason === "insufficient_viewport"
            ? "当前视口无法同时容纳日历本阶段的可信点击目标"
            : "日历目标位于安全区域内但未通过实时命中验证"
        };
      }
      const requestedStepY = calendarTargetVisibilityStep({
        correction,
        viewportHeight: latest.viewportHeight
      });
      if (requestedStepY === 0) {
        return { state: latest, error: "日历渐进校正无法计算安全移动步长" };
      }
      const moved = await shiftPickerSurface(requestedStepY);
      await new Promise((resolve) => setTimeout(resolve, 220));
      let next = await readState();
      if (!pickerStateReady(next) && !recoverableZeroYearPanel(next)) {
        return { state: next, error: "渐进调整日历弹层位置后状态丢失" };
      }
      const nextCorrection = calendarTargetVisibilityCorrection({
        viewportHeight: next.viewportHeight,
        targets: next.surfaceTargets
      });
      let progress = calendarTargetVisibilityProgress({
        before: correction,
        after: nextCorrection,
        requestedStepY,
        actualShiftY: moved
      });
      let extraReads = 0;
      if (controlAdapter.code === "moka.date-picker.trusted-pointer.v9" && progress === "not_improving") {
        const settled = await settleCalendarVisibilityProgress({
          initial: next, read: readState,
          assess: state => state ? calendarTargetVisibilityProgress({before: correction,
            after: calendarTargetVisibilityCorrection({viewportHeight: state.viewportHeight, targets: state.surfaceTargets}),
            requestedStepY, actualShiftY: moved}) : "no_movement",
          wait: ms => new Promise(resolve => setTimeout(resolve, ms))
        });
        next = settled.state; progress = settled.progress; extraReads = settled.extraReads;
      }
      calendarVisibilityTrace.push({before: correction, firstAfter: nextCorrection, requestedStepY,
        actualShiftY: moved, progress, extraReads, targetsAfter: next?.surfaceTargets ?? []});
      if (progress === "complete") return { state: next, error: null };
      if (progress === "no_movement") {
        return { state: next, error: "日历目标被遮挡且页面无法执行渐进位置校正" };
      }
      if (progress === "wrong_direction") {
        return { state: next, error: "日历渐进校正的实际移动方向与遮挡方向不一致" };
      }
      if (progress === "direction_reversed") {
        return { state: next, error: "日历渐进校正方向发生反复，已停止以避免来回滚动" };
      }
      if (progress === "not_improving") {
        return { state: next, error: "日历渐进校正没有缩小目标遮挡距离" };
      }
      latest = next;
    }
    return { state: latest, error: "日历渐进校正达到安全上限后仍未完全显露" };
  };

  let dateDriverStage = "open";
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    await prepareBackgroundSurface();
    const opening = await openMokaCalendarOnce({
      inspect: async () => { await readState(); return lastPickerProbe; },
      ready: (state) => pickerStateReady(state) || recoverableZeroYearPanel(state),
      prepare: async () => {
        const point = await locateOpenPoint();
        return point?.hitAccepted ? point : null;
      },
      click: clickTrustedPoint,
      wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
    });
    let pickerState = opening.state;
    if (opening.failureCode || (!pickerStateReady(pickerState) && !recoverableZeroYearPanel(pickerState))) {
      const failureCode = opening.failureCode ?? "popup_state_unparsed";
      return result({
        success: false,
        actual: located.value,
        error: dateControlInteractionFailure(mokaCalendarOpeningFailureMessage(failureCode)),
        driverStage: "open",
        driverFailureCode: failureCode,
        driverDiagnostics: { ...opening.diagnostics, status: opening.probe.status,
          fieldMatchCount: opening.probe.fieldMatchCount, popupCount: opening.probe.popupCount,
          panelMode: pickerState?.mode ?? null,
          yearTitleMatches: pickerState?.yearTitleMatches ?? 0,
          monthTitleMatches: pickerState?.monthTitleMatches ?? 0,
          yearOptionMatches: pickerState?.yearOptionMatches ?? 0,
          monthOptionMatches: pickerState?.monthOptionMatches ?? 0,
          dayOptionMatches: pickerState?.dayOptionMatches ?? 0 }
      });
    }
    if (recoverableZeroYearPanel(pickerState)) {
      dateDriverStage = "recover_panel";
      const positioned = await ensurePickerTargetsVisible(pickerState);
      const before = positioned.state;
      if (positioned.error || !recoverableZeroYearPanel(before) || !before.zeroYearRecoveryNext ||
        before.fieldValue !== located.value) {
        return result({ success: false, actual: before?.fieldValue ?? located.value,
          error: dateControlInteractionFailure(positioned.error ?? "异常年份面板没有唯一且可验证的恢复导航目标"),
          driverStage: dateDriverStage, driverFailureCode: "zero_year_recovery_not_clickable" });
      }
      // Exactly one evidenced site navigation action; no clearing, private-store
      // writes, alternative Driver, or repeated recovery. The committed value
      // must stay intact until the later explicit year/month selection.
      await clickTrustedPoint(before.zeroYearRecoveryNext);
      for (let attempt = 0; attempt < 15; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 180 : 100));
        pickerState = await readState();
        if (pickerStateReady(pickerState)) break;
        if (lastPickerProbe.status !== "popup_open") break;
      }
      if (!pickerStateReady(pickerState) || pickerState.mode !== "month" || pickerState.year !== 1901 ||
        pickerState.fieldValue !== before.fieldValue || !mokaCalendarPanelStructureMatches(pickerState)) {
        return result({ success: false, actual: pickerState?.fieldValue ?? located.value,
          error: dateControlInteractionFailure("异常年份导航后未恢复为已验证的正常年月面板，已停止且不重复点击"),
          driverStage: dateDriverStage, driverFailureCode: "zero_year_recovery_unconfirmed" });
      }
    }
    if (controlAdapter.code === "moka.date-picker.trusted-pointer.v9" &&
      !mokaCalendarPanelStructureMatches(pickerState)) {
      return result({
        success: false,
        actual: located.value,
        error: unsupportedRequiredControlFailure({
          label: field.label,
          controlType: "未验证的 Moka 日历弹层",
          adapterCode: controlAdapter.code,
          detail: "通用候选控件打开后未形成唯一且完整的日、月或年份面板结构"
        })
      });
    }
    dateDriverStage = "visibility";
    let positioned = await ensurePickerTargetsVisible(pickerState);
    if (positioned.error || !pickerStateReady(positioned.state)) {
      return result({
        success: false,
        actual: "",
        error: dateControlInteractionFailure(positioned.error ?? "调整日历弹层位置后状态丢失")
      });
    }
    pickerState = positioned.state;
    if (["month", "year"].includes(pickerState.mode) && datePrecision !== "month") {
      return result({
        success: false,
        actual: "",
        error: dateControlInteractionFailure("日期字段要求完整年月日，但页面仅提供年月面板")
      });
    }
    dateDriverStage = "navigate_select";
    if (datePrecision === "month" && ["month", "year"].includes(pickerState.mode)) {
      if (pickerState.mode === "month" && pickerState.year !== instruction.dateValue.year) {
        if (!pickerState.yearTitle) {
          return result({
            success: false,
            actual: "",
            error: dateControlInteractionFailure("年月控件没有唯一可点击的年份标题")
          });
        }
        await clickTrustedPoint(pickerState.yearTitle);
        for (let attempt = 0; attempt < 15; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 180 : 100));
          pickerState = await readState();
          if (pickerStateReady(pickerState) && pickerState.mode === "year") break;
        }
        positioned = await ensurePickerTargetsVisible(pickerState);
        if (positioned.error || !pickerStateReady(positioned.state) || positioned.state.mode !== "year") {
          return result({
            success: false,
            actual: "",
            error: dateControlInteractionFailure(positioned.error ?? "年份面板状态丢失")
          });
        }
        pickerState = positioned.state;
      }
      if (pickerState.mode === "year") {
        const decadePlan = yearRangeNavigationPlan(
          pickerState.yearRangeStart,
          pickerState.yearRangeEnd,
          instruction.dateValue.year
        );
        for (let step = 0; step < decadePlan.steps; step += 1) {
          const point = decadePlan.direction === "previous"
            ? pickerState.previousDecade
            : pickerState.nextDecade;
          if (!point) {
            return result({
              success: false,
              actual: "",
              error: dateControlInteractionFailure("年份面板没有唯一可点击的十年导航按钮")
            });
          }
          await clickTrustedPoint(point);
          await new Promise((resolve) => setTimeout(resolve, 180));
          pickerState = await readState();
          if (!pickerStateReady(pickerState) || pickerState.mode !== "year") break;
          positioned = await ensurePickerTargetsVisible(pickerState);
          if (positioned.error || !pickerStateReady(positioned.state) || positioned.state.mode !== "year") {
            return result({
              success: false,
              actual: "",
              error: dateControlInteractionFailure(positioned.error ?? "十年导航后年份面板状态丢失")
            });
          }
          pickerState = positioned.state;
        }
        if (!pickerStateReady(pickerState) || pickerState.mode !== "year") {
          return result({
            success: false,
            actual: "",
            error: dateControlInteractionFailure("十年导航后年份面板状态丢失")
          });
        }
        if (!pickerState.targetYear || pickerState.targetYearMatches !== 1) {
          return result({
            success: false,
            actual: "",
            error: dateControlInteractionFailure(
              `年份面板未找到唯一可点击的 ${instruction.dateValue.year} 年（命中 ` +
              `${pickerState.targetYearMatches} 个）`
            )
          });
        }
        await clickTrustedPoint(pickerState.targetYear);
        for (let attempt = 0; attempt < 15; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 180 : 100));
          pickerState = await readState();
          if (pickerStateReady(pickerState) && pickerState.mode === "month") break;
        }
        positioned = await ensurePickerTargetsVisible(pickerState);
        if (positioned.error || !pickerStateReady(positioned.state) || positioned.state.mode !== "month") {
          return result({
            success: false,
            actual: "",
            error: dateControlInteractionFailure(positioned.error ?? "月份面板状态丢失")
          });
        }
        pickerState = positioned.state;
      }
      if (!pickerStateReady(pickerState) || pickerState.mode !== "month" ||
        pickerState.year !== instruction.dateValue.year) {
        return result({
          success: false,
          actual: "",
          error: dateControlInteractionFailure("选择目标年份后未返回对应的月份面板")
        });
      }
      if (!pickerState.targetMonth || pickerState.targetMonthMatches !== 1) {
        return result({
          success: false,
          actual: "",
          error: dateControlInteractionFailure(
            `年月控件未找到唯一可点击的 ${instruction.dateValue.month} 月（命中 ` +
            `${pickerState.targetMonthMatches} 个）`
          )
        });
      }
      await clickTrustedPoint(pickerState.targetMonth);
      if (datePrecision !== "month") {
        for (let attempt = 0; attempt < 15; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 180 : 100));
          pickerState = await readState();
          if (pickerStateReady(pickerState) && pickerState.mode === "day" &&
            pickerState.year === instruction.dateValue.year &&
            pickerState.month === instruction.dateValue.month) break;
        }
        positioned = await ensurePickerTargetsVisible(pickerState);
        if (positioned.error || !pickerStateReady(positioned.state) ||
          positioned.state.mode !== "day") {
          return result({
            success: false,
            actual: "",
            error: dateControlInteractionFailure(positioned.error ?? "选择月份后日期面板状态丢失")
          });
        }
        pickerState = positioned.state;
        if (!pickerState.targetDay || pickerState.targetDayMatches !== 1) {
          return result({
            success: false,
            actual: "",
            error: dateControlInteractionFailure(
              `日期控件未找到唯一可点击的当月 ${instruction.dateValue.day} 日（命中 ` +
              `${pickerState.targetDayMatches} 个）`
            )
          });
        }
        await clickTrustedPoint(pickerState.targetDay);
      }
    } else {
      const yearPlan = datePickerNavigationPlan(pickerState, instruction.dateValue);
      for (let step = 0; step < yearPlan.yearSteps; step += 1) {
        const point = yearPlan.yearDirection === "previous" ? pickerState.previousYear : pickerState.nextYear;
        if (!point) {
          return result({
            success: false,
            actual: "",
            error: dateControlInteractionFailure("日期控件没有唯一可点击的年份导航按钮")
          });
        }
        await clickTrustedPoint(point);
        await new Promise((resolve) => setTimeout(resolve, 180));
        pickerState = await readState();
        if (!pickerStateReady(pickerState)) break;
        positioned = await ensurePickerTargetsVisible(pickerState);
        if (positioned.error || !pickerStateReady(positioned.state) || positioned.state.mode !== "day") {
          return result({
            success: false,
            actual: "",
            error: dateControlInteractionFailure(positioned.error ?? "年份导航后日历状态丢失")
          });
        }
        pickerState = positioned.state;
      }
      if (!pickerStateReady(pickerState)) {
        return result({ success: false, actual: "", error: dateControlInteractionFailure("年份导航后日历状态丢失") });
      }
      const monthPlan = datePickerNavigationPlan(pickerState, instruction.dateValue);
      for (let step = 0; step < monthPlan.monthSteps; step += 1) {
        const point = monthPlan.monthDirection === "previous" ? pickerState.previousMonth : pickerState.nextMonth;
        if (!point) {
          return result({
            success: false,
            actual: "",
            error: dateControlInteractionFailure("日期控件没有唯一可点击的月份导航按钮")
          });
        }
        await clickTrustedPoint(point);
        await new Promise((resolve) => setTimeout(resolve, 180));
        pickerState = await readState();
        if (!pickerStateReady(pickerState)) break;
        positioned = await ensurePickerTargetsVisible(pickerState);
        if (positioned.error || !pickerStateReady(positioned.state) || positioned.state.mode !== "day") {
          return result({
            success: false,
            actual: "",
            error: dateControlInteractionFailure(positioned.error ?? "月份导航后日历状态丢失")
          });
        }
        pickerState = positioned.state;
      }
      if (pickerState?.year !== instruction.dateValue.year || pickerState.month !== instruction.dateValue.month) {
        return result({ success: false, actual: "", error: dateControlInteractionFailure("日期控件没有到达目标年月") });
      }
      if (!pickerState.targetDay || pickerState.targetDayMatches !== 1) {
        return result({
          success: false,
          actual: "",
          error: dateControlInteractionFailure(
            `日期控件未找到唯一可点击的当月 ${instruction.dateValue.day} 日（命中 ` +
            `${pickerState.targetDayMatches} 个）`
          )
        });
      }
      await clickTrustedPoint(pickerState.targetDay);
    }
    dateDriverStage = "readback";
    await new Promise((resolve) => setTimeout(resolve, 700));
    const readback = await runtimeValue<{ actual: string; hasRequiredError: boolean }>(`(() => {
      const element = document.querySelector(${selector});
      if (!(element instanceof HTMLElement)) return {actual:'',hasRequiredError:false};
      const fieldRoot = element.closest("[class*='apply-field'],[class*='form-item'],[class*='field']") ||
        element.parentElement;
      const rendered = (candidate) => {
        const rect = candidate.getBoundingClientRect();
        const style = getComputedStyle(candidate);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' &&
          style.visibility !== 'hidden' && style.opacity !== '0';
      };
      return {
        actual: String(element.value || element.getAttribute('aria-valuetext') ||
          element.getAttribute('data-value') || ''),
        hasRequiredError: [...(fieldRoot?.querySelectorAll('span,div,p') || [])]
          .some((candidate) => rendered(candidate) &&
            /必填项未填写/.test(String(candidate.textContent || '').trim()))
      };
    })()`);
    const actual = String(readback?.actual ?? "");
    const success = structuredDateReadbackMatches(actual, instruction.dateValue, datePrecision);
    return result({
      success: success && !readback?.hasRequiredError,
      actual,
      error: !success
        ? dateControlInteractionFailure(
          datePrecision === "month"
            ? `可信年月选择后未形成可回读的 YYYY-MM 值（字段：${field.label}）`
            : "可信日历选择后未形成可回读的日期值"
        )
        : readback?.hasRequiredError
          ? dateControlInteractionFailure("日期回读成功但页面必填校验未消失")
          : null
    });
  } catch (error) {
    return result({
      success: false,
      actual: located.value,
      error: dateControlInteractionFailure(
        `Moka 可信指针 Driver 执行失败：${error instanceof Error ? error.message : String(error)}`
      ),
      driverStage: dateDriverStage,
      driverFailureCode: error instanceof Error && error.message === "moka_calendar_probe_exception"
        ? "probe_exception" : "driver_interrupted",
      driverDiagnostics: { status: lastPickerProbe.status, fieldMatchCount: lastPickerProbe.fieldMatchCount,
        popupCount: lastPickerProbe.popupCount, probeException: calendarProbeException }
    });
  } finally {
    if (attached && focusEmulationEnabled) {
      await releaseTrustedPointerSurface(sendDebuggerCommand).catch(() => undefined);
    }
    if (attached) await chrome.debugger.detach(target).catch(() => undefined);
  }
}

async function executeMokaNativePlaceInstructionWithTrustedPointerDriver(
  tabId: number,
  observation: PageObservation,
  field: PageObservation["fields"][number],
  instruction: FillInstruction
): Promise<FillResult | null> {
  if (!isMokaApplicationUrl(observation.url)) return null;

  const expected = String(instruction.value ?? "").trim();
  const inspected = await executeInterruptibleScript({
    target: { tabId },
    world: "MAIN",
    func: (targetSelector: string) => {
      const element = document.querySelector(targetSelector);
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (rect.width <= 0 || rect.height <= 0 || style.display === "none" ||
        style.visibility === "hidden" || style.opacity === "0") return null;
      const classNames: string[] = [];
      let classNode: HTMLElement | null = element;
      for (let depth = 0; classNode && depth < 8; depth += 1) {
        classNames.push(String(classNode.className || ""));
        classNode = classNode.parentElement;
      }
      return {
        tag: element.tagName,
        type: element instanceof HTMLInputElement ? element.type : "",
        readOnly: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
          ? element.readOnly
          : false,
        placeholder: element.getAttribute("placeholder") || "",
        classNames,
        value: String((element as HTMLInputElement).value ?? element.textContent ?? "")
      };
    },
    args: [instruction.selector]
  });
  const located = inspected[0]?.result;
  if (!located) {
    return {
      fieldId: field.fieldId,
      success: false,
      expected,
      actual: "",
      error: "native_place_control_interaction_failed: 动态页面中未重新定位到 Moka 籍贯字段"
    };
  }
  const controlAdapter = resolveControlAdapter({
    applicationUrl: observation.url,
    label: field.label,
    semanticKey: instruction.semanticKey ?? "",
    type: located.type || field.type,
    controlKind: field.controlKind || "",
    tagName: located.tag,
    readOnly: located.readOnly,
    placeholder: located.placeholder,
    classNames: located.classNames
  });
  const lockedFailure = lockedControlRouteFailure(field, instruction, controlAdapter);
  if (lockedFailure) return lockedFailure;
  if (controlAdapter.code !== "moka.native-place.cascader.trusted-pointer.v1") {
    return {
      fieldId: field.fieldId,
      success: false,
      expected,
      actual: located.value,
      error: unsupportedRequiredControlFailure({
        label: field.label,
        controlType: controlAdapter.diagnostic.controlName,
        adapterCode: controlAdapter.code,
        detail: `Moka 籍贯字段没有命中专用签名（${controlAdapter.reason}）`
      }),
      controlAdapter: controlAdapter.diagnostic
    };
  }

  const informationGate = guardFieldInformation({
    ...field,
    currentValue: located.value,
    informationRequirement: controlAdapter.registration?.informationRequirement,
    domHints: { ...field.domHints, placeholder: located.placeholder }
  }, instruction.value);
  if (informationGate) return informationGate;

  const target = { tabId };
  let attached = false;
  const sendDebuggerCommand = async (
    method: string,
    params?: Record<string, unknown>
  ): Promise<unknown> => sendInterruptibleDebuggerCommand(target, method, params);
  try {
    const targetTab = await chrome.tabs.get(tabId);
    const activeTabBefore = (await chrome.tabs.query({ active: true, windowId: targetTab.windowId }))[0]?.id ?? null;
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    await prepareFocusEmulatedTrustedPointerSurface(sendDebuggerCommand);
    const execution = await executeMokaNativePlaceDriver({
      tabId,
      selector: instruction.selector,
      expected,
      clickPoint: (point) => dispatchTrustedPointerClick(sendDebuggerCommand, point),
      scrollPoint: (point, deltaY) => dispatchTrustedPointerScroll(sendDebuggerCommand, point, deltaY),
      wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
    });
    return {
      fieldId: field.fieldId,
      success: execution.success,
      expected,
      actual: execution.actual,
      error: execution.error,
      driverStage: execution.stage,
      driverFailureCode: String(execution.diagnostics.status ?? "native_place_driver_failed"),
      availableOptions: execution.availableOptions,
      driverDiagnostics: {
        ...execution.diagnostics,
        activeTabBefore,
        activeTabAfter: (await chrome.tabs.query({ active: true, windowId: targetTab.windowId }))[0]?.id ?? null,
        targetActiveBefore: targetTab.active,
        buildCommit: recruitingAiPluginInfo().buildCommit
      },
      controlAdapter: controlAdapter.diagnostic
    };
  } catch (error) {
    return {
      fieldId: field.fieldId,
      success: false,
      expected,
      actual: located.value,
      error: `native_place_control_interaction_failed: Moka 籍贯后台可信指针 Driver 执行失败：${error instanceof Error ? error.message : String(error)}`,
      driverStage: "open",
      driverFailureCode: "driver_interrupted",
      controlAdapter: controlAdapter.diagnostic
    };
  } finally {
    if (attached) {
      await releaseTrustedPointerSurface(sendDebuggerCommand).catch(() => undefined);
      await chrome.debugger.detach(target).catch(() => undefined);
    }
  }
}

async function discoverEvidencedMokaLocationFieldOptionsWithTrustedFocusDriver(
  tabId: number,
  applicationUrl: string,
  field: PageFieldObservation,
  selectedRegistrationId?: string
): Promise<string[] | null> {
  if (!isMokaApplicationUrl(applicationUrl) ||
    !isDeepSeekLocationField({
      label: field.label,
      stableFieldKey: field.stableFieldKey
    })) return null;

  const inspected = await executeInterruptibleScript({
    target: { tabId },
    world: "MAIN",
    func: (targetSelector: string) => {
      const element = document.querySelector(targetSelector);
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (rect.width <= 0 || rect.height <= 0 || style.display === "none" ||
        style.visibility === "hidden" || style.opacity === "0") return null;
      const classNames: string[] = [];
      let current: HTMLElement | null = element;
      for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
        classNames.push(String(current.className || ""));
      }
      return {
        tag: element.tagName,
        type: element instanceof HTMLInputElement ? element.type : "",
        readOnly: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
          ? element.readOnly
          : false,
        placeholder: element.getAttribute("placeholder") || "",
        classNames
      };
    },
    args: [field.selector]
  });
  const located = inspected[0]?.result;
  if (!located) {
    throw new Error(
      "location_control_interaction_failed: 动态页面中未重新定位到已登记 Moka 意向工作城市字段"
    );
  }
  const controlAdapter = resolveControlAdapter({
    applicationUrl,
    label: field.label,
    semanticKey: field.stableFieldKey ?? "",
    type: located.type || field.type,
    controlKind: field.controlKind || "",
    tagName: located.tag,
    readOnly: located.readOnly,
    placeholder: located.placeholder,
    classNames: located.classNames
  });
  if (!MOKA_LOCATION_DRIVER_CODES.has(controlAdapter.code) ||
    selectedRegistrationId && selectedRegistrationId !== controlAdapter.diagnostic.registrationId) {
    throw new Error(unsupportedRequiredControlFailure({
      label: field.label,
      controlType: controlAdapter.diagnostic.controlName,
      adapterCode: controlAdapter.code,
      detail: `已登记 Moka 地点字段没有命中专用签名（${controlAdapter.reason}）`
    }));
  }

  const target = { tabId };
  let attached = false;
  let focusEmulationEnabled = false;
  const sendDebuggerCommand = async (
    method: string,
    params?: Record<string, unknown>
  ): Promise<unknown> => sendInterruptibleDebuggerCommand(target, method, params);
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    const execution = await executeMokaLocationOptionDiscoveryDriver({
      tabId,
      selector: field.selector,
      prepareSurface: async () => {
        focusEmulationEnabled = true;
        await prepareFocusEmulatedTrustedPointerSurface(sendDebuggerCommand);
        const focusState = await sendDebuggerCommand("Runtime.evaluate", {
          expression: "document.hasFocus()",
          returnByValue: true
        }) as { result?: { value?: boolean } };
        if (focusState.result?.value !== true) throw new Error("后台目标未确认焦点模拟状态");
      },
      clickPoint: (point) => dispatchTrustedPointerClick(sendDebuggerCommand, point),
      closePopup: async () => {
        const commitTarget = await executeInterruptibleScript({
          target: { tabId },
          world: "MAIN",
          func: inspectDeepSeekLocationCommitPointInPage,
          args: [field.selector]
        });
        const point = commitTarget[0]?.result ?? null;
        if (!point) return false;
        await dispatchTrustedPointerClick(sendDebuggerCommand, point);
        return true;
      },
      wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
    });
    if (!execution.success || execution.options.length === 0) {
      throw new Error(execution.error ?? "location_control_interaction_failed: 未发现可选城市");
    }
    return execution.options;
  } finally {
    if (attached && focusEmulationEnabled) {
      await releaseTrustedPointerSurface(sendDebuggerCommand).catch(() => undefined);
    }
    if (attached) await chrome.debugger.detach(target).catch(() => undefined);
  }
}

async function executeDeepSeekLocationInstructionWithTrustedFocusDriver(
  tabId: number,
  observation: Pick<PageObservation, "url">,
  field: PageObservation["fields"][number],
  instruction: FillInstruction,
  options: { allowPreopenedExpectedLeaf?: boolean } = {}
): Promise<FillResult | null> {
  if (!isMokaApplicationUrl(observation.url) ||
    !isMokaSelectableLocationControl(field) ||
    !isDeepSeekLocationField({
      label: field.label,
      stableFieldKey: field.stableFieldKey,
      semanticKey: instruction.semanticKey
    })) return null;

  const expected = String(instruction.value ?? "").trim();
  const inspected = await executeInterruptibleScript({
    target: { tabId },
    world: "MAIN",
    func: (targetSelector: string) => {
      const element = document.querySelector(targetSelector);
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (rect.width <= 0 || rect.height <= 0 || style.display === "none" ||
        style.visibility === "hidden" || style.opacity === "0") return null;
      const classNames: string[] = [];
      let classNode: HTMLElement | null = element;
      for (let depth = 0; classNode && depth < 5; depth += 1) {
        classNames.push(String(classNode.className || ""));
        classNode = classNode.parentElement;
      }
      return {
        tag: element.tagName,
        type: element instanceof HTMLInputElement ? element.type : "",
        readOnly: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
          ? element.readOnly
          : false,
        placeholder: element.getAttribute("placeholder") || "",
        classNames,
        visibilityState: document.visibilityState,
        value: String((element as HTMLInputElement).value ?? element.textContent ?? "")
      };
    },
    args: [instruction.selector]
  });
  const located = inspected[0]?.result;
  if (!located) {
    return {
      fieldId: field.fieldId,
      success: false,
      expected,
      actual: "",
      error: "location_control_interaction_failed: 动态页面中未重新定位到 DeepSeek 意向工作城市字段"
    };
  }

  const controlAdapter = resolveControlAdapter({
    applicationUrl: observation.url,
    label: field.label,
    semanticKey: [field.stableFieldKey, instruction.semanticKey].filter(Boolean).join(" "),
    type: located.type || field.type,
    controlKind: field.controlKind || "",
    tagName: located.tag,
    readOnly: located.readOnly,
    placeholder: located.placeholder,
    classNames: located.classNames
  });
  const lockedFailure = lockedControlRouteFailure(field, instruction, controlAdapter);
  if (lockedFailure) return lockedFailure;
  // A city label identifies a fact, not a widget. Resolve the live control
  // before selecting its only driver; a native city input is not a failed
  // attempt at the neighbouring custom city selector.
  // This handler is entered only after central selection of the location
  // Driver. A live native signature is a changed target, never a fallback.
  if (!MOKA_LOCATION_DRIVER_CODES.has(controlAdapter.code)) {
    return {
      fieldId: field.fieldId,
      success: false,
      expected,
      actual: located.value,
      error: unsupportedRequiredControlFailure({
        label: field.label,
        controlType: controlAdapter.diagnostic.controlName,
        adapterCode: controlAdapter.code,
        detail: `Moka 地点字段没有命中专用签名（${controlAdapter.reason}）`
      }),
      controlAdapter: controlAdapter.diagnostic
    };
  }
  const result = (input: {
    success: boolean;
    actual: string;
    error: string | null;
    driverStage?: string;
    driverFailureCode?: string | null;
    availableOptions?: string[];
    driverDiagnostics?: Record<string, unknown>;
  }): FillResult => ({
    fieldId: field.fieldId,
    expected,
    ...input,
    controlAdapter: controlAdapter.diagnostic
  });
  const activeTabId = async (): Promise<number | null> => {
    const active = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []))[0];
    return active?.id ?? null;
  };
  const target = { tabId };
  let attached = false;
  let focusEmulationEnabled = false;
  let focusEmulationVerified = false;
  const sendDebuggerCommand = async (
    method: string,
    params?: Record<string, unknown>
  ): Promise<unknown> => sendInterruptibleDebuggerCommand(target, method, params);
  try {
    const activeTabBefore = await activeTabId();
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    const execution = await executeDeepSeekLocationDriver({
      tabId,
      selector: instruction.selector,
      expected,
      allowPreopenedExpectedLeaf: options.allowPreopenedExpectedLeaf,
      prepareSurface: async () => {
        focusEmulationEnabled = true;
        await prepareFocusEmulatedTrustedPointerSurface(sendDebuggerCommand);
        const focusState = await sendDebuggerCommand("Runtime.evaluate", {
          expression: "document.hasFocus()",
          returnByValue: true
        }) as { result?: { value?: boolean } };
        focusEmulationVerified = focusState.result?.value === true;
        if (!focusEmulationVerified) {
          throw new Error("后台目标未确认焦点模拟状态");
        }
      },
      clickPoint: (point) => dispatchTrustedPointerClick(sendDebuggerCommand, point),
      commitSelection: async () => {
        const commitTarget = await executeInterruptibleScript({
          target: { tabId },
          world: "MAIN",
          func: inspectDeepSeekLocationCommitPointInPage,
          args: [instruction.selector]
        });
        const point = commitTarget[0]?.result ?? null;
        if (!point) return false;
        await dispatchTrustedPointerClick(sendDebuggerCommand, point);
        return true;
      },
      wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
    });
    const activeTabAfter = await activeTabId();
    const driverDiagnostics: DeepSeekLocationDriverDiagnostics & {
      buildCommit: string;
      activeTabBefore: number | null;
      activeTabAfter: number | null;
      activeTabPreserved: boolean;
      focusEmulationEnabled: boolean;
      focusEmulationVerified: boolean;
    } = {
      ...execution.diagnostics,
      buildCommit: recruitingAiPluginInfo().buildCommit,
      activeTabBefore,
      activeTabAfter,
      activeTabPreserved: activeTabBefore === null || activeTabAfter === null || activeTabBefore === activeTabAfter,
      focusEmulationEnabled,
      focusEmulationVerified
    };
    return result({
      success: execution.success,
      actual: execution.actual,
      error: execution.error,
      driverStage: execution.stage,
      driverFailureCode: execution.diagnostics.failureCode,
      availableOptions: execution.availableOptions,
      driverDiagnostics: driverDiagnostics as unknown as Record<string, unknown>
    });
  } catch (error) {
    return result({
      success: false,
      actual: located.value,
      error: `location_control_interaction_failed: Moka 地点后台焦点模拟可信指针 Driver 执行失败：${error instanceof Error ? error.message : String(error)}`,
      driverStage: "detect",
      driverFailureCode: "driver_interrupted"
    });
  } finally {
    if (attached && focusEmulationEnabled) {
      await releaseTrustedPointerSurface(sendDebuggerCommand).catch(() => undefined);
    }
    if (attached) await chrome.debugger.detach(target).catch(() => undefined);
  }
}

async function resolveSoleMokaPreferredLocationOption(input: {
  tabId: number;
  observation: PageObservation;
}): Promise<{
  observation: PageObservation;
  field: PageFieldObservation;
  value: string;
  result: FillResult;
} | null> {
  if (!isEvidencedMokaLocationApplicationUrl(input.observation.url)) return null;
  const unresolvedCities = input.observation.fields.filter((field) =>
    field.required && !observedFieldHasValue(field) && isMokaPreferredLocationField({
      applicationUrl: input.observation.url,
      field
    })
  );
  for (const field of unresolvedCities) {
    const [discovered] = await withDiscoveredRequiredFieldOptions(input.tabId, [field]);
    const options = discovered?.options ?? [];
    const value = soleRequiredMokaPreferredCityOption({ ...field, options });
    if (!value) continue;
    const semanticKey = "site.liveRequiredSingleOption.preferredCity";
    const instruction = instructionFromObservedField(field, value, semanticKey);
    if (!instruction) continue;
    const result = (await executeApplicationFillInstructions(input.tabId, input.observation, [instruction]))[0];
    if (!result) continue;
    const observation = await stableApplicationObservation(input.tabId);
    const readbackField = observation.url === input.observation.url
      ? bindObservedInstruction(observation, { ...instruction, stableFieldKey: field.stableFieldKey, expectedLabel: field.label })
      : null;
    if (!result.success || !result.controlAdapter || !readbackField || !registeredControlReadbackMatches({
      field: readbackField, expected: value, semanticKey, controlAdapter: result.controlAdapter
    }).matches) {
      throw mokaLocationSelectionUnconfirmedError({
        field,
        expectedValue: value,
        actualValue: readbackField?.currentValue ?? result.actual,
        result,
        source: "live_sole_resolver"
      });
    }
    return { observation, field, value, result };
  }
  return null;
}

async function executeMokaRecruitingSourceInstructionWithTrustedFocusDriver(
  tabId: number,
  observation: PageObservation,
  field: PageObservation["fields"][number],
  instruction: FillInstruction,
  discoverOptions = false
): Promise<FillResult | null> {
  const fieldIdentity = {
      label: field.label,
      stableFieldKey: field.stableFieldKey,
      semanticKey: instruction.semanticKey
  };
  const sinaWeiboFrequency = isMokaSinaWeiboFrequencyApplicationUrl(observation.url) &&
    isMokaSinaWeiboFrequencyField(fieldIdentity);
  const eqhrTravelAcceptance = isMokaEqhrTravelAcceptanceApplicationUrl(observation.url) &&
    isMokaEqhrTravelAcceptanceField(fieldIdentity);
  const yongxingEthnicity = isMokaYongxingEthnicityApplicationUrl(observation.url) &&
    isMokaYongxingEthnicityField(fieldIdentity);
  const sungrowIdentityDocumentType = isMokaSungrowApplicationUrl(observation.url) &&
    isMokaSungrowIdentityDocumentTypeField(fieldIdentity);
  const sungrowRelativeEmployment = isMokaSungrowApplicationUrl(observation.url) &&
    isMokaSungrowRelativeEmploymentField(fieldIdentity);
  const recruitingSource = isMokaRecruitingSourceApplicationUrl(observation.url) &&
    isMokaRecruitingSourceField(fieldIdentity);
  if (!sinaWeiboFrequency && !eqhrTravelAcceptance && !yongxingEthnicity && !sungrowIdentityDocumentType &&
    !sungrowRelativeEmployment && !recruitingSource) return null;
  if (field.type !== "combobox" && field.controlKind !== "combobox") return null;

  const expected = String(instruction.value ?? "");
  const inspected = await executeInterruptibleScript({
    target: { tabId },
    world: "MAIN",
    func: (targetSelector: string) => {
      const element = document.querySelector(targetSelector);
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (rect.width <= 0 || rect.height <= 0 || style.display === "none" ||
        style.visibility === "hidden" || style.opacity === "0") return null;
      const classNames: string[] = [];
      let current: HTMLElement | null = element;
      for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
        classNames.push(String(current.className || ""));
      }
      return {
        tag: element.tagName,
        type: element instanceof HTMLInputElement ? element.type : "",
        readOnly: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
          ? element.readOnly
          : false,
        placeholder: element.getAttribute("placeholder") || "",
        classNames,
        value: String((element as HTMLInputElement).value ?? element.textContent ?? "")
      };
    },
    args: [instruction.selector]
  });
  const located = inspected[0]?.result;
  if (!located) {
    return {
      fieldId: field.fieldId,
      success: false,
      expected,
      actual: "",
      error: "recruiting_source_control_interaction_failed: 动态页面中未重新定位到 Moka 招聘信息来源字段",
      driverStage: "detect",
      driverFailureCode: "control_missing"
    };
  }
  const controlAdapter = resolveControlAdapter({
    applicationUrl: observation.url,
    label: field.label,
    semanticKey: instruction.semanticKey ?? "",
    type: located.type || field.type,
    controlKind: field.controlKind || "",
    tagName: located.tag,
    readOnly: located.readOnly,
    placeholder: located.placeholder,
    classNames: located.classNames
  });
  const lockedFailure = lockedControlRouteFailure(field, instruction, controlAdapter);
  if (lockedFailure) return lockedFailure;
  const expectedAdapterCode = sinaWeiboFrequency
    ? "moka.sina.weibo-frequency.trusted-focus.v1"
    : eqhrTravelAcceptance
      ? "moka.eqhr.travel-acceptance.trusted-focus.v1"
      : yongxingEthnicity
        ? "moka.yongxing.ethnicity.trusted-focus.v1"
      : sungrowIdentityDocumentType
        ? "moka.sungrow.identity-document-type.trusted-focus.v1"
        : sungrowRelativeEmployment
          ? "moka.sungrow.relative-employment.trusted-focus.v1"
          : "moka.recruiting-source.trusted-focus.v1";
  const fieldKind = sinaWeiboFrequency
    ? "sina_weibo_frequency"
    : eqhrTravelAcceptance
      ? "eqhr_travel_acceptance"
      : yongxingEthnicity
        ? "yongxing_ethnicity"
      : sungrowIdentityDocumentType
        ? "sungrow_identity_document_type"
        : sungrowRelativeEmployment
          ? "sungrow_relative_employment"
          : "recruiting_source";
  if (controlAdapter.code !== expectedAdapterCode) {
    return {
      fieldId: field.fieldId,
      success: false,
      expected,
      actual: located.value,
      error: unsupportedRequiredControlFailure({
        label: field.label,
        controlType: controlAdapter.diagnostic.controlName,
        adapterCode: controlAdapter.code,
        detail: `Moka 招聘信息来源字段没有命中专用签名（${controlAdapter.reason}）`
      }),
      controlAdapter: controlAdapter.diagnostic
    };
  }
  const result = (input: {
    success: boolean;
    actual: string;
    error: string | null;
    driverStage?: string;
    driverFailureCode?: string | null;
    availableOptions?: string[];
    driverDiagnostics?: Record<string, unknown>;
  }): FillResult => ({
    fieldId: field.fieldId,
    expected,
    ...input,
    controlAdapter: controlAdapter.diagnostic
  });
  const activeTabId = async (): Promise<number | null> => {
    const active = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []))[0];
    return active?.id ?? null;
  };
  const target = { tabId };
  let attached = false;
  let focusEmulationEnabled = false;
  let focusEmulationVerified = false;
  const sendDebuggerCommand = async (
    method: string,
    params?: Record<string, unknown>
  ): Promise<unknown> => sendInterruptibleDebuggerCommand(target, method, params);
  try {
    const activeTabBefore = await activeTabId();
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    const execution = await executeMokaRecruitingSourceDriver({
      tabId,
      selector: instruction.selector,
      expected,
      fieldKind,
      discoverOptions,
      prepareSurface: async () => {
        focusEmulationEnabled = true;
        await prepareFocusEmulatedTrustedPointerSurface(sendDebuggerCommand);
        const focusState = await sendDebuggerCommand("Runtime.evaluate", {
          expression: "document.hasFocus()",
          returnByValue: true
        }) as { result?: { value?: boolean } };
        focusEmulationVerified = focusState.result?.value === true;
        if (!focusEmulationVerified) throw new Error("后台目标未确认焦点模拟状态");
      },
      clickPoint: (point) => dispatchTrustedPointerClick(sendDebuggerCommand, point),
      commitSelection: async () => {
        const commitTarget = await executeInterruptibleScript({
          target: { tabId },
          world: "MAIN",
          func: inspectMokaRecruitingSourceCommitPointInPage,
          args: [instruction.selector, fieldKind]
        });
        const point = commitTarget[0]?.result ?? null;
        if (!point) return false;
        await dispatchTrustedPointerClick(sendDebuggerCommand, point);
        return true;
      },
      wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
    });
    const activeTabAfter = await activeTabId();
    const driverDiagnostics: MokaRecruitingSourceDriverDiagnostics & {
      buildCommit: string;
      activeTabBefore: number | null;
      activeTabAfter: number | null;
      activeTabPreserved: boolean;
      focusEmulationEnabled: boolean;
      focusEmulationVerified: boolean;
    } = {
      ...execution.diagnostics,
      buildCommit: recruitingAiPluginInfo().buildCommit,
      activeTabBefore,
      activeTabAfter,
      activeTabPreserved: activeTabBefore === null || activeTabAfter === null || activeTabBefore === activeTabAfter,
      focusEmulationEnabled,
      focusEmulationVerified
    };
    return result({
      success: execution.success,
      actual: execution.actual,
      error: execution.error,
      driverStage: execution.stage,
      driverFailureCode: execution.diagnostics.failureCode,
      availableOptions: execution.availableOptions,
      driverDiagnostics: driverDiagnostics as unknown as Record<string, unknown>
    });
  } catch (error) {
    return result({
      success: false,
      actual: located.value,
      error: `recruiting_source_control_interaction_failed: Moka 招聘信息来源可信指针 Driver 执行失败：${error instanceof Error ? error.message : String(error)}`,
      driverStage: "detect",
      driverFailureCode: "driver_interrupted"
    });
  } finally {
    if (attached && focusEmulationEnabled) {
      await releaseTrustedPointerSurface(sendDebuggerCommand).catch(() => undefined);
    }
    if (attached) await chrome.debugger.detach(target).catch(() => undefined);
  }
}

async function executeMokaYearMonthSelectInstructionWithTrustedPointerDriver(
  tabId: number,
  observation: PageObservation,
  field: PageObservation["fields"][number],
  instruction: FillInstruction,
  options: { allowReplacePreexisting?: boolean } = {}
): Promise<FillResult | null> {
  if (!isMokaYearMonthSelectApplicationUrl(observation.url) ||
    !isMokaYearMonthSelectField({
      label: field.label,
      stableFieldKey: field.stableFieldKey,
      semanticKey: instruction.semanticKey,
      type: field.type,
      controlKind: field.controlKind,
      temporal: field.temporal
    })) return null;

  const expected = String(instruction.value ?? "").trim();
  const inspected = await executeInterruptibleScript({
    target: { tabId },
    world: "MAIN",
    func: (targetSelector: string) => {
      const element = document.querySelector(targetSelector);
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (rect.width <= 0 || rect.height <= 0 || style.display === "none" ||
        style.visibility === "hidden" || style.opacity === "0") return null;
      const classNames: string[] = [];
      let current: HTMLElement | null = element;
      for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
        classNames.push(String(current.className || ""));
      }
      return {
        tag: element.tagName,
        type: element instanceof HTMLInputElement ? element.type : "",
        readOnly: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
          ? element.readOnly
          : false,
        placeholder: element.getAttribute("placeholder") || "",
        classNames,
        value: String((element as HTMLInputElement).value ?? element.textContent ?? "")
      };
    },
    args: [instruction.selector]
  });
  const located = inspected[0]?.result;
  if (!located) {
    return {
      fieldId: field.fieldId,
      success: false,
      expected,
      actual: "",
      error: "moka_year_month_select_interaction_failed: [detect/control_missing] 动态页面中未重新定位到 Moka 年月下拉字段",
      driverStage: "detect",
      driverFailureCode: "control_missing"
    };
  }
  const controlAdapter = resolveControlAdapter({
    applicationUrl: observation.url,
    label: field.label,
    semanticKey: instruction.semanticKey ?? "",
    type: located.type || field.type,
    controlKind: field.controlKind || "",
    tagName: located.tag,
    readOnly: located.readOnly,
    // Moka clears the native placeholder after selecting the sibling year and
    // renders its implicit month through a display node. The already-verified
    // split temporal structure is the authoritative unit hint for registry
    // resolution; this fallback is local to the dedicated year/month route.
    placeholder: located.placeholder || (field.temporal.part === "year" ? "年" : "月"),
    classNames: located.classNames
  });
  const lockedFailure = lockedControlRouteFailure(field, instruction, controlAdapter);
  if (lockedFailure) return lockedFailure;
  if (controlAdapter.code !== "moka.year-month-select.trusted-pointer.v1") {
    return {
      fieldId: field.fieldId,
      success: false,
      expected,
      actual: located.value,
      error: unsupportedRequiredControlFailure({
        label: field.label,
        controlType: controlAdapter.diagnostic.controlName,
        adapterCode: controlAdapter.code,
        detail: `Moka 年月下拉字段没有命中专用签名（${controlAdapter.reason}）`
      }),
      driverStage: "detect",
      driverFailureCode: "control_missing",
      controlAdapter: controlAdapter.diagnostic
    };
  }
  const result = (input: {
    success: boolean;
    actual: string;
    error: string | null;
    driverStage?: string;
    driverFailureCode?: string | null;
    availableOptions?: string[];
    driverDiagnostics?: Record<string, unknown>;
  }): FillResult => ({
    fieldId: field.fieldId,
    expected,
    ...input,
    controlAdapter: controlAdapter.diagnostic
  });
  const target = { tabId };
  let attached = false;
  let focusEmulationEnabled = false;
  const sendDebuggerCommand = async (
    method: string,
    params?: Record<string, unknown>
  ): Promise<unknown> => sendInterruptibleDebuggerCommand(target, method, params);
  try {
    const targetTab = await chrome.tabs.get(tabId);
    const activeTabs = await chrome.tabs.query({ active: true, windowId: targetTab.windowId });
    const activeTabBefore = activeTabs[0]?.id ?? null;
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    await prepareFocusEmulatedTrustedPointerSurface(sendDebuggerCommand);
    focusEmulationEnabled = true;
    const focusState = await sendDebuggerCommand("Runtime.evaluate", {
      expression: "document.hasFocus()",
      returnByValue: true
    }) as { result?: { value?: unknown } };
    const focusEmulationVerified = focusState.result?.value === true;
    if (!focusEmulationVerified) throw new Error("后台目标未确认焦点模拟状态");
    const activeTabDuring = (await chrome.tabs.query({
      active: true,
      windowId: targetTab.windowId
    }).catch(() => []))[0]?.id ?? null;
    const execution = await executeMokaYearMonthSelectDriver({
      tabId,
      selector: instruction.selector,
      expected,
      part: field.temporal.part,
      allowReplacePreexisting: options.allowReplacePreexisting,
      prepareSurface: async () => undefined,
      clickPoint: (point) => dispatchTrustedPointerClick(sendDebuggerCommand, point),
      scrollPoint: (point, deltaY) => dispatchTrustedPointerScroll(sendDebuggerCommand, point, deltaY),
      wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
    });
    const driverDiagnostics: MokaYearMonthSelectDriverDiagnostics & {
      buildCommit: string;
      activeTabBefore: number | null;
      activeTabDuring: number | null;
      focusEmulationEnabled: boolean;
      focusEmulationVerified: boolean;
      backgroundTabPreserved: boolean;
    } = {
      ...execution.diagnostics,
      buildCommit: recruitingAiPluginInfo().buildCommit,
      activeTabBefore,
      activeTabDuring,
      focusEmulationEnabled,
      focusEmulationVerified,
      backgroundTabPreserved: activeTabDuring === activeTabBefore
    };
    return result({
      success: execution.success,
      actual: execution.actual,
      error: execution.error,
      driverStage: execution.stage,
      driverFailureCode: execution.diagnostics.failureCode,
      availableOptions: execution.availableOptions,
      driverDiagnostics: driverDiagnostics as unknown as Record<string, unknown>
    });
  } catch (error) {
    return result({
      success: false,
      actual: located.value,
      error: `moka_year_month_select_interaction_failed: [detect/driver_interrupted] Moka 年月下拉可信指针 Driver 执行失败：${error instanceof Error ? error.message : String(error)}`,
      driverStage: "detect",
      driverFailureCode: "driver_interrupted"
    });
  } finally {
    if (attached && focusEmulationEnabled) {
      await releaseTrustedPointerSurface(sendDebuggerCommand).catch(() => undefined);
    }
    if (attached) await chrome.debugger.detach(target).catch(() => undefined);
  }
}

function isMokaLocationOptionUnavailable(result: FillResult | null | undefined): result is FillResult & {
  driverFailureCode: "leaf_missing";
  availableOptions: string[];
} {
  return isMokaLocationInteractionFailure(result?.error) && result?.driverFailureCode === "leaf_missing" &&
    Array.isArray(result.availableOptions) && result.availableOptions.length > 0;
}

function mokaLocationOptionUnavailableError(input: {
  field: PageFieldObservation;
  expectedValue: string;
  result: FillResult;
}): RecruitingError | null {
  if (!isMokaLocationOptionUnavailable(input.result)) return null;
  const request = candidateInformationRequestForUnavailableOptions(
    input.field,
    input.expectedValue,
    input.result.availableOptions
  );
  if (!request) return null;
  const available = request.options.join("、");
  const message = `意向工作城市“${input.expectedValue}”不在该岗位可选范围内；当前可选项：${available}`;
  return new RecruitingError({
    code: "MISSING_INFORMATION",
    stage: "missing_information",
    message,
    retryable: false,
    userAction: "请在 AiOffer 中从返回的可选城市确认一项后重新投递；插件不会选择替代城市或继续提交。",
    details: {
      fields: [request.label],
      informationRequests: [request],
      requiredFieldRequests: [request],
      optionUnavailable: {
        schemaVersion: "option-unavailable.v1",
        fieldId: input.field.fieldId,
        stableFieldKey: input.field.stableFieldKey ?? null,
        fieldName: request.label,
        requestedValue: input.expectedValue,
        availableOptions: request.options,
        source: "live_moka_popup"
      },
      driverFailureCode: input.result.driverFailureCode,
      driverDiagnostics: input.result.driverDiagnostics ?? null
    }
  });
}

function mokaLocationSelectionUnconfirmedError(input: {
  field: PageFieldObservation;
  expectedValue: string;
  actualValue: string;
  result: FillResult | null | undefined;
  source?: string;
}): RecruitingError {
  const message = `意向工作城市“${input.expectedValue}”填写后未能通过招聘页面回读确认`;
  return new RecruitingError({
    code: "MISSING_INFORMATION",
    stage: "readback",
    message,
    retryable: false,
    userAction: "插件已在最终提交前停止。该站点控件未完成可信选择与回读，请稍后重新投递或联系支持查看执行证据。",
    details: {
      fields: [input.field.label],
      failures: [message],
      locationSelectionUnconfirmed: {
        schemaVersion: "location-selection-unconfirmed.v1",
        fieldId: input.field.fieldId,
        stableFieldKey: input.field.stableFieldKey ?? null,
        fieldName: input.field.label,
        requestedValue: input.expectedValue,
        actualValue: input.actualValue,
        source: input.source ?? "live_moka_page"
      },
      controlAdapter: input.result?.controlAdapter ?? null,
      driverFailureCode: input.result?.driverFailureCode ?? null,
      driverDiagnostics: input.result?.driverDiagnostics ?? null
    }
  });
}

function isMokaRecruitingSourceOptionUnavailable(
  result: FillResult | null | undefined
): result is FillResult & { driverFailureCode: "leaf_missing"; availableOptions: string[] } {
  return isMokaRecruitingSourceInteractionFailure(result?.error) &&
    result?.driverFailureCode === "leaf_missing" &&
    Array.isArray(result.availableOptions) && result.availableOptions.length > 0;
}

function isMokaFlatSelectOptionUnavailable(
  result: FillResult | null | undefined
): result is FillResult & { driverFailureCode: "leaf_missing"; availableOptions: string[] } {
  return isMokaFlatSelectInteractionFailure(result?.error) &&
    result?.driverFailureCode === "leaf_missing" &&
    Array.isArray(result.availableOptions) && result.availableOptions.length > 0;
}

function mokaFlatSelectOptionUnavailableError(input: {
  field: PageFieldObservation;
  expectedValue: string;
  result: FillResult;
}): RecruitingError | null {
  if (!isMokaFlatSelectOptionUnavailable(input.result)) return null;
  const request = candidateInformationRequestForUnavailableOptions(
    input.field,
    input.expectedValue,
    input.result.availableOptions
  );
  if (!request) return null;
  const message = `“${request.label}”的值“${input.expectedValue}”不在该岗位可选范围内；当前可选项：${request.options.join("、")}`;
  return new RecruitingError({
    code: "MISSING_INFORMATION",
    stage: "missing_information",
    message,
    retryable: false,
    userAction: "请在 AiOffer 中从招聘页面当前提供的选项中确认一项后重新投递；插件不会猜测或输入替代值。",
    details: {
      fields: [request.label],
      informationRequests: [request],
      requiredFieldRequests: [request],
      optionUnavailable: {
        schemaVersion: "option-unavailable.v1",
        fieldId: input.field.fieldId,
        stableFieldKey: input.field.stableFieldKey ?? null,
        fieldName: request.label,
        requestedValue: input.expectedValue,
        availableOptions: request.options,
        source: "live_moka_flat_select_popup"
      },
      controlAdapter: input.result.controlAdapter ?? null,
      driverFailureCode: input.result.driverFailureCode,
      driverDiagnostics: input.result.driverDiagnostics ?? null
    }
  });
}

function mokaRecruitingSourceOptionUnavailableError(input: {
  field: PageFieldObservation;
  expectedValue: string;
  result: FillResult;
}): RecruitingError | null {
  if (!isMokaRecruitingSourceOptionUnavailable(input.result)) return null;
  const request = candidateInformationRequestForUnavailableOptions(
    input.field,
    input.expectedValue,
    input.result.availableOptions
  );
  if (!request) return null;
  const message = `信息来源“${input.expectedValue}”不在该岗位可选范围内；当前可选项：${request.options.join("、")}`;
  return new RecruitingError({
    code: "MISSING_INFORMATION",
    stage: "missing_information",
    message,
    retryable: false,
    userAction: "请从招聘页面当前提供的信息来源中重新选择；选择结果写回信息包后可继续投递。",
    details: {
      fields: [request.label],
      informationRequests: [request],
      requiredFieldRequests: [request],
      optionUnavailable: {
        schemaVersion: "option-unavailable.v1",
        fieldId: input.field.fieldId,
        stableFieldKey: input.field.stableFieldKey ?? null,
        fieldName: request.label,
        requestedValue: input.expectedValue,
        availableOptions: request.options,
        source: "live_moka_popup"
      },
      driverFailureCode: input.result.driverFailureCode,
      driverDiagnostics: input.result.driverDiagnostics ?? null
    }
  });
}

async function executeFeishuMonthPeriodInstructionWithTrustedFocusDriver(
  tabId: number,
  observation: PageObservation,
  field: PageObservation["fields"][number],
  instruction: FillInstruction
): Promise<FillResult | null> {
  if (!instruction.dateValue || !isFeishuMonthPeriodApplicationUrl(observation.url) ||
    !isFeishuMonthPeriodField({
      label: field.label,
      stableFieldKey: field.stableFieldKey,
      semanticKey: instruction.semanticKey
    })) return null;

  const expected = String(instruction.value ?? "");
  const inspected = await executeInterruptibleScript({
    target: { tabId },
    world: "MAIN",
    func: (targetSelector: string) => {
      const element = document.querySelector(targetSelector);
      if (!(element instanceof HTMLElement)) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (rect.width <= 0 || rect.height <= 0 || style.display === "none" ||
        style.visibility === "hidden" || style.opacity === "0") return null;
      const classNames: string[] = [element.getAttribute("data-cy") || ""];
      let current: HTMLElement | null = element;
      for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
        classNames.push(String(current.className || ""));
      }
      return {
        tag: element.tagName,
        type: "custom_date_picker",
        readOnly: false,
        placeholder: "",
        classNames,
        value: String(element.innerText || element.textContent || "")
      };
    },
    args: [instruction.selector]
  });
  const located = inspected[0]?.result;
  if (!located) {
    return {
      fieldId: field.fieldId,
      success: false,
      expected,
      actual: "",
      error: "feishu_month_period_control_interaction_failed:detect: 动态页面中未重新定位到飞书年月字段",
      driverStage: "detect",
      driverFailureCode: "control_missing"
    };
  }
  const controlAdapter = resolveControlAdapter({
    applicationUrl: observation.url,
    label: field.label,
    semanticKey: instruction.semanticKey ?? field.stableFieldKey ?? "",
    type: located.type,
    controlKind: field.controlKind ?? "",
    tagName: located.tag,
    readOnly: located.readOnly,
    placeholder: located.placeholder,
    classNames: located.classNames
  });
  const lockedFailure = lockedControlRouteFailure(field, instruction, controlAdapter);
  if (lockedFailure) return lockedFailure;
  if (controlAdapter.code !== "feishu.month-period.trusted-pointer.v3") {
    return {
      fieldId: field.fieldId,
      success: false,
      expected,
      actual: located.value,
      error: unsupportedRequiredControlFailure({
        label: field.label,
        controlType: controlAdapter.diagnostic.controlName,
        adapterCode: controlAdapter.code,
        detail: `飞书年月字段没有命中专用签名（${controlAdapter.reason}）`
      }),
      controlAdapter: controlAdapter.diagnostic
    };
  }
  const informationGate = guardFieldInformation({
    ...field,
    currentValue: located.value,
    informationRequirement: controlAdapter.registration?.informationRequirement
  }, instruction.value);
  if (informationGate) return informationGate;
  const target = { tabId };
  let attached = false;
  let focusEmulationEnabled = false;
  const sendDebuggerCommand = async (method: string, params?: Record<string, unknown>): Promise<unknown> =>
    sendInterruptibleDebuggerCommand(target, method, params);
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    focusEmulationEnabled = true;
    await prepareFocusEmulatedTrustedPointerSurface(sendDebuggerCommand);
    const focusState = await sendDebuggerCommand("Runtime.evaluate", {
      expression: "document.hasFocus()",
      returnByValue: true
    }) as { result?: { value?: boolean } };
    if (focusState.result?.value !== true) throw new Error("后台目标未确认焦点模拟状态");
    const execution = await executeFeishuMonthPeriodDriver({
      tabId,
      selector: instruction.selector,
      stableFieldKey: instruction.stableFieldKey ?? field.stableFieldKey ?? "",
      label: field.label,
      dateValue: instruction.dateValue,
      clickPoint: (point) => dispatchTrustedPointerClick(sendDebuggerCommand, point),
      wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
    });
    return {
      fieldId: field.fieldId,
      success: execution.success,
      expected,
      actual: execution.actual,
      error: execution.error,
      driverStage: execution.stage,
      driverFailureCode: execution.error?.split(":")[2] ?? null,
      driverDiagnostics: {
        schemaVersion: "feishu-month-period-driver-diagnostic.v1",
        buildCommit: recruitingAiPluginInfo().buildCommit,
        executionSurface: "background_tab",
        focusEmulationEnabled,
        validationCleared: execution.validationCleared,
        popupClosed: execution.popupClosed,
        rangeComplete: execution.rangeComplete,
        variant: execution.variant,
        scrollCount: execution.scrollCount,
        reboundByStableIdentity: execution.reboundByStableIdentity,
        ledger: execution.ledger
      },
      controlAdapter: controlAdapter.diagnostic
    };
  } catch (error) {
    return {
      fieldId: field.fieldId,
      success: false,
      expected,
      actual: located.value,
      error: `feishu_month_period_control_interaction_failed:detect: 飞书后台可信指针 Driver 执行失败：${error instanceof Error ? error.message : String(error)}`,
      driverStage: "detect",
      driverFailureCode: "driver_interrupted",
      controlAdapter: controlAdapter.diagnostic
    };
  } finally {
    if (attached && focusEmulationEnabled) {
      await releaseTrustedPointerSurface(sendDebuggerCommand).catch(() => undefined);
    }
    if (attached) await chrome.debugger.detach(target).catch(() => undefined);
  }
}

async function executeXToolFormilyRepeatNativeInstruction(
  tabId: number,
  observation: PageObservation,
  field: PageObservation["fields"][number],
  instruction: FillInstruction
): Promise<FillResult | null> {
  if (!instruction.stableFieldKey || !isXToolFormilyApplicationUrl(observation.url) ||
    !isXToolFormilyRepeatNativeField({
      stableFieldKey: field.stableFieldKey,
      label: field.label,
      type: field.type,
      controlKind: field.controlKind,
      dataFieldName: field.domHints?.dataFieldName
    })) return null;
  const expected = String(instruction.value ?? "");
  const inspectedExecution = await executeInterruptibleScript({
    target: { tabId },
    world: "MAIN",
    func: inspectXToolFormilyRepeatNativeInPage,
    args: [instruction.selector, instruction.stableFieldKey, field.label]
  });
  const inspected = inspectedExecution[0]?.result;
  if (!inspected || inspected.status !== "ready") {
    return {
      fieldId: field.fieldId,
      success: false,
      expected,
      actual: inspected?.actual ?? "",
      error: `xtool_formily_repeat_native_control_interaction_failed:detect:${inspected?.status ?? "probe_failed"}`,
      driverStage: "detect",
      driverFailureCode: inspected?.status ?? "probe_failed"
    };
  }
  const controlAdapter = resolveControlAdapter({
    applicationUrl: observation.url,
    label: field.label,
    semanticKey: instruction.semanticKey ?? field.stableFieldKey ?? "",
    type: inspected.type,
    controlKind: field.controlKind ?? "",
    tagName: inspected.tagName,
    readOnly: inspected.readOnly,
    placeholder: inspected.placeholder,
    classNames: inspected.classNames
  });
  const lockedFailure = lockedControlRouteFailure(field, instruction, controlAdapter);
  if (lockedFailure) return lockedFailure;
  if (controlAdapter.code !== "xtool.formily-repeat-native.v1") {
    return {
      fieldId: field.fieldId,
      success: false,
      expected,
      actual: inspected.actual,
      error: unsupportedRequiredControlFailure({
        label: field.label,
        controlType: controlAdapter.diagnostic.controlName,
        adapterCode: controlAdapter.code,
        detail: `xTool 动态经历字段没有命中专用签名（${controlAdapter.reason}）`
      }),
      controlAdapter: controlAdapter.diagnostic
    };
  }
  const execution = await executeXToolFormilyRepeatNativeDriver({
    tabId,
    selector: instruction.selector,
    stableFieldKey: instruction.stableFieldKey,
    label: field.label,
    value: expected
  });
  return {
    fieldId: field.fieldId,
    success: execution.success,
    expected,
    actual: execution.actual,
    error: execution.error,
    driverStage: execution.stage,
    driverFailureCode: execution.error?.split(":")[2] ?? null,
    driverDiagnostics: {
      schemaVersion: "xtool-formily-repeat-native-driver-diagnostic.v1",
      buildCommit: recruitingAiPluginInfo().buildCommit,
      executionSurface: "background_tab",
      stableFieldKey: instruction.stableFieldKey,
      targetCount: execution.targetCount,
      writeCount: execution.writeCount,
      validationCleared: execution.validationCleared,
      retryCount: 0,
      reloadCount: 0
    },
    controlAdapter: controlAdapter.diagnostic
  };
}

function controlExecutionError(field: PageFieldObservation, result?: FillResult | null): RecruitingError {
  const unsupported = isUnsupportedRequiredControlFailure(result?.error);
  return new RecruitingError({
    code: "SITE_VALIDATION_BLOCKED", stage: "form_observation", retryable: false,
    message: result?.error ?? `control_execution_failed: ${field.label} 未返回执行结果`,
    userAction: "信息已提供，但该控件未能完成填写。请按站点、公司、字段及控件签名精确排查；本次不切换 Driver 或重复提交。",
    details: { fieldLabel: field.label, driverFailureCode: result?.driverFailureCode ?? null,
      driverDiagnostics: result?.driverDiagnostics ?? null,
      ...controlAdapterFailureDetails({
      reasonCode: unsupported ? "unsupported_required_control" : result?.driverFailureCode === "field_fill_readback_failed"
        ? "field_fill_readback_failed" : "control_interaction_failed",
      fieldId: field.fieldId, stableFieldKey: field.stableFieldKey, fieldName: field.label,
      expectedValue: result?.expected ?? "", actualValue: result?.actual ?? "",
      driverStage: result?.driverStage, controlAdapter: result?.controlAdapter
    }) }
  });
}

async function executeApplicationFillInstructions(
  tabId: number,
  observation: PageObservation,
  instructions: FillInstruction[],
  options: {
    allowReplaceMokaImplicitMonth?: boolean;
    /** Exact field identities authorized only after the site rejected submit. */
    siteValidationRepairKeys?: ReadonlySet<string>;
  } = {}
): Promise<FillResult[]> {
  const results: FillResult[] = [];
  const implicitMonthPairs = new Set<string>();
  for (const original of instructions) {
    const initialMatches = observation.fields.filter(field => original.stableFieldKey
      ? field.stableFieldKey === original.stableFieldKey : field.fieldId === original.fieldId);
    const initial = initialMatches.length === 1 ? initialMatches[0]! : null;
    const instruction = { ...original, stableFieldKey: original.stableFieldKey ?? initial?.stableFieldKey,
      expectedLabel: original.expectedLabel ?? initial?.label };
    let live = await stableApplicationObservation(tabId, { forControlDispatch: true });
    let field = bindObservedInstruction(live, instruction);
    const siteValidationRepairAuthorized = Boolean(field && options.siteValidationRepairKeys && [
      field.stableFieldKey,
      initial?.stableFieldKey,
      instruction.stableFieldKey
    ].some((key) => Boolean(key && options.siteValidationRepairKeys!.has(key))));
    let result: FillResult;
    if (live.url !== observation.url || live.pageStage !== "application_form") {
      result = controlRoutingFailure(instruction, field, "control_page_changed", "页面已跳转或不再是稳定申请表，未执行写入");
    } else if (!field) {
      result = controlRoutingFailure(instruction, null, "control_target_missing", "稳定字段身份已失联或有歧义，未使用旧序号/选择器");
    } else if (!siteValidationRepairAuthorized &&
      !optionalInstructionHasCurrentJobConfirmation(field, instruction)) {
      result = controlRoutingFailure(instruction, field, "optional_field_not_confirmed_for_current_job", "非必填字段未获本岗位明确确认，已跳过");
    } else {
      if (needsFeishuSelectorDiscovery(field,live.url)) {
        const prepared=await prepareFeishuSelectorInTab(tabId,live,instruction);
        if(prepared.failure){results.push(prepared.failure);continue;}
        live=prepared.page; field=bindObservedInstruction(live,instruction);
        if(!field){results.push(controlRoutingFailure(instruction,null,"control_target_missing","探查后字段失联"));continue;}
      }
      if (field.fieldSource && needsFeishuAtsxChoiceDiscovery(field)) {
        const prepared = await prepareFeishuAtsxChoiceInTab(tabId, live, instruction);
        if (prepared.failure) { results.push(prepared.failure); continue; }
        live = prepared.page;
        field = bindObservedInstruction(live, instruction);
        if (!field) { results.push(controlRoutingFailure(instruction, null, "control_target_missing", "探查后字段失联")); continue; }
      }
      const informationGate = field.type === "file" ? null : guardFieldInformation(field, instruction.value);
      if (informationGate) {
        result = informationGate;
      } else {
        const normalized = field.type === "file" ? instruction : {
          ...instruction,
          // The factory formats facts; the dispatcher alone chooses a Driver.
          ...instructionFromObservedField(field, String(instruction.value), instruction.semanticKey ?? null),
          ...(typeof instruction.value === "boolean" ? { value: instruction.value } : {})
        };
        const pair = mokaYearMonthPairIdentity(field, instruction.semanticKey);
        const allowReplace = siteValidationRepairAuthorized || options.allowReplaceMokaImplicitMonth ||
          Boolean(pair && field.temporal?.part === "month" && implicitMonthPairs.has(pair));
        result = await dispatchControlInstruction(live, normalized, {
          "generic.native.v1": (_field, next) => executeNativeControlInTab(tabId, next),
          "moka.range-present.trusted-pointer.v1": (_field, next) => executeMokaRangePresentInTab(tabId, live, next),
          "feishu.formily-resume-upload.v1": (_field, next) => executeFeishuResumeUploadInTab(tabId, next),
          "feishu.atsx-resume-upload.v1": (_field, next) => executeFeishuResumeUploadInTab(tabId, next),
          "feishu.formily-portfolio-upload.v1": (_field, next) => executeFeishuResumeUploadInTab(tabId, next),
          "feishu.atsx-flat-select.trusted-pointer.v1": (_field, next) => executeFeishuAtsxChoiceInTab(tabId, live, next),
          "feishu.atsx-city-tree.trusted-pointer.v1": (_field, next) => executeFeishuAtsxChoiceInTab(tabId, live, next),
          "feishu.atsx-school-search.trusted-pointer.v1": (_field, next) => executeFeishuSchoolSearchInTab(tabId, live, next),
          "feishu.formily-school-search.trusted-pointer.v1": (_field, next) => executeFeishuSchoolSearchInTab(tabId, live, next),
          "feishu.formily-selector-search.trusted-pointer.v1": (_field, next) => executeFeishuSelectorSearchInTab(tabId, live, next),
          "feishu.formily-city-multi-search.trusted-pointer.v1": (_field, next) => executeFeishuSelectorSearchInTab(tabId, live, next),
          "feishu.formily-location-tree.trusted-pointer.v1": (_field, next) => executeFeishuSelectorSearchInTab(tabId, live, next),
          "feishu.formily-year.trusted-pointer.v1": (_field, next) => executeFeishuYearInTab(tabId, live, next),
          "feishu.formily-multi-select.trusted-pointer.v1": (_field, next) => executeFeishuMultiSelectInTab(tabId, live, next),
          "feishu.formily-radio-group.trusted-pointer.v1": (_field, next) => executeFeishuRadioGroupInTab(tabId, live, next, siteValidationRepairAuthorized),
          "xtool.formily-repeat-native.v1": (target, next) =>
            executeXToolFormilyRepeatNativeInstruction(tabId, live, target, next),
          "feishu.formily-flat-select.trusted-pointer.v1": (target, next) =>
            executeFeishuFormilySelectInstruction(tabId, target, next),
          "feishu.month-period.trusted-pointer.v3": (target, next) =>
            executeFeishuMonthPeriodInstructionWithTrustedFocusDriver(tabId, live, target, next),
          "moka.year-month-select.trusted-pointer.v1": (target, next) =>
            executeMokaYearMonthSelectInstructionWithTrustedPointerDriver(tabId, live, target, next,
              { allowReplacePreexisting: allowReplace }),
          "moka.native-place.cascader.trusted-pointer.v1": (target, next) =>
            executeMokaNativePlaceInstructionWithTrustedPointerDriver(tabId, live, target, next),
          ...mokaFlatSelectControlExecutors(tabId, live),
          "moka.date-picker.trusted-pointer.v9": (target, next) =>
            executeMokaDateInstructionWithTrustedPointerDriver(tabId, live, target, next),
          "moka.zuoyebang.education-end-month.trusted-pointer.v1": (target, next) =>
            executeMokaDateInstructionWithTrustedPointerDriver(tabId, live, target, next),
          "moka.tap4fun.birth-date.trusted-pointer.v2": (target, next) =>
            executeMokaDateInstructionWithTrustedPointerDriver(tabId, live, target, next),
          ...Object.fromEntries([...MOKA_LOCATION_DRIVER_CODES].map(code => [code,
            (target: PageFieldObservation, next: FillInstruction) =>
              executeDeepSeekLocationInstructionWithTrustedFocusDriver(tabId, live, target, next)]))
        });
        if (result.success && pair && field.temporal?.part === "year") implicitMonthPairs.add(pair);
      }
    }
    results.push({ ...result, fieldId: original.fieldId });
    // No failed required control can be retried through another batch entry.
    // Optional failures remain diagnostics and do not occupy execution.
    if (!result.success && (field?.required ?? initial?.required ?? true)) break;
  }
  return results;
}

async function executeMokaSharedSelectInstruction(tabId: number, field: PageFieldObservation,
  instruction: FillInstruction, discoverOptions = false): Promise<FillResult> {
  const target = { tabId }; let attached = false;
  const send = (method: string, params?: Record<string, unknown>) => sendInterruptibleDebuggerCommand(target, method, params);
  try {
    await chrome.debugger.attach(target, "1.3"); attached = true;
    const execute = ["moka.search-select.trusted-focus.v1", "moka.legacy-school-search.trusted-focus.v1"].includes(instruction.controlAdapter?.registrationId ?? "")
      ? executeMokaSearchSelectDriver
      : instruction.controlAdapter?.registrationId === "moka.work-city-multi.trusted-focus.v1"
        ? executeMokaCityMultiDriver : executeMokaSharedSelectDriver;
    const result = await execute({ tabId, instruction, discoverOptions,
      prepareSurface: () => prepareFocusEmulatedTrustedPointerSurface(send),
      clickPoint: point => dispatchTrustedPointerClick(send, point),
      typeQuery: async text => { await send("Input.insertText", {text}); },
      wait: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) });
    const policyUnavailable = instruction.optionSelectionPolicy?.startsWith("phone_calling_code_") &&
      ["leaf_missing", "leaf_ambiguous"].includes(String(result.diagnostics.failureCode)) &&
      result.availableOptions.length > 0;
    const resolvedExpected = "resolvedExpected" in result ? String(result.resolvedExpected || "") : "";
    return { fieldId: field.fieldId, expected: resolvedExpected || String(instruction.value),
      actual: result.actual, success: result.success,
      error: result.error, driverStage: result.stage,
      driverFailureCode: policyUnavailable ? "control_option_unavailable" : result.diagnostics.failureCode,
      availableOptions: result.availableOptions, driverDiagnostics: result.diagnostics as unknown as Record<string, unknown>,
      controlAdapter: instruction.controlAdapter };
  } finally {
    if (attached) { await releaseTrustedPointerSurface(send).catch(() => undefined); await chrome.debugger.detach(target).catch(() => undefined); }
  }
}

async function executeFeishuFormilySelectInstruction(
  tabId: number,
  field: PageFieldObservation,
  instruction: FillInstruction,
  discoverOptions = false
): Promise<FillResult> {
  const target = { tabId };
  let attached = false;
  const send = (method: string, params?: Record<string, unknown>) =>
    sendInterruptibleDebuggerCommand(target, method, params);
  const inspect = async (phase: "observe" | "prepare_open") => {
    const page = await stableApplicationObservation(tabId, { forControlDispatch: true });
    if (page.url !== instruction.applicationUrl || page.pageStage !== "application_form") return null;
    const live = bindObservedInstruction(page, instruction);
    if (!live) return null;
    const route = resolveControlAdapter(evidenceForField(page, live, instruction));
    if (route.code !== "feishu.formily-flat-select.trusted-pointer.v1" ||
      route.diagnostic.registrationId !== instruction.controlAdapter?.registrationId) return null;
    const execution = await executeInterruptibleScript({
      target,
      world: "MAIN",
      func: inspectFeishuFormilySelectInPage,
      args: [live.selector, live.label, String(instruction.value ?? ""), phase]
    });
    return execution[0]?.result ?? null;
  };
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    const execution = await executeFeishuFormilySelectDriver({
      expected: String(instruction.value ?? ""),
      discoverOptions,
      inspect,
      prepareSurface: () => prepareFocusEmulatedTrustedPointerSurface(send),
      clickPoint: (point) => dispatchTrustedPointerClick(send, point),
      wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
    });
    const unavailable = execution.diagnostics.failureCode === "leaf_missing" &&
      execution.availableOptions.length > 0;
    return {
      fieldId: field.fieldId,
      expected: String(instruction.value ?? ""),
      actual: execution.actual,
      success: execution.success,
      error: execution.error,
      driverStage: execution.stage,
      driverFailureCode: unavailable ? "control_option_unavailable" : execution.diagnostics.failureCode,
      availableOptions: execution.availableOptions,
      driverDiagnostics: {
        ...execution.diagnostics,
        buildCommit: recruitingAiPluginInfo().buildCommit,
        executionSurface: "background_tab",
        popupClosed: execution.popupClosed,
        validationCleared: execution.validationCleared
      },
      controlAdapter: instruction.controlAdapter
    };
  } finally {
    if (attached) {
      await releaseTrustedPointerSurface(send).catch(() => undefined);
      await chrome.debugger.detach(target).catch(() => undefined);
    }
  }
}

function mokaYearMonthPairIdentity(
  field: PageObservation["fields"][number],
  semanticKey?: string | null
): string | null {
  if (!field.temporal || !["year", "month"].includes(field.temporal.part)) return null;
  const stableSemantic = field.stableFieldKey?.replace(
    /\.(?:combobox|select|native|custom_date_picker)(?:#\d+)?$/u,
    ""
  );
  return [
    field.temporal.scope === "field" ? field.temporal.groupKey : semanticKey || stableSemantic || field.temporal.groupKey,
    field.sectionKey ?? "",
    field.groupIndex ?? "",
    field.temporal.layout,
    field.temporal.edge
  ].join(":");
}

/**
 * Moka reconstructs the sibling month Select after a year is committed. Its
 * control kind and stable key can consequently change even though it is still
 * the same visible temporal part. Rebind only within the same section, repeat
 * row, range layout and edge; ambiguity remains a hard failure.
 */

async function executeMokaFillInstructionWithDebugger(
  tabId: number,
  observation: PageObservation,
  _field: PageObservation["fields"][number],
  instruction: FillInstruction,
  options: {
    allowReplaceMokaImplicitMonth?: boolean;
    siteValidationRepairKeys?: ReadonlySet<string>;
  } = {}
): Promise<FillResult | null> {
  // Compatibility name only. Every caller now reaches the same dispatcher.
  return (await executeApplicationFillInstructions(tabId, observation, [instruction], options))[0] ?? null;
}

function criticalVisualReadbackFailures(
  observation: PageObservation,
  candidateFacts: Record<string, string>
): string[] {
  return observation.fields.flatMap((field) => {
    if (isSiteManagedDisabledField(field)) return [];
    if (!visualFieldFailureBlocksSubmission(field)) return [];
    // The calling-code member can become aria-invalid/required through a
    // shared phone-group error. It is never the candidate's phone answer.
    if (isPhoneCallingCodeField(field)) return [];
    // Empty/uncommitted is for the site's required-field validation. Only a
    // nonempty incompatible identity is evidence of content corruption.
    if (!observedFieldHasValue(field)) return [];
    if (thirdPartyIdentityCollision(field, candidateFacts)) {
      return [`${field.label} 复用了候选人本人信息`];
    }
    if (isThirdPartyPersonField(field)) return [];
    const identity = `${field.label} ${field.stableFieldKey ?? ""}`;
    if (/关系人信息|亲属关系|与公司员工是否有亲属关系|与本人关系|部门\/职位/i.test(identity)) {
      return [];
    }
    let expected = "";
    if (/(?:^|·)\s*姓名|full_name/i.test(identity)) {
      expected = candidateFactByKey(candidateFacts, /(?:basic|candidate\.basic).*(?:fullName|\.name$)/i, /姓名|fullName/i);
    } else if (/手机|电话号码|联系电话|\bphone\b/i.test(identity)) {
      expected = candidateFactByKey(candidateFacts, /(?:basic|candidate\.basic).*(?:phone|mobile)/i, /手机|电话|phone|mobile/i);
      if (expected) {
        const actualDigits = field.currentValue.replace(/\D/g, "");
        const expectedDigits = expected.replace(/\D/g, "");
        return actualDigits.endsWith(expectedDigits) ? [] : [`${field.label} 回读不一致`];
      }
    } else if (/邮箱|\bemail\b/i.test(identity)) {
      expected = candidateFactByKey(candidateFacts, /(?:basic|candidate\.basic).*email/i, /邮箱|email/i);
    } else if (/最高学历|basic\.degree|basic.*highestDegree/i.test(identity)) {
      expected = candidateFactByKey(candidateFacts, /(?:candidate\.)?basic\.highestDegree/i, /最高学历|highestDegree/i);
    } else if (/开始工作年月.*年|first_work_start_year/i.test(identity)) {
      expected = candidateFacts["candidate.basic.firstWorkStartYear"] ?? "";
    } else if (/开始工作年月.*月|first_work_start_month/i.test(identity)) {
      expected = candidateFacts["candidate.basic.firstWorkStartMonth"] ?? "";
    }
    if (!expected) return [];
    return visionReadbackMatches(field, expected) ? [] : [`${field.label} 回读不一致`];
  });
}

async function commitApplicationFormBlurBeforePreSubmit(tabId: number): Promise<void> {
  const preparation = await executeInterruptibleScript({
    target: { tabId },
    func: prepareApplicationFormValidationBlur
  }).catch(() => []);
  const point = preparation[0]?.result?.point;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
  const target = { tabId };
  let attached = false;
  let focusEmulationEnabled = false;
  const sendDebuggerCommand = async (method: string, params?: Record<string, unknown>) =>
    sendInterruptibleDebuggerCommand(target, method, params);
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    focusEmulationEnabled = true;
    await prepareFocusEmulatedTrustedPointerSurface(sendDebuggerCommand);
    await dispatchTrustedPointerClick(sendDebuggerCommand, point);
  } finally {
    if (attached && focusEmulationEnabled) {
      await releaseTrustedPointerSurface(sendDebuggerCommand).catch(() => undefined);
    }
    if (attached) await chrome.debugger.detach(target).catch(() => undefined);
  }
}

async function stablePreSubmitObservation(
  tabId: number,
  _candidateFacts: Record<string, string>
): Promise<PageObservation> {
  // Compatibility entry point: page classification only, never field auditing.
  const observation = await stableApplicationObservation(tabId);
  assertApplicationFormStage(observation, "提交页面确认");
  return observation;
}

function sanitizedVisionDiagnosticLabels(values: string[]): string[] {
  return values.map(redactVisionDiagnosticText).filter(Boolean).slice(0, 20);
}

async function persistAutoApplyVisionDiagnostic(entry: VisionIterationDiagnostic): Promise<void> {
  console.info("[AI Offer 招聘小助手][vision-step]", entry);
  const generation = autoApplyLifecycleGeneration;
  if (autoApplySessionTerminated || autoApplyExecutionAbort?.signal.aborted) return;
  try {
    const stored = await chrome.storage.local.get({ [autoApplyVisionDiagnosticsStorageKey]: [] });
    if (generation !== autoApplyLifecycleGeneration || autoApplySessionTerminated ||
      autoApplyExecutionAbort?.signal.aborted) return;
    const next = appendVisionDiagnosticRing(
      stored[autoApplyVisionDiagnosticsStorageKey],
      entry,
      200
    );
    await chrome.storage.local.set({ [autoApplyVisionDiagnosticsStorageKey]: next });
    if (generation !== autoApplyLifecycleGeneration || autoApplySessionTerminated ||
      autoApplyExecutionAbort?.signal.aborted) {
      await chrome.storage.local.set({ [autoApplyVisionDiagnosticsStorageKey]: [] });
    }
  } catch (error) {
    console.warn(
      "[AI Offer 招聘小助手][vision-step] persist failed",
      redactVisionDiagnosticText(error instanceof Error ? error.message : error)
    );
  }
}

function authorizedConsentCandidates(observation: PageObservation): Array<{
  action: PageObservation["actions"][number];
  required: boolean;
}> {
  const candidates: Array<{
    action: PageObservation["actions"][number];
    required: boolean;
  }> = observation.actions
    .filter((action) => action.kind === "consent" && !action.disabled)
    .map((action) => ({ action, required: false }));
  const missing = new Set(requiredFieldFailures(observation.fields).map(field => field.fieldId));
  for (const field of observation.fields) {
    if (!missing.has(field.fieldId) || field.type !== "checkbox" ||
      resolveControlAdapter(evidenceForField(observation, field)).code !== "generic.consent-confirmation.trusted-pointer.v1") continue;
    candidates.push({
      required: true,
      action: {
        actionId: `required-consent:${field.fieldId}`,
        selector: field.selector,
        text: field.label,
        kind: "consent",
        risk: "user_only",
        disabled: false,
        context: field.labelPath?.join(" · ") || field.label
      }
    });
  }
  const seen = new Set<string>();
  return candidates.filter(({ action, required }) => {
    const key = `${action.selector}|${action.text.replace(/\s+/g, " ").trim()}|${required}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function ensureAuthorizedPageConsents(
  tabId: number,
  initialObservation: PageObservation
): Promise<{ observation: PageObservation; changed: boolean; labels: string[] }> {
  let observation = initialObservation;
  let changed = false;
  const labels: string[] = [];
  const candidates = authorizedConsentCandidates(observation).slice(0, 20);
  if (!candidates.length) return { observation, changed, labels };
  const target = { tabId };
  let attached = false;
  let focusEmulationEnabled = false;
  const sendDebuggerCommand = async (method: string, params?: Record<string, unknown>): Promise<unknown> =>
    sendInterruptibleDebuggerCommand(target, method, params);
  try {
    for (const before of candidates) {
      observation = await stableApplicationObservation(tabId, { forControlDispatch: true });
      const matches = authorizedConsentCandidates(observation).filter(candidate =>
        candidate.action.text === before.action.text && candidate.required === before.required);
      const candidate = matches.length === 1 ? matches[0]! : null;
      const consentField: PageFieldObservation = {
        fieldId: before.action.actionId, stableFieldKey: `consent:${before.action.text}`,
        selector: candidate?.action.selector ?? before.action.selector, label: before.action.text,
        type: "checkbox", controlKind: "checkbox", required: before.required, options: [], currentValue: ""
      };
      const instruction: FillInstruction = { fieldId: consentField.fieldId,
        stableFieldKey: consentField.stableFieldKey, selector: consentField.selector,
        type: "checkbox", value: true, expectedLabel: consentField.label };
      if (observation.url !== initialObservation.url || observation.pageStage !== "application_form") {
        throw controlExecutionError(consentField, controlRoutingFailure(instruction, consentField,
          "control_page_changed", "协议操作前页面已变化，未执行点击"));
      }
      if (!candidate) {
        // A previously checked required agreement is no longer a candidate.
        const checked = observation.fields.filter(field => field.label === before.action.text &&
          field.type === "checkbox" && field.currentValue === "true");
        if (checked.length === 1 || !before.required) continue;
        throw controlExecutionError(consentField, controlRoutingFailure(instruction, consentField,
          "control_target_missing", "协议语义身份失联或不唯一"));
      }
      const inspectCandidate = async (phase: "observe" | "prepare_control" = "observe") => {
        const execution = await executeInterruptibleScript({
          target: { tabId }, world: "MAIN", func: inspectConsentConfirmationInPage,
          args: [{ ...candidate.action, driverPhase: phase }]
        });
        return execution[0]?.result ?? null;
      };
      let primedProbe = await inspectCandidate();
      const controlAdapter = resolveControlAdapter({
        applicationUrl: observation.url, label: candidate.action.text,
        semanticKey: "consent agreement privacy authorization declaration",
        type: primedProbe?.controlInputType ?? "", controlKind: "checkbox",
        tagName: primedProbe?.controlTagName ?? "", readOnly: primedProbe?.controlReadOnly ?? true,
        placeholder: "", classNames: primedProbe?.controlClassNames ?? []
      });
      let result: Awaited<ReturnType<typeof executeConsentConfirmationDriver>> | undefined;
      const routed = await executeSelectedControl(controlAdapter, instruction, consentField, {
        "generic.consent-confirmation.trusted-pointer.v1": async () => {
          // Unknown controls never attach a debugger or prepare an interaction surface.
          if (!attached) {
            await chrome.debugger.attach(target, "1.3");
            attached = true;
            await prepareFocusEmulatedTrustedPointerSurface(sendDebuggerCommand);
            focusEmulationEnabled = true;
          }
          result = await executeConsentConfirmationDriver({
            action: candidate.action,
            inspect: async (phase = "observe") => {
              if (phase === "observe" && primedProbe) {
                const current = primedProbe; primedProbe = null; return current;
              }
              return inspectCandidate(phase);
            },
            clickPoint: point => dispatchTrustedPointerClick(sendDebuggerCommand, point),
            scrollPoint: (point, deltaY) => dispatchTrustedPointerScroll(sendDebuggerCommand, point, deltaY),
            wait: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
          });
          return { fieldId: consentField.fieldId, success: result.checked, expected: "true", actual: String(result.checked),
            error: result.error, driverStage: result.stage, driverDiagnostics: { ...result.diagnostics } };
        }
      });
      if (!routed.success && candidate.required) throw controlExecutionError(consentField, routed);
      if (result?.checked) labels.push(result.text || candidate.action.text);
      changed = changed || Boolean(result?.changed);
    }
  } finally {
    if (attached && focusEmulationEnabled) await releaseTrustedPointerSurface(sendDebuggerCommand).catch(() => undefined);
    if (attached) await chrome.debugger.detach(target).catch(() => undefined);
  }
  return { observation: await stableApplicationObservation(tabId, { forControlDispatch: true }),
    changed, labels: [...new Set(labels)].slice(0, 20) };
}

async function fillAutoApplyFormWithVision(input: {
  credential: AutoApplyRuntimeCredential;
  visionSessionId: string;
  tabId: number;
  candidateFacts: Record<string, string>;
  initialObservation: PageObservation;
  diagnosticContext: {
    batchId: string;
    batchJobId: string;
    commandId: string;
  };
  onDiagnostic?: (entry: VisionIterationDiagnostic) => Promise<void> | void;
  assertActive?: () => void;
  abortSignal?: AbortSignal;
  engineMode?: "legacy" | "shadow_v2" | "layered_v2";
  allowConsentClick?: boolean;
  /** Present only after the site explicitly rejected a submit attempt. */
  repairFieldKeys?: ReadonlySet<string>;
  onUnavailableRequiredOptions?: (field: PageFieldObservation, error: RecruitingError) => void;
}): Promise<{
  observation: PageObservation;
  readback: FillResult[];
  attempts: VisionFillAttempt[];
}> {
  let observation = input.initialObservation;
  const attempts: VisionFillAttempt[] = [];
  const readback: FillResult[] = [];
  const requiredFieldFailureCounts = new Map<string, number>();
  const excludedPlanningFieldKeys = new Set<string>();
  const unconfirmedFieldKeys = new Set<string>();
  // Required-field planning deliberately ignores ordinary exclusion keys so a
  // rebuilt identity field cannot be hidden. Post-submit repair is different:
  // its immutable site-rejected set already supplies the authority boundary,
  // and each successfully processed stable identity must leave that set once.
  const completedRepairFieldKeys = new Set<string>();
  // Selecting a Moka year can rebuild its sibling month Select with an
  // implicit January. Remember only that exact temporal pair so the next
  // single-field iteration may replace the generated default with the
  // candidate's real month; unrelated pre-existing values remain protected.
  const mokaImplicitMonthPairs = new Set<string>();
  const fillScope = (current: PageObservation) => autoApplyFillObservation(
    { ...current, fields: current.fields.filter((field) => !unconfirmedFieldKeys.has(siteValidationFieldKey(field))) },
    input.candidateFacts, input.repairFieldKeys
  );
  const fillReady = (current: PageObservation, critical: readonly string[]) =>
    requiredFieldFailureCounts.size === 0 && visionFormReadyForFinalReview(current);
  const emitDiagnostic = async (
    iteration: number,
    phase: VisionDiagnosticPhase,
    value: Partial<Omit<VisionIterationDiagnostic,
      "schemaVersion" | "at" | "batchId" | "batchJobId" | "commandId" | "iteration" | "phase">> = {}
  ) => {
    if (!input.onDiagnostic) return;
    const {
      requiredBlockers = [],
      criticalFailures = [],
      label = null,
      error = null,
      ...rest
    } = value;
    const base: VisionIterationDiagnostic = {
      schemaVersion: "auto-apply-vision-diagnostic.v1",
      at: new Date().toISOString(),
      ...input.diagnosticContext,
      iteration,
      phase,
      requiredBlockers: [],
      criticalFailures: [],
      next: null,
      source: null,
      actionType: null,
      fieldId: null,
      stableFieldKey: null,
      label: null,
      expected: null,
      actual: null,
      success: null,
      error: null
    };
    await input.onDiagnostic({
      ...base,
      ...rest,
      requiredBlockers: sanitizedVisionDiagnosticLabels(requiredBlockers),
      criticalFailures: sanitizedVisionDiagnosticLabels(criticalFailures),
      label: label ? redactVisionDiagnosticText(label) : null,
      error: error ? redactVisionDiagnosticText(error) : null
    });
  };
  const throwMissingCandidateInformation = async (
    iteration: number,
    currentObservation: PageObservation,
    context: { source?: string; actionType?: string; field?: PageObservation["fields"][number] | null } = {}
  ): Promise<void> => {
    const unresolved = candidateBlockingRequiredFieldFailures(fillScope(currentObservation).fields, input.candidateFacts);
    if (unresolved.length === 0) return;
    const fieldsWithOptions = await withDiscoveredRequiredFieldOptions(input.tabId, unresolved);
    const requiredFieldRequests = candidateInformationRequestsForMissingFields(
      fieldsWithOptions,
      input.candidateFacts
    );
    if (requiredFieldRequests.length === 0) return;
    await emitDiagnostic(iteration, "blocked", {
      requiredBlockers: unresolved.map((field) => field.label),
      criticalFailures: criticalVisualReadbackFailures(currentObservation, input.candidateFacts),
      next: "request_information",
      source: context.source ?? "deterministic",
      actionType: context.actionType ?? "request_information",
      fieldId: context.field?.fieldId ?? null,
      stableFieldKey: context.field?.stableFieldKey ?? null,
      label: context.field?.label ?? null,
      success: false,
      error: `候选人信息包缺少 ${requiredFieldRequests.length} 个必填字段`
    });
    throw new RecruitingError({
      code: "MISSING_INFORMATION",
      stage: "missing_information",
      message: `候选人信息包缺少 ${requiredFieldRequests.length} 个必填字段`,
      retryable: false,
      userAction: "请由 AI 侧一次性向用户确认全部缺失字段，并写回原岗位继续投递。",
      details: {
        fields: requiredFieldRequests.map((request) => request.label),
        informationRequests: requiredFieldRequests,
        requiredFieldRequests
      }
    });
  };
  for (let iteration = 1; iteration <= 36; iteration += 1) {
    input.assertActive?.();
    if (observation.loginRequired) {
      throw new AutoApplyUserActionRequiredError(
        "login",
        observation.loginReason ?? "招聘页面要求登录"
      );
    }
    assertApplicationFormStage(observation, `第 ${iteration} 次填写前复核`);
    if (observation.fields.some((field) => /验证码|captcha|短信校验/i.test(field.label))) {
      throw new AutoApplyUserActionRequiredError("captcha", "视觉执行过程中检测到验证码或短信校验");
    }
    const userAction = await detectAutoApplyUserAction(input.tabId);
    if (userAction) throw new AutoApplyUserActionRequiredError(userAction.type, userAction.message);
    // Live options are constraints, not candidate facts. Use the shared fact-
    // scoped planner even when a city popup contains only one option.
    observation = await prepareScopedWorkCityChoices(
      observation, input.candidateFacts,
      fillScope(observation).fields.filter((field) =>
        !excludedPlanningFieldKeys.has(field.stableFieldKey ?? `fieldId:${field.fieldId}`)),
      fields => withDiscoveredRequiredFieldOptions(input.tabId, fields),
      input.repairFieldKeys && input.onUnavailableRequiredOptions ? (field, error) => {
        input.onUnavailableRequiredOptions!(field, error);
        unconfirmedFieldKeys.add(siteValidationFieldKey(field));
        excludedPlanningFieldKeys.add(field.stableFieldKey ?? `fieldId:${field.fieldId}`);
      } : undefined
    );

    // Do not bulk-repair identity fields here. On Moka, synthetic focus/select
    // can update a DOM value without updating React's store. The deterministic
    // per-field action below uses the fresh observation and trusted CDP input.
    // Agreements and the Moka authenticity declaration are final-stage actions:
    // handling them before candidate fields are resolved can move a reactive
    // page and turn missing information into a control-click failure.
    const mokaAuthenticityDeclarationDeferred = true;

    const planningObservation = visionPlanningObservation(fillScope(observation), excludedPlanningFieldKeys, {
      confirmedMokaAuthenticityDeclaration: mokaAuthenticityDeclarationDeferred,
      siteValidationRepair: Boolean(input.repairFieldKeys),
      candidateFacts: input.candidateFacts
    });
    // Candidate identity repairs must always use the complete, latest page
    // observation. Moka rebuilds controls and can reuse a previously handled
    // stable key for a newly observed semantic field. A planning exclusion
    // must never hide a required name/email/phone/degree correction.
    const deterministicScope = fillScope(observation);
    const deterministicKnownFact = nextDeterministicKnownFactAction(
      input.repairFieldKeys ? {
        ...deterministicScope,
        // Re-commit an explicitly rejected value even if its display matches.
        // Only the planning copy is blanked; the DOM and driver readback are not.
        fields: deterministicScope.fields
          .filter((field) => !completedRepairFieldKeys.has(siteValidationFieldKey(field)))
          .map((field) => field.validationMessage ? { ...field, currentValue: "" } : field)
      } : deterministicScope,
      input.candidateFacts,
      excludedPlanningFieldKeys
    );
    const localCriticalFailures = criticalVisualReadbackFailures(observation, input.candidateFacts);
    const requiredBlockers = candidateBlockingRequiredFieldFailures(
      planningObservation.fields,
      input.candidateFacts
    ).map((field) => field.label);
    const deterministicField = deterministicKnownFact
      ? planningObservation.fields.find((field) => field.fieldId === deterministicKnownFact.fieldId) ?? null
      : null;
    await emitDiagnostic(iteration, "observe", {
      requiredBlockers,
      criticalFailures: localCriticalFailures,
      source: deterministicKnownFact ? "deterministic" : null,
      actionType: deterministicKnownFact?.type ?? null,
      fieldId: deterministicKnownFact?.fieldId ?? null,
      stableFieldKey: deterministicKnownFact?.stableFieldKey ?? null,
      label: deterministicField?.label ?? null,
      expected: deterministicKnownFact
        ? summarizeVisionDiagnosticValue(deterministicKnownFact.value)
        : null,
      actual: deterministicField
        ? summarizeVisionDiagnosticValue(deterministicField.currentValue)
        : null
    });
    const pendingOptionalEnrichment = optionalFieldEnrichmentPending(
      planningObservation,
      input.candidateFacts
    );
    if (!deterministicKnownFact &&
      !pendingOptionalEnrichment &&
      fillReady(planningObservation, localCriticalFailures)) {
      const auditedObservation = await stableApplicationObservation(input.tabId);
      const auditedPlanningObservation = visionPlanningObservation(
        fillScope(auditedObservation),
        excludedPlanningFieldKeys,
        {
          confirmedMokaAuthenticityDeclaration: mokaAuthenticityDeclarationDeferred,
          siteValidationRepair: Boolean(input.repairFieldKeys),
          candidateFacts: input.candidateFacts
        }
      );
      const auditedCriticalFailures = criticalVisualReadbackFailures(
        auditedObservation,
        input.candidateFacts
      );
      if (!fillReady(auditedPlanningObservation, auditedCriticalFailures)) {
        observation = auditedObservation;
        continue;
      }
      await emitDiagnostic(iteration, "converged", {
        requiredBlockers,
        criticalFailures: localCriticalFailures,
        next: "final_review",
        success: true
      });
      return { observation: auditedObservation, readback, attempts };
    }
    if (!deterministicKnownFact) {
      const fieldsWithOptions = await withDiscoveredRequiredFieldOptions(
        input.tabId,
        candidateBlockingRequiredFieldFailures(planningObservation.fields, input.candidateFacts)
      );
      const requiredFieldRequests = candidateInformationRequestsForMissingFields(
        fieldsWithOptions,
        input.candidateFacts
      );
      if (requiredFieldRequests.length > 0) {
        await emitDiagnostic(iteration, "blocked", {
          requiredBlockers,
          criticalFailures: localCriticalFailures,
          next: "request_information",
          source: "deterministic",
          actionType: "request_information",
          success: false,
          error: `候选人信息包缺少 ${requiredFieldRequests.length} 个必填字段`
        });
        throw new RecruitingError({
          code: "MISSING_INFORMATION",
          stage: "missing_information",
          message: `候选人信息包缺少 ${requiredFieldRequests.length} 个必填字段`,
          retryable: false,
          userAction: "请由 AI 侧一次性向用户确认全部缺失字段，并写回原岗位继续投递。",
          details: {
            fields: requiredFieldRequests.map((request) => request.label),
            informationRequests: requiredFieldRequests,
            requiredFieldRequests
          }
        });
      }
    }
    const plan = deterministicKnownFact
      ? {
          configured: true,
          next: "execute_actions",
          actions: [deterministicKnownFact],
          warnings: [deterministicKnownFact.reason]
        }
      : await (async () => {
          input.assertActive?.();
          const screenshot = await redactedEvidence(input.tabId);
          input.assertActive?.();
          if (input.engineMode !== "layered_v2") {
            return planAutoApplyVision(input.credential, input.visionSessionId, {
              task: "fill_application_form",
              observation: {
                ...planningObservation,
                // Upload and final submission are handled by their own
                // phases; proactive ATS parsing is disabled. Hiding page actions here prevents an actionId such as
                // `action-1` from being hallucinated as a fillable fieldId.
                actions: []
              } as unknown as Record<string, unknown>,
              screenshot: screenshot.screenshotDataUrl
                ? { mediaType: "image/jpeg", dataUrl: screenshot.screenshotDataUrl }
                : null,
              candidate: input.candidateFacts,
              policy: iterativeVisionPolicy(attempts, planningObservation)
            }, input.abortSignal);
          }

          const snapshot = buildLayeredObservationSnapshot({
            observation: planningObservation,
            revision: iteration,
            accessHint: "unknown"
          });
          const unresolvedRequiredRegistryKeys = snapshot.fields
            .filter((field) => field.required && !field.currentValue.trim())
            .map((field) => field.registryKey);
          const repairRequest = buildVisionRepairRequest({
            snapshot,
            unresolvedRequiredRegistryKeys,
            candidateFacts: input.candidateFacts
          });
          const allowedRegistryKeys = new Set(
            repairRequest.unresolvedRequiredFields.map((field) => field.registryKey)
          );
          const allowedFields = snapshot.fields
            .filter((field) => allowedRegistryKeys.has(field.registryKey))
            .flatMap((registered) => {
              const source = planningObservation.fields.find((field) =>
                field.fieldId === registered.sourceFieldId
              );
              return source ? [source] : [];
            });
          const rawPlan = await planAutoApplyVision(input.credential, input.visionSessionId, {
            task: "fill_application_form",
            observation: {
              ...planningObservation,
              fields: allowedFields,
              layeredRepairRequest: repairRequest
            } as unknown as Record<string, unknown>,
            screenshot: screenshot.screenshotDataUrl
              ? { mediaType: "image/jpeg", dataUrl: screenshot.screenshotDataUrl }
              : null,
            candidate: Object.fromEntries(
              repairRequest.candidateFacts.map((fact) => [fact.semanticKey, fact.value])
            ),
            policy: {
              ...iterativeVisionPolicy(attempts, planningObservation),
              ...repairRequest.policy,
              allowedRegistryKeys: [...allowedRegistryKeys]
            }
          }, input.abortSignal);
          if (rawPlan.configured !== true) return rawPlan;
          const rawActions = Array.isArray(rawPlan.actions)
            ? rawPlan.actions as Record<string, unknown>[]
            : [];
          const rawAction = rawActions.find((candidate) =>
            ["fill_field", "select_option", "request_information", "stop_for_user", "stop_unsupported"]
              .includes(String(candidate.type ?? ""))
          );
          if (!rawAction) return rawPlan;
          const sourceField = planningObservation.fields.find((field) =>
            field.fieldId === String(rawAction.fieldId ?? "") ||
            field.stableFieldKey === String(rawAction.stableFieldKey ?? "")
          );
          const registered = sourceField
            ? snapshot.fields.find((field) => field.sourceFieldId === sourceField.fieldId)
            : null;
          const value = rawAction.value;
          const semanticKey = String(rawAction.semanticKey ?? "").trim() ||
            Object.entries(input.candidateFacts).find(([, fact]) =>
              String(fact).trim() === String(value ?? "").trim()
            )?.[0] || null;
          const validated = validateVisionRepairResponse({
            response: {
              action: {
                type: rawAction.type,
                registryKey: registered?.registryKey ?? rawAction.registryKey ?? null,
                semanticKey,
                value,
                reason: rawAction.reason ?? "现有 Server LLM 协议兼容层"
              }
            },
            snapshot,
            unresolvedRequiredRegistryKeys,
            candidateFacts: input.candidateFacts
          });
          if (!validated.ok || !validated.action) {
            throw new RecruitingError({
              code: "MODEL_RESPONSE_INVALID",
              stage: "form_observation",
              message: `Layered V2 拒绝模型动作：${validated.errors.join("；")}`,
              retryable: true,
              userAction: "视觉模型动作未通过必填字段和候选事实校验，插件已停止错误填写。"
            });
          }
          const action = validated.action;
          if (action.type === "request_information") {
            return {
              ...rawPlan,
              next: "request_information",
              actions: [{ type: action.type, fieldId: sourceField?.fieldId ?? "", value: null }]
            };
          }
          if (action.type === "stop_for_user" || action.type === "stop_unsupported") {
            return { ...rawPlan, next: "no_action", actions: [] };
          }
          if (!sourceField) {
            throw new RecruitingError({
              code: "MODEL_RESPONSE_INVALID",
              stage: "form_observation",
              message: "Layered V2 动作无法重新绑定到页面字段",
              retryable: true,
              userAction: "动态表单字段已变化，插件已停止使用旧字段引用。"
            });
          }
          return {
            ...rawPlan,
            next: "execute_actions",
            actions: [{
              type: action.type,
              fieldId: sourceField.fieldId,
              stableFieldKey: sourceField.stableFieldKey ?? null,
              semanticKey: action.semanticKey,
              value: action.value
            }]
          };
        })();
    if (plan.configured !== true) {
      if (isInvalidVisionPlanWarning(plan.warnings)) {
        throw new RecruitingError({
          code: "MODEL_RESPONSE_INVALID",
          stage: "form_observation",
          message: plan.warnings.map(String).join("；"),
          retryable: false,
          userAction: "模型返回的动作计划不是有效 JSON，插件已停止并保留原页面；不会刷新或重填。"
        });
      }
      throw new RecruitingError({
        code: "VISION_SERVICE_UNAVAILABLE",
        stage: "form_observation",
        message: Array.isArray(plan.warnings) ? plan.warnings.map(String).join("；") : "服务端视觉模型未配置",
        retryable: true,
        userAction: "请检查 Server 视觉模型配置后重试。"
      });
    }
    const next = String(plan.next ?? "no_action");
    const actions = Array.isArray(plan.actions) ? plan.actions as Record<string, unknown>[] : [];
    const plannedAction = actions.find((candidate) =>
      ["fill_field", "select_option", "check_field", "request_information"].includes(String(candidate.type ?? ""))
    ) ?? null;
    const plannedFieldId = plannedAction ? String(plannedAction.fieldId ?? "") : "";
    const plannedStableFieldKey = plannedAction
      ? String(plannedAction.stableFieldKey ?? "").trim()
      : "";
    const plannedField = planningObservation.fields.find((field) =>
      (plannedFieldId && field.fieldId === plannedFieldId) ||
      (plannedStableFieldKey && field.stableFieldKey === plannedStableFieldKey)
    ) ?? null;
    await emitDiagnostic(iteration, "planned", {
      requiredBlockers,
      criticalFailures: localCriticalFailures,
      next,
      source: deterministicKnownFact ? "deterministic" : "vision_model",
      actionType: plannedAction ? String(plannedAction.type ?? "") : null,
      fieldId: plannedFieldId || null,
      stableFieldKey: plannedField?.stableFieldKey ?? null,
      label: plannedField?.label ?? null,
      expected: plannedAction
        ? summarizeVisionDiagnosticValue(plannedAction.value)
        : null,
      actual: plannedField
        ? summarizeVisionDiagnosticValue(plannedField.currentValue)
        : null
    });
    if (next === "request_information" || actions.some((action) => action.type === "request_information")) {
      const requiredFields = await withDiscoveredRequiredFieldOptions(
        input.tabId,
        candidateBlockingRequiredFieldFailures(planningObservation.fields, input.candidateFacts)
      );
      const requiredFieldRequests = candidateInformationRequestsForMissingFields(
        requiredFields,
        input.candidateFacts
      );
      if (requiredFieldRequests.length > 0) {
        await emitDiagnostic(iteration, "blocked", {
          requiredBlockers,
          criticalFailures: localCriticalFailures,
          next,
          source: deterministicKnownFact ? "deterministic" : "vision_model",
          actionType: "request_information",
          success: false,
          error: "候选人信息不足"
        });
        throw new RecruitingError({
          code: "MISSING_INFORMATION",
          stage: "missing_information",
          message: `候选人信息包缺少 ${requiredFieldRequests.length} 个必填字段`,
          retryable: false,
          userAction: "请由 AI 侧一次性向用户确认全部缺失字段，并写回原岗位继续投递。",
          details: {
            fields: requiredFieldRequests.map((request) => request.label),
            informationRequests: requiredFieldRequests,
            requiredFieldRequests
          }
        });
      }
    }

    const action = actions.find((candidate) =>
      ["fill_field", "select_option", "check_field"].includes(String(candidate.type ?? ""))
    );
    if (!action) {
      const unresolvedFields = candidateBlockingRequiredFieldFailures(fillScope(observation).fields, input.candidateFacts);
      const blockers = unresolvedFields.map((field) => field.label);
      const critical = criticalVisualReadbackFailures(observation, input.candidateFacts);
      // The current DOM is authoritative here. A legacy vision planner can
      // occasionally return an unrelated control-flow hint such as
      // `await_login` after every required field has already passed readback.
      // With no executable action and no live blocker, audit the page once
      // more and converge instead of turning that stale hint into a false
      // site-validation failure.
      if (!blockers.length && !critical.length) {
        const auditedObservation = await stableApplicationObservation(input.tabId);
        const auditedPlanningObservation = visionPlanningObservation(
          fillScope(auditedObservation),
          excludedPlanningFieldKeys,
          {
            confirmedMokaAuthenticityDeclaration: mokaAuthenticityDeclarationDeferred,
            siteValidationRepair: Boolean(input.repairFieldKeys),
            candidateFacts: input.candidateFacts
          }
        );
        const auditedCriticalFailures = criticalVisualReadbackFailures(
          auditedObservation,
          input.candidateFacts
        );
        if (!fillReady(auditedPlanningObservation, auditedCriticalFailures)) {
          observation = auditedObservation;
          continue;
        }
        await emitDiagnostic(iteration, "converged", {
          requiredBlockers: blockers,
          criticalFailures: critical,
          next,
          source: deterministicKnownFact ? "deterministic" : "vision_model",
          success: true
        });
        return { observation: auditedObservation, readback, attempts };
      }
      const fieldsWithOptions = await withDiscoveredRequiredFieldOptions(input.tabId, unresolvedFields);
      const requiredFieldRequests = candidateInformationRequestsForMissingFields(
        fieldsWithOptions,
        input.candidateFacts
      );
      if (requiredFieldRequests.length > 0) {
        await emitDiagnostic(iteration, "blocked", {
          requiredBlockers: blockers,
          criticalFailures: critical,
          next: "request_information",
          source: deterministicKnownFact ? "deterministic" : "vision_model",
          actionType: "request_information",
          success: false,
          error: `候选人信息包缺少 ${requiredFieldRequests.length} 个必填字段`
        });
        throw new RecruitingError({
          code: "MISSING_INFORMATION",
          stage: "missing_information",
          message: `候选人信息包缺少 ${requiredFieldRequests.length} 个必填字段`,
          retryable: false,
          userAction: "请由 AI 侧一次性向用户确认全部缺失字段，并写回原岗位继续投递。",
          details: {
            fields: requiredFieldRequests.map((request) => request.label),
            informationRequests: requiredFieldRequests,
            requiredFieldRequests
          }
        });
      }
      const failures = [...blockers, ...critical];
      const reasonCode = classifyVisualFailureReason(failures);
      await emitDiagnostic(iteration, "blocked", {
        requiredBlockers: blockers,
        criticalFailures: critical,
        next,
        source: deterministicKnownFact ? "deterministic" : "vision_model",
        success: false,
        error: `页面仍未完成：${failures.join("、") || "存在未识别字段"}`
      });
      throw new RecruitingError({
        code: reasonCode === "required_degree_missing"
          ? "REQUIRED_DEGREE_MISSING"
          : "SITE_VALIDATION_BLOCKED",
        stage: "readback",
        message: `视觉模型未给出下一步，但页面仍未完成：${failures.join("、") || "存在未识别字段"}`,
        retryable: true,
        userAction: "插件已保留逐步执行证据，请更新视觉规划规则后重试。",
        details: {
          failures,
          missingFields: blockers,
          readbackFailures: critical
        }
      });
    }

    const requestedFieldId = String(action.fieldId ?? "");
    const requestedStableFieldKey = String(action.stableFieldKey ?? "").trim();
    const field = planningObservation.fields.find((candidate) =>
      (requestedFieldId && candidate.fieldId === requestedFieldId) ||
      (requestedStableFieldKey && candidate.stableFieldKey === requestedStableFieldKey)
    );
    const fieldId = field?.fieldId ?? requestedFieldId;
    if (!field) {
      attempts.push({
        iteration,
        fieldId,
        stableFieldKey: null,
        label: "模型返回的未知字段",
        value: String(action.value ?? ""),
        success: false,
        actual: "",
        error: "fieldId 不属于当前页面观察"
      });
      await emitDiagnostic(iteration, "unknown_field", {
        requiredBlockers,
        criticalFailures: localCriticalFailures,
        next,
        source: deterministicKnownFact ? "deterministic" : "vision_model",
        actionType: String(action.type ?? ""),
        fieldId: fieldId || null,
        expected: summarizeVisionDiagnosticValue(action.value),
        success: false,
        error: "fieldId 不属于当前页面观察"
      });
      observation = await stableApplicationObservation(input.tabId);
      continue;
    }
    const phoneCallingCodePolicy = deterministicKnownFact?.fieldId === field.fieldId &&
      deterministicKnownFact.optionSelectionPolicy?.startsWith("phone_calling_code_") &&
      isPhoneCallingCodeField(field);
    const rangeChoice = deterministicKnownFact?.rangeEndChoice && deterministicKnownFact.fieldId === field.fieldId
      ? rangeEndChoiceForField(field, input.candidateFacts) : null;
    const authoritativeFact = rangeChoice ?? (phoneCallingCodePolicy
      ? confirmedCurrentJobFactForField(field, input.candidateFacts)
      : field.required
        ? authoritativeCandidateFactForField(field, input.candidateFacts)
        : confirmedCurrentJobFactForField(field, input.candidateFacts));
    if (!field.required && !phoneCallingCodePolicy && !rangeChoice &&
      (observedFieldHasValue(field) || !authoritativeFact)) {
      await emitDiagnostic(iteration, "skipped", {
        requiredBlockers,
        criticalFailures: localCriticalFailures,
        next: "reobserve",
        source: deterministicKnownFact ? "deterministic" : "vision_model",
        actionType: String(action.type ?? ""),
        fieldId,
        stableFieldKey: field.stableFieldKey ?? null,
        label: field.label,
        expected: summarizeVisionDiagnosticValue(action.value),
        actual: summarizeVisionDiagnosticValue(field.currentValue),
        success: true,
        error: observedFieldHasValue(field)
          ? "非必填字段已有页面值，已保留且不阻塞提交"
          : "非必填字段没有当前岗位的用户明确确认答案，已跳过且不阻塞提交"
      });
      excludedPlanningFieldKeys.add(field.stableFieldKey ?? `fieldId:${field.fieldId}`);
      continue;
    }
    const semanticConflict = visualSemanticConflict(field);
    if (semanticConflict && !authoritativeFact) {
      attempts.push({
        iteration,
        fieldId,
        stableFieldKey: field.stableFieldKey ?? null,
        label: field.label,
        value: String(action.value ?? ""),
        success: false,
        actual: field.currentValue,
        error: semanticConflict
      });
      await emitDiagnostic(iteration, "semantic_conflict", {
        requiredBlockers,
        criticalFailures: localCriticalFailures,
        next,
        source: deterministicKnownFact ? "deterministic" : "vision_model",
        actionType: String(action.type ?? ""),
        fieldId,
        stableFieldKey: field.stableFieldKey ?? null,
        label: field.label,
        expected: summarizeVisionDiagnosticValue(action.value),
        actual: summarizeVisionDiagnosticValue(field.currentValue),
        success: false,
        error: semanticConflict
      });
      observation = await stableApplicationObservation(input.tabId);
      const conflictDecision = registerVisionFieldAttempt(
        requiredFieldFailureCounts,
        field,
        action.value,
        false
      );
      if (conflictDecision.action === "skip_optional") {
        excludedPlanningFieldKeys.add(field.stableFieldKey ?? `fieldId:${field.fieldId}`);
        await emitDiagnostic(iteration, "skipped", {
          requiredBlockers,
          criticalFailures: localCriticalFailures,
          next: "reobserve",
          source: deterministicKnownFact ? "deterministic" : "vision_model",
          actionType: String(action.type ?? "semantic_conflict"),
          fieldId,
          stableFieldKey: field.stableFieldKey ?? null,
          label: field.label,
          expected: summarizeVisionDiagnosticValue(action.value),
          actual: summarizeVisionDiagnosticValue(field.currentValue),
          success: true,
          error: `optional_field_skipped: ${semanticConflict}`
        });
        continue;
      }
      if (conflictDecision.action === "break_required") {
        await throwMissingCandidateInformation(iteration, observation, {
          source: deterministicKnownFact ? "deterministic" : "vision_model",
          actionType: String(action.type ?? "semantic_conflict"),
          field
        });
        throw new RecruitingError({
          code: "SITE_VALIDATION_BLOCKED",
          stage: "form_observation",
          message: semanticConflict,
          retryable: true,
          userAction: "插件检测到表头和控件值互相矛盾，已停止操作错误控件。",
          details: {
            failures: [`${semanticConflict}；同一必填字段连续 ${conflictDecision.failureCount} 次失败`],
            fieldId,
            stableFieldKey: field.stableFieldKey ?? null,
            label: field.label,
            controlKind: field.controlKind ?? null
          }
        });
      }
      continue;
    }
    // Identity fields are deterministic. A visual plan may select the control,
    // but it may never choose a different traceable candidate value (for
    // example writing the candidate email into the visible name field).
    const value = authoritativeFact?.value ?? String(action.value ?? "");
    const unbackedPhoneCallingCodeDefault = phoneCallingCodePolicy &&
      deterministicKnownFact?.optionSelectionPolicy === "phone_calling_code_default";
    if (!unbackedPhoneCallingCodeDefault && !rangeChoice && !isVisionValueTraceable(input.candidateFacts, value)) {
      if (!field.required) {
        await emitDiagnostic(iteration, "skipped", {
          requiredBlockers,
          criticalFailures: localCriticalFailures,
          next: "reobserve",
          source: deterministicKnownFact ? "deterministic" : "vision_model",
          actionType: String(action.type ?? ""),
          fieldId,
          stableFieldKey: field.stableFieldKey ?? null,
          label: field.label,
          expected: summarizeVisionDiagnosticValue(value),
          actual: summarizeVisionDiagnosticValue(field.currentValue),
          success: true,
          error: "非必填字段的模型值无法追溯，已跳过且不阻塞提交"
        });
        excludedPlanningFieldKeys.add(field.stableFieldKey ?? `fieldId:${field.fieldId}`);
        continue;
      }
      const unresolvedRequiredFields = candidateBlockingRequiredFieldFailures(
        planningObservation.fields,
        input.candidateFacts
      );
      const fieldsWithOptions = await withDiscoveredRequiredFieldOptions(
        input.tabId,
        unresolvedRequiredFields.length > 0 ? unresolvedRequiredFields : [field]
      );
      const informationRequests = candidateInformationRequestsForMissingFields(
        fieldsWithOptions,
        input.candidateFacts
      );
      if (informationRequests.length > 0) {
        await emitDiagnostic(iteration, "blocked", {
          requiredBlockers,
          criticalFailures: localCriticalFailures,
          next: "request_information",
          source: deterministicKnownFact ? "deterministic" : "vision_model",
          actionType: "request_information",
          fieldId,
          stableFieldKey: field.stableFieldKey ?? null,
          label: field.label,
          expected: null,
          actual: summarizeVisionDiagnosticValue(field.currentValue),
          success: false,
          error: "候选人信息包缺少该必填事实"
        });
        throw new RecruitingError({
          code: "MISSING_INFORMATION",
          stage: "missing_information",
          message: `候选人信息包缺少 ${informationRequests.length} 个必填字段`,
          retryable: false,
          userAction: "请由 AI 侧一次性向用户确认全部缺失字段，并写回原岗位继续投递。",
          details: {
            fields: informationRequests.map((request) => request.label),
            informationRequests,
            requiredFieldRequests: informationRequests
          }
        });
      }
      await emitDiagnostic(iteration, "blocked", {
        requiredBlockers,
        criticalFailures: localCriticalFailures,
        next,
        source: deterministicKnownFact ? "deterministic" : "vision_model",
        actionType: String(action.type ?? ""),
        fieldId,
        stableFieldKey: field.stableFieldKey ?? null,
        label: field.label,
        expected: summarizeVisionDiagnosticValue(value),
        actual: summarizeVisionDiagnosticValue(field.currentValue),
        success: false,
        error: "模型值无法追溯到候选人信息包"
      });
      throw new RecruitingError({
        code: "MODEL_RESPONSE_INVALID",
        stage: "form_observation",
        message: `视觉模型为“${field.label}”返回了无法追溯到候选人信息包的值`,
        retryable: true,
        userAction: "视觉模型只能引用信息包事实或从日期中拆分出的年/月。"
      });
    }
    const actionReadbackMatches = phoneCallingCodePolicy
      ? phoneCallingCodeReadbackMatches(field, value)
      : visionReadbackMatches(field, value, authoritativeFact?.key ?? action.semanticKey);
    if (actionReadbackMatches &&
      !(input.repairFieldKeys && field.validationMessage)) {
      attempts.push({
        iteration,
        fieldId,
        stableFieldKey: field.stableFieldKey ?? null,
        label: field.label,
        value,
        success: true,
        actual: field.currentValue,
        error: null
      });
      await emitDiagnostic(iteration, "already_satisfied", {
        requiredBlockers,
        criticalFailures: localCriticalFailures,
        next,
        source: deterministicKnownFact ? "deterministic" : "vision_model",
        actionType: String(action.type ?? ""),
        fieldId,
        stableFieldKey: field.stableFieldKey ?? null,
        label: field.label,
        expected: summarizeVisionDiagnosticValue(value),
        actual: summarizeVisionDiagnosticValue(field.currentValue),
        success: true
      });
      excludedPlanningFieldKeys.add(field.stableFieldKey ?? `fieldId:${field.fieldId}`);
      continue;
    }
    const baseInstruction = instructionFromObservedField(
      field,
      value,
      authoritativeFact?.key ?? String(action.semanticKey ?? field.stableFieldKey ?? fieldId)
    );
    const instruction = baseInstruction && phoneCallingCodePolicy
      ? { ...baseInstruction, optionSelectionPolicy: deterministicKnownFact!.optionSelectionPolicy }
      : baseInstruction && rangeChoice ? { ...baseInstruction, rangeEndChoice: true } : baseInstruction;
    if (!instruction) {
      if (!field.required) {
        await emitDiagnostic(iteration, "skipped", {
          requiredBlockers,
          criticalFailures: localCriticalFailures,
          next: "reobserve",
          source: deterministicKnownFact ? "deterministic" : "vision_model",
          actionType: String(action.type ?? ""),
          fieldId,
          stableFieldKey: field.stableFieldKey ?? null,
          label: field.label,
          expected: summarizeVisionDiagnosticValue(value),
          actual: summarizeVisionDiagnosticValue(field.currentValue),
          success: true,
          error: "非必填字段不支持自动填写，已跳过且不阻塞提交"
        });
        excludedPlanningFieldKeys.add(field.stableFieldKey ?? `fieldId:${field.fieldId}`);
        continue;
      }
      await throwMissingCandidateInformation(iteration, observation, {
        source: deterministicKnownFact ? "deterministic" : "vision_model",
        actionType: String(action.type ?? ""),
        field
      });
      await emitDiagnostic(iteration, "blocked", {
        requiredBlockers,
        criticalFailures: localCriticalFailures,
        next,
        source: deterministicKnownFact ? "deterministic" : "vision_model",
        actionType: String(action.type ?? ""),
        fieldId,
        stableFieldKey: field.stableFieldKey ?? null,
        label: field.label,
        expected: summarizeVisionDiagnosticValue(value),
        actual: summarizeVisionDiagnosticValue(field.currentValue),
        success: false,
        error: "所选字段不可自动填写"
      });
      throw new RecruitingError({
        code: "SITE_VALIDATION_BLOCKED",
        stage: "form_observation",
        message: `视觉模型选择了不可自动填写的字段：${field.label}`,
        retryable: false,
        userAction: "该字段需要人工处理或补充站点适配策略。"
      });
    }

    const requestedExecutionValue = String(instruction.value ?? "");
    const mutationState = await applicationDomMutationState(input.tabId);
    const mokaPairIdentity = mokaYearMonthPairIdentity(field, instruction.semanticKey);
    const trusted = await executeMokaFillInstructionWithDebugger(
      input.tabId,
      observation,
      field,
      instruction,
      {
        allowReplaceMokaImplicitMonth: field.temporal?.part === "month" &&
          Boolean(mokaPairIdentity && mokaImplicitMonthPairs.has(mokaPairIdentity)),
        siteValidationRepairKeys: input.repairFieldKeys
      }
    );
    const immediate = trusted;
    const executionValue = (instruction.optionSelectionPolicy?.startsWith("phone_calling_code_") ||
      immediate?.controlAdapter?.readbackStrategy === "feishu_location_path") &&
      immediate?.expected ? immediate.expected : requestedExecutionValue;
    if (immediate?.success && field.temporal?.part === "year" && mokaPairIdentity) {
      mokaImplicitMonthPairs.add(mokaPairIdentity);
    }
    if (immediate?.success) await settleApplicationDomAfterFill(input.tabId, mutationState.version, instruction);
    const after = await stableApplicationObservation(input.tabId, { forControlDispatch: true });
    const rebound = after.url === observation.url && after.pageStage === "application_form"
      ? bindObservedInstruction(after, instruction) : null;
    const mokaPreferredLocation = MOKA_LOCATION_DRIVER_CODES.has(immediate?.controlAdapter?.adapterCode ?? "");
    const registeredReadback = immediate?.controlAdapter
      ? registeredControlReadbackMatches({
          controlAdapter: immediate.controlAdapter,
          field: rebound,
          expected: executionValue,
          semanticKey: instruction.semanticKey,
          dateValue: instruction.dateValue,
          datePrecision: instruction.datePrecision
        })
      : null;
    const freshReadbackMatches = registeredReadback?.matches ??
      visionReadbackMatches(rebound, executionValue, instruction.semanticKey);
    const siteErrorRemains = false; // Stale field errors are not pre-submit gates.
    // Later display text cannot turn a failed driver into a successful write.
    const success = !siteErrorRemains && Boolean(immediate?.success) && freshReadbackMatches;
    const actual = rebound?.currentValue ?? immediate?.actual ?? "";
    const error = success ? null : immediate?.error ?? (siteErrorRemains
      ? `commit_validation_not_cleared: ${rebound?.validationMessage}` : "重新观察后回读不一致");
    const attempt: VisionFillAttempt = {
      iteration,
      fieldId,
      stableFieldKey: field.stableFieldKey ?? null,
      label: field.label,
      value: executionValue,
      success,
      actual,
      error,
      ...(immediate?.controlAdapter ? { controlAdapter: immediate.controlAdapter } : {})
    };
    attempts.push(attempt);
    readback.push({
      fieldId,
      success,
      expected: executionValue,
      actual,
      error,
      ...(immediate?.controlAdapter ? { controlAdapter: immediate.controlAdapter } : {})
    });
    observation = after;
    if (success) {
      excludedPlanningFieldKeys.add(field.stableFieldKey ?? `fieldId:${field.fieldId}`);
      if (input.repairFieldKeys) completedRepairFieldKeys.add(siteValidationFieldKey(field));
    }
    await emitDiagnostic(iteration, "executed", {
      requiredBlockers,
      criticalFailures: localCriticalFailures,
      next,
      source: deterministicKnownFact ? "deterministic" : "vision_model",
      actionType: String(action.type ?? ""),
      fieldId,
      stableFieldKey: field.stableFieldKey ?? null,
      label: field.label,
      expected: summarizeVisionDiagnosticValue(executionValue),
      actual: summarizeVisionDiagnosticValue(actual),
      success,
      error,
      controlAdapter: immediate?.controlAdapter ?? null
    });

    if (!success && isUnconfirmedFieldReadback({
      result: immediate, current: rebound, matches: freshReadbackMatches, error
    })) {
      // Do not rerun a driver merely because readback was empty/unconfirmed.
      // Initial fill proceeds to the first authorized site validation. During
      // repair, finish the other rejected fields first (e.g. the other range
      // endpoint), then the caller audits the complete repaired target set.
      unconfirmedFieldKeys.add(siteValidationFieldKey(field));
      excludedPlanningFieldKeys.add(field.stableFieldKey ?? `fieldId:${field.fieldId}`);
      await emitDiagnostic(iteration, "executed", {
        next: input.repairFieldKeys ? "reobserve" : "final_review",
        fieldId, stableFieldKey: field.stableFieldKey ?? null, label: field.label,
        success: false, error: `field_readback_unconfirmed: ${error ?? "等待站点校验"}`
      });
      continue;
    }

    if (!success && mokaPreferredLocation && (immediate?.success || isMokaLocationOptionUnavailable(immediate))) {
      if (!field.required) {
        excludedPlanningFieldKeys.add(field.stableFieldKey ?? `fieldId:${field.fieldId}`);
        continue;
      }
      if (isMokaLocationOptionUnavailable(immediate)) {
        const unavailableError = mokaLocationOptionUnavailableError({
          field,
          expectedValue: executionValue,
          result: immediate
        });
        if (unavailableError) {
          await emitDiagnostic(iteration, "blocked", {
            requiredBlockers,
            criticalFailures: localCriticalFailures,
            next: "request_information",
            source: deterministicKnownFact ? "deterministic" : "vision_model",
            actionType: "request_information",
            fieldId,
            stableFieldKey: field.stableFieldKey ?? null,
            label: field.label,
            expected: summarizeVisionDiagnosticValue(executionValue),
            actual: summarizeVisionDiagnosticValue(actual),
            success: false,
            error: unavailableError.message,
            controlAdapter: immediate.controlAdapter ?? null
          });
          if (input.repairFieldKeys && input.onUnavailableRequiredOptions) {
            input.onUnavailableRequiredOptions(field, unavailableError);
            unconfirmedFieldKeys.add(siteValidationFieldKey(field));
            excludedPlanningFieldKeys.add(field.stableFieldKey ?? `fieldId:${field.fieldId}`);
            continue;
          }
          throw unavailableError;
        }
      }
      const unconfirmedError = mokaLocationSelectionUnconfirmedError({
        field,
        expectedValue: executionValue,
        actualValue: actual,
        result: immediate,
        source: "iterative_action"
      });
      await emitDiagnostic(iteration, "blocked", {
        requiredBlockers,
        criticalFailures: localCriticalFailures,
        next: "request_information",
        source: deterministicKnownFact ? "deterministic" : "vision_model",
        actionType: "request_information",
        fieldId,
        stableFieldKey: field.stableFieldKey ?? null,
        label: field.label,
        expected: summarizeVisionDiagnosticValue(executionValue),
        actual: summarizeVisionDiagnosticValue(actual),
        success: false,
        error: unconfirmedError.message,
        controlAdapter: immediate?.controlAdapter ?? null
      });
      throw unconfirmedError;
    }

    if (!success && field.required && immediate?.driverFailureCode === "control_option_unavailable") {
      const request = candidateInformationRequestForUnavailableOptions(field, executionValue, immediate.availableOptions, immediate);
      if (request) {
        const unavailable = new RecruitingError({
          code: "MISSING_INFORMATION", stage: "missing_information", retryable: false,
          message: field.optionSource === "search"
            ? `「${field.label}」未找到唯一完全匹配的搜索结果，请核对完整名称后补充。`
            : `「${field.label}」的已有答案不在该岗位真实选项中，请从返回的列表选择。`,
          userAction: "在 AI Offer 补充信息中确认真实选项后继续。",
          details: { fields: [request.label], informationRequests: [request], requiredFieldRequests: [request] }
        });
        if (input.repairFieldKeys && input.onUnavailableRequiredOptions) {
          input.onUnavailableRequiredOptions(field, unavailable);
          unconfirmedFieldKeys.add(siteValidationFieldKey(field));
          excludedPlanningFieldKeys.add(field.stableFieldKey ?? `fieldId:${field.fieldId}`);
          continue;
        }
        throw unavailable;
      }
    }
    const fieldAttemptDecision = registerVisionFieldAttempt(
      requiredFieldFailureCounts,
      field,
      executionValue,
      success
    );
    if (fieldAttemptDecision.action === "skip_optional") {
      excludedPlanningFieldKeys.add(field.stableFieldKey ?? `fieldId:${field.fieldId}`);
      await emitDiagnostic(iteration, "skipped", {
        requiredBlockers,
        criticalFailures: localCriticalFailures,
        next: "reobserve",
        source: deterministicKnownFact ? "deterministic" : "vision_model",
        actionType: String(action.type ?? "fill_field"),
        fieldId,
        stableFieldKey: field.stableFieldKey ?? null,
        label: field.label,
        expected: summarizeVisionDiagnosticValue(executionValue),
        actual: summarizeVisionDiagnosticValue(actual),
        success: true,
        error: `optional_field_skipped: ${error ?? "首次填写后未通过回读"}`,
        controlAdapter: immediate?.controlAdapter ?? null
      });
      continue;
    }

    if (!success && isUnsupportedRequiredControlFailure(error)) {
      const unsupportedError = error ?? unsupportedRequiredControlFailure({
        label: field.label,
        controlType: "自定义必填控件"
      });
      await emitDiagnostic(iteration, "blocked", {
        requiredBlockers,
        criticalFailures: localCriticalFailures,
        next: "stop",
        source: deterministicKnownFact ? "deterministic" : "vision_model",
        actionType: String(action.type ?? ""),
        fieldId,
        stableFieldKey: field.stableFieldKey ?? null,
        label: field.label,
        expected: summarizeVisionDiagnosticValue(executionValue),
        actual: summarizeVisionDiagnosticValue(actual),
        success: false,
        error: unsupportedError,
        controlAdapter: immediate?.controlAdapter ?? null
      });
      throw new RecruitingError({
        code: "SITE_VALIDATION_BLOCKED",
        stage: "readback",
        message: unsupportedError,
        retryable: false,
        userAction: "当前字段没有已登记且通过真实页面验收的控件 Driver；插件未尝试其他输入方式，也未继续提交。",
        details: {
          failures: [unsupportedError],
          fieldLabel: field.label,
          ...controlAdapterFailureDetails({
            reasonCode: "unsupported_required_control",
            fieldId: field.fieldId,
            stableFieldKey: field.stableFieldKey,
            fieldName: field.label,
            expectedValue: executionValue,
            actualValue: actual,
            controlAdapter: immediate?.controlAdapter
          })
        }
      });
    }

    if (!success && isDateControlInteractionFailure(error)) {
      await emitDiagnostic(iteration, "blocked", {
        requiredBlockers,
        criticalFailures: localCriticalFailures,
        next: "stop",
        source: deterministicKnownFact ? "deterministic" : "vision_model",
        actionType: String(action.type ?? ""),
        fieldId,
        stableFieldKey: field.stableFieldKey ?? null,
        label: field.label,
        expected: summarizeVisionDiagnosticValue(executionValue),
        actual: summarizeVisionDiagnosticValue(actual),
        success: false,
        error,
        controlAdapter: immediate?.controlAdapter ?? null
      });
      const dateError = error ?? dateControlInteractionFailure("日期控件交互失败");
      throw new RecruitingError({
        code: "SITE_VALIDATION_BLOCKED",
        stage: "readback",
        message: dateError,
        retryable: true,
        userAction: "插件已停止日期字段操作，未回退到键盘输入，也未继续提交。",
        details: {
          failures: [dateError],
          ...controlAdapterFailureDetails({
            reasonCode: "date_control_interaction_failed",
            fieldId: field.fieldId,
            stableFieldKey: field.stableFieldKey,
            fieldName: field.label,
            expectedValue: executionValue,
            actualValue: actual,
            driverStage: immediate?.driverStage,
            controlAdapter: immediate?.controlAdapter
          })
        }
      });
    }

    if (!success && isMokaFlatSelectOptionUnavailable(immediate)) {
      if (!field.required) {
        excludedPlanningFieldKeys.add(field.stableFieldKey ?? `fieldId:${field.fieldId}`);
        continue;
      }
      const unavailableError = mokaFlatSelectOptionUnavailableError({
        field,
        expectedValue: executionValue,
        result: immediate
      });
      if (unavailableError) throw unavailableError;
    }

    if (!success && isMokaFlatSelectInteractionFailure(error)) {
      const selectError = error ??
        "moka_flat_select_control_interaction_failed: Moka 平面下拉控件交互失败";
      await emitDiagnostic(iteration, "blocked", {
        requiredBlockers,
        criticalFailures: localCriticalFailures,
        next: "stop",
        source: deterministicKnownFact ? "deterministic" : "vision_model",
        actionType: String(action.type ?? ""),
        fieldId,
        stableFieldKey: field.stableFieldKey ?? null,
        label: field.label,
        expected: summarizeVisionDiagnosticValue(executionValue),
        actual: summarizeVisionDiagnosticValue(actual),
        success: false,
        error: selectError,
        controlAdapter: immediate?.controlAdapter ?? null
      });
      throw new RecruitingError({
        code: "SITE_VALIDATION_BLOCKED",
        stage: "readback",
        message: selectError,
        retryable: false,
        userAction: `插件已停止“${field.label}”下拉控件操作，不会输入文字、切换 Driver、刷新或重填。`,
        details: {
          failures: [selectError],
          fieldLabel: field.label,
          ...controlAdapterFailureDetails({
            reasonCode: "control_interaction_failed",
            fieldId: field.fieldId,
            stableFieldKey: field.stableFieldKey,
            fieldName: field.label,
            expectedValue: executionValue,
            actualValue: actual,
            driverStage: immediate?.driverStage,
            controlAdapter: immediate?.controlAdapter
          }),
          driverFailureCode: immediate?.driverFailureCode ?? null,
          driverDiagnostics: immediate?.driverDiagnostics ?? null
        }
      });
    }

    if (!success && isMokaRecruitingSourceOptionUnavailable(immediate)) {
      if (!field.required) {
        excludedPlanningFieldKeys.add(field.stableFieldKey ?? `fieldId:${field.fieldId}`);
        continue;
      }
      const unavailableError = mokaRecruitingSourceOptionUnavailableError({
        field,
        expectedValue: executionValue,
        result: immediate
      });
      if (unavailableError) throw unavailableError;
    }

    if (!success && isMokaRecruitingSourceInteractionFailure(error)) {
      const sourceError = error ??
        "recruiting_source_control_interaction_failed: 招聘信息来源控件交互失败";
      await emitDiagnostic(iteration, "blocked", {
        requiredBlockers,
        criticalFailures: localCriticalFailures,
        next: "stop",
        source: deterministicKnownFact ? "deterministic" : "vision_model",
        actionType: String(action.type ?? ""),
        fieldId,
        stableFieldKey: field.stableFieldKey ?? null,
        label: field.label,
        expected: summarizeVisionDiagnosticValue(executionValue),
        actual: summarizeVisionDiagnosticValue(actual),
        success: false,
        error: sourceError,
        controlAdapter: immediate?.controlAdapter ?? null
      });
      throw new RecruitingError({
        code: "SITE_VALIDATION_BLOCKED",
        stage: "readback",
        message: sourceError,
        retryable: false,
        userAction: "插件已停止信息来源控件操作，不会带着显示值假成功继续提交，也不会切换其他 Driver。",
        details: {
          failures: [sourceError],
          ...controlAdapterFailureDetails({
            reasonCode: "recruiting_source_control_interaction_failed",
            fieldId: field.fieldId,
            stableFieldKey: field.stableFieldKey,
            fieldName: field.label,
            expectedValue: executionValue,
            actualValue: actual,
            driverStage: immediate?.driverStage,
            controlAdapter: immediate?.controlAdapter
          }),
          driverFailureCode: immediate?.driverFailureCode ?? null,
          driverDiagnostics: immediate?.driverDiagnostics ?? null
        }
      });
    }

    if (!success && isMokaLocationOptionUnavailable(immediate)) {
      if (!field.required) {
        excludedPlanningFieldKeys.add(field.stableFieldKey ?? `fieldId:${field.fieldId}`);
        continue;
      }
      const unavailableError = mokaLocationOptionUnavailableError({
        field,
        expectedValue: executionValue,
        result: immediate
      });
      if (unavailableError) {
        await emitDiagnostic(iteration, "blocked", {
          requiredBlockers,
          criticalFailures: localCriticalFailures,
          next: "request_information",
          source: deterministicKnownFact ? "deterministic" : "vision_model",
          actionType: "request_information",
          fieldId,
          stableFieldKey: field.stableFieldKey ?? null,
          label: field.label,
          expected: summarizeVisionDiagnosticValue(executionValue),
          actual: summarizeVisionDiagnosticValue(actual),
          success: false,
          error: unavailableError.message,
          controlAdapter: immediate.controlAdapter ?? null
        });
        throw unavailableError;
      }
    }

    if (!success && isMokaLocationInteractionFailure(error)) {
      const locationError = error ?? "location_control_interaction_failed: 地点控件交互失败";
      await emitDiagnostic(iteration, "blocked", {
        requiredBlockers,
        criticalFailures: localCriticalFailures,
        next: "stop",
        source: deterministicKnownFact ? "deterministic" : "vision_model",
        actionType: String(action.type ?? ""),
        fieldId,
        stableFieldKey: field.stableFieldKey ?? null,
        label: field.label,
        expected: summarizeVisionDiagnosticValue(executionValue),
        actual: summarizeVisionDiagnosticValue(actual),
        success: false,
        error: locationError,
        controlAdapter: immediate?.controlAdapter ?? null
      });
      throw new RecruitingError({
        code: "SITE_VALIDATION_BLOCKED",
        stage: "readback",
        message: locationError,
        retryable: false,
        userAction: "插件已停止站点地点字段操作，不会刷新页面、重填、改用键盘或切换其他 Driver。",
        details: {
          failures: [locationError],
          ...controlAdapterFailureDetails({
            reasonCode: "location_control_interaction_failed",
            fieldId: field.fieldId,
            stableFieldKey: field.stableFieldKey,
            fieldName: field.label,
            expectedValue: executionValue,
            actualValue: actual,
            driverStage: immediate?.driverStage,
            controlAdapter: immediate?.controlAdapter
          }),
          driverFailureCode: immediate?.driverFailureCode ?? null,
          driverDiagnostics: immediate?.driverDiagnostics ?? null
        }
      });
    }

    if (!success) {
      await emitDiagnostic(iteration, "blocked", {
        next: "stop", source: deterministicKnownFact ? "deterministic" : "vision_model",
        fieldId, stableFieldKey: field.stableFieldKey ?? null, label: field.label,
        success: false, error, controlAdapter: immediate?.controlAdapter ?? null
      });
      if (immediate?.success) {
        // The Driver committed, but the fresh observation did not confirm
        // its field/value. Preserve this outer failure instead of reporting
        // the successful inner result as a missing execution response.
        throw controlExecutionError(field, { ...immediate, success: false, actual, error,
          driverStage: "readback", driverFailureCode: "field_fill_readback_failed" });
      }
      throw controlExecutionError(field, immediate);
    }

  }

  const terminalPlanningObservation = visionPlanningObservation(fillScope(observation), excludedPlanningFieldKeys, {
    siteValidationRepair: Boolean(input.repairFieldKeys),
    candidateFacts: input.candidateFacts
  });
  const terminalCriticalFailures = criticalVisualReadbackFailures(observation, input.candidateFacts);
  if (fillReady(terminalPlanningObservation, terminalCriticalFailures)) {
    await emitDiagnostic(36, "converged", {
      requiredBlockers: [],
      criticalFailures: [],
      next: "final_review",
      success: true,
      error: "非必填字段已按尽力原则停止补全，不阻塞最终提交"
    });
    return { observation, readback, attempts };
  }
  await throwMissingCandidateInformation(36, terminalPlanningObservation, {
    source: "vision_model",
    actionType: "circuit_breaker"
  });
  await emitDiagnostic(36, "circuit_breaker", {
    requiredBlockers: candidateBlockingRequiredFieldFailures(
      terminalPlanningObservation.fields,
      input.candidateFacts
    ).map((field) => field.label),
    criticalFailures: terminalCriticalFailures,
    next: "stop",
    success: false,
    error: "视觉逐步填写达到 36 步上限"
  });
  throw new RecruitingError({
    code: "SITE_VALIDATION_BLOCKED",
    stage: "readback",
    message: "视觉逐步填写超过 36 步仍未完成",
    retryable: true,
    userAction: "请检查是否存在重复动态字段或站点验证提示。"
  });
}

async function executeFinalSubmitWithDebugger(
  tabId: number,
  action: PageObservation["actions"][number] | null,
  expectedText: string,
  onSubmissionActivated?: () => void | Promise<void>,
  allowConsentClick = false,
  previouslyRejectedKeys: ReadonlySet<string> = new Set(),
  captchaContext?: PostSubmitSliderContext,
  submissionSignal?: AbortSignal,
  authorizeSubmitClick?: () => Promise<void>
): Promise<FinalSubmitExecutionResult> {
  const executeSubmissionScript: typeof executeInterruptibleScript = injection =>
    submissionPhaseCall(submissionSignal, () => executeInterruptibleScript(injection));
  const sendSubmissionCommand: typeof sendInterruptibleDebuggerCommand = (target, method, params) =>
    method === "Emulation.setFocusEmulationEnabled" && params?.enabled === false
      ? sendInterruptibleDebuggerCommand(target, method, params)
      : submissionPhaseCall(submissionSignal, () => sendInterruptibleDebuggerCommand(target, method, params));
  const trace: string[] = [];
  const target = { tabId };
  const validationProbeToken = `__recruiting_ai_native_validation_${crypto.randomUUID()}`;
  let validationBaseline: PageObservation | null = null;
  let retainValidationMonitor = false;
  let latestPostSubmitObservation: PageObservation | null = null;
  let pointerDispatchAttempted = false;
  const retainSubmitMonitor = (): FinalSubmitExecutionResult["validationMonitor"] => {
    retainValidationMonitor = true;
    return validationBaseline ? { token: validationProbeToken, baseline: {
      ...validationBaseline,
      fields: validationBaseline.fields.map(field => ({ ...field, currentValue: "" }))
    }, previouslyRejectedKeys: [...previouslyRejectedKeys] } : undefined;
  };
  const armValidationProbe = async (submitText: string) => {
    validationBaseline = await stableApplicationObservation(tabId);
    await executeSubmissionScript({
      target, func: nativeSubmitValidationProbeInPage,
      args: [validationProbeToken, "arm", validationBaseline.fields.map((field) => ({
        key: siteValidationFieldKey(field), selector: field.selector
      })), submitText]
    });
    await executeSubmissionScript({
      target, func: reassertedSubmitValidationProbeInPage,
      args: [validationProbeToken, "arm", validationBaseline.fields.map((field) => ({
        key: siteValidationFieldKey(field), selector: field.selector, hasError: Boolean(field.validationMessage)
      })), submitText]
    });
    await executeSubmissionScript({ target, func: readSiteApplicationPolicyBlockInPage,
      args: [{ phase: "arm", token: validationProbeToken, submitText }] });
  };
  const locate = async (stage: "preview" | "confirmation") => {
    const execution = await executeSubmissionScript({
      target: { tabId },
      func: (
        stageName: "preview" | "confirmation",
        selector: string | null,
        expected: string,
        policy: SubmissionActionPatterns,
        consentAuthorized: boolean
      ) => {
        const normalize = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
        const visible = (element: Element) => {
          const html = element as HTMLElement;
          const style = getComputedStyle(html);
          const rect = html.getBoundingClientRect();
          if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" ||
            rect.width <= 0 || rect.height <= 0 || html.closest("[hidden],[aria-hidden='true']")) return false;
          for (let node = html.parentElement; node; node = node.parentElement) {
            const ancestorStyle = getComputedStyle(node);
            if (ancestorStyle.display === "none" || ancestorStyle.visibility === "hidden" || ancestorStyle.opacity === "0") return false;
          }
          return true;
        };
        const textOf = (element: Element) => normalize(
          element instanceof HTMLInputElement
            ? element.value
            : (element as HTMLElement).innerText || element.getAttribute("aria-label")
        );
        const allControls = () => [...new Set([...document.querySelectorAll<HTMLElement>(
          "button,[role='button'],input[type='button'],input[type='submit'],a"
        )].map(element => element.closest<HTMLElement>("button,input[type='button'],input[type='submit']") ?? element))]
          .filter((candidate) => visible(candidate) && !candidate.matches(":disabled,[aria-disabled='true']"));
        const allowedText = (text: string, phase: "initial" | "confirmation") => {
          const value = text.normalize("NFKC");
          return !new RegExp(policy.forbidden, "iu").test(value) &&
            (consentAuthorized || !new RegExp(policy.consent, "iu").test(value)) &&
            (phase !== "confirmation" || !new RegExp(policy.preview, "iu").test(value)) &&
            new RegExp(policy[phase], "iu").test(value);
        };
        const expectedNormalized = normalize(expected);
        const confirmationContext = (candidate: Element) => {
          const dialogSelector = "[role='dialog'],[role='alertdialog'],.ant-modal,[class*='modal'],[class*='dialog']";
          let root = candidate.closest(dialogSelector);
          // A footer/actions wrapper is part of its owning dialog, not the
          // warning's context. Never cross an explicit semantic dialog root.
          while (root && !root.matches("[role='dialog'],[role='alertdialog']") &&
            (root.tagName === "FOOTER" || /(?:modal|dialog)[-_](?:footer|actions|buttons)(?:[-_\s]|$)/i.test(root.className))) {
            root = root.parentElement?.closest(dialogSelector) ?? null;
          }
          if (!root) return "";
          // Button relabeling and React rebuilding do not create a new notice.
          const context = root.cloneNode(true) as Element;
          context.querySelectorAll("button,[role='button'],input,a").forEach(control => control.remove());
          return normalize(context.textContent);
        };
        let matches: HTMLElement[] = [];
        if (stageName === "preview") {
          const eligible = allControls().filter(candidate => allowedText(textOf(candidate), "initial"));
          // A saved selector must not bypass a second live submit control.
          matches = eligible.length > 1 ? eligible : eligible.filter(candidate => textOf(candidate) === expectedNormalized);
        } else {
          const initial = selector ? document.querySelector<HTMLElement>(selector)?.closest<HTMLElement>(
            "button,[role='button'],input[type='button'],input[type='submit'],a"
          ) ?? null : null;
          const dialogRoots = [...document.querySelectorAll<HTMLElement>(
            "[role='dialog'],[role='alertdialog'],.ant-modal,[class*='modal'],[class*='dialog']"
          )].filter(visible);
          const dialogControls = allControls().filter(candidate => dialogRoots.some(root => root.contains(candidate)));
          const candidates = dialogControls.length
            ? dialogControls
            : new RegExp(policy.preview, "iu").test(expectedNormalized.normalize("NFKC"))
              ? allControls().filter((candidate) => candidate !== initial) : [];
          matches = candidates.filter((candidate) => {
            const text = textOf(candidate);
            const acknowledgement = new RegExp(policy.acknowledgement, "iu").test(text.normalize("NFKC"));
            const continuationAction = allowedText(text, "confirmation") &&
              new RegExp(policy.continuationAction, "iu").test(text.normalize("NFKC"));
            const context = confirmationContext(candidate);
            if (dialogControls.length && (acknowledgement || (continuationAction && context))) {
              return Boolean(context) && (continuationAction || new RegExp(policy.continuationPrompt, "iu").test(context.normalize("NFKC"))) &&
                !new RegExp(policy.continuationBlockedContext, "iu").test(context);
            }
            return allowedText(text, "confirmation");
          });
        }
        if (matches.length !== 1) {
          return { found: false, ambiguous: matches.length > 1, texts: matches.map(textOf).slice(0, 8), url: location.href };
        }
        const element = matches[0]!;
        const text = textOf(element);
        const continuation = stageName === "confirmation" && Boolean(confirmationContext(element)) &&
          (new RegExp(policy.acknowledgement, "iu").test(text.normalize("NFKC")) ||
            new RegExp(policy.continuationAction, "iu").test(text.normalize("NFKC")));
        element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
        const rect = element.getBoundingClientRect();
        return {
          found: true,
          ambiguous: false,
          texts: [text],
          text,
          confirmationKind: continuation ? "continuation" : "submission",
          confirmationIdentity: continuation ? confirmationContext(element) : "",
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          url: location.href
        };
      },
      args: [stage, action?.selector ?? null, expectedText, submissionActionPatterns, allowConsentClick]
    });
    return execution[0]?.result as {
      found: boolean;
      ambiguous: boolean;
      texts: string[];
      text?: string;
      confirmationKind?: "continuation" | "submission";
      confirmationIdentity?: string;
      x?: number;
      y?: number;
      url: string;
    } | undefined;
  };
  const inspect = async () => {
    const execution = await executeSubmissionScript({
      target: { tabId },
      func: readApplicationReceiptInPage
    });
    const state = execution[0]?.result as AutoApplySiteOutcome | undefined;
    if (!state) return undefined;
    // A registered terminal route is the strongest signal. A visible success
    // sentence may be stale behind an application-limit dialog, so policy
    // arbitration runs before accepting non-route success text.
    if (state.success && state.source === "registered_receipt_url") return {
      ...state, validation: "", nativeValidationErrors: [], rejectedFieldKeys: [],
      userActionRequired: null, sitePolicyBlock: null
    };
    const sitePolicyBlock = await detectAutoApplySitePolicyBlock(tabId, { token: validationProbeToken });
    if (sitePolicyBlock.blocked && sitePolicyBlock.reasonCode && sitePolicyBlock.message && sitePolicyBlock.source) {
      return {
        ...state, success: false, validation: "", nativeValidationErrors: [], rejectedFieldKeys: [],
        userActionRequired: null,
        sitePolicyBlock: {
          reasonCode: sitePolicyBlock.reasonCode,
          message: sitePolicyBlock.message,
          source: sitePolicyBlock.source
        }
      };
    }
    const userActionRequired = await detectAutoApplyUserAction(tabId);
    // A visible human-action gate owns the page. Do not spend the remaining
    // active window stabilizing the background application form before
    // collecting the next CAPTCHA observation.
    if (userActionRequired) return {
      ...state, success: false, validation: "", nativeValidationErrors: [], rejectedFieldKeys: [],
      userActionRequired, sitePolicyBlock: null
    };
    const immediateNativeErrors = await executeSubmissionScript({
      target, func: nativeSubmitValidationProbeInPage, args: [validationProbeToken, "read"]
    });
    // A registered terminal route is stronger evidence than validation residue
    // left behind by the SPA's detached/hidden application form.
    if (state.success && !userActionRequired && !immediateNativeErrors[0]?.result?.length) return {
      ...state, validation: "", nativeValidationErrors: [], rejectedFieldKeys: [],
      userActionRequired: null, sitePolicyBlock: null
    };
    const observation = await stableApplicationObservation(tabId);
    latestPostSubmitObservation = observation;
    const nativeErrors = await executeSubmissionScript({
      target, func: nativeSubmitValidationProbeInPage,
      args: [validationProbeToken, "read", observation.fields.map((field) => ({
        key: siteValidationFieldKey(field), selector: field.selector
      }))]
    });
    const nativeValidationErrors = nativeErrors[0]?.result ?? [];
    const reasserted = await executeSubmissionScript({
      target, func: reassertedSubmitValidationProbeInPage,
      args: [validationProbeToken, "read", observation.fields.map((field) => ({
        key: siteValidationFieldKey(field), selector: field.selector, hasError: Boolean(field.validationMessage)
      }))]
    });
    const reassertedKeys = new Set(reasserted[0]?.result ?? []);
    const freshErrors = validationBaseline ? newSiteValidationErrors(validationBaseline, observation, reassertedKeys) : [];
    const rejectedFields = validationBaseline
      ? submissionRejectedFields(validationBaseline, observation, {
        reassertedKeys,
        nativeErrors: nativeValidationErrors,
        previouslyRejectedKeys
      })
      : [];
    const rejectedFieldKeys = rejectedFields.map(siteValidationFieldKey);
    const validation = [...new Set([...freshErrors,
      ...rejectedFields.map((field) => `${field.label}：${field.validationMessage}`),
      ...nativeValidationErrors.map((error) => error.message)])].join("；");
    return {
      ...state, success: false, validation: validation.slice(0, 500), nativeValidationErrors, rejectedFieldKeys,
      userActionRequired
    };
  };
  const sendDebuggerCommand = (method: string, params?: Record<string, unknown>) =>
    sendSubmissionCommand(target, method, params);
  // Final-submit targets on some Moka tenants are replaced on hover/blur. The
  // generic trusted-pointer helper intentionally pauses after mouseMoved for
  // dropdowns, but that delay makes a just-revalidated submit target stale.
  // Keep the same trusted CDP sequence here and remove only that hover pause.
  const dispatchFinalSubmitTrustedPointer = (
    point: Parameters<typeof dispatchTrustedPointerClick>[1]
  ) => dispatchTrustedPointerClick(sendDebuggerCommand, point, async () => undefined);
  const cdpLivePoint = async (stage: "preview" | "confirmation", expected: string, expectedConfirmationIdentity?: string) => {
    const selector = action?.selector ?? null;
    const expression = `(() => {
      const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" ||
          rect.width <= 0 || rect.height <= 0 || element.closest("[hidden],[aria-hidden='true']")) return false;
        for (let node = element.parentElement; node; node = node.parentElement) {
          const ancestorStyle = getComputedStyle(node);
          if (ancestorStyle.display === "none" || ancestorStyle.visibility === "hidden" || ancestorStyle.opacity === "0") return false;
        }
        return true;
      };
      const textOf = (element) => normalize(
        element instanceof HTMLInputElement
          ? element.value
          : element.innerText || element.getAttribute("aria-label")
      );
      const controls = [...new Set([...document.querySelectorAll("button,[role='button'],input[type='button'],input[type='submit'],a")]
        .map(element => element.closest("button,input[type='button'],input[type='submit']") || element))]
        .filter((candidate) => visible(candidate) && !candidate.matches(":disabled,[aria-disabled='true']"));
      const policy = ${JSON.stringify(submissionActionPatterns)};
      const confirmationContext = (candidate) => {
        const dialogSelector = "[role='dialog'],[role='alertdialog'],.ant-modal,[class*='modal'],[class*='dialog']";
        let root = candidate.closest(dialogSelector);
        while (root && !root.matches("[role='dialog'],[role='alertdialog']") &&
          (root.tagName === "FOOTER" || /(?:modal|dialog)[-_](?:footer|actions|buttons)(?:[-_\\s]|$)/i.test(root.className))) {
          root = root.parentElement?.closest(dialogSelector) ?? null;
        }
        if (!root) return "";
        const context = root.cloneNode(true);
        context.querySelectorAll("button,[role='button'],input,a").forEach(control => control.remove());
        return normalize(context.textContent);
      };
      const allowedText = (text, phase) => {
        const value = text.normalize("NFKC");
        return !new RegExp(policy.forbidden, "iu").test(value) &&
          (${JSON.stringify(allowConsentClick)} || !new RegExp(policy.consent, "iu").test(value)) &&
          (phase !== "confirmation" || !new RegExp(policy.preview, "iu").test(value)) &&
          new RegExp(policy[phase], "iu").test(value);
      };
      let matches = [];
      if (${JSON.stringify(stage)} === "preview") {
        const eligible = controls.filter(candidate => allowedText(textOf(candidate), "initial"));
        matches = eligible.length > 1 ? eligible : eligible.filter(candidate => textOf(candidate) === ${JSON.stringify(expected)});
      } else {
        const initial = ${JSON.stringify(selector)} ? document.querySelector(${JSON.stringify(selector)}) : null;
        const initialControl = initial && initial.closest("button,[role='button'],input[type='button'],input[type='submit'],a");
        const dialogRoots = [...document.querySelectorAll("[role='dialog'],[role='alertdialog'],.ant-modal,[class*='modal'],[class*='dialog']")]
          .filter(visible);
        const dialogControls = controls.filter(candidate => dialogRoots.some(root => root.contains(candidate)));
        const candidates = dialogControls.length ? dialogControls : new RegExp(policy.preview, "iu").test(${JSON.stringify(expectedText)}.normalize("NFKC"))
          ? controls.filter((candidate) => candidate !== initialControl) : [];
        matches = candidates.filter((candidate) => {
          const text = textOf(candidate);
          const acknowledgement = new RegExp(policy.acknowledgement, "iu").test(text.normalize("NFKC"));
          const continuationAction = allowedText(text, "confirmation") &&
            new RegExp(policy.continuationAction, "iu").test(text.normalize("NFKC"));
          const context = confirmationContext(candidate);
          if (dialogControls.length && (acknowledgement || (continuationAction && context))) {
            return Boolean(context) && (continuationAction || new RegExp(policy.continuationPrompt, "iu").test(context.normalize("NFKC"))) &&
              !new RegExp(policy.continuationBlockedContext, "iu").test(context);
          }
          return allowedText(text, "confirmation");
        });
      }
      if (matches.length !== 1) return null;
      const match = matches[0];
      if (${JSON.stringify(expected)} && textOf(match) !== ${JSON.stringify(expected)}) return null;
      if (${JSON.stringify(expectedConfirmationIdentity)} && confirmationContext(match) !== ${JSON.stringify(expectedConfirmationIdentity)}) return null;
      return match;
    })()`;
    const evaluated = await sendSubmissionCommand(target, "Runtime.evaluate", {
      expression,
      returnByValue: false,
      objectGroup: "recruiting-ai-submit"
    }) as { result?: { objectId?: string; subtype?: string } };
    const objectId = evaluated.result?.objectId;
    if (!objectId || evaluated.result?.subtype === "null") return null;
    await sendSubmissionCommand(target, "Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: `function(){
        const scrollable = (element) => {
          const style = getComputedStyle(element);
          return /(auto|scroll|overlay)/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
        };
        // 'auto' inherits CSS scroll-behavior:smooth. A fixed wait does not
        // make that animation safe: the point can move after the hit test.
        this.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
        // Moka uses a nested form scroller on some tenants.  scrollIntoView()
        // alone can leave the final button below the background tab viewport.
        // Align each live scroll container once, then force layout before the
        // coordinate readback below.
        for (let parent = this.parentElement; parent; parent = parent.parentElement) {
          if (!scrollable(parent)) continue;
          const rect = this.getBoundingClientRect();
          const parentRect = parent.getBoundingClientRect();
          parent.scrollTo({
            top: parent.scrollTop + rect.top - (parentRect.top + parent.clientHeight / 2),
            left: parent.scrollLeft,
            behavior: 'instant'
          });
        }
        const rect = this.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) {
          window.scrollBy({ top: rect.top - window.innerHeight / 2, behavior: 'instant' });
        }
        void this.getBoundingClientRect();
      }`,
      returnByValue: true
    });
    // Allow reactive layout to settle after the instant scroll, then verify
    // what is actually under the CDP click point.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const geometry = await sendSubmissionCommand(target, "Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: `function(){
        const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
        const rect = this.getBoundingClientRect();
        return {
          connected: this.isConnected,
          text: normalize(this.innerText || this.value || this.getAttribute("aria-label")),
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          targetTag: this.tagName
        };
      }`,
      returnByValue: true
    }) as { result?: { value?: {
      connected?: boolean;
      text?: string;
      left?: number;
      top?: number;
      width?: number;
      height?: number;
      viewportWidth?: number;
      viewportHeight?: number;
      targetTag?: string;
    } } };
    const value = geometry.result?.value;
    if (!value?.connected) return null;
    const candidates = trustedPointerViewportCandidates({
      left: Number(value?.left),
      top: Number(value?.top),
      width: Number(value?.width),
      height: Number(value?.height),
      viewportWidth: Number(value?.viewportWidth),
      viewportHeight: Number(value?.viewportHeight)
    });
    for (const point of candidates) {
      const hitTest = await sendSubmissionCommand(target, "Runtime.callFunctionOn", {
        objectId,
        functionDeclaration: `function(x, y){
          const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
          const hit = document.elementFromPoint(x, y);
          return {
            connected: this.isConnected,
            hitInsideTarget: Boolean(hit && (hit === this || this.contains(hit))),
            hitText: normalize(hit && (hit.innerText || hit.value || hit.getAttribute("aria-label"))),
            hitTag: hit && hit.tagName
          };
        }`,
        arguments: [{ value: point.x }, { value: point.y }],
        returnByValue: true
      }) as { result?: { value?: {
        connected?: boolean;
        hitInsideTarget?: boolean;
        hitText?: string;
        hitTag?: string;
      } } };
      const hit = hitTest.result?.value;
      if (hit?.connected && hit.hitInsideTarget) {
        return { ...value, ...hit, ...point, objectId };
      }
    }
    return null;
  };
  const locateTrustedPoint = async (stage: "preview" | "confirmation", expected: string) => {
    let located: Awaited<ReturnType<typeof locate>>;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      located = await locate(stage);
      if (located?.ambiguous) return { located, point: null };
      if (stage === "confirmation" && !located?.found) return { located, point: null };
      if (located?.found) {
        const point = await cdpLivePoint(stage, located.text ?? expected, located.confirmationIdentity);
        if (point) {
          trace.push(`cdp_${stage}_live_point_resolved:${attempt}`);
          return { located, point };
        }
      }
      trace.push(`cdp_${stage}_live_point_missing:${attempt}:${located?.texts.join("|") || "none"}`);
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 180));
    }
    return { located, point: null };
  };
  const installTrustedClickProbe = async (objectId: string, token: string) => {
    await sendSubmissionCommand(target, "Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: `function(token){
        const target = this;
        const events = [];
        const listeners = {};
        for (const type of ["mousedown", "mouseup", "click"]) {
          const listener = (event) => events.push({
            type,
            isTrusted: event.isTrusted === true,
            insideTarget: Boolean(event.target && (event.target === target || target.contains(event.target)))
          });
          listeners[type] = listener;
          target.addEventListener(type, listener, true);
        }
        Object.defineProperty(target, token, {
          value: { events, listeners },
          configurable: true
        });
      }`,
      arguments: [{ value: token }],
      returnByValue: true
    });
  };
  const collectTrustedClickProbe = async (objectId: string, token: string) => {
    const result = await sendSubmissionCommand(target, "Runtime.callFunctionOn", {
      objectId,
      functionDeclaration: `function(token){
        const probe = this[token];
        if (!probe) return null;
        for (const [type, listener] of Object.entries(probe.listeners)) {
          this.removeEventListener(type, listener, true);
        }
        const events = probe.events.map((event) => ({ ...event }));
        delete this[token];
        return {
          events,
          trustedClickObserved: events.some((event) =>
            event.type === "click" && event.isTrusted && event.insideTarget
          )
        };
      }`,
      arguments: [{ value: token }],
      returnByValue: true
    }) as { result?: { value?: {
      events?: Array<{ type: string; isTrusted: boolean; insideTarget: boolean }>;
      trustedClickObserved?: boolean;
    } | null } };
    return result.result?.value ?? null;
  };
  const dispatchPreviewGatePointer = async (
    point: Awaited<ReturnType<typeof cdpLivePoint>>,
    attempt: number
  ) => {
    if (!point?.objectId) return null;
    const probeToken = `__recruiting_ai_preview_click_probe_${crypto.randomUUID()}`;
    await installTrustedClickProbe(point.objectId, probeToken);
    const liveTarget = await sendSubmissionCommand(target, "Runtime.callFunctionOn", {
      objectId: point.objectId,
      functionDeclaration: `function(x, y){
        const hit = document.elementFromPoint(x, y);
        return {
          connected: this.isConnected,
          hitInsideTarget: Boolean(hit && (hit === this || this.contains(hit)))
        };
      }`,
      arguments: [{ value: point.x }, { value: point.y }],
      returnByValue: true
    }) as { result?: { value?: { connected?: boolean; hitInsideTarget?: boolean } } };
    if (!liveTarget.result?.value?.connected || !liveTarget.result.value.hitInsideTarget) {
      const probe = await collectTrustedClickProbe(point.objectId, probeToken).catch(() => null);
      trace.push(`cdp_preview_target_stale_before_dispatch:${attempt}`);
      return {
        ...(probe ?? { events: [], trustedClickObserved: false }),
        pointerDispatched: false,
        staleBeforeDispatch: true
      };
    }
    await dispatchFinalSubmitTrustedPointer(point);
    pointerDispatchAttempted = true;
    await new Promise((resolve) => setTimeout(resolve, 120));
    const probe = await collectTrustedClickProbe(point.objectId, probeToken).catch(() => null);
    trace.push(probe
      ? `cdp_preview_pointer_events:${attempt}:${probe.events?.map((event) =>
        `${event.type}:${event.isTrusted ? "trusted" : "synthetic"}:${event.insideTarget ? "inside" : "outside"}`
      ).join("|") || "none"}`
      : `cdp_preview_pointer_events:${attempt}:unavailable`);
    return probe ? { ...probe, pointerDispatched: true, staleBeforeDispatch: false } : null;
  };
  let attached = false;
  let focusEmulationEnabled = false;
  try {
    // The automation status panel is intentionally interactive while fields are
    // being filled, but its fixed bottom-right surface can cover ATS submit
    // controls such as Feishu's affixed footer. Final submission no longer
    // needs pause/cancel controls, so remove our own surface before resolving
    // the preview gate or direct-submit target.
    const statusOverlayRemoved = await removeAutoApplyOverlay(tabId);
    trace.push(statusOverlayRemoved
      ? "auto_apply_status_overlay_removed_before_submit"
      : "auto_apply_status_overlay_removal_unconfirmed");
    // Attaching Chrome Debugger adds an infobar that changes the page viewport.
    // Attach first, then resolve the live element coordinates; otherwise the
    // trusted click lands above the intended control.
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    trace.push("cdp_attached_before_locate");
    // Moka can ignore both pointer and keyboard activation when the bound
    // automation tab lacks page focus.  Emulation keeps the tab in the
    // background while allowing the site's trusted pointer handler to run.
    await prepareFocusEmulatedTrustedPointerSurface(sendDebuggerCommand);
    focusEmulationEnabled = true;
    trace.push("cdp_focus_emulation_enabled");
    // Input.dispatch* targets the attached page directly. Bringing it to the
    // front would steal the user's active tab during ordinary automation.
    trace.push("cdp_page_kept_in_background");
    await new Promise((resolve) => setTimeout(resolve, 180));
    // Observe before computing the pointer point: a stable DOM read can wait
    // through a reactive render and must not leave us clicking stale geometry.
    await armValidationProbe(expectedText);
    const previewTarget = await locateTrustedPoint("preview", expectedText);
    const preview = previewTarget.located;
    if (!preview?.found || typeof preview.x !== "number" || typeof preview.y !== "number") {
      return {
        executed: false,
        actionId: action?.actionId ?? null,
        actionText: preview?.texts.join("；") || null,
        observedResult: "blocked_by_site_validation",
        pageUrlAfterClick: preview?.url ?? "",
        error: preview?.ambiguous ? "最终提交按钮不唯一，已阻止自动点击" : "未找到唯一的最终提交按钮",
        trace: [...trace, `preview_candidates:${preview?.texts.join("|") || "none"}`]
      };
    }
    const previewPoint = previewTarget.point;
    if (!previewPoint) {
      return {
        executed: false,
        actionId: action?.actionId ?? null,
        actionText: preview.text ?? null,
        observedResult: "network_or_navigation_unknown",
        pageUrlAfterClick: preview.url,
        error: "连续三次无法确认最终提交按钮的实时点击位置，未执行点击",
        trace
      };
    }
    trace.push(`cdp_preview_target:${Math.round(previewPoint.x!)},${Math.round(previewPoint.y!)}:${previewPoint.targetTag ?? "unknown"}/${previewPoint.hitTag ?? "unknown"}:${previewPoint.hitText ?? ""}`);
    const previewIsGate = isPreviewSubmissionText(preview.text ?? expectedText);
    // A preview is reversible, but a background miss is not permission to
    // steal the user's foreground or replay the action through another route.
    let submissionCheckpointed = false;
    const checkpointSubmission = async (authorizeClick = false) => {
      submissionSignal?.throwIfAborted();
      if (authorizeClick) {
        await authorizeSubmitClick?.();
        submissionSignal?.throwIfAborted();
      }
      if (submissionCheckpointed) return;
      await onSubmissionActivated?.();
      submissionCheckpointed = true;
    };
    let previewActivationAttempts = 1;
    // “预览并提交” is a label, not a guarantee that an unfamiliar site's
    // handler is reversible. Fence even that first click against worker loss.
    await checkpointSubmission(true);
    let previewClickProbe = previewIsGate
      ? await dispatchPreviewGatePointer(previewPoint, previewActivationAttempts)
      : null;
    if (previewIsGate && previewClickProbe?.staleBeforeDispatch) {
      const reboundTarget = await locateTrustedPoint("preview", expectedText);
      const reboundPreview = reboundTarget.located;
      const reboundPoint = reboundTarget.point;
      if (reboundPreview?.found && reboundPoint && reboundPreview.url === preview.url) {
        previewActivationAttempts += 1;
        trace.push("cdp_preview_rebound_before_first_dispatch");
        await checkpointSubmission(true);
        previewClickProbe = await dispatchPreviewGatePointer(reboundPoint, previewActivationAttempts);
      }
    }
    if (!previewIsGate) {
      pointerDispatchAttempted = true;
      await dispatchFinalSubmitTrustedPointer(previewPoint);
    }
    trace.push(`cdp_preview_activated:pointer:${preview.text}`);
    // Ordinary receipt waiting releases active execution after 12 seconds.
    // Distinct continuation notices may use one bounded extra window; the
    // read-only monitor still handles later explicit field rejection.
    const deadline = Date.now() + (isMokaApplicationUrl(preview.url) && /^(?:127\.0\.0\.1|localhost)$/i.test(new URL(preview.url).hostname)
      ? 8_000
      : finalSubmitActiveVerificationTimeoutMs);
    let confirmationClicked = false;
    const continuationWindowMs = Math.max(0, deadline - Date.now());
    const continuationDeadline = deadline + continuationWindowMs;
    let activeDeadline = deadline;
    let confirmationClickedAt = 0;
    let submissionConfirmationClicked = false;
    const confirmedContinuations = new Set<string>();
    let lastUrl = preview.url;
    let captchaObservation = createFinalSubmitCaptchaObservation();
    let automaticCaptchaAttempted = false;
    const tryAutomaticCaptcha = async (
      gate: ApplicationUserAction, pageUrl: string
    ): Promise<FinalSubmitExecutionResult | null> => {
      if (!captchaContext || automaticCaptchaAttempted || gate.type !== "captcha") return null;
      automaticCaptchaAttempted = true;
      const automatic = await attemptPostSubmitSliderWithDebugger(tabId, captchaContext, sendDebuggerCommand);
      trace.push(`captcha_single_attempt:${automatic.status}:${automatic.reason ?? "explicit_verification"}`);
      // Always arbitrate the application's receipt after the drag. A completed
      // pointer command or a vanished CAPTCHA is not application acceptance.
      const after = await inspect();
      if (after?.success) return {
        executed: true, actionId: action?.actionId ?? null, actionText: preview.text ?? null,
        observedResult: "submitted_success", pageUrlAfterClick: after.url, error: null,
        trace: [...trace, "success_observed_after_automatic_captcha"]
      };
      if (after?.sitePolicyBlock) return {
        executed: true, actionId: action?.actionId ?? null, actionText: preview.text ?? null,
        observedResult: "blocked_by_site_policy", pageUrlAfterClick: after.url,
        error: after.sitePolicyBlock.message, sitePolicyBlock: after.sitePolicyBlock, trace
      };
      const userActionRequired = after ? after.userActionRequired : gate;
      return {
        executed: true, actionId: action?.actionId ?? null, actionText: preview.text ?? null,
        observedResult: userActionRequired ? "waiting_for_user_action" : "waiting_for_site_receipt",
        validationMonitor: retainSubmitMonitor(), pageUrlAfterClick: after?.url ?? pageUrl,
        error: null, trace, ...(userActionRequired ? { userActionRequired } : {})
      };
    };
    while (Date.now() < activeDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const state = await inspect();
      if (!state) continue;
      lastUrl = state.url;
      if (state.success) {
        await checkpointSubmission();
        trace.push(captchaObservation.totalObservations > 0
          ? "success_observed_after_captcha"
          : "success_observed");
        return {
          executed: true,
          actionId: action?.actionId ?? null,
          actionText: preview.text ?? null,
          observedResult: "submitted_success",
          pageUrlAfterClick: state.url,
          error: null,
          trace
        };
      }
      if (state.sitePolicyBlock) {
        await checkpointSubmission();
        trace.push(`site_application_policy_blocked:${state.sitePolicyBlock.reasonCode}`);
        return {
          executed: true,
          actionId: action?.actionId ?? null,
          actionText: preview.text ?? null,
          observedResult: "blocked_by_site_policy",
          pageUrlAfterClick: state.url,
          error: state.sitePolicyBlock.message,
          sitePolicyBlock: state.sitePolicyBlock,
          trace
        };
      }
      const captchaWasPending = Boolean(captchaObservation.action);
      captchaObservation = observeFinalSubmitCaptcha(
        captchaObservation,
        state.userActionRequired,
        Date.now()
      );
      if (state.userActionRequired?.type === "captcha") {
        if (!captchaWasPending) trace.push("captcha_observed_pending_receipt");
        const confirmedCaptcha = confirmedFinalSubmitCaptcha(captchaObservation, Date.now());
        if (confirmedCaptcha) {
          await checkpointSubmission();
          const automaticResult = await tryAutomaticCaptcha(confirmedCaptcha, state.url);
          if (automaticResult) return automaticResult;
          trace.push(`captcha_waiting_monitor_started:${captchaObservation.consecutiveObservations}`);
          return {
            executed: true,
            actionId: action?.actionId ?? null,
            actionText: preview.text ?? null,
            observedResult: "waiting_for_user_action",
            validationMonitor: retainSubmitMonitor(),
            pageUrlAfterClick: state.url,
            error: null,
            trace,
            userActionRequired: confirmedCaptcha
          };
        }
        // Require a short stable CAPTCHA observation before handing the live
        // page to the persistent monitor. The command returns immediately after
        // confirmation so the device can claim the next queued application.
        continue;
      }
      if (captchaWasPending) {
        trace.push(`captcha_observation_cleared:${captchaObservation.totalObservations}`);
      }
      if (state.userActionRequired) {
        if (state.userActionRequired.type !== "login") await checkpointSubmission();
        trace.push(`waiting_for_user_action:${state.userActionRequired.type}`);
        return {
          executed: true,
          actionId: action?.actionId ?? null,
          actionText: preview.text ?? null,
          observedResult: "waiting_for_user_action",
        validationMonitor: retainSubmitMonitor(),
          pageUrlAfterClick: state.url,
          error: null,
          trace,
          userActionRequired: state.userActionRequired
        };
      }
      // A concrete field rejection has priority over an acknowledgement OK
      // button. Only a genuine submission confirmation may be auto-confirmed.
      if (state.rejectedFieldKeys.length === 0) {
        const confirmationTarget = await locateTrustedPoint("confirmation", "");
        const confirmation = confirmationTarget.located;
        // After a dispatched confirmation, an ambiguous new target must not
        // replace the original receipt wait or authorize another click.
        if (confirmation?.ambiguous && !confirmationClicked) {
          return {
            executed: true,
            actionId: action?.actionId ?? null,
            actionText: preview.text ?? null,
            observedResult: "blocked_by_site_validation",
            pageUrlAfterClick: confirmation.url,
            error: `二次确认提交按钮不唯一：${confirmation.texts.join("；")}`,
            trace
          };
        }
        const continuation = confirmation?.confirmationKind === "continuation";
        const confirmationIdentity = confirmation?.confirmationIdentity ?? "";
        // A warning is part of the already authorized submission, but it
        // must not spend the preview's final-confirmation allowance. A stuck
        // or React-recreated notice is never clicked again. Only progress to a
        // distinct notice can use the one bounded continuation time allowance.
        const confirmationAllowed = continuation
          ? Boolean(confirmationIdentity) && !confirmedContinuations.has(confirmationIdentity)
          : !submissionConfirmationClicked;
        if (confirmationAllowed && confirmation?.found && typeof confirmation.x === "number" && typeof confirmation.y === "number") {
          await armValidationProbe(confirmation.text ?? "");
          // The baseline read may have rebuilt or moved the confirmation.
          const confirmationPoint = await cdpLivePoint("confirmation", confirmation.text ?? "", confirmationIdentity);
          if (!confirmationPoint) {
            return {
              executed: true,
              actionId: action?.actionId ?? null,
              actionText: preview.text ?? null,
              observedResult: "network_or_navigation_unknown",
              pageUrlAfterClick: confirmation.url,
              error: "校验基线读取后无法确认二次提交按钮的实时点击位置，未执行二次点击",
              trace
            };
          }
          trace.push(`cdp_confirmation_target:${Math.round(confirmationPoint.x!)},${Math.round(confirmationPoint.y!)}:${confirmationPoint.targetTag ?? "unknown"}/${confirmationPoint.hitTag ?? "unknown"}:${confirmationPoint.hitText ?? ""}`);
          await checkpointSubmission(true);
          await dispatchFinalSubmitTrustedPointer(confirmationPoint);
          confirmationClicked = true;
          confirmationClickedAt = Date.now();
          if (continuation) {
            confirmedContinuations.add(confirmationIdentity);
            activeDeadline = Math.min(continuationDeadline, Date.now() + continuationWindowMs);
          } else submissionConfirmationClicked = true;
          trace.push(`cdp_confirmation_activated:pointer:${confirmation.text}`);
          continue;
        }
      }
      if (state.validation) {
        if (confirmationClickedAt > 0 && Date.now() - confirmationClickedAt < 3_000) {
          trace.push("confirmation_validation_grace");
          continue;
        }
        return {
          executed: true,
          actionId: action?.actionId ?? null,
          actionText: preview.text ?? null,
          observedResult: "blocked_by_site_validation",
          pageUrlAfterClick: state.url,
          error: state.validation,
          // Generic error/network text alone does not prove no application
          // was accepted. Never clear the checkpoint on such an ambiguity.
          siteValidationConfirmed: state.rejectedFieldKeys.length > 0 || state.nativeValidationErrors.length > 0,
          rejectedFieldKeys: state.rejectedFieldKeys,
          rejectedFields: latestPostSubmitObservation?.fields.filter(field => state.rejectedFieldKeys.includes(siteValidationFieldKey(field))),
          nativeValidationErrors: state.nativeValidationErrors,
          trace
        };
      }
    }
    // The last stable form read can finish after the active deadline. A
    // challenge may have appeared during that read, after inspect() checked
    // human actions. Re-read the live gate before handing off to receipt-only
    // monitoring; do not rely on the observation from before form stability.
    const deadlineUserAction = await detectAutoApplyUserAction(tabId);
    captchaObservation = observeFinalSubmitCaptcha(captchaObservation, deadlineUserAction, Date.now());
    const pendingCaptcha = pendingFinalSubmitCaptchaAtDeadline(captchaObservation, Date.now());
    if (pendingCaptcha) {
      await checkpointSubmission();
      const automaticResult = await tryAutomaticCaptcha(pendingCaptcha, lastUrl);
      if (automaticResult) return automaticResult;
      trace.push(`captcha_waiting_at_verification_deadline:${captchaObservation.consecutiveObservations}`);
      return {
        executed: true,
        actionId: action?.actionId ?? null,
        actionText: preview.text ?? null,
        observedResult: "waiting_for_user_action",
        validationMonitor: retainSubmitMonitor(),
        pageUrlAfterClick: lastUrl,
        error: null,
        trace,
        userActionRequired: pendingCaptcha
      };
    }
    if (captchaObservation.totalObservations > 0) {
      trace.push(`captcha_not_stable_at_deadline:${captchaObservation.totalObservations}`);
    }
    if (previewIsGate && !confirmationClicked) {

      trace.push(`preview_activation_not_observed:${lastUrl === preview.url ? "same_url" : "url_changed"}:attempts_${previewActivationAttempts}`);
      return {
        executed: pointerDispatchAttempted,
        actionId: action?.actionId ?? null,
        actionText: preview.text ?? null,
        observedResult: "network_or_navigation_unknown",
        pageUrlAfterClick: lastUrl,
        error: lastUrl === preview.url
          ? "已发送预览按钮可信指针，但未观察到预览、最终确认或成功回执；结果未确认，不会再次提交"
          : "预览页已发生变化，但未找到唯一的最终确认按钮；结果未确认，不会再次提交",
        trace
      };
    }
    trace.push(`site_receipt_monitor_started:${lastUrl === preview.url ? "same_url" : "url_changed"}`);
    return {
      executed: true,
      actionId: action?.actionId ?? null,
      actionText: preview.text ?? null,
      observedResult: "waiting_for_site_receipt",
      validationMonitor: retainSubmitMonitor(),
      pageUrlAfterClick: lastUrl,
      error: null,
      trace
    };
  } catch (error) {
    return {
      executed: pointerDispatchAttempted,
      actionId: action?.actionId ?? null,
      actionText: expectedText,
      observedResult: "network_or_navigation_unknown",
      pageUrlAfterClick: "",
      error: `CDP 最终提交失败：${error instanceof Error ? error.message : String(error)}`,
      trace
    };
  } finally {
    if (!retainValidationMonitor) await executeSubmissionScript({
      target, func: readSiteApplicationPolicyBlockInPage,
      args: [{ phase: "cleanup", token: validationProbeToken }]
    }).catch(() => undefined);
    if (!retainValidationMonitor) await executeSubmissionScript({
      target, func: reassertedSubmitValidationProbeInPage, args: [validationProbeToken, "cleanup"]
    }).catch(() => undefined);
    if (!retainValidationMonitor) await executeSubmissionScript({
      target, func: nativeSubmitValidationProbeInPage, args: [validationProbeToken, "cleanup"]
    }).catch(() => undefined);
    if (attached && focusEmulationEnabled) {
      await releaseTrustedPointerSurface(sendDebuggerCommand).catch(() => undefined);
    }
    if (attached) await chrome.debugger.detach(target).catch(() => undefined);
  }
}

async function executeLegacyBatchAutoApplyJob(
  command: AiPluginCommand,
  credential: AutoApplyRuntimeCredential
): Promise<AiPluginEvent> {
  const payload = command.payload ?? {};
  const batchId = String(payload.batchId ?? "");
  const batchJobId = String(payload.batchJobId ?? "");
  const job = asRecord(payload.job) ?? {};
  const jobId = String(job.jobId ?? "");
  const applicationUrl = String(job.applicationUrl ?? "");
  const companyName = String(job.companyName ?? "");
  const title = String(job.title ?? "");
  const applicationAccessHint = applicationAccessHintFromTags(job.tags);
  const localValidation = payload.localValidation === true;
  const localAssisted = payload.localAssisted === true;
  const reuseExistingTab = localValidation && payload.reuseExistingTab === true;
  const stopBeforeFinalSubmit = localValidation && payload.stopBeforeFinalSubmit === true;
  const visionDiagnostics: VisionIterationDiagnostic[] = [];
  const recordVisionDiagnostic = async (entry: VisionIterationDiagnostic) => {
    visionDiagnostics.push(entry);
    if (visionDiagnostics.length > 50) visionDiagnostics.splice(0, visionDiagnostics.length - 50);
    await persistAutoApplyVisionDiagnostic(entry);
  };
  let tabId: number | null = null;
  let ownsTab = false;
  let tabResultDisposition: AutoApplyTabResultDisposition = "default";
  let pageSession: AutoApplyPageSession | null = null;
  let candidateFacts: Record<string, string> = {};
  let leaseCheckRunning = false;
  let progressReporter: AutoApplyProgressReporter | null = null;
  let recoveryReload: ReturnType<typeof setTimeout> | undefined;
  let controlledExecution: AbortController | undefined;
  const executionSignal = autoApplyExecutionAbort?.signal;
  const closeExpiredExecutionSurface = () => {
    if (executionSignal?.reason instanceof AutoApplyJobStoppedError) {
      controlledExecution?.abort(executionSignal.reason);
      tabResultDisposition = "default";
      if (tabId !== null && ownsTab) {
        rememberAutoApplyTabCloseIntent(tabId, "job_stop");
        void closeAutoApplyExecutionSurface(chrome, { tabId }).catch(() => undefined);
      }
      return;
    }
    if (!(executionSignal?.reason instanceof AutoApplyCommandExpiredError)) return;
    tabResultDisposition = "default";
    if (tabId !== null) {
      rememberAutoApplyTabCloseIntent(tabId, "command_expired");
      void closeAutoApplyExecutionSurface(chrome, { tabId }).catch(() => undefined);
    }
    // Closing the bound execution surface interrupts most Chrome waits. A
    // service-worker reload is the final fence for a promise that ignores
    // AbortSignal, so one zombie attempt cannot block this device forever.
    recoveryReload ??= setTimeout(() => chrome.runtime.reload(), 1_000);
  };
  executionSignal?.addEventListener("abort", closeExpiredExecutionSurface, { once: true });
  const executionAbort = autoApplyExecutionAbort;
  const leaseWatchdog = localValidation ? null : startAutoApplyLeaseWatchdog(() => {
    executionAbort?.abort(new AutoApplyCommandExpiredError());
  });
  const lease = setInterval(() => {
    if (leaseCheckRunning) return;
    leaseCheckRunning = true;
    void renewAutoApplyCommandLease(credential, command.commandId)
      .then(() => leaseWatchdog?.acknowledge())
      .catch((error: unknown) => {
        // A response from a completed attempt cannot cancel the next task or a
        // newly paired account through the mutable global execution pointer.
        if (autoApplyExecutionAbort !== executionAbort || executionAbort?.signal.aborted) return;
        if (!(error instanceof AutoApplyCommandLeaseRejectedError)) return;
        if (error.status === 401 || error.status === 403) {
          void terminateLocalAutoApplySession();
          return;
        }
        executionAbort?.abort(error.status === 410
          ? new AutoApplyCommandExpiredError()
          : new AutoApplyCancelledError());
      })
      .finally(() => {
        leaseCheckRunning = false;
      });
  }, 20_000);
  try {
    assertAutoApplyCommandActive(command);
    if (!batchId || !batchJobId || !jobId || !applicationUrl) throw new Error("批量投递命令缺少岗位信息");
    if (!localValidation) {
      progressReporter = createAutoApplyProgressReporter(
        { batchId, batchJobId, jobId },
        (progress, signal) => reportAutoApplyCommandProgress(credential, command.commandId, progress, signal)
      );
    }
    if (!stopBeforeFinalSubmit && !localAssisted && command.safety?.allowFinalSubmit !== true) {
      throw new Error("批量投递命令未授权最终提交");
    }
    const requestedAdapterCode = String(job.adapterCode ?? "");
    const adapterResolution = resolveAutoApplyAdapter(applicationUrl, requestedAdapterCode);
    const adapterCode = adapterResolution.adapterCode;
    if (!adapterResolution.supported) {
      return batchResultEvent(command, {
        batchId, batchJobId, jobId,
        status: "skipped_unsupported_site",
        reasonCode: adapterResolution.reason ?? "adapter_url_mismatch",
        evidence: {
          screenshotRef: null,
          redacted: true,
          pageUrl: applicationUrl,
          siteConfirmation: null,
          diagnostic: autoApplyDiagnostic(adapterResolution.reason ?? "adapter_url_mismatch")
        }
      });
    }
    if (adapterResolution.fallbackApplied) {
      console.info("[AI Offer 招聘小助手] adapter fallback", {
        requestedAdapterCode: adapterResolution.requestedAdapterCode || null,
        resolvedAdapterCode: adapterCode,
        applicationOrigin: new URL(applicationUrl).origin
      });
    }
    pageSession = await recalledAutoApplyPageSession(
      batchId,
      batchJobId,
      jobId,
      applicationUrl
    );
    const missingInformationHandoff = pageSession?.waitingFor === "missing_information";
    if (missingInformationHandoff && pageSession?.tabId != null) {
      // The user has explicitly queued a new attempt. Retire any acknowledged
      // old monitor whose HTTP response was lost, before filling the same page.
      await forgetAutoApplyTab(batchId, batchJobId, pageSession.tabId);
    }
    if (pageSession?.terminalOutcome) {
      return batchResultEvent(command, {
        batchId,
        batchJobId,
        jobId,
        status: "succeeded",
        reasonCode: pageSession.terminalOutcome === "already_applied" ? "already_applied" : null,
        evidence: {
          screenshotRef: null,
          redacted: true,
          pageUrl: applicationUrl,
          siteConfirmation: pageSession.terminalOutcome === "already_applied"
            ? "招聘网站此前已确认重复申请/已经投递"
            : "招聘网站此前已确认投递成功"
        }
      });
    }
    let initialControl = localValidation
      ? "continue"
      : localAutoApplyControl.get(batchId) ?? await autoApplyControl(credential, batchId);
    if (initialControl === "cancel") throw new AutoApplyCancelledError();
    while (initialControl === "pause") {
      assertAutoApplyCommandActive(command);
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      initialControl = localAutoApplyControl.get(batchId) ?? await autoApplyControl(credential, batchId);
      if (initialControl === "cancel") throw new AutoApplyCancelledError();
    }
    await update({
      autoApplyRuntime: {
        connection: "ready",
        status: "running",
        batchId,
        jobId,
        companyName,
        title,
        updatedAt: new Date().toISOString(),
        lastError: null
      }
    });
    const candidateEnvelope = asRecord(payload.candidate) ?? {};
    const applicationProfile = localValidation
      ? asRecord(candidateEnvelope.applicationProfile) ?? {}
      : await readExecutionProfile(credential, candidateEnvelope, { batchId, jobId }, autoApplyExecutionAbort?.signal);
    const packagePayload = projectCandidateInformation(await candidatePackageFromFileRef(
      candidateEnvelope,
      autoApplyExecutionAbort?.signal
    ), applicationProfile);
    const packageState = createCandidatePackageFromPayload(packagePayload, "remote.zcresume.json");
    const assets = Array.isArray(payload.assets) ? payload.assets.map((asset) => asRecord(asset)).filter(Boolean) as Record<string, unknown>[] : [];
    const resumeAsset = assets.find((asset) => asset.purpose === "resume");
    const portraitAsset = assets.find((asset) => asset.purpose === "portrait");
    const portfolioAssets = assets.filter((asset) => asset.purpose === "portfolio");
    const portfolioFile = portfolioAssets.length === 1
      ? { ...await resumePayloadFromAiFileRef(portfolioAssets[0] as unknown as AiSideFileRef, autoApplyExecutionAbort?.signal), purpose:"portfolio" as const }
      : null;
    const resumeFile = resumeAsset
      ? await resumePayloadFromAiFileRef(
          resumeAsset as unknown as AiSideFileRef,
          autoApplyExecutionAbort?.signal
        )
      : null;
    const identityPhoto = portraitAsset
      ? await resumePayloadFromAiFileRef(
          portraitAsset as unknown as AiSideFileRef,
          autoApplyExecutionAbort?.signal
        )
      : null;
    candidateFacts = enrichVisionCandidateFacts(
      packagePayload,
      manualAssistResumeFacts(packageState.manualAssist),
      job,
      applicationProfile
    );
    const visionSessionId = await createAutoApplyVisionSession(credential);

    progressReporter?.setStage("opening", "正在打开招聘页面");
    const openTabs = reuseExistingTab ? await chrome.tabs.query({}) : [];
    const pageSessionTab = reuseExistingTab || !localValidation
      ? await tabFromAutoApplyPageSession(pageSession)
      : undefined;
    const recalledTab = pageSessionTab ?? (reuseExistingTab || !localValidation
      ? await recalledAutoApplyTab(batchId, batchJobId, jobId, applicationUrl)
      : undefined);
    // A plugin-owned missing-information page is closed only after AI Offer
    // accepts the handoff. Its next command starts on a fresh page and must run
    // the normal upload/full-fill path. Restrict field-only continuation to a
    // still-live user-owned page that the plugin never closes.
    const resumingMissingInformation = missingInformationHandoff && Boolean(recalledTab);
    const resumeRepairFieldKeys = resumingMissingInformation && pageSession?.pendingRepairFieldKeys?.length
      ? new Set(pageSession.pendingRepairFieldKeys) : undefined;
    // Prefer the persisted batchJobId -> tabId binding. A generic Moka receipt
    // route no longer includes the job id, so never claim an unbound receipt
    // from another batch merely because it is the only open Moka success tab.
    const sessionDisposition = autoApplyPageSessionDisposition(pageSession);
    if (sessionDisposition === "reconcile_only" && !recalledTab) {
      pageSession = updateAutoApplyPageSession(pageSession!, {
        tabId: null,
        stage: "outcome_unknown"
      });
      await persistAutoApplyPageSession(pageSession);
      return batchResultEvent(command, {
        batchId,
        batchJobId,
        jobId,
        status: "failed",
        reasonCode: "submission_outcome_unknown",
        evidence: {
          screenshotRef: null,
          redacted: true,
          pageUrl: applicationUrl,
          siteConfirmation: null,
          failureDetails: {
            submissionAttemptId: pageSession.submissionAttemptId,
            submitInitiatedAt: pageSession.submitInitiatedAt,
            message: "最终提交已触发，但原标签页已关闭；为避免重复投递，插件不会重新打开并再次提交。"
          },
          diagnostic: autoApplyDiagnostic("submission_outcome_unknown")
        }
      });
    }
    if (autoApplyPageSessionRequiresOriginalTab(pageSession) && !recalledTab) {
      pageSession = updateAutoApplyPageSession(pageSession!, {
        tabId: null,
        stage: "failed"
      });
      await persistAutoApplyPageSession(pageSession);
      return batchResultEvent(command, {
        batchId,
        batchJobId,
        jobId,
        status: "failed",
        reasonCode: "application_page_unavailable",
        evidence: {
          screenshotRef: null,
          redacted: true,
          pageUrl: applicationUrl,
          siteConfirmation: null,
          failureDetails: {
            waitingFor: pageSession.waitingFor,
            message: "原投递标签页已不存在；插件不会刷新、重开或重新填写申请表。"
          },
          diagnostic: autoApplyDiagnostic("application_page_unavailable")
        }
      });
    }
    // Every ATS uses task ownership, never URL-only adoption. A new task gets
    // a fresh background tab; only this exact task may resume its original tab.
    const safeLocalValidationTab = reuseExistingTab && stopBeforeFinalSubmit &&
      command.safety?.allowFinalSubmit !== true
      ? selectExactLocalValidationTab(openTabs, applicationUrl)
      : undefined;
    const existingTab = recalledTab ?? safeLocalValidationTab;
    if (reuseExistingTab && !existingTab) {
      throw new Error("本机验收要求复用已打开的投递页，但没有找到完全相同的 URL");
    }
    const executionSurface = await openAutoApplyExecutionSurface(chrome, {
      applicationUrl,
      existingTab
    });
    const tab = executionSurface.tab;
    // A resumed plugin tab is reported as a bound task tab by the opener. Keep
    // its durable ownership instead of silently turning it into a user tab.
    ownsTab = executionSurface.createdForExecution || autoApplyPageSessionOwnsTab(pageSession);
    if (tab.id === undefined) throw new Error("Chrome 没有返回自动投递标签 ID");
    tabId = tab.id;
    pageSession = pageSession ?? createAutoApplyPageSession({
      batchId,
      batchJobId,
      jobId,
      applicationUrl,
      adapterCode,
      tabId,
      tabOwnership: ownsTab ? "plugin" : "user"
    });
    pageSession = updateAutoApplyPageSession(pageSession, {
      tabId,
      tabOwnership: ownsTab ? "plugin" : "user",
      executionSurface: {
        mode: "background_tab",
        source: safeLocalValidationTab && !recalledTab ? "local_validation_tab" : executionSurface.source,
        tabId,
        windowId: executionSurface.windowId,
        windowType: executionSurface.windowType
      },
      ...(sessionDisposition === "continue" ? { stage: "observing" as const } : {})
    });
    await persistAutoApplyPageSession(pageSession);
    await rememberAutoApplyTab({
      batchId,
      batchJobId,
      jobId,
      tabId,
      applicationUrl,
      tabOwnership: pageSession.tabOwnership,
      commandId: command.commandId,
      updatedAt: new Date().toISOString()
    });
    await waitForTabReady(tabId);
    progressReporter?.setStage("observing", "正在检查页面和必填项");
    await advanceAutoApplyApplicationEntry(tabId, {
      recordPageStage: async (snapshot) => {
        if (!pageSession) return;
        pageSession = updateAutoApplyPageSession(pageSession, {
          pageStage: snapshot.pageStage,
          pageStageSource: snapshot.source,
          pageStageObservedAt: snapshot.observedAt,
          pageStageObservationCount: snapshot.observationCount,
          pageStageWaitedMs: snapshot.waitedMs
        });
        await persistAutoApplyPageSession(pageSession);
        const status = snapshot.pageStage === "job_detail"
          ? "职位页仍在加载申请表，正在等待"
          : snapshot.pageStage === "login"
            ? "页面已识别为登录页"
            : snapshot.pageStage === "application_form"
              ? "页面已识别为填表页"
              : "页面阶段尚未确认，正在等待";
        progressReporter?.setStage("observing", status);
      }
    });
    // A human-completed CAPTCHA can navigate the original tab directly to the
    // Moka receipt route. Reconcile that receipt before observing the form,
    // creating another vision iteration, or validating the declaration.
    const existingSuccess = await detectAutoApplySiteSuccess(tabId);
    if (existingSuccess.success) {
      pageSession = completeAutoApplyPageSession(
        pageSession,
        existingSuccess.outcome === "already_applied" ? "already_applied" : "succeeded"
      );
      await persistAutoApplyPageSession(pageSession);
      const evidence = await redactedEvidence(tabId);
      return batchResultEvent(command, {
        batchId,
        batchJobId,
        jobId,
        status: "succeeded",
        reasonCode: existingSuccess.outcome === "already_applied" ? "already_applied" : null,
        evidence: {
          screenshotRef: evidence.screenshotRef,
          redacted: true,
          pageUrl: existingSuccess.url,
          siteConfirmation: existingSuccess.outcome === "already_applied"
            ? "招聘网站提示重复申请/已经投递"
            : "投递成功"
        }
      });
    }
    if (sessionDisposition === "reconcile_only") {
      pageSession = updateAutoApplyPageSession(pageSession, { stage: "reconciling" });
      await persistAutoApplyPageSession(pageSession);
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const userAction = await detectAutoApplyUserAction(tabId);
        if (userAction) {
          const outcome = autoApplyUserActionOutcome(userAction.type);
          const terminalHumanActionFailure = outcome.status === "failed";
          tabResultDisposition = outcome.resultDisposition;
          pageSession = terminalHumanActionFailure
            ? failAutoApplyPageSession(pageSession)
            : waitAutoApplyForUser(pageSession, userAction.type);
          await persistAutoApplyPageSession(pageSession);
          return batchResultEvent(command, {
            batchId,
            batchJobId,
            jobId,
            status: outcome.status,
            reasonCode: outcome.reasonCode,
            evidence: {
              screenshotRef: null,
              redacted: true,
              pageUrl: (await chrome.tabs.get(tabId)).url ?? applicationUrl,
              siteConfirmation: null,
              ...(terminalHumanActionFailure ? {} : {
                userActionRequired: { ...userAction, resumeSupported: true }
              }),
              failureDetails: {
                submissionAttemptId: pageSession.submissionAttemptId,
                submitInitiatedAt: pageSession.submitInitiatedAt,
                recoveryMode: "reconcile_only"
              },
              diagnostic: autoApplyDiagnostic(userAction.type === "login"
                ? "login_required"
                : userAction.type === "captcha"
                  ? "captcha_required"
                  : "identity_verification_required")
            }
          });
        }
        const terminal = await detectAutoApplySiteSuccess(tabId);
        if (terminal.success) {
          pageSession = completeAutoApplyPageSession(
            pageSession,
            terminal.outcome === "already_applied" ? "already_applied" : "succeeded"
          );
          await persistAutoApplyPageSession(pageSession);
          const evidence = await redactedEvidence(tabId);
          return batchResultEvent(command, {
            batchId,
            batchJobId,
            jobId,
            status: "succeeded",
            reasonCode: terminal.outcome === "already_applied" ? "already_applied" : null,
            evidence: {
              screenshotRef: evidence.screenshotRef,
              redacted: true,
              pageUrl: terminal.url,
              siteConfirmation: terminal.outcome === "already_applied"
                ? "招聘网站提示重复申请/已经投递"
                : "投递成功",
              ...(evidence.screenshotDataUrl ? { screenshotDataUrl: evidence.screenshotDataUrl } : {})
            }
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      tabResultDisposition = "default";
      pageSession = updateAutoApplyPageSession(pageSession, { stage: "outcome_unknown" });
      await persistAutoApplyPageSession(pageSession);
      const tabAfterReconcile = await chrome.tabs.get(tabId).catch(() => undefined);
      return batchResultEvent(command, {
        batchId,
        batchJobId,
        jobId,
        status: "failed",
        reasonCode: "submission_outcome_unknown",
        evidence: {
          screenshotRef: null,
          redacted: true,
          pageUrl: tabAfterReconcile?.url ?? applicationUrl,
          siteConfirmation: null,
          failureDetails: {
            submissionAttemptId: pageSession.submissionAttemptId,
            submitInitiatedAt: pageSession.submitInitiatedAt,
            message: "提交后的页面尚未出现成功、重复申请或人工验证状态；插件已停止，且不会重复点击提交。"
          },
          diagnostic: autoApplyDiagnostic("submission_outcome_unknown")
        }
      });
    }
    await enforceAutoApplyControl(credential, command, batchId, tabId, { companyName, title }, localValidation);
    let observation = await stableApplicationObservation(tabId);
    if (requestedApplicationEngineFromPayload(payload) === "shadow_v2") {
      const shadow = buildLayeredShadowReport({
        observation,
        candidateFacts,
        accessHint: applicationAccessHint,
        revision: 1
      });
      await recordVisionDiagnostic({
        schemaVersion: "auto-apply-vision-diagnostic.v1",
        at: new Date().toISOString(),
        batchId,
        batchJobId,
        commandId: command.commandId,
        iteration: 0,
        phase: "observe",
        requiredBlockers: [...shadow.unresolvedRequiredRegistryKeys],
        criticalFailures: [],
        next: shadow.loginDecision === "wait_for_login" ? "stop" : "execute_actions",
        source: "deterministic",
        actionType: "shadow_analysis",
        fieldId: null,
        stableFieldKey: null,
        label: null,
        expected: summarizeVisionDiagnosticValue(`deterministic_actions:${shadow.deterministicActionCount}`),
        actual: summarizeVisionDiagnosticValue(`observed_fields:${shadow.observedFieldCount}`),
        success: true,
        error: null
      });
    }
    if (observation.loginRequired) {
      tabResultDisposition = "login_handoff";
      pageSession = failAutoApplyPageSession(pageSession);
      await persistAutoApplyPageSession(pageSession);
      return batchResultEvent(command, {
        batchId, batchJobId, jobId,
        status: "failed",
        reasonCode: "login_required",
        evidence: {
          screenshotRef: null,
          redacted: true,
          pageUrl: observation.url,
          siteConfirmation: null,
          failureDetails: {
            applicationAccessHint,
            livePageLoginRequired: true,
            message: observation.loginReason ?? "招聘网站要求登录，请登录后重新投递。"
          },
          diagnostic: autoApplyDiagnostic("login_required")
        }
      });
    }
    const initialUserAction = await detectAutoApplyUserAction(tabId);
    if (initialUserAction) {
      const outcome = autoApplyUserActionOutcome(initialUserAction.type);
      const terminalHumanActionFailure = outcome.status === "failed";
      tabResultDisposition = outcome.resultDisposition;
      pageSession = terminalHumanActionFailure
        ? failAutoApplyPageSession(pageSession)
        : waitAutoApplyForUser(pageSession, initialUserAction.type);
      await persistAutoApplyPageSession(pageSession);
      return batchResultEvent(command, {
        batchId, batchJobId, jobId,
        status: outcome.status,
        reasonCode: outcome.reasonCode,
        evidence: {
          screenshotRef: null,
          redacted: true,
          pageUrl: observation.url,
          siteConfirmation: null,
          ...(terminalHumanActionFailure ? {} : {
            userActionRequired: {
              ...initialUserAction,
              resumeSupported: true
            }
          }),
          failureDetails: terminalHumanActionFailure
            ? {
                applicationAccessHint,
                humanActionType: initialUserAction.type,
                ...(initialUserAction.type === "login" ? { livePageLoginRequired: true } : {}),
                message: initialUserAction.message || (initialUserAction.type === "captcha"
                  ? "招聘网站要求安全验证码，本次投递已失败。"
                  : "招聘网站要求登录，请登录后重新投递。")
              }
            : undefined,
          diagnostic: autoApplyDiagnostic(initialUserAction.type === "login"
            ? "login_required"
            : initialUserAction.type === "captcha"
              ? "captcha_required"
              : "identity_verification_required")
        }
      });
    }
    assertApplicationFormStage(observation, "进入自动填写前复核");
    const xiaopengPrivacyConsentAuthorized = adapterCode === "feishu.xiaopeng.v1" &&
      isXiaopengApplicationUrl(observation.url) && command.safety?.allowConsentClick === true;
    const isAuthorizedXiaopengConsentAction = (action: PageObservation["actions"][number]) => {
      if (!xiaopengPrivacyConsentAuthorized) return false;
      if (isXiaopengPrivacyConsentText(action.text) || isXiaopengPrivacyConsentText(action.context)) {
        return true;
      }
      // Feishu renders the one fixed Xiaopeng privacy declaration as two
      // independently clickable descendants. Keep these fragments scoped to
      // the Xiaopeng adapter + URL + explicit command authorization above;
      // no generic agreement/authorization text is accepted here.
      const compactText = action.text.replace(/\s+/g, "").replace(/[。.!！]/g, "");
      const compactContext = action.context.replace(/\s+/g, "").replace(/[。.!！]/g, "");
      const fixedFragments = new Set(["我已阅读并同意", "隐私政策"]);
      const exactComposite = compactText === "我已阅读并同意隐私政策提交简历";
      return exactComposite || (fixedFragments.has(compactText) &&
        (compactContext.includes("我已阅读并同意隐私政策") || compactText === "隐私政策"));
    };
    const blockedConsentActions = observation.actions.filter((action) => action.kind === "consent" &&
      !isMokaAuthenticityDeclarationText(action.text) &&
      !isAuthorizedXiaopengConsentAction(action));
    if (blockedConsentActions.length > 0 && command.safety?.allowConsentClick !== true) {
      return batchResultEvent(command, {
        batchId, batchJobId, jobId,
        status: "skipped_ambiguous_consent",
        reasonCode: "consent_requires_user",
        evidence: {
          screenshotRef: null,
          redacted: true,
          pageUrl: observation.url,
          siteConfirmation: null,
          failureDetails: {
            blockedConsentActions: blockedConsentActions.slice(0, 8).map((action) => ({
              text: action.text.slice(0, 120),
              context: action.context.slice(0, 180),
              kind: action.kind
            }))
          },
          diagnostic: autoApplyDiagnostic("consent_requires_user")
        }
      });
    }

    if (!localValidation) {
      const record: ControlledExecution = {
        schemaVersion: "controlled-execution.v1", owner: interruptionOwner(credential),
        sessionId: await currentInterruptionSession(), commandId: command.commandId,
        batchId, batchJobId, jobId, tabId, applicationUrl, armedAt: new Date().toISOString()
      };
      controlledExecution = armApplicationInterruption(tabId);
      controlledExecutions.set(tabId, { record, controller: controlledExecution,
        executionAbort: autoApplyExecutionAbort,
        isControlled: () => Boolean(pageSession && !pageSession.terminalOutcome &&
          ["observing", "filling", "validating", "submit_ready"].includes(pageSession.stage)) });
      await writeControlledExecution(record);
      assertAutoApplyCommandActive(command);
    }
    pageSession = updateAutoApplyPageSession(pageSession, {
      stage: "filling",
      waitingFor: null,
      // A user-supplied answer starts a new validation round. Preserve the
      // live page and pending identities, while granting this explicit round
      // its own single automatic repair allowance.
      ...(resumingMissingInformation ? { automaticSiteValidationRepairCount: 0 } : {})
    });
    await persistAutoApplyPageSession(pageSession);
    if (!resumingMissingInformation && (resumeFile || identityPhoto)) {
      progressReporter?.setStage("uploading", "正在上传投递附件");
    }
    if (resumeFile && !resumingMissingInformation) {
      const resumeField = observation.fields.find((field) => {
        if (field.type !== "file") return false;
        const identity = `${field.label} ${field.stableFieldKey ?? ""} ${field.domHints?.name ?? ""} ${field.domHints?.dataFieldName ?? ""}`;
        return /简历|resume_file|resum(?:e|é).?key|\bcv\b/i.test(identity) &&
          !/照片|头像|证件照|identity_photo|photo|portrait/i.test(identity);
      });
      if (resumeField && !resumeField.currentValue.includes(resumeFile.name)) {
        const uploadResults = await executeApplicationFillInstructions(tabId, observation, [{
            fieldId: resumeField.fieldId,
            ...(resumeField.stableFieldKey ? { stableFieldKey: resumeField.stableFieldKey } : {}),
            selector: resumeField.selector,
            expectedLabel: resumeField.label,
            semanticKey: "resume.file",
            popupBinding: resumeField.popupBinding,
            type: "file",
            value: resumeFile.name,
            file: resumeFile
          } satisfies FillInstruction]);
        if (!uploadResults[0]?.success) throw controlExecutionError(resumeField, uploadResults[0]);
        observation = await stableApplicationObservation(tabId);
      }
      // AI Offer owns parsing. Upload the attachment without invoking ATS parsing.
    }
    progressReporter?.setStage("filling", "正在填写申请表");
    // Identity fields are filled by the same deterministic, trusted executor
    // as the rest of the required form. Avoid a second synthetic Moka path
    // that can leave DOM and React state out of sync.
    if (identityPhoto && !resumingMissingInformation) {
      const portraitField = observation.fields.find((field) =>
        field.type === "file" && field.required && /照片|头像|证件照|photo|portrait/i.test(field.label)
      );
      if (portraitField && !portraitField.currentValue.includes(identityPhoto.name)) {
        const uploadResults = await executeApplicationFillInstructions(tabId, observation, [{
            fieldId: portraitField.fieldId,
            ...(portraitField.stableFieldKey ? { stableFieldKey: portraitField.stableFieldKey } : {}),
            selector: portraitField.selector,
            expectedLabel: portraitField.label,
            semanticKey: "upload.identity_photo",
            popupBinding: portraitField.popupBinding,
            type: "file",
            value: identityPhoto.name,
            file: identityPhoto
          } satisfies FillInstruction]);
        if (!uploadResults[0]?.success) throw controlExecutionError(portraitField, uploadResults[0]);
        observation = await stableApplicationObservation(tabId);
      }
    }
    // Do not expand education/work/project arrays from resume cardinality.
    if (portfolioFile && !resumingMissingInformation) {
      const portfolioFields = observation.fields.filter(field=>field.type==="file" && field.sectionKey==="portfolio" &&
        resolveControlAdapter(evidenceForField(observation,field)).code==="feishu.formily-portfolio-upload.v1");
      // A single purpose-bound asset can target one visible portfolio row.
      // Multiple rows/assets require an explicit per-row binding, never first-match reuse.
      if (portfolioFields.length===1) {
        const field=portfolioFields[0]!;
        const results=await executeApplicationFillInstructions(tabId,observation,[{fieldId:field.fieldId,stableFieldKey:field.stableFieldKey,
          selector:field.selector,expectedLabel:field.label,semanticKey:"portfolio.file",type:"file",value:portfolioFile.name,file:portfolioFile}]);
        if(!results[0]?.success)throw controlExecutionError(field,results[0]);
        observation=await stableApplicationObservation(tabId);
      }
    }
    // Existing required rows are filled below; a blank optional section must
    // remain absent instead of becoming a newly-created required-looking row.
    // The single per-field loop below owns deterministic facts and uncertain
    // readback policy. A separate prefill pass would execute failed controls
    // twice or terminate before the first site validation.
    if (xiaopengPrivacyConsentAuthorized) {
      observation = (await ensureAuthorizedPageConsents(tabId, observation)).observation;
    }
    await enforceAutoApplyControl(credential, command, batchId, tabId, { companyName, title }, localValidation);
    assertApplicationFormStage(observation, "进入视觉填写前复核");
    const manualAssist = mergeManualAssistWithObservation(
      cloneManualAssistForCurrentPage(packageState, applicationUrl),
      observation
    );
    const application: ActiveApplication = {
      jobId,
      tabId,
      entryMode: "selected_job",
      status: "ready_to_fill",
      observation,
      mappings: [],
      customAnswers: {},
      missing: [],
      readback: [],
      lastError: null,
      reviewConfirmedAt: null,
      manualAssist,
      rpaTrace: []
    };
    await update({ activeApplication: application });
    const guidedFill = await fillAutoApplyFormWithVision({
      credential,
      visionSessionId,
      tabId,
      candidateFacts,
      initialObservation: observation,
      ...(resumeRepairFieldKeys ? { repairFieldKeys: resumeRepairFieldKeys } : {}),
      diagnosticContext: {
        batchId,
        batchJobId,
        commandId: command.commandId
      },
      onDiagnostic: recordVisionDiagnostic,
      assertActive: () => assertAutoApplyCommandActive(command),
      abortSignal: autoApplyExecutionAbort?.signal,
      engineMode: requestedApplicationEngineFromPayload(payload),
      // The first expansion phase is isolated to the new Moka family route.
      // DeepSeek and Xiaopeng keep their already accepted, adapter-specific
      // declaration executors unchanged.
      allowConsentClick: ["moka.v2", "generic.web.v1"].includes(adapterCode) &&
        command.safety?.allowConsentClick === true
    });
    // Submit user corrections to the site without a second field-audit gate.
    observation = guidedFill.observation;
    assertApplicationFormStage(observation, "视觉填写完成后复核");
    const guidedManualAssist = mergeManualAssistWithObservation(manualAssist, observation);
    await update({
      activeApplication: {
        ...application,
        status: "ready_for_review",
        observation,
        manualAssist: guidedManualAssist,
        readback: guidedFill.readback,
        rpaTrace: guidedFill.attempts.map((attempt) => ({
          stage: attempt.success ? "correct_form" : "readback",
          status: attempt.success ? "completed" : "failed",
          detail: `视觉步骤 ${attempt.iteration}：${attempt.label} → ${attempt.value}${attempt.success ? "" : `（${attempt.error ?? "回读失败"}）`}`,
          at: new Date().toISOString()
        })),
        lastError: null
      }
    });
    await enforceAutoApplyControl(credential, command, batchId, tabId, { companyName, title }, localValidation);
    if (isMokaApplicationUrl(observation.url) && command.safety?.allowConsentClick === true) {
      observation = (await ensureAuthorizedPageConsents(tabId, observation)).observation;
    }
    pageSession = updateAutoApplyPageSession(pageSession, { stage: "validating" });
    await persistAutoApplyPageSession(pageSession);
    progressReporter?.setStage("submitting", "已完成信息包填写，准备提交并等待网站校验");
    // Commit the last React-controlled editor before reading final validation.
    // Moka can render the chosen label while keeping its old required error
    // until a real blur. The trusted blank-surface click exposes that state
    // before any irreversible submit is attempted.
    await commitApplicationFormBlurBeforePreSubmit(tabId);
    let finalObservation = await stableApplicationObservation(tabId);
    assertApplicationFormStage(finalObservation, "最终提交页面确认");
    // All sites share the registered consent operation after re-observation.
    if (command.safety?.allowConsentClick === true) {
      finalObservation = (await ensureAuthorizedPageConsents(tabId, finalObservation)).observation;
      assertApplicationFormStage(finalObservation, "协议确认后复核");
    }
    // Do not infer submission eligibility from stale/red DOM state. The site's
    // real submit transaction owns required-field acceptance and supplies the
    // exact rejected scope used by the single repair round below.
    const submitActions = [requireUniqueFinalSubmitAction(finalObservation, command.safety?.allowConsentClick === true)];
    const localReadbackHash = localAssisted ? await observationReadbackHash(finalObservation) : null;
    const localApproval = asRecord(payload.localReviewApproval);
    const localApproved = localAssisted && command.safety?.allowFinalSubmit === true &&
      localApproval?.reviewHash === localReadbackHash && Date.parse(String(localApproval?.expiresAt)) > Date.now();
    if (stopBeforeFinalSubmit || (localAssisted && !localApproved)) {
      // Local acceptance deliberately keeps the inspected page available.
      // Production only closes an execution-created page; a user-owned page
      // remains available after evidence capture for manual review.
      tabResultDisposition = "keep_open";
      pageSession = updateAutoApplyPageSession(pageSession, { stage: "submit_ready" });
      await persistAutoApplyPageSession(pageSession);
      const evidence = await redactedEvidence(tabId);
      return batchResultEvent(command, {
        batchId,
        batchJobId,
        jobId,
        status: localAssisted ? "waiting_for_user_action" : "ready_for_final_confirmation",
        ...(localAssisted ? { reasonCode: "final_review_required" } : {}),
        evidence: {
          screenshotRef: evidence.screenshotRef,
          redacted: true,
          pageUrl: finalObservation.url,
          siteConfirmation: "已有可信信息已填写，已停在最终提交前；必填完整性由招聘网站校验",
          ...(localAssisted ? { failureDetails: { reviewHash: localReadbackHash, tabId, message: "请核对原招聘页面，再在本地界面确认最终投递；页面变化后须重新确认。" } } : {}),
          ...(evidence.screenshotDataUrl ? { screenshotDataUrl: evidence.screenshotDataUrl } : {})
        }
      });
    }
    assertAutoApplyCommandActive(command);
    const executeAuthorizedSubmitAttempt = async (
      action: PageObservation["actions"][number],
      progressText: string,
      previouslyRejectedKeys: ReadonlySet<string> = new Set()
    ): Promise<FinalSubmitExecutionResult> => {
      // Never begin an irreversible submit after the bounded device command has
      // expired. Any later cleanup is reported as a failure rather than clicking
      // the ATS submit control with an obsolete authorization.
      assertAutoApplyCommandActive(command);
      const submissionAttemptId = crypto.randomUUID();
      progressReporter?.setStage("submitting", progressText);
      autoApplyActiveSubmissionTabs.add(tabId);
      try {
        return await executeWithAutoApplySubmissionLifecycleGuard({
          tabs: chrome.tabs,
          tabId,
          timeoutMs: finalSubmitLifecycleGuardTimeoutMs,
          execute: (submissionSignal) => executeFinalSubmitWithDebugger(
            tabId, action, action.text,
            async () => {
              assertAutoApplyCommandActive(command);
              if (!pageSession) throw new Error("最终提交页面会话不存在");
              pageSession = beginAutoApplySubmission(pageSession, submissionAttemptId);
              if (!await persistAutoApplyPageSession(pageSession)) throw new Error("最终提交意图未持久化，已停止点击");
              assertAutoApplyCommandActive(command);
              progressReporter?.setStage("verifying", "正在等待招聘网站校验与投递结果");
            }, command.safety?.allowConsentClick === true, previouslyRejectedKeys,
            command.safety?.allowCaptchaHandling === true && pageSession ? {
              ownerId: `${credential.tenantId}:${credential.userId}`,
              deviceId: credential.deviceId,
              pageSessionKey: pageSession.sessionKey,
              submissionAttemptId,
              assertActive: () => assertAutoApplyCommandActive(command),
              signal: executionSignal ? AbortSignal.any([executionSignal, submissionSignal]) : submissionSignal
            } : undefined, submissionSignal,
            async () => {
              assertAutoApplyCommandActive(command);
              // Preview, final confirmation and the permitted repair attempt
              // each need fresh authority; the original intent is persisted once.
              const authorized = localValidation || await verifyAutoApplySubmission(credential, {
                token: String(payload.batchAuthorization ?? ""), batchId, batchJobId, commandId: command.commandId
              });
              if (!authorized) throw new Error("批次最终提交授权无效或已过期");
              assertAutoApplyCommandActive(command);
            }
          )
        });
      } catch (error) {
        if (!(error instanceof AutoApplySubmissionGuardTimeoutError) || !pageSession?.submitInitiatedAt) throw error;
        // The guarded executor is now fenced. Re-read the actual page without
        // submitting again; a live challenge is a handoff, not a failed receipt.
        const terminal = await detectAutoApplySiteSuccess(tabId).catch(() => null);
        if (terminal?.success) return { executed: true, actionId: action.actionId,
          actionText: action.text, observedResult: "submitted_success", pageUrlAfterClick: terminal.url,
          error: null, trace: ["submit_guard_timeout:registered_or_visible_receipt"] };
        const gate = await detectAutoApplyUserAction(tabId, false).catch(() => null);
        if (gate) return { executed: true, actionId: action.actionId,
          actionText: action.text, observedResult: "waiting_for_user_action", pageUrlAfterClick: applicationUrl,
          error: null, userActionRequired: gate, trace: [`submit_guard_timeout:handoff:${gate.type}`] };
        throw error;
      } finally {
        autoApplyActiveSubmissionTabs.delete(tabId);
      }
    };

    let submitResult = await executeAuthorizedSubmitAttempt(submitActions[0]!, "正在提交申请，请勿关闭招聘页面");
    if (canResumeAutoApplyAfterSiteValidation(submitResult)) {
      if (!pageSession) throw new Error("站点校验后的页面会话不存在");
      const live = await stableApplicationObservation(tabId);
      assertApplicationFormStage(live, "站点提交校验后确认");
      const rejectedFieldKeys = new Set(submitResult.rejectedFieldKeys ?? []);
      const rejected = rejectedSubmissionFields(live, submitResult);
      if (rejected.length !== rejectedFieldKeys.size || rejected.length === 0) {
        pageSession = resumeAutoApplyAfterSiteValidation(pageSession);
        if (!await persistAutoApplyPageSession(pageSession)) throw new Error("网站拒绝后的页面会话未保存");
        throw new RecruitingError({
          code: "FORM_FILL_VALIDATION_FAILED", stage: "submission", retryable: false,
          message: "网站报告字段错误，但未能完整定位报错字段，请检查原页面",
          userAction: "请根据 AI Offer 返回的字段错误补充或修正信息后重新投递；插件不会刷新、整表重填或再次点击提交。",
          details: { failureCode: "site_rejected_field_unresolved", rejectedFieldKeys: [...rejectedFieldKeys] }
        });
      }
      if (rejected.some(field => field.type === "file")) {
        const uploadError = siteRejectedUploadError(rejected, submitResult.trace);
        if (uploadError) {
          pageSession = updateAutoApplyPageSession(resumeAutoApplyAfterSiteValidation(pageSession), {
            pendingRepairFieldKeys: [...rejectedFieldKeys]
          });
          if (!await persistAutoApplyPageSession(pageSession)) throw new Error("网站上传拒绝后的会话未保存");
          throw uploadError;
        }
      }
      const partition = partitionSiteRejectedFields(
        { ...live, fields: rejected }, candidateFacts, rejectedFieldKeys
      );
      if (partition.locked.length > 0) {
        pageSession = updateAutoApplyPageSession(resumeAutoApplyAfterSiteValidation(pageSession), {
          pendingRepairFieldKeys: partition.locked.map(siteValidationFieldKey)
        });
        if (!await persistAutoApplyPageSession(pageSession)) throw new Error("网站锁定字段拒绝后的会话未保存");
        throw new RecruitingError({
          code: "SITE_VALIDATION_BLOCKED", stage: "submission", retryable: false,
          message: `招聘网站拒绝了 ${partition.locked.length} 个由网站锁定的字段，插件未强制修改`,
          userAction: "请在原招聘页面检查简历解析结果；这些字段已被网站禁用，插件不会强行启用、复填或再次提交。",
          details: { failureCode: "site_managed_disabled_field_rejected",
            fields: partition.locked.map(field => field.label),
            failures: partition.locked.map(field => `${field.label}：${field.validationMessage ?? "招聘网站仍未接受"}`),
            submitTrace: submitResult.trace ?? [] }
        });
      }
      // Process the rejection set in page order. Known facts are repaired one
      // at a time against fresh observations. Unknown facts remain untouched
      // and the second submit confirms them together with any newly revealed
      // conditional fields. With no repairable field, an identical second
      // click adds no evidence, so return the complete first rejection set.
      if (partition.repairable.length === 0) {
        pageSession = updateAutoApplyPageSession(resumeAutoApplyAfterSiteValidation(pageSession), {
          pendingRepairFieldKeys: [...rejectedFieldKeys]
        });
        if (!await persistAutoApplyPageSession(pageSession)) throw new Error("网站拒绝后的补充信息会话未保存");
        const handoff = await collectSiteRejectedInformation(tabId, rejected);
        throw new RecruitingError({
          code: "MISSING_INFORMATION", stage: "missing_information", retryable: false,
          message: `招聘网站拒绝了 ${rejected.length} 个字段，信息包均无可用值`,
          userAction: "请在 AI Offer 一次性补充网站缺少的信息，再继续原岗位。",
          details: { ...handoff, informationRequests: handoff.requiredFieldRequests,
            fields: handoff.requiredFieldRequests.map(request => request.label),
            rejectedFields: rejected.map(field => field.label),
            failures: [submitResult.error || "招聘网站字段校验未通过"], submitTrace: submitResult.trace ?? [] }
        });
      }
      if ((pageSession.automaticSiteValidationRepairCount ?? 0) >= 1) {
        pageSession = updateAutoApplyPageSession(resumeAutoApplyAfterSiteValidation(pageSession), {
          pendingRepairFieldKeys: [...rejectedFieldKeys]
        });
        if (!await persistAutoApplyPageSession(pageSession)) throw new Error("网站拒绝后的终止会话未保存");
        throw new RecruitingError({
          code: "SITE_VALIDATION_BLOCKED", stage: "submission", retryable: false,
          message: "招聘网站再次拒绝字段，自动修复已达到一次上限",
          userAction: "请检查原招聘页面；插件不会刷新、整表重填或第三次提交。",
          details: { failureCode: "site_validation_single_repair_exhausted",
            fields: rejected.map(field => field.label), submitTrace: submitResult.trace ?? [] }
        });
      }

      pageSession = updateAutoApplyPageSession(beginSingleAutomaticSiteValidationRepair(pageSession), {
        pendingRepairFieldKeys: [...rejectedFieldKeys]
      });
      if (!await persistAutoApplyPageSession(pageSession)) throw new Error("网站字段单次修复检查点未保存");
      progressReporter?.setStage("filling",
        `网站拒绝了 ${rejected.length} 个字段，正在按序复填 ${partition.repairable.length} 个已有值字段`);
      const repairFieldKeys = new Set(partition.repairable.map(siteValidationFieldKey));
      const repaired = await fillAutoApplyFormWithVision({
        credential,
        visionSessionId,
        tabId,
        candidateFacts,
        initialObservation: live,
        repairFieldKeys,
        diagnosticContext: { batchId, batchJobId, commandId: command.commandId },
        onDiagnostic: recordVisionDiagnostic,
        assertActive: () => assertAutoApplyCommandActive(command),
        abortSignal: autoApplyExecutionAbort?.signal,
        engineMode: requestedApplicationEngineFromPayload(payload),
        allowConsentClick: ["moka.v2", "generic.web.v1"].includes(adapterCode) &&
          command.safety?.allowConsentClick === true
      });
      const repairReadbackFailures = siteRepairReadbackFailures(
        partition.repairable, repaired.observation, candidateFacts
      );
      if (repairReadbackFailures.length > 0) {
        throw new RecruitingError({
          code: "SITE_VALIDATION_BLOCKED", stage: "form_fill", retryable: false,
          message: `网站拒绝字段中有 ${repairReadbackFailures.length} 个未能完成可信回读，已停止再次提交`,
          userAction: "原招聘页面已保留；请检查控件适配，插件不会刷新或整表重填。",
          details: { failureCode: "site_validation_repair_readback_failed",
            fields: repairReadbackFailures.map(field => field.label),
            failures: repairReadbackFailures.map(field => `${field.label}：定向修复后回读与信息包不一致`),
            submitTrace: [...(submitResult.trace ?? []), "site_validation_single_repair_readback_failed"] }
        });
      }

      await commitApplicationFormBlurBeforePreSubmit(tabId);
      let repairedObservation = await stableApplicationObservation(tabId);
      assertApplicationFormStage(repairedObservation, "网站字段定向修复后复核");
      if (command.safety?.allowConsentClick === true) {
        repairedObservation = (await ensureAuthorizedPageConsents(tabId, repairedObservation)).observation;
        assertApplicationFormStage(repairedObservation, "网站字段定向修复协议确认后复核");
      }
      const repairedSubmitAction = requireUniqueFinalSubmitAction(
        repairedObservation, command.safety?.allowConsentClick === true
      );
      const firstTrace = submitResult.trace ?? [];
      const secondSubmitResult = await executeAuthorizedSubmitAttempt(
        repairedSubmitAction,
        "定向修复完成，正在进行最后一次提交",
        rejectedFieldKeys
      );
      submitResult = {
        ...secondSubmitResult,
        trace: [
          ...firstTrace,
          "site_validation_single_repair_completed",
          "site_validation_second_submit_started",
          ...(secondSubmitResult.trace ?? [])
        ]
      };

      if (canResumeAutoApplyAfterSiteValidation(submitResult)) {
        if (!pageSession) throw new Error("第二次站点校验后的页面会话不存在");
        const secondLive = await stableApplicationObservation(tabId);
        assertApplicationFormStage(secondLive, "第二次站点提交校验后确认");
        const secondRejectedKeys = new Set(submitResult.rejectedFieldKeys ?? []);
        const secondRejected = rejectedSubmissionFields(secondLive, submitResult);
        pageSession = updateAutoApplyPageSession(resumeAutoApplyAfterSiteValidation(pageSession), {
          pendingRepairFieldKeys: [...secondRejectedKeys]
        });
        if (!await persistAutoApplyPageSession(pageSession)) throw new Error("第二次网站拒绝后的终止会话未保存");
        if (secondRejected.length !== secondRejectedKeys.size || secondRejected.length === 0) {
          throw new RecruitingError({
            code: "FORM_FILL_VALIDATION_FAILED", stage: "submission", retryable: false,
            message: "第二次提交后网站报告字段错误，但未能完整定位报错字段",
            userAction: "请根据 AI Offer 返回的字段错误补充或修正信息后重新投递；插件不会刷新、整表重填或第三次提交。",
            details: { failureCode: "site_rejected_field_unresolved_after_single_repair",
              rejectedFieldKeys: [...secondRejectedKeys], submitTrace: submitResult.trace ?? [] }
          });
        }
        if (secondRejected.some(field => field.type === "file")) {
          const uploadError = siteRejectedUploadError(secondRejected, submitResult.trace);
          if (uploadError) throw uploadError;
        }
        const secondLocked = secondRejected.filter(isSiteManagedDisabledField);
        if (secondLocked.length > 0) {
          throw new RecruitingError({
            code: "SITE_VALIDATION_BLOCKED", stage: "submission", retryable: false,
            message: `第二次提交仍拒绝 ${secondLocked.length} 个由网站锁定的字段，插件未强制修改`,
            userAction: "请在原招聘页面检查简历解析结果；插件不会强行启用锁定字段或执行第三次提交。",
            details: { failureCode: "site_managed_disabled_field_rejected_after_single_repair",
              fields: secondLocked.map(field => field.label),
              failures: secondLocked.map(field => `${field.label}：${field.validationMessage ?? "招聘网站仍未接受"}`),
              submitTrace: submitResult.trace ?? [] }
          });
        }
        // The single automatic repair was already consumed. A second native
        // rejection means every field reported by the site needs explicit user
        // correction, even if the package previously contained a value. Return
        // the complete current rejection set in one supplement request; never
        // classify known facts as a Driver retry or attempt a third submit.
        const handoff = await collectSiteRejectedInformation(tabId, secondRejected);
        throw new RecruitingError({
          code: "MISSING_INFORMATION", stage: "missing_information", retryable: false,
          message: `第二次提交仍有 ${handoff.requiredFieldRequests.length} 个字段未被招聘网站接受`,
          userAction: "请在 AI Offer 一次性补充或更正这些字段；插件不会自动第三次提交。",
          details: { ...handoff, failureCode: "site_validation_single_repair_exhausted",
            informationRequests: handoff.requiredFieldRequests,
            fields: handoff.requiredFieldRequests.map(request => request.label),
            rejectedFields: secondRejected.map(field => field.label),
            failures: secondRejected.map(field => `${field.label}：${field.validationMessage ?? "招聘网站仍未接受"}`),
            submitTrace: submitResult.trace ?? [] }
        });
      }
    }
    if (submitResult.observedResult === "blocked_by_site_policy" && submitResult.sitePolicyBlock) {
      tabResultDisposition = "default";
      pageSession = failAutoApplyPageSession(pageSession);
      await persistAutoApplyPageSession(pageSession);
      const evidence = await redactedEvidence(tabId).catch(() => ({
        screenshotRef: null,
        screenshotDataUrl: undefined
      }));
      return batchResultEvent(command, {
        batchId,
        batchJobId,
        jobId,
        status: "failed",
        reasonCode: "site_application_limit_reached",
        evidence: {
          screenshotRef: evidence.screenshotRef,
          redacted: true,
          pageUrl: submitResult.pageUrlAfterClick,
          siteConfirmation: submitResult.sitePolicyBlock.message,
          diagnostic: autoApplyDiagnostic("site_application_limit_reached"),
          failureDetails: {
            outcome: "site_application_limit_reached",
            source: submitResult.sitePolicyBlock.source,
            message: submitResult.sitePolicyBlock.message,
            submitTrace: submitResult.trace ?? []
          },
          ...(evidence.screenshotDataUrl ? { screenshotDataUrl: evidence.screenshotDataUrl } : {})
        }
      });
    }
    if (submitResult.observedResult === "waiting_for_user_action" && submitResult.userActionRequired) {
      const action = submitResult.userActionRequired;
      const outcome = autoApplyUserActionOutcome(action.type);
      const terminalHumanActionFailure = outcome.status === "failed";
      tabResultDisposition = outcome.resultDisposition;
      pageSession = terminalHumanActionFailure
        ? failAutoApplyPageSession(pageSession)
        : waitAutoApplyForUser(pageSession, action.type);
      await persistAutoApplyPageSession(pageSession);
      if (terminalHumanActionFailure) await cleanupSubmissionValidationMonitor(tabId, submitResult.validationMonitor);
      if (!terminalHumanActionFailure && submitResult.validationMonitor) await rememberAutoApplyTab({
        batchId, batchJobId, jobId, tabId, applicationUrl, tabOwnership: pageSession.tabOwnership,
        commandId: command.commandId, validationMonitor: submitResult.validationMonitor,
        updatedAt: new Date().toISOString()
      });
      return batchResultEvent(command, {
        batchId,
        batchJobId,
        jobId,
        status: outcome.status,
        reasonCode: outcome.reasonCode,
        evidence: {
          screenshotRef: null,
          redacted: true,
          pageUrl: submitResult.pageUrlAfterClick,
          siteConfirmation: null,
          ...(terminalHumanActionFailure ? {} : {
            userActionRequired: {
              ...action,
              resumeSupported: true
            }
          }),
          diagnostic: autoApplyDiagnostic(action.type === "login"
            ? "login_required"
            : action.type === "captcha"
              ? "captcha_required"
              : "identity_verification_required"),
          failureDetails: {
            submitTrace: submitResult.trace ?? []
          }
        }
      });
    }
    if (submitResult.observedResult === "waiting_for_site_receipt") {
      tabResultDisposition = "keep_open";
      pageSession = updateAutoApplyPageSession(pageSession, { stage: "reconciling" });
      await persistAutoApplyPageSession(pageSession);
      const receiptDeadlineAt = Date.now() + finalSubmitPassiveReceiptTimeoutMs;
      await rememberAutoApplyTab({
        batchId,
        batchJobId,
        jobId,
        tabId,
        applicationUrl,
        tabOwnership: pageSession.tabOwnership,
        monitorMode: "submission_receipt",
        commandId: command.commandId,
        validationMonitor: submitResult.validationMonitor,
        receiptDeadlineAt: new Date(receiptDeadlineAt).toISOString(),
        updatedAt: new Date().toISOString()
      });
      // The success route can arrive after the last active poll but before the
      // passive binding is persisted. Read once immediately after handoff so a
      // tab close in that gap cannot turn a real success into "tab closed".
      const handoffTerminal = await detectAutoApplySiteSuccess(tabId).catch(() => null);
      if (handoffTerminal?.success && handoffTerminal.outcome && handoffTerminal.url) {
        tabResultDisposition = "default";
        await cleanupSubmissionValidationMonitor(tabId, submitResult.validationMonitor);
        await forgetAutoApplyTab(batchId, batchJobId, tabId);
        pageSession = completeAutoApplyPageSession(pageSession, handoffTerminal.outcome);
        await persistAutoApplyPageSession(pageSession);
        const evidence = await redactedEvidence(tabId).catch(() => ({
          screenshotRef: null,
          screenshotDataUrl: null
        }));
        return batchResultEvent(command, {
          batchId,
          batchJobId,
          jobId,
          status: "succeeded",
          reasonCode: handoffTerminal.outcome === "already_applied" ? "already_applied" : null,
          evidence: {
            screenshotRef: evidence.screenshotRef,
            redacted: true,
            pageUrl: handoffTerminal.url,
            siteConfirmation: handoffTerminal.outcome === "already_applied"
              ? "招聘网站提示重复申请/已经投递"
              : "投递成功"
          }
        });
      }
      const handoffPolicyBlock = await detectAutoApplySitePolicyBlock(tabId, submitResult.validationMonitor).catch(() => null);
      if (handoffPolicyBlock?.blocked && handoffPolicyBlock.message) {
        tabResultDisposition = "default";
        await cleanupSubmissionValidationMonitor(tabId, submitResult.validationMonitor);
        await forgetAutoApplyTab(batchId, batchJobId, tabId);
        pageSession = failAutoApplyPageSession(pageSession);
        await persistAutoApplyPageSession(pageSession);
        const evidence = await redactedEvidence(tabId).catch(() => ({
          screenshotRef: null,
          screenshotDataUrl: undefined
        }));
        return batchResultEvent(command, {
          batchId,
          batchJobId,
          jobId,
          status: "failed",
          reasonCode: "site_application_limit_reached",
          evidence: {
            screenshotRef: evidence.screenshotRef,
            redacted: true,
            pageUrl: handoffPolicyBlock.url || submitResult.pageUrlAfterClick,
            siteConfirmation: handoffPolicyBlock.message,
            diagnostic: autoApplyDiagnostic("site_application_limit_reached"),
            failureDetails: {
              outcome: "site_application_limit_reached",
              source: handoffPolicyBlock.source,
              message: handoffPolicyBlock.message,
              submitTrace: submitResult.trace ?? []
            },
            ...(evidence.screenshotDataUrl ? { screenshotDataUrl: evidence.screenshotDataUrl } : {})
          }
        });
      }
      await chrome.alarms.create(submissionReceiptAlarmName(batchId, batchJobId), {
        when: receiptDeadlineAt
      });
      return batchResultEvent(command, {
        batchId,
        batchJobId,
        jobId,
        status: "waiting_for_site_receipt",
        reasonCode: "submission_receipt_pending",
        evidence: {
          screenshotRef: null,
          redacted: true,
          pageUrl: submitResult.pageUrlAfterClick,
          siteConfirmation: "已触发投递，正在后台等待招聘网站回执",
          diagnostic: {
            code: "submission_receipt_pending",
            category: "page",
            stage: "submit",
            userMessage: "已完成提交操作，招聘网站结果仍在后台确认中。",
            developerMessage: "主动核验未取得终态（初始 12 秒，连续确认提示最多 24 秒）；原标签页已移交最多 108 秒的只读回执监控，当前命令已释放。",
            retryable: false,
            recommendedAction: "none"
          },
          failureDetails: {
            submitTrace: submitResult.trace ?? [],
            activeVerificationMs: finalSubmitActiveVerificationTimeoutMs,
            maximumContinuationVerificationMs: finalSubmitActiveVerificationTimeoutMs * 2,
            passiveReceiptTimeoutMs: finalSubmitPassiveReceiptTimeoutMs
          }
        }
      });
    }
    if (!submitResult?.executed || submitResult.observedResult !== "submitted_success") {
      const submitFailure = submissionFailureEvidence(submitResult);
      if (!submitResult?.executed) {
        throw new RecruitingError({
          code: "PREVIEW_SUBMIT_NOT_OPENED",
          stage: "submit",
          message: submitResult?.error || "最终提交按钮未执行",
          retryable: false,
          userAction: "插件未观察到预览或最终确认步骤；本次没有执行最终提交，请使用更新后的插件重试。",
          details: submitFailure
        });
      }
      if (submitResult.error && /二次确认/.test(submitResult.error)) {
        throw new RecruitingError({
          code: "CONFIRMATION_SUBMIT_NOT_EXECUTED",
          stage: "submit",
          message: submitResult.error,
          retryable: false,
          userAction: "二次确认提交未能安全执行；请先核对招聘网站结果，避免重复投递。",
          details: submitFailure
        });
      }
      throw new RecruitingError({
        code: "SITE_SUCCESS_NOT_OBSERVED",
        stage: "submit",
        message: String(submitFailure.message),
        retryable: false,
        userAction: "请先核对招聘网站结果，避免重复投递。",
        details: submitFailure
      });
    }
    const terminalOutcome = await detectAutoApplySiteSuccess(tabId);
    pageSession = completeAutoApplyPageSession(
      pageSession,
      terminalOutcome.outcome === "already_applied" ? "already_applied" : "succeeded"
    );
    await persistAutoApplyPageSession(pageSession);
    const evidence = await redactedEvidence(tabId);
    return batchResultEvent(command, {
      batchId,
      batchJobId,
      jobId,
      status: "succeeded",
      reasonCode: terminalOutcome.outcome === "already_applied" ? "already_applied" : null,
      evidence: {
        screenshotRef: evidence.screenshotRef,
        redacted: true,
        pageUrl: submitResult.pageUrlAfterClick,
        siteConfirmation: terminalOutcome.outcome === "already_applied"
          ? "招聘网站提示重复申请/已经投递"
          : "投递成功",
        ...(evidence.screenshotDataUrl ? { screenshotDataUrl: evidence.screenshotDataUrl } : {})
      }
    });
  } catch (caughtError) {
    const abortReason = autoApplyExecutionAbort?.signal.reason;
    if (autoApplySessionTerminated ||
      (autoApplyExecutionAbort?.signal.aborted && !(abortReason instanceof AutoApplyCommandExpiredError) &&
        !(abortReason instanceof AutoApplyUserInterruptedError || abortReason instanceof AutoApplyJobStoppedError))) {
      return batchResultEvent(command, {
        batchId,
        batchJobId,
        jobId,
        status: "cancelled",
        reasonCode: "account_logout",
        evidence: null
      });
    }
    const error = abortReason instanceof AutoApplyCommandExpiredError || abortReason instanceof AutoApplyUserInterruptedError || abortReason instanceof AutoApplyJobStoppedError ? abortReason : caughtError;
    let failure = autoApplyFailureStatus(error);
    if (pageSession?.submitInitiatedAt && failure.reasonCode !== "captcha_required" &&
      failure.status !== "cancelled" && failure.status !== "waiting_for_user_action" &&
      failure.reasonCode !== "user_interrupted") {
      pageSession = updateAutoApplyPageSession(pageSession, { stage: "outcome_unknown" });
      await persistAutoApplyPageSession(pageSession).catch(() => undefined);
      failure = { status: "failed", reasonCode: "submission_outcome_unknown" };
    }
    const publicFailure = toPublicError(error);
    if (error instanceof AutoApplyUserInterruptedError) {
      publicFailure.details = { ...publicFailure.details, interruptionKind: error.kind,
        submissionStarted: Boolean(pageSession?.submitInitiatedAt) };
    }
    const requiredFieldRequests = requiredFieldRequestsFromFailure(publicFailure.details);
    const preserveFieldInteractionFailureClassification = [
      "field_fill_readback_failed",
      "model_response_invalid",
      "location_selection_unconfirmed",
      "required_control_unconfirmed",
      "site_validation_blocked"
    ].includes(failure.reasonCode);
    if (requiredFieldRequests.length > 0 && failure.reasonCode === "missing_information" &&
      !preserveFieldInteractionFailureClassification && !pageSession?.submissionAttemptId) {
      failure = { status: "waiting_for_user_action", reasonCode: "missing_information" };
    }
    const userActionRequired = error instanceof AutoApplyUserActionRequiredError &&
      (error.actionType === "identity_verification" || error.actionType === "captcha")
      ? {
          type: error.actionType,
          message: error.message,
          resumeSupported: error.actionType === "captcha"
        }
      : null;
    if (pageSession && error instanceof AutoApplyUserActionRequiredError) {
      const outcome = autoApplyUserActionOutcome(error.actionType);
      pageSession = outcome.status === "failed"
        ? failAutoApplyPageSession(pageSession)
        : waitAutoApplyForUser(pageSession, error.actionType);
      await persistAutoApplyPageSession(pageSession).catch(() => undefined);
    } else if (pageSession && failure.reasonCode === "missing_information" && !pageSession.submissionAttemptId) {
      pageSession = waitAutoApplyForUser(pageSession, "missing_information");
      await persistAutoApplyPageSession(pageSession);
    } else if (pageSession && !pageSession.submitInitiatedAt && failure.status === "failed") {
      pageSession = failAutoApplyPageSession(pageSession);
      await persistAutoApplyPageSession(pageSession).catch(() => undefined);
    }
    let failureEvidence: Record<string, unknown> | null = null;
    if (tabId !== null) {
      try {
        const observation = await stableApplicationObservation(tabId);
        const evidence = await redactedEvidence(tabId);
        failureEvidence = {
          screenshotRef: evidence.screenshotRef,
          redacted: true,
          pageUrl: observation.url,
          reasonCode: failure.reasonCode,
          failureDetails: attachVisionDiagnosticsToFailure(
            publicFailure.details,
            visualFailureDetails(error instanceof Error ? error.message : publicFailure.message),
            visionDiagnostics
          ),
          validationMessages: observation.validationMessages,
          ...requiredInformationEvidence(requiredFieldRequests),
          diagnostic: autoApplyDiagnostic(failure.reasonCode, publicFailure.details),
          ...(userActionRequired ? { userActionRequired } : {}),
          ...(evidence.screenshotDataUrl ? { screenshotDataUrl: evidence.screenshotDataUrl } : {})
        };
      } catch {
        failureEvidence = {
          reasonCode: failure.reasonCode,
          ...(failure.reasonCode === "user_interrupted" ? { pageUrl: applicationUrl } : {}),
          redacted: true,
          failureDetails: attachVisionDiagnosticsToFailure(
            publicFailure.details,
            visualFailureDetails(error instanceof Error ? error.message : publicFailure.message),
            visionDiagnostics
          ),
          ...requiredInformationEvidence(requiredFieldRequests),
          diagnostic: autoApplyDiagnostic(failure.reasonCode, publicFailure.details),
          ...(userActionRequired ? { userActionRequired } : {})
        };
      }
    } else if (visionDiagnostics.length) {
      failureEvidence = {
        reasonCode: failure.reasonCode,
        redacted: true,
        failureDetails: attachVisionDiagnosticsToFailure(
          publicFailure.details,
          visualFailureDetails(error instanceof Error ? error.message : publicFailure.message),
          visionDiagnostics
        ),
        ...requiredInformationEvidence(requiredFieldRequests),
        diagnostic: autoApplyDiagnostic(failure.reasonCode, publicFailure.details)
      };
    } else {
      failureEvidence = {
        reasonCode: failure.reasonCode,
        redacted: true,
        failureDetails: attachVisionDiagnosticsToFailure(
          publicFailure.details,
          visualFailureDetails(error instanceof Error ? error.message : publicFailure.message),
          visionDiagnostics
        ),
        ...requiredInformationEvidence(requiredFieldRequests),
        diagnostic: autoApplyDiagnostic(failure.reasonCode, publicFailure.details)
      };
    }
    await update({
      autoApplyRuntime: {
        connection: "ready",
        status: failure.status === "cancelled"
          ? "cancelled"
          : failure.status === "waiting_for_user_action"
            ? "paused"
            : "failed",
        batchId,
        jobId,
        companyName,
        title,
        updatedAt: new Date().toISOString(),
        lastError: error instanceof Error ? error.message : "自动投递失败"
      }
    }).catch(() => undefined);
    // Upload rejection requires inspection of the exact file widget, and its
    // file cannot be supplied through the text-only supplementation dialog.
    // CAPTCHA requires the user to continue interacting with the exact
    // recruitment tab. Login hands off its page without a resumable monitor.
    // Missing information, identity verification and field-validation failures
    // are first reported, then plugin-owned tabs close.
    if (failure.status === "failed" && failure.reasonCode === "login_required") {
      tabResultDisposition = "login_handoff";
    } else {
      tabResultDisposition = (failure.status === "waiting_for_user_action" &&
        userActionRequired?.type === "captcha") ||
        (failure.reasonCode === "site_validation_blocked" &&
          publicFailure.details?.failureCode === "site_upload_rejected")
        ? "keep_open"
        : "default";
    }
    return batchResultEvent(command, {
      batchId,
      batchJobId,
      jobId,
      status: failure.status,
      reasonCode: failure.reasonCode,
      evidence: failureEvidence
    });
  } finally {
    if (tabId !== null && controlledExecution) {
      controlledExecutions.delete(tabId);
      disarmApplicationInterruption(tabId, controlledExecution);
      if (!controlledExecution.signal.aborted || executionSignal?.reason instanceof AutoApplyJobStoppedError) {
        await forgetControlledExecution(command.commandId);
      }
    }
    clearInterval(lease);
    leaseWatchdog?.stop();
    executionSignal?.removeEventListener("abort", closeExpiredExecutionSurface);
    if (!(executionSignal?.reason instanceof AutoApplyCommandExpiredError) && recoveryReload) {
      clearTimeout(recoveryReload);
    }
    await progressReporter?.stop();
    if (tabId !== null) {
      await removeAutoApplyOverlay(tabId);
      if (tabResultDisposition === "login_handoff") {
        // Keep the document and task/session binding, but stop interpreting the
        // user's subsequent login/navigation as this completed attempt's receipt.
        await forgetAutoApplyTab(batchId, batchJobId, tabId);
      }
      if ((ownsTab && tabResultDisposition === "login_handoff") || shouldCloseAutoApplyTab({
        createdForExecution: ownsTab,
        resultDisposition: tabResultDisposition
      })) {
        // Do not close here: the returned event has not reached AI Offer yet.
        // The durable outbox flush finalizes this exact plugin-owned tab only
        // after Gateway accepts the result; login retains it even after restart.
        await rememberPendingAutoApplyTabClosure({
          commandId: command.commandId,
          batchId,
          batchJobId,
          jobId,
          applicationUrl,
          tabId
        }).catch(() => undefined);
      }
    }
    await update({ activeApplication: null }).catch(() => undefined);
    localAutoApplyControl.delete(batchId);
    if (!autoApplySessionTerminated && !autoApplyExecutionAbort?.signal.aborted) {
      await update({
        autoApplyRuntime: {
          ...defaults.autoApplyRuntime,
          connection: "ready",
          updatedAt: new Date().toISOString()
        }
      }).catch(() => undefined);
    }
  }
}

// Legacy and Shadow remain behavior-compatible. Layered V2 is opt-in through
// Server runtime policy and reuses the proven tab/submission lifecycle while
// replacing only the model repair boundary with the constrained V2 contract.
const autoApplyEngineRouter = new ApplicationEngineRouter<
  AiPluginCommand,
  AutoApplyRuntimeCredential,
  AiPluginEvent
>([{
  code: "legacy",
  execute: executeLegacyBatchAutoApplyJob
}, {
  // Shadow V2 performs read-only analysis inside the proven legacy lifecycle,
  // then lets the legacy engine complete the task unchanged.
  code: "shadow_v2",
  execute: executeLegacyBatchAutoApplyJob
}, {
  code: "layered_v2",
  execute: executeLegacyBatchAutoApplyJob
}]);

async function executeBatchAutoApplyJob(
  command: AiPluginCommand,
  credential: AutoApplyRuntimeCredential
): Promise<AiPluginEvent> {
  return autoApplyEngineRouter.execute(command, credential, command.payload ?? {});
}

async function cleanupStoppedAutoApplyJob(stop: AutoApplyJobStop, credential: AutoApplyRuntimeCredential): Promise<boolean> {
  // Drain any already observed success before disarming monitors. Never race a
  // running observer or a live browser command and call that "stopped".
  if (autoApplyTabReconciliationRunning) return false;
  await reconcilePersistedAutoApplyTabs();
  if (autoApplyTabReconciliationRunning) return false;
  const key = autoApplyTabRefKey(stop.batchId, stop.batchJobId);
  autoApplyStoppingJobs.add(key);
  try {
    if ([...controlledExecutions.values()].some(({ record }) =>
      record.batchId === stop.batchId && record.batchJobId === stop.batchJobId)) return false;
    const stored = await chrome.storage.local.get({
      [autoApplyTabRefsStorageKey]: {}, [AUTO_APPLY_PAGE_SESSIONS_STORAGE_KEY]: {}, [INTERRUPTION_JOURNAL_KEY]: {}
    });
    const ref = asRecord(asRecord(stored[autoApplyTabRefsStorageKey])?.[key]);
    if (ref && (ref.jobId !== stop.jobId || (ref.commandId && ref.commandId !== stop.commandId))) return false;
    const sessions = Object.values(asRecord(stored[AUTO_APPLY_PAGE_SESSIONS_STORAGE_KEY]) ?? {})
      .map(autoApplyPageSessionFromStored).filter((session): session is AutoApplyPageSession => Boolean(session &&
        session.batchId === stop.batchId && session.batchJobId === stop.batchJobId && session.jobId === stop.jobId));
    const journal = Object.values(asRecord(stored[INTERRUPTION_JOURNAL_KEY]) ?? {})
      .map((value) => value as ControlledExecution).filter((record) => record?.commandId === stop.commandId &&
        record.owner === interruptionOwner(credential) && record.batchId === stop.batchId &&
        record.batchJobId === stop.batchJobId && record.jobId === stop.jobId);
    const tabIds = new Set<number>();
    if (ref && Number.isInteger(ref.tabId)) tabIds.add(Number(ref.tabId));
    for (const session of sessions) if (Number.isInteger(session.tabId)) tabIds.add(session.tabId!);
    for (const record of journal) if (Number.isInteger(record.tabId)) tabIds.add(record.tabId);
    for (const tabId of tabIds) {
      if (!applicationCallsSettled(tabId) || autoApplyTabOutcomeReporting.has(tabId) || autoApplyActiveSubmissionTabs.has(tabId)) return false;
      const session = sessions.find((candidate) => candidate.tabId === tabId) ?? null;
      if (!session && !ref && await chrome.tabs.get(tabId).catch(() => undefined)) return false;

      await cleanupSubmissionValidationMonitor(tabId,
        ref?.validationMonitor as FinalSubmitExecutionResult["validationMonitor"]);
      await removeAutoApplyOverlay(tabId);
      if (persistedAutoApplyTabOwnedByPlugin(ref ?? {}, session)) {
        // Keep the durable binding until closure succeeds so retries cannot
        // forget a still-live page. Intent prevents synthetic user interruption.
        rememberAutoApplyTabCloseIntent(tabId, "task_cleanup");
        await closeAutoApplyExecutionSurface(chrome, { tabId });
        if (await chrome.tabs.get(tabId).catch(() => undefined)) return false;
      }
      if (session) await persistAutoApplyPageSession(updateAutoApplyPageSession(session, { tabId: null }));
      await forgetAutoApplyTab(stop.batchId, stop.batchJobId, tabId);
    }
    if (stop.commandId) await forgetControlledExecution(stop.commandId);
    return true;
  } finally {
    autoApplyStoppingJobs.delete(key);
  }
}

async function reconcileStoppedAutoApplyJobs(credential: AutoApplyRuntimeCredential, generation: number): Promise<void> {
  await reconcileAutoApplyJobStops({
    list: () => pendingAutoApplyJobStops(credential),
    active: () => !autoApplySessionTerminated && generation === autoApplyLifecycleGeneration,
    flush: async () => { await flushAutoApplyCompletionOutbox(credential); },
    cleanup: (stop) => cleanupStoppedAutoApplyJob(stop, credential),
    acknowledge: (stop) => acknowledgeAutoApplyJobStop(credential, stop)
  });
}

async function pollAutoApplyOnce(): Promise<void> {
  if (autoApplySessionTerminated) return;
  const generation = autoApplyLifecycleGeneration;
  let ownsExecution = false;
  try {
    // Every alarm can renew health, including while another invocation owns
    // execution or an unacknowledged result remains in the completion outbox.
    const credential = await autoApplyHeartbeat();
    if (autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
    if (!credential) {
      await update({
        autoApplyRuntime: {
          ...defaults.autoApplyRuntime,
          updatedAt: new Date().toISOString()
        }
      });
      return;
    }
    const healthSnapshot = await state();
    if (autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
    if (healthSnapshot.autoApplyRuntime.connection !== "ready") {
      await update({
        autoApplyRuntime: {
          ...healthSnapshot.autoApplyRuntime,
          connection: "ready",
          updatedAt: new Date().toISOString(),
          lastError: null
        }
      });
    }
    // Rebinding can finish during a storage await without owning the execution
    // lock yet. Never let the old credential enter the new account's queue.
    if (autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
    if (autoApplyPollRunning) {
      autoApplyPollPending = true;
      return;
    }
    autoApplyPollRunning = true;
    ownsExecution = true;
    // Persist completion before transport so a timed-out result upload is
    // retried on the next poll rather than re-running the same ATS action.
    await flushAutoApplyCompletionOutbox(credential);
    if (autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
    await reconcileStoppedAutoApplyJobs(credential, generation);
    await reconcileControlledExecutions(credential);
    if (autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
    const snapshot = await state();
    if (autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
    if (snapshot.autoApplyRuntime.connection !== "ready" || snapshot.autoApplyRuntime.lastError) {
      await update({
        autoApplyRuntime: {
          ...snapshot.autoApplyRuntime,
          connection: "ready",
          updatedAt: new Date().toISOString(),
          lastError: null
        }
      });
    }
    if (autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
    const pending = await autoApplyCompletionOutbox.pending(autoApplyCompletionOwner(credential));
    if (autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
    const claimed = await claimAutoApplyCommand(credential, pending.map(entry => entry.commandId));
    if (autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
    if (!claimed) return;
    const claimedCommand = commandWithClaimedExecutionDeadline(
      claimed.command,
      claimed.executionExpiresAt
    );
    let command: AiPluginCommand;
    try {
      command = ensureAiCommand(claimedCommand);
    } catch (error) {
      const expiredEvent = expiredAutoApplyCommandEvent(claimedCommand);
      if (!expiredEvent) throw error;
      await persistAutoApplyCompletion(claimed.commandId, expiredEvent);
      await flushAutoApplyCompletionOutbox(credential);
      autoApplyPollPending = true;
      return;
    }
    const executionAbort = new AbortController();
    autoApplyExecutionAbort = executionAbort;
    const deadlineDelay = Math.max(0, Date.parse(command.expiresAt) - Date.now());
    const deadline = setTimeout(() => {
      executionAbort.abort(new AutoApplyCommandExpiredError());
    }, Number.isFinite(deadlineDelay) ? deadlineDelay : 0);
    const stopWatching = await watchAutoApplyJobStop({
      command, controller: executionAbort, list: () => pendingAutoApplyJobStops(credential),
      active: () => !autoApplySessionTerminated && generation === autoApplyLifecycleGeneration
    });
    try {
      const event = command.type === "browser.execute_batch_auto_apply_job"
        ? await executeBatchAutoApplyJob(command, credential)
        : await executeAiBridgeCommand(command);
      const deadlineExpired = executionAbort.signal.reason instanceof AutoApplyCommandExpiredError ||
        executionAbort.signal.reason instanceof AutoApplyUserInterruptedError ||
        executionAbort.signal.reason instanceof AutoApplyJobStoppedError;
      if (autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration ||
        (executionAbort.signal.aborted && !deadlineExpired)) return;
      await persistAutoApplyCompletion(claimed.commandId, event);
      await flushAutoApplyCompletionOutbox(credential);
      // The completed job may be terminal or parked for a resumable verification
      // while the Server immediately queues another batch item. Poll once more
      // instead of waiting for the 30-second alarm.
      autoApplyPollPending = true;
    } finally {
      stopWatching();
      clearTimeout(deadline);
    }
  } catch (error) {
    if (autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
    const snapshot = await state().catch(() => null);
    if (autoApplySessionTerminated || generation !== autoApplyLifecycleGeneration) return;
    if (snapshot) {
      await update({
        autoApplyRuntime: {
          ...snapshot.autoApplyRuntime,
          connection: error instanceof AutoApplyCommandClaimFenceRejectedError ||
            (error instanceof AutoApplyCommandCompletionRejectedError && ![401, 403].includes(error.status)) ? "ready" : "offline",
          updatedAt: new Date().toISOString(),
          lastError: error instanceof Error ? error.message : "自动投递连接失败"
        }
      }).catch(() => undefined);
    }
  } finally {
    // A health-only alarm must not release another invocation's job or abort controller.
    if (ownsExecution) {
      autoApplyExecutionAbort = undefined;
      autoApplyPollRunning = false;
      for (const resolve of autoApplyPollIdleWaiters) resolve();
      autoApplyPollIdleWaiters.clear();
      if (!autoApplySessionTerminated && generation === autoApplyLifecycleGeneration && autoApplyPollPending) {
        autoApplyPollPending = false;
        void pollAutoApplyOnce();
      }
    }
  }
}

async function recruitingAiDeviceContextResponse(): Promise<ReturnType<typeof recruitingAiDeviceContext> & {
  ok: true;
}> {
  const credential = await autoApplyCredential();
  return {
    ok: true,
    ...recruitingAiDeviceContext(String(chrome.runtime.getManifest().version ?? ""), credential)
  };
}

async function acceptAutoApplyWake(input: unknown, productUrl?: string) {
  const request = asRecord(input);
  if (isAllowedProductBridgeUrl(productUrl) && request?.clientInstanceId) {
    await rememberAutoApplyProductOrigin(productUrl, request.deviceId, request.clientInstanceId);
  }
  return acceptRecruitingAiWake(input, {
    loadCredential: autoApplyCredential,
    startPolling: () => {
      void pollAutoApplyOnce();
    }
  });
}

async function executeAiBridgeCommand(rawCommand: unknown): Promise<AiPluginEvent> {
  const command = ensureAiCommand(rawCommand);
  const payload = command.payload ?? {};
  if (command.type.startsWith("server.")) {
    throw new RecruitingError({
      code: "INVALID_INPUT",
      stage: "transport",
      message: "岗位检索和 Server API 不再经由插件代理",
      retryable: false,
      userAction: "AI 侧应直接调用招聘 Server；插件只接收具体投递 URL 和浏览器 RPA 指令。"
    });
  }
  if (command.type === "browser.start_application_rpa" ||
    command.type === "browser.open_application_url" ||
    command.type === "browser.open_manual_application") {
    const applicationUrl = String(payload.applicationUrl ?? payload.url ?? "");
    if (!/^https?:\/\//i.test(applicationUrl)) throw new Error("投递 URL 必须是 http 或 https 地址");
    const jobId = String(payload.jobId ?? `ai:${Date.now()}`);
    const manualAssist = command.type === "browser.open_manual_application"
      ? createManualAssistFromPayload(payload, applicationUrl)
      : undefined;
    const tab = applicationTabShouldOpenActive(command.type)
      ? await openManualApplicationTab(chrome, applicationUrl)
      : (await openAutoApplyExecutionSurface(chrome, { applicationUrl })).tab;
    if (tab.id === undefined) throw new Error("Chrome 没有返回投递页标签 ID");
    await update({
      activeApplication: {
        jobId,
        tabId: tab.id,
        entryMode: "selected_job",
        status: "opening",
        observation: null,
        mappings: [],
        customAnswers: {},
        missing: [],
        readback: [],
        lastError: null,
        reviewConfirmedAt: null,
        ...(manualAssist ? { manualAssist } : {}),
        rpaTrace: []
      }
    });
    scheduleApplicationInspection(tab.id);
    const eventPayload = {
      jobId,
      tabId: tab.id,
      applicationUrl,
      ...(manualAssist ? {
        mode: "manual_copy",
        fillItemCount: manualAssist.items.length
      } : {})
    };
    return manualAssist
      ? aiBridgeManualEvent(command, "browser.application_opened", "completed", eventPayload, manualAssist)
      : aiBridgeEvent(command, "browser.application_opened", "completed", eventPayload);
  }
  const current = await state();
  const application = current.activeApplication;
  const tabId = Number(payload.tabId ?? application?.tabId);
  if (!Number.isInteger(tabId) || tabId <= 0) throw new Error("没有可执行的招聘投递页标签");
  if (command.type === "browser.one_click_fill_application") {
    if (!application?.manualAssist) {
      throw new RecruitingError({
        code: "FORM_FILL_NOT_READY",
        stage: "form_observation",
        message: "当前没有可一键填写的信息包任务",
        retryable: true,
        userAction: "请先上传 AI 侧导出的标准信息包，或先用 browser.open_manual_application 下发投递页和信息包内容。"
      });
    }
    const requireEntitlement = payload.requireEntitlement !== false;
    const nextState = await fillManualApplicationFromInfoPackage(
      current,
      application,
      requireEntitlement,
      command.idempotencyKey
    );
    const nextApplication = nextState.activeApplication;
    const nextManualAssist = nextApplication?.manualAssist ?? application.manualAssist;
    const success = nextApplication?.status === "ready_for_review";
    const fillPayload = {
      jobId: nextApplication?.jobId ?? application.jobId,
      tabId: nextApplication?.tabId ?? application.tabId,
      status: nextApplication?.status ?? "failed",
      requireEntitlement,
      readbackCount: nextApplication?.readback?.length ?? 0,
      observedFieldCount: nextManualAssist.observedFields.length,
      unmatchedRequiredCount: nextManualAssist.unmatchedRequiredFields.length,
      trace: nextApplication?.rpaTrace ?? [],
      lastError: nextApplication?.lastError ?? null,
      note: success ? "一键填写完成，已停在最终提交前，需用户核对并手动提交。" : "一键填写未通过回读校验，请根据 lastError 处理。"
    };
    return aiBridgeManualEvent(
      command,
      "browser.one_click_fill_completed",
      success ? "completed" : "failed",
      fillPayload,
      nextManualAssist
    );
  }
  if (command.type === "browser.set_manual_application_content") {
    if (!application?.manualAssist) throw new Error("当前没有手动辅助投递任务");
    const nextContent = manualAssistContentFromPayload(payload);
    const nextManualAssist: ManualAssistState = {
      ...application.manualAssist,
      ...(manualJobFromPayload(payload) ? { job: manualJobFromPayload(payload) } : {}),
      ...(typeof payload.note === "string" ? { note: payload.note } : {}),
      items: nextContent.items.length ? nextContent.items : application.manualAssist.items,
      sections: nextContent.sections.length ? nextContent.sections : application.manualAssist.sections,
      updatedAt: new Date().toISOString()
    };
    const observation = application.observation;
    const manualAssist = observation
      ? mergeManualAssistWithObservation(nextManualAssist, observation)
      : withManualInformationRequests(nextManualAssist);
    const nextState = await update({
      activeApplication: {
        ...application,
        manualAssist,
        prefillDraft: manualAssist.items.map((item) => ({
          fieldId: item.fieldId ?? item.id,
          ...(item.stableFieldKey ? { stableFieldKey: item.stableFieldKey } : {}),
          label: item.label,
          semanticKey: item.valueSource,
          value: item.value,
          confidence: item.observed ? 0.9 : 0.65
        })),
        lastError: null
      }
    });
    return aiBridgeManualEvent(command, "browser.manual_application_content_set", "completed", {
      jobId: nextState.activeApplication?.jobId ?? application.jobId,
      itemCount: manualAssist.items.length,
      observedFieldCount: manualAssist.observedFields.length,
      unmatchedRequiredCount: manualAssist.unmatchedRequiredFields.length
    }, manualAssist);
  }
  if (command.type === "browser.observe_application_page" ||
    command.type === "browser.observe_visual_rpa_state") {
    const visualState = await observeVisualRpaState(tabId);
    const observation = visualState.observation as PageObservation;
    if (application?.manualAssist) {
      const nextState = await updateManualApplicationFromObservation(current, application, observation);
      const manualAssist = nextState.activeApplication?.manualAssist;
      if (manualAssist?.informationRequests.length && !observation.loginRequired) {
        return aiBridgeEvent(command, "browser.missing_information_required", "waiting_for_user",
          manualInformationRequestPayload(manualAssist, visualState));
      }
    }
    if (observation.loginRequired) {
      return aiBridgeEvent(command, "browser.login_required", "waiting_for_user", visualState);
    }
    return aiBridgeEvent(command, "browser.visual_rpa_state_observed", "completed", visualState);
  }
  if (command.type === "browser.upload_file_to_field") {
    const observation = await stableApplicationObservation(tabId);
    const field = findObservedField(observation, payload.fieldKey ?? payload.fieldId ?? payload.stableFieldKey);
    if (!field || field.type !== "file") throw new Error("未找到 AI 侧指定的文件上传字段");
    const file = await resumePayloadFromAiFileRef((payload.file ?? {}) as AiSideFileRef);
    const results = await executeApplicationFillInstructions(tabId, observation, [{
        fieldId: field.fieldId,
        ...(field.stableFieldKey ? { stableFieldKey: field.stableFieldKey } : {}),
        selector: field.selector,
        expectedLabel: field.label,
        type: field.type,
        value: file.name,
        file
      } satisfies FillInstruction]);
    return aiBridgeEvent(command, "browser.file_uploaded", results.every(result => result.success) ? "completed" : "failed", {
      jobId: application?.jobId ?? payload.jobId ?? null,
      results,
      next: await observeVisualRpaState(tabId)
    });
  }
  if (command.type === "browser.trigger_site_resume_parser") {
    return aiBridgeEvent(command, "browser.site_resume_parser_triggered", "completed", {
      result: { triggered: false, actionText: null, confirmationText: null, reasonCode: "site_resume_parser_disabled" }
    });
  }
  if (command.type === "browser.execute_observed_page_action") {
    const observation = await stableApplicationObservation(tabId);
    const selected = observation.actions.find(action => action.actionId === String(payload.actionId ?? ""));
    if (!selected) throw new Error("未找到指定的页面动作");
    const execution = await executeInterruptibleScript({
      target: { tabId }, func: executeObservedPageAction, args: [selected]
    });
    const result = execution[0]?.result as PageActionExecutionResult;
    return aiBridgeEvent(command, "browser.page_action_executed", result?.executed ? "completed" : "failed", {
      result, next: await observeVisualRpaState(tabId)
    });
  }
  if (command.type === "browser.fill_form_fields") {
    const observation = await stableApplicationObservation(tabId);
    const skippedOptionalFieldIds: string[] = [];
    const instructions = ((payload.instructions ?? []) as Array<Record<string, unknown>>).flatMap((instruction) => {
      const field = findObservedField(
        observation,
        instruction.fieldId ?? instruction.stableFieldKey ?? instruction.fieldKey ?? instruction.expectedLabel
      );
      if (!field) throw new Error(`未找到字段：${String(instruction.expectedLabel ?? instruction.fieldId ?? "")}`);
      // This generic bridge command has no user-confirmation provenance. Keep
      // optional fields read-only; current-job answers use the stateful form or
      // auto-apply paths, which bind confirmation to an exact field identity.
      if (!field.required) {
        skippedOptionalFieldIds.push(field.fieldId);
        return [];
      }
      return [{
        fieldId: field.fieldId,
        ...(field.stableFieldKey ? { stableFieldKey: field.stableFieldKey } : {}),
        selector: field.selector,
        expectedLabel: String(instruction.expectedLabel ?? field.label),
        semanticKey: typeof instruction.semanticKey === "string" ? instruction.semanticKey : null,
        popupBinding: field.popupBinding,
        type: String(instruction.controlKind ?? instruction.type ?? field.type),
        value: instruction.value as string | boolean
      } satisfies FillInstruction];
    });
    const results = await executeApplicationFillInstructions(tabId, observation, instructions);
    return aiBridgeEvent(command, "browser.fields_filled", "completed", {
      results,
      skippedOptionalFieldIds,
      next: await observeVisualRpaState(tabId)
    });
  }
  if (command.type === "browser.readback_form") {
    return aiBridgeEvent(command, "browser.form_readback", "completed", await observeVisualRpaState(tabId));
  }
  if (command.type === "browser.submit_application_after_ai_confirmation") {
    if (command.safety?.allowFinalSubmit !== true) {
      throw new RecruitingError({
        code: "APPROVAL_INVALID",
        stage: "approval",
        message: "最终提交命令缺少 allowFinalSubmit=true",
        retryable: false,
        userAction: "AI 侧完成用户二次确认后重新下发受限提交命令。"
      });
    }
    const confirmation = payload.aiSideConfirmation as Record<string, unknown> | undefined;
    if (confirmation?.confirmedBy !== "user_via_ai_side_second_confirm") {
      throw new RecruitingError({
        code: "APPROVAL_INVALID",
        stage: "approval",
        message: "最终提交命令缺少 AI 侧二次确认凭证",
        retryable: false,
        userAction: "AI 侧展示最终清单并获得用户确认后再提交。"
      });
    }
    const observation = await stableApplicationObservation(tabId);
    const readbackHash = await observationReadbackHash(observation);
    if (payload.readbackHash && payload.readbackHash !== readbackHash) {
      throw new RecruitingError({
        code: "APPROVAL_INVALID",
        stage: "approval",
        message: "页面内容已变化，读回哈希与 AI 侧确认不一致",
        retryable: false,
        userAction: "AI 侧重新读取表单并让用户确认。"
      });
    }
    if (observation.loginRequired || observation.transientBusy || observation.validationMessages.length) {
      throw new RecruitingError({
        code: "FORM_FILL_VALIDATION_FAILED",
        stage: "submission",
        message: observation.loginRequired
          ? "招聘页面要求登录"
          : observation.transientBusy
            ? "招聘页面仍在上传或解析中"
            : observation.validationMessages.join("；"),
        retryable: true,
        userAction: "AI 侧重新观察页面，必要时提示用户处理。"
      });
    }
    const submitAction = (payload.submitAction ?? {}) as Record<string, unknown>;
    const actionId = String(submitAction.actionId ?? "");
    const expectedText = String(submitAction.expectedText ?? "");
    const action = observation.actions.find((candidate) => candidate.actionId === actionId) ?? null;
    const sliderCredential = command.safety?.allowCaptchaHandling === true ? await autoApplyCredential() : null;
    const result = await executeFinalSubmitWithDebugger(tabId, action, expectedText, undefined,
      command.safety?.allowConsentClick === true, new Set(), sliderCredential &&
      sliderCredential.tenantId === command.tenantId && sliderCredential.userId === command.userId ? {
        ownerId: `${command.tenantId}:${command.userId}`, deviceId: sliderCredential.deviceId,
        pageSessionKey: command.conversationId,
        submissionAttemptId: command.idempotencyKey,
        assertActive: () => assertAutoApplyCommandActive(command), signal: autoApplyExecutionAbort?.signal
      } : undefined);
    return aiBridgeEvent(command, "browser.final_submit_executed", result?.executed ? "completed" : "failed", {
      jobId: application?.jobId ?? payload.jobId ?? null,
      submittedAt: new Date().toISOString(),
      ...result
    }, result?.executed ? null : toPublicError(new Error(result?.error ?? "最终提交未执行"), {
      code: "FORM_FILL_VALIDATION_FAILED",
      stage: "submission",
      retryable: true,
      userAction: "AI 侧重新观察页面并重新确认。"
    }));
  }
  throw new RecruitingError({
    code: "INVALID_INPUT",
    stage: "transport",
    message: `插件不支持的 AI Bridge 命令：${command.type}`,
    retryable: false,
    userAction: "AI 侧按最新 AI-Plugin RPA 接口下发命令。"
  });
}

async function mapApplicationObservation(
  current: ExtensionState,
  observation: PageObservation
): Promise<{
  mappings: ApplicationMapping[];
  prefillDraft: NonNullable<ActiveApplication["prefillDraft"]>;
  evidence: ModelExecutionEvidence[];
}> {
  const resumeValues = resumeSemanticValues(current.resumeKnowledge);
  const availableSemanticKeys = [...new Set([
    ...availableProfileKeys,
    ...Object.keys(resumeValues)
  ])];
  const mapped = await mapFormFieldsWithModel(
    await browserModelSettings(current.modelService),
    observation.fields.map(({ fieldId, stableFieldKey, label, sectionKey, groupIndex, labelPath, controlKind, type, required, options }) => ({
      fieldId, stableFieldKey, label, sectionKey, groupIndex, labelPath, controlKind, type, required, options
    })),
    availableSemanticKeys
  );
  const prefill = await prepareFormPrefillWithModel(
    await browserModelSettings(current.modelService),
    observation.fields
      .filter((field) => field.required)
      .map(({ fieldId, stableFieldKey, label, sectionKey, groupIndex, labelPath, controlKind, type, required, options }) => ({
        fieldId, stableFieldKey, label, sectionKey, groupIndex, labelPath, controlKind, type, required, options
      })),
    resumeValues
  );
  const byField = new Map(observation.fields.map((field) => [field.fieldId, field]));
  const prefillMappings: ApplicationMapping[] = prefill.candidates.map((candidate) => ({
    fieldId: candidate.fieldId,
    ...(byField.get(candidate.fieldId)?.stableFieldKey
      ? { stableFieldKey: byField.get(candidate.fieldId)!.stableFieldKey }
      : {}),
    semanticKey: candidate.semanticKey,
    confidence: candidate.confidence,
    source: "resume",
    evidenceRef: candidate.semanticKey
  }));
  const mappings = deterministicFieldMappings(
    observation,
    [...prefillMappings, ...mapped.mappings.filter((entry) =>
      !prefillMappings.some((candidate) => candidate.fieldId === entry.fieldId))],
    new Set(availableSemanticKeys)
  );
  const acceptedMappingPairs = new Set(mappings.map((mapping) =>
    `${mapping.fieldId}\u0000${mapping.semanticKey}`
  ));
  return {
    mappings,
    prefillDraft: prefill.candidates
      .filter((candidate) => acceptedMappingPairs.has(`${candidate.fieldId}\u0000${candidate.semanticKey}`))
      .map((candidate) => ({
      fieldId: candidate.fieldId,
      ...(byField.get(candidate.fieldId)?.stableFieldKey
        ? { stableFieldKey: byField.get(candidate.fieldId)!.stableFieldKey }
        : {}),
      label: byField.get(candidate.fieldId)?.label ?? candidate.fieldId,
      semanticKey: candidate.semanticKey,
      value: candidate.proposedValue,
      confidence: candidate.confidence
      })),
    evidence: [mapped.evidence, prefill.evidence]
  };
}

function remapCustomAnswers(
  previousObservation: PageObservation,
  previousMappings: ApplicationMapping[],
  nextObservation: PageObservation,
  nextMappings: ApplicationMapping[],
  answers: Record<string, string>
): Record<string, string> {
  const previousMappingById = new Map(previousMappings.map((mapping) => [mapping.fieldId, mapping]));
  const nextMappingById = new Map(nextMappings.map((mapping) => [mapping.fieldId, mapping]));
  const previousFields = new Map(previousObservation.fields.map((field) => [field.fieldId, field]));
  const previousFieldsByStableKey = new Map(previousObservation.fields
    .filter((field) => field.stableFieldKey)
    .map((field) => [field.stableFieldKey!, field]));
  const previousAnswerByStableKey = new Map<string, string>();
  for (const previousField of previousObservation.fields) {
    const value = answers[previousField.fieldId] ??
      (previousField.stableFieldKey ? answers[previousField.stableFieldKey] : undefined);
    if (value && previousField.stableFieldKey) previousAnswerByStableKey.set(previousField.stableFieldKey, value);
  }
  const migrated: Record<string, string> = {};
  for (const nextField of nextObservation.fields) {
    const direct = answers[nextField.fieldId];
    if (direct) {
      const previousField = previousFields.get(nextField.fieldId);
      if (previousField && fieldsShareStableIdentity(previousField, nextField)) {
        migrated[nextField.fieldId] = direct;
        continue;
      }
    }
    if (nextField.stableFieldKey) {
      const stableAnswer = previousAnswerByStableKey.get(nextField.stableFieldKey);
      if (stableAnswer) {
        migrated[nextField.fieldId] = stableAnswer;
        migrated[nextField.stableFieldKey] = stableAnswer;
        continue;
      }
    }
    const nextSemanticKey = nextMappingById.get(nextField.fieldId)?.semanticKey;
    const matched = previousObservation.fields.find((previousField) => {
      const previousSemanticKey = previousMappingById.get(previousField.fieldId)?.semanticKey;
      return Boolean(answers[previousField.fieldId]) && (
        (nextSemanticKey && previousSemanticKey === nextSemanticKey) ||
        fieldsShareStableIdentity(previousField, nextField)
      );
    });
    if (matched) migrated[nextField.fieldId] = answers[matched.fieldId]!;
    const stableMatched = nextField.stableFieldKey ? previousFieldsByStableKey.get(nextField.stableFieldKey) : null;
    if (stableMatched && answers[stableMatched.fieldId]) migrated[nextField.fieldId] = answers[stableMatched.fieldId]!;
  }
  return migrated;
}

async function inspectActiveApplication(tabId: number): Promise<ExtensionState> {
  const current = await state();
  const application = current.activeApplication;
  if (!application || application.tabId !== tabId) return current;
  const observation = await observeApplicationPageWithControlAdapters(tabId);
  if (!observation) throw new Error("招聘页面没有返回表单快照");
  if (application.manualAssist) {
    return updateManualApplicationFromObservation(current, application, observation);
  }
  if (observation.loginRequired) {
    const jobs = current.jobs.map((job) => job.id === application.jobId ? {
      ...job,
      applicationForm: {
        status: "login_required" as const,
        fingerprint: observation.fingerprint,
        fields: null,
        observedAt: observation.observedAt
      }
    } : job);
    void syncObservedForm(current, application, observation, []);
    return update({
      jobs,
      activeApplication: {
        ...application,
        status: "login_required",
        observation,
        mappings: [],
        missing: [],
        readback: [],
        lastError: null,
        reviewConfirmedAt: null
      }
    });
  }
  if (!observation.formDetected) {
    return update({
      activeApplication: {
        ...application,
        status: "failed",
        observation,
        mappings: [],
        missing: [],
        readback: [],
        lastError: "当前页面未检测到招聘申请表单。请先进入该岗位的“立即申请/投递”页面，再读取当前页面。",
        reviewConfirmedAt: null
      }
    });
  }
  if (current.modelService.mode === "managed_gateway") {
    void syncObservedForm(current, application, observation, []);
    return update({
      activeApplication: {
        ...application,
        status: "ready_to_fill",
        observation,
        mappings: [],
        prefillDraft: [],
        missing: [],
        readback: [],
        lastError: null,
        reviewConfirmedAt: null
      }
    });
  }
  const mapped = await mapApplicationObservation(current, observation);
  const mappings = mapped.mappings;
  const savedFileIds = new Set(
    observation.fields.filter((field) => field.type === "file" && (
      (Boolean(current.fileAssets.identityPhoto) && /照片|头像|证件照|photo/i.test(field.label)) ||
      (Boolean(current.fileAssets.resume) && /简历|附件|resume|cv/i.test(field.label))
    )).map((field) => field.fieldId)
  );
  const missing = missingFields(
    observation,
    mappings,
    current.candidateProfile,
    application.customAnswers,
    current.resumeKnowledge,
    savedFileIds
  );
  const mappingByField = new Map(mappings.map((mapping) => [mapping.fieldId, mapping]));
  const jobs = current.jobs.map((job) => job.id === application.jobId ? {
    ...job,
    applicationForm: {
      status: observation.fields.length ? "observed" as const : "not_applicable" as const,
      fingerprint: observation.fingerprint,
      fields: observation.fields.length ? observation.fields.map((field) => ({
        fieldId: field.fieldId,
        label: field.label,
        type: field.type,
        required: field.required,
        options: field.options,
        semanticKey: mappingByField.get(field.fieldId)?.semanticKey ?? null
      })) : null,
      observedAt: observation.observedAt
    }
  } : job);
  void syncObservedForm(current, application, observation, mappings);
  return update({
    jobs,
    modelExecutions: mapped.evidence.reduce(withExecution, current.modelExecutions),
    activeApplication: {
      ...application,
      status: missing.length ? "information_required" : "ready_to_fill",
      observation,
      mappings,
      prefillDraft: mapped.prefillDraft,
      missing,
      readback: [],
      lastError: null,
      reviewConfirmedAt: null
    }
  });
}

async function refreshApplicationReview(tabId: number, confirm: boolean): Promise<ExtensionState> {
  const current = await state();
  const application = current.activeApplication;
  if (!application || application.tabId !== tabId) throw new Error("当前投递任务已失效");
  const observation = await observeApplicationPageWithControlAdapters(tabId);
  if (!observation?.formDetected) throw new Error("当前页面已不再显示招聘申请表单");
  const failures = requiredFieldFailures(observation.fields);
  const validationFailure = [
    ...failures.map((field) => `必填未完成：${field.label}`),
    ...observation.validationMessages
  ].join("；");
  return update({
    activeApplication: {
      ...application,
      status: validationFailure ? "failed" : "ready_for_review",
      observation,
      lastError: validationFailure || null,
      reviewConfirmedAt: validationFailure || !confirm ? null : new Date().toISOString()
    }
  });
}

function scheduleApplicationInspection(tabId: number): void {
  void (async () => {
    for (const delayMs of [2_000, 4_000, 7_000]) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const current = await state();
      if (current.activeApplication?.tabId !== tabId ||
        current.activeApplication.status !== "opening") return;
      const observation = await observeApplicationPageWithControlAdapters(tabId);
      if (!observation || (!observation.loginRequired && !observation.formDetected)) continue;
      await inspectActiveApplication(tabId);
      return;
    }
  })().catch(async (error: unknown) => {
    const current = await state();
    if (current.activeApplication?.tabId !== tabId ||
      current.activeApplication.status !== "opening") return;
    await update({
      activeApplication: {
        ...current.activeApplication,
        status: "failed",
        lastError: toPublicError(error).message
      }
    });
  });
}

async function ensureBridgeContentScript(tabId: number, knownUrl?: string): Promise<void> {
  const url = knownUrl || (await chrome.tabs.get(tabId)).url || "";
  if (!isAllowedBridgeUrl(url)) return;
  await executeInterruptibleScript({
    target: { tabId },
    files: ["bridge-content.js"]
  });
}

async function ensureBridgeContentForExistingTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(async (tab) => {
    if (typeof tab.id !== "number" || !isAllowedBridgeUrl(tab.url)) return;
    try {
      await ensureBridgeContentScript(tab.id, tab.url);
    } catch {
      // Static manifest injection remains the primary path. A tab may disappear
      // between query and injection; that must not fail service-worker startup.
    }
  }));
}

chrome.tabs.onRemoved.addListener((tabId) => {
  interruptControlledExecution(tabId, "tab_closed");
  void markClosedMonitoredTabForReconciliation(tabId).catch(() => undefined);
});

async function persistControlledReload(event: chrome.webNavigation.WebNavigationTransitionCallbackDetails): Promise<void> {
  if (event.frameId !== 0 || event.transitionType !== "reload") return;
  const stored = await chrome.storage.local.get({ [INTERRUPTION_JOURNAL_KEY]: {} });
  for (const value of Object.values(asRecord(stored[INTERRUPTION_JOURNAL_KEY]) ?? {})) {
    const record = value as ControlledExecution;
    if (record?.schemaVersion !== "controlled-execution.v1" || !isControlledReload(event, record) || controlledExecutions.has(record.tabId)) continue;
    const session = await recalledAutoApplyPageSession(record.batchId, record.batchJobId, record.jobId, record.applicationUrl);
    if (!session || session.tabId !== record.tabId || session.terminalOutcome ||
      !["observing", "filling", "validating", "submit_ready"].includes(session.stage)) continue;
    await writeControlledExecution({ ...record, interruptionKind: "page_reloaded", interruptedAt: new Date(event.timeStamp).toISOString() });
  }
}

chrome.webNavigation.onCommitted.addListener((event) => {
  const active = controlledExecutions.get(event.tabId);
  if (active && isControlledReload(event, active.record)) interruptControlledExecution(event.tabId, "page_reloaded");
  else if (!active) void persistControlledReload(event).catch(() => undefined);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const terminalNavigation = changeInfo.url
    ? autoApplyTerminalNavigationFromUrl(changeInfo.url)
    : null;
  if (terminalNavigation) {
    // Set the in-memory journal synchronously. Moka can close the tab before a
    // storage write or DOM read finishes, and tabs.onRemoved must still prefer
    // this authoritative success route over a synthetic close failure.
    autoApplyTerminalNavigationByTabId.set(tabId, terminalNavigation);
    void persistObservedAutoApplyTerminalNavigation(tabId, terminalNavigation)
      .catch(() => undefined)
      .finally(() => reconcilePersistedAutoApplyTabs(tabId).catch(() => undefined));
  } else if (changeInfo.url || changeInfo.status === "complete") {
    void reconcilePersistedAutoApplyTabs(tabId).catch(() => undefined);
  }
  if (changeInfo.status !== "complete") return;
  void ensureBridgeContentScript(tabId, tab.url).catch(() => undefined);
  void state().then((current) => {
    if (current.activeApplication?.tabId !== tabId) return;
    return inspectActiveApplication(tabId);
  }).catch(async (error: unknown) => {
    const current = await state();
    if (current.activeApplication?.tabId !== tabId) return;
    await update({
      activeApplication: {
        ...current.activeApplication,
        status: "failed",
        lastError: toPublicError(error).message
      }
    });
  });
});

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(Object.keys(persistentDefaults));
  if (Object.keys(existing).length === 0) {
    await chrome.storage.local.set(persistentDefaults);
  }
  await removeLegacyLocalJobState();
  await migrateModelDefaults();
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await chrome.alarms.create(autoApplyAlarmName, { periodInMinutes: 0.5 });
  void ensureBridgeContentForExistingTabs();
  void reconcilePersistedAutoApplyTabs();
  void pollAutoApplyOnce();
});

void migrateModelDefaults();
void removeLegacyLocalJobState();
void chrome.alarms.create(autoApplyAlarmName, { periodInMinutes: 0.5 });
void ensureBridgeContentForExistingTabs();
void reconcilePersistedAutoApplyTabs();
void pollAutoApplyOnce();

chrome.runtime.onStartup.addListener(() => {
  interruptionBrowserStartup = true;
  void chrome.alarms.create(autoApplyAlarmName, { periodInMinutes: 0.5 });
  void ensureBridgeContentForExistingTabs();
  void reconcilePersistedAutoApplyTabs();
  void pollAutoApplyOnce();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === autoApplyAlarmName || alarm.name.startsWith(submissionReceiptAlarmPrefix)) {
    void reconcilePersistedAutoApplyTabs();
  }
  if (alarm.name === autoApplyAlarmName) {
    void pollAutoApplyOnce();
  }
});

chrome.runtime.onMessageExternal.addListener((message: unknown, sender, respond) => {
  if (!isAllowedProductBridgeUrl(sender.url)) {
    respond({ ok: false, error: "当前页面无权调用产品设备桥" });
    return false;
  }
  const input = message as {
    type?: string;
    bootstrapToken?: string;
    clientInstanceId?: string;
    gatewayBaseUrl?: string;
    deviceId?: unknown;
    groupId?: unknown;
    batchId?: unknown;
  };
  if (input.type === "RECRUITING_AI_PLUGIN_INFO") {
    respond(recruitingAiPluginInfo());
    return false;
  }
  if (input.type === "RECRUITING_AI_DEVICE_CONTEXT") {
    recruitingAiDeviceContextResponse().then(respond).catch((error: unknown) => {
      respond({ ok: false, error: error instanceof Error ? error.message : "读取设备上下文失败" });
    });
    return true;
  }
  if (input.type === "RECRUITING_AUTO_APPLY_WAKE") {
    acceptAutoApplyWake(input, sender.url).then(respond).catch((error: unknown) => {
      respond({ ok: false, error: error instanceof Error ? error.message : "唤醒自动投递失败" });
    });
    return true;
  }
  if (input.type === "RECRUITING_AI_ACCOUNT_LOGOUT") {
    terminateLocalAutoApplySession().then(() => respond({ ok: true, status: "terminated" })).catch((error: unknown) => {
      respond({ ok: false, error: error instanceof Error ? error.message : "停止本地自动投递失败" });
    });
    return true;
  }
  if (input.type !== "RECRUITING_DEVICE_BOOTSTRAP" || !input.bootstrapToken) return false;
  bindLocalAutoApplySession({
    bootstrapToken: String(input.bootstrapToken),
    gatewayBaseUrl: input.gatewayBaseUrl ? String(input.gatewayBaseUrl) : undefined,
    productOrigin: isAllowedProductBridgeUrl(sender.url) ? sender.url : undefined,
    productClientInstanceId: typeof input.clientInstanceId === "string" ? input.clientInstanceId : undefined
  }).then((credential) => {
    respond({ ok: true, deviceId: credential.deviceId, status: "ready" });
  }).catch((error: unknown) => {
    respond({ ok: false, error: error instanceof Error ? error.message : "设备自动绑定失败" });
  });
  return true;
});

chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  const input = message as { type?: string; [key: string]: unknown };
  void (async () => {
    if (input.type === "SITE_POLICY_RECEIPT_OBSERVED") {
      const captured = await captureBoundSitePolicyObservation(input.token, sender);
      respond({ ok: true, captured });
      if (captured) void reconcilePersistedAutoApplyTabs(sender.tab!.id!).catch(() => undefined);
      return;
    }
    if (input.type === "STATE_GET") return respond({ ok: true, state: await state() });
    if (input.type === "RECRUITING_AI_PLUGIN_INFO") return respond(recruitingAiPluginInfo());
    if (input.type === "RECRUITING_AI_DEVICE_CONTEXT") {
      return respond(await recruitingAiDeviceContextResponse());
    }
    if (input.type === "LOCAL_AUTO_APPLY_WAKE") return respond(await acceptAutoApplyWake(input, sender.url));
    if (input.type === "LOCAL_ACCOUNT_LOGOUT") {
      await terminateLocalAutoApplySession();
      return respond({ ok: true, status: "terminated" });
    }
    if (input.type === "LOCAL_DEVICE_BOOTSTRAP") {
      const bootstrapToken = String(input.bootstrapToken ?? "").trim();
      if (!bootstrapToken) throw new Error("缺少一次性 bootstrapToken");
      const credential = await bindLocalAutoApplySession({
        bootstrapToken,
        gatewayBaseUrl: input.gatewayBaseUrl ? String(input.gatewayBaseUrl) : undefined,
        productOrigin: isAllowedProductBridgeUrl(sender.url) ? sender.url : undefined,
        productClientInstanceId: typeof input.clientInstanceId === "string" ? input.clientInstanceId : undefined
      });
      return respond({ ok: true, deviceId: credential.deviceId, status: "ready" });
    }
	    if (input.type === "AUTO_APPLY_LOCAL_CONTROL") {
	      const batchId = String(input.batchId ?? "");
	      const requested = String(input.action ?? "");
	      const action = requested === "pause" || requested === "resume" || requested === "cancel"
	        ? requested
	        : null;
	      if (!batchId || !action) throw new Error("批次控制命令不完整");
	      const credential = await autoApplyCredential();
	      if (!credential) throw new Error("插件尚未完成设备绑定");
	      localAutoApplyControl.set(batchId, action === "resume" ? "continue" : action);
	      await setAutoApplyControl(credential, batchId, action);
	      const snapshot = await state();
	      await update({
	        autoApplyRuntime: {
	          ...snapshot.autoApplyRuntime,
	          status: action === "pause" ? "paused" : action === "resume" ? "running" : "cancelled",
	          updatedAt: new Date().toISOString()
	        }
	      });
	      return respond({ ok: true, batchId, action });
	    }
	    if (input.type === "ENTITLEMENT_REFRESH") {
	      return respond({ ok: true, state: await refreshEntitlementState() });
	    }
	    if (input.type === "ENTITLEMENT_ACTIVATE") {
	      return respond({ ok: true, state: await activateEntitlement(String(input.activationCode ?? "")) });
	    }
	    if (input.type === "ENTITLEMENT_CHECKOUT") {
	      return respond({ ok: true, state: await openEntitlementCheckout() });
	    }
	    if (input.type === "INFO_PACKAGE_UPLOAD") {
	      const current = await state();
	      const rawPackage = typeof input.packageData === "string"
	        ? JSON.parse(String(input.packageData))
	        : input.packageData;
	      const payload = asRecord(rawPackage);
	      if (!payload) {
	        throw new RecruitingError({
	          code: "INVALID_INPUT",
	          stage: "resume",
	          message: "信息包不是有效 JSON 对象",
	          retryable: true,
	          userAction: "请上传 AI 侧导出的 .zcresume.json 标准信息包。"
	        });
	      }
	      const fileName = String(input.fileName ?? "candidate.zcresume.json").trim() || "candidate.zcresume.json";
	      const candidatePackage = createCandidatePackageFromPayload(payload, fileName);
	      const resumeKnowledge = resumeKnowledgeFromCandidateInfoPackage(payload);
	      const profileValues = {
	        ...(resumeKnowledge ? resumeSemanticValues(resumeKnowledge) : {}),
	        ...profileValuesFromCandidateInfoPackage(payload)
	      };
	      return respond({
	        ok: true,
	        state: await update({
	          candidatePackage,
	          activeApplication: null,
	          ...(resumeKnowledge ? { resumeKnowledge } : {}),
	          candidateProfile: {
	            ...current.candidateProfile,
	            values: {
	              ...current.candidateProfile.values,
	              ...profileValues
	            },
	            updatedAt: new Date().toISOString()
	          }
	        })
	      });
	    }
	    if (input.type === "INFO_PACKAGE_CONFIRM") {
	      const current = await state();
	      if (!current.candidatePackage) {
	        throw new RecruitingError({
	          code: "INVALID_INPUT",
	          stage: "resume",
	          message: "尚未上传标准信息包",
	          retryable: true,
	          userAction: "请先上传 AI 侧导出的 .zcresume.json 标准信息包。"
	        });
	      }
	      return respond({
	        ok: true,
	        state: await update({
	          candidatePackage: {
	            ...current.candidatePackage,
	            status: "confirmed",
	            confirmedAt: new Date().toISOString()
	          }
	        })
	      });
	    }
	    if (input.type === "INFO_PACKAGE_CLEAR") {
	      return respond({
	        ok: true,
	        state: await update({
	          candidatePackage: null,
	          activeApplication: null,
	          resumeKnowledge: null,
	          candidateProfile: defaults.candidateProfile
	        })
	      });
	    }
	    if (input.type === "MANUAL_ASSIST_SUPPLEMENT") {
	      const current = await state();
	      const application = current.activeApplication;
	      const candidatePackage = current.candidatePackage;
	      if (!application?.manualAssist && !candidatePackage?.manualAssist) {
	        throw new RecruitingError({
	          code: "INVALID_INPUT",
	          stage: "missing_information",
	          message: "当前没有可补充的信息包",
	          retryable: true,
	          userAction: "请先上传标准信息包，并读取当前招聘申请页。"
	        });
	      }
	      const patch: Partial<ExtensionState> = {};
	      if (candidatePackage?.manualAssist) {
	        patch.candidatePackage = {
	          ...candidatePackage,
	          manualAssist: supplementManualAssistAnswers(candidatePackage.manualAssist, input.answers)
	        };
	      }
	      if (application?.manualAssist) {
	        let manualAssist = supplementManualAssistAnswers(application.manualAssist, input.answers);
	        if (application.observation) {
	          manualAssist = mergeManualAssistWithObservation(manualAssist, application.observation);
	        }
	        const nextStatus: ActiveApplication["status"] = application.observation?.loginRequired
	          ? "login_required"
	          : application.observation && (application.observation.formDetected || application.observation.fields.length)
	            ? manualAssist.informationRequests.length ? "information_required" : "ready_to_fill"
	            : application.status;
	        patch.activeApplication = {
	          ...application,
	          status: nextStatus,
	          manualAssist,
	          prefillDraft: manualAssist.items.map((item) => ({
	            fieldId: item.fieldId ?? item.id,
	            ...(item.stableFieldKey ? { stableFieldKey: item.stableFieldKey } : {}),
	            label: item.label,
	            semanticKey: item.valueSource,
	            value: item.value,
	            confidence: item.observed ? 0.9 : 0.65
	          })),
	          lastError: null,
	          reviewConfirmedAt: null
	        };
	      }
	      return respond({ ok: true, state: await update(patch) });
	    }
	    if (input.type === "AI_BRIDGE_COMMAND") {
	      const command = ensureAiCommand(input.command);
	      if (command.type === "browser.execute_batch_auto_apply_job") {
	        const senderUrl = String(sender.url ?? "");
	        const localSender = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//i.test(senderUrl);
	        if (!localSender || command.payload?.localValidation !== true) {
	          throw new RecruitingError({
	            code: "AUTHORIZATION_REQUIRED",
	            stage: "approval",
	            message: "批量自动投递只能由正式设备队列执行",
	            retryable: false,
	            userAction: "请由 AI Offer 服务端创建正式批次。"
	          });
	        }
	        const credential = await autoApplyCredential();
	        if (!credential) throw new Error("插件尚未完成设备绑定");
	        return respond({ ok: true, event: await executeBatchAutoApplyJob(command, credential) });
	      }
	      return respond({ ok: true, event: await executeAiBridgeCommand(command) });
	    }
    if (input.type === "PLAN_CREATE") {
      const current = await state();
      const prompt = String(input.prompt ?? "").trim();
      if (!prompt) throw new Error("请填写求职要求");
      const proposal = await parseSearchPromptWithModel(
        await browserModelSettings(current.modelService),
        prompt
      );
      const plan = createSearchPlanFromFilters(prompt, proposal.filters);
      return respond({
        ok: true,
        state: await update({
          plan,
          jobs: [],
          selectedJobIds: [],
          lastDiscovery: null,
          modelExecutions: withExecution(current.modelExecutions, proposal.evidence),
          modelService: {
            ...current.modelService,
            connectionStatus: "connected"
          }
        })
      });
    }
    if (input.type === "PLAN_REFINE") {
      const current = await state();
      if (!current.plan) throw new Error("请先创建检索范围");
      const prompt = String(input.prompt ?? "").trim();
      const proposal = await parseSearchPromptWithModel(
        await browserModelSettings(current.modelService),
        prompt
      );
      const plan = refineSearchPlanFromFilters(current.plan, prompt, proposal.filters);
      return respond({
        ok: true,
        state: await update({
          plan,
          jobs: [],
          selectedJobIds: [],
          lastDiscovery: null,
          modelExecutions: withExecution(current.modelExecutions, proposal.evidence),
          modelService: {
            ...current.modelService,
            connectionStatus: "connected"
          }
        })
      });
    }
    if (input.type === "START_SEARCH") {
      const current = await state();
      if (!current.plan) throw new Error("请先创建检索范围");
      let result: Awaited<ReturnType<CloudServiceClient["searchJobs"]>>;
      try {
        result = await (await configuredCloudClient(current.cloudService)).searchJobs(
          current.plan,
          AbortSignal.timeout(30_000)
        );
      } catch (error) {
        throw cloudError(error, "search");
      }
      const lastDiscovery: DiscoveryRun = {
        planId: current.plan.id,
        planVersion: current.plan.version,
        jobs: result.jobs,
        sourceCounts: { "cloud-job-index": result.jobs.length },
        sourceErrors: {},
        coverage: {
          mode: "cloud_index",
          successfulSources: ["cloud-job-index"],
          failedSources: [],
          fullWebClaimAllowed: false,
          receipts: []
        },
        knowledge: {
          storage: "shared_cloud",
          persisted: true,
          receipts: []
        },
        ranking: {
          method: "cloud_relevance_v2",
          scores: result.scores,
          reasons: Object.fromEntries(result.jobs.map((job) => [job.id, "云端岗位索引相关度排序"]))
        },
        completedAt: new Date().toISOString()
      };
      return respond({
        ok: true,
        state: await update({
          jobs: result.jobs,
          selectedJobIds: [],
          lastDiscovery,
          cloudService: {
            ...current.cloudService,
            connectionStatus: "connected",
            indexRevision: result.indexRevision,
            indexUpdatedAt: result.indexUpdatedAt
          }
        })
      });
    }
    if (input.type === "FILE_ASSET_SAVE_IDENTITY_PHOTO") {
      const current = await state();
      const payload = input.file as ResumeFilePayload | undefined;
      if (!payload?.name || !payload.base64 || !payload.type.startsWith("image/")) {
        throw new Error("证件照必须是有效图片文件");
      }
      const approximateSize = Math.floor(payload.base64.length * 0.75);
      if (approximateSize > 5 * 1024 * 1024) throw new Error("证件照不能超过 5MB");
      await chrome.storage.local.set({ [identityPhotoPayloadStorageKey]: payload });
      return respond({
        ok: true,
        state: await update({
          fileAssets: {
            ...current.fileAssets,
            identityPhoto: {
              name: payload.name,
              type: payload.type,
              size: approximateSize,
              updatedAt: new Date().toISOString(),
              storage: "extension_local"
            }
          }
        })
      });
    }
    if (input.type === "FILE_ASSET_SAVE_RESUME") {
      const current = await state();
      const payload = input.file as ResumeFilePayload | undefined;
      if (!payload?.name || !payload.base64 ||
        !(/pdf|officedocument|text\//i.test(payload.type) || /\.(pdf|docx|txt|md)$/i.test(payload.name))) {
        throw new Error("简历必须是 PDF、DOCX、TXT 或 Markdown 文件");
      }
      const approximateSize = Math.floor(payload.base64.length * 0.75);
      if (approximateSize > 15 * 1024 * 1024) throw new Error("简历不能超过 15MB");
      const parsed = await parseResumeLocally(payload);
      const parsedProfileValues = resumeSemanticValues(parsed.snapshot);
      await chrome.storage.local.set({ [resumePayloadStorageKey]: payload });
      return respond({
        ok: true,
        state: await update({
          resumeKnowledge: parsed.snapshot,
          candidateProfile: {
            ...current.candidateProfile,
            values: {
              ...current.candidateProfile.values,
              ...parsedProfileValues
            },
            updatedAt: new Date().toISOString()
          },
          fileAssets: {
            ...current.fileAssets,
            resume: {
              name: payload.name,
              type: payload.type,
              size: approximateSize,
              updatedAt: new Date().toISOString(),
              storage: "extension_local",
              parser: parsed.parser,
              parsedAt: new Date().toISOString()
            }
          }
        })
      });
    }
    if (input.type === "FILE_ASSET_DELETE_RESUME") {
      const current = await state();
      await chrome.storage.local.remove(resumePayloadStorageKey);
      return respond({
        ok: true,
        state: await update({
          fileAssets: { ...current.fileAssets, resume: null }
        })
      });
    }
    if (input.type === "FILE_ASSET_DELETE_IDENTITY_PHOTO") {
      const current = await state();
      await chrome.storage.local.remove(identityPhotoPayloadStorageKey);
      return respond({
        ok: true,
        state: await update({ fileAssets: { ...current.fileAssets, identityPhoto: null } })
      });
    }
    if (input.type === "JOB_SELECT") {
      const current = await state();
      const jobId = String(input.jobId ?? "");
      if (!current.jobs.some((job) => job.id === jobId)) {
        throw new Error("岗位不存在或已失效");
      }
      const selected = new Set(current.selectedJobIds);
      if (input.selected === true) selected.add(jobId);
      else selected.delete(jobId);
      return respond({
        ok: true,
        state: await update({ selectedJobIds: [...selected] })
      });
    }
    if (input.type === "BRIDGE_CONFIGURE") {
      const deviceBridgeUrl = String(input.url ?? "").trim();
      return respond({
        ok: true,
        state: await update({
          deviceBridgeUrl,
          connectionStatus: deviceBridgeUrl ? "offline" : "not_configured"
        })
      });
    }
    if (input.type === "CLOUD_CONFIGURE") {
      const current = await state();
      const baseUrl = cloudBaseUrl(input.baseUrl);
      const tenantId = String(input.tenantId ?? "").trim();
      if (!tenantId) throw new Error("请填写招聘云服租户 ID");
      const accessToken = String(input.accessToken ?? "").trim();
      if (accessToken) await chrome.storage.local.set({ [cloudAccessTokenStorageKey]: accessToken });
      if (input.clearAccessToken === true) {
        await chrome.storage.local.remove(cloudAccessTokenStorageKey);
      }
      const tokenConfigured = input.clearAccessToken === true
        ? false
        : Boolean(accessToken || current.cloudService.tokenConfigured);
      return respond({
        ok: true,
        state: await update({
          cloudService: {
            ...current.cloudService,
            baseUrl,
            tenantId,
            deviceId: current.cloudService.deviceId || crypto.randomUUID(),
            tokenConfigured,
            connectionStatus: tokenConfigured ? "offline" : "not_configured"
          }
        })
      });
    }
    if (input.type === "CLOUD_TEST") {
      const current = await state();
      const capabilities = await testCloudService(current.cloudService);
      return respond({
        ok: true,
        state: await update({
          cloudService: {
            ...current.cloudService,
            connectionStatus: "connected",
            indexRevision: capabilities.indexRevision,
            indexUpdatedAt: capabilities.indexUpdatedAt
          }
        })
      });
    }
    if (input.type === "MODEL_CONFIGURE") {
      const mode = String(input.mode) as ModelServiceMode;
      if (!["local", "direct", "unified_gateway", "managed_gateway"].includes(mode)) {
        throw new Error("不支持的模型服务模式");
      }
      const current = await state();
      if (mode === "managed_gateway") {
        const serviceCode = String(input.serviceCode ?? input.visionModel ?? "zhencai").trim();
        if (serviceCode !== "zhencai") throw new Error("当前内置模型服务代码只支持 zhencai");
        await chrome.storage.local.remove(modelApiKeyStorageKey);
        return respond({
          ok: true,
          state: await update({
            modelService: {
              ...defaults.modelService,
              serviceCode,
              connectionStatus: "connected"
            }
          })
        });
      }
      const modelService: ModelServiceSettings = {
        mode,
        serviceCode: "",
        baseUrl: modelBaseUrl(input.baseUrl, mode),
        textModel: String(input.textModel ?? "").trim(),
        visionModel: String(input.visionModel ?? "").trim(),
        apiKeyConfigured: current.modelService.apiKeyConfigured,
        connectionStatus: "offline"
      };
      if (!modelService.textModel) throw new Error("请填写文本模型名称");
      const apiKey = String(input.apiKey ?? "").trim();
      if (apiKey) await chrome.storage.local.set({ [modelApiKeyStorageKey]: apiKey });
      if (input.clearApiKey === true) {
        await chrome.storage.local.remove(modelApiKeyStorageKey);
      }
      return respond({
        ok: true,
        state: await update({ modelService })
      });
    }
    if (input.type === "MODEL_SERVICE_CODE_SAVE") {
      const serviceCode = String(input.serviceCode ?? "").trim();
      if (serviceCode !== "zhencai") throw new Error("当前内置模型服务代码只支持 zhencai");
      await chrome.storage.local.remove(modelApiKeyStorageKey);
      return respond({
        ok: true,
        state: await update({
          modelService: {
            ...defaults.modelService,
            serviceCode,
            connectionStatus: "connected"
          }
        })
      });
    }
    if (input.type === "MODEL_TEST") {
      const current = await state();
      if (current.modelService.mode !== "managed_gateway" &&
        (!current.modelService.baseUrl || !current.modelService.textModel)) {
        throw new Error("请先保存模型服务地址和模型名称");
      }
      await testModelService(current.modelService);
      return respond({
        ok: true,
        state: await update({
          modelService: {
            ...current.modelService,
            connectionStatus: "connected"
          }
        })
      });
    }
    if (input.type === "OPEN_JOB") {
      const url = String(input.url ?? "");
      const jobId = String(input.jobId ?? "");
      const current = await state();
      if (!current.jobs.some((job) => job.id === jobId)) throw new Error("岗位不存在或已失效");
      const tab = await openManualApplicationTab(chrome, url);
      if (tab.id === undefined) throw new Error("Chrome 没有返回投递页标签 ID");
      const next = await update({
        activeApplication: {
          jobId,
          tabId: tab.id,
          entryMode: "selected_job",
          status: "opening",
          observation: null,
          mappings: [],
          customAnswers: {},
          missing: [],
          readback: [],
          lastError: null,
          reviewConfirmedAt: null
        }
      });
      scheduleApplicationInspection(tab.id);
      return respond({
        ok: true,
        state: next
      });
    }
	    if (input.type === "APPLICATION_ATTACH_CURRENT") {
	      const current = await state();
	      if (!current.candidatePackage || current.candidatePackage.status !== "confirmed") {
	        throw new RecruitingError({
	          code: "INVALID_INPUT",
	          stage: "resume",
	          message: "标准信息包尚未确认",
	          retryable: true,
	          userAction: "请先上传并确认 AI 侧导出的标准信息包。"
	        });
	      }
	      const tab = await currentActiveHttpTab(input.tabId);
	      const tabId = tab.id!;
	      const url = String(tab.url ?? "");
	      await update({
	        activeApplication: {
	          jobId: `package:${tabId}:${Date.now()}`,
	          tabId,
	          entryMode: "current_page",
	          status: "opening",
	          observation: null,
	          mappings: [],
	          customAnswers: {},
	          missing: [],
	          readback: [],
	          lastError: null,
	          reviewConfirmedAt: null,
	          manualAssist: cloneManualAssistForCurrentPage(current.candidatePackage, url)
	        }
	      });
	      return respond({ ok: true, state: await inspectActiveApplication(tabId) });
	    }
    if (input.type === "APPLICATION_INSPECT") {
      const current = await state();
      if (!current.activeApplication) throw new Error("请先打开一个投递页");
      return respond({ ok: true, state: await inspectActiveApplication(current.activeApplication.tabId) });
    }
    if (input.type === "APPLICATION_BACK_TO_JOBS") {
      return respond({ ok: true, state: await update({ activeApplication: null }) });
    }
    if (input.type === "APPLICATION_REVIEW_REFRESH" || input.type === "APPLICATION_REVIEW_CONFIRM") {
      const current = await state();
      if (!current.activeApplication) throw new Error("请先完成自动填写");
      return respond({
        ok: true,
        state: await refreshApplicationReview(
          current.activeApplication.tabId,
          input.type === "APPLICATION_REVIEW_CONFIRM"
        )
      });
    }
    if (input.type === "APPLICATION_REMEMBER_REVIEW") {
      const current = await state();
      const application = current.activeApplication;
      if (!application?.observation || application.status !== "ready_for_review") {
        throw new Error("请先完成填写并读取最终表单");
      }
      const selected = new Set(((input.fieldIds ?? []) as unknown[]).map((value) => String(value)));
      const mappingByField = new Map(application.mappings.map((mapping) => [mapping.fieldId, mapping]));
      const values = { ...current.candidateProfile.values };
      const reusableAnswers = { ...current.candidateProfile.reusableAnswers };
      for (const field of application.observation.fields) {
        if (!selected.has(field.fieldId) || !observedFieldHasValue(field) ||
          field.type === "file" || field.type === "checkbox" || field.type === "radio") continue;
        const semanticKey = mappingByField.get(field.fieldId)?.semanticKey ?? null;
        if (semanticKey && availableProfileKeys.includes(semanticKey)) values[semanticKey] = field.currentValue;
        else {
          const memoryKey = fieldMemoryKey(field, semanticKey);
          if (memoryKey) reusableAnswers[memoryKey] = field.currentValue;
        }
      }
      return respond({
        ok: true,
        state: await update({
          candidateProfile: {
            values,
            reusableAnswers,
            updatedAt: new Date().toISOString()
          }
        })
      });
    }
    if (input.type === "PROFILE_SAVE") {
      const current = await state();
      const values = Object.fromEntries(
        Object.entries((input.values ?? {}) as Record<string, unknown>)
          .filter(([key]) => availableProfileKeys.includes(key))
          .map(([key, value]) => [key, String(value ?? "").trim()])
      );
      return respond({
        ok: true,
        state: await update({
          candidateProfile: {
            values,
            reusableAnswers: current.candidateProfile.reusableAnswers,
            updatedAt: new Date().toISOString()
          }
        })
      });
    }
    if (input.type === "APPLICATION_ANSWER") {
      const current = await state();
      const application = current.activeApplication;
      if (!application || !application.observation) throw new Error("尚未读取真实表单");
      const fieldId = String(input.fieldId ?? "");
      const customAnswers = {
        ...application.customAnswers,
        [fieldId]: String(input.value ?? "").trim()
      };
      const missing = missingFields(
        application.observation,
        application.mappings,
        current.candidateProfile,
        customAnswers,
        current.resumeKnowledge
      );
      return respond({
        ok: true,
        state: await update({
          activeApplication: {
            ...application,
            customAnswers,
            missing,
            status: missing.length ? "information_required" : "ready_to_fill",
            reviewConfirmedAt: null
          }
        })
      });
    }
    if (input.type === "APPLICATION_ANSWER_MANY") {
      const current = await state();
      const application = current.activeApplication;
      if (!application?.observation) throw new Error("尚未读取真实表单");
      const supplied = (input.answers ?? {}) as Record<string, unknown>;
      const customAnswers = {
        ...application.customAnswers,
        ...Object.fromEntries(Object.entries(supplied).map(([key, value]) => [
          key,
          String(value ?? "").trim()
        ]))
      };
      const rememberFieldIds = new Set(
        ((input.rememberFieldIds ?? []) as unknown[]).map((value) => String(value))
      );
      const values = { ...current.candidateProfile.values };
      const reusableAnswers = { ...current.candidateProfile.reusableAnswers };
      const mappingByField = new Map(application.mappings.map((mapping) => [mapping.fieldId, mapping]));
      for (const field of application.observation.fields) {
        if (!rememberFieldIds.has(field.fieldId)) continue;
        const answer = customAnswers[field.fieldId];
        if (!answer || field.type === "file" || field.type === "checkbox" || field.type === "radio") continue;
        const semanticKey = mappingByField.get(field.fieldId)?.semanticKey ?? null;
        if (semanticKey && availableProfileKeys.includes(semanticKey)) values[semanticKey] = answer;
        else {
          const memoryKey = fieldMemoryKey(field, semanticKey);
          if (memoryKey) reusableAnswers[memoryKey] = answer;
        }
      }
      const candidateProfile: CandidateProfile = {
        values,
        reusableAnswers,
        updatedAt: new Date().toISOString()
      };
      const missing = missingFields(
        application.observation,
        application.mappings,
        candidateProfile,
        customAnswers,
        current.resumeKnowledge
      );
      return respond({
        ok: true,
        state: await update({
          candidateProfile,
          activeApplication: {
            ...application,
            customAnswers,
            missing,
            status: missing.length ? "information_required" : "ready_to_fill",
            reviewConfirmedAt: null
          }
        })
      });
    }
    if (input.type === "APPLICATION_FILL") {
      const current = await state();
      const application = current.activeApplication;
      if (!application?.observation) throw new Error("尚未读取真实表单");
      if (application.observation.loginRequired) {
        throw new RecruitingError({
          code: "LOGIN_REQUIRED",
          stage: "login",
          message: application.observation.loginReason ?? "招聘页面要求登录",
          retryable: true,
          userAction: "在已打开的招聘页完成登录，然后点击“登录后继续检测”。"
        });
      }
      const requireEntitlement = input.requireEntitlement === true;
      const idempotencyKey = String(input.idempotencyKey || `one-click-fill:${application.jobId}:${application.tabId}:${Date.now()}:${crypto.randomUUID()}`);
      if (application.manualAssist) {
        return respond({
          ok: true,
          state: await fillManualApplicationFromInfoPackage(
            current,
            application,
            requireEntitlement,
            idempotencyKey
          )
        });
      }
      const files = { ...((input.files ?? {}) as Record<string, ResumeFilePayload>) };
      const storedPhoto = await savedIdentityPhoto();
      const storedResume = await savedResumeFile();
      const mappingByStoredField = new Map(application.mappings.map((mapping) => [mapping.fieldId, mapping]));
      for (const field of application.observation.fields) {
        const semanticKey = mappingByStoredField.get(field.fieldId)?.semanticKey;
        if (!files[field.fieldId] &&
          field.required &&
          (semanticKey === "upload.identity_photo" || /照片|头像|证件照|photo/i.test(field.label)) &&
          storedPhoto) {
          files[field.fieldId] = storedPhoto;
        }
        if (!files[field.fieldId] &&
          (semanticKey === "resume.file" || /简历|附件|resume|cv/i.test(field.label)) &&
          storedResume) {
          files[field.fieldId] = storedResume;
        }
      }
      const availableFileIds = new Set(Object.keys(files));
      const remaining = missingFields(
        application.observation,
        application.mappings,
        current.candidateProfile,
        application.customAnswers,
        current.resumeKnowledge,
        availableFileIds
      );
      if (remaining.length) {
        throw new RecruitingError({
          code: "MISSING_INFORMATION",
          stage: "missing_information",
          message: `仍有 ${remaining.length} 个必填字段缺失`,
          retryable: false,
          userAction: "补充页面列出的必填文字信息或对应文件后继续。",
          details: { fields: remaining.map((field) => field.label) }
        });
      }
      let reservedState = current;
      if (requireEntitlement) {
        reservedState = await reserveOneClickFillUsage(current, application, idempotencyKey);
      }
      const fillingState = await update({
        activeApplication: {
          ...application,
          status: "filling",
          missing: [],
          reviewConfirmedAt: null,
          rpaTrace: requireEntitlement
            ? [{ stage: "entitlement", status: "completed", detail: "已预占用 1 次一键填写额度", at: new Date().toISOString() }]
            : application.rpaTrace
        }
      });

      // Uploads are deliberately a separate first phase. Many ATS pages parse a
      // resume and replace the whole form after the file change event. Filling
      // text before that replacement produces a convincing immediate readback,
      // but the site's parser then overwrites those values.
      const fileInstructions: FillInstruction[] = application.observation.fields.flatMap((field) => {
        if (field.type !== "file") return [];
        const file = files[field.fieldId];
        if (!file || (application.status !== "failed" && field.currentValue.includes(file.name))) return [];
        return file ? [{
          fieldId: field.fieldId,
          ...(field.stableFieldKey ? { stableFieldKey: field.stableFieldKey } : {}),
          selector: field.selector,
          expectedLabel: field.label,
          semanticKey: mappingByStoredField.get(field.fieldId)?.semanticKey ?? null,
          popupBinding: field.popupBinding,
          type: field.type,
          value: file.name,
          file
        }] : [];
      });
      const readback: FillResult[] = [];
      let workingObservation = application.observation;
      let workingMappings = application.mappings;
      let workingCustomAnswers = application.customAnswers;
      let modelExecutions = reservedState.modelExecutions;
      const rpaTrace = [...(fillingState.activeApplication?.rpaTrace ?? [])];
      const trace = (
        stage: NonNullable<ActiveApplication["rpaTrace"]>[number]["stage"],
        status: NonNullable<ActiveApplication["rpaTrace"]>[number]["status"],
        detail: string
      ) => rpaTrace.push({ stage, status, detail, at: new Date().toISOString() });
      if (fileInstructions.length) {
        const uploadResults = await executeApplicationFillInstructions(application.tabId, workingObservation, fileInstructions);
        readback.push(...uploadResults);
        const failedUpload = uploadResults.find(result => !result.success);
        if (failedUpload) throw controlExecutionError(workingObservation.fields.find(field => field.fieldId === failedUpload.fieldId)!, failedUpload);
        workingObservation = await stableApplicationObservation(application.tabId);
        trace("upload", "completed", `已向招聘网站上传 ${fileInstructions.length} 个文件`);
      } else {
        trace("upload", "skipped", "招聘网站已存在本次简历文件，无需重复上传");
        // A stored observation from an older extension version may not contain
        // action candidates. Re-observe on every run so the model always plans
        // against the live page, not stale selectors or labels.
        workingObservation = await stableApplicationObservation(application.tabId);
      }

      trace("execute_action", "skipped", "使用 AI Offer 信息包，不触发招聘网站简历解析");

      if (fileInstructions.length) {
        const afterUpload = await stableApplicationObservation(application.tabId);
        trace(
          "prepare_sections",
          "skipped",
          "保留招聘页面已有经历区块；不按简历条数新增非必填经历"
        );
        const remapped = await mapApplicationObservation(current, afterUpload);
        workingCustomAnswers = remapCustomAnswers(
          application.observation,
          application.mappings,
          afterUpload,
          remapped.mappings,
          application.customAnswers
        );
        workingObservation = afterUpload;
        workingMappings = remapped.mappings;
        modelExecutions = remapped.evidence.reduce(withExecution, modelExecutions);
      }

      const workingMappingByField = new Map(workingMappings
        .filter((mapping) => mapping.confidence >= 0.8)
        .map((mapping) => [mapping.fieldId, mapping]));
      const auditableFields = workingObservation.fields.flatMap((field) => {
        if (["file", "checkbox", "radio", "hidden"].includes(field.type)) return [];
        const mapping = workingMappingByField.get(field.fieldId);
        if (!mapping) return [];
        const confirmedOptionalAnswer = currentApplicationAnswerForField(field, workingCustomAnswers);
        if (!field.required && (!confirmedOptionalAnswer || observedFieldHasValue(field))) return [];
        const expected = field.required
          ? resolvedFieldAnswer(
              field,
              mapping.semanticKey,
              current.candidateProfile,
              workingCustomAnswers,
              current.resumeKnowledge
            )
          : confirmedOptionalAnswer;
        return expected === undefined ? [] : [{
          fieldId: field.fieldId,
          label: field.label,
          semanticKey: mapping.semanticKey,
          expected,
          actual: field.currentValue
        }];
      });
      const audit = await auditFilledFormWithModel(
        await browserModelSettings(current.modelService),
        auditableFields
      );
      modelExecutions = withExecution(modelExecutions, audit.evidence);
      const auditIssueByField = new Map(audit.issues.map((issue) => [issue.fieldId, issue]));
      trace(
        "audit_form",
        "completed",
        audit.issues.length
          ? `AI 核验发现 ${audit.issues.length} 个需要补全或校正的字段`
          : "AI 核验确认招聘网站解析内容与本地简历一致"
      );
      const instructions: FillInstruction[] = workingObservation.fields.flatMap((field) => {
        if (field.type === "file") return [];
        const mapping = workingMappingByField.get(field.fieldId);
        const semanticKey = mapping?.semanticKey ?? null;
        const confirmedOptionalAnswer = currentApplicationAnswerForField(field, workingCustomAnswers);
        if (!field.required && (!confirmedOptionalAnswer || observedFieldHasValue(field))) return [];
        const artifactRepairValue = parserArtifactRepairValue(field, semanticKey);
        const value = field.required
          ? resolvedFieldAnswer(
              field,
              semanticKey,
              current.candidateProfile,
              workingCustomAnswers,
              current.resumeKnowledge
            )
          : confirmedOptionalAnswer;
        const auditIssue = auditIssueByField.get(field.fieldId);
        const canFill = !observedFieldHasValue(field);
        const canRepair = Boolean(artifactRepairValue) ||
          (auditIssue?.category === "format_artifact" && auditIssue.confidence >= 0.9);
        if (!canFill && !canRepair) return [];
        const nextValue = artifactRepairValue ?? value;
        return nextValue ? [{
          fieldId: field.fieldId,
          ...(field.stableFieldKey ? { stableFieldKey: field.stableFieldKey } : {}),
          selector: field.selector,
          expectedLabel: field.label,
          semanticKey: field.required ? semanticKey : currentJobFieldSemanticKey(field),
          popupBinding: field.popupBinding,
          type: field.type,
          value: nextValue
        }] : [];
      }).sort((left, right) => {
        const rank = (instruction: FillInstruction) =>
          ["combobox", "select"].includes(instruction.type) ? 2 :
            ["checkbox", "radio"].includes(instruction.type) ? 1 : 0;
        return rank(left) - rank(right);
      });
      const instructionFieldIds = new Set(instructions.map((instruction) => instruction.fieldId));
      const unresolvedAuditIssues = audit.issues.filter((issue) => !instructionFieldIds.has(issue.fieldId));
      if (instructions.length) {
        readback.push(...await executeApplicationFillInstructions(application.tabId, workingObservation, instructions));
      }
      trace(
        "correct_form",
        instructions.length ? "completed" : "skipped",
        instructions.length ? `根据本地简历补全或校正 ${instructions.length} 个字段` : "无需补全或校正字段"
      );
      const postObservation = await stableApplicationObservation(application.tabId);
      const unfilledRequired = requiredFieldFailures(postObservation.fields);
      const hadEmptyWritableFields = workingObservation.fields.some((field) =>
        field.required &&
        !observedFieldHasValue(field) &&
        !["file", "checkbox", "radio", "hidden"].includes(field.type)
      );
      const noOpFailure = instructions.length === 0 && fileInstructions.length === 0 && hadEmptyWritableFields;
      const postFieldById = new Map(postObservation.fields.map((field) => [field.fieldId, field]));
      const postFieldByStableKey = new Map(postObservation.fields
        .filter((field) => field.stableFieldKey)
        .map((field) => [field.stableFieldKey!, field]));
      const requiredInstructionIds = new Set(workingObservation.fields
        .filter((field) => field.required)
        .map((field) => field.fieldId));
      const blockingInstructions = [
        ...fileInstructions,
        ...instructions.filter((instruction) => requiredInstructionIds.has(instruction.fieldId))
      ];
      const verifiedReadback = blockingInstructions.every((instruction) => {
        const item = readback.find((candidate) => candidate.fieldId === instruction.fieldId);
        const postField = postFieldById.get(instruction.fieldId) ??
          (instruction.stableFieldKey ? postFieldByStableKey.get(instruction.stableFieldKey) : undefined) ??
          (instruction.type === "file"
            ? postObservation.fields.find((field) => field.type === "file" &&
              field.currentValue.includes(String(instruction.value)))
            : undefined);
        if (!item || !item.success || !postField) return false;
        const actual = postField.currentValue;
        if (instruction.type === "combobox" || instruction.type === "select") {
          return String(instruction.value).split(/[、,，;；/]+/).filter(Boolean)
            .some((part) => actual.includes(part));
        }
        if (instruction.type === "file") return actual.includes(String(instruction.value));
        return actual === String(instruction.value);
      });
      const success = !noOpFailure && verifiedReadback &&
        unfilledRequired.length === 0 &&
        postObservation.validationMessages.length === 0 &&
        unresolvedAuditIssues.length === 0;
      const validationFailure = [
        ...unfilledRequired.map((field) => `必填未完成：${field.label}`),
        ...postObservation.validationMessages,
        ...unresolvedAuditIssues.map((issue) => `需人工确认：${issue.reason}`)
      ].join("；");
      trace(
        "readback",
        success ? "completed" : "failed",
        success ? "DOM 回读校验通过，已停在最终提交前" : validationFailure || "部分字段回读不一致"
      );
      return respond({
        ok: true,
        state: await update({
          activeApplication: {
            ...fillingState.activeApplication!,
            status: success ? "ready_for_review" : "failed",
            observation: postObservation,
            mappings: workingMappings,
            customAnswers: workingCustomAnswers,
            readback,
            rpaTrace,
            lastError: success ? null : validationFailure ||
              (noOpFailure ? "页面仍有空白可填写字段，但本次没有生成任何填表指令" : "部分字段填入后回读不一致"),
            reviewConfirmedAt: null
          },
          modelExecutions
        })
      });
    }
    respond({ ok: false, error: "未知消息" });
  })().catch(async (error: unknown) => {
  const publicError = toPublicError(error);
    const userActionable = new Set([
      "INVALID_INPUT", "LOGIN_REQUIRED", "MISSING_INFORMATION", "MODEL_NOT_CONFIGURED",
      "MODEL_AUTH_FAILED", "MODEL_RATE_LIMITED", "MODEL_UNAVAILABLE", "TRANSPORT_FAILED",
      "CLOUD_SYNC_NOT_CONFIGURED", "CLOUD_SYNC_AUTH_FAILED", "CLOUD_SYNC_UNAVAILABLE"
    ]);
    if (!userActionable.has(publicError.code)) {
      await recordSystemError(publicError, String(input.type ?? "unknown"));
    }
    respond({
      ok: false,
      error: publicError
    });
  });
  return true;
});

chrome.runtime.onMessageExternal.addListener((message: unknown, sender, respond) => {
  const input = message as { type?: string; [key: string]: unknown };
  // The bootstrap listener above owns RECRUITING_DEVICE_BOOTSTRAP. Returning
  // false here is important: responding "unknown" from two listeners races
  // the real bootstrap exchange and can make the web app retry a one-time token.
  if (input.type !== "AI_BRIDGE_COMMAND") return false;
  void (async () => {
    const command = ensureAiCommand(input.command);
    if (command.type === "browser.execute_batch_auto_apply_job") {
      const senderUrl = String(sender.url ?? "");
      const localSender = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//i.test(senderUrl);
      if (!localSender || command.payload?.localValidation !== true) {
        throw new RecruitingError({
          code: "AUTHORIZATION_REQUIRED",
          stage: "approval",
          message: "批量自动投递只能由正式设备队列执行",
          retryable: false,
          userAction: "请由 AI Offer 服务端创建正式批次。"
        });
      }
      const credential = await autoApplyCredential();
      if (!credential) throw new Error("插件尚未完成设备绑定");
      return respond({ ok: true, event: await executeBatchAutoApplyJob(command, credential) });
    }
    return respond({ ok: true, event: await executeAiBridgeCommand(command) });
  })().catch((error: unknown) => {
    respond({ ok: false, error: toPublicError(error) });
  });
  return true;
});
