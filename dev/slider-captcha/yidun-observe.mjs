/** Serializable, read-only DOM observer. No external bindings or page mutation. */
export function observeYidunJigsawInPage() {
  const visible = element => {
    if (!element || element.closest('[hidden],[aria-hidden="true"]')) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    }
    return true;
  };
  const roots = [...document.querySelectorAll('.yidun')].filter(visible);
  if (roots.length !== 1) return { state: roots.length ? 'unsupported' : 'absent' };
  const root = roots[0];
  if (!root.classList.contains('yidun--jigsaw') ||
    ![...document.scripts].some(script => /^https:\/\/cstaticdun\.126\.net\/2\.28\.5\/core-[^/]+\.v2\.28\.5\.min\.js(?:\?|$)/.test(script.src))) {
    return { state: 'unsupported' };
  }
  const owned = selector => [...root.querySelectorAll(selector)].filter(element => element.closest('.yidun') === root);
  const one = selector => { const matches = owned(selector); return matches.length === 1 ? matches[0] : null; };
  const bg = one('img.yidun_bg-img'), piece = one('img.yidun_jigsaw');
  const rail = one('.yidun_control'), handle = one('.yidun_slider');
  if (!bg || !piece || !rail || !handle || !rail.contains(handle) || !bg.currentSrc || !piece.currentSrc) return { state: 'unsupported' };
  const challengeId = JSON.stringify([bg.currentSrc, piece.currentSrc, bg.naturalWidth, bg.naturalHeight]);
  if (root.classList.contains('yidun--success')) return { state: 'passed', challengeId };
  if (root.classList.contains('yidun--error') || /验证失败|请重试|失败过多/.test(owned('.yidun_tips__text').map(e => e.textContent).join(' '))) {
    return { state: 'failed', challengeId };
  }
  // While the server is checking a released drag, preserve its identity.
  // A moved handle cannot supply geometry for another attempt.
  if (parseFloat(piece.style.left) !== 0 || parseFloat(handle.style.left) !== 0) {
    return { state: 'challenge', challengeId };
  }
  const unitTransform = element => ['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(getComputedStyle(element).transform);
  for (const element of [bg, piece, rail, handle]) {
    if (!visible(element) || element.matches(':disabled,[aria-disabled="true"]') || !unitTransform(element)) return { state: 'unsupported', challengeId };
  }
  for (let node = root; node; node = node.parentElement) if (!unitTransform(node)) return { state: 'unsupported', challengeId };
  if (!/向右拖动滑块填充拼图/.test(rail.textContent || '') ||
    !bg.complete || !piece.complete || !bg.naturalWidth || !piece.naturalWidth ||
    bg.naturalHeight !== piece.naturalHeight || bg.naturalWidth <= piece.naturalWidth ||
    parseFloat(piece.style.left) !== 0 || parseFloat(handle.style.left) !== 0) return { state: 'unsupported', challengeId };
  const rect = element => {
    const r = element.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, offsetWidth: element.offsetWidth };
  };
  const b = rect(bg), p = rect(piece), h = rect(handle), r = rect(root), track = rect(rail);
  const within = item => item.x >= 0 && item.y >= 0 && item.x + item.width <= innerWidth && item.y + item.height <= innerHeight;
  if (![b, p, h, track].every(within) || Math.abs(b.x - p.x) > 0.1 || Math.abs(b.y - p.y) > 0.1 ||
    Math.abs(b.height - p.height) > 0.1 || Math.abs(b.width - r.offsetWidth) > 0.1 ||
    Math.abs(b.width / bg.naturalWidth - p.width / piece.naturalWidth) > 0.001 ||
    Math.abs(track.width - r.width) > 0.1 || Math.abs(h.width - handle.offsetWidth) > 0.1) return { state: 'unsupported', challengeId };
  const hit = document.elementFromPoint(h.x + h.width / 2, h.y + h.height / 2);
  if (!hit || !handle.contains(hit)) return { state: 'unsupported', challengeId };
  return { state: 'challenge', challengeId,
    background: { ...b, src: bg.currentSrc, naturalWidth: bg.naturalWidth, naturalHeight: bg.naturalHeight },
    piece: { ...p, src: piece.currentSrc, naturalWidth: piece.naturalWidth, naturalHeight: piece.naturalHeight },
    handle: h, root: r, rail: track, viewport: { width: innerWidth, height: innerHeight } };
}
