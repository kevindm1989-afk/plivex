import { el } from '../dom.js';
import { assessPassphrase, MIN_PASSPHRASE_LENGTH } from '../../crypto.js';

const labels = ['too short', 'weak', 'fair', 'good', 'strong'];

export function StrengthMeter() {
  const bar = el('div', { class: 'strength-bar' }, [
    el('span', { class: 'strength-fill' })
  ]);
  const text = el('p', { class: 'strength-text', 'aria-live': 'polite' });
  const feedback = el('ul', { class: 'strength-feedback' });
  const wrap = el('div', { class: 'strength' }, [bar, text, feedback]);

  const update = (passphrase) => {
    const result = assessPassphrase(passphrase);
    const fill = bar.firstElementChild;
    fill.className = `strength-fill score-${result.score}`;
    fill.style.width = `${(result.score / 4) * 100}%`;
    if (!passphrase) {
      text.textContent = `Minimum ${MIN_PASSPHRASE_LENGTH} characters.`;
      feedback.innerHTML = '';
      return result;
    }
    text.textContent = `Strength: ${labels[result.score]}`;
    feedback.innerHTML = '';
    for (const msg of result.feedback) {
      feedback.appendChild(el('li', {}, [msg]));
    }
    return result;
  };

  update('');
  return { wrap, update };
}
