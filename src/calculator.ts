import type { ModelCost, ModelRate, ModelUsage, RateConfig, TimeSlotId, TokenUnit } from "./rates";

const UNIT_TOKENS: Record<TokenUnit, number> = {
  K: 1_000,
  M: 1_000_000,
  B: 1_000_000_000,
};

export function toTokens(value: number, unit: TokenUnit): number {
  const multiplier = UNIT_TOKENS[unit];
  const tokens = value * multiplier;

  if (!Number.isFinite(value) || value < 0 || !multiplier || !Number.isFinite(tokens)) {
    throw new RangeError("Token 用量必须是换算后仍为有限值的非负数字");
  }

  return tokens;
}

export function calculateModelCost(
  config: RateConfig,
  model: ModelRate,
  usage: ModelUsage,
  slot: TimeSlotId,
): ModelCost {
  if (
    usage.modelId !== model.id ||
    !Number.isFinite(config.tokensPerRateUnit) ||
    config.tokensPerRateUnit <= 0
  ) {
    throw new RangeError("模型与用量不匹配，或费率基准无效");
  }

  const lines = config.fields.map((field) => {
    const tokens = toTokens(usage.amounts[field.id], usage.unit);
    const unitPrice = model.rates[slot][field.id];
    const cost = (tokens / config.tokensPerRateUnit) * unitPrice;

    if (!Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(cost)) {
      throw new RangeError("费率或费用结果无效");
    }

    return { fieldId: field.id, tokens, unitPrice, cost };
  });
  const total = lines.reduce((sum, line) => sum + line.cost, 0);

  if (!Number.isFinite(total)) {
    throw new RangeError("模型费用合计溢出");
  }

  return { modelId: model.id, lines, total };
}

export function calculateCosts(
  config: RateConfig,
  usages: readonly ModelUsage[],
  slot: TimeSlotId,
): ModelCost[] {
  const models = new Map(config.models.map((model) => [model.id, model]));

  return usages
    .filter((usage) => usage.included)
    .map((usage) => {
      const model = models.get(usage.modelId);
      if (!model) {
        throw new RangeError(`找不到模型：${usage.modelId}`);
      }
      return calculateModelCost(config, model, usage, slot);
    });
}

export function calculateTotal(results: readonly ModelCost[]): number {
  const total = results.reduce((sum, result) => sum + result.total, 0);
  if (!Number.isFinite(total)) {
    throw new RangeError("费用总额溢出");
  }
  return total;
}
