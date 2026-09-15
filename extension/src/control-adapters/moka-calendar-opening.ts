export type MokaCalendarProbeStatus =
  | "control_missing" | "control_ambiguous" | "control_signature_changed"
  | "popup_closed" | "popup_ambiguous" | "popup_open" | "probe_unavailable";

export interface MokaCalendarProbe<State> {
  status: MokaCalendarProbeStatus;
  fieldMatchCount: number;
  popupCount: number;
  state: State | null;
}

/** Moka's populated MonthPicker can initialize to year zero (Garena and CTI).
 * This is a recoverable panel state, never a valid selected date. The site UI's
 * next-year action changes 0 to 1901 without changing the committed field value.
 */
export function isGarenaZeroYearMonthPanel(input: {
  applicationUrl: string; label: string; classNames: string[]; readOnly: boolean;
  datePrecision: string | undefined; currentValue: string;
  state: { mode: string; year: number; yearHeaderText: string; popupCount: number;
    yearTitleMatches: number; monthTitleMatches: number; navigationMatches: number;
    monthOptionMatches: number; monthCellMatches: number; dayOptionMatches: number } | null;
}): boolean {
  const s = input.state;
  return /^https:\/\/app\.mokahr\.com\/(?:campus|social)-recruitment\/[a-zA-Z0-9_-]+\/\d+(?:\?[^#]*)?#\/job\/[^/?#]+\/apply(?:[/?#]|$)/i.test(input.applicationUrl) &&
    /出生(?:日期|年月)/u.test(input.label) && input.readOnly &&
    input.classNames.some((value) => /\bday_info\b/.test(value)) &&
    input.datePrecision === "month" && Boolean(input.currentValue.trim()) &&
    Boolean(s && s.mode === "month" && s.year === 0 && s.yearHeaderText.trim() === "0年" &&
      s.popupCount === 1 && s.yearTitleMatches === 1 && s.monthTitleMatches === 0 &&
      s.navigationMatches === 2 && s.monthOptionMatches === 12 && s.monthCellMatches === 12 &&
      s.dayOptionMatches === 0);
}

/** Only a positively observed closed control may receive an opening click. */
export async function openMokaCalendarOnce<State, Point>(input: {
  inspect: () => Promise<MokaCalendarProbe<State>>;
  ready: (state: State | null) => boolean;
  prepare: () => Promise<Point | null>;
  click: (point: Point) => Promise<void>;
  wait: (milliseconds: number) => Promise<void>;
}) {
  const diagnostics = {
    observationCount: 0, prepareCount: 0, openClickCount: 0,
    popupObserved: false, statuses: [] as MokaCalendarProbeStatus[]
  };
  const inspect = async () => {
    const probe = await input.inspect();
    diagnostics.observationCount += 1;
    diagnostics.statuses.push(probe.status);
    if (probe.status === "popup_open") diagnostics.popupObserved = true;
    return probe;
  };
  const outcome = (probe: MokaCalendarProbe<State>, failureCode: string | null) => ({
    state: probe.state, probe, failureCode, diagnostics
  });
  const terminal = (probe: MokaCalendarProbe<State>) =>
    probe.status !== "popup_open" && probe.status !== "popup_closed";
  let probe = await inspect();
  if (terminal(probe)) return outcome(probe, probe.status);
  if (probe.status === "popup_closed") {
    // Reconfirm before scrolling; an opening React transition must not be toggled.
    await input.wait(100);
    probe = await inspect();
    if (terminal(probe)) return outcome(probe, probe.status);
    if (probe.status === "popup_closed") {
      diagnostics.prepareCount += 1;
      const point = await input.prepare();
      // Preparation can flush pending layout/React work. Re-read before clicking.
      probe = await inspect();
      if (terminal(probe)) return outcome(probe, probe.status);
      if (probe.status === "popup_closed") {
        if (!point) return outcome(probe, "control_not_clickable");
        diagnostics.openClickCount += 1;
        await input.click(point);
      }
    }
  }
  for (let attempt = 0; attempt <= 15; attempt += 1) {
    if (terminal(probe)) return outcome(probe, probe.status);
    if (probe.status === "popup_open" && input.ready(probe.state)) return outcome(probe, null);
    if (probe.status === "popup_closed" && diagnostics.popupObserved) {
      return outcome(probe, "popup_closed_after_observed");
    }
    if (attempt === 15) break;
    await input.wait(attempt === 0 ? 180 : 100);
    probe = await inspect();
  }
  return outcome(probe, probe.status === "popup_open" ? "popup_state_unparsed" : "popup_not_observed");
}

export function mokaCalendarOpeningFailureMessage(code: string): string {
  const messages: Record<string, string> = {
    control_missing: "日期字段定位已失效，未再次点击或改填其他字段",
    control_ambiguous: "日期字段定位不唯一，未执行点击",
    control_signature_changed: "日期字段实时控件签名已变化，未执行点击",
    popup_ambiguous: "当前日期字段存在多个独立弹层，未执行点击",
    popup_state_unparsed: "日期弹层已出现，但年月状态未能解析，未再次点击输入框",
    popup_closed_after_observed: "日期弹层出现后关闭，未重新打开",
    popup_not_observed: "日期输入框已执行一次可信点击，但观察期内未发现所属日历弹层",
    control_not_clickable: "日期输入框没有可验证的可信点击命中点",
    probe_unavailable: "日期面板状态读取未返回有效结果，未执行后续点击"
  };
  return messages[code] ?? "日期面板状态检查失败，已停止后续操作";
}
