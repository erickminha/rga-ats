import type { StageType } from '@prisma/client';
import { isRgaWorkspace } from '@/server/rga-workspace';

export const RGA_STAGES = [
  { name: 'Candidatura', type: 'APPLICANT', defaultName: 'New applicant', translatedDefaultName: 'Nova candidatura' },
  { name: 'Triagem', type: 'SCREEN', defaultName: 'Phone screen', translatedDefaultName: 'Triagem por telefone' },
  { name: 'Entrevista', type: 'ONSITE', defaultName: 'On-site', translatedDefaultName: 'Entrevista presencial' },
  { name: 'Finalistas', type: 'ONSITE' },
  { name: 'Avaliação DISC', type: 'ONSITE' },
  { name: 'Parecer', type: 'ONSITE' },
  { name: 'Apresentação ao cliente', type: 'ONSITE' },
  { name: 'Contratação', type: 'HIRED', defaultName: 'Hired', translatedDefaultName: 'Contratado' },
] satisfies { name: string; type: StageType; defaultName?: string; translatedDefaultName?: string }[];

export function allowsAutomaticScheduling(orgId: string, stage: { name: string; type: StageType }) {
  if (stage.type !== 'SCREEN' && stage.type !== 'ONSITE') return false;
  if (!isRgaWorkspace(orgId)) return true;
  const official = RGA_STAGES.find(({ name, type }) => type === stage.type && name === stage.name);
  return !official || official.name === 'Triagem' || official.name === 'Entrevista';
}
