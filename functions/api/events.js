/**
 * ============================================================================
 * CLOUDFLARE PAGES FUNCTION: REALTIME EVENTS STREAM & SYNC API
 * ============================================================================
 * Endpoint: GET /api/events?since=<id>&tables=orders,delivery_partners
 * Provides sub-second reactive updates for Admin Cockpit, Rider Portal, & Customer DOM.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

const DEFAULT_AUTH_SECRET = 'breeze-cafe-edge-secret-2026-auth-token-key-palghar-webyodas';

function getAuthSecret(env) {
  return (env && env.JWT_SECRET) || DEFAULT_AUTH_SECRET;
}

async function getCryptoKey(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function base64UrlToUint8Array(base64Url) {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;

  try {
    const key = await getCryptoKey(secret);
    const enc = new TextEncoder();
    const sigBytes = base64UrlToUint8Array(encodedSignature);

    const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(data));
    if (!isValid) return null;

    let jsonStr = '';
    try {
      jsonStr = decodeURIComponent(escape(atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/'))));
    } catch (e) {
      jsonStr = atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/'));
    }

    const payload = JSON.parse(jsonStr);
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return null;
    }
    return payload;
  } catch (e) {
    return null;
  }
}

async function extractAndVerifyCaller(request, env) {
  if (!request) return null;
  const secret = getAuthSecret(env);

  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const payload = await verifyToken(token, secret);
    if (payload) return payload;
  }

  const cookieHeader = request.headers.get('Cookie') || request.headers.get('cookie') || '';
  const cookies = {};
  cookieHeader.split(';').forEach(c => {
    const [k, v] = c.trim().split('=');
    if (k && v) cookies[k] = decodeURIComponent(v);
  });

  if (cookies.breeze_admin_jwt) {
    const payload = await verifyToken(cookies.breeze_admin_jwt, secret);
    if (payload) return payload;
  }

  if (cookies.breeze_rider_jwt) {
    const payload = await verifyToken(cookies.breeze_rider_jwt, secret);
    if (payload) return payload;
  }

  return null;
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.DB) {
    return new Response(
      JSON.stringify({ events: [], error: 'DB binding missing' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }

  try {
    const caller = await extractAndVerifyCaller(request, env);
    const callerRole = (caller && (caller.role || caller.type)) || 'public';
    const isStaff = caller && ['admin', 'owner', 'manager', 'kitchen', 'rider'].includes(callerRole);

    const url = new URL(request.url);
    const since = parseInt(url.searchParams.get('since') || '0', 10);
    const tablesParam = url.searchParams.get('tables');
    const orderIdParam = url.searchParams.get('order_id');

    let sql = 'SELECT * FROM app_events WHERE id > ?';
    const params = [since];

    if (tablesParam) {
      const tables = tablesParam.split(',').map(t => t.trim()).filter(Boolean);
      if (tables.length > 0) {
        const placeholders = tables.map(() => '?').join(', ');
        sql += ` AND table_name IN (${placeholders})`;
        params.push(...tables);
      }
    }

    // For public listeners, filter to specific order if tracking, or public events
    if (!isStaff && orderIdParam) {
      sql += " AND (record_id = ? OR table_name IN ('store_settings', 'menu_items'))";
      params.push(orderIdParam);
    }

    sql += ' ORDER BY id ASC LIMIT 100';

    const results = (await env.DB.prepare(sql).bind(...params).all()).results || [];

    const formattedEvents = results.map(row => {
      let payloadObj = {};
      try {
        payloadObj = JSON.parse(row.payload);
      } catch (e) {
        payloadObj = row.payload;
      }

      // Security sanitization on outgoing real-time stream:
      if (row.table_name === 'delivery_partners' && !isStaff && payloadObj && typeof payloadObj === 'object') {
        delete payloadObj.passcode;
      }
      if (row.table_name === 'admin_users' && payloadObj && typeof payloadObj === 'object') {
        delete payloadObj.password_hash;
      }

      return {
        id: row.id,
        table: row.table_name,
        eventType: row.event_type,
        recordId: row.record_id,
        new: row.event_type === 'DELETE' ? null : payloadObj,
        old: row.event_type === 'DELETE' ? { id: row.record_id } : null,
        created_at: row.created_at
      };
    });

    const maxId = formattedEvents.length > 0
      ? formattedEvents[formattedEvents.length - 1].id
      : since;

    return new Response(
      JSON.stringify({ events: formattedEvents, lastId: maxId }),
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ events: [], error: err.message || String(err) }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
