const ALLOWED_TAGS = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td']);

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
}

export function sanitizeRichText(value?: string): string {
  if (!value) return '';
  let source = /<[^>]+>/.test(value) ? value : value.split(/\r?\n/).map(line => `<p>${escapeHtml(line) || '<br>'}</p>`).join('');
  source = source.replace(/<!--[^]*?-->/g, '').replace(/<(script|style|iframe|object|embed|svg|form)[^>]*>[^]*?<\/\1\s*>/gi, '');
  return source.replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, (whole, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (whole.startsWith('</')) return `</${tag}>`;
    if (tag === 'br') return '<br>';
    if (tag === 'a') {
      const href = rawAttrs.match(/\bhref\s*=\s*["']([^"']*)["']/i)?.[1] || '';
      return /^https?:\/\//i.test(href) ? `<a href="${escapeHtml(href)}" target="_blank">` : '<a>';
    }
    if (tag === 'img') {
      const src = rawAttrs.match(/\bsrc\s*=\s*["']([^"']*)["']/i)?.[1] || '';
      const alt = rawAttrs.match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] || '';
      return /^(https?:\/\/|\/)/i.test(src) ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">` : '';
    }
    return `<${tag}>`;
  });
}

export function richTextError(value?: string): string {
  const raw = value || '';
  if (raw.length > 200_000) return '商品详情内容过大，请精简后提交';
  const safe = sanitizeRichText(raw);
  if (safe.length > 60_000) return '商品详情 HTML 不能超过 60000 字符';
  const text = safe.replace(/<[^>]*>/g, '').replace(/&(?:amp|lt|gt|quot|#39);/g, 'x');
  if (text.length > 20_000) return '商品详情文字不能超过 20000 字';
  if ((safe.match(/<img\b/gi) || []).length > 30) return '商品详情最多插入 30 张图片';
  return '';
}
