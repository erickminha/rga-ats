export function hasRecruitingRole(role: unknown): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'TEAM_MEMBER';
}

export function workspaceHome(role: unknown): string {
  return hasRecruitingRole(role) ? '/dashboard' : '/interviews';
}
