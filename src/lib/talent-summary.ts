import { readCareerProfile } from './talent-profile';
import { readResumeView, yearsOfExperience } from './resume-profile';

export const summaryPromptVersion = 'rga-resumo-1';

export function professionalFacts(profile: unknown, interest: string | null, parsed: unknown, raw: string, name: string) {
  const clean = (value: string | null | undefined) => {
    const escaped = name.replace(/[.*+?^$${}()|[\]\\]/g, '\\$&');
    const text = (value ?? '').replace(escaped ? new RegExp(escaped, 'gi') : /$^/, '').trim();
    if (/@|https?:|\b\d{3}[.\s-]?\d{3}[.\s-]?\d{3}\b|(?:\d[\s().-]*){8}|\b(?:cpf|rg|rg:|endereço|residência|bairro|rua|avenida|cep|nascimento|casad[oa]|filhos?|religião|etnia|deficiência|saúde|política|instruções|ignore|prompt)\b/i.test(text)) return '';
    return text.replace(/\s+/g, ' ').slice(0, 180);
  };
  const list = (values: (string | null | undefined)[]) => [...new Set(values.flatMap(value => value?.split(/[\n;]/) ?? []).map(clean).filter(Boolean))].slice(0, 10);
  const resume = readResumeView(parsed);
  const career = readCareerProfile(profile);
  const sections = { experience: [] as string[], education: [] as string[], skills: [] as string[], courses: [] as string[] };
  // Recognize only explicitly headed, short sections. Keep extracted text local.
  let key: keyof typeof sections | undefined;
  for (const line of raw.slice(0, 12000).split(/\r?\n/)) {
    const heading = line.trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/:$/, '');
    if (/^(experiencia(?:s)?(?: profissiona[li]s?)?|historico profissional)$/.test(heading)) { key = 'experience'; continue; }
    if (/^(formacao(?: academica)?|escolaridade|educacao)$/.test(heading)) { key = 'education'; continue; }
    if (/^(habilidades|competencias(?: tecnicas)?)$/.test(heading)) { key = 'skills'; continue; }
    if (/^(cursos|certificacoes|cursos e certificacoes)$/.test(heading)) { key = 'courses'; continue; }
    if (/^(contato|dados pessoais|objetivo|referencias|idiomas|perfil|resumo)\b/.test(heading)) key = undefined;
    if (key && line.length < 170 && sections[key].length < 6 && clean(line)) sections[key].push(clean(line));
  }
  const catalogue = { experience: list([career.experience]), education: list([career.education]), skills: list([career.skills]), interest: list([interest]) };
  const resumeFacts = { experience: list([...(resume?.experience.map(j => j.title) ?? []), ...sections.experience]),
    education: list([...(resume?.education.map(e => [e.degree, e.field].filter(Boolean).join(' · ')) ?? []), ...sections.education]),
    skills: list([...(resume?.skills ?? []), ...sections.skills]), courses: list(sections.courses) };
  const providerFacts = {
    experience: list([...(resume?.experience.map(j => j.title) ?? []), ...catalogue.experience]).filter(value => value.length <= 100),
    education: list([...(resume?.education.map(e => [e.degree, e.field].filter(Boolean).join(' · ')) ?? []), ...catalogue.education]).filter(value => value.length <= 100),
    skills: list([...(resume?.skills ?? []), ...catalogue.skills]).filter(value => value.length <= 65),
    courses: [] as string[], interest: catalogue.interest.filter(value => value.length <= 80),
  };
  const completed = (resume?.experience ?? []).filter(job => job.end && job.end !== 'present');
  const years = yearsOfExperience(completed);
  return { providerFacts, resumeFacts, years, facts: {
    experience: list([...resumeFacts.experience, ...catalogue.experience]),
    education: list([...resumeFacts.education, ...catalogue.education]),
    skills: list([...resumeFacts.skills, ...catalogue.skills]),
    courses: resumeFacts.courses, interest: catalogue.interest,
  } };
}

export type SummaryFacts = ReturnType<typeof professionalFacts>['facts'];

export function localSummary(facts: SummaryFacts) {
  const labels = { experience: 'Experiência informada', education: 'Formação informada', skills: 'Competências técnicas informadas',
    courses: 'Cursos e certificações informados', interest: 'Cargo ou área de interesse' };
  return (Object.keys(labels) as (keyof SummaryFacts)[]).filter(key => facts[key].length)
    .map(key => labels[key] + ': ' + facts[key].slice(0, 4).join(', ') + '.').join(' ');
}

export function readSummaryText(value: unknown) {
  if (!value || typeof value !== 'object' || !('summary' in value) || typeof value.summary !== 'string') return null;
  const text = value.summary.trim();
  return text.length >= 20 && text.length <= 1400 && text.split(/\s+/).length <= 120 && !/@|https?:|(?:\d[\s().-]*){8}|\b(?:cpf|endereço residencial|apto para|inapto para|recomendo a contratação)\b/i.test(text) ? text : null;
}
