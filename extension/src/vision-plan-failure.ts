/** Older Gateways return configured:false both for unavailable models and
 * malformed responses. Preserve that distinction without retrying a plan. */
export function isInvalidVisionPlanWarning(warnings: unknown): warnings is unknown[] {
  if (!Array.isArray(warnings)) return false;
  return warnings.some(warning => {
    const message = String(warning);
    return /视觉模型规划失败/.test(message) && (
      /(?:Unexpected|Expected|Unterminated|Bad control character|Bad escaped character|No number after|Exponent part|Unescaped control character).*JSON/i.test(message) ||
      /not valid JSON|JSON\.parse|JSON (?:解析|格式).*(?:失败|错误|无效)/i.test(message)
    );
  });
}
