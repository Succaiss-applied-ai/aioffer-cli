// 统一使用保留能力证据的导入器；不再接受会丢失登录要求的旧岗位导出结构。
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
if (!process.argv[2]) throw Error("请提供完整公开有效岗位导出，格式见 docs/catalog-maintenance.md");
execFileSync(process.execPath,["--import","tsx",fileURLToPath(new URL("./import-production-catalog.ts",import.meta.url)),process.argv[2]],{stdio:"inherit"});
