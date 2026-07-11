#!/usr/bin/env node
/**
 * Static blog builder for auraeamusic.com
 * ------------------------------------------------
 * No dependencies, no backend, no login system.
 *
 * How it works:
 *   1. Every post lives as a Markdown file in /posts, with a small
 *      frontmatter block up top (title, date, optional excerpt/slug).
 *   2. Run `node scripts/build-blog.js` from the project root.
 *   3. It reads every post, converts the Markdown to HTML, and writes
 *      into posts/generated/:
 *        - posts/generated/blog.html          (the post list)
 *        - posts/generated/post-<slug>.html   (one file per post)
 *   4. Commit + push (or upload) like you already do. That's the whole
 *      "publish" step — there's no live login because there's nothing
 *      for a login to protect. Whoever can push to the repo is the
 *      only one who can ever produce a new post-*.html file.
 *
 * Writing a new post:
 *   Create posts/whatever-you-want.md with this at the top:
 *
 *     ---
 *     title: My Post Title
 *     date: 2026-07-10
 *     excerpt: One or two sentences shown on the blog list page.
 *     ---
 *
 *     Then just write normally underneath. Supports **bold**, *italic*,
 *     [links](https://example.com), `inline code`, "- " bullet lists,
 *     "1. " numbered lists, "> " blockquotes, # / ## / ### headings,
 *     "---" horizontal rules, and paragraphs.
 *
 *   The filename becomes the URL slug unless you set `slug:` explicitly.
 *   Run the build script again and you're done — no dependencies to
 *   install, just plain Node. Blog links from the rest of the site
 *   point at posts/generated/blog.html, so nothing else needs to move.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'posts');
const OUTPUT_DIR = path.join(POSTS_DIR, 'generated');
// generated pages live two directories below the project root
// (posts/generated/), so links back to site-wide assets need to
// climb back up two levels.
const ASSET_PREFIX = '../../';
const SITE_TITLE = 'auraea';

// ── frontmatter + markdown ──────────────────────────────────────

function parsePost(raw, fallbackSlug){
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`missing a --- frontmatter block at the top of the file`);
  }
  const [, frontmatterBlock, body] = match;

  const meta = {};
  frontmatterBlock.split('\n').forEach(line => {
    if (!line.trim()) return;
    const idx = line.indexOf(':');
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    value = value.replace(/^["']|["']$/g, ''); // strip surrounding quotes
    meta[key] = value;
  });

  if (!meta.title) throw new Error(`missing "title" in frontmatter`);
  if (!meta.date)  throw new Error(`missing "date" in frontmatter`);

  const dateObj = new Date(`${meta.date}T00:00:00`);
  if (Number.isNaN(dateObj.getTime())) {
    throw new Error(`has an unparseable date: "${meta.date}" — use YYYY-MM-DD`);
  }

  return {
    title: meta.title,
    date: meta.date,
    dateObj,
    dateDisplay: dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    excerpt: meta.excerpt || '',
    slug: (meta.slug || fallbackSlug).trim(),
    body: body.trim(),
  };
}

function escapeHtml(str){
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Minimal inline formatting: inline code, links, bold, italic
function renderInline(text){
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  return out;
}

// Minimal block-level markdown -> HTML (headings, lists, blockquotes,
// horizontal rules, paragraphs). Intentionally small — this covers what
// a personal blog post needs without pulling in a dependency.
function markdownToHtml(md){
  const lines = md.split('\n');
  const html = [];
  let i = 0;

  while (i < lines.length){
    const line = lines[i];

    if (!line.trim()){ i++; continue; }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading){
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (line.trim() === '---'){
      html.push('<hr>');
      i++;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)){
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])){
        items.push(`<li>${renderInline(lines[i].replace(/^\s*[-*]\s+/, ''))}</li>`);
        i++;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)){
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])){
        items.push(`<li>${renderInline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`);
        i++;
      }
      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    if (/^\s*>\s?/.test(line)){
      const quoteLines = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])){
        quoteLines.push(renderInline(lines[i].replace(/^\s*>\s?/, '')));
        i++;
      }
      html.push(`<blockquote><p>${quoteLines.join('<br>')}</p></blockquote>`);
      continue;
    }

    // paragraph: collect until a blank line
    const paraLines = [];
    while (i < lines.length && lines[i].trim()){
      paraLines.push(lines[i]);
      i++;
    }
    html.push(`<p>${renderInline(paraLines.join(' '))}</p>`);
  }

  return html.join('\n');
}

// ── page templates ──────────────────────────────────────────────

function pageShell({ title, description, bodyContent }){
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
${description ? `<meta name="description" content="${escapeHtml(description)}">\n` : ''}
<link rel="icon" type="image/png" href="${ASSET_PREFIX}assets/favicon.png">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">

<link rel="stylesheet" href="${ASSET_PREFIX}style.css">
</head>
<body>

<div class="bg-wash" aria-hidden="true"></div>
<div class="grain" aria-hidden="true"></div>

<header class="nav">
  <a class="nav__mark" href="${ASSET_PREFIX}">auraea</a>
  <a class="nav__link" href="./blog.html">Blog</a>
</header>

<main>
${bodyContent}
</main>

<script src="${ASSET_PREFIX}script.js" defer></script>
</body>
</html>
`;
}

function footerMarkup(){
  return `  <footer class="contact contact--minimal">
    <div class="section-inner">
      <p class="fine-print" id="finePrint"><span class="fine-print__text" id="finePrintText"><span class="copyright-mark" id="copyrightMark" role="button" tabindex="0">&copy;</span> <span id="year"></span> ${SITE_TITLE}. Site built with care :)</span></p>
    </div>
  </footer>`;
}

function renderBlogIndex(posts){
  const cards = posts.map(post => `
        <a class="blog-card" href="post-${post.slug}.html">
          <p class="blog-card__date">${post.dateDisplay}</p>
          <h2 class="blog-card__title">${renderInline(post.title)}</h2>
          ${post.excerpt ? `<p class="blog-card__excerpt">${renderInline(post.excerpt)}</p>` : ''}
          <span class="blog-card__cue">Read post &rarr;</span>
        </a>`).join('\n');

  const body = `
  <section class="blog-hero">
    <div class="section-inner">
      <p class="eyebrow">from the studio</p>
      <h1 class="section-title">Blog</h1>
      <p class="section-lede">Updates, notes, and whatever else doesn't fit in a caption.</p>
    </div>
  </section>

  <section class="blog-list-section">
    <div class="section-inner">
      <div class="blog-list">
        ${posts.length ? cards : '<p class="blog-empty">No posts yet — check back soon.</p>'}
      </div>
    </div>
  </section>

${footerMarkup()}`;

  return pageShell({
    title: `Blog — ${SITE_TITLE}`,
    description: 'Updates and notes from auraea.',
    bodyContent: body,
  });
}

function renderPost(post){
  const body = `
  <article class="post">
    <div class="section-inner section-inner--narrow">
      <a class="post__back" href="./blog.html">&larr; All posts</a>
      <p class="eyebrow">${post.dateDisplay}</p>
      <h1 class="section-title post__title">${renderInline(post.title)}</h1>
      <div class="post__body">
        ${markdownToHtml(post.body)}
      </div>
      <a class="post__back post__back--bottom" href="./blog.html">&larr; All posts</a>
    </div>
  </article>

${footerMarkup()}`;

  return pageShell({
    title: `${post.title} — ${SITE_TITLE}`,
    description: post.excerpt || post.title,
    bodyContent: body,
  });
}

// ── build ────────────────────────────────────────────────────────

function build(){
  if (!fs.existsSync(POSTS_DIR)){
    console.error(`No posts/ folder found at ${POSTS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
  if (!files.length){
    console.warn('No .md files found in posts/ — building an empty blog list.');
  }

  const posts = files.map(file => {
    const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
    const fallbackSlug = file.replace(/\.md$/, '');
    try {
      return parsePost(raw, fallbackSlug);
    } catch (err) {
      console.error(`Failed to parse posts/${file}: ${err.message}`);
      process.exit(1);
    }
  });

  posts.sort((a, b) => b.dateObj - a.dateObj);

  const seenSlugs = new Set();
  posts.forEach(p => {
    if (seenSlugs.has(p.slug)){
      console.error(`Duplicate slug "${p.slug}" — give one of these posts a unique slug: in its frontmatter.`);
      process.exit(1);
    }
    seenSlugs.add(p.slug);
  });

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  fs.writeFileSync(path.join(OUTPUT_DIR, 'blog.html'), renderBlogIndex(posts));
  console.log('wrote posts/generated/blog.html');

  posts.forEach(post => {
    fs.writeFileSync(path.join(OUTPUT_DIR, `post-${post.slug}.html`), renderPost(post));
    console.log(`wrote posts/generated/post-${post.slug}.html`);
  });

  console.log(`\ndone — built ${posts.length} post${posts.length === 1 ? '' : 's'}.`);
}

build();
