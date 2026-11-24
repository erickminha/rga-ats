import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { isAdmin, requireSession } from '@/lib/session';
import { readTemplates } from '@/lib/competency-assessment';
import { CompetencyPlanForm } from '@/components/competency-assessment';
import { surface } from '@/components/form-controls';

export default async function AssessmentTemplates() {
  const ctx = await requireSession();
  if (!isAdmin(ctx)) notFound();
  const org = await db.organization.findUnique({ where: { id: ctx.orgId }, select: { assessmentTemplates: true } });
  if (!org) notFound();
  return <main className="mx-auto grid max-w-3xl gap-4 px-5 py-6">
    <a href="/settings" className="underline">Configurações</a>
    <h1 className="text-xl font-medium">Modelos de avaliação</h1>
    <details className={`${surface} p-4`}><summary>Novo modelo</summary><CompetencyPlanForm /></details>
    {readTemplates(org.assessmentTemplates).map((item) => <details className={`${surface} p-4`} key={item.id}>
      <summary>{item.name}{item.inactive ? ' · Inativo' : ''}</summary>
      <CompetencyPlanForm template={item} />
    </details>)}
  </main>;
}
