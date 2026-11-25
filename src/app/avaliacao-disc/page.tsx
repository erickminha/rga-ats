import { CandidateDiscForm } from '@/components/candidate-disc-form';

export const metadata = { title: 'Avaliação DISC', robots: { index: false, follow: false } };

export default function DiscQuestionnairePage() {
  return <main className="mx-auto max-w-xl px-4 py-8"><CandidateDiscForm /></main>;
}
