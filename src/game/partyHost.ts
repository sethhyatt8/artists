export function getPartyKitHost(): string {
  if (import.meta.env.DEV) {
    return `${window.location.hostname}:1999`
  }
  return import.meta.env.VITE_PARTYKIT_HOST ?? 'artists.sethhyatt8.partykit.dev'
}
