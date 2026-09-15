import { afterEach, describe, expect, it, vi } from "vitest";
import { startAutoApplyLeaseWatchdog } from "./auto-apply-lease-watchdog.js";
afterEach(() => vi.useRealTimers());
describe("automatic execution lease watchdog", () => {
  it("stops a disconnected attempt once and cannot be revived by a late ACK", async () => {
    vi.useFakeTimers(); const expired = vi.fn(); const lease = startAutoApplyLeaseWatchdog(expired);
    await vi.advanceTimersByTimeAsync(89_999); expect(expired).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(expired).toHaveBeenCalledTimes(1);
    lease.acknowledge(); await vi.advanceTimersByTimeAsync(180_000); expect(expired).toHaveBeenCalledTimes(1);
  });
  it("rejects an overdue ACK before the delayed timer callback runs", () => {
    vi.useFakeTimers();
    let elapsed = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    try {
      const expired = vi.fn();
      const lease = startAutoApplyLeaseWatchdog(expired);
      elapsed = 90_000; // Simulate a suspended event loop, without dispatching timers.
      lease.acknowledge();
      expect(expired).toHaveBeenCalledTimes(1);
      elapsed += 1;
      lease.acknowledge();
      vi.runAllTimers();
      expect(expired).toHaveBeenCalledTimes(1);
    } finally { clock.mockRestore(); }
  });
  it("fences a wake-from-sleep ACK even when the platform monotonic clock paused", () => {
    vi.useFakeTimers();
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    try {
      const expired = vi.fn();
      const lease = startAutoApplyLeaseWatchdog(expired);
      vi.setSystemTime(Date.now() + 90_000);
      lease.acknowledge();
      expect(expired).toHaveBeenCalledOnce();
    } finally { clock.mockRestore(); }
  });
  it("stays active with successful renewal and never expires after completion", async () => {
    vi.useFakeTimers(); const expired = vi.fn(); const lease = startAutoApplyLeaseWatchdog(expired);
    for (let i = 0; i < 20; i++) { await vi.advanceTimersByTimeAsync(20_000); lease.acknowledge(); }
    expect(expired).not.toHaveBeenCalled(); lease.stop();
    lease.acknowledge(); await vi.advanceTimersByTimeAsync(180_000); expect(expired).not.toHaveBeenCalled();
  });
});
