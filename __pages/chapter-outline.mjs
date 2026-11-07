// Use the same token pass for navigation and body anchors, including duplicate titles.
export function chapterOutline(md) {
  md.core.ruler.push('chapter_outline', state => {
    const headings = [];
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i];
      if (token.type !== 'heading_open' || token.tag === 'h1') continue;
      const inline = state.tokens[i + 1];
      const text = (inline.children || []).map(child => {
        if (['text', 'code_inline', 'image'].includes(child.type)) return child.content;
        if (['softbreak', 'hardbreak'].includes(child.type)) return ' ';
        return '';
      }).join('').trim();
      const id = 'section-' + (headings.length + 1);
      token.attrSet('id', id);
      headings.push({id, text, level: Number(token.tag.slice(1))});
    }
    state.env.headings = headings;
  });
}

export function headingLabels(text) {
  const parts = text.split(' · ');
  if (parts.length === 2 && /[\u3400-\u9fff]/.test(parts[1]) && !/[\u3400-\u9fff]/.test(parts[0])) {
    return [parts[1], parts[0]];
  }
  return [text, ''];
}
