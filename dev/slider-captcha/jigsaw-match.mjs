/** Match a transparent, unrotated, full-height jigsaw against its current background. */
export function matchJigsaw(background, piece) {
  const valid = image => image && Number.isInteger(image.width) && Number.isInteger(image.height) &&
    image.width > 0 && image.height > 0 && image.width <= 1024 && image.height <= 512 &&
    image.data?.length === image.width * image.height * 4;
  if (!valid(background) || !valid(piece) || piece.height !== background.height ||
    piece.width >= background.width || piece.width < 12) return null;
  const { width: w, height: h, data } = piece;
  let mask = Uint8Array.from({ length: w * h }, (_, i) => data[i * 4 + 3] >= 250 ? 1 : 0);
  const opaque = mask.reduce((sum, value) => sum + value, 0);
  if (opaque < 100 || opaque > w * h * 0.7) return null;
  // Exclude bevels and the white outline; these are not background texture.
  for (let iteration = 0; iteration < 3; iteration++) {
    const inner = new Uint8Array(mask.length);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      inner[i] = mask[i] & mask[i - 1] & mask[i + 1] & mask[i - w] & mask[i + w];
    }
    mask = inner;
  }
  const pixels = [];
  let templateSum = 0;
  let templateSquares = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) {
    const offset = (Math.floor(i / w) * background.width + i % w) * 4;
    for (let c = 0; c < 3; c++) {
      const value = data[i * 4 + c];
      pixels.push({ offset: offset + c, value });
      templateSum += value;
      templateSquares += value * value;
    }
  }
  const n = pixels.length;
  if (n < 300) return null;
  const templateVariance = templateSquares - templateSum * templateSum / n;
  if (templateVariance / n < 25) return null;
  const scores = [];
  for (let x = 0; x <= background.width - w; x++) {
    let sum = 0, squares = 0, product = 0;
    for (const p of pixels) {
      const value = background.data[p.offset + x * 4];
      sum += value;
      squares += value * value;
      product += value * p.value;
    }
    const variance = squares - sum * sum / n;
    const score = variance / n < 25 ? -1 :
      (product - sum * templateSum / n) / Math.sqrt(variance * templateVariance);
    scores.push({ x, score });
  }
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  const competing = scores.find(point => Math.abs(point.x - best.x) > Math.max(4, Math.round(w * 0.08)));
  if (!best || !competing || best.x <= 0 || best.score < 0.72 || best.score - competing.score < 0.08) return null;
  return { x: best.x, score: best.score, separation: best.score - competing.score };
}

/** SDK 2.28.5 restrict($jigsaw, slider.offsetWidth - jigsaw.offsetWidth).
 * Read from the loaded public SDK; the edge correction is not a track ratio.
 * Coordinates here are untransformed CSS pixels, startLeft = 0 only.
 */
export function yidunPieceOffset(movement, width, sliderWidth, pieceWidth) {
  const correction = sliderWidth - pieceWidth;
  const edge = correction < 0 ? -correction : correction / 2;
  let left = movement;
  if (movement <= edge) left += correction < 0 ? -movement / 2 : movement;
  else if (width - movement - sliderWidth <= edge) {
    const extra = movement - (width - sliderWidth - edge);
    left += correction / 2 + (correction < 0 ? -extra / 2 : extra);
  } else left += correction / 2;
  return Math.max(0, Math.min(width - pieceWidth, left));
}

export function resolveYidunDrag(observation, match) {
  if (observation?.state !== 'challenge' || !match || !Number.isFinite(match.x)) return null;
  const { background, piece, handle, root, viewport } = observation;
  if (!background || !piece || !handle || !root || !viewport) return null;
  if (![background.width, background.naturalWidth, piece.offsetWidth, handle.offsetWidth, root.offsetWidth]
    .every(value => Number.isFinite(value) && value > 0)) return null;
  const targetLeft = match.x * background.width / background.naturalWidth;
  const width = root.offsetWidth, sliderWidth = handle.offsetWidth, pieceWidth = piece.offsetWidth;
  let low = 0, high = width - sliderWidth;
  if (targetLeft <= 0 || targetLeft >= width - pieceWidth || high <= 0) return null;
  for (let i = 0; i < 40; i++) {
    const middle = (low + high) / 2;
    if (yidunPieceOffset(middle, width, sliderWidth, pieceWidth) < targetLeft) low = middle;
    else high = middle;
  }
  const distance = (low + high) / 2;
  const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  return { start, end: { x: start.x + distance, y: start.y }, viewport, steps: 32, durationMs: 640 };
}
