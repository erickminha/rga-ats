import Link from 'next/link';
import { db } from '@/lib/db';
import type { SessionContext } from '@/lib/session';
import { summaryConsent } from '@/server/talent-summary';
import { talentDiscScope } from '@/server/talent-disc';
import { discToday, reusableDisc } from '@/lib/talent-disc';
import { PageHeader } from '@/components/page-header';
import { talentDiscAction } from '@/app/(app)/disc/talent-actions';
import { whatsappPhone } from '@/lib/rga-productivity';
import { textRecord } from '@/lib/i18n/pt-BR/assessment';

const field = 'rounded-field border border-line p-2 w-full';
const btn = 'rounded-field border border-line px-3 py-2 font-medium';
const states: Record<string, string> = { PENDING: 'Aguardando envio', SENT: 'Enviado / aguardando retorno', COMPLETED: 'Concluído', CANCELLED: 'Cancelado' };
const date = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');
const labels = { traits: 'Características profissionais', strengths: 'Pontos fortes', development: 'Pontos de desenvolvimento', communication: 'Comunicação', notes: 'Observações' };
const today = () => discToday();

function Hidden({ contactId, action, id }: { contactId: string; action: string; id?: string }) {
  return <><input type="hidden" name="contactId" value={contactId}/><input type="hidden" name="action" value={action}/>{id && <input type="hidden" name="id" value={id}/>}</>;
}
function SourceFields() {
  return <>
    <label className="grid gap-1 text-sm">Instrumento / fornecedor<input required name="instrument" maxLength={150} className={field}/></label>
    <label className="grid gap-1 text-sm">Referência da autorização para esta avaliação<textarea required name="authorization" maxLength={500} rows={2} className={field} placeholder="Ex.: aceite específico, data e finalidade"/></label>
    <label className="text-sm"><input type="checkbox" name="confirmed" required/> Confirmei a autorização e a finalidade profissional desta avaliação.</label>
  </>;
}
function ResultFields() {
  return <>
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="grid text-sm">Data do resultado<input type="date" required name="date" max={today()} className={field}/></label>
      <label className="grid text-sm">Validade comprovada (opcional)<input type="date" name="validUntil" className={field}/></label>
    </div>
    <label className="grid text-sm">Perfil informado pelo instrumento<input required name="profile" maxLength={200} className={field}/></label>
    <p className="text-sm">Transcreva a escala original. Se não houver números, deixe os quatro campos vazios. Não convertemos escalas.</p>
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">{['D','I','S','C'].map(axis => <label key={axis} className="grid text-sm">{axis}<input name={axis} maxLength={40} inputMode="decimal" className={field}/></label>)}</div>
    <div className="grid gap-2 sm:grid-cols-3">
      <label className="grid text-sm">Mínimo<input name="scaleMin" maxLength={20} inputMode="decimal" className={field}/></label>
      <label className="grid text-sm">Máximo<input name="scaleMax" maxLength={20} inputMode="decimal" className={field}/></label>
      <label className="grid text-sm">Nome da escala<input name="scaleName" maxLength={100} className={field}/></label>
    </div>
    {Object.entries(labels).map(([key,label]) => <label className="grid text-sm" key={key}>{label}<textarea name={key} rows={2} maxLength={key === 'traits' ? 2500 : 1500} className={field}/></label>)}
    <label className="text-sm"><input type="checkbox" required name="reviewed"/> Conferi o resultado original; não é uma avaliação gerada pelo ATS.</label>
  </>;
}

export async function TalentDiscCentral({ctx, params}: {ctx: SessionContext; params: {busca?: string; profissional?: string; estado?: string; aviso?: string}}) {
  const scope = summaryConsent(ctx.orgId);
  const q = (params.busca ?? '').slice(0, 120).trim();
  const status = params.estado && Object.hasOwn(states, params.estado) ? params.estado : '';
  const [eligible, counts, contacts, person] = await Promise.all([
    db.contact.count({ where: scope }),
    db.talentDisc.groupBy({ by: ['status'], where: talentDiscScope(ctx.orgId), _count: { _all: true } }),
    db.contact.findMany({ where: { ...scope, ...(q ? {name: {contains:q, mode:'insensitive' as const}} : {}),
      ...(status ? {talentDiscs: {some:{orgId:ctx.orgId,status}}} : {}) }, orderBy: [{name:'asc'},{id:'asc'}], take:40,
      select: {id:true,name:true,headline:true,_count:{select:{talentDiscs:{where:{orgId:ctx.orgId}}}}} }),
    params.profissional ? db.contact.findFirst({ where: { ...scope,id:params.profissional }, select: {
      id:true,name:true,phones:true,emails:true,
      talentDiscs:{where:{orgId:ctx.orgId},orderBy:{createdAt:'desc'},take:50},
      opportunities:{where:{orgId:ctx.orgId,confidential:false,status:'ACTIVE',posting:{orgId:ctx.orgId}},select:{id:true,posting:{select:{title:true}}},take:100}
    } }) : null,
  ]);
  const map = new Map(counts.map(c=>[c.status,c._count._all]));
  const phone = person?.phones.map(whatsappPhone).find(Boolean);
  return <main className="grid gap-4 p-5">
    <PageHeader title="Central DISC" subtitle="Avaliações por profissional, sem necessidade de vínculo com vaga."/>
    <div className="flex flex-wrap gap-4 text-sm"><Link className="font-medium underline" href="/disc">Banco de talentos</Link><Link className="underline" href="/disc?modo=vagas">Avaliações nativas por vaga</Link></div>
    <p className="text-sm">Registro de resultados de instrumentos externos autorizados. O questionário nativo continua condicionado à aprovação da metodologia. Não há cálculo ou aprovação automática de candidatos.</p>
    {params.aviso && <p role="status" className="rga-card p-3">{params.aviso.slice(0,250)}</p>}
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      <div className="rga-card p-3"><p className="text-sm">Profissionais autorizados</p><strong>{eligible}</strong></div>
      {Object.entries(states).map(([key,label]) => <Link key={key} href={'/disc?estado='+key} className="rga-card p-3"><p className="text-sm">{label}</p><strong>{map.get(key)??0}</strong></Link>)}
    </div>
    <section className="rga-card grid gap-3 p-4">
      <form className="grid gap-2 sm:grid-cols-[1fr_auto_auto] items-end">
        <label className="grid text-sm">Pesquisar profissional<input name="busca" defaultValue={q} placeholder="Nome completo ou parte do nome" className={field}/></label>
        <label className="grid text-sm">Situação<select name="estado" defaultValue={status} className={field}><option value="">Todos</option>{Object.entries(states).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <button className={btn}>Buscar</button>
      </form>
      {contacts.length===0 && <p>Nenhum profissional autorizado corresponde à busca.</p>}
      <p className="text-sm">Até 40 resultados. Refine pelo nome para localizar qualquer profissional.</p>
      <div className="grid gap-2 sm:grid-cols-2">{contacts.map(c=><Link key={c.id} className="rounded-lg border border-line p-3 break-words" href={'/disc?'+new URLSearchParams({profissional:c.id,busca:q,estado:status})+'#avaliacoes'}><strong>{c.name}</strong><p className="text-sm">{c.headline || 'Cargo não informado'} · {c._count.talentDiscs} registro(s)</p></Link>)}</div>
    </section>
    {params.profissional && !person && <p>Profissional indisponível ou sem autorização vigente.</p>}
    {person && <section id="avaliacoes" className="rga-card grid gap-4 p-4">
      <h2 className="text-lg font-semibold break-words">{person.name}</h2>
      <Link href={'/contacts/'+person.id} className="underline">Abrir ficha do profissional</Link>
      <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer font-medium">Solicitar avaliação externa</summary>
        <form action={talentDiscAction} className="mt-3 grid gap-3"><Hidden contactId={person.id} action="request"/><SourceFields/>
          <label className="grid text-sm">Link individual HTTPS do fornecedor (opcional)<input type="url" name="externalUrl" maxLength={2000} className={field}/></label>
          <p className="text-sm">O link é fornecido pelo instrumento externo. Se ainda não tiver, registre a solicitação e encaminhe pelo seu canal habitual.</p>
          <button className={btn}>Registrar solicitação</button>
        </form>
      </details>
      <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer font-medium">Registrar avaliação anterior</summary>
        <form action={talentDiscAction} className="mt-3 grid gap-3"><Hidden contactId={person.id} action="register"/><SourceFields/><ResultFields/><button className={btn}>Salvar resultado conferido</button></form>
      </details>
      <h3 className="font-semibold">Histórico de avaliações externas</h3>
      {!person.talentDiscs.length && <p>Sem avaliações registradas. Solicite uma avaliação ou registre um resultado anterior acima.</p>}
      {person.talentDiscs.map(row=>{
        const result=textRecord(row.result);
        const reusable=row.status==='COMPLETED'&&reusableDisc(row.validUntil,result.date,today(),Number(process.env.RGA_DISC_REUSE_MAX_DAYS??0));
        const pending=['PENDING','SENT'].includes(row.status);
        const message='Olá, '+person.name+'! A RGA solicita o preenchimento da avaliação comportamental '+row.instrument+'. '+(row.externalUrl??'Entre em contato para receber as orientações.')+' Obrigado!';
        return <article key={row.id} className="grid gap-3 rounded-lg border border-line p-3 break-words">
          <h4 className="font-medium">{row.instrument} — {states[row.status]??row.status}</h4>
          <p className="text-sm">Criado em {date(row.createdAt)}{row.sentAt?' · Enviado em '+date(row.sentAt):''}</p>
          {pending && <>
            {row.externalUrl && <p className="text-sm">Link individual do fornecedor cadastrado.</p>}
            <div className="flex flex-wrap gap-3">
              {phone && <a className="underline" target="_blank" rel="noreferrer" href={'https://wa.me/'+phone+'?text='+encodeURIComponent(message)}>Abrir WhatsApp</a>}
              {person.emails[0] && <a className="underline" href={'mailto:'+encodeURIComponent(person.emails[0])+'?subject='+encodeURIComponent('Convite para avaliação DISC')+'&body='+encodeURIComponent(message)}>Preparar e-mail</a>}
            </div>
            {row.status==='PENDING' && <form action={talentDiscAction} className="grid gap-2"><Hidden contactId={person.id} id={row.id} action="sent"/><label className="text-sm"><input type="checkbox" required name="sentConfirmed"/> Confirmei o envio real ao profissional.</label><button className={btn}>Registrar envio</button></form>}
            <details><summary className="cursor-pointer font-medium">Registrar resultado recebido</summary><form action={talentDiscAction} className="mt-3 grid gap-3"><Hidden contactId={person.id} id={row.id} action="complete"/><ResultFields/><button className={btn}>Concluir avaliação</button></form></details>
            <form action={talentDiscAction}><Hidden contactId={person.id} id={row.id} action="cancel"/><button className="underline">Cancelar solicitação</button></form>
          </>}
          {row.status==='COMPLETED' && <>
            <p>Perfil: {result.profile} · Data: {result.date}</p>
            <p className="text-sm">{['D','I','S','C'].filter(a=>result[a]).map(a=>a+' '+result[a]).join(' · ')} {result.scaleMin && ' · Escala '+result.scaleMin+' a '+result.scaleMax}</p>
            {Object.entries(labels).map(([key,label])=>result[key]&&<p className="whitespace-pre-wrap text-sm" key={key}><strong>{label}: </strong>{result[key]}</p>)}
            <p className="text-sm">{row.validUntil?'Validade: '+date(row.validUntil):'Validade não comprovada — reaproveitamento indisponível.'}</p>
            <a className="underline" href={'/api/disc/talentos/'+row.id+'/pdf'} target="_blank" rel="noreferrer">Relatório individual PDF</a>
            {reusable && person.opportunities.length>0 && <details><summary className="cursor-pointer font-medium">Reaproveitar em seleção</summary><form action={talentDiscAction} className="mt-3 grid gap-2"><Hidden contactId={person.id} id={row.id} action="reuse"/><label className="grid text-sm">Vaga<select name="opportunityId" required className={field}><option value="">Selecione</option>{person.opportunities.map(o=><option key={o.id} value={o.id}>{o.posting?.title}</option>)}</select></label><label className="grid text-sm">Finalidade e autorização da seleção<input name="purpose" maxLength={500} required className={field}/></label><label className="text-sm"><input type="checkbox" name="reuseConfirmed" required/> Confirmei autorização específica e adequação à seleção.</label><button className={btn}>Vincular à ficha da seleção</button></form></details>}
          </>}
        </article>;
      })}
    </section>}
  </main>;
}
