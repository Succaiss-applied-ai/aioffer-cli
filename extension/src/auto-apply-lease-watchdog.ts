/** Local execution authority expires unless the Gateway acknowledges renewal. */
export function startAutoApplyLeaseWatchdog(onExpire: () => void, timeoutMs = 90_000) {
  let stopped = false;
  let deadline = performance.now() + timeoutMs;
  let wallDeadline = Date.now() + timeoutMs;
  let timer: ReturnType<typeof setTimeout>;
  const expire = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    onExpire();
  };
  const acknowledge = () => {
    if (stopped) return;
    // Promise continuations can run before an overdue timer after suspension.
    // A late response is never evidence that the old local authority stayed live.
    const now = performance.now();
    if (now >= deadline || Date.now() >= wallDeadline) { expire(); return; }
    deadline = now + timeoutMs;
    wallDeadline = Date.now() + timeoutMs;
    clearTimeout(timer);
    timer = setTimeout(expire, timeoutMs);
  };
  timer = setTimeout(expire, timeoutMs);
  return { acknowledge, stop: () => { stopped = true; clearTimeout(timer); } };
}
