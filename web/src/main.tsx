import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App as AntdApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { initializeAccessToken, setAccessToken } from "./api.js";
import { WorkbenchApp } from "./app.js";

export function mountWorkbench(container: HTMLElement) {
  setAccessToken(initializeAccessToken());
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <ConfigProvider locale={zhCN} theme={{ zeroRuntime: true, cssVar: { key: "css-var-_R_0_" } }}>
        <AntdApp>
          <WorkbenchApp />
        </AntdApp>
      </ConfigProvider>
    </StrictMode>,
  );
  return root;
}

const container = document.getElementById("root");
if (container) mountWorkbench(container);
