/** Candidate information projection only; site controls/options are unchanged. */
const paths: Record<string, string> = {
  "candidate.basic.fullName": "basic.fullName",
  "candidate.basic.phone": "basic.phone",
  "candidate.basic.email": "basic.email",
  "candidate.gender": "basic.gender",
  "candidate.basic.birthDate": "basic.birthDate",
  "candidate.age": "basic.age",
  "candidate.nationality": "basic.nationality",
  "candidate.ethnicity": "basic.ethnicity",
  "candidate.political_status": "basic.politicalStatus",
  "candidate.marital_status": "basic.maritalStatus",
  "candidate.basic.nativePlace": "basic.nativePlace",
  "candidate.basic.currentCity": "basic.currentCity",
  "candidate.basic.householdRegistration": "basic.householdRegistration",
  "candidate.basic.address": "basic.address",
  "candidate.basic.postalCode": "basic.postalCode",
  "candidate.current_position": "basic.currentPosition",
  "candidate.teacher_qualification": "basic.teacherQualification",
  "candidate.basic.highestDegree": "basic.highestDegree",
  "candidate.basic.highestAcademicDegree": "basic.highestAcademicDegree",
  "candidate.basic.employmentStatus": "basic.employmentStatus",
  "candidate.basic.idNumber": "basic.idNumber",
  "candidate.basic.idType": "basic.idType",
  "candidate.preferences.preferredCities": "preferences.preferredCities",
  "candidate.preferences.targetRoles": "preferences.targetRoles",
  "candidate.preferences.industries": "preferences.industries",
  "candidate.skills": "skills",
  "candidate.languages": "languages",
  "candidate.selfEvaluation": "selfEvaluation",
};
const sets = new Set([
  "candidate.preferences.preferredCities",
  "candidate.preferences.targetRoles",
  "candidate.preferences.industries",
  "candidate.skills",
  "candidate.languages",
]);
function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function member(key: string, value: unknown): string {
  const obj = object(value);
  const text =
    typeof value === "string"
      ? value
      : String(obj?.[key === "candidate.skills" ? "summary" : "name"] ?? "");
  const normalized = text.trim().replace(/\s+/gu, "").toLowerCase();
  return key === "candidate.preferences.preferredCities"
    ? normalized.replace(/市$/u, "")
    : normalized;
}
function overrides(
  profile: Record<string, unknown>,
): Record<string, unknown>[] {
  return Array.isArray(profile.overrides)
    ? profile.overrides.flatMap((v) => (object(v) ? [object(v)!] : []))
    : [];
}
function cleared(override: Record<string, unknown>, at: Date): boolean {
  return (
    override.cleared === true ||
    (typeof override.validUntil === "string" &&
      new Date(override.validUntil).getTime() <= at.getTime())
  );
}

export function projectCandidateInformation(
  payload: Record<string, unknown>,
  profile: Record<string, unknown>,
  at = new Date(),
): Record<string, unknown> {
  if (!overrides(profile).length) return payload;
  const result = structuredClone(payload);
  const candidate = object(result.candidate) ?? {};
  result.candidate = candidate;
  for (const override of overrides(profile)) {
    const semantic = String(override.semanticKey ?? "");
    const path = paths[semantic];
    if (!path) continue;
    const parts = path.split(".");
    const key = parts.pop()!;
    let parent = candidate;
    for (const part of parts) {
      const next = object(parent[part]) ?? {};
      parent[part] = next;
      parent = next;
    }
    if (cleared(override, at)) {
      delete parent[key];
      if (path === "basic.birthDate") delete parent.age;
      if (path === "preferences.targetRoles") delete parent.targetRole;
      continue;
    }
    if (sets.has(semantic)) {
      const removed = new Set(
        (Array.isArray(override.removedValues)
          ? override.removedValues
          : []
        ).map((v) => member(semantic, v)),
      );
      const base =
        override.replaceBase === true
          ? []
          : Array.isArray(parent[key])
            ? (parent[key] as unknown[])
            : [];
      const values = base.filter((v) => !removed.has(member(semantic, v)));
      const seen = new Set(values.map((v) => member(semantic, v)));
      for (const value of Array.isArray(override.values)
        ? override.values
        : []) {
        if (
          typeof value !== "string" ||
          !value ||
          seen.has(member(semantic, value))
        )
          continue;
        values.push(
          semantic === "candidate.skills"
            ? { summary: value }
            : semantic === "candidate.languages"
              ? { name: value }
              : value,
        );
        seen.add(member(semantic, value));
      }
      if (values.length) parent[key] = values;
      else delete parent[key];
      if (path === "preferences.targetRoles") {
        delete parent.targetRole;
        if (values.length) parent.targetRole = values[0];
      }
    } else if (typeof override.value === "string" && override.value) {
      const old = parent[key];
      const value = override.value;
      const separator =
        path === "basic.birthDate"
          ? "-"
          : override.replaceBase !== true &&
              [
                "basic.currentCity",
                "basic.nativePlace",
                "basic.householdRegistration",
              ].includes(path)
            ? "/"
            : null;
      parent[key] =
        separator !== null &&
        typeof old === "string" &&
        old.startsWith(value + separator)
          ? old
          : value;
    }
  }
  const calendar = new Date(at.getTime() + 8 * 60 * 60 * 1000);
  const basic = object(candidate.basic);
  const birth = basic?.birthDate;
  if (
    basic &&
    typeof birth === "string" &&
    /^\d{4}-\d{2}-\d{2}$/u.test(birth)
  ) {
    const dob = new Date(birth + "T00:00:00Z");
    if (!Number.isNaN(dob.getTime()) && dob <= calendar) {
      let age = calendar.getUTCFullYear() - dob.getUTCFullYear();
      if (
        calendar.getUTCMonth() < dob.getUTCMonth() ||
        (calendar.getUTCMonth() === dob.getUTCMonth() &&
          calendar.getUTCDate() < dob.getUTCDate())
      )
        age--;
      basic.age = String(age);
    }
  }
  return result;
}

// Remove stale parser aliases before authoritative values are added. Prefixes
// refer only to canonical candidate paths, never another person's form fields.
export function maskSupersededInformation(
  facts: Record<string, string>,
  profile: Record<string, unknown>,
  at = new Date(),
): void {
  for (const override of overrides(profile)) {
    const semantic = String(override.semanticKey ?? "");
    const path = paths[semantic];
    if (!path) continue;
    const prefixes = [path, "candidate." + path, semantic];
    for (const key of Object.keys(facts))
      if (
        prefixes.some(
          (prefix) =>
            key === prefix ||
            key.startsWith(prefix + ".") ||
            key.startsWith(prefix + "["),
        )
      )
        delete facts[key];
    if (cleared(override, at)) delete facts["profile.semantic:" + semantic];
    if (semantic === "candidate.preferences.preferredCities") {
      for (const key of Object.keys(facts))
        if (
          /^(?:profile\.acceptableWorkCity\.|(?:candidate\.)?intention\.preferredCit|(?:candidate\.)?preferences\.preferredCity(?:$|[.\[]))/u.test(
            key,
          )
        )
          delete facts[key];
      if (override.cleared === true || override.replaceBase === true)
        facts["profile.preferredCity.noResidenceFallback"] = "true";
      const removed = Array.isArray(override.removedValues)
        ? override.removedValues
        : [];
      facts["profile.preferredCity.excluded"] = JSON.stringify(removed);
    }
  }
}

export function maskClearedInformation(
  facts: Record<string, string>,
  profile: Record<string, unknown>,
  at = new Date(),
): void {
  const inactive = overrides(profile).filter((override) =>
    cleared(override, at),
  );
  maskSupersededInformation(facts, { overrides: inactive }, at);
  for (const override of inactive)
    if (override.semanticKey === "candidate.basic.birthDate") {
      delete facts["candidate.basic.age"];
      delete facts["basic.age"];
      delete facts["profile.semantic:candidate.age"];
    }
}
