export type ControlAdapterKind = "generic" | "specialized" | "unresolved";
export type ControlRoutingScope = "company_control" | "shared_component" | "native_control";
export type ControlExecutionDriver =
  | "generic_native"
  | "site_deterministic"
  | "unsupported";

export type ControlExecutionSurface = "background_tab" | "foreground_tab";

export type FieldInformationRequirement =
  | { kind: "date"; precision: "year" | "month" | "day"; part?: "year" | "month" }
  | { kind: "region"; level: "province" | "city" | "district" };

/**
 * Authoritative post-action readback semantics owned by a registered Driver.
 *
 * This is deliberately separate from the control kind. Two controls can both
 * render as text inputs while one exposes a native scalar and the other
 * exposes a formatted administrative-area path selected from a cascader.
 */
export type ControlReadbackStrategy =
  | "feishu_location_path"
  | "page_option_set_exact"
  | "native_value_exact"
  | "page_option_exact"
  | "administrative_city_semantic"
  | "administrative_city_set"
  | "administrative_hierarchy_semantic"
  | "structured_temporal"
  | "checked_state"
  | "unsupported";

export type ControlAdapterCode =
  | "feishu.formily-location-tree.trusted-pointer.v1"
  | "feishu.formily-selector-search.trusted-pointer.v1"
  | "feishu.formily-city-multi-search.trusted-pointer.v1"
  | "moka.range-present.trusted-pointer.v1"
  | "feishu.formily-radio-group.trusted-pointer.v1"
  | "feishu.formily-multi-select.trusted-pointer.v1"
  | "feishu.formily-portfolio-upload.v1"
  | "feishu.formily-year.trusted-pointer.v1"
  | "feishu.atsx-school-search.trusted-pointer.v1"
  | "feishu.formily-school-search.trusted-pointer.v1"
  | "feishu.atsx-flat-select.trusted-pointer.v1"
  | "feishu.atsx-city-tree.trusted-pointer.v1"
  | "feishu.atsx-resume-upload.v1"
  | "feishu.formily-resume-upload.v1"
  | "feishu.month-period.trusted-pointer.v3"
  | "feishu.formily-flat-select.trusted-pointer.v1"
  | "xtool.formily-repeat-native.v1"
  | "generic.native.v1"
  | "generic.consent-confirmation.trusted-pointer.v1"
  | "moka.date-picker.trusted-pointer.v9"
  | "moka.zuoyebang.education-end-month.trusted-pointer.v1"
  | "moka.tap4fun.birth-date.trusted-pointer.v2"
  | "moka.deepseek.location.trusted-focus.v4"
  | "moka.work-city.trusted-focus.v1"
  | "moka.work-city-multi.trusted-focus.v1"
  | "moka.flat-select.trusted-focus.v1"
  | "moka.search-select.trusted-focus.v1"
  | "moka.legacy-school-search.trusted-focus.v1"
  | "moka.readonly-calling-code.trusted-focus.v1"
  | "moka.linctex.location.trusted-focus.v1"
  | "moka.yadea.location.trusted-focus.v1"
  | "moka.brother.location.trusted-focus.v1"
  | "moka.phlexing.location.trusted-focus.v1"
  | "moka.zte.location.trusted-focus.v1"
  | "moka.metax.location.trusted-focus.v1"
  | "moka.jsti.location.trusted-focus.v1"
  | "moka.sina.location.trusted-focus.v1"
  | "moka.sina.weibo-frequency.trusted-focus.v1"
  | "moka.eqhr.travel-acceptance.trusted-focus.v1"
  | "moka.yongxing.ethnicity.trusted-focus.v1"
  | "moka.sungrow.identity-document-type.trusted-focus.v1"
  | "moka.sungrow.relative-employment.trusted-focus.v1"
  | "moka.xiwang.location.trusted-focus.v1"
  | "moka.yinli.location.trusted-focus.v1"
  | "moka.wzgroup.location.trusted-focus.v1"
  | "moka.transwarp.location.trusted-focus.v1"
  | "moka.newgrand.location.trusted-focus.v1"
  | "moka.newonder.location.trusted-focus.v1"
  | "moka.wandacm.location.trusted-focus.v1"
  | "moka.innostar.location.trusted-focus.v1"
  | "moka.ascenpower.location.trusted-focus.v1"
  | "moka.gclpower.location.trusted-focus.v1"
  | "moka.xiaoying.location.trusted-focus.v1"
  | "moka.simceredx.location.trusted-focus.v1"
  | "moka.eqhr.location.trusted-focus.v1"
  | "moka.xgd.location.trusted-focus.v1"
  | "moka.native-place.cascader.trusted-pointer.v1"
  | "moka.recruiting-source.trusted-focus.v1"
  | "moka.year-month-select.trusted-pointer.v1"
  | "unresolved.custom.v1";

export type ControlAdapterReason =
  | "feishu_formily_selector_search_signature"
  | "moka_owned_range_present"
  | "feishu_formily_owned_radio_group"
  | "feishu_formily_multi_select_signature"
  | "feishu_formily_portfolio_upload_signature"
  | "feishu_formily_year_signature"
  | "feishu_school_search_signature"
  | "feishu_atsx_owned_choice_signature"
  | "feishu_atsx_resume_upload_signature"
  | "feishu_formily_resume_upload_signature"
  | "feishu_month_period_signature"
  | "feishu_formily_flat_select_signature"
  | "xtool_formily_repeat_native_signature"
  | "native_control"
  | "generic_consent_signature"
  | "moka_date_signature"
  | "moka_zuoyebang_education_end_month_signature"
  | "moka_tap4fun_birth_date_signature"
  | "deepseek_location_signature"
  | "moka_work_city_component_signature"
  | "moka_work_city_multi_component_signature"
  | "moka_flat_select_component_signature"
  | "moka_school_search_component_signature"
  | "moka_legacy_school_component_signature"
  | "moka_readonly_code_component_signature"
  | "ambiguous_control_registration"
  | "linctex_location_signature"
  | "yadea_location_signature"
  | "brother_location_signature"
  | "phlexing_location_signature"
  | "zte_location_signature"
  | "metax_location_signature"
  | "jsti_location_signature"
  | "sina_location_signature"
  | "sina_weibo_frequency_signature"
  | "eqhr_travel_acceptance_signature"
  | "yongxing_ethnicity_signature"
  | "sungrow_identity_document_type_signature"
  | "sungrow_relative_employment_signature"
  | "xiwang_location_signature"
  | "yinli_location_signature"
  | "wzgroup_location_signature"
  | "transwarp_location_signature"
  | "newgrand_location_signature"
  | "newonder_location_signature"
  | "wandacm_location_signature"
  | "innostar_location_signature"
  | "ascenpower_location_signature"
  | "gclpower_location_signature"
  | "xiaoying_location_signature"
  | "simceredx_location_signature"
  | "eqhr_location_signature"
  | "xgd_location_signature"
  | "moka_native_place_signature"
  | "moka_recruiting_source_signature"
  | "moka_year_month_select_signature"
  | "field_semantic_conflict"
  | "custom_control_without_adapter";

export interface ControlAdapterEvidence {
  ownedInputCount?: number;
  compoundKind?: "phone_number" | "identity_document";
  observedControlKind?: "atsx_flat" | "atsx_city_tree" | "formily_radio_group" | "moka_range_present" | "formily_selector_flat" | "formily_location_tree";
  applicationUrl: string;
  label: string;
  semanticKey: string;
  type: string;
  controlKind: string;
  tagName: string;
  readOnly: boolean;
  placeholder: string;
  classNames: string[];
  ancestorIds?: string[];
  role?: string;
  ariaHasPopup?: string;
  ariaAutocomplete?: string;
  disabled?: boolean;
}

export interface ControlAdapterRegistration {
  /** Selection priority, never a list of execution fallbacks. */
  routingScope?: ControlRoutingScope;
  informationRequirement?: FieldInformationRequirement;
  /** A query must be supplied before this component can expose its options. */
  optionSource?: "search";
  registrationId: string;
  adapterCode: ControlAdapterCode;
  kind: ControlAdapterKind;
  driver: ControlExecutionDriver;
  requiresForeground: boolean;
  executionSurface: ControlExecutionSurface;
  readbackStrategy: ControlReadbackStrategy;
  site: {
    code: string;
    name: string;
    hostnamePatterns: readonly string[];
    applicationUrlPatterns: readonly string[];
  };
  field: {
    category: string;
    name: string;
    matchPolicy?: "required" | "advisory";
    fieldNamePatterns: readonly string[];
    semanticKeyPatterns: readonly string[];
  };
  control: {
    excludedObservedKinds?: string[];
    observedKinds?: readonly string[];
    type: string;
    name: string;
    tagNames: readonly string[];
    inputTypes: readonly string[];
    readOnly: boolean | null;
    signaturePatterns: readonly string[];
    signatureDepth?: number;
    ownedInputCount?: number;
  };
  targetRoles: readonly string[];
  reason: ControlAdapterReason;
  evidence: readonly string[];
}

/**
 * Serializable result shared by plugin diagnostics, Gateway requests and
 * terminal failures. These flat identity fields are intentional: AI Offer can
 * display and aggregate them without reverse engineering adapter codes.
 */
export interface ControlAdapterDiagnostic {
  routingScope?: ControlRoutingScope;
  matchedRegistrationIds?: string[];
  informationRequirement?: FieldInformationRequirement;
  schemaVersion: "control-adapter-diagnostic.v1";
  registrationId: string;
  siteCode: string;
  siteName: string;
  hostname: string;
  applicationUrlFamily: string;
  fieldName: string;
  semanticKey: string;
  fieldCategory: string;
  controlType: string;
  controlName: string;
  tagName: string;
  inputType: string;
  controlKind: string;
  readOnly: boolean;
  adapterCode: ControlAdapterCode;
  adapterKind: ControlAdapterKind;
  driver: ControlExecutionDriver;
  requiresForeground: boolean;
  executionSurface: ControlExecutionSurface;
  readbackStrategy: ControlReadbackStrategy;
  reason: ControlAdapterReason;
  evidence: string[];
  /** Observed signature only; never includes the candidate's value. */
  controlSignature?: {
    role: string;
    ariaHasPopup: string;
    ariaAutocomplete: string;
    classNames: string[];
    ancestorIds?: string[];
    disabled: boolean;
    tenantPath: string;
  };
}

export interface ControlAdapterResolution {
  code: ControlAdapterCode;
  kind: ControlAdapterKind;
  driver: ControlExecutionDriver;
  requiresForeground: boolean;
  executionSurface: ControlExecutionSurface;
  readbackStrategy: ControlReadbackStrategy;
  evidence: string[];
  reason: ControlAdapterReason;
  registration: ControlAdapterRegistration | null;
  diagnostic: ControlAdapterDiagnostic;
}
