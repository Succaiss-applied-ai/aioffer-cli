/**
 * Create a durable, at-most-once claim for one original submission.
 * Instantiate in the extension worker with chrome.storage.local and
 * navigator.locks; callers supply the authoritative page-session binding.
 * Never key this record by CAPTCHA image ID; it survives new images and workers.
 */
export function createSubmissionAttemptClaim({ binding, storage, locks, now = () => new Date().toISOString() }) {
  const identity = ['ownerId', 'deviceId', 'pageSessionKey', 'submissionAttemptId'];
  if (!binding || identity.some(key => typeof binding[key] !== 'string' || !binding[key]) ||
    !Number.isInteger(binding.tabId) || binding.tabId < 0 ||
    typeof binding.documentId !== 'string' || !binding.documentId ||
    typeof storage?.get !== 'function' || typeof storage?.set !== 'function' ||
    typeof locks?.request !== 'function' || typeof now !== 'function') {
    throw new TypeError('A complete original-submission binding, storage and lock manager are required');
  }
  const original = Object.fromEntries([...identity, 'tabId', 'documentId'].map(key => [key, binding[key]]));
  const key = `slider-auto-attempt.v1:${JSON.stringify(identity.map(field => original[field]))}`;
  return async challengeId => {
    if (typeof challengeId !== 'string' || !challengeId) throw new TypeError('Missing challenge identity');
    return locks.request(key, { mode: 'exclusive' }, async () => {
      const records = await storage.get(key);
      // Even an unfamiliar stored value consumes the attempt. Never repair a
      // malformed record by granting another irreversible pointer operation.
      if (Object.hasOwn(records, key)) return false;
      await storage.set({ [key]: {
        schemaVersion: 'slider-auto-attempt.v1', ...original, challengeId, claimedAt: now()
      } });
      return true;
    });
  };
}
