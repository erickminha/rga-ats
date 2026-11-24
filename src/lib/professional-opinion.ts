import { opinionFields } from '@/lib/i18n/pt-BR/assessment';

export type OpinionField = keyof typeof opinionFields;
export const opinionKeys = Object.keys(opinionFields) as OpinionField[];
export const publicOpinionKeys = ['education', 'history', 'experience', 'competencies', 'recommendation'] as const;
export const assistedFields = ['education', 'history', 'experience', 'interview', 'competencies', 'strengths'] as const;
export const customerFeedbackLabels = {
  WAIT: 'Aguardando retorno', INTERVIEW: 'Interesse em entrevistar', APPROVED: 'Aprovado pelo cliente',
  DECLINED: 'Não selecionado pelo cliente', INFORMATION: 'Solicitação de informações complementares',
};

export function opinionTemplate(value: unknown) {
  return Array.isArray(value) ? opinionKeys.filter((field) => field === 'recommendation' || value.includes(field)) : opinionKeys;
}

export type OpinionTemplate = { id: string; name: string; sections: OpinionField[]; inactive: boolean };

export function opinionTemplates(value: unknown): OpinionTemplate[] {
  const defaults = { id: 'rga', name: 'Parecer profissional RGA', sections: opinionTemplate(value), inactive: false };
  if (!Array.isArray(value) || value.length === 0 || typeof value[0] === 'string') return [defaults];
  return value.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || !('id' in entry) || !('name' in entry)
      || typeof entry.id !== 'string' || typeof entry.name !== 'string') return [];
    return [{ id: entry.id, name: entry.name, sections: opinionTemplate('sections' in entry ? entry.sections : null),
      inactive: 'inactive' in entry && entry.inactive === true }];
  });
}

export type OpinionMetadata = {
  candidate: string;
  posting: string;
  client: string;
  author: string;
  organization: string;
};
