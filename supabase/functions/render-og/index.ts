// render-og — write-time OG image generator.
//
// Triggered fire-and-forget from SvelteKit form actions after any write that
// affects the artist line on a mixtape (add_track, manual, import_playlist,
// save_meta, delete, reorder). The flow:
//
//   1. Fetch the SVG from the public site's /og/{handle} endpoint — that's
//      the single source of truth for composition. Avoids duplicating
//      typography logic across SvelteKit (TS) and Deno here.
//   2. Fetch the Crimson Pro font from the public site's /fonts path.
//      Caches both wasm-init and font bytes in module-level state for the
//      isolate's lifetime (one cold-start cost per worker, ~hundreds of
//      requests amortize it).
//   3. Rasterize via @resvg/resvg-wasm. Deno supports
//      WebAssembly.instantiate(bytes) natively — none of the Cloudflare
//      Workers wasm-bindgen friction we hit in Phase 1d. Iteration 1.
//   4. Upload to the public `og-images` storage bucket at `{handle}.png`,
//      overwriting any prior version.
//
// Authorization: requires the service-role bearer token (Supabase's default
// for Edge Functions deployed with `--verify-jwt`). Only server-side code
// in our app should ever invoke this.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { Resvg, initWasm } from 'npm:@resvg/resvg-wasm@2.6.2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'og-images';
const FONT_PATH = '/fonts/CrimsonPro-Regular.ttf';

let wasmReady: Promise<void> | null = null;
let fontBytesPromise: Promise<Uint8Array> | null = null;

async function ensureWasm(): Promise<void> {
  if (wasmReady) return wasmReady;
  const work = (async () => {
    // The wasm file ships with the npm package. Deno's npm specifier resolves
    // it for us. We fetch as bytes and pass through initWasm.
    const wasmUrl = new URL(
      '../../../node_modules/.deno/@resvg+resvg-wasm@2.6.2/node_modules/@resvg/resvg-wasm/index_bg.wasm',
      import.meta.url
    );
    // Fallback: also try jsdelivr CDN if the local path doesn't resolve.
    let res: Response;
    try {
      res = await fetch(wasmUrl);
      if (!res.ok) throw new Error(`local wasm fetch failed: ${res.status}`);
    } catch {
      res = await fetch(
        'https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm'
      );
    }
    await initWasm(res);
  })();
  // Cache the in-flight promise so concurrent calls share it, but clear on
  // rejection so the next call retries (e.g. if prod assets weren't deployed
  // yet on the first invocation of the isolate).
  wasmReady = work.catch((err) => {
    wasmReady = null;
    throw err;
  });
  return wasmReady;
}

async function getFontBytes(baseUrl: string): Promise<Uint8Array> {
  if (fontBytesPromise) return fontBytesPromise;
  const work = (async () => {
    const url = new URL(FONT_PATH, baseUrl);
    const res = await fetch(url, {
      headers: {
        // Some CDNs / Cloudflare configs reject requests without a UA.
        'user-agent': 'mixtapestory-render-og/1.0',
        accept: 'font/ttf,*/*'
      }
    });
    if (!res.ok) {
      const peek = await res.text().catch(() => '');
      throw new Error(
        `font fetch failed: ${res.status} for ${url.toString()} ` +
          `(content-type=${res.headers.get('content-type') ?? '-'}; body=${peek.slice(0, 200)})`
      );
    }
    return new Uint8Array(await res.arrayBuffer());
  })();
  fontBytesPromise = work.catch((err) => {
    fontBytesPromise = null;
    throw err;
  });
  return fontBytesPromise;
}

async function fetchSvg(baseUrl: string, handle: string): Promise<string> {
  const url = new URL(`/og/${encodeURIComponent(handle)}`, baseUrl);
  const res = await fetch(url, {
    headers: {
      'user-agent': 'mixtapestory-render-og/1.0',
      accept: 'image/svg+xml'
    }
  });
  if (!res.ok) throw new Error(`SVG fetch failed: ${res.status} for ${url.toString()}`);
  return await res.text();
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 });
  }

  let payload: { handle?: string; baseUrl?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'bad json' }), { status: 400 });
  }

  const handle = payload.handle?.trim();
  const baseUrl = payload.baseUrl?.trim();
  if (!handle || !baseUrl) {
    return new Response(JSON.stringify({ error: 'handle and baseUrl required' }), {
      status: 400
    });
  }

  try {
    await ensureWasm();
    const [svg, fontBytes] = await Promise.all([
      fetchSvg(baseUrl, handle),
      getFontBytes(baseUrl)
    ]);

    const resvg = new Resvg(svg, {
      font: {
        fontBuffers: [fontBytes],
        loadSystemFonts: false,
        defaultFontFamily: 'Crimson Pro'
      },
      fitTo: { mode: 'width', value: 1200 }
    });
    const pngBytes = resvg.render().asPng();

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(`${handle}.png`, pngBytes, {
        contentType: 'image/png',
        cacheControl: '300',
        upsert: true
      });
    if (uploadErr) throw new Error(`upload failed: ${uploadErr.message}`);

    return new Response(
      JSON.stringify({ ok: true, handle, size: pngBytes.length }),
      { headers: { 'content-type': 'application/json' } }
    );
  } catch (err) {
    console.error('[render-og]', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500
    });
  }
});
