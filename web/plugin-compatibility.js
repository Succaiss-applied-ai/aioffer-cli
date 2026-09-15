export function assertLocalPlugin(info) {
  if (info?.runtime !== "aioffer-cli") {
    throw Error(
      `检测到的插件${info?.version ? `（${info.version}）` : ""}不是 aioffer-cli 本地版。请加载本项目 extension/dist，停用旧招聘插件并刷新页面；尚未发送配对凭据。`,
    );
  }
}
