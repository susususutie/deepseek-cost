# DeepSeek API 费用计算器

按 Token 用量、缓存命中情况和峰谷时段估算 DeepSeek API 人民币费用。纯静态站点，所有计算和自定义费率都留在浏览器内。

## 环境与命令

项目使用 Vite+ 管理 Node、pnpm 和前端工具链：

- Vite+ 1.6.0
- Node 26.13.1
- pnpm 12.23.0

版本固定在 `package.json#devEngines`，依赖锁定在 `pnpm-lock.yaml`。不要改用 npm 或生成 `package-lock.json`。

```bash
vp env current                 # 检查解析到的 Node / pnpm
vp install --frozen-lockfile   # 按锁文件安装
vp run dev                     # 开发服务器（/deepseek-cost/）
vp run check                   # fmt + lint + typecheck + test + build
vp run preview                 # 预览生产构建（/deepseek-cost/）
```

## 数据维护

- 内置费率：`src/rates.ts` 的 `OFFICIAL_RATES`，单位是元 / 百万 tokens。
- 官方来源与核对日期：同文件的 `OFFICIAL_RATE_SOURCE`、`OFFICIAL_RATE_CHECKED_AT`。
- 节假日：`src/holidays.ts`，当前覆盖国务院公布的 2026–2027 年放假日；未覆盖年份的自动模式会显示提示。
- 自定义费率存于 `localStorage` 的 `deepseek-cost:rates`，使用 `schemaVersion: 1`。升级结构时需提升版本并保留安全回退，不能静默套用旧格式。

只调整费率数值不需要改计算逻辑；新增模型也可以直接在页面配置面板完成。

## 范围

只估算模型 Token 费用，不包含 Search、Fetch、OCR、语音、税费或汇率换算。结果仅供预算参考，不应作为最终账单。

## 部署

推送到 `main` 或手动触发 `.github/workflows/deploy.yml`。工作流使用固定版本的 `voidzero-dev/setup-vp`，执行 frozen 安装、完整检查并上传 `dist`。

GitHub 仓库 Settings → Pages → Source 必须设为 **GitHub Actions**。预期地址：`https://susususutie.github.io/deepseek-cost/`。
