import type { Tone } from '@/components/ui/primitives';

/** Badge label and tone for each posting state (server and client). */
export const POSTING_STATE_BADGES: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Rascunho', tone: 'neutral' },
  PENDING_APPROVAL: { label: 'Aguardando aprovação', tone: 'caution' },
  PUBLISHED: { label: 'Publicada', tone: 'positive' },
  INTERNAL: { label: 'Interna', tone: 'info' },
  CLOSED: { label: 'Encerrada', tone: 'neutral' },
};
