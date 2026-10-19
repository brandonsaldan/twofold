export type SupportLink = { name: string; href: string; shared?: boolean }

export const supportLinks: SupportLink[] = [
  { name: 'GitHub Sponsors', href: 'https://github.com/sponsors/brandonsaldan' },
  { name: 'Ko-fi', href: 'https://ko-fi.com/vantalabs', shared: true },
  { name: 'Buy Me a Coffee', href: 'https://buymeacoffee.com/vantalabs', shared: true }
]

export const supportCopy = {
  lead: "Twofold is free, with no ads, accounts or tracking. If you'd like, you can chip in to support its development.",
  note: 'Donations are optional and never unlock features. They are handled by a third-party site, which never sees your DNA file or report.',
  tag: 'Twofold'
}

export const supportHost = (href: string) => new URL(href).hostname.replace(/^www\./, '')
