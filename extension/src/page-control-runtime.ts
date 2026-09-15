import { fillApplicationPage } from "./control-adapters/native-driver.js";
import { executeFeishuResumeUpload } from "./control-adapters/feishu-resume-upload-driver.js";
import { observeApplicationPageWithFieldDialects } from "./form-dialects/application-field-dialects.js";

// Bundled into an isolated-world script. Unlike serialized executeScript
// functions, its observer/registry imports retain their lexical bindings.
// No eval, page-world hooks, page attributes or candidate-value persistence.
Object.defineProperty(globalThis, "__recruitingNativeControlRuntime", {
  configurable: true, value: { fill: fillApplicationPage, uploadResume: executeFeishuResumeUpload,
    observe: observeApplicationPageWithFieldDialects }
});
