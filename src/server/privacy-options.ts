export function notetakersAllowed() {
  return process.env.RGA_ALLOW_NOTETAKERS === 'true';
}

export function EEOEnabled() {
  return process.env.RGA_ENABLE_EEO === 'true';
}

export function talentNetworkAllowed() {
  return process.env.RGA_ENABLE_TALENT_NETWORK === 'true';
}
