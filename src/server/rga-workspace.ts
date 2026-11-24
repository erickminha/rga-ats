export const signupClosedMessage = 'O cadastro público está fechado. Peça um convite à administração da RGA ATS.';

export function isSingleWorkspace() {
  return process.env.RGA_SINGLE_WORKSPACE === 'true';
}

/** The exact ID of the existing agency authorized to reconcile its pipeline. */
export function isRgaWorkspace(orgId: string) {
  return !!orgId && orgId === process.env.RGA_WORKSPACE_ID?.trim();
}

export class WorkspaceSignupClosedError extends Error {
  constructor() {
    super(signupClosedMessage);
  }
}
