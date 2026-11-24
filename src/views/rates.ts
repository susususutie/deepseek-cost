import type { RateConfig, UsageFieldId } from "../rates";
import { createNumberInput, make, readNumber, setFieldError } from "./shared";

interface RateViewHandlers {
  onRateChange: () => void;
  onModelRename: (modelId: string, label: string) => void;
  onDeleteModel: (modelId: string) => void;
  onError: (message: string) => void;
}

function rateFieldKey(modelId: string, slot: string, field: UsageFieldId): string {
  return `${modelId}:${slot}:${field}`;
}

export function renderRatePanel(
  container: HTMLDivElement,
  config: RateConfig,
  invalidRateFields: Set<string>,
  invalidModelNames: Set<string>,
  handlers: RateViewHandlers,
): Map<string, HTMLInputElement> {
  invalidRateFields.clear();
  invalidModelNames.clear();
  container.replaceChildren();
  const nameInputs = new Map<string, HTMLInputElement>();

  config.models.forEach((model, modelIndex) => {
    const section = make("section", "rate-model");
    const head = make("div", "rate-model-head");
    const nameLabel = make("label", "field model-name-field", "模型名称");
    const nameInput = make("input");
    nameInput.type = "text";
    nameInput.name = `model-name-${modelIndex}`;
    nameInput.autocomplete = "off";
    nameInput.spellcheck = false;
    nameInput.maxLength = 80;
    nameInput.value = model.label;
    const nameError = make("p", "field-error");
    nameError.id = `model-name-${modelIndex}-error`;
    nameError.hidden = true;
    nameInput.setAttribute("aria-describedby", nameError.id);
    nameLabel.append(nameInput, nameError);

    const deleteButton = make("button", "delete-model", "删除模型");
    deleteButton.type = "button";
    deleteButton.disabled = config.models.length === 1;
    if (deleteButton.disabled) deleteButton.title = "至少保留一个模型";
    deleteButton.addEventListener("click", () => {
      if (!window.confirm(`删除模型“${model.label}”及其费率配置？`)) return;
      handlers.onDeleteModel(model.id);
    });

    nameInput.addEventListener("input", () => {
      const nextLabel = nameInput.value.trim();
      if (!nextLabel) {
        invalidModelNames.add(model.id);
        nameInput.setAttribute("aria-invalid", "true");
        if (nameInput.dataset.touched) {
          nameError.textContent = "模型名称不能为空";
          nameError.hidden = false;
        }
        return;
      }

      invalidModelNames.delete(model.id);
      nameInput.removeAttribute("aria-invalid");
      nameError.hidden = true;
      model.label = nextLabel;
      handlers.onModelRename(model.id, nextLabel);
    });
    nameInput.addEventListener("focusout", () => {
      nameInput.dataset.touched = "true";
      if (invalidModelNames.has(model.id)) {
        nameError.textContent = "模型名称不能为空";
        nameError.hidden = false;
        handlers.onError("模型名称不能为空");
      }
    });
    head.append(nameLabel, deleteButton);

    const scroll = make("div", "table-scroll");
    const table = make("table", "rate-table");
    const thead = make("thead");
    const headerRow = make("tr");
    headerRow.append(make("th", undefined, "计费项"));
    for (const slot of config.slots) headerRow.append(make("th", undefined, `${slot.label}价`));
    thead.append(headerRow);
    const tbody = make("tbody");

    for (const field of config.fields) {
      const row = make("tr");
      const rowHeader = make("th", undefined, field.label);
      rowHeader.scope = "row";
      row.append(rowHeader);
      for (const slot of config.slots) {
        const cell = make("td");
        const key = rateFieldKey(model.id, slot.id, field.id);
        const ref = createNumberInput(
          `${modelIndex}-${slot.id}-${field.id}`,
          `rate-${modelIndex}-${slot.id}-${field.id}`,
          String(model.rates[slot.id][field.id]),
        );
        ref.input.setAttribute("aria-label", `${model.label} ${field.label} ${slot.label}价`);
        ref.input.addEventListener("input", () => {
          const result = readNumber(ref.input, false);
          if (!result.ok) {
            invalidRateFields.add(key);
            setFieldError(ref, result.message, Boolean(ref.input.dataset.touched));
            handlers.onRateChange();
            return;
          }

          invalidRateFields.delete(key);
          setFieldError(ref, "", false);
          model.rates[slot.id][field.id] = result.value;
          handlers.onRateChange();
        });
        ref.input.addEventListener("focusout", () => {
          ref.input.dataset.touched = "true";
          const result = readNumber(ref.input, false);
          if (!result.ok) {
            setFieldError(ref, result.message, true);
            handlers.onError(result.message);
          }
        });
        cell.append(ref.input, ref.error);
        row.append(cell);
      }
      tbody.append(row);
    }

    table.append(thead, tbody);
    scroll.append(table);
    section.append(head, scroll);
    container.append(section);
    nameInputs.set(model.id, nameInput);
  });

  return nameInputs;
}
