import type { Metadata } from 'next';
import Link from 'next/link';
import { adFieldLabels, readAdFields, type AdFields } from '@/lib/rga-productivity';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { ApplyForm } from '@/components/apply-form';
import { CareersShare } from '@/components/careers-share';
import { buttonClass } from '@/components/ui/button';
import { candidate } from '@/lib/i18n/pt-BR/candidate';
import { jobBoard } from '@/lib/i18n/pt-BR/job-board';
import {
  careersPath, formatPublicSalary, jsonLd, noIndex, publicClientName, publicPostingLogo, publicPostingText,
} from '@/lib/public-careers';
import { careersOrganization, careersOrigin, isDemoCareers, publicationDate, publishedPosting } from '@/server/public-careers';
import { EEOEnabled, talentNetworkAllowed } from '@/server/privacy-options';
import { isSampleSlug } from '@/server/sample-boards';

type Params = Promise<{ org: string; posting: string }>;
type Query = Promise<{ applied?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string }>;

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: Query }): Promise<Metadata> {
  const { org: orgSlug, posting: slug } = await params;
  const org = await careersOrganization(orgSlug);
  const posting = org && await publishedPosting(org.id, slug);
  if (!org || !posting) return { robots: noIndex };

  const title = `${posting.title} | ${org.name}`;
  const { description: text } = publicPostingText(posting.content);
  const description = text.replace(/\s+/g, ' ').slice(0, 160) || [posting.title, posting.location, org.name].filter(Boolean).join(' · ');
  const url = new URL(careersPath(org.slug, posting.slug), await careersOrigin()).href;
  return {
    title: { absolute: title }, description, alternates: { canonical: url },
    openGraph: { title, description, url, locale: 'pt_BR' },
    ...((isDemoCareers(orgSlug) || (await searchParams).applied) && { robots: noIndex }),
  };
}

export default async function PostingPage({ params, searchParams }: { params: Params; searchParams: Query }) {
  const { org: orgSlug, posting: slug } = await params;
  const { applied, utm_source, utm_medium, utm_campaign } = await searchParams;
  const org = await careersOrganization(orgSlug);
  const posting = org && await publishedPosting(org.id, slug);
  if (!org || !posting) notFound();

  const { description, requirements } = publicPostingText(posting.content);
  const advertisement = readAdFields(posting.content);
  const salary = formatPublicSalary(posting.salaryMin, posting.salaryMax, posting.salaryCurrency);
  const client = publicClientName(posting);
  const logo = publicPostingLogo(posting, org.kind === 'AGENCY');
  const path = careersPath(orgSlug);
  const datePosted = !applied && !isDemoCareers(orgSlug) && description ? await publicationDate(org.id, posting.id) : null;
  const schema = datePosted ? {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: posting.title,
    description: [description, ...(requirements.length ? ['Requisitos', ...requirements] : [])].join('\n'),
    datePosted: datePosted.toISOString(),
    url: new URL(careersPath(orgSlug, slug), await careersOrigin()).href,
    hiringOrganization: { '@type': 'Organization', name: client ?? (org.kind === 'AGENCY' || posting.clientCompany ? 'confidential' : org.name) },
    employmentType: posting.commitment === 'CONTRACT' ? 'CONTRACTOR' : posting.commitment,
    ...(posting.location && {
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: posting.location } },
    }),
    ...(posting.workplaceType === 'REMOTE' && { jobLocationType: 'TELECOMMUTE' }),
  } : null;

  return (
    <article className="mx-auto max-w-4xl">
      {schema ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} /> : null}
      <Link href={path} className="mb-5 inline-flex items-center gap-2 rounded-field text-sm font-medium underline-offset-4 hover:underline">
        <ArrowLeft size={16} aria-hidden="true" /> Todas as vagas
      </Link>
      <header className="rounded-card border border-line bg-surface p-5 sm:p-8">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- posting upload
          <img src={`/api/logo/${logo}`} alt="" className="mb-4 size-14 rounded-field object-contain" />
        ) : null}
        <h1 className="break-words text-3xl font-semibold tracking-tight sm:text-4xl">{posting.title}</h1>
        {client ? <p className="mt-2 break-words text-md text-ink-2">Recrutamento para {client}</p> : null}
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 text-sm sm:grid-cols-4">
          {[
            ['Localidade', posting.location],
            ['Modalidade', jobBoard.workplace[posting.workplaceType]],
            ['Contratação', jobBoard.commitment[posting.commitment]],
            ['Remuneração', salary],
            ...Object.entries(adFieldLabels).map(([key,label]) => [label, advertisement[key as keyof AdFields] ?? null]),
          ].map(([label, value]) => value ? <div key={label} className="min-w-0 break-words">
            <dt className="text-xs text-ink-2">{label}</dt><dd className="mt-1 font-medium">{value}</dd>
          </div> : null)}
        </dl>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!applied && !isSampleSlug(orgSlug) ? <a href="#candidatura" className={buttonClass({ variant: 'primary' })}>Quero me candidatar</a> : null}
          {!applied ? <CareersShare /> : null}
        </div>
      </header>

      {description || requirements.length ? <div className="my-7 grid gap-6 px-1 sm:px-3">
        {description ? <section aria-labelledby="job-description">
          <h2 id="job-description" className="mb-2 text-xl font-medium">Sobre a vaga</h2>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-2">{description}</p>
        </section> : null}
        {requirements.length ? <section aria-labelledby="job-requirements">
          <h2 id="job-requirements" className="mb-2 text-xl font-medium">Requisitos</h2>
          <ul className="grid list-disc gap-1 pl-5 text-sm text-ink-2">
            {requirements.map((requirement, i) => <li key={i} className="break-words">{requirement}</li>)}
          </ul>
        </section> : null}
      </div> : null}

      <section id="candidatura" aria-labelledby="apply-title" className="mt-7 scroll-mt-4 rounded-card border border-line bg-surface p-5 sm:p-8">
        {isSampleSlug(orgSlug) ? (
          <>
            <h2 id="apply-title" className="text-xl font-medium">Portal de demonstração</h2>
            <p className="mt-2 text-sm text-ink-2">{candidate.sampleError}</p>
          </>
        ) : applied ? (
          <div className="flex flex-col items-center py-5 text-center">
            <CheckCircle2 size={30} aria-hidden="true" className="text-positive" />
            <h2 id="apply-title" className="mt-3 text-xl font-medium">{candidate.received}</h2>
            <p className="mt-2 max-w-md text-sm text-ink-2">{candidate.receivedDetail}</p>
            <Link href={path + '/status'} className={buttonClass({ variant: 'tonal', className: 'mt-5' })}>{candidate.track}</Link>
          </div>
        ) : (
          <>
            <h2 id="apply-title" className="mb-5 text-xl font-medium">Candidate-se a esta vaga</h2>
            <ApplyForm orgSlug={orgSlug} postingSlug={slug} networkOptIn={talentNetworkAllowed() && org.talentNetworkEnabled} collectEeo={EEOEnabled() && org.collectEeo}
              utm={{ source: utm_source, medium: utm_medium, campaign: utm_campaign }} />
          </>
        )}
      </section>
    </article>
  );
}
