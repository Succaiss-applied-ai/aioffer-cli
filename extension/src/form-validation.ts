export interface ObservedFieldValue {
  fieldId: string;
  label: string;
  type: string;
  required: boolean;
  currentValue: string;
}

export function observedFieldHasValue(field: ObservedFieldValue): boolean {
  if (field.type === "checkbox" || field.type === "radio") {
    return field.currentValue === "true";
  }
  const value = field.currentValue
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!value) return false;
  const compact = value.replace(/\s+/g, "");
  if (/^(?:-|—|–|--|请选择|请搜索|请输入|年|月|年月|起止时间|开始时间|结束时间)$/u.test(compact)) {
    return false;
  }
  // Moka date/range controls often render placeholders as “-”, “年 月 - 年 月”
  // or a mixture of year/month placeholders. These must not be counted as
  // filled values; otherwise the executor waits for the model instead of
  // returning a required-field request to AI Offer.
  const withoutSeparators = compact.replace(/[年月/.,，、:：]/gu, "");
  if (/^-+$/u.test(withoutSeparators)) return false;
  const withoutDatePlaceholders = compact
    .replace(/[年月]/gu, "")
    .replace(/[-—–/.,，、:：]/gu, "");
  if (!withoutDatePlaceholders) return false;
  return true;
}

export function requiredFieldFailures(fields: ObservedFieldValue[]): ObservedFieldValue[] {
  return fields.filter((field) => field.required && !observedFieldHasValue(field));
}
