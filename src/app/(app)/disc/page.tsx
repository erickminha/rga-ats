import Link from 'next/link';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { canManageRecruiting, isAdmin, requireSession } from '@/lib/session';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { DiscInterpretationEditor, DiscInvite, DiscManage } from '@/components/native-disc-controls';
import { dimensions, localDiscInterpretation, type Scores } from '@/lib/native-disc';

const colors = { D: '#B42318', I: '#F9C82B', S: '#23734D', C: '#116DA9' };
const date = (when: Date) => when.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

export default async function DiscPage({ searchParams }: { searchParams: Promise<{ vaga?: string; candidato?: string; empresa?: string; participacao?: string; situacao?: string; responsavel?: string; desde?: string }> }) {
  const ctx = await requireSession();
  if (!canManageRecruiting(ctx)) notFound();
  const params = await searchParams;
  const since = params.desde && /^\d{4}-\d{2}-\d{2}$/.test(params.desde) ? new Date(params.desde + 'T00:00:00-03:00') : null;
  const deadline = new Date();
  const cases: Record<string, Prisma.NativeDiscWhereInput> = {
    aguardando: { submittedAt: null, cancelledAt: null, expiresAt: { gt: deadline }, revision: 0 },
    preenchendo: { submittedAt: null, cancelledAt: null, expiresAt: { gt: deadline }, revision: { gt: 0 } },
    processamento: { submittedAt: { not: null }, reviewedAt: null, results: { path: ['analysis'], equals: Prisma.AnyNull } },
    revisao: { submittedAt: { not: null }, reviewedAt: null, NOT: { results: { path: ['analysis'], equals: Prisma.AnyNull } } },
    concluido: { reviewedAt: { not: null } },
    expirado: { expiresAt: { lte: deadline }, submittedAt: null, cancelledAt: null },
    cancelado: { cancelledAt: { not: null } },
  };
  const condition = Object.hasOwn(cases, params.situacao ?? '') ? cases[params.situacao as keyof typeof cases] : {};
  const filterDiscs = { ...condition, ...(params.responsavel ? { createdById: params.responsavel } : {}),
    ...(since && Number.isFinite(+since) ? { createdAt: { gte: since } } : {}) };
  const staff = await db.user.findMany({ where: { orgId: ctx.orgId }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  const vacancies = await db.posting.findMany({ where: { orgId: ctx.orgId }, select: { id: true, title: true }, orderBy: { title: 'asc' } });
  const staffNames = new Map(staff.map(user => [user.id, user.name]));
  const opportunities = await db.opportunity.findMany({ where: {
    orgId: ctx.orgId, confidential: false,
    ...(params.situacao === 'novo' ? { nativeDiscs: { none: {} } } :
      Object.keys(filterDiscs).length ? { nativeDiscs: { some: filterDiscs } } : {}),
    ...(params.participacao ? { id: params.participacao } : {}), ...(params.vaga ? { postingId: params.vaga } : {}),
    posting: { orgId: ctx.orgId, ...(params.empresa ? { clientCompany: { name: { contains: params.empresa, mode: 'insensitive' } } } : {}) },
    contact: { isAnonymized: false, retentionHold: false,
      ...(params.candidato ? { name: { contains: params.candidato, mode: 'insensitive' } } : {}) },
  }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 100, select: {
    id: true, contact: { select: { name: true } }, posting: { select: { title: true, clientCompany: { select: { name: true } } } },
    nativeDiscs: { where: filterDiscs, orderBy: { createdAt: 'desc' }, take: 20,
      select: { id: true, createdById: true, simulation: true, scoringKey: true, createdAt: true, emailedAt: true, expiresAt: true, submittedAt: true, cancelledAt: true, reviewedAt: true, revision: true, results: true } },
  } });
  const test = ctx.orgId === process.env.RGA_DISC_TEST_ORG_ID;
  return <main className="grid gap-4 p-5">
    <PageHeader title="Central DISC" subtitle="Convites, acompanhamento e revisão das avaliações por vaga." />
    {isAdmin(ctx) && <Link className="underline" href="/settings/ia">Configurar inteligência artificial</Link>}
    <form className="flex flex-wrap items-end gap-3">
      <label className="grid text-sm">Candidato <input className="rounded-field border border-line p-2" name="candidato" defaultValue={params.candidato} /></label>
      <label className="grid text-sm">Empresa <input className="rounded-field border border-line p-2" name="empresa" defaultValue={params.empresa} /></label>
      <label className="grid text-sm">Vaga <select className="rounded-field border border-line p-2" name="vaga" defaultValue={params.vaga}>
        <option value="">Todas</option>{vacancies.map(vacancy => <option key={vacancy.id} value={vacancy.id}>{vacancy.title}</option>)}
      </select></label>
      <label className="grid text-sm">Desde <input className="rounded-field border border-line p-2" type="date" name="desde" defaultValue={params.desde} /></label>
      <label className="grid text-sm">Responsável <select name="responsavel" defaultValue={params.responsavel} className="rounded-field border border-line p-2">
        <option value="">Todos</option>{staff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
      </select></label>
      <label className="grid text-sm">Situação <select name="situacao" defaultValue={params.situacao} className="rounded-field border border-line p-2">
        {Object.entries({ '': 'Todas', novo: 'Não solicitado', aguardando: 'Aguardando resposta', preenchendo: 'Em preenchimento',
          processamento: 'Aguardando processamento', revisao: 'Aguardando revisão', concluido: 'Concluído', expirado: 'Expirado', cancelado: 'Cancelado' }).map(([value,label]) =>
          <option key={value} value={value}>{label}</option>)}
      </select></label>
      <button className="underline">Filtrar</button>
    </form>
    {opportunities.length === 0 && <p>Nenhuma participação corresponde aos filtros.</p>}
    {opportunities.map(item => <section key={item.id} className="rga-card grid gap-3 p-4">
      <h2 className="font-semibold"><Link href={'/candidates/' + item.id}>{item.contact.name}</Link></h2>
      <p>{item.posting?.title} {item.posting?.clientCompany && '· ' + item.posting.clientCompany.name}</p>
      <DiscInvite opportunityId={item.id} test={test} />
      {item.nativeDiscs.length === 0 && <p>Não solicitado</p>}
      {item.nativeDiscs.map(row => {
        const label = row.reviewedAt ? 'Concluído' : row.submittedAt ? (row.results && 'analysis' in (row.results as object) ? 'Aguardando revisão' : 'Aguardando processamento') : row.cancelledAt ? 'Cancelado' :
          +row.expiresAt <= Date.now() ? 'Expirado' : row.revision ? 'Em preenchimento' : 'Aguardando resposta';
        const scores = row.results as (Scores & { analysis?: ReturnType<typeof localDiscInterpretation>; provider?: string; model?: string; aiPending?: boolean }) | null;
        const analysis = scores && (scores.analysis ?? localDiscInterpretation(scores));
        const version = (row.scoringKey as { version?: string } | null)?.version;
        return <article className="grid gap-2 border-t border-line pt-3" key={row.id}>
          <h3 className="font-medium">{label}{row.simulation && ' · Simulação'}</h3>
          <p className="text-sm">{staffNames.get(row.createdById) ?? 'Responsável indisponível'} · Criado em {date(row.createdAt)} · Prazo até {date(row.expiresAt)}{row.emailedAt && ' · Enviado em ' + date(row.emailedAt)}{row.submittedAt && ' · Respondido em ' + date(row.submittedAt)}</p>
          {scores && analysis && <>
            <p>{analysis.profile} · {version} · {scores.provider === 'manual' ? 'Revisão humana' : scores.provider && scores.provider !== 'local' ? 'IA · ' + scores.model : 'Modelo local'}</p>
            {dimensions.map(d => <div key={d} className="grid grid-cols-[3rem_1fr] items-center gap-2">
              <span>{d} {scores[d]}</span><div aria-hidden="true" className="h-2 rounded bg-[#F5F5F5]"><div className="h-2 rounded" style={{ backgroundColor: colors[d], width: (scores[d] / 40 * 100) + '%' }} /></div>
            </div>)}
            <p>{analysis.expected}</p><p>{analysis.detail}</p><p>{analysis.strengths.join(' · ')}</p><p>{analysis.attention}</p><p>{analysis.environment}</p><p>{analysis.interview}</p>
          </>}
          {!row.submittedAt && !row.cancelledAt && <DiscManage id={row.id} action="cancel" />}
          {row.submittedAt && !row.reviewedAt && scores?.analysis && <DiscInterpretationEditor id={row.id} revision={row.revision} analysis={scores.analysis} />}
          {row.submittedAt && !row.reviewedAt && (!scores?.analysis || scores.aiPending) && <DiscManage id={row.id} action="prepare" />}
          {row.submittedAt && !row.reviewedAt && scores?.analysis && <DiscManage id={row.id} action="review" />}
          {row.reviewedAt && <Link className="underline" href={'/candidates/' + item.id}>Abrir ficha e preparar parecer</Link>}
        </article>;
      })}
    </section>)}
  </main>;
}
