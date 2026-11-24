import type { StageType } from '@prisma/client';
import { isRgaWorkspace } from '@/server/rga-workspace';

export const RGA_STAGES = [
  { name: 'Candidatura', type: 'APPLICANT', defaultName: 'New applicant' },
  { name: 'Triagem', type: 'SCREEN', defaultName: 'Phone screen' },
  { name: 'Entrevista', type: 'ONSITE', defaultName: 'On-site' },
  { name: 'Finalistas', type: 'ONSITE' },
  { name: 'Avaliação DISC', type: 'ONSITE' },
  { name: 'Parecer', type: 'ONSITE' },
  { name: 'Apresentação ao cliente', type: 'ONSITE' },
  { name: 'Contratação', type: 'HIRED', defaultName: 'Hired' },
] satisfies { name: string; type: StageType; defaultName?: string }[];

export function allowsAutomaticScheduling(orgId: string, stage: { name: string; type: StageType }) {
  if (stage.type !== 'SCREEN' && stage.type !== 'ONSITE') return false;
  if (!isRgaWorkspace(orgId)) return true;
  const official = RGA_STAGES.find(({ name, type }) => type === stage.type && name === stage.name);
  return !official || official.name === 'Triagem' || official.name === 'Entrevista';
}
