import Link from 'next/link';
import { ArrowUpRight, Plus, Search } from 'lucide-react';
import { RgaJobs, RgaTalents, RgaPipeline, RgaInterviews, RgaSearch } from '@/components/ui/rga-icons';
import type { loadDashboardPage } from '@/app/(app)/page-loaders';
import { ApprovalQueue } from '@/components/approval-queue';
import { DashboardInterviews } from '@/components/dashboard-interviews';
import { LocalTime } from '@/components/local-time';
import { inputClass, noAutofill } from '@/components/form-controls';
import { buttonClass } from '@/components/ui/button';

const number = new Intl.NumberFormat('pt-BR');

export function DashboardScreen({ data }: { data: Awaited<ReturnType<typeof loadDashboardPage>> }) {
  const metrics = [
    { label: 'Vagas publicadas ou internas', value: data.activePostingCount, hint: `${number.format(data.postingCount)} cadastradas no total`, href: '/postings', icon: RgaJobs, color: '#116da9', bg: '#e7f4fc' },
    { label: 'Banco de talentos', value: data.contactCount, hint: 'Profissionais cadastrados', href: '/contacts', icon: RgaTalents, color: '#6c336e', bg: '#f4eaf5' },
    { label: 'Participações no funil', value: data.activeCount, hint: 'Ativas e contratadas, exceto adiadas', href: '/pipeline', icon: RgaPipeline, color: '#116da9', bg: '#e7f4fc' },
    { label: 'Entrevistas futuras', value: data.upcomingCount, hint: 'Agendadas e não canceladas', href: '/interviews', icon: RgaInterviews, color: '#80580b', bg: '#fff5d2' },
  ];
  const quick = [
    { label: 'Cadastrar vaga', hint: 'Iniciar um novo processo', href: '/postings/new', icon: RgaJobs },
    { label: 'Buscar profissionais', hint: 'Pesquisar no banco de talentos', href: '/contacts/busca', icon: RgaSearch },
    { label: 'Acompanhar o funil', hint: 'Gerenciar etapas e candidatos', href: '/pipeline', icon: RgaPipeline },
    { label: 'Agenda de entrevistas', hint: 'Consultar os compromissos', href: '/interviews', icon: RgaInterviews },
  ];
  const max = Math.max(1, ...data.stageSummary.map((stage) => stage.count));
  const colors = ['#1581c9', '#307fb3', '#6c336e', '#9a629c', '#f9c82b'];
  return (
    <div className="t-reveal mx-auto max-w-[1600px] px-4 pb-8 pt-5 sm:px-6 lg:px-8">
      <header className="rga-hero mb-5 flex flex-wrap items-end justify-between gap-5 p-5 sm:p-7">
        <div className="min-w-0">
          <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#d4e7f6]"><span className="size-2 rounded-full bg-[#f9c82b]" /> Central de recrutamento</p>
          <h1 className="text-2xl font-semibold sm:text-3xl">{data.firstName ? `Olá, ${data.firstName}` : 'Olá!'}</h1>
          <p className="mt-2 text-sm text-[#d4e7f6]">Acompanhe as vagas, os talentos e os próximos passos da sua operação.</p>
          <p className="mt-3 text-xs capitalize text-[#d4e7f6]"><LocalTime date={new Date().toISOString()} options={{ weekday: 'long', month: 'long', day: 'numeric' }} /></p>
        </div>
        <Link href="/postings/new" className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#f9c82b] px-4 text-sm font-bold text-[#161d27] hover:bg-[#ffda60]"><Plus size={18} /> Nova vaga</Link>
      </header>

      <section aria-label="Indicadores" className="mb-5 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, hint, href, icon: Icon, color, bg }) => (
          <Link key={href} href={href} className="rga-card group flex min-w-0 flex-col gap-3 p-4 transition-shadow hover:shadow-lift">
            <div className="flex items-center justify-between">
              <span className="grid size-10 place-items-center rounded-xl" style={{ background: bg, color }}><Icon size={27} strokeWidth={1.65} /></span>
              <ArrowUpRight size={18} className="text-ink-2 group-hover:text-brand" />
            </div>
            <div><p className="text-sm font-bold text-ink-2">{label}</p><p className="rga-display mt-1 text-3xl font-semibold tabular-nums text-ink">{number.format(value)}</p></div>
            <p className="text-xs text-ink-2">{hint}</p>
          </Link>
        ))}
      </section>

      <div className="mb-5 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
        <section className="rga-card min-w-0 p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div><h2 className="text-lg font-semibold">Funil de recrutamento</h2><p className="mt-1 text-xs text-ink-2">Participações visíveis por etapa</p></div>
            <Link href="/pipeline" className={buttonClass({ variant: 'secondary', size: 'sm' })}>Abrir funil <ArrowUpRight /></Link>
          </div>
          {data.stageSummary.length ? <div className="grid gap-3">
            {data.stageSummary.map((stage, i) => (
              <Link href={`/pipeline?stage=${encodeURIComponent(stage.id)}`} key={stage.id} className="group grid gap-1.5 rounded-lg p-1 hover:bg-muted">
                <span className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{stage.name}</span><strong className="tabular-nums">{number.format(stage.count)}</strong></span>
                <span className="h-2.5 overflow-hidden rounded-full bg-recessed" aria-hidden="true"><span className="block h-full rounded-full" style={{ width: `${stage.count / max * 100}%`, background: colors[i % colors.length] }} /></span>
              </Link>
            ))}
          </div> : <p className="text-sm text-ink-2">Nenhuma etapa configurada.</p>}
        </section>
        <section className="rga-card p-5">
          <h2 className="mb-4 text-lg font-semibold">Ações rápidas</h2>
          <form method="get" action="/contacts/busca" className="mb-4 flex gap-2">
            <input {...noAutofill} name="q" type="search" aria-label="Buscar talentos" placeholder="Nome, cargo ou telefone" className={inputClass} />
            <button className={buttonClass({ variant: 'primary', icon: true })} aria-label="Buscar"><Search /></button>
          </form>
          <div className="grid gap-2">
            {quick.map(({ label, hint, href, icon: Icon }) => (
              <Link key={href} href={href} className="flex items-center gap-3 rounded-xl border border-line p-3 hover:bg-muted">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#e7f4fc] text-[#116da9]"><Icon size={23} /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{label}</span><span className="block text-xs text-ink-2">{hint}</span></span>
                <ArrowUpRight size={16} className="shrink-0 text-ink-2" />
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="rga-card p-5">
        <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Agenda de entrevistas</h2><p className="mt-1 text-xs text-ink-2">Compromissos da operação</p></div><Link href="/interviews" className={buttonClass({ variant: 'secondary', size: 'sm' })}>Ver agenda <ArrowUpRight /></Link></div>
        <DashboardInterviews interviews={data.interviews} />
      </section>
      {data.isAdmin && data.pendingApprovals.length ? <div className="mt-5"><ApprovalQueue items={data.pendingApprovals} /></div> : null}
    </div>
  );
}
