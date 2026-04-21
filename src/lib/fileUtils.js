import { marked } from 'marked'

// MD file → HTML string for Tiptap setContent
export function mdToHtml(mdText) {
  return marked.parse(mdText, { async: false })
}

// Tiptap JSON doc → markdown string (for saving .md files back to disk)
export function tiptapToMarkdown(doc) {
  return (doc.content || []).map(blockToMd).join('\n\n')
}

function blockToMd(node) {
  if (node.type === 'heading') {
    const level = node.attrs?.level || 1
    return '#'.repeat(level) + ' ' + inlinesToMd(node.content)
  }
  if (node.type === 'bulletList') {
    return (node.content || [])
      .map(li => '- ' + inlinesToMd(li.content?.[0]?.content))
      .join('\n')
  }
  if (node.type === 'orderedList') {
    return (node.content || [])
      .map((li, i) => `${i + 1}. ` + inlinesToMd(li.content?.[0]?.content))
      .join('\n')
  }
  if (node.type === 'blockquote') {
    return (node.content || []).map(n => '> ' + blockToMd(n)).join('\n')
  }
  if (node.type === 'codeBlock') {
    const lang = node.attrs?.language || ''
    const code = (node.content || []).map(n => n.text || '').join('')
    return '```' + lang + '\n' + code + '\n```'
  }
  // paragraph (default)
  return inlinesToMd(node.content)
}

function inlinesToMd(nodes) {
  return (nodes || []).map(n => {
    if (n.type !== 'text') return ''
    let text = n.text || ''
    const marks = n.marks || []
    const bold   = marks.some(m => m.type === 'bold')
    const italic = marks.some(m => m.type === 'italic')
    const code   = marks.some(m => m.type === 'code')
    if (code)             return '`' + text + '`'
    if (bold && italic)   return '***' + text + '***'
    if (bold)             return '**' + text + '**'
    if (italic)           return '*' + text + '*'
    return text
  }).join('')
}

// Tiptap JSON doc → plain text (for saving .txt files)
export function tiptapToPlainText(doc) {
  return (doc.content || []).map(blockToText).join('\n\n')
}

function blockToText(node) {
  if (node.type === 'bulletList') {
    return (node.content || [])
      .map(li => '- ' + inlinesToText(li.content?.[0]?.content))
      .join('\n')
  }
  if (node.type === 'orderedList') {
    return (node.content || [])
      .map((li, i) => `${i + 1}. ` + inlinesToText(li.content?.[0]?.content))
      .join('\n')
  }
  return inlinesToText(node.content)
}

function inlinesToText(nodes) {
  return (nodes || []).map(n => n.text || '').join('')
}
