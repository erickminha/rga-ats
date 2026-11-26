import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { dayBR } from '@/lib/i18n/pt-BR/recruiting';
import { readAdFields } from '@/lib/rga-productivity';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { firstParams, type SearchParams } from '@/lib/utils';
import { btnTonal, inputClass, surface } from '@/components/form-controls';
import { getListMeta } from '@/server/lists/cache';
import { operationalConditions, operationalDate, operationalLabels } from '@/server/operational-pipeline';

export default async function OperationalPipelinePage({ searchParams }: { searchParams: SearchParams }) {
  const { orgId } = await requireSession();
  const input = await firstParams(searchParams);
  const now = new Date();
  const from = operationalDate(input.from);
  const to = operationalDate(input.to, true);
  const scope: Prisma.OpportunityWhereInput = {
    orgId, contact: { orgId, isAnonymized: false },
    ...(input.posting ? { postingId: input.posting } : {}),
    ...(input.client ? { posting: { orgId, clientCompanyId: input.client, clientCompany: { orgId } } } : {}),
    ...(input.owner ? { OR: [{ owner: { id: input.owner, orgId } }, { ownerId: null, posting: { orgId, owner: { id: input.owner, orgId } } }] } : {}),
    ...(input.stage ? { stageId: input.stage } : {}),
    ...(from || to ? { createdAt: { gte: from, lt: to } } : {}),
  };
  const [meta, owners, links, feedback, postings, tasks] = await Promise.all([
    getListMeta(orgId),
    db.user.findMany({ where: { orgId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.shareLink.findMany({ where: { orgId, scope: 'shortlist', ...(input.posting ? { targetId: input.posting } : {}) }, select: { selection: true, targetId: true, expiresAt: true, revokedAt: true, sentAt: true } }),
    db.recruitingAssessment.findMany({ where: { opportunity: scope, NOT: { clientFeedback: { equals: [] } } },
      select: { opportunityId: true, clientFeedback: true, opportunity: { select: { postingId: true, posting: { select: { clientCompanyId: true } } } } } }),
    db.posting.findMany({ where: { orgId, ...(input.posting ? { id: input.posting } : {}), ...(input.client ? { clientCompanyId: input.client } : {}) },
      select: { id: true, title: true, content: true, state: true, ownerId: true, clientCompanyId: true, clientCompany: { select: { active: true } } } }),
    db.task.findMany({ where: { orgId, completedAt: null, dueAt: { not: null },
      ...(input.owner ? { assigneeId: input.owner } : {}),
      ...(input.posting || input.client || input.stage || from || to ? { opportunity: scope } : {}),
    }, orderBy: [{ dueAt: 'asc' }, { id: 'asc' }], take: 5, select: { id: true, title: true, dueAt: true, opportunityId: true } }),
  ]);
  const clientsByPosting = new Map(postings.map(row => [row.id, row.clientCompanyId]));
  const livePostings = new Set(postings.filter(row => row.state === 'PUBLISHED' && row.clientCompany?.active).map(row => row.id));
  const presented = new Set<string>();
  const live = new Set<string>();
  for (const link of links) {
    const data = link.selection as { clientId?: string; candidates?: { id: string }[] } | null;
    if (!data?.clientId || data.clientId !== clientsByPosting.get(link.targetId) || !Array.isArray(data.candidates)) continue;
    for (const item of data.candidates) {
      if (typeof item?.id !== 'string') continue;
      if (link.sentAt) {
        presented.add(item.id);
        if (!link.revokedAt && link.expiresAt > now && livePostings.has(link.targetId)) live.add(item.id);
      }
    }
  }
  const responseById = new Map(feedback.flatMap(row => {
    const clientId = row.opportunity.posting?.clientCompanyId;
    if (!clientId || !Array.isArray(row.clientFeedback)) return [];
    const latest = row.clientFeedback.findLast(item => !!item && typeof item === 'object' && !Array.isArray(item) && item.clientId === clientId);
    return latest && typeof latest === 'object' && !Array.isArray(latest) ? [[row.opportunityId, latest.status]] as const : [];
  }));
  const through = +operationalDate(dayBR(now), true)! + 7 * 86_400_000;
  const deadlines = postings.flatMap(row => {
    if (!['PUBLISHED', 'INTERNAL'].includes(row.state) || (input.owner && row.ownerId !== input.owner)) return [];
    const deadline = readAdFields(row.content).deadline;
    const parts = deadline?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const until = operationalDate(parts ? parts[3] + '-' + parts[2] + '-' + parts[1] : deadline, true);
    return until && +until > +now && +until <= through ? [{ ...row, until }] : [];
  }).sort((a, b) => +a.until - +b.until);
  const conditions = operationalConditions(orgId, now, [...presented],
    [...live].filter(id => !responseById.has(id) || responseById.get(id) === 'WAIT'),
    [...responseById].filter(([, status]) => status === 'APPROVED').map(([id]) => id));
  const metric = input.pending && Object.hasOwn(conditions, input.pending) ? input.pending as keyof typeof conditions : undefined;
  const where = metric ? { AND: [scope, conditions[metric]] } : scope;
  const requested = Number(input.page || 1);
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(1000, requested) : 1;
  const pageSize = 40;
  const metrics = Object.keys(operationalLabels) as (keyof typeof conditions)[];
  const [rows, totals, stageCounts] = await Promise.all([
    db.opportunity.findMany({ where, orderBy: [{ stageChangedAt: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize, take: pageSize + 1, select: {
        id: true, stageChangedAt: true, stage: { select: { name: true } }, status: true,
        contact: { select: { name: true } }, posting: { select: { title: true, clientCompany: { select: { name: true } }, owner: { select: { name: true } } } },
        owner: { select: { name: true } },
        interviews: { where: { orgId, state: 'SCHEDULED' }, orderBy: { startAt: 'asc' }, take: 1, select: { startAt: true } },
      } }),
    Promise.all(metrics.map(key => db.opportunity.count({ where: { AND: [scope, conditions[key]] } }))),
    db.opportunity.groupBy({ by: ['stageId'], where: { AND: [scope, { status: { not: 'ARCHIVED' } }] }, _count: true }),
  ]);
  const filters = [
    ['posting', 'Vaga', meta.postings.map(({ id, title }) => ({ id, name: title }))],
    ['client', 'Empresa cliente', meta.clients], ['owner', 'Responsável', owners], ['stage', 'Etapa', meta.stages],
    ['pending', 'Indicador ou pendência', metrics.map(id => ({ id, name: operationalLabels[id] }))],
  ] as const;
  const url = (change: Record<string, string>) => ({
    pathname: '/pipeline/operacao',
    query: { ...Object.fromEntries(Object.entries(input).filter(([key]) => ['posting', 'client', 'owner', 'stage', 'from', 'to', 'pending', 'page'].includes(key))), ...change },
  });
  return <main className="mx-auto grid max-w-6xl gap-4 p-4 sm:p-6">
    <Link className="underline" href={{ pathname: '/pipeline', query: { posting: input.posting, client: input.client, owner: input.owner } }}>Voltar ao funil</Link>
    <h1 className="text-xl font-semibold">Acompanhamento operacional</h1>
    <form className={surface + ' grid gap-3 p-4 sm:grid-cols-3'}>
      {filters.map(([key, label, options]) => <label className="grid min-w-0 gap-1 text-sm" key={key}>{label}
        <select className={inputClass + ' min-w-0'} name={key} defaultValue={input[key] ?? ''}>
          <option value="">Todos</option>{options.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>)}
      <label className="grid gap-1 text-sm">Participações criadas a partir de<input className={inputClass} type="date" name="from" defaultValue={input.from} /></label>
      <label className="grid gap-1 text-sm">Participações criadas até<input className={inputClass} type="date" name="to" defaultValue={input.to} /></label>
      <button className={btnTonal}>Aplicar filtros</button>
    </form>
    <section className={surface + ' p-4'}>
      <h2 className="font-medium">Indicadores</h2>
      <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">{metrics.map((key, index) => <li key={key}>
        <Link className="underline" aria-current={metric === key ? 'true' : undefined} href={url({ pending: key, page: '1' })}>{operationalLabels[key]}</Link> · {totals[index]}
      </li>)}</ul>
      <details className="mt-4"><summary>Candidatos ativos e contratados por etapa</summary>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{meta.stages.map(stage => <li key={stage.id}>{stage.name} · {stageCounts.find(row => row.stageId === stage.id)?._count ?? 0}</li>)}</ul>
      </details>
    </section>
    <section className={surface + ' grid min-w-0 gap-3 p-4 sm:grid-cols-2'}>
      <div>
        <h2 className="font-medium">Prazos de candidatura nos próximos 7 dias</h2>
        <ul className="mt-2 grid gap-1 text-sm">{deadlines.map(row => <li key={row.id} className="break-words">
          <Link className="underline" href={'/postings/' + row.id}>{row.title}</Link> · {new Date(+row.until - 1).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
        </li>)}</ul>
        {!deadlines.length && <p className="mt-2 text-sm">Nenhum prazo próximo com data registrada.</p>}
      </div>
      <div>
        <h2 className="font-medium">Tarefas em aberto com prazo</h2>
        <ul className="mt-2 grid gap-1 text-sm">{tasks.map(task => <li key={task.id} className="break-words">
          <Link className="underline" href={task.opportunityId ? '/candidates/' + task.opportunityId : '/tasks'}>{task.title}</Link> · {task.dueAt?.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
        </li>)}</ul>
        <Link className="mt-2 inline-block text-sm underline" href="/tasks">Abrir tarefas</Link>
      </div>
    </section>
    <section className={surface + ' min-w-0 p-4'}>
      <h2 className="font-medium">{metric ? operationalLabels[metric] : 'Participações'}</h2>
      <ul className="mt-2 divide-y divide-line">{rows.slice(0, pageSize).map(row => <li className="grid gap-1 break-words py-3 text-sm sm:grid-cols-3" key={row.id}>
        <Link className="font-medium underline" href={'/candidates/' + row.id + (metric === 'references' ? '#referencias' : '')}>{row.contact.name}</Link>
        <span>{[row.posting?.title, row.posting?.clientCompany?.name, row.owner?.name ?? row.posting?.owner?.name].filter(Boolean).join(' · ')}</span>
        <div>
          <p>{row.stage.name} · {Math.max(0, Math.floor((+now - +row.stageChangedAt) / 86_400_000))} dia(s) na etapa</p>
          {row.interviews[0] && <p>Entrevista em {row.interviews[0].startAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</p>}
          {row.status === 'HIRED' && <p>Contratação registrada</p>}
          {responseById.get(row.id) === 'APPROVED' && <p>Aprovação do cliente registrada</p>}
        </div>
      </li>)}</ul>
      {!rows.length && <p className="mt-2 text-sm">Nenhuma participação para estes filtros.</p>}
      <nav className="mt-2 flex gap-4 text-sm" aria-label="Páginas de participações">
        {page > 1 && <Link className="underline" href={url({ page: String(page - 1) })}>Anterior</Link>}
        {rows.length > pageSize && page < 1000 && <Link className="underline" href={url({ page: String(page + 1) })}>Próxima</Link>}
      </nav>
    </section>
  </main>;
}
