import { Router } from 'express';

export const proxyRouter = Router();

/* ── Live Search for Webinar Browser Presentation Stage ──── */
proxyRouter.get('/search', async (req, res) => {
  const query = req.query.q ? String(req.query.q).trim() : '';
  if (!query) {
    return res.json({ query: '', results: [] });
  }

  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent':
          (req.headers['user-agent'] as string) ||
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': (req.headers['accept-language'] as string) || 'en-US,en;q=0.9',
      },
    });

    const html = await response.text();
    const results: Array<{ title: string; url: string; snippet: string; displayUrl: string }> = [];

    const blocks = html.split(/class="[^"]*results_links[^"]*"/);
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const titleMatch = block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      if (!titleMatch) continue;

      const rawUrl = titleMatch[1];
      const title = titleMatch[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();

      let actualUrl = rawUrl;
      try {
        const uddgMatch = rawUrl.match(/[?&]uddg=([^&]+)/);
        if (uddgMatch) {
          actualUrl = decodeURIComponent(uddgMatch[1]);
        } else if (rawUrl.startsWith('//')) {
          actualUrl = 'https:' + rawUrl;
        }
      } catch { }

      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      const snippet = snippetMatch
        ? snippetMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim()
        : '';

      if (actualUrl && title && !actualUrl.includes('duckduckgo.com')) {
        results.push({
          title,
          url: actualUrl,
          snippet,
          displayUrl: actualUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''),
        });
      }
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.json({ query, results });
  } catch (err) {
    return res.status(500).json({
      error: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
      results: [],
    });
  }
});

/* ── Unblock Proxy for iframing external websites ─────────── */
proxyRouter.get('/', async (req, res) => {
  const targetUrl = req.query.url ? String(req.query.url).trim() : '';
  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const parsed = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).send('Invalid protocol');
    }

    const host = parsed.hostname.toLowerCase();
    // SSRF prevention: disallow local/internal addresses
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local')
    ) {
      return res.status(403).send('Restricted host');
    }

    const response = await fetch(parsed.toString(), {
      headers: {
        'User-Agent':
          (req.headers['user-agent'] as string) ||
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': (req.headers['accept-language'] as string) || 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    const contentType = response.headers.get('content-type') || 'text/html';

    // Strip restrictive framing headers from response
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Cross-Origin-Embedder-Policy');
    res.removeHeader('Cross-Origin-Resource-Policy');
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentType);

    if (contentType.includes('text/html')) {
      let html = await response.text();

      // Inject <base href="..."> and link-syncing script
      const baseTag = `<base href="${response.url}">`;
      const syncScript = `<script>
(function() {
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a');
    if (a && a.href && !a.href.startsWith('javascript:') && !a.href.startsWith('#')) {
      e.preventDefault();
      try {
        window.parent.postMessage({ type: 'webinar_browser_navigate', url: a.href }, '*');
      } catch (err) {}
    }
  }, true);
})();
</script>`;

      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, `$&${baseTag}${syncScript}`);
      } else {
        html = `${baseTag}${syncScript}${html}`;
      }

      return res.send(html);
    }

    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    return res.status(500).send(`Failed to proxy website: ${err instanceof Error ? err.message : String(err)}`);
  }
});
