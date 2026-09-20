const ALLOWED_TAGS = new Set(['p', 'div', 'span', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'figure', 'figcaption', 'a']);
const STYLE_TAGS = new Set(['span', 'p', 'div', 'table', 'td', 'th']);
const SAFE_STYLES = new Set(['color', 'background-color', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-align', 'vertical-align', 'width', 'height', 'max-width', 'border', 'border-collapse', 'margin', 'margin-left', 'margin-right', 'padding', 'white-space']);

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
}

function attr(source: string, name: string): string {
  return source.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] || '';
}

function numericAttr(source: string, name: string): string {
  const value = attr(source, name);
  return /^\d{1,4}$/.test(value) && Number(value) > 0 ? value : '';
}

function safeStyle(value: string): string {
  return value.split(';').map(item => item.trim()).filter(Boolean).map(item => {
    const split = item.indexOf(':');
    if (split < 1) return '';
    const name = item.slice(0, split).trim().toLowerCase(), styleValue = item.slice(split + 1).trim();
    if (!SAFE_STYLES.has(name) || !styleValue || /url\s*\(|expression|javascript|data:/i.test(styleValue)) return '';
    return `${name}: ${styleValue}`;
  }).filter(Boolean).join('; ');
}

export function sanitizeRichText(value?: string): string {
  if (!value) return '';
  let source = /<[^>]+>/.test(value) ? value : value.split(/\r?\n/).map(line => `<p>${escapeHtml(line) || '<br>'}</p>`).join('');
  source = source.replace(/<!--[^]*?-->/g, '').replace(/<(script|style|iframe|object|embed|svg|form)[^>]*>[^]*?<\/\1\s*>/gi, '');
  return source.replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, (whole, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (whole.startsWith('</')) return `</${tag}>`;
    if (tag === 'br' || tag === 'hr') return `<${tag}>`;
    if (tag === 'a') {
      const href = attr(rawAttrs, 'href'), title = attr(rawAttrs, 'title');
      return /^(https?:\/\/|mailto:)/i.test(href) ? `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ''} target="_blank" rel="noopener noreferrer">` : '<a>';
    }
    if (tag === 'img') {
      const src = attr(rawAttrs, 'src'), alt = attr(rawAttrs, 'alt'), title = attr(rawAttrs, 'title');
      const width = numericAttr(rawAttrs, 'width'), height = numericAttr(rawAttrs, 'height');
      return /^(https?:\/\/|\/)/i.test(src) ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${title ? ` title="${escapeHtml(title)}"` : ''}${width ? ` width="${width}"` : ''}${height ? ` height="${height}"` : ''}>` : '';
    }
    const colspan = ['td', 'th'].includes(tag) ? numericAttr(rawAttrs, 'colspan') : '';
    const rowspan = ['td', 'th'].includes(tag) ? numericAttr(rawAttrs, 'rowspan') : '';
    const style = STYLE_TAGS.has(tag) ? safeStyle(attr(rawAttrs, 'style')) : '';
    return `<${tag}${colspan ? ` colspan="${colspan}"` : ''}${rowspan ? ` rowspan="${rowspan}"` : ''}${style ? ` style="${escapeHtml(style)}"` : ''}>`;
  });
}

function decodeText(value: string): string {
  return value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ').trim();
}

export function richTextFingerprint(value?: string): string {
  const safe = sanitizeRichText(value);
  const images = Array.from(safe.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi), match => match[1]);
  return JSON.stringify([decodeText(safe), images]);
}

export function richTextError(value?: string): string {
  const raw = value || '';
  if (raw.length > 200_000) return '商品详情内容过大，请精简后提交';
  const safe = sanitizeRichText(raw);
  if (safe.length > 60_000) return '商品详情 HTML 不能超过 60000 字符';
  if (decodeText(safe).length > 20_000) return '商品详情文字不能超过 20000 字';
  if ((safe.match(/<img\b/gi) || []).length > 30) return '商品详情最多插入 30 张图片';
  return '';
}
