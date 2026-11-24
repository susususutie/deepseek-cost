import { describe, expect, it } from "vite-plus/test";
import { calculateCosts, calculateModelCost, calculateTotal, toTokens } from "../src/calculator";
import { OFFICIAL_RATES, type ModelUsage } from "../src/rates";

describe("toTokens", () => {
  it.each([
    [1, "K", 1_000],
    [1, "M", 1_000_000],
    [1, "B", 1_000_000_000],
    [1.5, "M", 1_500_000],
    [0, "B", 0],
  ] as const)("把 %i %s 换算为 %i tokens", (value, unit, expected) => {
    expect(toTokens(value, unit)).toBe(expected);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("拒绝非法用量 %s", (value) => {
    expect(() => toTokens(value, "M")).toThrow(RangeError);
  });

  it("拒绝换算后的溢出", () => {
    expect(() => toTokens(Number.MAX_VALUE, "B")).toThrow(RangeError);
  });
});

describe("calculateModelCost", () => {
  it("按官方空闲价计算 Flash 的三项费用", () => {
    const model = OFFICIAL_RATES.models[0]!;
    const usage: ModelUsage = {
      modelId: model.id,
      included: true,
      unit: "M",
      amounts: { cacheHitInput: 1, cacheMissInput: 2, output: 0.5 },
    };

    const result = calculateModelCost(OFFICIAL_RATES, model, usage, "offPeak");

    expect(result.total).toBeCloseTo(4.02, 12);
    expect(result.lines.map((line) => line.tokens)).toEqual([1_000_000, 2_000_000, 500_000]);
    expect(result.lines.map((line) => line.cost)).toEqual([0.02, 2, 2]);
  });
});

describe("calculateCosts", () => {
  const usages: ModelUsage[] = OFFICIAL_RATES.models.map((model, index) => ({
    modelId: model.id,
    included: true,
    unit: "M",
    amounts:
      index === 0
        ? { cacheHitInput: 1, cacheMissInput: 2, output: 0.5 }
        : { cacheHitInput: 1, cacheMissInput: 1, output: 1 },
  }));

  it("只计算勾选模型", () => {
    const results = calculateCosts(
      OFFICIAL_RATES,
      usages.map((usage, index) => ({ ...usage, included: index === 0 })),
      "peak",
    );

    expect(results.map((result) => result.modelId)).toEqual(["deepseek-flash"]);
    expect(results[0]!.total).toBeCloseTo(8.04, 12);
  });

  it("合并两个模型的高峰费用", () => {
    const results = calculateCosts(OFFICIAL_RATES, usages, "peak");

    expect(results.map((result) => result.total)).toEqual([8.04, 36.3]);
    expect(calculateTotal(results)).toBeCloseTo(44.34, 12);
  });

  it("按配置计算新增模型，无需修改计算逻辑", () => {
    const config = structuredClone(OFFICIAL_RATES);
    config.models.push({
      id: "custom-model",
      label: "自定义模型",
      rates: {
        offPeak: { cacheHitInput: 2, cacheMissInput: 3, output: 5 },
        peak: { cacheHitInput: 4, cacheMissInput: 6, output: 10 },
      },
    });

    const [result] = calculateCosts(
      config,
      [
        {
          modelId: "custom-model",
          included: true,
          unit: "K",
          amounts: { cacheHitInput: 1_000, cacheMissInput: 0, output: 0 },
        },
      ],
      "offPeak",
    );

    expect(result!.total).toBe(2);
  });
});
