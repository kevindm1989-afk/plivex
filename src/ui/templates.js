// Quick-add templates surface a pre-filled entry form one tap away from
// the entry list. Each template seeds a partial title + a type so the
// most common categorizations are zero-effort while leaving the content
// fully under the user's control.

export const TEMPLATES = [
  { id: 'incident',     label: 'Incident',       type: 'Safety',     titlePrefix: 'Incident: ' },
  { id: 'pay',          label: 'Pay issue',      type: 'Pay',        titlePrefix: 'Pay issue: ' },
  { id: 'verbal',       label: 'Verbal warning', type: 'Discipline', titlePrefix: 'Verbal warning: ' },
  { id: 'schedule',     label: 'Schedule',       type: 'Schedule',   titlePrefix: 'Schedule change: ' },
  { id: 'harassment',   label: 'Harassment',     type: 'Harassment', titlePrefix: 'Harassment: ' },
  { id: 'meeting',      label: 'Meeting',        type: 'Meeting',    titlePrefix: 'Meeting with ' },
  { id: 'conversation', label: 'Conversation',   type: 'Conversation', titlePrefix: 'Conversation with ' },
  { id: 'injury',       label: 'Injury',         type: 'Injury',     titlePrefix: 'Injury: ' }
];

export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}
