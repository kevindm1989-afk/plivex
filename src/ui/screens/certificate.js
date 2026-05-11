import { el, clear, svgFromString, formatDateTime } from '../dom.js';
import { Button } from '../components/button.js';
import { iconBack } from '../icons.js';
import * as app from '../../app.js';

export async function render(root, controller) {
  clear(root);

  let data;
  try {
    data = await app.getCertificateData();
  } catch (err) {
    root.appendChild(
      el('section', { class: 'screen' }, [
        el('p', { class: 'screen-error' }, [`Could not load certificate: ${err.message}`])
      ])
    );
    return;
  }

  const topbar = el('header', { class: 'topbar no-print' }, [
    el('button', {
      type: 'button',
      class: 'icon-button',
      attrs: { 'aria-label': 'Back' },
      onClick: () => controller.navigate('settings')
    }, [svgFromString(iconBack())]),
    el('h1', { class: 'topbar-title' }, ['Verification certificate']),
    el('div', { class: 'topbar-actions' }, [
      Button({
        label: 'Print',
        onClick: () => window.print()
      })
    ])
  ]);

  const supersedesBlock =
    data.supersedes.length === 0
      ? el('p', { class: 'cert-empty' }, ['No supersede records.'])
      : el(
          'ul',
          { class: 'cert-supersedes' },
          data.supersedes.map((s) =>
            el('li', { class: 'mono small' }, [
              `#${s.entry_id} (${s.this_uuid}) replaces ${s.replaces_uuid}`
            ])
          )
        );

  const chainBlock = [];
  chainBlock.push(el('p', {}, [el('strong', {}, ['Genesis hash (chain start):'])]));
  chainBlock.push(el('p', { class: 'mono small' }, ['0'.repeat(64)]));
  if (data.first_entry) {
    chainBlock.push(
      el('p', {}, [
        el('strong', {}, [
          `First entry hash (id #${data.first_entry.id}, ${formatDateTime(data.first_entry.created_at)}):`
        ])
      ])
    );
    chainBlock.push(el('p', { class: 'mono small' }, [data.first_entry.entry_hash]));
  }
  if (data.last_entry) {
    chainBlock.push(
      el('p', {}, [
        el('strong', {}, [
          `Chain head — last entry hash (id #${data.last_entry.id}, ${formatDateTime(data.last_entry.created_at)}):`
        ])
      ])
    );
    chainBlock.push(el('p', { class: 'mono small' }, [data.last_entry.entry_hash]));
  } else {
    chainBlock.push(el('p', { class: 'cert-empty' }, ['Chain is empty — no entries yet.']));
  }

  const sigBlock = (heading) =>
    el('div', { class: 'sig-block' }, [
      el('p', {}, [el('strong', {}, [heading])]),
      el('div', { class: 'sig-line' }),
      el('p', { class: 'sig-label' }, ['Signature']),
      el('div', { class: 'sig-line' }),
      el('p', { class: 'sig-label' }, ['Printed name']),
      el('div', { class: 'sig-line' }),
      el('p', { class: 'sig-label' }, ['Date'])
    ]);

  const cert = el('article', { class: 'certificate' }, [
    el('h1', {}, ['Plivex Verification Certificate']),
    el('section', { class: 'cert-meta' }, [
      el('p', {}, [el('strong', {}, ['Generated:']), ' ' + formatDateTime(data.generated_at)]),
      el('p', {}, [el('strong', {}, ['App version:']), ' ' + data.app_version]),
      el('p', {}, [el('strong', {}, ['Total entries:']), ' ' + data.total_entries])
    ]),
    el('section', { class: 'cert-chain' }, [el('h2', {}, ['Chain state']), ...chainBlock]),
    el('section', { class: 'cert-supersedes-block' }, [
      el('h2', {}, ['Supersede records']),
      supersedesBlock
    ]),
    el('section', { class: 'cert-attest' }, [
      el('h2', {}, ['Attestation']),
      el('p', {}, [
        'I attest that the chain state above accurately reflects the contents of my Plivex installation at the time and date stated.'
      ]),
      el('div', { class: 'cert-signatures' }, [
        sigBlock('Holder of record'),
        sigBlock('Witness (optional)')
      ])
    ]),
    el('p', { class: 'cert-footer' }, [
      'This certificate is generated client-side from the local Plivex database. It is not certified by any third party. See PRIVACY.md, docs/THREAT_MODEL.md, and docs/EVIDENTIARY_USE.md for context.'
    ])
  ]);

  root.appendChild(el('section', { class: 'screen certificate-screen' }, [topbar, cert]));
}
