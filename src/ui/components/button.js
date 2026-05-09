import { el } from '../dom.js';

export function Button({ label, onClick, variant = 'primary', disabled = false, type = 'button', icon = null, full = false }) {
  const cls = ['btn', `btn-${variant}`];
  if (full) cls.push('btn-full');
  const children = [];
  if (icon) children.push(icon);
  children.push(label);
  return el(
    'button',
    {
      class: cls.join(' '),
      type,
      disabled: disabled === true ? true : undefined,
      onClick: disabled ? undefined : onClick
    },
    children
  );
}
