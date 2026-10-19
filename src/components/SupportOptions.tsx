import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supportCopy, supportHost, supportLinks, type SupportLink } from '../lib/support'
import { Icon, Modal } from './ui'

export function SupportNote({ link, titleId, onBack, onContinue }: { link: SupportLink; titleId: string; onBack: () => void; onContinue: () => void }) {
  const [copied, setCopied] = useState(false)
  const value = useRef<HTMLSpanElement | null>(null)
  const fallback = () => {
    const element = value.current
    const selection = window.getSelection()
    if (!element || !selection) return
    const range = document.createRange()
    range.selectNodeContents(element)
    selection.removeAllRanges()
    selection.addRange(range)
    if (document.execCommand('copy')) setCopied(true)
  }
  const copy = () => {
    if (!navigator.clipboard) { fallback(); return }
    navigator.clipboard.writeText(supportCopy.tag).then(() => setCopied(true), fallback)
  }

  return (
    <>
      <h2 id={titleId}>One quick thing</h2>
      <p>Twofold's creator is part of Vanta Labs, a small software development team. This {link.name} page belongs to the team and also takes donations for its other projects. To make sure your donation goes to Twofold, add this to your message:</p>
      <div className="support-tag-field">
        <span className="support-tag-text">
          <span className="support-tag-label">Message</span>
          <span className="support-tag-value" ref={value}>{supportCopy.tag}</span>
        </span>
        <button type="button" className="button button-quiet button-small" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <div className="modal-actions">
        <a className="button" href={link.href} target="_blank" rel="noopener noreferrer" onClick={onContinue}>Continue to {link.name}</a>
        <button type="button" className="button button-quiet" onClick={onBack}>Back</button>
      </div>
    </>
  )
}

export default function SupportOptions({ onLeave, onShared }: { onLeave?: () => void; onShared?: (link: SupportLink) => void }) {
  const id = useId()
  const [pending, setPending] = useState<SupportLink | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const leave = () => { setPending(null); onLeave?.() }
  const choose = (link: SupportLink) => { if (onShared) onShared(link); else setPending(link) }

  return (
    <>
      <ul className="support-options">
        {supportLinks.map(link => (
          <li key={link.href}>
            <a href={link.href} target="_blank" rel="noopener noreferrer" onClick={event => { if (link.shared) { event.preventDefault(); choose(link) } else leave() }}>
              <span className="support-name">{link.name}</span>
              <span className="support-host">{supportHost(link.href)}</span>
              <Icon name="arrow" />
            </a>
          </li>
        ))}
      </ul>

      {mounted && !onShared && createPortal(<Modal open={pending !== null} onClose={() => setPending(null)} labelledBy={`${id}-title`} className="modal-small support-tag">
        {pending && <SupportNote key={pending.href} link={pending} titleId={`${id}-title`} onBack={() => setPending(null)} onContinue={leave} />}
      </Modal>, document.body)}
    </>
  )
}
