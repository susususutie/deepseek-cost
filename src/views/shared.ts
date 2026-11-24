export function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`缺少页面元素：${id}`);
  return element as T;
}

export function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export interface InputRef {
  input: HTMLInputElement;
  error: HTMLParagraphElement;
}

export type NumberResult = { ok: true; value: number } | { ok: false; message: string };

export function readNumber(input: HTMLInputElement, blankAsZero: boolean): NumberResult {
  if (input.validity.badInput) return { ok: false, message: "请输入有效数字" };
  if (input.value.trim() === "") {
    return blankAsZero ? { ok: true, value: 0 } : { ok: false, message: "请输入费率" };
  }

  const value = input.valueAsNumber;
  if (!Number.isFinite(value)) return { ok: false, message: "数值过大或格式无效" };
  if (value < 0) return { ok: false, message: "数值不能小于 0" };
  return { ok: true, value };
}

export function setFieldError(ref: InputRef, message: string, show: boolean): void {
  if (message) ref.input.setAttribute("aria-invalid", "true");
  else ref.input.removeAttribute("aria-invalid");
  ref.error.textContent = message;
  ref.error.hidden = !message || !show;
}

export function createNumberInput(name: string, errorId: string, value: string): InputRef {
  const input = make("input");
  input.type = "number";
  input.min = "0";
  input.step = "any";
  input.inputMode = "decimal";
  input.autocomplete = "off";
  input.name = name;
  input.value = value;
  input.setAttribute("aria-describedby", errorId);
  const error = make("p", "field-error");
  error.id = errorId;
  error.hidden = true;
  return { input, error };
}
