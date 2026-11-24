# DeepSeek API 费用计算器规格草案

- 状态：**已实现并完成本地自动化验收，待 Git 提交与公开部署**
- 草案日期：2026-11-24
- 目标部署地址（部署完成后需实测）：`https://susususutie.github.io/deepseek-cost/`
- 技术边界：Vite+ 1.6.0 + TypeScript 7 + 原生 DOM；纯静态；生产运行时第三方 JS 为 0
- 固定环境：Node 26.13.1、pnpm 12.23.0（由 `vp env pin` 写入 `devEngines`）

## 1. 范围与验收路径

核心路径为“选择计价档位 → 勾选模型并输入 Token → 即时看到单模型费用和合并总额 → 展开明细核对公式 → 必要时展开费率配置”。

首版包含：

- 每模型独立的缓存命中输入量、缓存未命中输入量、输出量；每行独立选择 K / M / B，默认 M。
- `1K = 1,000`、`1M = 1,000,000`、`1B = 1,000,000,000`，采用十进制而非二进制。
- 内置 `deepseek-flash` 与 `deepseek-v4-pro`，默认两行均勾选、输入为空（按 0 计算）。
- 按高峰、按空闲、自动按当前北京时间三种计价方式。
- 单模型小计、所选模型合并总额、逐计费项明细。
- 可折叠费率面板；分别编辑高峰与空闲费率，立即生效并持久化。
- 前端新增、重命名、删除模型；模型 ID 自动唯一生成，至少保留一个模型，删除前确认。
- localStorage 版本与结构校验、损坏数据回退、恢复内置费率。

明确不做：账户/API 接入、账单导入、Search/Fetch/OCR/语音费用、汇率与美元换算、用量历史、分享导出、后端、分析统计、暗色主题。页面只估算模型 Token 费用，不声称等同于最终账单。

## 2. 官方数据核对

### 2.1 模型 Token 费率

核对时间：**2026-11-24 15:39（UTC+8）**。

官方来源：[DeepSeek API Docs：模型 & 价格（人民币）](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)。下列数值与需求中给出的数据一致，单位为 **元 / 百万 tokens**：

| 模型              | 缓存命中：空闲 | 缓存命中：高峰 | 缓存未命中：空闲 | 缓存未命中：高峰 | 输出：空闲 | 输出：高峰 |
| ----------------- | -------------: | -------------: | ---------------: | ---------------: | ---------: | ---------: |
| `deepseek-flash`  |           0.02 |           0.04 |                1 |                2 |          4 |          8 |
| `deepseek-v4-pro` |           0.15 |           0.30 |              4.5 |              9.0 |       13.5 |       27.0 |

官方页面同时列出的模型版本为 `DeepSeek-V4.1-Flash-1017` 与 `DeepSeek-V4-Pro-0813`。页面注明价格可能调整，因此界面固定展示官方来源链接、内置费率核对日期，以及“正在使用自定义费率”的明确文本；自定义后不继续把数据标成官方现价。

### 2.2 峰谷规则

官方规则：

- 北京时间周一至周五（不含中国法定节假日）`09:00–12:00`、`14:00–18:00` 为高峰。
- 周末与中国法定节假日全天为空闲；当前官方空闲价为高峰价的一半。
- 边界统一按左闭右开处理：`[09:00, 12:00)`、`[14:00, 18:00)`；因此 12:00 与 18:00 属于空闲。
- 周末调休上班日仍属于周末，按官方“周末……均为空闲时段”处理，不改成高峰。
- “半价”只作为当前初始数据关系；计算与配置面板不强制该倍率，避免官方未来取消半价后失真。

已确认采用的节假日数据源：

- [国务院办公厅关于 2026 年部分节假日安排的通知](https://www.gov.cn/zhengce/content/202511/content_7047090.htm)，2025-11-04 发布。
- [国务院办公厅关于 2027 年部分节假日安排的通知](https://www.gov.cn/zhengce/zhengceku/202611/content_7085102.htm)，2026-11-05 发布。

## 3. 设计摘要

### 3.1 视觉方向：桌面计算器与复写费用单

不是营销落地页，而是一张可核算、可复查的费用工作单。视觉参照两点：银行回单的冷白纸张与蓝绿色打印油墨，以及桌面计算器等号键的明确强调色。唯一有表现力的元素是右侧“计算纸带”式结果区；其余区域保持克制，服务输入和核对。

| Token    | 色值      | 用途与来源                               |
| -------- | --------- | ---------------------------------------- |
| `paper`  | `#F3F5F2` | 冷白、略灰绿的纸张底色，避免深色虚空背景 |
| `sheet`  | `#FFFFFF` | 输入与结果的真实阅读表面                 |
| `ink`    | `#1D2522` | 正文和金额，替代纯黑                     |
| `muted`  | `#5E6964` | 辅助说明；只用于达到对比度要求的文本     |
| `rule`   | `#C8D0CA` | 表格线、输入边界、分区线                 |
| `ledger` | `#0B6B5D` | 回单蓝绿油墨；聚焦、选中态、关键操作     |
| `error`  | `#A7352A` | 输入错误与存储失败，不做装饰             |

无渐变、无模糊光球、无玻璃拟态、无装饰阴影。金额不使用紫蓝色，不用颜色单独表达错误；错误同时有文字和 `aria-invalid`。

### 3.2 字体决策

- 仅使用系统字体栈：`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`。
- 不引入 Inter / Poppins，不下载 Web Font；字体请求与字体 payload 均为 0。
- 标题使用同一字族的 600/650 字重，不插入 italic serif 单词，不使用全大写 eyebrow。
- 金额与 Token 数字启用 `font-variant-numeric: tabular-nums lining-nums`，右对齐；不为小标签额外套等宽字体。
- 正文约 16px，配置表约 14px 但输入控件保持至少 16px，避免 iOS 聚焦放大。

### 3.3 布局与密度

桌面采用非等宽双栏：左侧输入占主要宽度，右侧较窄的结果纸带吸附在视口内。配置区不再是第三张“功能卡”，而是下方一张高密度、默认折叠的费率表。移动端按 DOM 原顺序变为“输入 → 合计 → 明细/配置”，不做 CSS 视觉重排。

```text
┌──────────────────────────────────────────────────────────────────────┐
│ DeepSeek API 费用计算器                     官方费率核对：2026-11-24 │
│ 计价方式：( ) 高峰  ( ) 空闲  ( ) 自动      自动判定说明 / 覆盖警告 │
├──────────────────────────────────────────────┬───────────────────────┤
│ Token 用量                                   │ 所选模型费用合计      │
│                                              │ ¥…                    │
│ [x] deepseek-flash              单位 [ M ▾ ] │                       │
│ 缓存命中 [____] 未命中 [____] 输出 [____]    │ deepseek-flash   ¥…   │
│ 小计 ¥…   费用明细 <details>                 │ deepseek-v4-pro  ¥…   │
│ ──────────────────────────────────────────── │                       │
│ [x] deepseek-v4-pro             单位 [ M ▾ ] │ 当前档位及判定依据    │
│ 缓存命中 [____] 未命中 [____] 输出 [____]    │                       │
│ 小计 ¥…   费用明细 <details>                 │                       │
├──────────────────────────────────────────────┴───────────────────────┤
│ 费率配置 <details>                                                   │
│ 模型 | 计费项 | 空闲价 | 高峰价；单位统一为元 / 百万 tokens          │
│ 恢复内置费率（确认后执行）；自定义/保存失败用真实文本说明            │
└──────────────────────────────────────────────────────────────────────┘
```

密度明确不同：输入区留出可扫描的标签空间；结果区紧凑且金额权重最高；配置区行距和单元格留白最小。输入控件可用 3px 小圆角，结果区与配置区以直角边线组织，不给所有区块套同圆角卡片。

### 3.4 反模板自检

这个设计为什么不会出现在 Slopstrap 清单上：**它从费用录入和复核路径派生为“非等宽工作单 + 计算纸带”，以回单蓝绿、系统字族和真实表格线建立识别度，没有渐变 hero、等宽功能卡、玻璃态、装饰性大圆角、伪状态或衬线斜体点缀。**

## 4. 交互与计算规则

### 4.1 输入和模型选择

- 每个模型一行，行首复选框决定是否纳入合计；取消勾选保留输入值，但禁用该行输入并显示“未计入”。
- 允许全部取消勾选，此时合计为 `¥0`，并提示“尚未选择模型”，不当作错误。
- 单位选择只作用于当前行三个字段；切换单位时保留输入框中的数字，改变其换算含义，不擅自改写成另一单位的数值。
- 接受非负有限小数，空字符串按 0；允许换算后为非整数 Token，用于估算。
- 负数、无法解析、换算或金额结果溢出时，相关结果显示 `—`，合计暂停更新并给出修正说明，不能把无效输入静默当成 0。
- 输入采用 `<input type="number" min="0" step="any" inputmode="decimal">`；这是可计数数量，不使用只适合标识符的文本数字模式。每个字段有持久可见的 `<label>`。

### 4.2 公式与金额显示

对每个已选模型、每个计费项：

```text
Token 数 = 输入数字 × 当前行单位倍率
该项费用（元）= Token 数 ÷ 1,000,000 × 当前档位该项单价
模型小计 = 三项费用之和
合并总额 = 所有已选模型小计之和
```

- 计算过程使用 JavaScript `number`，中间值不四舍五入；最终展示使用 `Intl.NumberFormat`，千分位分隔，保留 2–8 位小数。
- 非零金额小于 `¥0.00000001` 时显示 `< ¥0.00000001`，内部不将该值归零，避免把极小额误导为免费。
- 明细逐项展示“Token 数 × 单价 ÷ 1,000,000 = 费用”，便于复核。
- 费率面板直接编辑两档六个数值，不另设冗余倍率字段。

### 4.3 计价模式与自动判定

- 默认固定按“高峰”计价；用户可切换为“空闲”或“自动”，模式不持久化。
- 通过 `Intl.DateTimeFormat` 的 `timeZone: "Asia/Shanghai"` 与 `formatToParts()` 把当前瞬间投影为北京日期、星期和分钟；不读取用户本地时区，不手写 `UTC+8` 日期算术。
- 仅做“当前瞬间 → 北京墙上时间”的转换，不进行跨日时长计算。Temporal 目前在 Safari 不可用，且 polyfill 会增加约 15KB 运行时，不符合零依赖预算，因此不采用。
- 自动模式展示实际采用的档位及原因，如“北京时间周二 10:30，工作日高峰”或“法定节假日，空闲”。
- 输入、切换模式、页面重新可见时重判；页面停留期间用轻量定时器在下一分钟边界重判，无网络请求，不渲染秒级时钟。

### 4.4 可访问性与响应式

- 三种计价方式使用 `<fieldset>` + 三个原生 radio；模型选择使用 checkbox；费率和明细使用原生 `<details>/<summary>`。
- 表单控件均有程序化关联的可见标签；聚焦样式清晰，移动触摸目标至少 48px。
- 动态错误使用一个克制的 `role="status"` 区域；高频金额更新不逐键播报，避免屏幕阅读器噪声。
- 360px 宽度下无页面级横向滚动；费率表必要时只在自身容器滚动。尊重系统文字缩放，不禁止缩放。

## 5. 数据模型与解耦

```ts
export type UsageFieldId = "cacheHitInput" | "cacheMissInput" | "output";
export type TimeSlotId = "offPeak" | "peak";
export type TokenUnit = "K" | "M" | "B";
export type PricingMode = TimeSlotId | "auto";

export interface RateField {
  id: UsageFieldId;
  label: string;
}

export interface RateSlot {
  id: TimeSlotId;
  label: string;
}

export interface ModelRate {
  id: string;
  label: string;
  // 单位均为元 / 百万 tokens；两档独立存储，不强制半价。
  rates: Record<TimeSlotId, Record<UsageFieldId, number>>;
}

export interface RateConfig {
  schemaVersion: 1;
  currency: "CNY";
  tokensPerRateUnit: number; // 当前必须校验为 1_000_000
  fields: RateField[];
  slots: RateSlot[];
  models: ModelRate[];
}

export interface ModelUsage {
  modelId: string;
  included: boolean;
  unit: TokenUnit;
  amounts: Record<UsageFieldId, number>; // 当前所选单位下的数值
}

export interface CostLine {
  fieldId: UsageFieldId;
  tokens: number;
  unitPrice: number;
  cost: number;
}

export interface ModelCost {
  modelId: string;
  lines: CostLine[];
  total: number;
}
```

内置配置的数据形状如下；计算函数不会出现模型名或官方费率字面量：

```ts
export const OFFICIAL_RATES: RateConfig = {
  schemaVersion: 1,
  currency: "CNY",
  tokensPerRateUnit: 1_000_000,
  fields: [
    { id: "cacheHitInput", label: "缓存命中输入" },
    { id: "cacheMissInput", label: "缓存未命中输入" },
    { id: "output", label: "输出" },
  ],
  slots: [
    { id: "offPeak", label: "空闲" },
    { id: "peak", label: "高峰" },
  ],
  models: [
    {
      id: "deepseek-flash",
      label: "deepseek-flash",
      rates: {
        offPeak: { cacheHitInput: 0.02, cacheMissInput: 1, output: 4 },
        peak: { cacheHitInput: 0.04, cacheMissInput: 2, output: 8 },
      },
    },
    {
      id: "deepseek-v4-pro",
      label: "deepseek-v4-pro",
      rates: {
        offPeak: { cacheHitInput: 0.15, cacheMissInput: 4.5, output: 13.5 },
        peak: { cacheHitInput: 0.3, cacheMissInput: 9, output: 27 },
      },
    },
  ],
};
```

UI 按 `models`、`fields`、`slots` 生成；计算时按 ID 查配置。模型增删或调价不需要修改计算函数。官方核对日期和来源 URL 作为独立常量保存，避免用户改价后仍声称数据已于当日核对。

动态边界需要说准确：本产品允许动态增删模型、重命名和编辑费率；计费字段固定为“缓存命中输入 / 缓存未命中输入 / 输出”三项，时段固定为“空闲 / 高峰”两档，并由联合类型和存储校验器约束。这不是可任意增加计费维度的通用计价引擎。

## 6. localStorage 契约

- key：`deepseek-cost:rates`；value 为完整 `RateConfig` JSON。
- 读取时逐层校验：普通对象、`schemaVersion === 1`、币种与百万 Token 基准、字段/档位集合、至少一个模型、模型 ID 唯一、标签非空、所有费率均为有限非负数。
- JSON 损坏、版本不符或结构不合法时，忽略该值并回退到内置配置的深拷贝；显示“本地费率无效，已使用内置费率”，不尝试猜测迁移。
- 有效修改立即更新内存并重算，再写 localStorage。写入被禁用或超限时，本次修改仍生效，但明确提示“未能保存，刷新后可能丢失”。
- 编辑中的空值/负值不写入存储，也不应用为价格；标记字段错误并暂停相关金额，保留最后一份有效已存配置。
- “恢复内置费率”需要用户确认，成功后移除自定义键并重绘。
- 只持久化费率，不持久化 Token 用量、模型勾选或隐私数据。
- 用户提供的模型名只通过 `textContent` 渲染，不进入 `innerHTML`。

## 7. 关键函数签名

```ts
// 非法、负数或溢出时抛出 RangeError，由 DOM 边界转成可见错误。
export function toTokens(value: number, unit: TokenUnit): number;

export function calculateModelCost(
  config: RateConfig,
  model: ModelRate,
  usage: ModelUsage,
  slot: TimeSlotId,
): ModelCost;

export function calculateCosts(
  config: RateConfig,
  usages: readonly ModelUsage[],
  slot: TimeSlotId,
): ModelCost[]; // 仅处理 included 的模型，并校验模型 ID 存在

export function calculateTotal(results: readonly ModelCost[]): number;

export function parseRateConfig(
  raw: string | null,
  fallback: RateConfig,
): { config: RateConfig; source: "stored" | "default"; error?: string };

export interface HolidayCalendar {
  years: ReadonlySet<number>;
  dates: ReadonlySet<string>; // YYYY-MM-DD，显式列出，避免日历算术
}

export interface AutoSlotResult {
  slot: TimeSlotId;
  beijingDate: string;
  beijingTime: string;
  reason: string;
  holidayCoverage: "covered" | "unknown";
}

export function resolveAutoSlot(now: Date, calendar: HolidayCalendar): AutoSlotResult;
```

DOM 层只负责事件、状态和渲染，不复制计费规则。事件驱动 `renderCosts()` 即可，无需引入 signal 或响应式依赖；普通输入只更新金额节点，不重建正在编辑的输入框。

## 8. 文件结构与实施计划

包管理与运行环境统一由 Vite+ 管理。项目事实源是 `vite-plus@1.6.0`、pnpm `12.23.0` 与 Node `26.13.1`；版本通过 `vp env pin` 写入 `package.json#devEngines`，依赖通过 `catalog:` 与 `pnpm-lock.yaml` 锁定。开发依赖只有 `typescript`、`vite`（Vite+ core 别名）和 `vite-plus`；不直接安装 Vitest，测试从 `vite-plus/test` 导入。不保留 `package-lock.json` 或 npm scripts。

`vite.config.ts` 从 `vite-plus` 导入 `defineConfig`，同时承载 Vite 配置、check（fmt/lint/typecheck）配置和 `base: "/deepseek-cost/"`。

```text
.
├── .github/
│   └── workflows/deploy.yml
├── public/
│   └── .nojekyll
├── src/
│   ├── main.ts          # 根组合：状态、计算、汇总与自动计时
│   ├── styles.css       # Token、布局、控件、响应式与可访问性
│   ├── rates.ts         # 类型、官方配置、存储校验
│   ├── calculator.ts    # 单位换算与纯计算函数
│   ├── schedule.ts      # 北京时间投影与峰谷判断
│   ├── holidays.ts      # 经确认的年份日期表及来源注释
│   └── views/
│       ├── shared.ts    # 可访问输入构造与校验显示
│       ├── usage.ts     # 用量视图与模型行交互
│       └── rates.ts     # 费率配置视图与模型管理交互
├── tests/
│   ├── calculator.test.ts
│   ├── rates.test.ts
│   └── schedule.test.ts
├── index.html
├── vite.config.ts       # Vite+ 配置与 base
├── tsconfig.json
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml  # Vite+ 提供的 vite catalog
├── README.md            # 本地命令、费率维护、节假日覆盖和部署说明
└── spec.md
```

实施顺序：

1. 用干净目录的 `vp create vite:application` 结果校准骨架，再通过 `vp migrate` 对齐现有项目；用 `vp env pin` 固定 Node 与 pnpm。
2. 先写纯计算、存储校验、时间边界测试，再实现对应模块。
3. 按设计稿搭建语义 HTML 与原生 DOM；用量、费率配置拆成两个视图，根入口只做组合。
4. 完成 360px/桌面布局、键盘操作、错误与存储失败路径。
5. 运行 `vp install --frozen-lockfile`、`vp run check`、浏览器闭环和子路径资源检查；记录原始/gzip 体积。
6. 经单独确认后执行 Git 提交与 push，由 Actions 部署；实测公开 URL 和 Lighthouse，不预先填写分数。

scripts：`dev: vp dev`、`build: tsc && vp build`、`preview: vp preview`、`test: vp test run`、`check: vp check && vp test && vp build`。完整校验统一执行 `vp run check`。

## 9. GitHub Actions 部署

工作流使用固定版本 `voidzero-dev/setup-vp@v1.22.0`。该 action 自动从项目声明解析 Node `26.13.1`、pnpm `12.23.0` 和 Vite+ `1.6.0`，因此不再使用 `setup-node` 或 npm 缓存。为避免 action 的自动安装与显式 frozen 安装产生两套语义，设置 `run-install: false`，随后执行 `vp install --frozen-lockfile`。

```yaml
name: Deploy GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7.0.1
      - uses: voidzero-dev/setup-vp@v1.22.0
        with:
          cache: true
          run-install: false
      - run: vp install --frozen-lockfile
      - run: vp run check
      - uses: actions/configure-pages@v6.0.0
      - uses: actions/upload-pages-artifact@v5.0.0
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5.0.1
```

仓库 Settings → Pages → Source 必须为 **GitHub Actions**。`vite.config.ts` 固定 `base: "/deepseek-cost/"`，不依赖当前目录猜测；本地验收也需访问 `/deepseek-cost/`，确认 JS、CSS 和静态资源均不 404。

## 10. 性能预算

预算与 2026-11-24 的本机构建实测：

| 项目                         | 首次加载 gzip 预算 |     当前实测 | 手段                                       |
| ---------------------------- | -----------------: | -----------: | ------------------------------------------ |
| HTML                         |              ≤ 2KB |       1.87KB | 仅语义骨架与必要 meta，无追踪脚本          |
| CSS                          |              ≤ 3KB |       2.18KB | 单文件手写、无框架、无 `@import`、构建压缩 |
| 自有 JS（含费率/节假日数据） |             ≤ 10KB |       6.17KB | 原生 DOM、无响应式库、无日期库、无图标库   |
| 第三方生产 JS                |            **0KB** |          0KB | 所有工具只作开发依赖                       |
| 字体                         |   **0KB / 0 请求** | 0KB / 0 请求 | 系统字体栈                                 |
| 首次加载总量                 |    **≤ 15KB gzip** |      10.22KB | 无图片、无 CDN、无分析、无外部字体         |

实测来源：`vp run check` 中 `vp build` 的压缩体积输出。2026-11-24 对本地 `vp preview` 的 `/deepseek-cost/` 执行 Lighthouse 13.6.0 移动端审计，Performance 为 100，FCP/LCP 0.8s、TBT 0ms、CLS 0、3 个请求、约 11KiB。公开 URL 的部署后复测仍需完成。

Lighthouse 目标：Performance ≥ 98、TBT ≤ 10ms、CLS = 0、移动模拟 LCP ≤ 1.5s。达成方式：

- 首屏只有文本、表单和边线；LCP 不依赖图片或客户端请求。
- `type="module"` 延迟执行，初始化任务远低于 50ms；少量输入只做简单乘加，不引入 Worker 或节流复杂度。
- 不整棵重建 DOM，避免布局抖动；金额区预留稳定尺寸，使用表格数字。
- CSS 体量小，无需为“关键 CSS”再引入拆分工具；不使用 `content-visibility` 处理小页面。
- 生产环境无第三方源请求；官方文档链接只在用户点击时导航。
- 部署后对公开 URL 做 3 次移动端 Lighthouse，报告中位数、运行日期与工具环境，同时报告 `dist` 各文件原始/gzip 体积；若未达 98 继续优化，不伪造结果。

## 11. 测试与完成标准

### 11.1 自动化测试

统一通过 `vp test` 运行，测试从 `vite-plus/test` 导入。当前 3 个测试文件、51 个用例全部通过。

计算：

- K/M/B 换算、0、小数单位、极大值溢出与非法输入。
- Flash 示例：`1M` 命中 + `2M` 未命中 + `0.5M` 输出，空闲为 `0.02 + 2 + 2 = 4.02` 元，高峰为 `0.04 + 4 + 4 = 8.04` 元。
- Pro 三项各 `1M`，空闲为 `18.15` 元；与上述 Flash 空闲示例合并为 `22.17` 元。
- 只合计勾选模型；修改配置对象后无需改计算代码即得到新结果。

时间（测试输入使用带 `Z` 的瞬间，避免受机器时区影响）：

- 普通工作日 08:59 空闲、09:00 高峰、11:59:59 高峰、12:00 空闲、14:00 高峰、18:00 空闲。
- 周末高峰钟点仍为空闲；覆盖年份的法定节假日工作日为空闲。
- 未覆盖年份返回 `holidayCoverage: "unknown"`，不能伪称节假日判断完整。

存储：

- 有效配置 round-trip；坏 JSON、旧版本、缺字段、负费率、重复 ID 均安全回退。
- localStorage 读写异常不导致页面崩溃，保存失败提示可见。

### 11.2 浏览器验收

- 默认单位为 M；两行单位互不影响；勾选、输入、档位切换和明细金额一致。
- 改费率立即重算，刷新后保留；损坏存储有回退提示；恢复内置费率生效。
- 360px 与桌面均无关键内容遮挡；仅用键盘可操作所有控件；错误不只靠颜色表达。
- 构建产物在 `/deepseek-cost/` 下无资源 404，断外网时除已打开文档链接外核心计算仍可用。
- GitHub Actions 成功，公开 Pages URL 可访问；最终回复给出实测体积和 Lighthouse 结果。

2026-11-24 已用系统 Chrome 对 `vp preview` 的 `/deepseek-cost/` 执行自动化闭环，实际覆盖默认高峰、M 单位换算、手核算例、档位切换、明细展开、勾选排除、负值暂停、费率即时更新与刷新持久化、模型增删改、恢复内置费率、损坏存储回退及 360px 视口；同时断言无控制台错误、页面异常、404 或外部请求。公开部署后的 CI 和 Lighthouse 仍需在 push 后验证。

## 12. 已确认决策与自审修正

1. **默认计价档位**：默认“高峰”，由用户主动切换空闲或自动。
2. **法定节假日**：内置国务院公布的 2026、2027 全部放假调休日期（周末调休仍按周末空闲）。未覆盖年份继续按星期和钟点试算，但在自动模式显著提示“节假日表未覆盖，可能不准确，请手动选档”；运行时不在线更新节假日。
3. **模型管理**：配置面板支持新增、重命名、删除模型，ID 自动生成且唯一，至少保留一个模型。
4. **自审修正**：节假日参数改为同时携带覆盖年份与日期集合；增加 `calculateCosts()` 作为“仅合计勾选模型”的公开测试边界；非法数值在纯函数边界抛出 `RangeError`，由 DOM 转为可见错误。
5. **Vite+ 工具链修正**：已按用户反馈删除 npm 锁文件与 npm 事实链；以干净 `vp create` 结果为参照，通过 `vp migrate` 对齐 Vite+ 1.6.0，并使用 `vp env pin` 固定 Node 26.13.1 与 pnpm 12.23.0。DOM 按用量视图、费率配置视图和根组合拆分。
6. **确认门**：Git 提交和 push 仍需在执行前再次单独确认。
