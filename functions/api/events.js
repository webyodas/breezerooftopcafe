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
    const url = new URL(request.url);
    const since = parseInt(url.searchParams.get('since') || '0', 10);
    const tablesParam = url.searchParams.get('tables');

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

    sql += ' ORDER BY id ASC LIMIT 100';

    const results = (await env.DB.prepare(sql).bind(...params).all()).results || [];

    const formattedEvents = results.map(row => {
      let payloadObj = {};
      try {
        payloadObj = JSON.parse(row.payload);
      } catch (e) {
        payloadObj = row.payload;
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
