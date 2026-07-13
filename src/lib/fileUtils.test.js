import { describe, it, expect } from 'vitest'
import { mdToHtml, tiptapToMarkdown, tiptapToPlainText } from './fileUtils'

describe('mdToHtml', () => {
  it('converts markdown headings and bold text to HTML', () => {
    const html = mdToHtml('# Title\n\nSome **bold** text.')
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
  })
})

describe('tiptapToMarkdown', () => {
  it('renders headings, paragraphs, and marks', () => {
    const doc = {
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Heading' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'plain ' },
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' and ' },
            { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
          ],
        },
      ],
    }
    const md = tiptapToMarkdown(doc)
    expect(md).toBe('## Heading\n\nplain **bold** and *italic*')
  })

  it('renders bullet and ordered lists', () => {
    const doc = {
      content: [
        {
          type: 'bulletList',
          content: [
            { content: [{ content: [{ type: 'text', text: 'one' }] }] },
            { content: [{ content: [{ type: 'text', text: 'two' }] }] },
          ],
        },
        {
          type: 'orderedList',
          content: [
            { content: [{ content: [{ type: 'text', text: 'first' }] }] },
          ],
        },
      ],
    }
    expect(tiptapToMarkdown(doc)).toBe('- one\n- two\n\n1. first')
  })

  it('wraps colored text in an inline span', () => {
    const doc = {
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'red', marks: [{ type: 'textStyle', attrs: { color: '#f00' } }] },
          ],
        },
      ],
    }
    expect(tiptapToMarkdown(doc)).toBe('<span style="color:#f00">red</span>')
  })

  it('renders code blocks with the fenced language', () => {
    const doc = {
      content: [
        { type: 'codeBlock', attrs: { language: 'js' }, content: [{ text: 'const x = 1' }] },
      ],
    }
    expect(tiptapToMarkdown(doc)).toBe('```js\nconst x = 1\n```')
  })

  it('returns an empty string for a doc with no content', () => {
    expect(tiptapToMarkdown({})).toBe('')
  })
})

describe('tiptapToPlainText', () => {
  it('strips marks and list bullets down to plain text', () => {
    const doc = {
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'plain ' }, { type: 'text', text: 'bold', marks: [{ type: 'bold' }] }],
        },
        {
          type: 'bulletList',
          content: [{ content: [{ content: [{ type: 'text', text: 'item' }] }] }],
        },
      ],
    }
    expect(tiptapToPlainText(doc)).toBe('plain bold\n\n- item')
  })
})
