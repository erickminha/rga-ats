export const talentFilterKeys = ['q', 'city', 'state', 'area', 'skill', 'salary', 'availability', 'tag', 'resume', 'updated', 'history', 'active', 'eligibility'] as const;

export type TalentFilters = Partial<Record<typeof talentFilterKeys[number], string>>;

export function pickTalentFilters(input: Record<string, unknown>): TalentFilters {
  return Object.fromEntries(talentFilterKeys.flatMap((key) => {
    const value = typeof input[key] === 'string' ? input[key].trim().slice(0, 200) : '';
    return value ? [[key, value]] : [];
  }));
}
