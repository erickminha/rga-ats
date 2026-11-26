import { TalentSummaryCard } from '@/components/talent-summary-card';
import { getTalentSummary, usesSheetSummaries } from '@/server/talent-summary';
import { OriginalResume } from '@/components/original-resume';
import { talentSourceFields } from '@/server/talent-source-fields';
import { ResumePreview } from '@/components/resume-preview';
import { textRecord } from '@/lib/i18n/pt-BR/assessment';
import { updateTalentMembershipAction } from '@/app/(app)/talent-search-actions';
import { btnTonal, inputClass } from '@/components/form-controls';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { canManageRecruiting, isAdmin, requireSession } from '@/lib/session';
import { TalentPreferenceForm, TalentProfileForm, TalentResumeControls } from '@/components/talent-profile-form';
import { readCareerProfile } from '@/lib/talent-profile';
import { dateBR, outcomeCategory, outcomeNames } from '@/lib/i18n/pt-BR/recruiting';
import { PageHeader } from '@/components/page-header';
import { TagEditor } from '@/components/tag-editor';
import { DuplicatesBanner } from '@/components/duplicates-banner';
import { PrivacyControls } from '@/components/privacy-controls';
import { findDuplicates } from '@/server/contacts';

import { RgaDriveResume } from '@/components/imports/rga-drive-resume';

export default async function TalentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await params;
  const person = await db.contact.findFirst({
    where: { id, orgId: ctx.orgId, isAnonymized: false },
    include: {
      pools: { where: { orgId: ctx.orgId }, orderBy: { name: 'asc' } },
      consents: { where: { orgId: ctx.orgId, purpose: 'PROFILE_STORAGE' } },
      opportunities: {
        where: { orgId: ctx.orgId }, orderBy: { createdAt: 'desc' },
        include: { posting: { include: { clientCompany: true } }, stage: true, archiveReason: true },
      },
    },
  });
  if (!person) notFound();
  const [files, duplicates] = await Promise.all([
    db.storedFile.findMany({
      where: { orgId: ctx.orgId, deletePendingAt: null, OR: [{ contactId: id }, { id: person.resumeFileId ?? '', contactId: null }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    findDuplicates(ctx.orgId, person),
  ]);
  const availableGroups = await db.talentPool.findMany({
    where: { orgId: ctx.orgId, kind: 'STATIC', members: { none: { id } } }, orderBy: { name: 'asc' }, select: { id: true, name: true },
  });
  const authors = new Map((await db.user.findMany({
    where: { orgId: ctx.orgId, id: { in: files.flatMap((file) => file.uploadedById ? [file.uploadedById] : []) } },
    select: { id: true, name: true },
  })).map((user) => [user.id, user.name]));
  const professional = readCareerProfile(person.careerProfile);
  const source = !person.retentionHold ? (await talentSourceFields(ctx.orgId, [id])).get(id) : undefined;
  const recentNote = !person.retentionHold && !source?.observation?.trim() ? await db.note.findFirst({
    where: { orgId: ctx.orgId, opportunity: { orgId: ctx.orgId, contactId: id, confidential: false } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { body: true },
  }) : null;
  const observation = source?.observation?.trim() || recentNote?.body.trim() || '';
  const storage = person.consents.some((grant) => !grant.withdrawnAt) ? 'Autorizado'
    : person.consents.length ? 'Sem autorização vigente' : 'Não informado';
  const resumeFiles = files.filter((file) => file.resumeVersion || file.id === person.resumeFileId);
  const allowed = canManageRecruiting(ctx) && !person.retentionHold && storage === 'Autorizado';
  const summary = allowed ? await getTalentSummary(ctx, id) : null;

  return <div className="mx-auto max-w-4xl px-4 pb-12 md:px-6">
    <PageHeader title={person.name} subtitle={`Cadastro atualizado em ${dateBR(person.updatedAt)}`} />
    <nav className="mb-4 flex flex-wrap gap-3 text-sm">
      {canManageRecruiting(ctx) && !person.retentionHold && (
        resumeFiles.length > 0 ? <ResumePreview fileId={(resumeFiles.find(file => file.id === person.resumeFileId) ?? resumeFiles[0]).id} prominent />
          : <OriginalResume contactId={id} prominent />
      )}
      <Link className="underline" href="/contacts">Voltar ao banco de talentos</Link>
      {person.opportunities[0] && <Link className="underline" href={`/candidates/${person.opportunities[0].id}`}>Abrir participação mais recente</Link>}
    </nav>
    {canManageRecruiting(ctx) && <TalentSummaryCard id={id} saved={summary} allowed={allowed} hasResume={resumeFiles.length > 0} sheetMode={usesSheetSummaries(ctx.orgId)} />}
    <DuplicatesBanner contactId={id} duplicates={duplicates.map((duplicate) => ({ id: duplicate.id, name: duplicate.name, email: duplicate.emails[0] ?? null }))} />
    <section className="mb-4 rounded-card bg-surface p-4">
      <h2 className="mb-3 font-semibold">Dados cadastrais e perfil profissional</h2>
      <TalentProfileForm id={id} initial={{
        ...professional, name: person.name, email: person.emails[0], phone: person.phones[0],
        headline: person.headline ?? '', location: person.location ?? '',
        salary: person.salaryExpectation === null ? '' : (person.salaryExpectation / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      }} />
    </section>
    <section id="observacao" className="mb-4 rounded-card bg-surface p-4">
      <h2 className="mb-2 font-semibold">Observação do banco de talentos</h2>
      <p className="mb-2 text-sm text-ink-2">Cadastro em {dateBR(person.createdAt)}</p>
      <p className="whitespace-pre-wrap break-words text-sm">{observation || 'Nenhuma observação registrada.'}</p>
      {observation && <p className="mt-2 text-xs text-ink-2">{source?.observation?.trim() ? 'Observação importada da planilha de origem.' : 'Anotação de participação mais recente.'}</p>}
    </section>
    <section id="curriculos" className="mb-4 rounded-card bg-surface p-4">
      <h2 className="mb-3 font-semibold">Currículos e documentos</h2>
      {allowed && canManageRecruiting(ctx) && ctx.orgId === process.env.RGA_TALENT_SYNC_ORG_ID && process.env.RGA_RESUME_FOLDER_ID && <RgaDriveResume contactId={id} />}
      {files.length === 0 && <p className="mb-3 text-sm">Nenhum documento anexado.</p>}
      <ul className="mb-4 grid gap-2">
        {files.map((file) => <li key={file.id} className="rounded-field border border-line p-3 text-sm">
          <a href={`/api/files/${file.id}`} className="break-all underline" target="_blank" rel="noreferrer">{file.filename}</a>
          {file.id === person.resumeFileId ? ' · Principal' : file.resumeVersion ? ' · Outra versão' : ' · Anexo'}
          {(file.resumeVersion || file.id === person.resumeFileId) && <div><ResumePreview fileId={file.id} /></div>}
          <p>{dateBR(file.createdAt)}{file.uploadedById && authors.get(file.uploadedById) ? ` · ${authors.get(file.uploadedById)}` : ''}</p>
          {(file.resumeVersion || file.id === person.resumeFileId) && <p>{
            file.resumeContent || (file.id === person.resumeFileId && person.resumeText) ? 'Texto disponível para busca'
              : file.ocrStatus === 'FAILED' || file.ocrStatus === 'LOW_CONFIDENCE' || file.textStatus === 'UNSUPPORTED' ? 'O texto não pôde ser extraído. Confira o documento e ajuste o perfil manualmente.'
                : 'Texto aguardando processamento ou revisão'
          }</p>}
        </li>)}
      </ul>
      <TalentResumeControls id={id} documents={resumeFiles.map((file) => ({ id: file.id, name: file.filename }))}
        active={person.opportunities.filter((row) => row.status === 'ACTIVE').map((row) => ({ id: row.id, label: row.posting?.title ?? 'Participação sem vaga' }))} />
    </section>
    <section className="mb-4 rounded-card bg-surface p-4">
      <h2 className="mb-3 font-semibold">Histórico de processos seletivos</h2>
      {person.opportunities.length === 0 && <p className="text-sm">Sem participações cadastradas.</p>}
      <ul className="grid gap-3">
        {person.opportunities.map((row) => {
          const imported = row.customFields && typeof row.customFields === 'object' && !Array.isArray(row.customFields)
            ? textRecord(row.customFields.origemPlanilha) : {};
          const legacy = !row.posting && !!imported.empresaInformada;
          const outcome = row.status === 'HIRED' ? 'Contratação' : row.status === 'ARCHIVED'
            ? [outcomeNames[outcomeCategory(row.archiveReason)], row.archiveReason?.name].filter(Boolean).join(' · ')
            : legacy ? [imported.statusInformado, imported.candidatoAdmitido ? `Admissão na origem: ${imported.candidatoAdmitido}` : null].filter(Boolean).join(' · ') || 'Histórico importado'
              : 'Em andamento';
          return <li key={row.id}>
            <Link className="underline" href={`/candidates/${row.id}`}>{row.posting?.title ?? imported.cargo ?? 'Participação sem vaga'}</Link>
            <p className="text-sm">{[
              row.posting?.clientCompany?.orgId === ctx.orgId ? row.posting.clientCompany.name : imported.empresaInformada,
              row.stage.name, outcome, dateBR(row.createdAt),
            ].filter(Boolean).join(' · ')}</p>
          </li>;
        })}
      </ul>
    </section>
    <section className="mb-4 rounded-card bg-surface p-4">
      <h2 className="mb-3 font-semibold">Etiquetas e grupos</h2>
      <TagEditor contactId={id} tags={person.tags} />
      {person.pools.length ? <ul className="my-3 grid gap-2 text-sm">
        {person.pools.map((group) => <li key={group.id} className="flex flex-wrap items-center gap-2">
          <Link className="underline" href={`/contacts/busca?pool=${group.id}`}>{group.name}</Link>
          {group.kind === 'STATIC' && <form action={updateTalentMembershipAction.bind(null, id)}>
            <input type="hidden" name="pool" value={group.id} />
            <button className="underline" name="operation" value="remove">Retirar do grupo</button>
          </form>}
        </li>)}
      </ul> : <p className="mt-2 text-sm">Sem grupos manuais.</p>}
      {availableGroups.length > 0 && <form action={updateTalentMembershipAction.bind(null, id)} className="mt-2 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">Adicionar a grupo manual <select name="pool" className={inputClass}>
          {availableGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select></label>
        <button className={btnTonal}>Adicionar ao grupo</button>
      </form>}
    </section>
    <section className="rounded-card bg-surface p-4">
      <h2 className="mb-3 font-semibold">Preferências de armazenamento e contato</h2>
      <p className="text-sm">Armazenamento para futuras oportunidades: {storage}</p>
      <p className="mb-3 text-sm">Comunicações: {person.emailOptOutAt ? 'Descadastrado' : person.emailBouncedAt ? 'Endereço com falha de entrega' : 'Sem bloqueio registrado'}</p>
      <TalentPreferenceForm id={id} />
      {isAdmin(ctx) && <PrivacyControls contactId={id} onHold={person.retentionHold} />}
    </section>
  </div>;
}
