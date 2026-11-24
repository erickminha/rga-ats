import type { StageType } from '@prisma/client';

export function confirmStageMovement(type?: StageType, exceptional = false) {
  if (type === 'HIRED') {
    const answer = window.prompt('Confirme a data efetiva da contratação (DD/MM/AAAA).');
    if (!answer) return null;
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(answer.trim());
    if (!match) {
      window.alert('Use o formato DD/MM/AAAA.');
      return null;
    }
    return { hireDate: `${match[3]}-${match[2]}-${match[1]}` };
  }
  if (!exceptional) return {};
  const note = window.prompt('Observação opcional para a movimentação entre etapas.');
  return note === null ? null : { note };
}
