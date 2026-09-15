import { createSubmissionAttemptClaim } from './attempt-store.mjs';
import { dispatchTrustedDrag } from './trusted-drag.mjs';
import { runSliderAttempt } from './slider-attempt.mjs';
import { matchJigsaw, resolveYidunDrag } from './jigsaw-match.mjs';

/** Decode only the public image family observed on the registered component.
 * No cookies, redirects, private applicant content, or external solver service.
 */
export async function readCaptchaBitmap(url, signal) {
  if (!/^https:\/\/necaptcha\.nosdn\.127\.net\/[a-f0-9]{32}@2x\.(?:jpg|png)$/.test(url)) {
    throw new Error('Unsupported CAPTCHA asset');
  }
  const response = await fetch(url, {
    credentials: 'omit', redirect: 'error',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(2000)]) : AbortSignal.timeout(2000)
  });
  if (!response.ok || !/^image\/(?:jpeg|png)(?:;|$)/.test(response.headers.get('content-type') || '')) {
    throw new Error('CAPTCHA asset unavailable');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 1024 * 1024) throw new Error('CAPTCHA asset exceeds size limit');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const image = await createImageBitmap(new Blob(chunks));
  try {
    if (image.width > 1024 || image.height > 512) throw new Error('CAPTCHA bitmap exceeds dimensions');
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('CAPTCHA bitmap decoder unavailable');
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, image.width, image.height);
  } finally { image.close(); }
}

/** Called inside the original final-submit debugger/focus lease. */
export async function attemptPostSubmitSlider({
  binding, read, currentDocumentId, assertActive, send, storage, locks,
  signal, bitmap = readCaptchaBitmap, pause
}) {
  let documentId;
  const isCurrent = async () => {
    assertActive();
    return !signal?.aborted && Boolean(documentId) && await currentDocumentId() === documentId;
  };
  try {
    assertActive();
    const first = await read();
    documentId = first?.documentId;
    if (!documentId) return { status: 'waiting_for_user_action', reason: 'document_unbound' };
    const claim = createSubmissionAttemptClaim({ binding: { ...binding, documentId }, storage, locks });
    let planObservation;
    return await runSliderAttempt({
      isCurrent, pause,
      observe: async () => {
        const live = await read();
        if (live?.documentId !== documentId) throw new DOMException('Original document changed', 'AbortError');
        return live?.observation ?? { state: 'absent' };
      },
      resolvePlan: async observation => {
        if (!observation.background || !observation.piece) return null;
        const images = await Promise.all([
          bitmap(observation.background.src, signal), bitmap(observation.piece.src, signal)
        ]);
        if (images[0].width !== observation.background.naturalWidth || images[0].height !== observation.background.naturalHeight ||
          images[1].width !== observation.piece.naturalWidth || images[1].height !== observation.piece.naturalHeight) return null;
        const match = matchJigsaw(...images);
        const fresh = await read();
        if (fresh?.documentId !== documentId || fresh.observation?.challengeId !== observation.challengeId) return null;
        planObservation = fresh.observation;
        return resolveYidunDrag(planObservation, match);
      },
      claimAttempt: claim,
      drag: async plan => {
        // Guard geometry as well as image identity after the durable storage write.
        const fresh = await read();
        if (fresh?.documentId !== documentId || JSON.stringify(fresh.observation) !== JSON.stringify(planObservation)) {
          throw new Error('CAPTCHA geometry changed before pointer dispatch');
        }
        await dispatchTrustedDrag(send, plan, { isCurrent, signal, pause });
      }
    });
  } catch (error) {
    // Cancellation/refresh/closing retains the original interruption outcome.
    assertActive();
    if (signal?.aborted) throw signal.reason ?? error;
    // A normal navigation after release may be the site's success route.
    // The shared caller reads its receipt; this result never claims success.
    return { status: 'waiting_for_user_action', reason: 'automatic_attempt_unconfirmed' };
  }
}
