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
  rates: Record<TimeSlotId, Record<UsageFieldId, number>>;
}

export interface RateConfig {
  schemaVersion: 1;
  currency: "CNY";
  tokensPerRateUnit: number;
  fields: RateField[];
  slots: RateSlot[];
  models: ModelRate[];
}

export interface ModelUsage {
  modelId: string;
  included: boolean;
  unit: TokenUnit;
  amounts: Record<UsageFieldId, number>;
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

export const RATE_STORAGE_KEY = "deepseek-cost:rates";
export const OFFICIAL_RATE_CHECKED_AT = "2026-11-24";
export const OFFICIAL_RATE_SOURCE = "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/";

const EXPECTED_FIELD_IDS: readonly UsageFieldId[] = ["cacheHitInput", "cacheMissInput", "output"];
const EXPECTED_SLOT_IDS: readonly TimeSlotId[] = ["offPeak", "peak"];

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

interface ParsedRateConfig {
  config: RateConfig;
  source: "stored" | "default";
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validDescriptors(value: unknown, expectedIds: readonly string[]): boolean {
  if (!Array.isArray(value) || value.length !== expectedIds.length) return false;

  const ids = value.map((item) => (isRecord(item) ? item.id : undefined));
  return (
    new Set(ids).size === expectedIds.length &&
    expectedIds.every((id) => ids.includes(id)) &&
    value.every(
      (item) => isRecord(item) && typeof item.label === "string" && item.label.trim().length > 0,
    )
  );
}

function validRates(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return EXPECTED_SLOT_IDS.every((slot) => {
    const slotRates = value[slot];
    return (
      isRecord(slotRates) &&
      EXPECTED_FIELD_IDS.every((field) => {
        const rate = slotRates[field];
        return typeof rate === "number" && Number.isFinite(rate) && rate >= 0;
      })
    );
  });
}

function isRateConfig(value: unknown): value is RateConfig {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.currency !== "CNY" ||
    value.tokensPerRateUnit !== 1_000_000 ||
    !validDescriptors(value.fields, EXPECTED_FIELD_IDS) ||
    !validDescriptors(value.slots, EXPECTED_SLOT_IDS) ||
    !Array.isArray(value.models) ||
    value.models.length === 0
  ) {
    return false;
  }

  const modelIds = value.models.map((model) => (isRecord(model) ? model.id : undefined));
  return (
    new Set(modelIds).size === value.models.length &&
    value.models.every(
      (model) =>
        isRecord(model) &&
        typeof model.id === "string" &&
        model.id.trim().length > 0 &&
        typeof model.label === "string" &&
        model.label.trim().length > 0 &&
        validRates(model.rates),
    )
  );
}

export function parseRateConfig(raw: string | null, fallback: RateConfig): ParsedRateConfig {
  if (raw !== null) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isRateConfig(parsed)) return { config: parsed, source: "stored" };
    } catch {
      // 损坏数据与旧格式走同一个安全回退，避免进入计算。
    }
  }

  return {
    config: structuredClone(fallback),
    source: "default",
    ...(raw === null ? {} : { error: "本地费率格式或版本无效" }),
  };
}

export function loadRateConfig(
  storage: Pick<Storage, "getItem"> | null,
  fallback: RateConfig = OFFICIAL_RATES,
): ParsedRateConfig {
  if (!storage) {
    return {
      config: structuredClone(fallback),
      source: "default",
      error: "本地存储不可用，费率修改仅在本次页面有效",
    };
  }

  try {
    return parseRateConfig(storage.getItem(RATE_STORAGE_KEY), fallback);
  } catch {
    return {
      config: structuredClone(fallback),
      source: "default",
      error: "无法读取本地费率，已使用内置费率",
    };
  }
}

export function saveRateConfig(
  storage: Pick<Storage, "setItem"> | null,
  config: RateConfig,
): string | undefined {
  if (!storage) return "费率已生效，但本地存储不可用，刷新后会丢失";

  try {
    storage.setItem(RATE_STORAGE_KEY, JSON.stringify(config));
    return undefined;
  } catch {
    return "费率已生效，但未能保存，刷新后可能丢失";
  }
}
