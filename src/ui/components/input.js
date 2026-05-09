import { el } from '../dom.js';

let counter = 0;
const nextId = () => `input-${++counter}`;

export function Input({ label, type = 'text', value = '', onInput, autocomplete, placeholder, attrs = {}, error = null, id }) {
  const inputId = id ?? nextId();
  const input = el('input', {
    id: inputId,
    type,
    value,
    placeholder,
    autocomplete,
    onInput: onInput ? (e) => onInput(e.target.value, e) : undefined,
    attrs
  });
  const labelEl = el('label', { for: inputId, class: 'field-label' }, [label]);
  const errEl = error
    ? el('p', { class: 'field-error', role: 'alert' }, [error])
    : null;
  const children = [labelEl, input];
  if (errEl) children.push(errEl);
  return { wrap: el('div', { class: 'field' }, children), input };
}

export function Textarea({ label, value = '', onInput, placeholder, rows = 10, id }) {
  const inputId = id ?? nextId();
  const ta = el('textarea', {
    id: inputId,
    rows,
    placeholder,
    onInput: onInput ? (e) => onInput(e.target.value, e) : undefined
  });
  ta.value = value;
  const labelEl = el('label', { for: inputId, class: 'field-label' }, [label]);
  return { wrap: el('div', { class: 'field' }, [labelEl, ta]), input: ta };
}
