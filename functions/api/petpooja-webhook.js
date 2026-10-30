/**
 * ============================================================================
 * CLOUDFLARE PAGES FUNCTION: PETPOOJA POS WEBHOOK HANDLER
 * ============================================================================
 * Endpoint: POST /api/petpooja-webhook
 * Receives Petpooja POS status callbacks & rider assignments, updating Cloudflare D1
 * in real-time to trigger instant customer, kitchen, and rider notifications.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json'
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify({ success: false, error: 'DB binding missing' }), {
      status: 500,
      headers: CORS_HEADERS
    });
  }

  try {
    const body = await request.json();
    console.log('Petpooja Webhook payload received:', body);

    const orderId = body.order_id || body.orderID || body.order_reference;
    const rawStatus = (body.status || body.order_status || '').toUpperCase().trim();
    const riderDetails = body.rider_details || body.rider || {};

    if (!orderId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing order_id in payload' }), {
        status: 400,
        headers: CORS_HEADERS
      });
    }

    let dbStatus = 'confirmed';
    if (rawStatus.includes('ACCEPT')) {
      dbStatus = 'confirmed';
    } else if (rawStatus.includes('COOK') || rawStatus.includes('PREPAR')) {
      dbStatus = 'preparing';
    } else if (rawStatus.includes('READY') || rawStatus.includes('FOOD')) {
      dbStatus = 'food_ready';
    } else if (rawStatus.includes('DISPATCH') || rawStatus.includes('OUT') || rawStatus.includes('RIDER')) {
      dbStatus = 'out_for_delivery';
    } else if (rawStatus.includes('DELIVER')) {
      dbStatus = 'delivered';
    } else if (rawStatus.includes('CANCEL')) {
      dbStatus = 'cancelled';
    }

    const nowIso = new Date().toISOString();
    let sql = 'UPDATE orders SET status = ?, updated_at = ?';
    const params = [dbStatus, nowIso];

    if (dbStatus === 'delivered') {
      sql += ', delivered_at = ?';
      params.push(nowIso);
    }

    const riderId = riderDetails.rider_id || riderDetails.id || null;
    const riderName = riderDetails.rider_name || riderDetails.name || null;
    const riderPhone = riderDetails.rider_phone || riderDetails.phone || null;

    if (riderName || riderId) {
      if (riderId) {
        sql += ', rider_id = ?';
        params.push(riderId);
      }
      if (riderName) {
        sql += ', rider_name = ?';
        params.push(riderName);
      }
      if (riderPhone) {
        sql += ', rider_phone = ?';
        params.push(riderPhone);
      }
      sql += ', rider_assigned_at = ?';
      params.push(nowIso);
      if (dbStatus !== 'delivered' && dbStatus !== 'cancelled') {
        sql += ', status = ?';
        params.push('out_for_delivery');
      }
    }

    sql += ' WHERE id = ?';
    params.push(orderId);

    await env.DB.prepare(sql).bind(...params).run();

    // Fetch updated order
    const updatedOrder = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();

    // Record real-time event
    if (updatedOrder) {
      try {
        await env.DB.prepare(
          `INSERT INTO app_events (table_name, event_type, record_id, payload, created_at) VALUES ('orders', 'UPDATE', ?, ?, ?)`
        ).bind(orderId, JSON.stringify(updatedOrder), nowIso).run();
      } catch (e) {}
    }

    // Update rider table if needed
    if (riderId) {
      await env.DB.prepare(
        'UPDATE delivery_partners SET status = ?, active_order_id = ?, updated_at = ? WHERE id = ?'
      ).bind('busy', orderId, nowIso, riderId).run();
    }

    return new Response(JSON.stringify({ success: true, order_id: orderId, status: dbStatus }), {
      headers: CORS_HEADERS
    });
  } catch (err) {
    console.error('Petpooja webhook error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || String(err) }), {
      status: 500,
      headers: CORS_HEADERS
    });
  }
}
