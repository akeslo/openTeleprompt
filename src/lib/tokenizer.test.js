import { describe, it, expect } from 'vitest'
import { extractCues, tokenizeDoc } from './tokenizer'

describe('extractCues', () => {
  it('returns an empty array for a doc with no content', () => {
    expect(extractCues(null)).toEqual([])
    expect(extractCues({})).toEqual([])
  })

  it('extracts h1 and h2 headings with sequential ids', () => {
    const doc = {
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ text: 'Intro' }] },
        { type: 'paragraph', content: [{ text: 'body' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ text: 'Section A' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ text: 'Not a cue' }] },
      ],
    }
    expect(extractCues(doc)).toEqual([
      { id: 0, level: 1, text: 'Intro' },
      { id: 1, level: 2, text: 'Section A' },
    ])
  })

  it('joins multi-run heading text and tolerates missing text', () => {
    const doc = {
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ text: 'Hello ' }, {}, { text: 'World' }] },
      ],
    }
    expect(extractCues(doc)).toEqual([{ id: 0, level: 1, text: 'Hello World' }])
  })
})

describe('tokenizeDoc', () => {
  it('splits paragraph text into word tokens plus a trailing newline', () => {
    const doc = {
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] },
      ],
    }
    const tokens = tokenizeDoc(doc)
    expect(tokens).toEqual([
      { type: 'word', text: 'hello', bold: false, color: null, isLink: false },
      { type: 'word', text: 'world', bold: false, color: null, isLink: false },
      { type: 'newline' },
    ])
  })

  it('recognizes [PAUSE]/[SLOW]/[BREATHE] markers case-insensitively', () => {
    const doc = {
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '[pause] go [SLOW] now [Breathe]' }] },
      ],
    }
    const tokens = tokenizeDoc(doc).filter(t => t.type === 'marker')
    expect(tokens).toEqual([
      { type: 'marker', text: '[pause]', marker: 'PAUSE' },
      { type: 'marker', text: '[SLOW]', marker: 'SLOW' },
      { type: 'marker', text: '[Breathe]', marker: 'BREATHE' },
    ])
  })

  it('carries bold, color, and link marks onto word tokens', () => {
    const doc = {
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'styled',
              marks: [
                { type: 'bold' },
                { type: 'textStyle', attrs: { color: '#ff0000' } },
                { type: 'link' },
              ],
            },
          ],
        },
      ],
    }
    const [word] = tokenizeDoc(doc)
    expect(word).toEqual({ type: 'word', text: 'styled', bold: true, color: '#ff0000', isLink: true })
  })

  it('emits a heading token with a sequential cue id for h1/h2 and null id otherwise', () => {
    const doc = {
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ text: 'Title' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ text: 'Subtitle' }] },
      ],
    }
    const tokens = tokenizeDoc(doc).filter(t => t.type === 'heading')
    expect(tokens).toEqual([
      { type: 'heading', level: 1, text: 'Title', id: 0 },
      { type: 'heading', level: 3, text: 'Subtitle', id: null },
    ])
  })

  it('returns an empty array when doc has no content', () => {
    expect(tokenizeDoc(null)).toEqual([])
    expect(tokenizeDoc({})).toEqual([])
  })
})
