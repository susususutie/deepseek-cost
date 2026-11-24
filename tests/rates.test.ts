import { describe, expect, it } from "vite-plus/test";
import {
  loadRateConfig,
  OFFICIAL_RATES,
  parseRateConfig,
  RATE_STORAGE_KEY,
  saveRateConfig,
} from "../src/rates";

describe("parseRateConfig", () => {
  it("没有本地数据时返回独立的内置配置", () => {
    const result = parseRateConfig(null, OFFICIAL_RATES);

    expect(result.source).toBe("default");
    expect(result.config).toEqual(OFFICIAL_RATES);
    expect(result.config).not.toBe(OFFICIAL_RATES);
    expect(result.config.models[0]).not.toBe(OFFICIAL_RATES.models[0]);
  });

  it("接受完整有效的自定义配置", () => {
    const custom = structuredClone(OFFICIAL_RATES);
    custom.models[0]!.rates.peak.output = 88;

    const result = parseRateConfig(JSON.stringify(custom), OFFICIAL_RATES);

    expect(result.source).toBe("stored");
    expect(result.error).toBeUndefined();
    expect(result.config.models[0]!.rates.peak.output).toBe(88);
  });

  const invalidConfigs = [
    ["旧版本", { ...OFFICIAL_RATES, schemaVersion: 0 }],
    ["空模型列表", { ...OFFICIAL_RATES, models: [] }],
    ["错误费率基准", { ...OFFICIAL_RATES, tokensPerRateUnit: 1_000 }],
    [
      "重复模型 ID",
      {
        ...OFFICIAL_RATES,
        models: [OFFICIAL_RATES.models[0], OFFICIAL_RATES.models[0]],
      },
    ],
    [
      "负费率",
      {
        ...OFFICIAL_RATES,
        models: [
          {
            ...OFFICIAL_RATES.models[0]!,
            rates: {
              ...OFFICIAL_RATES.models[0]!.rates,
              peak: { ...OFFICIAL_RATES.models[0]!.rates.peak, output: -1 },
            },
          },
        ],
      },
    ],
    ["缺少计费字段", { ...OFFICIAL_RATES, fields: OFFICIAL_RATES.fields.slice(1) }],
  ] as const;

  it.each(invalidConfigs)("拒绝%s并回退", (_name, value) => {
    const result = parseRateConfig(JSON.stringify(value), OFFICIAL_RATES);

    expect(result.source).toBe("default");
    expect(result.error).toBeTruthy();
    expect(result.config).toEqual(OFFICIAL_RATES);
  });

  it("拒绝损坏 JSON", () => {
    const result = parseRateConfig("{", OFFICIAL_RATES);

    expect(result.source).toBe("default");
    expect(result.error).toBeTruthy();
  });
});

describe("费率存储异常", () => {
  it("保存后可以重新读取", () => {
    let value: string | null = null;
    const storage = {
      getItem: (key: string) => (key === RATE_STORAGE_KEY ? value : null),
      setItem: (key: string, next: string) => {
        if (key === RATE_STORAGE_KEY) value = next;
      },
    };

    expect(saveRateConfig(storage, OFFICIAL_RATES)).toBeUndefined();
    expect(loadRateConfig(storage, OFFICIAL_RATES).source).toBe("stored");
  });

  it("读取异常时回退且返回错误", () => {
    const storage = {
      getItem: () => {
        throw new DOMException(" denied ", "SecurityError");
      },
    };

    const result = loadRateConfig(storage, OFFICIAL_RATES);
    expect(result.source).toBe("default");
    expect(result.error).toBeTruthy();
  });

  it("写入异常和存储不可用都返回可见错误", () => {
    const storage = {
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };

    expect(saveRateConfig(storage, OFFICIAL_RATES)).toBeTruthy();
    expect(saveRateConfig(null, OFFICIAL_RATES)).toBeTruthy();
  });
});
