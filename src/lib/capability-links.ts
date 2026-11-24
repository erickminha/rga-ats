export const capabilityKinds = ['share', 'portal', 'schedule', 'offer'] as const;
export type CapabilityKind = typeof capabilityKinds[number];

export function capabilityPath(kind: CapabilityKind, token: string) {
  return `/${kind}#${token}`;
}
