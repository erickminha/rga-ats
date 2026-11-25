export const dimensions = ['D', 'I', 'S', 'C'] as const;
type Dimension = typeof dimensions[number];
export type Scores = Record<Dimension, number>;

export const questionnaireVersion = 'rga-disc-1';
export const instructions = 'Preencha as seções a seguir de acordo com o seu estilo de comportamento, utilizando números de 4 a 1, sendo 4 para a característica mais representativa e 1 para a menos representativa. Não é permitido repetir os valores dentro de cada grupo. Não escolha o que você gostaria de ser, mas sim o que você realmente é. Seja completamente honesto e siga o seu instinto.';
export const groups = [
  ['Direcionado', 'Influente', 'Estável', 'Cuidadoso'],
  ['Confiante em si', 'Otimista', 'Deliberado', 'Contido'],
  ['Aventureiro', 'Entusiasmado', 'Previsível', 'Lógico'],
  ['Decisivo', 'Aberto', 'Paciente', 'Analítico'],
  ['Desafiador', 'Impulsivo', 'Equilibrado', 'Preciso'],
  ['Incansável', 'Emotivo', 'Protetor', 'Contestador'],
  ['Competitivo', 'Persuasivo', 'Acomodado', 'Curioso'],
  ['Assertivo', 'Falador', 'Modesto', 'Educado'],
  ['Experimentador', 'Sedutor', 'Fácil de conviver', 'Consistente'],
  ['Rigoroso', 'Sensível', 'Sincero', 'Perfeccionista'],
] as const;

export type ScoringKey = { version: string; mapping: readonly (readonly Dimension[])[] };
export const provisionalKey: ScoringKey = { version: 'rga-posicional-provisoria-1', mapping: groups.map(() => dimensions) };

export function validGroup(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 4 && [1, 2, 3, 4].every(rank => value.includes(rank));
}

export function validDraft(value: unknown): value is number[][] {
  return Array.isArray(value) && value.length === groups.length &&
    value.every(group => Array.isArray(group) && group.length === 4 &&
      group.every(rank => Number.isInteger(rank) && rank >= 0 && rank <= 4) &&
      new Set(group.filter(Boolean)).size === group.filter(Boolean).length);
}

export function scoreDisc(answers: unknown, key: ScoringKey): Scores {
  if (!validDraft(answers) || !answers.every(validGroup)) throw new Error('Responda os dez grupos com valores distintos de 1 a 4.');
  if (key.mapping.length !== groups.length || key.mapping.some(group => group.length !== 4 ||
    !dimensions.every(dimension => group.includes(dimension)))) throw new Error('Chave de pontuação inválida.');
  const scores: Scores = { D: 0, I: 0, S: 0, C: 0 };
  key.mapping.forEach((group, row) => group.forEach((dimension, col) => {
    scores[dimension] += answers[row][col];
  }));
  return scores;
}

export function discProfile(scores: Scores): string {
  const order = [...dimensions].sort((a, b) => scores[b] - scores[a]);
  if (scores[order[0]] === scores[order[3]]) return 'Resultado equilibrado nas quatro dimensões';
  const top = order.filter(d => scores[d] === scores[order[0]]);
  if (top.length > 1) return 'Empate na maior pontuação · ' + top.join(', ');
  const second = order.filter(d => scores[d] === scores[order[1]]);
  if (second.length > 1) return order[0] + ' · empate na segunda pontuação entre ' + second.join(', ');
  return order[0] + '/' + order[1];
}

const tendencies = {
  D: ['priorizar resultados e decisões', 'iniciativa', 'investigar como acolhe contrapontos'],
  I: ['buscar interação e mobilização', 'comunicação', 'investigar como acompanha compromissos'],
  S: ['valorizar continuidade e cooperação', 'constância', 'investigar a adaptação a mudanças'],
  C: ['valorizar critérios e precisão', 'atenção à qualidade', 'investigar como decide com informação incompleta'],
};

export function localDiscInterpretation(scores: Scores) {
  const profile = discProfile(scores);
  const ordered = [...dimensions].sort((a, b) => scores[b] - scores[a]);
  const relevant = ordered.filter(d => scores[d] >= scores[ordered[1]]);
  const expected = (relevant.length === 2 ? 'As respostas sugerem preferência por ' +
    relevant.map(d => tendencies[d][0]).join(' e por ') + '.' :
    'As pontuações próximas indicam tendências compartilhadas. Explore exemplos concretos em entrevista.').slice(0, 400);
  return { profile, expected, detail: expected + ' São tendências autorrelatadas, a serem contextualizadas por evidências da entrevista.',
    strengths: [...relevant.slice(0, 2).map(d => tendencies[d][1]), 'adaptar estratégias ao contexto, a verificar'],
    attention: relevant.map(d => tendencies[d][2]).join(' e '),
    environment: 'Explore os contextos em que a pessoa relata trabalhar melhor.',
    interview: 'Solicite exemplos com contexto, ação e resultado para confirmar ou qualificar as tendências.' };
}

export function validatedDiscInterpretation(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const text = (key: string, max: number) => typeof row[key] === 'string' &&
    row[key].trim() && row[key].length <= max ? row[key].trim() : null;
  const expected = text('expected', 400);
  const detail = text('detail', 2500);
  const attention = text('attention', 1200);
  const environment = text('environment', 1200);
  const interview = text('interview', 1200);
  const strengths: unknown = row.strengths;
  if (!expected || !detail || !attention || !environment || !interview || !Array.isArray(strengths) || strengths.length !== 3 ||
      !strengths.every((item: unknown) => typeof item === 'string' && item.trim() && item.length <= 250)) return null;
  return { expected, detail, attention, environment, interview, strengths: strengths as string[] };
}
