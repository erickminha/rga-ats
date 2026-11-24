import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { db } from '@/lib/db';
import { firstParams, type SearchParams } from '@/lib/utils';
import { publicPostingText } from '@/lib/public-careers';
import { pickTalentFilters } from '@/lib/talent-search';
import { availabilityLabels, formatSalary, readCareerProfile, statesBR } from '@/lib/talent-profile';
import { searchTalents, talentIndicators } from '@/server/talent-search';
import { TalentProfileError } from '@/server/talent-profile';
import { dateBR } from '@/lib/i18n/pt-BR/recruiting';
import { btnTonal, inputClass } from '@/components/form-controls';
import { PageHeader } from '@/components/page-header';
import { TalentGroupEditor, TalentReuseForm } from '@/components/talent-search-controls';

const yesNo = { YES: 'Sim', NO: 'Não' };

function SelectFilter({ name, label, value, choices }: {
  name: string; label: string; value?: string; choices: Record<string, string>;
}) {
  return <label className="grid gap-1 text-sm">{label}
    <select name={name} className={inputClass} defaultValue={value ?? ''}>
      <option value="">Todos</option>
      {Object.entries(choices).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
    </select>
  </label>;
}

export default async function TalentSearchPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireSession();
  const raw = await firstParams(searchParams);
  const posting = raw.posting ? await db.posting.findFirst({
    where: { id: raw.posting, orgId: ctx.orgId, state: { not: 'CLOSED' } },
    select: { id: true, title: true, content: true },
  }) : null;
  if (raw.posting && !posting) notFound();

  const filters = pickTalentFilters({ ...raw, q: raw.q ?? posting?.title });
  const [groups, stages, indicators, result] = await Promise.all([
    db.talentPool.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    posting ? db.stage.findMany({ where: { orgId: ctx.orgId, type: { not: 'HIRED' } }, orderBy: { order: 'asc' }, select: { id: true, name: true } }) : [],
    !posting ? talentIndicators(ctx) : null,
    searchTalents(ctx, filters, { poolId: raw.pool, after: raw.after }).catch((error: unknown) => {
      if (!(error instanceof TalentProfileError)) throw error;
      return { pool: null, rows: [], next: undefined, error: error.message };
    }),
  ]);
  const postingId = posting?.id;
  const fromPipeline = raw.from === 'pipeline';
  const initialStage = stages.some((stage) => stage.id === raw.stage) ? raw.stage : undefined;
  const pipelineHref = `/pipeline?${new URLSearchParams({ ...(postingId ? { posting: postingId } : {}), ...(initialStage ? { stage: initialStage } : {}) }).toString()}`;
  const ids = result.rows.map((row) => row.id);
  const legacy = result.rows.flatMap((row) => row.resumeFileId ? [row.resumeFileId] : []);
  const [files, prior] = postingId ? await Promise.all([
    db.storedFile.findMany({
      where: { orgId: ctx.orgId, deletePendingAt: null,
        OR: [{ contactId: { in: ids }, resumeVersion: true }, { id: { in: legacy } }] },
      select: { id: true, contactId: true, filename: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    db.opportunity.findMany({ where: { orgId: ctx.orgId, postingId, contactId: { in: ids } }, select: { contactId: true } }),
  ]) : [[], []];
  const linked = new Set(prior.map((row) => row.contactId));
  const suggestions = posting ? publicPostingText(posting.content).requirements.slice(0, 6).map((term) => term.slice(0, 130)) : [];
  const next = new URLSearchParams({ ...filters, q: filters.q ?? '', ...(raw.pool ? { pool: raw.pool } : {}),
    ...(postingId ? { posting: postingId } : {}), ...(result.next ? { after: result.next } : {}),
    ...(fromPipeline ? { from: 'pipeline' } : {}), ...(initialStage ? { stage: initialStage } : {}) });

  const results = <div className="grid gap-3">
    {result.rows.length === 0 && !('error' in result) && <p>Nenhum profissional corresponde aos filtros.</p>}
    {result.rows.map((row) => {
      const selected = postingId && row.eligible && !linked.has(row.id);
      const profile = readCareerProfile(row.careerProfile);
      return <article className="grid gap-2 rounded-card bg-surface p-4" key={row.id}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="font-semibold"><Link className="underline" href={`/contacts/${row.id}`}>{row.name}</Link></h2>
          {selected && <label className="text-sm"><input type="checkbox" name="person" value={row.id} /> Selecionar para a vaga</label>}
        </div>
        <p className="text-sm">{[row.headline, row.location, profile.state, row.salaryExpectation !== null ? formatSalary(row.salaryExpectation) : null].filter(Boolean).join(' · ') || 'Perfil profissional não informado'}</p>
        {profile.skills && <p className="break-words text-sm">Competências: {profile.skills}</p>}
        <p className="text-xs text-ink-2">{row.hasResume ? 'Com currículo' : 'Sem currículo'} · Atualizado em {dateBR(row.updatedAt)}</p>
        {row.tags.length > 0 && <p className="break-words text-sm">{row.tags.join(' · ')}</p>}
        {postingId && linked.has(row.id) && <p className="text-sm">Já vinculado a esta vaga. Consulte o histórico na ficha.</p>}
        {postingId && !linked.has(row.id) && !row.eligible && <p className="text-sm">Sem autorização vigente ou com restrição para reaproveitamento.</p>}
        {selected && <label className="grid max-w-md gap-1 text-sm">Currículo para {row.name}
          <select className={inputClass} name={`file:${row.id}`}>
            <option value="">{row.resumeFileId ? 'Usar o currículo principal' : 'Sem currículo principal'}</option>
            {files.filter((file) => file.contactId === row.id || (file.contactId === null && file.id === row.resumeFileId))
              .map((file) => <option value={file.id} key={file.id}>{file.filename} · {dateBR(file.createdAt)}</option>)}
          </select>
        </label>}
        {selected && <Link className="text-sm underline" href={`/contacts/${row.id}#curriculos`}>Consultar versões de currículo</Link>}
      </article>;
    })}
  </div>;

  return <div className="mx-auto grid max-w-5xl gap-5 px-4 pb-10 md:px-6">
    <PageHeader title="Busca no banco de talentos" subtitle={posting ? `Selecione candidatos para ${posting.title}` : 'Localize profissionais pelo perfil ou pelo texto do currículo.'} />
    <nav className="flex flex-wrap gap-3 text-sm">
      <Link className="underline" href="/contacts">Banco de talentos</Link>
      {posting && <Link className="underline" href={`/postings/${posting.id}`}>Voltar para a vaga</Link>}
      {fromPipeline && <Link className="underline" href={pipelineHref}>Voltar ao funil</Link>}
      {posting && <Link className="underline" href="/contacts/new?mode=application">Cadastrar novo candidato</Link>}
    </nav>
    {indicators && <section className="grid gap-4 rounded-card bg-surface p-4">
      <h2 className="font-semibold">Indicadores do banco de talentos</h2>
      <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {Object.entries({ total: 'Profissionais', resumes: 'Com currículo', recent: 'Atualizados em até 30 dias', active: 'Em seleção ativa' }).map(([key, label]) =>
          <div key={key}><dt className="text-sm">{label}</dt><dd className="text-lg font-semibold">{indicators.counts[key as keyof typeof indicators.counts].toLocaleString('pt-BR')}</dd></div>)}
      </dl>
      <details><summary className="cursor-pointer">Principais áreas e localidades</summary>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div><h3 className="font-medium">Cargo ou área profissional</h3>{indicators.areas.length ? indicators.areas.map((item) => <p key={item.headline}>{item.headline} · {item._count.headline.toLocaleString('pt-BR')}</p>) : <p>Sem áreas registradas.</p>}</div>
          <div><h3 className="font-medium">Cidade ou localidade</h3>{indicators.cities.length ? indicators.cities.map((item) => <p key={item.location}>{item.location} · {item._count.location.toLocaleString('pt-BR')}</p>) : <p>Sem localidades registradas.</p>}</div>
        </div>
      </details>
    </section>}
    <form action="/contacts/busca" className="grid gap-3 rounded-card bg-surface p-4">
      {posting && <input type="hidden" name="posting" value={posting.id} />}
      {fromPipeline && <input type="hidden" name="from" value="pipeline" />}
      {initialStage && <input type="hidden" name="stage" value={initialStage} />}
      <label className="grid gap-1">Buscar por nome, telefone, cargo ou currículo
        <input className={inputClass} placeholder="Ex.: técnico em eletrônica, Excel ou CNH B" maxLength={200} defaultValue={filters.q} name="q" list="talent-suggestions" />
      </label>
      {suggestions.length > 0 && <p className="text-sm">Sugestões da vaga: {suggestions.join(' · ')}</p>}
      <datalist id="talent-suggestions">{suggestions.map((term) => <option key={term} value={term} />)}</datalist>
      <details open={Object.keys(filters).some((key) => key !== 'q') || !!raw.pool}>
        <summary className="cursor-pointer">Filtros de recrutamento</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          <SelectFilter name="pool" label="Grupo" value={raw.pool} choices={Object.fromEntries(groups.map((group) => [group.id, group.name]))} />
          <label className="grid gap-1 text-sm">Cidade <input name="city" className={inputClass} defaultValue={filters.city} /></label>
          <SelectFilter name="state" label="UF" value={filters.state} choices={Object.fromEntries(statesBR.map((uf) => [uf, uf]))} />
          <label className="grid gap-1 text-sm">Cargo ou área <input name="area" className={inputClass} defaultValue={filters.area} /></label>
          <label className="grid gap-1 text-sm">Competência <input name="skill" className={inputClass} defaultValue={filters.skill} /></label>
          <label className="grid gap-1 text-sm">Pretensão até (R$) <input name="salary" list="talent-salary" placeholder="Ex.: 3.500,00" className={inputClass} defaultValue={filters.salary} />
            <datalist id="talent-salary"><option value="Não informado" /></datalist>
          </label>
          <SelectFilter name="availability" label="Disponibilidade" value={filters.availability} choices={{ ...availabilityLabels, UNKNOWN: 'Não informada' }} />
          <label className="grid gap-1 text-sm">Etiqueta <input name="tag" className={inputClass} defaultValue={filters.tag} /></label>
          <SelectFilter name="resume" label="Currículo cadastrado" value={filters.resume} choices={yesNo} />
          <SelectFilter name="updated" label="Atualizado em" value={filters.updated} choices={{ '30': 'Últimos 30 dias', '90': 'Últimos 90 dias' }} />
          <SelectFilter name="history" label="Histórico de participações" value={filters.history} choices={yesNo} />
          <SelectFilter name="active" label="Em vaga ativa" value={filters.active} choices={yesNo} />
          <SelectFilter name="eligibility" label="Disponível para futuras vagas" value={filters.eligibility} choices={{ YES: 'Autorizado', NO: 'Sem autorização vigente ou com restrição', UNKNOWN: 'Não informado' }} />
        </div>
      </details>
      <button className={btnTonal}>Buscar profissionais</button>
    </form>
    {'error' in result && <p role="alert">{result.error}</p>}
    {postingId ? <TalentReuseForm postingId={postingId} stages={stages} initialStage={initialStage}>{results}</TalentReuseForm> : results}
    {result.next && <Link className="justify-self-start underline" href={`/contacts/busca?${next.toString()}`}>Próxima página</Link>}
    {!postingId && <TalentGroupEditor filters={filters} />}
    {!postingId && result.pool && <TalentGroupEditor id={result.pool.id} name={result.pool.name} dynamic={result.pool.kind === 'DYNAMIC'} filters={filters} />}
  </div>;
}
