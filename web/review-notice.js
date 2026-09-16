export function finalReviewNotice(job, now = Date.now()) {
  const approval = job.localReviewApproval;
  const currentHash = job.evidence?.failureDetails?.reviewHash;
  let reason = "";
  if (approval && approval.reviewHash !== currentHash) {
    reason = "页面内容与上次确认不一致，需要重新确认。";
  } else if (approval && !(Date.parse(approval.expiresAt) > now)) {
    reason = "上次确认已过期，需要重新确认。";
  }
  return `${reason}请切换到插件已打开的原招聘标签页，核对所有资料。下方按钮会触发真实提交。`;
}
