import type { RateConfig, TokenUnit, UsageFieldId } from "../rates";
import { createNumberInput, make, readNumber, setFieldError, type InputRef } from "./shared";

export interface UsageState {
  included: boolean;
  unit: TokenUnit;
  raw: Record<UsageFieldId, string>;
}

export interface UsageRow {
  include: HTMLInputElement;
  unit: HTMLSelectElement;
  label: HTMLSpanElement;
  fields: Record<UsageFieldId, InputRef>;
  subtotal: HTMLOutputElement;
  notIncluded: HTMLSpanElement;
  details: HTMLDivElement;
}

interface UsageViewHandlers {
  onChange: () => void;
  onError: (message: string) => void;
}

function emptyRaw(): Record<UsageFieldId, string> {
  return { cacheHitInput: "", cacheMissInput: "", output: "" };
}

function ensureUsageStates(config: RateConfig, usages: Map<string, UsageState>): void {
  const modelIds = new Set(config.models.map((model) => model.id));
  for (const model of config.models) {
    if (!usages.has(model.id)) {
      usages.set(model.id, { included: true, unit: "M", raw: emptyRaw() });
    }
  }
  for (const modelId of usages.keys()) {
    if (!modelIds.has(modelId)) usages.delete(modelId);
  }
}

export function renderUsageRows(
  container: HTMLDivElement,
  config: RateConfig,
  usages: Map<string, UsageState>,
  handlers: UsageViewHandlers,
): Map<string, UsageRow> {
  ensureUsageStates(config, usages);
  container.replaceChildren();
  const rows = new Map<string, UsageRow>();

  config.models.forEach((model, modelIndex) => {
    const state = usages.get(model.id)!;
    const root = make("article", "model-row");
    const head = make("div", "model-head");
    const includeLabel = make("label", "model-toggle");
    const include = make("input");
    include.type = "checkbox";
    include.name = `include-${modelIndex}`;
    include.checked = state.included;
    const label = make("span", undefined, model.label);
    includeLabel.append(include, label);

    const unitLabel = make("label", "unit-label", "单位");
    const unit = make("select");
    unit.name = `unit-${modelIndex}`;
    for (const tokenUnit of ["K", "M", "B"] as const) {
      const option = make("option", undefined, tokenUnit);
      option.value = tokenUnit;
      unit.append(option);
    }
    unit.value = state.unit;
    unitLabel.append(unit);
    head.append(includeLabel, unitLabel);

    const fieldsContainer = make("div", "usage-fields");
    const fields = {} as Record<UsageFieldId, InputRef>;
    for (const field of config.fields) {
      const fieldLabel = make("label", "field");
      fieldLabel.append(make("span", undefined, field.label));
      const ref = createNumberInput(
        `${modelIndex}-${field.id}`,
        `usage-${modelIndex}-${field.id}-error`,
        state.raw[field.id],
      );
      ref.input.disabled = !state.included;
      ref.input.addEventListener("input", () => {
        state.raw[field.id] = ref.input.value;
        if (readNumber(ref.input, true).ok) setFieldError(ref, "", false);
        handlers.onChange();
      });
      ref.input.addEventListener("focusout", () => {
        ref.input.dataset.touched = "true";
        handlers.onChange();
        const result = readNumber(ref.input, true);
        if (!result.ok) handlers.onError(result.message);
      });
      fieldLabel.append(ref.input, ref.error);
      fieldsContainer.append(fieldLabel);
      fields[field.id] = ref;
    }

    const bottom = make("div", "model-bottom");
    const subtotalLabel = make("p", undefined, "小计");
    const subtotal = make("output", "model-subtotal", "¥0.00");
    subtotal.setAttribute("aria-live", "off");
    subtotalLabel.append(subtotal);
    const notIncluded = make("span", "not-included", "未计入");
    notIncluded.hidden = state.included;
    bottom.append(subtotalLabel, notIncluded);

    const details = make("details", "model-details");
    details.append(make("summary", undefined, "费用明细"));
    const detailsBody = make("div");
    details.append(detailsBody);
    root.append(head, fieldsContainer, bottom, details);
    container.append(root);

    include.addEventListener("change", () => {
      state.included = include.checked;
      for (const field of config.fields) fields[field.id].input.disabled = !state.included;
      unit.disabled = !state.included;
      notIncluded.hidden = state.included;
      handlers.onChange();
    });
    unit.disabled = !state.included;
    unit.addEventListener("change", () => {
      state.unit = unit.value as TokenUnit;
      handlers.onChange();
    });
    rows.set(model.id, {
      include,
      unit,
      label,
      fields,
      subtotal,
      notIncluded,
      details: detailsBody,
    });
  });

  return rows;
}
