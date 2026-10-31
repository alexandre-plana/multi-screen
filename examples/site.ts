/** Shared helpers of the site: syntax highlighting, copy buttons, logo. */

export const LOGO_SVG = `<svg viewBox="0 0 146 176" aria-hidden="true"><rect x="0" y="0" width="66" height="66" rx="9" fill="#2F6FDE"/><rect class="logo-ink" x="0" y="80" width="66" height="66" rx="9"/><rect class="logo-ink" x="80" y="30" width="66" height="66" rx="9"/><rect class="logo-ink" x="80" y="110" width="66" height="66" rx="9"/></svg>`;

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const KEYWORDS = new Set(
  'import export from const let var function return if else for of in while new await async type interface extends implements class true false null undefined as typeof void this throw try catch finally default switch case break continue keyof readonly'.split(' '),
);

/** Tiny, dependency-free highlighter for the languages of the docs. */
export function highlight(code: string, lang: string): string {
  if (lang === 'bash' || lang === 'sh') {
    return code
      .split('\n')
      .map((line) => {
        if (/^\s*#/.test(line)) return `<span class="tok-c">${escape(line)}</span>`;
        const m = /^(\s*)(\S+)(.*)$/.exec(line);
        if (!m) return escape(line);
        return `${m[1]}<span class="tok-f">${escape(m[2]!)}</span>${escape(m[3]!).replace(/(\s)(--?[\w-]+)/g, '$1<span class="tok-k">$2</span>')}`;
      })
      .join('\n');
  }
  if (lang === 'html') {
    return escape(code)
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tok-c">$1</span>')
      .replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="tok-k">$2</span>')
      .replace(/([\w-]+)=(&quot;|")(.*?)\2/g, '<span class="tok-key">$1</span>=<span class="tok-s">"$3"</span>');
  }
  // ts / js / json / tsx
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*")|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|([^\sA-Za-z_$\d'"`/]+|\/)/g;
  let out = '';
  let m: RegExpExecArray | null;
  let last = '';
  while ((m = re.exec(code))) {
    const [token, comment, string, number, word, space] = m;
    if (comment) out += `<span class="tok-c">${escape(comment)}</span>`;
    else if (string) {
      const isKey = lang === 'json' && /^\s*:/.test(code.slice(re.lastIndex));
      out += `<span class="${isKey ? 'tok-key' : 'tok-s'}">${escape(string)}</span>`;
    } else if (number) out += `<span class="tok-n">${number}</span>`;
    else if (word) {
      const next = code.slice(re.lastIndex).match(/^\s*(\(|<)/);
      if (KEYWORDS.has(word)) out += `<span class="${word === 'true' || word === 'false' || word === 'null' ? 'tok-b' : 'tok-k'}">${word}</span>`;
      else if (next?.[1] === '(' && last !== 'new') out += `<span class="tok-f">${word}</span>`;
      else if (/^[A-Z]/.test(word)) out += `<span class="tok-t">${word}</span>`;
      else out += word;
      last = word;
      continue;
    } else if (space) out += space;
    else out += `<span class="tok-p">${escape(token)}</span>`;
    if (!space) last = '';
  }
  return out;
}

const LANG_LABEL: Record<string, string> = { ts: 'TypeScript', tsx: 'TSX', js: 'JavaScript', json: 'JSON', bash: 'Terminal', html: 'HTML', sh: 'Terminal' };

/** Builds a highlighted, copyable code block. */
export function codeBlock(code: string, lang = 'ts', title?: string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'code';
  const clean = code.replace(/^\n+|\s+$/g, '');
  box.innerHTML = `<div class="code-head"><span class="lang">${LANG_LABEL[lang] ?? lang}</span>${title ? `<span class="title">${escape(title)}</span>` : ''}<button type="button" class="copy">Copier</button></div><pre><code>${highlight(clean, lang)}</code></pre>`;
  const button = box.querySelector<HTMLButtonElement>('.copy')!;
  button.onclick = () => copyText(clean, button);
  return box;
}

export async function copyText(text: string, button?: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  if (button) {
    const label = button.textContent;
    button.textContent = 'Copié ✓';
    button.dataset.done = '';
    setTimeout(() => {
      button.textContent = label;
      delete button.dataset.done;
    }, 1600);
  }
}

/**
 * Turns every `<textarea class="src" data-lang="ts" data-title="…">` into a
 * highlighted block. Code is authored in textareas so it needs no escaping.
 */
export function enhanceCode(root: ParentNode = document): void {
  for (const area of root.querySelectorAll<HTMLTextAreaElement>('textarea.src')) {
    area.replaceWith(codeBlock(dedent(area.value), area.dataset.lang ?? 'ts', area.dataset.title));
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
    button.onclick = () => copyText(button.dataset.copy!, button);
  }
}

function dedent(text: string): string {
  const lines = text.replace(/^\n+/, '').replace(/\s+$/, '').split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)![0].length));
  return lines.map((l) => l.slice(indent)).join('\n');
}

export function mountLogo(root: ParentNode = document): void {
  for (const el of root.querySelectorAll('[data-logo]')) el.innerHTML = LOGO_SVG;
}
