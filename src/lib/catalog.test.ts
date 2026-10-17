import { describe as group, expect, it } from 'vitest'
import { clip, describe, namedGene, topicSlug } from './catalog'

group('catalog helpers', () => {
  it('makes stable topic slugs', () => {
    expect(topicSlug("Alzheimer's disease")).toBe('alzheimer-s-disease')
    expect(topicSlug("Ménière's disease")).toBe(topicSlug("meniere's disease"))
    expect(topicSlug('IGH@')).toBe('igh')
  })

  it('keeps descriptions within the limit', () => {
    const tail = 'Check your own raw DNA file privately.'
    expect(describe('Short summary.', tail)).toBe(`Short summary. ${tail}`)
    const long = describe('word '.repeat(60), tail)
    expect(long.length).toBeLessThanOrEqual(160)
    expect(long.endsWith(`… ${tail}`)).toBe(true)
  })
})

group('title helpers', () => {
  it('drops placeholder gene IDs', () => {
    expect(namedGene('LOC108783645')).toBe('')
    expect(namedGene('MTHFR')).toBe('MTHFR')
  })

  it('clips titles at a word boundary', () => {
    expect(clip('rs1800562 AA: Two copies of C282Y, likely affected by hemochromatosis which may be treatable', 64)).toBe('rs1800562 AA: Two copies of C282Y, likely affected by…')
    expect(clip('rs1 AA: short', 64)).toBe('rs1 AA: short')
  })
})
