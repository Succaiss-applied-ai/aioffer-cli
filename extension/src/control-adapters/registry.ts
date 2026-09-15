import type {
  ControlAdapterDiagnostic,
  ControlAdapterEvidence,
  ControlAdapterRegistration,
  ControlAdapterResolution
} from "./types.js";

function nativeRegistration(kind: "select" | "checkbox" | "radio" | "file"): ControlAdapterRegistration {
  return {
    registrationId: `generic.native.${kind}.v1`, adapterCode: "generic.native.v1",
    routingScope: "native_control",
    kind: "generic", driver: "generic_native", requiresForeground: false, executionSurface: "background_tab",
    readbackStrategy: kind === "select" ? "page_option_exact" :
      kind === "checkbox" || kind === "radio" ? "checked_state" : "native_value_exact",
    site: { code: "cross_site", name: "跨站点", hostnamePatterns: ["*"], applicationUrlPatterns: [] },
    field: { category: kind, name: `原生 ${kind} 字段`, matchPolicy: "advisory", fieldNamePatterns: [], semanticKeyPatterns: [] },
    control: { type: `native_${kind}`, name: `原生 ${kind} 控件`,
      tagNames: [kind === "select" ? "SELECT" : "INPUT"], inputTypes: [kind], readOnly: false, signaturePatterns: [] },
    targetRoles: [], reason: "native_control",
    evidence: ["standard native control semantics", "exact owned value/option/checked/files readback"]
  };
}

export const CONTROL_ADAPTER_REGISTRY: readonly ControlAdapterRegistration[] = [
  ...(["flat", "location", "location_multiple"] as const).map((shape):ControlAdapterRegistration=>{ const multiple=shape==="location_multiple"; const tree=shape!=="flat"; return ({
    registrationId:multiple?"feishu.formily-city-multi-search.trusted-pointer.v1":tree?"feishu.formily-location-tree.trusted-pointer.v1":"feishu.formily-selector-search.trusted-pointer.v1",
    adapterCode:multiple?"feishu.formily-city-multi-search.trusted-pointer.v1":tree?"feishu.formily-location-tree.trusted-pointer.v1":"feishu.formily-selector-search.trusted-pointer.v1",
    optionSource:"search",routingScope:"shared_component",kind:"specialized",driver:"site_deterministic",
    requiresForeground:false,executionSurface:"background_tab",readbackStrategy:tree?"feishu_location_path":"page_option_exact",
    site:{code:"feishu.jobs",name:"飞书招聘",hostnamePatterns:[],applicationUrlPatterns:["^https://[^/]+\\.jobs\\.feishu\\.cn/[a-zA-Z0-9_-]+/resume/\\d+/apply/?(?:[?#]|$)"]},
    field:{category:"choice",name:multiple?"城市多选搜索":"可编辑选择搜索",matchPolicy:"advisory",fieldNamePatterns:[],semanticKeyPatterns:[]},
    control:{type:multiple?"custom_multi_search":"custom_selector_search",name:"Formily selector search（草稿）",
      tagNames:["INPUT"],inputTypes:["search"],readOnly:false,signatureDepth:14,
      ...(tree?{observedKinds:["formily_location_tree"]}:{excludedObservedKinds:["formily_location_tree"]}),
      signaturePatterns:["ud__select__selector__search__input","ud__select__selector","ud-formily-item",
        ...(multiple?["ud__select__selector-multiple"]:
          ["^(?![\\s\\S]*ud__select__selector-multiple)"])]},
    targetRoles:["query_input","exact_search_result","field_label_commit"],reason:"feishu_formily_selector_search_signature",
    evidence:["2026-09-09 youcash live: editable selector input, flat nationality / tree city search, selected display or city tags",
      "User authorizes one primary complete query even when unfiltered options are available; exact result only",
      "Draft: unchanged readonly/school/ordinary multiple routes, current field binding and no final submit; installed acceptance pending"]
  }); }),
  {
    registrationId:"moka.range-present.trusted-pointer.v1",adapterCode:"moka.range-present.trusted-pointer.v1",
    routingScope:"shared_component",kind:"specialized",driver:"site_deterministic",requiresForeground:false,
    executionSurface:"background_tab",readbackStrategy:"checked_state",
    site:{code:"moka",name:"Moka",hostnamePatterns:["app.mokahr.com"],applicationUrlPatterns:[]},
    field:{category:"date_range",name:"结束时间至今",matchPolicy:"advisory",fieldNamePatterns:[],semanticKeyPatterns:[]},
    control:{type:"range_present_checkbox",name:"年月范围至今复选框（候选）",tagNames:["INPUT"],inputTypes:["checkbox"],
      readOnly:false,observedKinds:["moka_range_present"],signaturePatterns:[]},
    targetRoles:["range_present"],reason:"moka_owned_range_present",
    evidence:["2026-09-09 Trunk actual date_info shape: two year/month pairs or checked Present with only start pair",
      "Draft; same group checked state and end controls readback; installed-candidate acceptance pending"]
  },
  {
    registrationId: "feishu.formily-radio-group.trusted-pointer.v1", adapterCode: "feishu.formily-radio-group.trusted-pointer.v1",
    routingScope: "shared_component", kind: "specialized", driver: "site_deterministic", requiresForeground: false,
    executionSurface: "background_tab", readbackStrategy: "page_option_exact",
    site: { code: "feishu.jobs", name: "飞书招聘", hostnamePatterns: [], applicationUrlPatterns: [
      "^https://[^/]+\\.jobs\\.feishu\\.cn/[a-zA-Z0-9_-]+/resume/\\d+/apply/?(?:[?#]|$)"
    ] },
    field: {category: "choice", name: "单选组", matchPolicy: "advisory", fieldNamePatterns: [], semanticKeyPatterns: []},
    control: {type: "custom_radio_group", name: "Formily 原生单选组（本机候选）", tagNames: ["INPUT"], inputTypes: ["radio"],
      readOnly: false, observedKinds: ["formily_radio_group"], signatureDepth: 8,
      signaturePatterns: ["ud__radio__input", "ud__radio-group", "ud-formily-item"]},
    targetRoles: ["exact_radio_option"], reason: "feishu_formily_owned_radio_group",
    evidence: ["2026-09-08 live Formily group: native radio leaves and independent owned labels, field name is advisory",
      "Draft prototype; one exact trusted click with fresh identity and checked-label/error readback; installed-candidate acceptance pending"]
  },
  {
    registrationId:"feishu.formily-multi-select.trusted-pointer.v1",adapterCode:"feishu.formily-multi-select.trusted-pointer.v1",
    routingScope:"shared_component",kind:"specialized",driver:"site_deterministic",requiresForeground:false,executionSurface:"background_tab",readbackStrategy:"page_option_set_exact",
    site:{code:"feishu.jobs",name:"飞书招聘",hostnamePatterns:[],applicationUrlPatterns:["^https://[^/]+\\.jobs\\.feishu\\.cn/[a-zA-Z0-9_-]+/resume/\\d+/apply/?(?:[?#]|$)"]},
    field:{category:"choice",name:"多选",matchPolicy:"advisory",fieldNamePatterns:[],semanticKeyPatterns:[]},
    control:{type:"custom_multi_select",name:"Formily 选项集合",tagNames:["INPUT"],inputTypes:["search"],readOnly:false,signatureDepth:14,
      signaturePatterns:["ud__select__selector__search__input","ud__select__selector-multiple","ud-formily-item"],excludedObservedKinds:["formily_location_tree"]},
    targetRoles:["multi_trigger","exact_option","field_label_close"],reason:"feishu_formily_multi_select_signature",
    evidence:["Torras rc.2 production Driver acceptance passed 2026-09-08: authorized exact option set, closed menu and cleared validation; feishu-rc2-control-acceptance-20260908.json",
      "complete array only; all options preflight before writes, no removals, full owned selected-set readback, no retry after partial selection"]
  },
  {
    registrationId:"feishu.formily-portfolio-upload.v1",adapterCode:"feishu.formily-portfolio-upload.v1",
    routingScope:"shared_component",kind:"specialized",driver:"site_deterministic",requiresForeground:false,executionSurface:"background_tab",readbackStrategy:"native_value_exact",
    site:{code:"feishu.jobs",name:"飞书招聘",hostnamePatterns:[],applicationUrlPatterns:["^https://[^/]+\\.jobs\\.feishu\\.cn/[a-zA-Z0-9_-]+/resume/\\d+/apply/?(?:[?#]|$)"]},
    field:{category:"file",name:"作品附件",fieldNamePatterns:[],semanticKeyPatterns:["^portfolio\\[\\d+\\]\\.attachment\\.file"]},
    control:{type:"async_portfolio_upload",name:"Formily 作品附件",tagNames:["INPUT"],inputTypes:["file"],readOnly:false,signatureDepth:10,
      signaturePatterns:["atsx-upload-btn","ud-formily-item","data-form-field-name:attachment(?:\\s|$)","^(?![\\s\\S]*uploadResume)"]},
    targetRoles:[],reason:"feishu_formily_portfolio_upload_signature",
    evidence:["xTool and Torras rc.3 production portfolio upload passed 2026-09-08: exact owned completed card and no field error; feishu-rc3-torras-portfolio-consent-acceptance-20260908.json",
      "requires explicitly portfolio-purpose file; one upload, exact owned completion card, no resume/portrait substitution"]
  },
  {
    registrationId:"feishu.formily-year.trusted-pointer.v1",adapterCode:"feishu.formily-year.trusted-pointer.v1",
    routingScope:"shared_component",kind:"specialized",driver:"site_deterministic",requiresForeground:false,executionSurface:"background_tab",
    readbackStrategy:"native_value_exact",informationRequirement:{kind:"date",precision:"year"},
    site:{code:"feishu.jobs",name:"飞书招聘",hostnamePatterns:[],applicationUrlPatterns:["^https://[^/]+\\.jobs\\.feishu\\.cn/[a-zA-Z0-9_-]+/resume/\\d+/apply/?(?:[?#]|$)"]},
    field:{category:"date",name:"单年份",matchPolicy:"advisory",fieldNamePatterns:[],semanticKeyPatterns:[]},
    control:{type:"custom_year_picker",name:"Formily YYYY 年份面板",tagNames:["INPUT"],inputTypes:["text"],readOnly:false,signatureDepth:9,
      signaturePatterns:["\\bud__picker-input\\b","\\bud__picker\\b","ud-formily-item","(?:^|\\s)YYYY$","^(?![\\s\\S]*throne-biz-date-range-picker)"]},
    targetRoles:["year_input","year_page_navigation","year_leaf"],reason:"feishu_formily_year_signature",
    evidence:["xTool rc.3 production batch committed authorized year 2024 with closed picker and no local error; feishu-rc3-control-acceptance-20260908.json",
      "year precision only; one selected year, bounded monotonic page navigation, closed picker and stable local no-error readback"]
  },
  ...(["atsx", "formily"] as const).map((kind): ControlAdapterRegistration => ({
    registrationId:`feishu.${kind}-school-search.trusted-pointer.v1`,adapterCode:`feishu.${kind}-school-search.trusted-pointer.v1`,
    optionSource:"search",routingScope:"shared_component",kind:"specialized",driver:"site_deterministic",requiresForeground:false,
    executionSurface:"background_tab",readbackStrategy:"page_option_exact",
    site:{code:"feishu.jobs",name:"飞书招聘",hostnamePatterns:[],applicationUrlPatterns:["^https://[^/]+\\.jobs\\.feishu\\.cn/[a-zA-Z0-9_-]+/resume/\\d+/apply/?(?:[?#]|$)"]},
    field:{category:"choice",name:"查询选择",matchPolicy:"advisory",fieldNamePatterns:[],semanticKeyPatterns:[]},
    control:{type:"custom_school_search",name:`${kind} 学校查询`,tagNames:[kind==="atsx"?"DIV":"INPUT"],inputTypes:[kind==="atsx"?"combobox":"text"],readOnly:false,signatureDepth:8,
      signaturePatterns:kind==="atsx"?["atsx-select-combobox","atsx-select-selection--single","atsx-form-item"]:
        ["ud__native-input","\\bud__select\\b","\\bud__input\\b","ud-formily-item","data-form-field-name:","^(?![\\s\\S]*ud__select__selector)"]},
    targetRoles:["query_input","exact_school_result","field_label_commit"],reason:"feishu_school_search_signature",
    evidence:["Qunar ATSX and Torras/xTool Formily production school search passed 2026-09-08: exact 上海大学 option and committed no-error readback; feishu-rc2/rc3-control-acceptance-20260908.json",
      "one trusted query, one unique exact real option, owned label blur and two stable no-error readbacks; query alone is never accepted"]
  })),
  ...(["atsx_flat", "atsx_city_tree"] as const).map((kind): ControlAdapterRegistration => ({
    registrationId: kind === "atsx_flat" ? "feishu.atsx-flat-select.trusted-pointer.v1" : "feishu.atsx-city-tree.trusted-pointer.v1",
    adapterCode: kind === "atsx_flat" ? "feishu.atsx-flat-select.trusted-pointer.v1" : "feishu.atsx-city-tree.trusted-pointer.v1",
    routingScope:"shared_component",kind:"specialized",driver:"site_deterministic",requiresForeground:false,
    executionSurface:"background_tab",readbackStrategy:kind === "atsx_flat" ? "page_option_exact" : "administrative_city_semantic",
    site:{code:"feishu.jobs",name:"飞书招聘",hostnamePatterns:[],applicationUrlPatterns:["^https://[^/]+\\.jobs\\.feishu\\.cn/[a-zA-Z0-9_-]+/resume/\\d+/apply/?(?:[?#]|$)"]},
    field:{category:"choice",name:kind === "atsx_flat" ? "ATSX 平面单选" : "ATSX 城市叶子树",matchPolicy:"advisory",fieldNamePatterns:[],semanticKeyPatterns:[]},
    control:{observedKinds:[kind],type:kind,name:kind,tagNames:["DIV"],inputTypes:["combobox"],readOnly:false,signatureDepth:8,
      signaturePatterns:["atsx-select-selection--single","atsx-select","^(?![\\s\\S]*atsx-select-combobox)"]},
    targetRoles:["control","option_leaf","field_label_close"],reason:"feishu_atsx_owned_choice_signature",
    evidence:["Qunar rc.3 flat options and Li rc.2 Shanghai leaf tree passed production Driver execution, popup closure and cleared validation; feishu-rc2/rc3-control-acceptance-20260908.json",
      "closed trigger is insufficient: non-writing owned-popup classification precedes unique dispatch; no fallback"]
  })),
  {
    registrationId: "feishu.atsx-resume-upload.v1", adapterCode: "feishu.atsx-resume-upload.v1",
    routingScope: "shared_component", kind: "specialized", driver: "site_deterministic",
    requiresForeground: false, executionSurface: "background_tab", readbackStrategy: "native_value_exact",
    site: { code: "feishu.jobs", name: "飞书招聘", hostnamePatterns: [], applicationUrlPatterns: [
      "^https://[^/]+\\.jobs\\.feishu\\.cn/[a-zA-Z0-9_-]+/resume/\\d+/apply/?(?:[?#]|$)"
    ] },
    field: { category: "file", name: "简历附件", fieldNamePatterns: [], semanticKeyPatterns: ["^attachments\\.resume_file\\.file"] },
    control: { type: "async_resume_upload", name: "ATSX 异步简历上传（候选）", tagNames: ["INPUT"], inputTypes: ["file"],
      readOnly: false, signatureDepth: 12, signaturePatterns: ["\\batsx-upload-btn\\b", "\\buploadResume\\b", "\\buploadResume-section\\b", "^(?![\\s\\S]*ud-formily-item)"] },
    targetRoles: [], reason: "feishu_atsx_resume_upload_signature",
    evidence: ["Qunar rc.3 ATSX main-resume upload passed 2026-09-08; feishu-rc3-resume-upload-acceptance-20260908.json",
      "one-write transaction and exact owned completion card verified; adjacent Formily main-resume upload regression passed"]
  },
  {
    registrationId: "moka.work-city-multi.trusted-focus.v1", adapterCode: "moka.work-city-multi.trusted-focus.v1",
    routingScope: "shared_component", kind: "specialized", driver: "site_deterministic",
    requiresForeground: false, executionSurface: "background_tab", readbackStrategy: "administrative_city_set",
    site: {code: "moka", name: "Moka", hostnamePatterns: [], applicationUrlPatterns: [
      "^https://app\\.mokahr\\.com/(?:campus|social)-recruitment/[^/?#]+/[^/?#]+(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
    ]},
    field: {category: "location", name: "多选意向城市", fieldNamePatterns: ["意向.*城市|期望.*城市|工作城市"], semanticKeyPatterns: []},
    control: {type: "custom_city_multi_select", name: "Moka 标签多选城市", tagNames: ["INPUT"], inputTypes: ["text"], readOnly: false,
      signatureDepth: 8, signaturePatterns: ["sd-Input-tag-input-", "sd-Input-tag-container-", "sd-Select-container", "sd-Dropdown-container", "\\bmulti_select_info(?:\\s|-)" ]},
    targetRoles: ["query_input_focus", "city_leaf", "field_title_commit"], reason: "moka_work_city_multi_component_signature",
    evidence: ["FunPlus full production Driver real-page acceptance passed on rc.3, 2026-09-07",
      "one open, unique authorized city leaves, preserve committed tags, one owned title close and complete tag-set readback",
      "option discovery preserves existing selection; no typing, tag removal or alternate Driver; committed tag, closed popup and cleared validation verified"]
  },
  {
    registrationId: "moka.search-select.trusted-focus.v1", adapterCode: "moka.search-select.trusted-focus.v1",
    optionSource: "search",
    routingScope: "shared_component", kind: "specialized", driver: "site_deterministic",
    requiresForeground: false, executionSurface: "background_tab", readbackStrategy: "page_option_exact",
    site: {code:"moka",name:"Moka",hostnamePatterns:[],applicationUrlPatterns:[
      "^https://app\\.mokahr\\.com/(?:campus|social)-recruitment/[^/?#]+/[^/?#]+(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
    ]},
    field: {category:"choice",name:"查询结果",matchPolicy:"advisory",fieldNamePatterns:[],semanticKeyPatterns:[]},
    control: {type:"custom_search_select",name:"Moka 输入检索选择控件",tagNames:["INPUT"],inputTypes:["text"],readOnly:false,
      signatureDepth:8,ownedInputCount:1,signaturePatterns:["sd-Input-input","sd-Select-container","sd-Dropdown-container","\\bstring_info-","^(?![\\s\\S]*compound:)"]},
    targetRoles:["search_input","exact_result","field_title_commit"],reason:"moka_school_search_component_signature",
    evidence:["JoyCastle and CTI full production Driver real-page acceptance passed on rc.4, 2026-09-07",
      "one blank focused input receives one exact query; asynchronous result must be observed before one exact result click",
      "query text is not committed value; no similar school, create-school button, Enter, query retry or alternate Driver",
      "one query and one exact result click; committed display and cleared validation verified; bounded async structure wait accepted"]
  },
  {
    registrationId: "moka.legacy-school-search.trusted-focus.v1", adapterCode: "moka.legacy-school-search.trusted-focus.v1",
    optionSource: "search", routingScope: "shared_component", kind: "specialized", driver: "site_deterministic",
    requiresForeground: false, executionSurface: "background_tab", readbackStrategy: "page_option_exact",
    site: {code:"moka",name:"Moka",hostnamePatterns:[],applicationUrlPatterns:[
      "^https://app\\.mokahr\\.com/(?:campus|social)-recruitment/[^/?#]+/[^/?#]+(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
    ]},
    field: {category:"choice",name:"旧版学校检索",fieldNamePatterns:["(?:^|·\\s*)学校名称(?:\\s|$)"],semanticKeyPatterns:[]},
    control: {type:"custom_search_select",name:"Moka school-input 学校检索",tagNames:["INPUT"],inputTypes:["text"],readOnly:false,
      signatureDepth:8,signaturePatterns:["\\binput-","\\bheader-","\\bschool-select-","\\bschool-input\\b","\\bstring_info-"]},
    targetRoles:["search_input","exact_result","field_title_commit"],reason:"moka_legacy_school_component_signature",
    evidence:["tap4fun 2026-09-08: owned school-list ul school-name exact leaf; query once, select once, input retained after popup closes; candidate acceptance pending"]
  },
  {
    registrationId: "moka.readonly-calling-code.trusted-focus.v1", adapterCode: "moka.readonly-calling-code.trusted-focus.v1",
    routingScope:"shared_component",kind:"specialized",driver:"site_deterministic",
    requiresForeground:false,executionSurface:"background_tab",readbackStrategy:"page_option_exact",
    site:{code:"moka",name:"Moka",hostnamePatterns:[],applicationUrlPatterns:[
      "^https://app\\.mokahr\\.com/(?:campus|social)-recruitment/[^/?#]+/[^/?#]+(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
    ]},
    field:{category:"choice",name:"只读电话区号",fieldNamePatterns:["手机|电话|mobile|phone|telephone"],semanticKeyPatterns:[]},
    control:{type:"custom_flat_select",name:"Moka 只读区号 Select",tagNames:["INPUT"],inputTypes:["text"],readOnly:true,
      signatureDepth:7,signaturePatterns:["sd-Input-input","sd-Select-container","sd-Dropdown-container","\\bcode-","\\bstring_info-"]},
    targetRoles:["control","option_leaf","field_title_commit"],reason:"moka_readonly_code_component_signature",
    evidence:["tap4fun and zlongame 2026-09-08 readonly code Select; executor requires owned paired phone number before any action; candidate acceptance pending"]
  },
  {
    registrationId: "feishu.formily-resume-upload.v1", adapterCode: "feishu.formily-resume-upload.v1",
    routingScope: "shared_component", kind: "specialized", driver: "site_deterministic",
    requiresForeground: false, executionSurface: "background_tab", readbackStrategy: "native_value_exact",
    site: { code: "feishu.jobs", name: "飞书招聘", hostnamePatterns: [], applicationUrlPatterns: [
      "^https://[^/]+\\.jobs\\.feishu\\.cn/[a-zA-Z0-9_-]+/resume/\\d+/apply/?(?:[?#]|$)"
    ] },
    field: { category: "file", name: "简历附件", matchPolicy: "advisory", fieldNamePatterns: [], semanticKeyPatterns: [] },
    control: { type: "async_resume_upload", name: "Formily 异步简历上传", tagNames: ["INPUT"], inputTypes: ["file"],
      readOnly: false, signatureDepth: 9, signaturePatterns: ["\\batsx-upload-btn\\b", "\\buploadResume\\b", "ud-formily-item",
        "data-form-field-name:attachment_resume"] },
    targetRoles: [], reason: "feishu_formily_resume_upload_signature",
    evidence: ["xTool full production upload Driver real-page acceptance passed on rc.3, 2026-09-07",
      "file input is rebuilt on change before asynchronous upload completes; one write, owned committed filename card, explicit error and bounded wait",
      "one upload and exact owned resume.pdf completed card verified with no error; no preview or final submit"]
  },
  {
    registrationId: "moka.flat-select.trusted-focus.v1", routingScope: "shared_component",
    adapterCode: "moka.flat-select.trusted-focus.v1", kind: "specialized", driver: "site_deterministic",
    requiresForeground: false, executionSurface: "background_tab", readbackStrategy: "page_option_exact",
    site: { code: "moka", name: "Moka", hostnamePatterns: [], applicationUrlPatterns: [
      "^https://app\\.mokahr\\.com/(?:campus|social)-recruitment/[^/?#]+/[^/?#]+(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
    ] },
    field: { category: "choice", name: "平面下拉选项", matchPolicy: "advisory", fieldNamePatterns: [], semanticKeyPatterns: [] },
    control: { type: "custom_flat_select", name: "Moka 共享平面下拉控件", tagNames: ["INPUT"],
      inputTypes: ["text", "search"], readOnly: false, signatureDepth: 8,
      signaturePatterns: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container",
        "^(?![\\s\\S]*\\bmulti_select_info(?:\\b|-))", "^(?![\\s\\S]*\\bstring_info-)|compound:"] },
    targetRoles: ["control", "option_leaf", "field_title_commit"], reason: "moka_flat_select_component_signature",
    evidence: ["shared Moka editable Select/Dropdown structure; field names do not select the execution method",
      "stable field rebind before each probe; one control-owned flat menu with wrapped or direct-text leaves; no group headers or cascader/calendar surface",
      "full exact first; otherwise one unique Han/Latin bilingual localized half; trusted pointer and authoritative display/validation readback",
      "a bounded phone wrapper may authorize the product calling-code default policy for candidate or other-person phone fields only when code-* Select/Dropdown and number-* phone-input roles are both present; one leaf selects it, multiple leaves require one exact +86, and ordinary selects retain preexisting-value protection",
      "2026-09-03 bjwgby and 2026-09-06 tap4fun accepted; no activation/retry/reload/submit; see real-page evidence"]
  },
  {
    registrationId: "moka.work-city.trusted-focus.v1",
    routingScope: "shared_component",
    adapterCode: "moka.work-city.trusted-focus.v1",
    kind: "specialized", driver: "site_deterministic",
    requiresForeground: false, executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: { code: "moka", name: "Moka", hostnamePatterns: [], applicationUrlPatterns: [
      "^https://app\\.mokahr\\.com/(?:campus|social)-recruitment/[^/?#]+/[^/?#]+(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
    ] },
    field: { category: "location", name: "意向工作城市",
      fieldNamePatterns: ["意向.*工作.*城市|期望.*工作.*城市|意向城市|期望城市"],
      semanticKeyPatterns: ["(?:intention|preferences).*preferred.?city"] },
    control: { type: "custom_location_cascader", name: "Moka 共享城市选项控件",
      tagNames: ["INPUT"], inputTypes: ["text", "search"], readOnly: false,
      signaturePatterns: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container",
        "^(?![\\s\\S]*\\b(?:bool_info|multi_select_info)(?:\\b|-))"] },
    targetRoles: ["control", "city_leaf", "field_title_commit"],
    reason: "moka_work_city_component_signature",
    evidence: [
      "shared Moka Select/Dropdown city component, not a company allowlist",
      "company-control exceptions take precedence before execution",
      "one control-owned popup; Menu-content-item city leaves exclude province headers",
      "unique live city name/two-Han-character match; exact selected display readback",
      "background trusted pointer, optional single title commit and cleared validation",
      "2026-09-03 bjwgby bilingual city accepted; high-flyer company exception regression passed; see real-page evidence"
    ]
  },
  {
    registrationId: "moka.jsti.birth-date.unsupported-background.v1",
    routingScope: "company_control",
    adapterCode: "unresolved.custom.v1", kind: "unresolved", driver: "unsupported",
    requiresForeground: false, executionSurface: "background_tab", readbackStrategy: "unsupported",
    site: { code: "moka.jsti", name: "苏交科 / Moka", hostnamePatterns: [],
      applicationUrlPatterns: ["^https://app\\.mokahr\\.com/campus-recruitment/jsti/144121(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"] },
    field: { category: "date", name: "苏交科出生日期", fieldNamePatterns: ["出生(?:日期|年月)|birth\\s*date"],
      semanticKeyPatterns: ["birth.*date|birth.*month"] },
    control: { type: "custom_date_picker", name: "尚未验收后台交互的出生日期控件",
      tagNames: ["INPUT"], inputTypes: ["text", "combobox"], readOnly: true, signaturePatterns: ["Dropdown|day_info|picker-addon"] },
    targetRoles: [], reason: "custom_control_without_adapter",
    evidence: ["legacy JSTI birth-date execution depended on foreground activation; no accepted background sequence"]
  },
  {
    registrationId: "feishu.month-period.trusted-pointer.v3",
    routingScope: "shared_component",
    informationRequirement: { kind: "date", precision: "month" },
    adapterCode: "feishu.month-period.trusted-pointer.v3",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "structured_temporal",
    site: {
      code: "feishu.jobs",
      name: "飞书招聘",
      hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https?://[^/]+\\.jobs\\.feishu\\.cn/[a-zA-Z0-9_-]+/resume/\\d+/apply/?(?:[?#]|$)"
      ]
    },
    field: {
      category: "date",
      name: "飞书经历年月区间",
      fieldNamePatterns: ["(?:教育|工作|实习|项目)经历.*(?:开始时间|结束时间)|(?:开始时间|结束时间).*(?:教育|工作|实习|项目)经历"],
      semanticKeyPatterns: ["^other\\.\\d+\\.(?:start|end)_date\\.custom_date_picker", "(?:education|work|internship|project)\\[\\d+\\]\\.(?:start|end)_date\\.custom_date_picker"]
    },
    control: {
      type: "custom_date_picker",
      name: "飞书年月区间控件",
      tagNames: ["DIV"],
      inputTypes: ["custom_date_picker"],
      readOnly: false,
      signaturePatterns: [
        "atsx-date-picker-period-month-label|throne-biz-date-range-picker-input",
        "(?:^|\\s)atsx-date-picker-period-month(?:\\s|$)|throne-biz-date-range-picker-wrapper"
      ]
    },
    targetRoles: ["control", "year_toggle", "year_page_previous", "year_page_next", "year_option", "month_option"],
    reason: "feishu_month_period_signature",
    evidence: [
      "Feishu jobs application URL family",
      "education, work, internship and project start/end month semantics",
      "xTool work ranges are rooted at formily-item-works_list",
      "visible atsx month-period labels or throne date-range endpoint controls",
      "stable section, repeat-index and start/end identity rebind after Formily reconstruction",
      "one instant background viewport preparation before hit testing",
      "one visible application form item and one popup per action",
      "background-target CDP trusted pointer open, optional year-panel expansion, exact year and month selection",
      "Draft month-state extension: uniquely owned open panel and bounded twenty-year page navigation; rc.2 failure reproduced, new installed acceptance pending",
      "exact YYYY-MM endpoint readback and cleared range validation after both endpoints are complete",
      "no keyboard input, DOM value assignment, generic fallback or final submission"
    ]
  },
  {
    registrationId: "feishu.formily-flat-select.trusted-pointer.v1",
    routingScope: "shared_component",
    adapterCode: "feishu.formily-flat-select.trusted-pointer.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "page_option_exact",
    site: {
      code: "feishu.jobs",
      name: "飞书招聘",
      hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https?://[^/]+\\.jobs\\.feishu\\.cn/[a-zA-Z0-9_-]+/resume/\\d+/apply/?(?:[?#]|$)"
      ]
    },
    field: {
      category: "choice",
      name: "飞书 Formily 平面下拉选项",
      matchPolicy: "advisory",
      fieldNamePatterns: [],
      semanticKeyPatterns: []
    },
    control: {
      type: "formily_flat_select",
      name: "飞书 Formily readonly-search Select",
      signatureDepth: 8,
      tagNames: ["INPUT"],
      inputTypes: ["text", "search"],
      readOnly: true,
      signaturePatterns: [
        "ud__select__selector__search__input",
        "ud__select__selector",
        "ud__select",
        "ud-formily-item"
      ]
    },
    targetRoles: ["control", "option_leaf", "field_label_close"],
    reason: "feishu_formily_flat_select_signature",
    evidence: [
      "shared Feishu jobs application URL family, independent of company tenant",
      "one readonly search INPUT inside ud__select__selector and ud-formily-item",
      "one visible flat ud__select__dropdown with exact ud__select__list__item leaves",
      "stable shared field identity rebound before every read or pointer action",
      "one background trusted-pointer open, one exact option selection and optional inert field-label close/commit",
      "committed selection display, closed popup and field-owned validation readback",
      "read-only option discovery returns the same live option list to AI Offer",
      "no keyboard, DOM-value assignment, approximate match, retry or alternate Driver fallback"
    ]
  },
  {
    registrationId: "xtool.formily-repeat-native.v1",
    routingScope: "company_control",
    adapterCode: "xtool.formily-repeat-native.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "native_value_exact",
    site: {
      code: "xtool.feishu",
      name: "xTool / 飞书招聘",
      hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://xtool\\.jobs\\.feishu\\.cn/(?:index|campus|\\d+)/resume/\\d+/apply/?(?:[?#]|$)"
      ]
    },
    field: {
      category: "repeat_native",
      name: "xTool 经历动态文本字段",
      fieldNamePatterns: [
        "(?:教育|工作|实习|项目)经历.*(?:学校|院校|学历|学位|专业|公司|单位|岗位|职位|项目名称|项目角色|角色|描述|职责|技能)"
      ],
      semanticKeyPatterns: [
        "(?:education|work|project)\\[\\d+\\]\\.(?:school|degree|major|company|title|project_name|role|description|skills|link)\\.(?:native|textarea)"
      ]
    },
    control: {
      type: "formily_repeat_native",
      name: "xTool Formily 动态经历原生输入控件",
      signatureDepth: 12,
      tagNames: ["INPUT", "TEXTAREA"],
      inputTypes: ["text", "textarea"],
      readOnly: false,
      signaturePatterns: [
        "formily-item-(?:education|works|work_experience|work|internship|project)_list",
        "data-form-field-(?:name|i18n-name):",
        "^(?![\\s\\S]*\\bud__select\\b)"
      ]
    },
    targetRoles: ["section_root", "repeat_index", "semantic_native_control"],
    reason: "xtool_formily_repeat_native_signature",
    evidence: [
      "exact xTool Feishu application URL family",
      "Formily list root and data-form-field semantic attributes",
      "duplicate element ids and React array-card reconstruction",
      "live section plus repeat-index plus semantic-slot rebind before every write and readback",
      "one native setter transaction with input, change and blur semantics",
      "authoritative value and local validation readback from the reconstructed control",
      "no cached ordinal selector, alternate Driver, retry, refresh, foreground activation or final submission"
    ]
  },
  {
    registrationId: "generic.consent-confirmation.trusted-pointer.v1",
    routingScope: "shared_component",
    adapterCode: "generic.consent-confirmation.trusted-pointer.v1",
    kind: "generic",
    driver: "generic_native",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "checked_state",
    site: {
      code: "cross_site",
      name: "跨站点",
      hostnamePatterns: ["*"],
      applicationUrlPatterns: []
    },
    field: {
      category: "consent",
      name: "隐私、授权或协议确认",
      fieldNamePatterns: [
        "同意|授权|知悉|隐私|个人信息保护|数据处理|声明|协议|agree|accept|consent|privacy|authorize"
      ],
      semanticKeyPatterns: [
        "consent|agreement|privacy|authorization|declaration"
      ]
    },
    control: {
      type: "native_or_aria_consent_checkbox",
      name: "原生或标准 ARIA 协议复选框",
      tagNames: ["INPUT", "DIV", "SPAN", "BUTTON"],
      inputTypes: ["checkbox"],
      readOnly: false,
      signaturePatterns: []
    },
    targetRoles: ["consent_control", "agreement_scroll_surface", "agreement_confirmation"],
    reason: "generic_consent_signature",
    evidence: [
      "cross-site privacy, agreement, authorization or declaration semantics",
      "native checkbox or standard role=checkbox state",
      "nearest single-checkbox semantic row binding independent of ATS class names",
      "unique agreement dialog and unique allowlisted confirmation control",
      "enabled confirmation is attempted directly before any timed fallback",
      "trusted pointer wheel reaches ordinary or cross-origin iframe policy content",
      "bottom-scroll fallback waits ten seconds before confirmation retry",
      "final-submit text is always excluded",
      "closed dialog and authoritative checked/aria-checked readback"
    ]
  },
  {
    registrationId: "moka.recruiting-source.trusted-focus.v1",
    routingScope: "shared_component",
    adapterCode: "moka.recruiting-source.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "page_option_exact",
    site: {
      code: "moka",
      name: "Moka",
      hostnamePatterns: ["mokahr.com", "*.mokahr.com"],
      applicationUrlPatterns: [
        "^https?://(?:127\\.0\\.0\\.1|localhost)/__recruiting_ai_test__/moka(?:[?#]|$)"
      ]
    },
    field: {
      category: "recruiting_source",
      name: "招聘信息来源字段",
      fieldNamePatterns: [
        "信息来源(?:渠道)?|来源渠道|招聘渠道|简历渠道|(?:招聘信息(?:获取|获知)|获取招聘信息)(?:的)?渠道|获知.*(?:渠道|途径)"
      ],
      semanticKeyPatterns: [
        "recruiting.?source|source.?channel|job.?source"
      ]
    },
    control: {
      type: "custom_recruiting_source_select",
      name: "Moka 招聘信息来源自定义下拉控件",
      tagNames: ["INPUT"],
      inputTypes: ["text", "search"],
      readOnly: false,
      signaturePatterns: [
        "sd-Input-input",
        "sd-Select-container",
        "sd-Dropdown-container"
      ]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "moka_recruiting_source_signature",
    evidence: [
      "Moka campus/social application URL family",
      "recruiting information-source field semantics",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "flat Menu-content-item option-label popup",
      "unique exact visible option-only selection",
      "React rebuild leaves native input value empty and commits through display-value",
      "selected display can precede required-validation clearance",
      "Canrui selected-source title containing 请选择 is not field validation evidence",
      "one unique inert field-title trusted pointer click commits blur validation",
      "background-target CDP trusted pointer with focus emulation",
      "no keyboard, DOM value, native click, refresh, retry or alternate Driver fallback",
      "exact display value, closed popup and cleared field validation readback"
    ]
  },
  {
    registrationId: "moka.sina.weibo-frequency.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.sina.weibo-frequency.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "page_option_exact",
    site: {
      code: "moka.sina",
      name: "新浪 / Moka",
      hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/sina/43536(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "custom_question",
      name: "微博使用频率字段",
      fieldNamePatterns: ["(?:您)?使用微博的频率"],
      semanticKeyPatterns: ["weibo.?use.?frequency"]
    },
    control: {
      type: "custom_flat_select",
      name: "新浪 Moka 微博使用频率自定义下拉控件",
      tagNames: ["INPUT"],
      inputTypes: ["text", "search"],
      readOnly: false,
      signaturePatterns: [
        "sd-Input-input",
        "sd-Select-container",
        "sd-Dropdown-container"
      ]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "sina_weibo_frequency_signature",
    evidence: [
      "exact Sina campus campaign 43536 application URL family",
      "exact required field title for Weibo usage frequency",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "flat Menu-content-item option-label popup",
      "unique exact visible option-only selection",
      "one unique inert field-title trusted pointer click commits blur validation",
      "background-target CDP trusted pointer with focus emulation",
      "no keyboard, DOM value, native click, refresh, retry or alternate Driver fallback",
      "exact display value, closed popup and cleared field validation readback"
    ]
  },
  {
    registrationId: "moka.eqhr.travel-acceptance.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.eqhr.travel-acceptance.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "page_option_exact",
    site: {
      code: "moka.eqhr",
      name: "易控智驾 / Moka",
      hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/eqhr/39786(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "custom_question",
      name: "是否接受出差字段",
      fieldNamePatterns: ["是否接受出差"],
      semanticKeyPatterns: ["travel.?acceptance|accept.?travel"]
    },
    control: {
      type: "custom_flat_select",
      name: "易控智驾 Moka 出差意愿自定义下拉控件",
      tagNames: ["INPUT"],
      inputTypes: ["text", "search"],
      readOnly: false,
      signaturePatterns: [
        "sd-Input-input",
        "sd-Select-container",
        "sd-Dropdown-container"
      ]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "eqhr_travel_acceptance_signature",
    evidence: [
      "exact EQHR campus campaign 39786 application URL family",
      "exact required field title for travel acceptance",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "flat options 是、否、不确定",
      "unique exact visible option-only selection",
      "one unique inert field-title trusted pointer click commits blur validation",
      "background-target CDP trusted pointer with focus emulation",
      "no DOM value, native click, refresh, retry or alternate Driver fallback",
      "exact display value, closed popup and cleared field validation readback"
    ]
  },
  {
    registrationId: "moka.yongxing.ethnicity.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.yongxing.ethnicity.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "page_option_exact",
    site: {
      code: "moka.yongxing",
      name: "甬兴证券 / Moka",
      hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/yongxingsec/27127(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "identity",
      name: "民族字段",
      fieldNamePatterns: ["^民族$"],
      semanticKeyPatterns: ["ethnicity|nationality"]
    },
    control: {
      type: "custom_flat_select",
      name: "甬兴证券 Moka 民族自定义下拉控件",
      tagNames: ["INPUT"],
      inputTypes: ["text", "search"],
      readOnly: false,
      signaturePatterns: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container"]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "yongxing_ethnicity_signature",
    evidence: [
      "exact Yongxing Securities campus campaign 27127 application URL family",
      "exact ethnicity field title",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "unique exact visible option-only selection",
      "one unique inert field-title trusted pointer click commits blur validation",
      "exact display value, closed popup and cleared validation readback"
    ]
  },
  {
    registrationId: "moka.sungrow.identity-document-type.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.sungrow.identity-document-type.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "page_option_exact",
    site: {
      code: "moka.sungrow",
      name: "阳光电源 / Moka",
      hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/sungrow/94416(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "identity_document",
      name: "证件类型字段",
      fieldNamePatterns: ["^(?:证件号码|证件类型)$"],
      semanticKeyPatterns: ["identity.?document.?type"]
    },
    control: {
      type: "custom_flat_select",
      name: "阳光电源 Moka 证件类型自定义下拉控件",
      tagNames: ["INPUT"],
      inputTypes: ["text", "search"],
      readOnly: false,
      signaturePatterns: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container"]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "sungrow_identity_document_type_signature",
    evidence: [
      "exact Sungrow campus campaign 94416 application URL family",
      "exact identity-document number or type field root",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "unique exact visible option-only selection",
      "one unique inert field-title trusted pointer click commits blur validation",
      "exact display value, closed popup and cleared field validation readback"
    ]
  },
  {
    registrationId: "moka.sungrow.relative-employment.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.sungrow.relative-employment.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "page_option_exact",
    site: {
      code: "moka.sungrow",
      name: "阳光电源 / Moka",
      hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/sungrow/94416(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "custom_question",
      name: "亲属任职情况字段",
      fieldNamePatterns: ["有无直系或旁系亲属在本单位(?:（含其他关联公司）)?任职"],
      semanticKeyPatterns: ["relative.?employment|kinship.?employment"]
    },
    control: {
      type: "custom_flat_select",
      name: "阳光电源 Moka 亲属任职情况自定义下拉控件",
      tagNames: ["INPUT"],
      inputTypes: ["text", "search"],
      readOnly: false,
      signaturePatterns: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container"]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "sungrow_relative_employment_signature",
    evidence: [
      "exact Sungrow campus campaign 94416 application URL family",
      "exact relatives-in-company required question",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "unique exact visible option-only selection",
      "one unique inert field-title trusted pointer click commits blur validation",
      "exact display value, closed popup and cleared field validation readback"
    ]
  },
  {
    registrationId: "moka.deepseek.location.trusted-focus.v4",
    routingScope: "company_control",
    adapterCode: "moka.deepseek.location.trusted-focus.v4",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.deepseek",
      name: "DeepSeek / Moka",
      hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/social-recruitment/high-flyer/140576(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location",
      name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市|期望.*工作.*城市|意向城市|期望城市"],
      semanticKeyPatterns: ["preferred.?city|preferred.?location|intention.*city|intention.*location"]
    },
    control: {
      type: "custom_location_cascader",
      name: "DeepSeek Moka 城市级联控件",
      tagNames: ["INPUT"],
      inputTypes: ["text"],
      readOnly: false,
      signaturePatterns: [
        "sd-Input-input",
        "sd-Select-container",
        "sd-Dropdown-container",
        "选择意向工作城市"
      ]
    },
    targetRoles: [],
    reason: "deepseek_location_signature",
    evidence: [
      "exact DeepSeek social-recruitment tenant and application URL family",
      "preferred work-city field semantics",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "DeepSeek work-city placeholder",
      "province header and city leaf can repeat the same municipality text",
      "one isolated instant control scroll before the open transaction",
      "pre-click popup lifecycle observer and mutation-free post-click polling",
      "live semantic hit-target revalidation immediately before each trusted pointer event",
      "unique exact visible option-label under Menu-content-item",
      "background-target CDP trusted pointer open and leaf selection with focus emulation",
      "Emulation.setFocusEmulationEnabled without Page.bringToFront or tab activation",
      "single-pass detect, prepare, open, select, optional commit and readback state machine",
      "nested field-title containment chain collapsed to one inert blur target",
      "structured at-most-once action ledger and popup lifecycle diagnostics",
      "no generic, DOM-value, keyboard, refresh or retry fallback",
      "committed display value, closed popup and cleared field validation readback"
    ]
  },
  {
    registrationId: "moka.linctex.location.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.linctex.location.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.linctex",
      name: "Linctex / Moka",
      hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/social-recruitment/linctex/46055(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location",
      name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市|期望.*工作.*城市|意向城市|期望城市"],
      semanticKeyPatterns: ["preferred.?city|preferred.?location|intention.*city|intention.*location"]
    },
    control: {
      type: "custom_location_cascader",
      name: "Linctex Moka 城市级联控件",
      tagNames: ["INPUT"],
      inputTypes: ["text"],
      readOnly: false,
      signaturePatterns: [
        "sd-Input-input",
        "sd-Select-container",
        "sd-Dropdown-container",
        "选择意向工作城市"
      ]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "linctex_location_signature",
    evidence: [
      "exact Linctex social-recruitment tenant and campaign URL family",
      "preferred work-city field semantics",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "Linctex work-city placeholder",
      "province header 浙江 and city leaf 杭州市 are structurally distinct",
      "one focus-emulated trusted pointer opens the popup for option discovery",
      "only visible Menu-content-item option-label leaves are returned to the user",
      "one inert field-title trusted pointer closes discovery without selecting an option",
      "empty display value and closed popup are re-read after discovery",
      "no generic, DOM-value, keyboard, refresh, retry or alternate Driver fallback",
      "the same registered Driver performs a later user-confirmed city selection"
    ]
  },
  {
    registrationId: "moka.yadea.location.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.yadea.location.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.yadea",
      name: "Yadea / Moka",
      hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/social-recruitment/yadea/144891(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location",
      name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市|期望.*工作.*城市|意向城市|期望城市"],
      semanticKeyPatterns: ["preferred.?city|preferred.?location|intention.*city|intention.*location"]
    },
    control: {
      type: "custom_location_cascader",
      name: "Yadea Moka 城市级联控件",
      tagNames: ["INPUT"],
      inputTypes: ["text"],
      readOnly: false,
      signaturePatterns: [
        "sd-Input-input",
        "sd-Select-container",
        "sd-Dropdown-container",
        "选择意向工作城市"
      ]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "yadea_location_signature",
    evidence: [
      "exact Yadea social-recruitment tenant and campaign URL family",
      "preferred work-city field semantics",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "Yadea work-city placeholder",
      "live option discovery distinguishes the province group from the city leaf",
      "only visible Menu-content-item option-label leaves are returned to the user",
      "no generic, DOM-value, keyboard, refresh, retry or alternate Driver fallback",
      "a later user-confirmed city uses the same registered Driver for selection and readback"
    ]
  },
  {
    registrationId: "moka.brother.location.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.brother.location.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.brother",
      name: "Brother / Moka",
      hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/social-recruitment/brother/150715(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location",
      name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市|期望.*工作.*城市|意向城市|期望城市"],
      semanticKeyPatterns: ["preferred.?city|preferred.?location|intention.*city|intention.*location"]
    },
    control: {
      type: "custom_location_cascader",
      name: "Brother Moka 城市级联控件",
      tagNames: ["INPUT"],
      inputTypes: ["text"],
      readOnly: false,
      signaturePatterns: [
        "sd-Input-input",
        "sd-Select-container",
        "sd-Dropdown-container",
        "选择意向工作城市"
      ]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "brother_location_signature",
    evidence: [
      "exact Brother social-recruitment tenant and campaign URL family",
      "preferred work-city field semantics",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "Brother work-city placeholder",
      "live option discovery distinguishes the province group from the city leaf",
      "only visible Menu-content-item option-label leaves are returned to the user",
      "no generic, DOM-value, keyboard, refresh, retry or alternate Driver fallback",
      "a later user-confirmed city uses the same registered Driver for selection and readback"
    ]
  },
  {
    registrationId: "moka.phlexing.location.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.phlexing.location.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.phlexing",
      name: "Phlexing / Moka",
      hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/phlexing/100123(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location",
      name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市|期望.*工作.*城市|意向城市|期望城市"],
      semanticKeyPatterns: ["preferred.?city|preferred.?location|intention.*city|intention.*location"]
    },
    control: {
      type: "custom_location_cascader",
      name: "Phlexing Moka 城市级联控件",
      tagNames: ["INPUT"],
      inputTypes: ["text"],
      readOnly: false,
      signaturePatterns: [
        "sd-Input-input",
        "sd-Select-container",
        "sd-Dropdown-container",
        "选择意向工作城市"
      ]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "phlexing_location_signature",
    evidence: [
      "exact Phlexing Moka campus application URL family",
      "preferred work-city field semantics",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "Phlexing work-city placeholder",
      "option-only cascader: unavailable requested city must leave the field unchanged",
      "background-target CDP trusted pointer with focus emulation",
      "committed display value, closed popup and cleared field validation readback"
    ]
  },
  {
    registrationId: "moka.zte.location.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.zte.location.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.zte", name: "中兴通讯 / Moka", hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/ztehr4/150449(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location", name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市"],
      semanticKeyPatterns: ["preferred.?city|intention.*city"]
    },
    control: {
      type: "custom_location_cascader", name: "中兴 Moka 城市级联控件",
      tagNames: ["INPUT"], inputTypes: ["text"], readOnly: false,
      signaturePatterns: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container", "选择意向工作城市"]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "zte_location_signature",
    evidence: [
      "ZTE campus campaign 150449: editable INPUT with Select/Dropdown ancestry",
      "city leaves under Menu-content-item, separate from Guangdong province header",
      "2026-09-03 user-run url-check-v2 proof uses production trusted-focus discovery and selection Drivers",
      "2026-09-03 mixed-control proof: neighbouring editable native city stays on generic.native.text.v1, not this select Driver",
      "real option Shenzhen; exact display 深圳市, popup closed and field validation cleared; no application submitted"
    ]
  },
  {
    registrationId: "moka.metax.location.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.metax.location.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.metax",
      name: "MetaX / Moka",
      hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/metax-tech/58131(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location",
      name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市|期望.*工作.*城市|意向城市|期望城市"],
      semanticKeyPatterns: ["preferred.?city|preferred.?location|intention.*city|intention.*location"]
    },
    control: {
      type: "custom_location_cascader",
      name: "MetaX Moka 城市级联控件",
      tagNames: ["INPUT"],
      inputTypes: ["text"],
      readOnly: false,
      signaturePatterns: [
        "sd-Input-input",
        "sd-Select-container",
        "sd-Dropdown-container",
        "选择意向工作城市"
      ]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "metax_location_signature",
    evidence: [
      "exact MetaX Moka campus application URL family",
      "preferred work-city field semantics",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "MetaX province and city leaf popup",
      "background-target CDP trusted pointer with focus emulation",
      "unavailable requested city returns the live popup choices",
      "committed display value, closed popup and cleared field validation readback"
    ]
  },
  {
    registrationId: "moka.jsti.location.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.jsti.location.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.jsti",
      name: "苏交科集团 / Moka",
      hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/jsti/144121(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location",
      name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市|期望.*工作.*城市|preferred.*work.*city"],
      semanticKeyPatterns: ["preferred.?city|preferred.?location|intention.*city|intention.*location"]
    },
    control: {
      type: "custom_location_cascader",
      name: "苏交科 Moka 中英双语城市级联控件",
      tagNames: ["INPUT"],
      inputTypes: ["text"],
      readOnly: false,
      signaturePatterns: [
        "sd-Input-input",
        "sd-Select-container",
        "sd-Dropdown-container",
        "选择意向工作城市|Select preferred work city"
      ]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "jsti_location_signature",
    evidence: [
      "exact JSTI Moka campus application URL family",
      "bilingual preferred work-city field semantics",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "single province and city leaf popup observed on the 2027 campus job",
      "background-target CDP trusted pointer with focus emulation",
      "single live city option is selected without asking for an unavailable alternative",
      "committed display value, closed popup and cleared field validation readback"
    ]
  },
  {
    registrationId: "moka.year-month-select.trusted-pointer.v1",
    routingScope: "shared_component",
    adapterCode: "moka.year-month-select.trusted-pointer.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "structured_temporal",
    site: {
      code: "moka",
      name: "Moka",
      hostnamePatterns: ["mokahr.com", "*.mokahr.com"],
      applicationUrlPatterns: [
        "^https?://(?:127\\.0\\.0\\.1|localhost)/__recruiting_ai_test__/moka(?:[?#]|$)"
      ]
    },
    field: {
      category: "date",
      name: "Moka 独立年/月日期字段",
      fieldNamePatterns: [
        "(?:毕业|结束|开始|入学|就读|到岗|日期|时间|年月).*(?:年|月)$",
        "(?:graduation|education|start|end|date|month|year).*(?:year|month)"
      ],
      semanticKeyPatterns: [
        "(?:graduation|education|start|end|date|month|year)"
      ]
    },
    control: {
      type: "custom_year_month_select",
      name: "Moka 年/月分离下拉控件",
      tagNames: ["INPUT"],
      inputTypes: ["text"],
      readOnly: null,
      signaturePatterns: [
        "sd-Select|Select-container|select-container",
        "(?:^|\\s)(?:年|月)(?:\\s|$)"
      ]
    },
    targetRoles: ["control", "year_option", "month_option"],
    reason: "moka_year_month_select_signature",
    evidence: [
      "Moka campus/social application URL family",
      "education and other temporal year/month field semantics",
      "separate INPUT controls with Moka Select container and exact year/month placeholder",
      "rendered option text is authoritative when title metadata is stale",
      "background-target CDP focus emulation without activating the recruitment tab",
      "background-target CDP trusted pointer for opening and selecting each split date part",
      "year selection is followed by React-stable re-observation before month selection",
      "exact year or numeric month display readback and cleared local validation",
      "no keyboard, DOM value, native click, generic combobox or alternate Driver fallback"
    ]
  },
  {
    registrationId: "moka.sina.location.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.sina.location.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.sina", name: "新浪 / Moka", hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/sina/43536(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location", name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市"],
      semanticKeyPatterns: ["preferred.?city|intention.*city"]
    },
    control: {
      type: "custom_location_cascader", name: "新浪 Moka 城市级联控件",
      tagNames: ["INPUT"], inputTypes: ["text"], readOnly: false,
      signaturePatterns: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container", "选择意向工作城市"]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "sina_location_signature",
    evidence: [
      "exact Sina campus campaign 43536 application URL family",
      "preferred work-city field semantics",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "one visible Beijing city leaf under Menu-content-item option-label",
      "trusted pointer open and exact leaf selection rebuild the React control",
      "exact display 北京市, popup closed and field validation cleared",
      "no preview or final submission during control acceptance"
    ]
  },
  {
    registrationId: "moka.xiwang.location.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.xiwang.location.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.xiwang", name: "希望学 / Moka", hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/xiwang/146380(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location", name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市"],
      semanticKeyPatterns: ["preferred.?city|intention.*city"]
    },
    control: {
      type: "custom_location_cascader", name: "希望学 Moka 城市级联控件",
      tagNames: ["INPUT"], inputTypes: ["text"], readOnly: false,
      signaturePatterns: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container", "选择意向工作城市"]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "xiwang_location_signature",
    evidence: [
      "exact Xiwang campus campaign 146380 application URL family",
      "preferred work-city field semantics",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "one visible Jinan city leaf below the Shandong province title",
      "trusted pointer open and exact leaf selection rebuild the React control",
      "exact display 济南市, popup closed and field validation cleared",
      "no preview or final submission during control acceptance"
    ]
  },
  {
    registrationId: "moka.yinli.location.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.yinli.location.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.yinli", name: "引力传媒 / Moka", hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/yinli/148676(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location", name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市"],
      semanticKeyPatterns: ["preferred.?city|intention.*city"]
    },
    control: {
      type: "custom_location_cascader", name: "引力传媒 Moka 城市级联控件",
      tagNames: ["INPUT"], inputTypes: ["text"], readOnly: false,
      signaturePatterns: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container", "选择意向工作城市"]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "yinli_location_signature",
    evidence: [
      "exact Yinli campus campaign 148676 application URL family",
      "preferred work-city field semantics",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "one visible Changsha city leaf below the Hunan province title",
      "trusted pointer open and exact leaf selection rebuild the React control",
      "exact display 长沙市, popup closed and field validation cleared",
      "no preview or final submission during control acceptance"
    ]
  },
  {
    registrationId: "moka.wzgroup.location.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.wzgroup.location.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.wzgroup", name: "物产中大 / Moka", hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/wzgroup/76099(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location", name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市"],
      semanticKeyPatterns: ["preferred.?city|intention.*city"]
    },
    control: {
      type: "custom_location_cascader", name: "物产中大 Moka 城市级联控件",
      tagNames: ["INPUT"], inputTypes: ["text"], readOnly: false,
      signaturePatterns: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container", "选择意向工作城市"]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "wzgroup_location_signature",
    evidence: [
      "exact WZ Group campus campaign 76099 application URL family",
      "preferred work-city field semantics",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "one selectable Shandong leaf distinct from the province header",
      "trusted pointer open and exact leaf selection rebuild the React control",
      "exact display 山东, popup closed and field validation cleared",
      "no preview or final submission during control acceptance"
    ]
  },
  {
    registrationId: "moka.transwarp.location.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.transwarp.location.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.transwarp", name: "星环科技 / Moka", hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/transwarp/3196(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location", name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市"],
      semanticKeyPatterns: ["preferred.?city|intention.*city"]
    },
    control: {
      type: "custom_location_cascader", name: "星环科技 Moka 城市级联控件",
      tagNames: ["INPUT"], inputTypes: ["text"], readOnly: false,
      signaturePatterns: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container", "选择意向工作城市"]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "transwarp_location_signature",
    evidence: [
      "exact Transwarp campus campaign 3196 application URL family",
      "preferred work-city field semantics",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "one visible Shanghai city leaf below the Shanghai province title",
      "trusted pointer open and exact leaf selection rebuild the React control",
      "exact display 上海市, popup closed and field validation cleared",
      "no preview or final submission during control acceptance"
    ]
  },
  {
    registrationId: "moka.newgrand.location.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.newgrand.location.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.newgrand", name: "新中大科技 / Moka", hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/newgrand/151701(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location", name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市"],
      semanticKeyPatterns: ["preferred.?city|intention.*city"]
    },
    control: {
      type: "custom_location_cascader", name: "新中大科技 Moka 城市级联控件",
      tagNames: ["INPUT"], inputTypes: ["text"], readOnly: false,
      signaturePatterns: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container", "选择意向工作城市"]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "newgrand_location_signature",
    evidence: [
      "exact Newgrand campus campaign 151701 application URL family",
      "preferred work-city field semantics",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "one visible Hangzhou city leaf below the Zhejiang province title",
      "trusted pointer open and exact leaf selection rebuild the React control",
      "exact display 杭州市, popup closed and field validation cleared",
      "no preview or final submission during control acceptance"
    ]
  },
  {
    registrationId: "moka.newonder.location.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.newonder.location.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.newonder", name: "新华都 / Moka", hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/newonder/146673(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location", name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市"],
      semanticKeyPatterns: ["preferred.?city|intention.*city"]
    },
    control: {
      type: "custom_location_cascader", name: "新华都 Moka 城市级联控件",
      tagNames: ["INPUT"], inputTypes: ["text"], readOnly: false,
      signaturePatterns: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container", "选择意向工作城市"]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "newonder_location_signature",
    evidence: [
      "exact Newonder campus campaign 146673 application URL family",
      "preferred work-city field semantics",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "one selectable Beijing leaf distinct from the province header",
      "trusted pointer open and exact leaf selection rebuild the React control",
      "exact display 北京市, popup closed and field validation cleared",
      "no preview or final submission during control acceptance"
    ]
  },
  {
    registrationId: "moka.wandacm.location.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.wandacm.location.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.wandacm", name: "珠海万达商管 / Moka", hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/wandacm/164049(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location", name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市"],
      semanticKeyPatterns: ["preferred.?city|intention.*city"]
    },
    control: {
      type: "custom_location_cascader", name: "珠海万达商管 Moka 城市级联控件",
      tagNames: ["INPUT"], inputTypes: ["text"], readOnly: false,
      signaturePatterns: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container", "选择意向工作城市"]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "wandacm_location_signature",
    evidence: [
      "exact Wandacm campus campaign 164049 application URL family",
      "preferred work-city field semantics",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "multiple real city leaves remain distinct from their province headers",
      "trusted pointer open and exact Zhuhai leaf selection rebuild the React control",
      "exact display 珠海市, popup closed and field validation cleared",
      "no preview or final submission during control acceptance"
    ]
  },
  {
    registrationId: "moka.innostar.location.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.innostar.location.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.innostar", name: "昕原半导体 / Moka", hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/social-recruitment/innostar1/46008(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location", name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市"],
      semanticKeyPatterns: ["preferred.?city|intention.*city"]
    },
    control: {
      type: "custom_location_cascader", name: "昕原半导体 Moka 城市级联控件",
      tagNames: ["INPUT"], inputTypes: ["text"], readOnly: false,
      signaturePatterns: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container", "选择意向工作城市"]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "innostar_location_signature",
    evidence: [
      "exact Innostar social campaign 46008 application URL family",
      "preferred work-city field semantics",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "one selectable Shanghai city leaf distinct from the province header",
      "trusted pointer open and exact leaf selection rebuild the React control",
      "exact display 上海市, popup closed and field validation cleared",
      "no preview or final submission during control acceptance"
    ]
  },
  {
    registrationId: "moka.ascenpower.location.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.ascenpower.location.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.ascenpower", name: "芯粤能半导体 / Moka", hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/ascenpower/166280(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location", name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市"],
      semanticKeyPatterns: ["preferred.?city|intention.*city"]
    },
    control: {
      type: "custom_location_cascader", name: "芯粤能半导体 Moka 城市级联控件",
      tagNames: ["INPUT"], inputTypes: ["text"], readOnly: false,
      signaturePatterns: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container", "选择意向工作城市"]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "ascenpower_location_signature",
    evidence: [
      "exact Ascenpower campus campaign 166280 application URL family",
      "preferred work-city field semantics",
      "editable text INPUT inside Moka Select and Dropdown containers",
      "one selectable Guangzhou city leaf distinct from the province header",
      "trusted pointer selection rebuilds the React control and a unique field-title commit closes the popup",
      "exact display 广州市, popup closed and field validation cleared",
      "no preview or final submission during control acceptance"
    ]
  },
  {
    registrationId: "moka.gclpower.location.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.gclpower.location.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.gclpower", name: "协鑫能科 / Moka", hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/gclpower/140979(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location", name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市"],
      semanticKeyPatterns: ["preferred.?city|intention.*city"]
    },
    control: {
      type: "custom_location_cascader", name: "协鑫能科 Moka 城市级联控件",
      tagNames: ["INPUT"], inputTypes: ["text"], readOnly: false,
      signaturePatterns: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container", "选择意向工作城市"]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "gclpower_location_signature",
    evidence: [
      "exact GCL Power campus campaign 140979 application URL family",
      "one visible Jiaxing city leaf below the Zhejiang province title",
      "trusted pointer open and exact leaf selection rebuild the React control",
      "exact display 嘉兴市, popup closed and field validation cleared",
      "no preview or final submission during control acceptance"
    ]
  },
  {
    registrationId: "moka.xiaoying.location.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.xiaoying.location.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.xiaoying", name: "小赢科技 / Moka", hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/xiaoying/148851(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location", name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市"],
      semanticKeyPatterns: ["preferred.?city|intention.*city"]
    },
    control: {
      type: "custom_location_cascader", name: "小赢科技 Moka 城市级联控件",
      tagNames: ["INPUT"], inputTypes: ["text"], readOnly: false,
      signaturePatterns: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container", "选择意向工作城市"]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "xiaoying_location_signature",
    evidence: [
      "exact Xiaoying campus campaign 148851 application URL family",
      "one visible Shenzhen city leaf below the Guangdong province title",
      "trusted pointer open and exact leaf selection rebuild the React control",
      "exact display 深圳市, popup closed and field validation cleared",
      "no preview or final submission during control acceptance"
    ]
  },
  {
    registrationId: "moka.simceredx.location.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.simceredx.location.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.simceredx", name: "先声诊断 / Moka", hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/simceredx/74124(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location", name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市"],
      semanticKeyPatterns: ["preferred.?city|intention.*city"]
    },
    control: {
      type: "custom_location_cascader", name: "先声诊断 Moka 城市级联控件",
      tagNames: ["INPUT"], inputTypes: ["text"], readOnly: false,
      signaturePatterns: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container", "选择意向工作城市"]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "simceredx_location_signature",
    evidence: [
      "exact SimcereDx campus campaign 74124 application URL family",
      "one visible Shenyang city leaf below the Liaoning province title",
      "trusted pointer open and exact leaf selection rebuild the React control",
      "exact display 沈阳市, popup closed and field validation cleared",
      "no preview or final submission during control acceptance"
    ]
  },
  {
    registrationId: "moka.eqhr.location.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.eqhr.location.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.eqhr", name: "易控智驾 / Moka", hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/eqhr/39786(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location", name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市"],
      semanticKeyPatterns: ["preferred.?city|intention.*city"]
    },
    control: {
      type: "custom_location_cascader", name: "易控智驾 Moka 城市级联控件",
      tagNames: ["INPUT"], inputTypes: ["text"], readOnly: false,
      signaturePatterns: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container", "选择意向工作城市"]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "eqhr_location_signature",
    evidence: [
      "exact EQHR campus campaign 39786 application URL family",
      "two real city leaves: Beijing and Zhengzhou, distinct from province headers",
      "trusted pointer open and exact Beijing leaf selection rebuild the React control",
      "exact display 北京市, popup closed and field validation cleared",
      "no preview or final submission during control acceptance"
    ]
  },
  {
    registrationId: "moka.xgd.location.trusted-focus.v1",
    routingScope: "company_control",
    adapterCode: "moka.xgd.location.trusted-focus.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_city_semantic",
    site: {
      code: "moka.xgd", name: "新国都 / Moka", hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/xgd/7850(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "location", name: "意向工作城市字段",
      fieldNamePatterns: ["意向.*工作.*城市"],
      semanticKeyPatterns: ["preferred.?city|intention.*city"]
    },
    control: {
      type: "custom_location_cascader", name: "新国都 Moka 城市级联控件",
      tagNames: ["INPUT"], inputTypes: ["text"], readOnly: false,
      signaturePatterns: ["sd-Input-input", "sd-Select-container", "sd-Dropdown-container", "选择意向工作城市"]
    },
    targetRoles: ["control", "option_leaf", "field_title_commit"],
    reason: "xgd_location_signature",
    evidence: [
      "exact XGD campus campaign 7850 application URL family",
      "one visible Shenzhen city leaf below the Guangdong province title",
      "trusted pointer open and exact Shenzhen leaf selection rebuild the React control",
      "exact display 深圳市, popup closed and field validation cleared",
      "no preview or final submission during control acceptance"
    ]
  },
  {
    registrationId: "moka.native-place.cascader.trusted-pointer.v1",
    routingScope: "shared_component",
    informationRequirement: { kind: "region", level: "city" },
    adapterCode: "moka.native-place.cascader.trusted-pointer.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "administrative_hierarchy_semantic",
    site: {
      code: "moka",
      name: "Moka",
      hostnamePatterns: ["mokahr.com", "*.mokahr.com"],
      applicationUrlPatterns: [
        "^https?://(?:127\\.0\\.0\\.1|localhost)/__recruiting_ai_test__/moka(?:[?#]|$)"
      ]
    },
    field: {
      category: "location",
      name: "籍贯字段",
      matchPolicy: "advisory",
      fieldNamePatterns: [],
      semanticKeyPatterns: []
    },
    control: {
      type: "custom_native_place_cascader",
      name: "Moka 省市区籍贯级联控件",
      tagNames: ["INPUT"],
      inputTypes: ["text"],
      readOnly: true,
      signatureDepth: 8,
      signaturePatterns: [
        "Dropdown-container|dropdown-container",
        "(?:^|\\s)location_info(?:-|_|\\s|$)"
      ]
    },
    targetRoles: [],
    reason: "moka_native_place_signature",
    evidence: [
      "Moka application URL",
      "readonly INPUT inside the observed location_info component",
      "Moka Dropdown ancestor",
      "automatically advanced province, city and optional district lists with explicit confirmation",
      "background-target CDP trusted pointer with focus emulation; verified on the JXW native-place cascader without tab activation",
      "trusted CDP wheel and pointer for page positioning, administrative selection and confirmation",
      "no value mutation, keyboard input or generic city fallback",
      "complete three-level display, popup-close and field-validation readback"
    ]
  },
  {
    registrationId: "moka.zuoyebang.education-end-month.trusted-pointer.v1",
    routingScope: "company_control",
    informationRequirement: { kind: "date", precision: "month" },
    adapterCode: "moka.zuoyebang.education-end-month.trusted-pointer.v1",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "structured_temporal",
    site: {
      code: "moka.zuoyebang",
      name: "作业帮 / Moka",
      hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/zuoyebang/144908(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "date",
      name: "作业帮教育经历结束年月字段",
      fieldNamePatterns: [],
      semanticKeyPatterns: ["^education\\.end_date\\.native(?:\\s|$)"]
    },
    control: {
      type: "custom_date_picker",
      name: "作业帮 Moka 教育结束年月日历控件",
      tagNames: ["INPUT"],
      inputTypes: [],
      readOnly: true,
      signaturePatterns: [
        "Dropdown-container|dropdown-container",
        "day_info",
        "结束.*YYYY[/.-]MM(?![/.-]DD)"
      ]
    },
    targetRoles: [
      "control", "year_header", "month_header", "year_navigation", "month_navigation",
      "decade_navigation", "year_option", "month_option"
    ],
    reason: "moka_zuoyebang_education_end_month_signature",
    evidence: [
      "exact Zuoyebang campus tenant 144908 application URL family",
      "education.end_date.native stable semantic identity",
      "education history end-time field label",
      "readonly INPUT inside a Moka Dropdown with day_info label",
      "control-owned 结束（YYYY/MM） month-only placeholder",
      "shared target-level viewport correction for fixed navigation and off-screen targets",
      "background target focus emulation and trusted CDP pointer only",
      "exact YYYY-MM readback, closed popup and cleared field validation",
      "no keyboard, DOM value, retry or alternate Driver fallback"
    ]
  },
  {
    registrationId: "moka.tap4fun.birth-date.trusted-pointer.v2",
    routingScope: "company_control",
    informationRequirement: { kind: "date", precision: "day" },
    adapterCode: "moka.tap4fun.birth-date.trusted-pointer.v2",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "structured_temporal",
    site: {
      code: "moka.tap4fun",
      name: "tap4fun / Moka",
      hostnamePatterns: [],
      applicationUrlPatterns: [
        "^https://app\\.mokahr\\.com/campus-recruitment/tap4fun/291(?:\\?[^#]*)?#/job/[^/?#]+/apply(?:[/?#]|$)"
      ]
    },
    field: {
      category: "date",
      name: "tap4fun 出生日期字段",
      fieldNamePatterns: ["出生(?:日期|年月)|birth[_.\\s-]*(?:date|month)"],
      semanticKeyPatterns: ["birth[_.\\s-]*(?:date|month)|basic.*birth"]
    },
    control: {
      type: "custom_date_picker",
      name: "tap4fun Moka 日历型出生日期控件",
      tagNames: ["INPUT"],
      inputTypes: [],
      readOnly: true,
      signaturePatterns: [
        "Dropdown-container|dropdown-container",
        "day_info|picker-addon|日期|年月日"
      ]
    },
    targetRoles: [
      "control", "year_header", "decade_navigation", "year_option",
      "month_header", "month_option", "day_option"
    ],
    reason: "moka_tap4fun_birth_date_signature",
    evidence: [
      "exact tap4fun campus-recruitment tenant 291 application URL family",
      "birth-date semantics and readonly INPUT inside a Moka Dropdown",
      "real popup opens as a day grid and is anchored above the input",
      "pre-open positioning followed by target-level elementFromPoint checks for the year and month headers",
      "the popup shell may extend behind the fixed navigation when every registered action target remains unobstructed",
      "year title, decade navigation, exact year, month title, exact month and current-month day sequence",
      "background target focus emulation without activating the tap4fun application tab",
      "trusted CDP pointer only; no keyboard, DOM value mutation, retry or alternate Driver fallback",
      "exact YYYY-MM-DD readback, closed popup and cleared required validation"
    ]
  },
  {
    registrationId: "moka.date-picker.trusted-pointer.v9",
    routingScope: "shared_component",
    adapterCode: "moka.date-picker.trusted-pointer.v9",
    kind: "specialized",
    driver: "site_deterministic",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "structured_temporal",
    site: {
      code: "moka",
      name: "Moka",
      hostnamePatterns: ["mokahr.com", "*.mokahr.com"],
      applicationUrlPatterns: [
        "^https?://(?:127\\.0\\.0\\.1|localhost)/__recruiting_ai_test__/moka(?:[?#]|$)"
      ]
    },
    field: {
      category: "date",
      name: "日期字段",
      matchPolicy: "advisory",
      fieldNamePatterns: ["日期|时间|年月|毕业|入学|开始|结束|到岗|出生"],
      semanticKeyPatterns: ["date|month|year|graduation|education|arrival|birth"]
    },
    control: {
      type: "custom_date_picker",
      name: "Moka 只读日期弹层控件",
      tagNames: ["INPUT"],
      inputTypes: [],
      readOnly: true,
      signaturePatterns: [
        "Dropdown-container|dropdown-container",
        "day_info|picker-addon|日期|年月日"
      ]
    },
    targetRoles: [
      "control", "year_header", "month_header", "year_navigation", "month_navigation",
      "decade_navigation", "year_option", "month_option", "day_option"
    ],
    reason: "moka_date_signature",
    evidence: [
      "Moka application URL",
      "tenant-defined field semantics are advisory and never a routing prerequisite",
      "readonly INPUT",
      "Moka Dropdown ancestor",
      "date popup signature",
      "nested dropdown and panel-menu wrappers share one control-owned outer visible calendar container; independent popup roots remain ambiguous",
      "only a positively observed closed control may receive one opening click; an open unparsed popup is observed without toggling",
      "Garena campus tenant 148076 and CTI campus tenant 142093 live populated readonly day_info birth-month controls: one unique 0年 panel with 12 month leaves permits one verified next-year action to 1901 without changing the committed field value",
        "CTI populated birth-month control passed installed d2e7a454 production Driver and independent readback on 2026-09-09; non-Moka/non-application routes, precision/signature mismatches, ambiguous targets and unconfirmed transitions fail closed",
      "generic route admitted only after one unique complete day, month or year panel is observed",
      "YYYY-MM precision inferred only from control-owned month placeholder/type/layout evidence",
      "shared target-level viewport correction for fixed navigation and off-screen targets",
      "background target focus emulation without activating the Moka application tab",
      "trusted CDP pointer activation on a verified live hit target",
      "no value mutation or keyboard fallback",
      "complete date and field-validation readback"
    ]
  },
  {
    registrationId: "generic.native.temporal.v1",
    routingScope: "native_control",
    adapterCode: "generic.native.v1",
    kind: "generic",
    driver: "generic_native",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "native_value_exact",
    site: {
      code: "cross_site",
      name: "跨站点",
      hostnamePatterns: ["*"],
      applicationUrlPatterns: []
    },
    field: {
      category: "date",
      name: "原生日期字段",
      matchPolicy: "advisory",
      fieldNamePatterns: ["日期|时间|年月|毕业|入学|开始|结束|到岗|出生"],
      semanticKeyPatterns: ["date|month|year|graduation|education|arrival|birth"]
    },
    control: {
      type: "native_temporal_input",
      name: "原生日期输入控件",
      tagNames: ["INPUT"],
      inputTypes: ["date", "month", "datetime-local"],
      readOnly: false,
      signaturePatterns: []
    },
    targetRoles: [],
    reason: "native_control",
    evidence: ["native temporal INPUT", "editable native value"]
  },
  {
    registrationId: "generic.native.text.v1",
    routingScope: "native_control",
    adapterCode: "generic.native.v1",
    kind: "generic",
    driver: "generic_native",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "native_value_exact",
    site: {
      code: "cross_site",
      name: "跨站点",
      hostnamePatterns: ["*"],
      applicationUrlPatterns: []
    },
    field: {
      category: "text",
      name: "原生文本字段",
      matchPolicy: "advisory",
      fieldNamePatterns: [],
      semanticKeyPatterns: ["(?:^|\\s)native(?:\\s|$)"]
    },
    control: {
      type: "native_text_input",
      name: "原生文本输入控件",
      tagNames: ["INPUT", "TEXTAREA"],
      inputTypes: ["text", "email", "tel", "url", "number", "search", "textarea"],
      readOnly: false,
      signaturePatterns: []
    },
    targetRoles: [],
    reason: "native_control",
    evidence: [
      "cross-site editable native text control",
      "standard input and change semantics",
      "authoritative native value readback",
      "field semantics accepted only after conflict detection"
    ]
  },
  nativeRegistration("select"), nativeRegistration("checkbox"),
  nativeRegistration("radio"), nativeRegistration("file")
];

function parsedApplicationUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function hostnameMatches(hostname: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.startsWith("*.")) {
    const root = pattern.slice(2).toLowerCase();
    return hostname.toLowerCase().endsWith(`.${root}`);
  }
  return hostname.toLowerCase() === pattern.toLowerCase();
}

function patternMatches(value: string, pattern: string): boolean {
  return new RegExp(pattern, "iu").test(value);
}

function hasFieldSemanticConflict(evidence: ControlAdapterEvidence): boolean {
  const requestedIdentity = `${evidence.label} ${evidence.semanticKey}`;
  const intrinsicIdentity = `${evidence.placeholder} ${evidence.classNames.join(" ")}`;
  const referralPattern = /推荐码|推荐人|内推码|内推人|内推|referral/iu;
  const cityPattern = /意向.*城市|期望.*城市|工作城市|意向地点|工作地点|preferred.?city|current.?city|\bcity\b|\blocation\b/iu;
  return (cityPattern.test(requestedIdentity) && referralPattern.test(intrinsicIdentity)) ||
    (referralPattern.test(requestedIdentity) && cityPattern.test(intrinsicIdentity));
}

function registrationSiteMatches(
  site: ControlAdapterRegistration["site"],
  applicationUrl: string
): boolean {
  const url = parsedApplicationUrl(applicationUrl);
  const hostname = url?.hostname ?? "";
  return site.hostnamePatterns.some((pattern) => hostnameMatches(hostname, pattern)) ||
    site.applicationUrlPatterns.some((pattern) => patternMatches(applicationUrl, pattern));
}

function registrationMatches(
  registration: ControlAdapterRegistration,
  evidence: ControlAdapterEvidence
): boolean {
  if (registration.control.ownedInputCount !== undefined &&
    evidence.ownedInputCount !== registration.control.ownedInputCount) return false;
  if (registration.control.excludedObservedKinds?.includes(evidence.observedControlKind ?? "")) return false;
  if (registration.control.observedKinds?.length &&
    !registration.control.observedKinds.includes(evidence.observedControlKind ?? "")) return false;
  if (hasFieldSemanticConflict(evidence)) return false;
  // Field names never establish native semantics. A text INPUT inside an
  // option/calendar component is not a native scalar, including editable ones.
  if (registration.registrationId.startsWith("generic.native.")) {
    if (evidence.readOnly || /combobox|listbox|tree|dialog/i.test(`${evidence.role ?? ""} ${evidence.ariaHasPopup ?? ""}`) ||
      /list|both/i.test(evidence.ariaAutocomplete ?? "") ||
      /combobox|custom|contenteditable/i.test(evidence.controlKind)) return false;
    if (!["SELECT", "INPUT"].includes(evidence.tagName.toUpperCase()) ||
      !["select", "checkbox", "radio", "file"].includes(evidence.type)) {
      if (/select|combobox|autocomplete|cascader|date[-_]?picker|calendar/iu.test(evidence.classNames.slice(0, 3).join(" "))) return false;
    }
  }
  if (!registrationSiteMatches(registration.site, evidence.applicationUrl)) return false;

  const fieldNameEvidence = [
    evidence.label,
    evidence.placeholder
  ].join(" ");
  const semanticKeyEvidence = [
    evidence.semanticKey,
    evidence.type,
    evidence.controlKind
  ].join(" ");
  const fieldNameMatches = registration.field.fieldNamePatterns.some((pattern) =>
    patternMatches(fieldNameEvidence, pattern)
  );
  const semanticKeyMatches = registration.field.semanticKeyPatterns.some((pattern) =>
    patternMatches(semanticKeyEvidence, pattern)
  );
  if (registration.field.matchPolicy !== "advisory" && !fieldNameMatches && !semanticKeyMatches) {
    return false;
  }

  if (registration.control.tagNames.length &&
    !registration.control.tagNames.includes(evidence.tagName.toUpperCase())) return false;
  if (registration.control.inputTypes.length &&
    !registration.control.inputTypes.includes(evidence.type.toLowerCase())) return false;
  if (registration.control.readOnly !== null &&
    registration.control.readOnly !== evidence.readOnly) return false;

  const depth = registration.control.signatureDepth ?? 5;
  const controlSignature = `${evidence.classNames.slice(0, depth).join(" ")} ${(evidence.ancestorIds ?? []).slice(0, depth).join(" ")} ${evidence.compoundKind ? `compound:${evidence.compoundKind} ` : ""}${evidence.placeholder}`;
  return registration.control.signaturePatterns.every((pattern) =>
    patternMatches(controlSignature, pattern)
  );
}

function applicationUrlFamily(url: URL | null): string {
  if (!url) return "";
  return `${url.protocol}//${url.hostname}`;
}

function unresolvedControlType(evidence: ControlAdapterEvidence): { type: string; name: string } {
  // Unknown means unknown; do not infer a calendar/cascader from the answer's
  // semantic name. Keep the observed native/ARIA signature in the diagnostic.
  return { type: "unresolved_control", name: "未识别控件" };
}

function diagnosticFor(
  evidence: ControlAdapterEvidence,
  registration: ControlAdapterRegistration | null
): ControlAdapterDiagnostic {
  const url = parsedApplicationUrl(evidence.applicationUrl);
  const hostname = url?.hostname ?? "";
  const unresolved = unresolvedControlType(evidence);
  const semanticConflict = hasFieldSemanticConflict(evidence);
  const specializedSite = (registration?.site.code !== "cross_site" ? registration?.site : null) ??
    CONTROL_ADAPTER_REGISTRY.find((candidate) =>
      candidate.site.code !== "cross_site" &&
      registrationSiteMatches(candidate.site, evidence.applicationUrl)
    )?.site ?? null;
  const adapterCode = registration?.adapterCode ?? "unresolved.custom.v1";
  return {
    schemaVersion: "control-adapter-diagnostic.v1",
    ...(registration?.routingScope ? { routingScope: registration.routingScope } : {}),
    ...(registration?.informationRequirement
      ? { informationRequirement: registration.informationRequirement }
      : {}),
    registrationId: registration?.registrationId ?? "unresolved.custom.v1",
    siteCode: specializedSite?.code ?? (hostname || "unknown"),
    siteName: specializedSite?.name ?? (hostname || "未知站点"),
    hostname,
    applicationUrlFamily: applicationUrlFamily(url),
    fieldName: evidence.label.trim() || "未命名字段",
    semanticKey: evidence.semanticKey.trim(),
    fieldCategory: registration?.field.category ?? "unknown",
    controlType: registration?.control.type ?? unresolved.type,
    controlName: registration?.control.name ?? unresolved.name,
    tagName: evidence.tagName.toUpperCase(),
    inputType: evidence.type,
    controlKind: evidence.controlKind,
    readOnly: evidence.readOnly,
    controlSignature: {
      role: evidence.role ?? "", ariaHasPopup: evidence.ariaHasPopup ?? "",
      ariaAutocomplete: evidence.ariaAutocomplete ?? "", disabled: evidence.disabled ?? false,
      tenantPath: url?.pathname ?? "",
      classNames: evidence.classNames.slice(0, 12).map(value => String(value ?? "").slice(0, 240)),
      ancestorIds: (evidence.ancestorIds ?? []).slice(0, 12).map(value => String(value ?? "").slice(0, 160))
    },
    adapterCode,
    adapterKind: registration?.kind ?? "unresolved",
    driver: registration?.driver ?? "unsupported",
    requiresForeground: registration?.requiresForeground ?? false,
    executionSurface: registration?.executionSurface ?? "background_tab",
    readbackStrategy: registration?.readbackStrategy ?? "unsupported",
    reason: registration?.reason ?? (semanticConflict ? "field_semantic_conflict" : "custom_control_without_adapter"),
    evidence: [...(registration?.evidence ?? [
      semanticConflict ? "requested field semantics conflict with intrinsic control identity" : "non-native or readonly custom control",
      semanticConflict ? "execution rejected before driver selection" : "no verified specialized signature"
    ])]
  };
}

export function resolveControlAdapter(
  evidence: ControlAdapterEvidence,
  registry: readonly ControlAdapterRegistration[] = CONTROL_ADAPTER_REGISTRY
): ControlAdapterResolution {
  // All signatures are resolved BEFORE any action. A company exception owns
  // only the matching control, never every field on that company's page.
  const priorities = { company_control: 30, shared_component: 20, native_control: 10 };
  const matches = registry.filter(candidate => registrationMatches(candidate, evidence));
  const priority = (candidate: ControlAdapterRegistration) => priorities[candidate.routingScope ?? "shared_component"] +
    (candidate.field.matchPolicy === "advisory" ? 0 : 1);
  const highest = Math.max(0, ...matches.map(priority));
  const candidates = matches.filter(candidate => priority(candidate) === highest);
  const registration = candidates.length === 1 ? candidates[0]! : null;
  const diagnostic = diagnosticFor(evidence, registration);
  diagnostic.matchedRegistrationIds = matches.map(candidate => candidate.registrationId);
  if (candidates.length > 1) {
    diagnostic.reason = "ambiguous_control_registration";
    diagnostic.evidence = ["multiple same-priority signatures; no Driver executed"];
  }
  if (registration) {
    return {
      code: registration.adapterCode,
      kind: registration.kind,
      driver: registration.driver,
      requiresForeground: registration.requiresForeground,
      executionSurface: registration.executionSurface,
      readbackStrategy: registration.readbackStrategy,
      evidence: [...registration.evidence],
      reason: registration.reason,
      registration,
      diagnostic
    };
  }

  const semanticConflict = hasFieldSemanticConflict(evidence);
  return {
    code: "unresolved.custom.v1",
    kind: "unresolved",
    driver: "unsupported",
    requiresForeground: false,
    executionSurface: "background_tab",
    readbackStrategy: "unsupported",
    evidence: [...diagnostic.evidence],
    reason: diagnostic.reason,
    registration: null,
    diagnostic
  };
}
