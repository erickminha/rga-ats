import { isArchiveCategory, outcomeNames } from '@/lib/i18n/pt-BR/recruiting';
type FeedEvent = {
  id: string;
  verb: string;
  payload: Record<string, unknown> | null;
  occurredAt: string;
  actorName?: string | null;
};

function describe(event: FeedEvent): string {
  const p = event.payload ?? {};
  switch (event.verb) {
    case 'opportunity.created':
      return `Adicionado ao funil na etapa ${p.stageName ?? 'não informada'}`;
    case 'opportunity.stage_changed':
      return `Da etapa ${p.from} para ${p.to}${p.note ? ` · ${p.note}` : ''}`;
    case 'opportunity.hired':
      return `Contratação registrada${typeof p.hiredAt === 'string' ? ` em ${p.hiredAt.split('-').reverse().join('/')}` : ''}`;
    case 'opportunity.archived':
      return `${typeof p.category === 'string' && isArchiveCategory(p.category) ? outcomeNames[p.category] : 'Participação encerrada'} · ${p.reason ?? 'Sem informação'}${p.stage ? ` · Etapa: ${p.stage}` : ''}${p.note ? ` · ${p.note}` : ''}`;
    case 'opportunity.unarchived':
      return 'Participação reaberta';
    case 'note.added':
      return 'Anotação adicionada';
    case 'application.received':
      return `Candidatura a ${p.postingTitle ?? 'uma vaga'} pela página de carreiras`;
    case 'interview.scheduled':
      return `Entrevista agendada: ${p.title}${Array.isArray(p.panel) && p.panel.length ? ` com ${(p.panel as string[]).join(', ')}` : ''}`;
    case 'interview.completed':
      return `Entrevista concluída: ${p.title}`;
    case 'interview.canceled':
      return `Entrevista cancelada: ${p.title}`;
    case 'feedback.submitted':
      return `Avaliação enviada — ${p.rating}`;
    case 'email.sent':
      return `E-mail enviado: ${p.subject}`;
    case 'email.scheduled':
      return `E-mail agendado: ${p.subject}`;
    case 'email.canceled':
      return `Envio de e-mail cancelado: ${p.subject}`;
    case 'ai.evaluation_completed':
      return `Avaliação por IA concluída (${p.model})`;
    case 'task.created':
      return `Tarefa adicionada: ${p.title}`;
    case 'task.completed':
      return `Tarefa concluída: ${p.title}`;
    case 'opportunity.snoozed':
      return `Adiado até ${p.until ? new Date(String(p.until)).toLocaleDateString('pt-BR') : 'mais tarde'}`;
    case 'opportunity.unsnoozed':
      return 'Adiamento removido';
    case 'offer.created':
      return `Proposta em rascunho: ${p.jobTitle}`;
    case 'offer.approval_requested':
      return `Proposta enviada para aprovação: ${p.jobTitle}`;
    case 'offer.pending_approval':
      return `Proposta aguardando aprovação: ${p.jobTitle}`;
    case 'offer.sent':
      return `Proposta enviada: ${p.jobTitle}`;
    case 'offer.accepted':
      return `Proposta aceita 🎉 ${p.jobTitle}`;
    case 'offer.declined':
      return `Proposta recusada: ${p.jobTitle}`;
    case 'offer.withdrawn':
      return `Proposta retirada: ${p.jobTitle}`;
    case 'referral.submitted':
      return `Indicação recebida de ${p.referrerName ?? 'um membro da equipe'}`;
    case 'scheduling.link_created':
      return `Link de agendamento criado: ${p.title}`;
    case 'interview.self_scheduled':
      return `Agendamento pelo candidato: ${p.title}`;
    case 'contact.merged':
      return `Perfil duplicado unificado: ${p.mergedName}`;
    case 'contact.tagged':
      return `Etiquetas atualizadas: ${Array.isArray(p.tags) ? (p.tags as string[]).join(', ') : ''}`;
    case 'opportunity.imported':
      return `Importado de ${p.source ?? 'outro ATS'}`;
    case 'disc.invited': return 'Convite DISC gerado';
    case 'disc.submitted': return 'Questionário DISC respondido';
    case 'disc.emailed': return 'Convite DISC enviado por e-mail';
    case 'disc.cancelled': return 'Convite DISC cancelado';
    case 'disc.interpreted': return 'Interpretação DISC preparada';
    case 'disc.interpretation_edited': return 'Interpretação DISC revisada';
    case 'disc.reviewed': return 'Revisão DISC concluída';
    case 'disc.recalculated': return 'DISC recalculado em nova versão';
    default:
      return 'Atividade registrada';
  }
}

export function ActivityFeed({ events }: { events: FeedEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-ink-2">Nenhuma atividade registrada.</p>;
  }
  return (
    <ol className="flex flex-col">
      {events.map((event) => (
        <li key={event.id} className="group relative pb-4 pl-4 last:pb-0">
          {/* the rail runs from this dot to the next one, so it ends at the last dot */}
          <span aria-hidden className="absolute -bottom-1.5 left-[3.5px] top-3.5 w-px bg-line group-last:hidden" />
          <span aria-hidden className="absolute left-0 top-1.5 size-2 rounded-full bg-ink-3" />
          <p className="text-sm">{describe(event)}</p>
          <p className="mt-0.5 text-xs text-ink-2">
            {new Date(event.occurredAt).toLocaleString('pt-BR', {
              timeZone: 'America/Sao_Paulo', hour12: false,
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })}{event.actorName && ` · ${event.actorName}`}
          </p>
        </li>
      ))}
    </ol>
  );
}
