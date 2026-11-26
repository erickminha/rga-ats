// Task deadlines are calendar dates, stored at midnight UTC for compatibility.
export function taskDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0,10) !== value) throw new Error('Informe um prazo válido.');
  return new Date(value+'T00:00:00Z');
}

export function taskDay(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',dateStyle:'short'}).format(now);
}

export function taskDateLabel(value: string) {
  return value.slice(0,10).split('-').reverse().join('/');
}

export function taskStatus(dueAt: string | null, completed: boolean, today: string) {
  if (completed) return 'completed';
  if (!dueAt) return 'pending';
  const day=dueAt.slice(0,10);
  return day<today?'overdue':day===today?'today':'pending';
}
