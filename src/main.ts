import "./styles.css";
import { calculateCosts, calculateTotal } from "./calculator";
import { HOLIDAY_CALENDAR } from "./holidays";
import {
  loadRateConfig,
  OFFICIAL_RATE_CHECKED_AT,
  OFFICIAL_RATES,
  RATE_STORAGE_KEY,
  saveRateConfig,
  type ModelCost,
  type ModelUsage,
  type PricingMode,
  type RateConfig,
  type TimeSlotId,
  type UsageFieldId,
} from "./rates";
import { resolveAutoSlot } from "./schedule";
import { renderRatePanel } from "./views/rates";
import { byId, make, readNumber } from "./views/shared";
import { renderUsageRows, type UsageRow, type UsageState } from "./views/usage";

const moneyFormatter = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 8,
});
const numberFormatter = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 8 });
const modelRowsContainer = byId<HTMLDivElement>("model-rows");
const rateModelsContainer = byId<HTMLDivElement>("rate-models");
const summaryList = byId<HTMLUListElement>("summary-list");
const grandTotal = byId<HTMLOutputElement>("grand-total");
const selectionHint = byId<HTMLParagraphElement>("selection-hint");
const modeExplanation = byId<HTMLParagraphElement>("mode-explanation");
const rateSourceNote = byId<HTMLParagraphElement>("rate-source-note");
const appStatus = byId<HTMLParagraphElement>("app-status");
const usages = new Map<string, UsageState>();
const invalidRateFields = new Set<string>();
const invalidModelNames = new Set<string>();
let usageRows = new Map<string, UsageRow>();
let rateNameInputs = new Map<string, HTMLInputElement>();
let pricingMode: PricingMode = "peak";
let autoRefreshTimer: number | undefined;
let storage: Storage | null = null;

try {
  storage = window.localStorage;
} catch {
  // 隐私模式下仍可在内存中计算。
}

const loaded = loadRateConfig(storage);
let config: RateConfig = loaded.config;
let usingCustomRates = loaded.source === "stored";

function setStatus(message = ""): void {
  if (appStatus.textContent !== message) appStatus.textContent = message;
}

function persistRates(): void {
  setStatus(saveRateConfig(storage, config));
}

function updateRateSource(): void {
  rateSourceNote.textContent = usingCustomRates
    ? `正在使用自定义费率；内置官方费率核对于 ${OFFICIAL_RATE_CHECKED_AT}。`
    : `正在使用内置费率，核对于 ${OFFICIAL_RATE_CHECKED_AT}。`;
}

function formatMoney(value: number): string {
  if (value > 0 && value < 0.00000001) return "< ¥0.00000001";
  return moneyFormatter.format(value);
}

function renderDetails(container: HTMLDivElement, result: ModelCost): void {
  const formula = make("p", undefined, "费用 = Token 数 ÷ 1,000,000 × 单价（元 / 百万 tokens）");
  const scroll = make("div", "table-scroll");
  const table = make("table", "cost-table");
  const thead = make("thead");
  const header = make("tr");
  for (const label of ["计费项", "Token 数", "单价", "费用"])
    header.append(make("th", undefined, label));
  thead.append(header);
  const tbody = make("tbody");

  for (const line of result.lines) {
    const row = make("tr");
    const field = config.fields.find((item) => item.id === line.fieldId)!;
    row.append(make("th", undefined, field.label));
    row.append(make("td", "numeric", numberFormatter.format(line.tokens)));
    row.append(make("td", "numeric", formatMoney(line.unitPrice)));
    row.append(make("td", "numeric", formatMoney(line.cost)));
    tbody.append(row);
  }

  table.append(thead, tbody);
  scroll.append(table);
  container.replaceChildren(formula, scroll);
}

function activeSlot(): TimeSlotId {
  if (pricingMode !== "auto") {
    modeExplanation.textContent = `固定按${pricingMode === "peak" ? "高峰" : "空闲"}费率估算。`;
    return pricingMode;
  }

  const result = resolveAutoSlot(new Date(), HOLIDAY_CALENDAR);
  const coverageWarning =
    result.holidayCoverage === "unknown"
      ? "；节假日表未覆盖该年份，结果可能不准确，请手动选档"
      : "";
  modeExplanation.textContent = `北京时间 ${result.beijingDate} ${result.beijingTime}，${result.reason}${coverageWarning}。`;
  return result.slot;
}

function renderCosts(): void {
  const slot = activeSlot();
  const validResults: ModelCost[] = [];
  let selectedCount = 0;
  let hasInvalidSelection = false;
  summaryList.replaceChildren();

  for (const model of config.models) {
    const state = usages.get(model.id)!;
    const row = usageRows.get(model.id)!;
    if (!state.included) {
      row.subtotal.textContent = "—";
      row.notIncluded.hidden = false;
      row.details.textContent = "勾选模型后显示明细。";
      continue;
    }

    selectedCount += 1;
    row.notIncluded.hidden = true;
    const amounts = {} as Record<UsageFieldId, number>;
    let valid = true;
    for (const field of config.fields) {
      const ref = row.fields[field.id];
      const parsed = readNumber(ref.input, true);
      if (parsed.ok) {
        amounts[field.id] = parsed.value;
        ref.error.hidden = true;
        ref.input.removeAttribute("aria-invalid");
      } else {
        valid = false;
        ref.input.setAttribute("aria-invalid", "true");
        ref.error.textContent = parsed.message;
        ref.error.hidden = !ref.input.dataset.touched;
      }
    }

    const hasInvalidRate = [...invalidRateFields].some((key) => key.startsWith(`${model.id}:`));
    let result: ModelCost | undefined;
    if (valid && !hasInvalidRate) {
      const usage: ModelUsage = { modelId: model.id, included: true, unit: state.unit, amounts };
      try {
        [result] = calculateCosts(config, [usage], slot);
      } catch {
        valid = false;
      }
    }

    const item = make("li");
    item.append(make("span", undefined, model.label));
    const summaryAmount = make("output");
    summaryAmount.setAttribute("aria-live", "off");
    item.append(summaryAmount);
    summaryList.append(item);

    if (result) {
      validResults.push(result);
      row.subtotal.textContent = formatMoney(result.total);
      summaryAmount.textContent = formatMoney(result.total);
      renderDetails(row.details, result);
    } else {
      hasInvalidSelection = true;
      row.subtotal.textContent = "—";
      summaryAmount.textContent = "—";
      row.details.textContent = hasInvalidRate ? "修正费率后显示明细。" : "修正输入后显示明细。";
    }
  }

  selectionHint.hidden = selectedCount !== 0;
  if (selectedCount === 0) grandTotal.textContent = formatMoney(0);
  else if (hasInvalidSelection) grandTotal.textContent = "—";
  else {
    try {
      grandTotal.textContent = formatMoney(calculateTotal(validResults));
    } catch {
      grandTotal.textContent = "—";
    }
  }
}

function buildViews(): void {
  usageRows = renderUsageRows(modelRowsContainer, config, usages, {
    onChange: renderCosts,
    onError: setStatus,
  });
  rateNameInputs = renderRatePanel(
    rateModelsContainer,
    config,
    invalidRateFields,
    invalidModelNames,
    {
      onRateChange: () => {
        usingCustomRates = true;
        updateRateSource();
        persistRates();
        renderCosts();
      },
      onModelRename: (modelId, label) => {
        usingCustomRates = true;
        usageRows.get(modelId)!.label.textContent = label;
        updateRateSource();
        persistRates();
        renderCosts();
      },
      onDeleteModel: (modelId) => {
        config.models = config.models.filter((model) => model.id !== modelId);
        usingCustomRates = true;
        persistRates();
        buildViews();
        updateRateSource();
        renderCosts();
        byId<HTMLButtonElement>("add-model").focus();
      },
      onError: setStatus,
    },
  );
}

function scheduleAutoRefresh(): void {
  window.clearTimeout(autoRefreshTimer);
  if (pricingMode !== "auto") return;
  const delay = 60_000 - (Date.now() % 60_000) + 25;
  autoRefreshTimer = window.setTimeout(() => {
    renderCosts();
    scheduleAutoRefresh();
  }, delay);
}

byId<HTMLFormElement>("mode-form").addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement;
  if (target.name !== "pricing-mode" || !target.checked) return;
  pricingMode = target.value as PricingMode;
  renderCosts();
  scheduleAutoRefresh();
});

byId<HTMLButtonElement>("add-model").addEventListener("click", () => {
  const id = crypto.randomUUID();
  const emptyRates = () => ({ cacheHitInput: 0, cacheMissInput: 0, output: 0 });
  config.models.push({
    id,
    label: "新模型",
    rates: { offPeak: emptyRates(), peak: emptyRates() },
  });
  usingCustomRates = true;
  persistRates();
  buildViews();
  updateRateSource();
  renderCosts();
  const nameInput = rateNameInputs.get(id)!;
  nameInput.focus();
  nameInput.select();
});

byId<HTMLButtonElement>("reset-rates").addEventListener("click", () => {
  if (!window.confirm("恢复内置官方费率并删除所有自定义模型与修改？")) return;
  config = structuredClone(OFFICIAL_RATES);
  usingCustomRates = false;
  try {
    if (!storage) throw new Error("storage unavailable");
    storage.removeItem(RATE_STORAGE_KEY);
    setStatus();
  } catch {
    setStatus("已在本页恢复内置费率，但无法清除本地自定义数据");
  }
  buildViews();
  updateRateSource();
  renderCosts();
});

for (const formId of ["mode-form", "usage-form", "rates-form"]) {
  byId<HTMLFormElement>(formId).addEventListener("submit", (event) => event.preventDefault());
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && pricingMode === "auto") {
    renderCosts();
    scheduleAutoRefresh();
  }
});

buildViews();
updateRateSource();
renderCosts();
if (loaded.error) setStatus(`${loaded.error}。`);
