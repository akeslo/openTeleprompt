// Converts Tiptap JSON doc → flat token array for word-by-word rendering
// Token types: { type: 'word'|'marker'|'newline'|'heading', ... }

const MARKER_RE = /^\[(PAUSE|SLOW|BREATHE)\]$/i

// Returns array of { id, level, text } for every h1/h2 in the doc.
export function extractCues(doc) {
  if (!doc?.content) return []
  const cues = []
  let id = 0
  for (const node of doc.content) {
    if (node.type === 'heading' && (node.attrs?.level === 1 || node.attrs?.level === 2)) {
      const text = node.content?.map(c => c.text ?? '').join('') ?? ''
      cues.push({ id: id++, level: node.attrs.level, text })
    }
  }
  return cues
}

export function tokenizeDoc(doc) {
  const tokens = []
  let headingId = 0

  function walkNode(node) {
    if (!node) return

    if (node.type === 'text') {
      const text = node.text || ''
      const isBold = node.marks?.some(m => m.type === 'bold') ?? false
      const color = node.marks?.find(m => m.type === 'textStyle')?.attrs?.color ?? null
      const words = text.split(/(\s+)/)
      for (const word of words) {
        if (!word || /^\s+$/.test(word)) continue
        const markerMatch = word.match(MARKER_RE)
        if (markerMatch) {
          tokens.push({ type: 'marker', text: word, marker: markerMatch[1].toUpperCase() })
        } else {
          tokens.push({ type: 'word', text: word, bold: isBold, color })
        }
      }
      return
    }

    if (node.type === 'heading') {
      const level = node.attrs?.level ?? 1
      const text = node.content?.map(c => c.text ?? '').join('') ?? ''
      const isCue = level === 1 || level === 2
      tokens.push({ type: 'heading', level, text, id: isCue ? headingId++ : null })
      tokens.push({ type: 'newline' })
      return
    }

    if (node.type === 'paragraph') {
      if (node.content) node.content.forEach(walkNode)
      tokens.push({ type: 'newline' })
      return
    }

    if (node.content) node.content.forEach(walkNode)
  }

  if (doc?.content) doc.content.forEach(walkNode)
  return tokens
}
