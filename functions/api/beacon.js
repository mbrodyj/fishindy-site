// Cloudflare Pages Function — /api/beacon
// Receives analytics pings from all FishINDY pages.
// Inserts page_views and leads into Supabase (ProStreams project).
//
// Secrets (set via `wrangler pages secret put`):
//   SUPABASE_URL       — e.g. https://mkdixmjokjootekhlhey.supabase.co
//   SUPABASE_ANON_KEY  — publishable anon key

async function supabaseInsert(env, table, row) {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': env.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
            'Prefer': 'return=minimal',
        },
        body: JSON.stringify(row),
    });
    if (!res.ok) {
        const err = await res.text();
        console.log(`[beacon] Supabase ${table} insert failed ${res.status}: ${err}`);
    }
    return res.ok;
}

export async function onRequestPost(context) {
    const { request, env } = context;

    // Size guard
    const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
    if (contentLength > 4096) {
        return new Response(JSON.stringify({ ok: false, error: 'too large' }), {
            status: 413, headers: corsHeaders(),
        });
    }

    let body;
    try {
        body = await request.json();
    } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: 'bad json' }), {
            status: 400, headers: corsHeaders(),
        });
    }

    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
        console.log('[beacon] Missing SUPABASE_URL or SUPABASE_ANON_KEY');
        return new Response(JSON.stringify({ ok: true, stored: false }), {
            status: 200, headers: corsHeaders(),
        });
    }

    // Extract CF-provided geo + IP
    const cf = request.cf || {};
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const ua = (request.headers.get('User-Agent') || '').slice(0, 300);
    const country = cf.country || null;
    const city = cf.city || null;
    const region = cf.region || null;

    const eventType = (body.type || 'pageview').toLowerCase();

    if (eventType === 'pageview') {
        await supabaseInsert(env, 'page_views', {
            page: (body.page || '/').slice(0, 200),
            referrer: (body.referrer || null),
            user_agent: ua,
            ip,
            country,
            city,
            region,
            device_type: body.device_type || null,
            fingerprint: (body.fingerprint || null),
            session_id: (body.session_id || null),
            metadata: body.metadata || {},
        });
    } else if (['vip_attempt', 'waitlist', 'onboard'].includes(eventType)) {
        await supabaseInsert(env, 'leads', {
            type: eventType,
            name: body.name ? String(body.name).slice(0, 200) : null,
            email: body.email ? String(body.email).slice(0, 200) : null,
            ip,
            country,
            city,
            referrer: body.referrer || null,
            metadata: body.metadata || {},
        });
    }

    return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: corsHeaders(),
    });
}

// Handle CORS preflight
export async function onRequestOptions() {
    return new Response(null, { status: 204, headers: corsHeaders() });
}

// Block non-POST/OPTIONS
export async function onRequest(context) {
    if (context.request.method === 'POST') return onRequestPost(context);
    if (context.request.method === 'OPTIONS') return onRequestOptions();
    return new Response(JSON.stringify({ ok: false, error: 'method not allowed' }), {
        status: 405, headers: { ...corsHeaders(), 'Allow': 'POST, OPTIONS' },
    });
}

function corsHeaders() {
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}
