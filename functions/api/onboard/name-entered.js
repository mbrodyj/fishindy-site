// Cloudflare Pages Function — /api/onboard/name-entered
// Fires a Telegram DM to Brody the moment someone types their name on the
// public onboarding NDA gate. Zero backend, runs on the Cloudflare edge.
//
// Secrets (set via `wrangler pages secret put NAME --project-name=fishindy-site`):
//   TELEGRAM_BOT_TOKEN   — bot token for @FishingNewsBrodybot
//   TELEGRAM_CHAT_ID     — Brody's personal chat ID
//
// Abuse mitigation:
//   - 10 minute dedup per normalized name (in-memory per isolate — best-effort)
//   - Hard cap: rejects names shorter than 3 chars or longer than 120
//   - Payload size cap: 2 KB max
//   - Only accepts POST with JSON body

const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 min
const _seen = new Map(); // name -> timestamp (per-isolate, best-effort)

function pruneSeen(now) {
    for (const [k, t] of _seen) {
        if (now - t > DEDUP_WINDOW_MS) _seen.delete(k);
    }
}

export async function onRequestPost(context) {
    const { request, env } = context;

    // Size guard
    const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
    if (contentLength > 2048) {
        return new Response(JSON.stringify({ ok: false, error: 'payload too large' }), {
            status: 413, headers: { 'Content-Type': 'application/json' }
        });
    }

    let body;
    try {
        body = await request.json();
    } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: 'bad json' }), {
            status: 400, headers: { 'Content-Type': 'application/json' }
        });
    }

    const rawName = (body && typeof body.name === 'string') ? body.name : '';
    const name = rawName.trim().slice(0, 120);
    if (name.length < 3) {
        return new Response(JSON.stringify({ ok: false, error: 'name too short' }), {
            status: 400, headers: { 'Content-Type': 'application/json' }
        });
    }

    // Dedup (per-isolate, best-effort — not cross-region, but good enough)
    const now = Date.now();
    pruneSeen(now);
    const key = name.toLowerCase();
    const last = _seen.get(key) || 0;
    if (now - last < DEDUP_WINDOW_MS) {
        return new Response(JSON.stringify({ ok: true, deduped: true }), {
            status: 200, headers: { 'Content-Type': 'application/json' }
        });
    }
    _seen.set(key, now);

    // Fingerprint the visitor using CF request headers
    const cf = request.cf || {};
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const ua = (request.headers.get('User-Agent') || 'unknown').slice(0, 160);
    const referer = (request.headers.get('Referer') || '(direct)').slice(0, 160);
    const country = cf.country || '??';
    const region = cf.region || '';
    const city = cf.city || '';
    const asn = cf.asOrganization || '';

    const msg = [
        'ONBOARDING: name entered',
        `Name: ${name}`,
        `Loc: ${[city, region, country].filter(Boolean).join(', ') || 'unknown'}`,
        `IP: ${ip}`,
        asn ? `ASN: ${asn}` : null,
        `Referer: ${referer}`,
        `UA: ${ua}`,
        `When: ${new Date(now).toISOString()}`,
    ].filter(Boolean).join('\n');

    // Telegram sendMessage
    const token = env.TELEGRAM_BOT_TOKEN;
    const chat = env.TELEGRAM_CHAT_ID;
    if (!token || !chat) {
        // Config missing — still respond 200 so the client doesn't retry forever
        console.log('[name-entered] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in env');
        return new Response(JSON.stringify({ ok: true, notified: false }), {
            status: 200, headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chat, text: msg }),
        });
        if (!tgRes.ok) {
            const errText = await tgRes.text();
            console.log(`[name-entered] Telegram error ${tgRes.status}: ${errText}`);
            return new Response(JSON.stringify({ ok: true, notified: false, error: `tg ${tgRes.status}` }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        }
    } catch (e) {
        console.log(`[name-entered] Telegram fetch fail: ${e.message}`);
        return new Response(JSON.stringify({ ok: true, notified: false }), {
            status: 200, headers: { 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify({ ok: true, notified: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
    });
}

// Block non-POST verbs cleanly
export async function onRequest(context) {
    if (context.request.method === 'POST') return onRequestPost(context);
    return new Response(JSON.stringify({ ok: false, error: 'method not allowed' }), {
        status: 405, headers: { 'Content-Type': 'application/json', 'Allow': 'POST' }
    });
}
