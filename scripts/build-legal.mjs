#!/usr/bin/env node
/**
 * Renders legal/*.md into a static site under site/.
 *
 * These pages exist because both stores refuse a submission without a live
 * privacy policy URL, and German law (§5 DDG) requires an Impressum on any
 * public site. Markdown stays the source of truth so the Milestone 5 Next.js
 * app can render the same files rather than a fork of them.
 *
 * No framework on purpose: the output is four HTML files that any static host
 * serves, and it must not become a thing to maintain.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'site')

/** slug → source file and nav label. Order here is the order in the nav. */
const PAGES = [
  { slug: 'privacy', file: 'privacy-policy.md', nav: 'Privacy', title: 'Privacy Policy' },
  { slug: 'terms', file: 'terms-of-service.md', nav: 'Terms', title: 'Terms of Service' },
  { slug: 'guidelines', file: 'community-guidelines.md', nav: 'Guidelines', title: 'Community Guidelines' },
  { slug: 'impressum', file: 'impressum.md', nav: 'Impressum', title: 'Impressum' },
  { slug: 'delete-account', file: 'account-deletion.md', nav: null,
    title: 'Deleting your account' },
]

/**
 * Cross-document links are written as relative Markdown paths so the files
 * stay readable in an editor and on GitHub. On the site they become clean URLs.
 */
const LINK_REWRITES = [
  [/href="\.\/privacy-policy\.md"/g, 'href="/privacy"'],
  [/href="\.\/terms-of-service\.md"/g, 'href="/terms"'],
  [/href="\.\/community-guidelines\.md"/g, 'href="/guidelines"'],
  [/href="\.\/impressum\.md"/g, 'href="/impressum"'],
]

/**
 * The draft banner is a note to us, not to the reader. Anything inside a
 * blockquote that starts with "Draft for review" is stripped from the site.
 */
function stripDraftNotice(md) {
  return md.replace(/^> \*\*Draft for review\.\*\*[\s\S]*?(?=\n\n(?!> ))/m, '')
}

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const STYLE = `
:root{
  --bg:#fff; --bg-subtle:#F4F6F8; --border:#E4E9ED; --border-strong:#C3CCD5;
  --text:#0B0E11; --text-muted:#5C6B7A; --accent:#8A6320; --accent-line:#B8862F;
}
@media (prefers-color-scheme:dark){
  :root{
    --bg:#0B0E11; --bg-subtle:#101418; --border:#1A2027; --border-strong:#2A333D;
    --text:#F4F6F8; --text-muted:#8A99A8; --accent:#D4A548; --accent-line:#D4A548;
  }
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; background:var(--bg); color:var(--text);
  font:16px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased;
}
.wrap{max-width:46rem;margin:0 auto;padding:2.5rem 1.25rem 5rem}
header.site{
  display:flex;flex-wrap:wrap;gap:.75rem 1.5rem;align-items:baseline;
  padding-bottom:1.25rem;margin-bottom:2.5rem;border-bottom:2px solid var(--accent-line);
}
header.site a.brand{font-weight:700;font-size:1.05rem;color:var(--text);text-decoration:none;letter-spacing:-.01em}
header.site nav{display:flex;flex-wrap:wrap;gap:1rem;margin-left:auto}
header.site nav a{color:var(--text-muted);text-decoration:none;font-size:.9rem}
header.site nav a:hover,header.site nav a[aria-current]{color:var(--accent);text-decoration:underline}
h1{font-size:2rem;line-height:1.15;letter-spacing:-.02em;margin:0 0 1.5rem;text-wrap:balance}
h2{font-size:1.3rem;margin:2.5rem 0 .75rem;line-height:1.25;text-wrap:balance}
h3{font-size:1.05rem;margin:1.75rem 0 .5rem}
p,li{color:var(--text)}
a{color:var(--accent)}
hr{border:0;border-top:1px solid var(--border);margin:2.5rem 0}
blockquote{
  margin:1.5rem 0;padding:.85rem 1.1rem;border-left:3px solid var(--accent-line);
  background:var(--bg-subtle);color:var(--text-muted);
}
blockquote p{margin:.35rem 0;color:inherit}
code{
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.88em;
  background:var(--bg-subtle);border:1px solid var(--border);border-radius:4px;padding:.1em .35em;
}
.table-scroll{overflow-x:auto;margin:1.25rem 0}
table{border-collapse:collapse;width:100%;font-size:.92rem}
th,td{text-align:left;padding:.55rem .7rem;border-bottom:1px solid var(--border);vertical-align:top}
th{background:var(--bg-subtle);font-weight:600;white-space:nowrap}
ul,ol{padding-left:1.35rem}
li{margin:.3rem 0}
li::marker{color:var(--accent-line)}
footer.site{
  margin-top:4rem;padding-top:1.5rem;border-top:1px solid var(--border);
  font-size:.85rem;color:var(--text-muted);display:flex;flex-wrap:wrap;gap:.5rem 1.25rem;
}
footer.site a{color:var(--text-muted)}
:focus-visible{outline:2px solid var(--accent-line);outline-offset:3px}
`

function page({ title, slug, bodyHtml }) {
  const nav = PAGES.filter((p) => p.nav)
    .map((p) => `<a href="/${p.slug}"${p.slug === slug ? ' aria-current="page"' : ''}>${p.nav}</a>`)
    .join('')
  return `<!doctype html>
<html lang="${slug === 'impressum' ? 'de' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — GigAway</title>
<meta name="robots" content="index,follow">
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<header class="site">
  <a class="brand" href="/">GigAway</a>
  <nav>${nav}</nav>
</header>
<main>
${bodyHtml}
</main>
<footer class="site">
  <span>© ${new Date().getFullYear()} Mohamed Aziz Talbi</span>
  <a href="mailto:support@gigaway.app">support@gigaway.app</a>
</footer>
</div>
</body>
</html>
`
}

const INDEX_BODY = `
<h1>A couch, a colleague, a city you don't know yet.</h1>
<p>GigAway is a verified network for professional performing artists who travel
for auditions, competitions and guest contracts. Log a trip, and find verified
colleagues in that city offering a free couch, local knowledge, or company.</p>
<p><strong>No money changes hands.</strong> GigAway is not an accommodation
provider and takes no fee.</p>
<p>The app is in closed testing. These pages are the legal documents that
accompany it.</p>
<ul>
  <li><a href="/privacy">Privacy Policy</a></li>
  <li><a href="/terms">Terms of Service</a></li>
  <li><a href="/guidelines">Community Guidelines</a></li>
  <li><a href="/impressum">Impressum</a></li>
</ul>
`

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

for (const p of PAGES) {
  const md = stripDraftNotice(readFileSync(join(root, 'legal', p.file), 'utf8'))
  let html = marked.parse(md, { mangle: false, headerIds: false })
  for (const [pattern, replacement] of LINK_REWRITES) html = html.replace(pattern, replacement)
  // Wide tables must scroll inside their own container, never the page body.
  html = html.replace(/<table>/g, '<div class="table-scroll"><table>').replace(/<\/table>/g, '</table></div>')
  writeFileSync(join(outDir, `${p.slug}.html`), page({ title: p.title, slug: p.slug, bodyHtml: html }))
  console.log(`  /${p.slug}`.padEnd(16) + `← legal/${p.file}`)
}

writeFileSync(join(outDir, 'index.html'), page({ title: 'GigAway', slug: '', bodyHtml: INDEX_BODY }))
console.log('  /'.padEnd(16) + '← generated')

// No _redirects file on purpose. Cloudflare Pages already serves `privacy.html`
// at `/privacy` and redirects the .html form back to the clean one. Adding a
// `/privacy -> /privacy.html 200` rewrite on top of that is an infinite loop:
// the rewrite lands on .html, Pages redirects .html back, and round it goes.

console.log(`\nsite/ built — ${PAGES.length + 1} pages`)
