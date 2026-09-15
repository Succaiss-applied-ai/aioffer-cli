import type {SharedSelectProbe, MokaFlatSelectPoint} from "./moka-shared-select-driver.js";

/** Serialized MAIN-world probe for the evidenced old school-input component.
 * No global menus or synthetic selected markers. Its retained input is only
 * read as committed after this invocation's one exact result click. */
export function inspectMokaLegacySchoolInPage(selector: string, expected: string,
  phase: "observe" | "prepare_open" | "commit" = "observe", selectedInThisRun = false) {
  const found = [...document.querySelectorAll(selector)];
  const control = found[0];
  if (found.length !== 1 || !(control instanceof HTMLInputElement) || control.type !== "text" ||
    control.disabled || control.readOnly) return null;
  const root = control.closest<HTMLElement>("[class*='apply-field-']");
  const shell = control.closest<HTMLElement>("[class*='school-select-'].school-input");
  const header = control.parentElement;
  if (!root || !shell || !root.contains(shell) || !/\bstring_info-/u.test(root.className) ||
    !header || !/\bheader-/u.test(header.className) || header.parentElement !== shell ||
    shell.querySelectorAll("input").length !== 1 || !/\binput-/u.test(control.className)) return null;
  const visible = (el: Element): el is HTMLElement => {
    if (!(el instanceof HTMLElement)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    for (let node: HTMLElement | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hidden || node.getAttribute("aria-hidden") === "true" || style.display === "none" ||
        style.visibility === "hidden" || style.opacity === "0") return false;
    }
    return true;
  };
  if (!visible(control)) return null;
  const titles = [...root.children].filter(el => /(?:^|\s)title-/u.test(el.className) && visible(el));
  if (titles.length !== 1 || !/^学校名称(?:\s*\/\s*School)?\s*[*＊]?$/iu.test(titles[0]!.textContent?.trim() ?? "")) return null;
  const point = (el: HTMLElement): MokaFlatSelectPoint | null => {
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return null;
    const hit = document.elementFromPoint(x, y);
    return hit === el || el.contains(hit) ? {x,y,tagName:el.tagName,className:el.className} : null;
  };
  if (phase === "prepare_open") control.scrollIntoView({behavior:"instant",block:"center",inline:"nearest"});
  const popups = [...shell.querySelectorAll<HTMLElement>("[class*='school-list-']")].filter(visible);
  const probe: SharedSelectProbe = {status:"popup_closed", controlPoint:point(control),leafPoint:null,
    popupCount:popups.length, matchingLeafCount:0,availableOptions:[],resolvedExpected:expected,
    scrolled:phase === "prepare_open",actual:selectedInThisRun && popups.length === 0 ? control.value.trim() : "",
    queryValue:control.value,commitPoint:point(titles[0] as HTMLElement),
    validationCleared:control.getAttribute("aria-invalid") !== "true" && ![...root.querySelectorAll("span,div,p")]
      .some(el => visible(el) && /^(?:必填项未填写|不能为空|请选择|此项为必填项)$/u.test(el.textContent?.trim() ?? ""))};
  const query = {query:control.value,focused:document.activeElement === control,emptySearch:false};
  const finish = (status: SharedSelectProbe["status"]) => ({probe:{...probe,status},query});
  if (!popups.length) return finish(probe.controlPoint ? "popup_closed" : "control_not_clickable");
  if (popups.length !== 1) return finish("popup_ambiguous");
  const popup = popups[0]!;
  if (popup.querySelector("[role=tree],[role=grid],input,button,a")) return finish("unsupported_popup_structure");
  const lists = [...popup.querySelectorAll("ul[class*='list-wrapper-']")];
  if (lists.length !== 1) return finish("unsupported_popup_structure");
  const leaves = [...lists[0]!.children].filter((el): el is HTMLElement => visible(el) &&
    el.tagName === "LI" && /\bschool-name-/u.test(el.className) &&
    !el.matches("[aria-disabled=true],[disabled],[class*='disabled']") &&
    !el.querySelector("[class*='option-text-btn-'],button,a,input") &&
    !/没有找到学校|添加学校全称/u.test(el.textContent ?? ""));
  const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/gu," ").trim().toLowerCase();
  probe.availableOptions = [...new Set(leaves.map(el => el.textContent?.trim() ?? "").filter(Boolean))];
  const exact = leaves.filter(el => normalize(el.textContent ?? "") === normalize(expected));
  probe.matchingLeafCount = exact.length;
  query.emptySearch = leaves.length === 0;
  if (exact.length !== 1) return finish(exact.length ? "leaf_ambiguous" : "leaf_missing");
  probe.leafPoint = point(exact[0]!);
  return finish(probe.leafPoint ? "ready" : "control_not_clickable");
}
