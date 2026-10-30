/**
 * ============================================================================
 * CLOUDFLARE PAGES FUNCTION: D1 DATABASE QUERY & MUTATION API
 * ============================================================================
 * Endpoint: POST /api/query
 * Replaces Supabase REST API with high-performance Cloudflare D1 SQL operations.
 */

const JSON_COLUMNS = {
  orders: ['items'],
  customers: ['default_address', 'saved_addresses', 'active_cart'],
  rider_settlements: ['order_ids']
};

const BOOLEAN_COLUMNS = {
  admin_users: ['is_active'],
  orders: ['settled_with_admin'],
  menu_items: ['is_veg', 'is_bestseller', 'is_available'],
  delivery_partners: ['is_active'],
  store_settings: ['is_store_open', 'auto_schedule_enabled']
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
  'Content-Type': 'application/json'
};

function isValidIdentifier(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9_]+$/.test(name);
}

function validateAndFormatColumns(columns) {
  if (!columns || columns === '*') return '*';
  const parts = columns.split(',').map(c => c.trim()).filter(Boolean);
  if (parts.length === 0) return '*';
  const safeParts = [];
  for (const part of parts) {
    if (/^count\(\s*\*\s*\)$/i.test(part)) {
      safeParts.push('COUNT(*)');
    } else if (isValidIdentifier(part)) {
      safeParts.push(`"${part}"`);
    } else {
      throw new Error(`Invalid or disallowed column expression: '${part}'`);
    }
  }
  return safeParts.join(', ');
}

function normalizeIncomingRow(table, row) {
  if (!row) return row;
  const normalized = { ...row };
  const jsonCols = JSON_COLUMNS[table] || [];
  const boolCols = BOOLEAN_COLUMNS[table] || [];

  for (const col of jsonCols) {
    if (normalized[col] !== undefined && typeof normalized[col] !== 'string') {
      normalized[col] = JSON.stringify(normalized[col]);
    }
  }

  for (const col of boolCols) {
    if (normalized[col] !== undefined) {
      normalized[col] = normalized[col] ? 1 : 0;
    }
  }

  return normalized;
}

function normalizeOutgoingRow(table, row, isAdmin = false) {
  if (!row) return row;
  const out = { ...row };
  const jsonCols = JSON_COLUMNS[table] || [];
  const boolCols = BOOLEAN_COLUMNS[table] || [];

  for (const col of jsonCols) {
    if (typeof out[col] === 'string') {
      try {
        out[col] = JSON.parse(out[col]);
      } catch (e) {}
    }
  }

  for (const col of boolCols) {
    if (out[col] !== undefined) {
      out[col] = Boolean(out[col]);
    }
  }

  // Defensively strip sensitive credentials from outgoing rows
  if (table === 'delivery_partners' && !isAdmin) {
    delete out.passcode;
  }
  if (table === 'admin_users') {
    delete out.password_hash;
  }

  return out;
}

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
      JSON.stringify({ data: null, error: { message: 'Cloudflare D1 DB binding is missing' } }),
      { status: 500, headers: CORS_HEADERS }
    );
  }

  try {
    const url = new URL(request.url);
    const table = url.searchParams.get('table');

    if (!table) {
      return new Response(
        JSON.stringify({ status: 'online', service: 'Breeze Cafe D1 Database Query API', timestamp: new Date().toISOString() }),
        { headers: CORS_HEADERS }
      );
    }

    const columns = url.searchParams.get('select') || '*';
    const limit = url.searchParams.get('limit');
    const offset = url.searchParams.get('offset');
    const orderParam = url.searchParams.get('order');

    const filters = [];
    url.searchParams.forEach((val, key) => {
      if (['table', 'select', 'limit', 'offset', 'order'].includes(key)) return;
      const dotIdx = val.indexOf('.');
      if (dotIdx !== -1) {
        const op = val.substring(0, dotIdx);
        const filterVal = val.substring(dotIdx + 1);
        filters.push({ col: key, op, val: filterVal });
      } else {
        filters.push({ col: key, op: 'eq', val });
      }
    });

    let order = null;
    if (orderParam) {
      const parts = orderParam.split('.');
      order = { col: parts[0], ascending: parts[1] !== 'desc' };
    }

    return handleQueryExecution({
      env,
      body: { action: 'select', table, columns, filters, order, limit, offset },
      request
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ data: null, error: { message: err.message || String(err) } }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return new Response(
      JSON.stringify({ data: null, error: { message: 'Cloudflare D1 DB binding is missing' } }),
      { status: 500, headers: CORS_HEADERS }
    );
  }

  try {
    const body = await request.json();
    return handleQueryExecution({ env, body, request });
  } catch (err) {
    console.error('API Error in /api/query:', err);
    return new Response(
      JSON.stringify({ data: null, error: { message: err.message || String(err) } }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

async function handleQueryExecution({ env, body, request }) {
  try {
    const { action, table, columns = '*', filters = [], order, orderBy, limit, offset, single, maybeSingle, data, onConflict } = body;

    if (!table) {
      return new Response(
        JSON.stringify({ data: null, error: { message: 'Table name is required' } }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const ALLOWED_TABLES = new Set([
      'orders',
      'menu_items',
      'delivery_partners',
      'customers',
      'table_reservations',
      'store_settings',
      'app_events',
      'rider_settlements',
      'admin_users'
    ]);

    const cleanTable = typeof table === 'string' ? table.trim().toLowerCase() : '';
    if (!cleanTable || !ALLOWED_TABLES.has(cleanTable)) {
      return new Response(
        JSON.stringify({ data: null, error: { message: `Access to table '${table}' is unauthorized or forbidden` } }),
        { status: 403, headers: CORS_HEADERS }
      );
    }

    // ------------------------------------------------------------------------
        // ------------------------------------------------------------------------
    // ROLE-BASED ACCESS CONTROL (RBAC) & AUTHORIZATION VERIFICATION
    // ------------------------------------------------------------------------
    const caller = await extractAndVerifyCaller(request, env);
    const callerRole = (caller && (caller.role || caller.type)) || 'public';
    const isAdmin = caller && ['admin', 'owner', 'manager', 'kitchen'].includes(callerRole);
    const isRider = caller && (callerRole === 'rider' || caller.type === 'rider');

    if (!isAdmin) {
      // A. admin_users is strictly admin-only
      if (cleanTable === 'admin_users') {
        return new Response(
          JSON.stringify({ data: null, error: { message: "Unauthorized access to admin_users" } }),
          { status: 403, headers: CORS_HEADERS }
        );
      }

      // B. rider_settlements, app_events: requires admin or rider
      if (['rider_settlements', 'app_events'].includes(cleanTable) && !isRider) {
        return new Response(
          JSON.stringify({ data: null, error: { message: `Unauthorized access to ${cleanTable}` } }),
          { status: 403, headers: CORS_HEADERS }
        );
      }

      // C. Mutations on store_settings, menu_items: Admin only
      if (['store_settings', 'menu_items'].includes(cleanTable) && action !== 'select') {
        return new Response(
          JSON.stringify({ data: null, error: { message: `Admin authorization required to modify ${cleanTable}` } }),
          { status: 403, headers: CORS_HEADERS }
        );
      }

      // D. delivery_partners mutations: Rider can only update own record; public cannot mutate
      if (cleanTable === 'delivery_partners') {
        if (action !== 'select') {
          if (!isRider) {
            return new Response(
              JSON.stringify({ data: null, error: { message: "Unauthorized mutation on delivery_partners" } }),
              { status: 403, headers: CORS_HEADERS }
            );
          }
        }
      }

      // E. orders protections for public:
      if (cleanTable === 'orders') {
        if (action === 'delete') {
          return new Response(
            JSON.stringify({ data: null, error: { message: "Unauthorized: Deleting orders requires admin access" } }),
            { status: 403, headers: CORS_HEADERS }
          );
        }

        if (action === 'select' && !isRider) {
          // Public order lookup MUST filter by id or customer_phone to prevent full database dumps
          const hasOrderOrPhoneFilter = filters.some(f => {
            const col = (f.col || f.column || '').toLowerCase();
            return col === 'id' || col === 'customer_phone' || col === 'phone';
          });
          if (!hasOrderOrPhoneFilter) {
            return new Response(
              JSON.stringify({ data: null, error: { message: "Public order lookup requires specific order ID or phone number filter" } }),
              { status: 403, headers: CORS_HEADERS }
            );
          }
        }

        if (action === 'update' && !isRider) {
          // Public update is ONLY permitted for customer cancellation request
          const updateKeys = data ? Object.keys(data) : [];
          const allowedPublicKeys = new Set(['cancellation_reason', 'updated_at', 'cancelled_by']);
          const hasDisallowedKey = updateKeys.some(k => !allowedPublicKeys.has(k));
          if (hasDisallowedKey) {
            return new Response(
              JSON.stringify({ data: null, error: { message: "Unauthorized: Modifying order status, totals, or rider assignment requires admin or rider authorization" } }),
              { status: 403, headers: CORS_HEADERS }
            );
          }
        }
      }

      // F. customers protections for public:
      if (cleanTable === 'customers') {
        if (action === 'delete') {
          return new Response(
            JSON.stringify({ data: null, error: { message: "Unauthorized: Deleting customers requires admin access" } }),
            { status: 403, headers: CORS_HEADERS }
          );
        }
        if (action === 'select') {
          const hasPhoneOrIdFilter = filters.some(f => {
            const col = (f.col || f.column || '').toLowerCase();
            return col === 'phone' || col === 'customer_phone' || col === 'id';
          });
          if (!hasPhoneOrIdFilter) {
            return new Response(
              JSON.stringify({ data: null, error: { message: "Public customer lookup requires phone or customer ID filter" } }),
              { status: 403, headers: CORS_HEADERS }
            );
          }
        }
      }

      // G. table_reservations: public can only insert
      if (cleanTable === 'table_reservations' && action !== 'insert') {
        return new Response(
          JSON.stringify({ data: null, error: { message: "Unauthorized: Table reservation management requires admin access" } }),
          { status: 403, headers: CORS_HEADERS }
        );
      }
    }

    // 1. SELECT ACTION
    // ------------------------------------------------------------------------
    if (action === 'select') {
      let safeCols = '*';
      try {
        safeCols = validateAndFormatColumns(columns);
      } catch (err) {
        return new Response(
          JSON.stringify({ data: null, error: { message: err.message } }),
          { status: 400, headers: CORS_HEADERS }
        );
      }
      let sql = `SELECT ${safeCols} FROM "${cleanTable}"`;
      const params = [];
      const whereClauses = [];

      for (const f of filters) {
        const col = f.col || f.column;
        const op = f.op || f.operator;
        const rawVal = f.val !== undefined ? f.val : (f.value !== undefined ? f.value : null);
        const val = rawVal === undefined ? null : rawVal;

        if (op === 'or' && typeof val === 'string') {
          const clauses = val.split(',').map(c => c.trim()).filter(Boolean);
          const orParts = [];
          for (const clause of clauses) {
            const firstDot = clause.indexOf('.');
            const secondDot = clause.indexOf('.', firstDot + 1);
            if (firstDot === -1 || secondDot === -1) continue;
            const cCol = clause.substring(0, firstDot);
            const cOp = clause.substring(firstDot + 1, secondDot);
            const cVal = clause.substring(secondDot + 1);

            if (cOp === 'eq') {
              if (cVal === 'null') {
                orParts.push(`"${cCol}" IS NULL`);
              } else if (['id', 'rider_id', 'status', 'customer_email', 'customer_phone', 'phone'].includes(cCol)) {
                orParts.push(`LOWER("${cCol}") = LOWER(?)`);
                params.push(cVal);
              } else {
                orParts.push(`"${cCol}" = ?`);
                params.push(cVal);
              }
            } else if (cOp === 'neq') {
              if (cVal === 'null') {
                orParts.push(`"${cCol}" IS NOT NULL`);
              } else {
                orParts.push(`"${cCol}" != ?`);
                params.push(cVal);
              }
            } else if (cOp === 'ilike') {
              orParts.push(`LOWER("${cCol}") LIKE LOWER(?)`);
              params.push(cVal);
            } else if (cOp === 'like') {
              orParts.push(`"${cCol}" LIKE ?`);
              params.push(cVal);
            }
          }
          if (orParts.length > 0) {
            whereClauses.push(`(${orParts.join(' OR ')})`);
          }
        } else if (op === 'eq') {
          if (val === null) {
            whereClauses.push(`"${col}" IS NULL`);
          } else if (['id', 'rider_id', 'status', 'customer_phone', 'customer_email', 'phone'].includes(col) && typeof val === 'string') {
            whereClauses.push(`LOWER("${col}") = LOWER(?)`);
            params.push(val);
          } else {
            whereClauses.push(`"${col}" = ?`);
            params.push(val);
          }
        } else if (op === 'neq') {
          if (val === null) {
            whereClauses.push(`"${col}" IS NOT NULL`);
          } else {
            whereClauses.push(`"${col}" != ?`);
            params.push(val);
          }
        } else if (op === 'ilike') {
          whereClauses.push(`LOWER("${col}") LIKE LOWER(?)`);
          params.push(val);
        } else if (op === 'like') {
          whereClauses.push(`"${col}" LIKE ?`);
          params.push(val);
        } else if (op === 'gt') {
          whereClauses.push(`"${col}" > ?`);
          params.push(val);
        } else if (op === 'gte') {
          whereClauses.push(`"${col}" >= ?`);
          params.push(val);
        } else if (op === 'lt') {
          whereClauses.push(`"${col}" < ?`);
          params.push(val);
        } else if (op === 'lte') {
          whereClauses.push(`"${col}" <= ?`);
          params.push(val);
        } else if (op === 'is') {
          whereClauses.push(`"${col}" IS ?`);
          params.push(val);
        } else if (op === 'in') {
          if (Array.isArray(val) && val.length > 0) {
            const placeholders = val.map(() => '?').join(',');
            whereClauses.push(`"${col}" IN (${placeholders})`);
            params.push(...val);
          } else {
            whereClauses.push('1 = 0');
          }
        }
      }

      if (whereClauses.length > 0) {
        sql += ` WHERE ${whereClauses.join(' AND ')}`;
      }

      const sort = order || orderBy;
      if (sort && (sort.col || sort.column)) {
        const sortCol = sort.col || sort.column;
        if (!isValidIdentifier(sortCol)) {
          return new Response(
            JSON.stringify({ data: null, error: { message: `Disallowed sort column identifier '${sortCol}'` } }),
            { status: 400, headers: CORS_HEADERS }
          );
        }
        const dir = sort.ascending === false ? 'DESC' : 'ASC';
        if (sortCol === 'delivered_at') {
          sql += ` ORDER BY COALESCE("delivered_at", "created_at") ${dir}`;
        } else {
          sql += ` ORDER BY "${sortCol}" ${dir}`;
        }
      }

      if (limit) {
        sql += ` LIMIT ${Number(limit)}`;
      }

      if (offset) {
        sql += ` OFFSET ${Number(offset)}`;
      }

      const stmt = env.DB.prepare(sql).bind(...params);
      const queryResult = await stmt.all();
      const rawRows = queryResult.results || [];
      const normalizedRows = rawRows.map(r => normalizeOutgoingRow(table, r, isAdmin));

      if (single || maybeSingle) {
        const item = normalizedRows.length > 0 ? normalizedRows[0] : null;
        if (single && !item) {
          return new Response(
            JSON.stringify({ data: null, error: { message: 'No rows returned for single()' } }),
            { status: 404, headers: CORS_HEADERS }
          );
        }
        return new Response(JSON.stringify({ data: item, error: null }), { headers: CORS_HEADERS });
      }

      return new Response(JSON.stringify({ data: normalizedRows, error: null }), { headers: CORS_HEADERS });
    }

    // ------------------------------------------------------------------------
    // 2. INSERT ACTION
    // ------------------------------------------------------------------------
    if (action === 'insert') {
      const records = Array.isArray(data) ? data : [data];
      if (records.length === 0) {
        return new Response(JSON.stringify({ data: [], error: null }), { headers: CORS_HEADERS });
      }

      const inserted = [];
      for (const rec of records) {
        const norm = normalizeIncomingRow(table, rec);
        const keys = Object.keys(norm);
        const placeholders = keys.map(() => '?').join(', ');
        const cols = keys.map(k => `"${k}"`).join(', ');
        const vals = keys.map(k => norm[k]);

        const sql = `INSERT INTO "${cleanTable}" (${cols}) VALUES (${placeholders})`;
        await env.DB.prepare(sql).bind(...vals).run();

        const rowId = norm.id;
        let finalRow = norm;
        if (rowId) {
          const fetchStmt = env.DB.prepare(`SELECT * FROM "${cleanTable}" WHERE id = ?`).bind(rowId);
          const found = await fetchStmt.first();
          if (found) finalRow = normalizeOutgoingRow(table, found, isAdmin);
        }
        inserted.push(finalRow);

        try {
          await env.DB.prepare(
            `INSERT INTO app_events (table_name, event_type, record_id, payload, created_at) VALUES (?, 'INSERT', ?, ?, ?)`
          ).bind(table, String(rowId || ''), JSON.stringify(finalRow), new Date().toISOString()).run();
        } catch (e) {
          console.warn('Event recording error:', e);
        }
      }

      if (single && inserted.length === 0) {
        return new Response(
          JSON.stringify({ data: null, error: { message: 'No rows returned for single()', code: 'PGRST116' } }),
          { status: 406, headers: CORS_HEADERS }
        );
      }
      const resData = (single || maybeSingle)
        ? (inserted.length > 0 ? inserted[0] : null)
        : (Array.isArray(data) ? inserted : inserted[0]);
      return new Response(JSON.stringify({ data: resData, error: null }), { headers: CORS_HEADERS });
    }

    // ------------------------------------------------------------------------
    // 3. UPDATE ACTION
    // ------------------------------------------------------------------------
    if (action === 'update') {
      const norm = normalizeIncomingRow(table, data);
      const keys = Object.keys(norm);
      if (keys.length === 0) {
        return new Response(JSON.stringify({ data: null, error: { message: 'No fields to update' } }), { headers: CORS_HEADERS });
      }

      const setClauses = keys.map(k => `"${k}" = ?`);
      const params = keys.map(k => norm[k]);
      const whereClauses = [];

      for (const f of filters) {
        const col = f.col || f.column;
        const op = f.op || f.operator;
        const rawVal = f.val !== undefined ? f.val : (f.value !== undefined ? f.value : null);
        const val = rawVal === undefined ? null : rawVal;

        if (op === 'eq' || op === 'ilike') {
          if (['id', 'rider_id', 'status', 'customer_phone', 'customer_email', 'phone'].includes(col) && typeof val === 'string') {
            whereClauses.push(`LOWER("${col}") = LOWER(?)`);
            params.push(val);
          } else {
            whereClauses.push(`"${col}" = ?`);
            params.push(val);
          }
        } else if (op === 'in') {
          if (Array.isArray(val) && val.length > 0) {
            const placeholders = val.map(() => '?').join(',');
            whereClauses.push(`"${col}" IN (${placeholders})`);
            params.push(...val);
          } else {
            whereClauses.push('1 = 0');
          }
        } else if (op === 'neq') {
          if (val === null) {
            whereClauses.push(`"${col}" IS NOT NULL`);
          } else {
            whereClauses.push(`"${col}" != ?`);
            params.push(val);
          }
        }
      }

      if (whereClauses.length === 0) {
        return new Response(
          JSON.stringify({ data: null, error: { message: 'Filter required for update' } }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const sql = `UPDATE "${cleanTable}" SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`;
      await env.DB.prepare(sql).bind(...params).run();

      let fetchSql = `SELECT * FROM "${cleanTable}" WHERE ${whereClauses.join(' AND ')}`;
      const fetchParams = params.slice(keys.length);
      const updatedRows = (await env.DB.prepare(fetchSql).bind(...fetchParams).all()).results || [];
      const normalizedUpdated = updatedRows.map(r => normalizeOutgoingRow(table, r, isAdmin));

      for (const r of normalizedUpdated) {
        try {
          await env.DB.prepare(
            `INSERT INTO app_events (table_name, event_type, record_id, payload, created_at) VALUES (?, 'UPDATE', ?, ?, ?)`
          ).bind(table, String(r.id || ''), JSON.stringify(r), new Date().toISOString()).run();
        } catch (e) {}
      }

      if (single && normalizedUpdated.length === 0) {
        return new Response(
          JSON.stringify({ data: null, error: { message: 'No rows returned for single()', code: 'PGRST116' } }),
          { status: 406, headers: CORS_HEADERS }
        );
      }
      const resData = (single || maybeSingle)
        ? (normalizedUpdated.length > 0 ? normalizedUpdated[0] : null)
        : normalizedUpdated;
      return new Response(JSON.stringify({ data: resData, error: null }), { headers: CORS_HEADERS });
    }

    // ------------------------------------------------------------------------
    // 4. UPSERT ACTION (Smart Native INSERT vs UPDATE Event Dispatch)
    // ------------------------------------------------------------------------
    if (action === 'upsert') {
      const records = Array.isArray(data) ? data : [data];
      const upserted = [];

      for (const rec of records) {
        const norm = normalizeIncomingRow(table, rec);
        const keys = Object.keys(norm);
        const placeholders = keys.map(() => '?').join(', ');
        const cols = keys.map(k => `"${k}"`).join(', ');
        const vals = keys.map(k => norm[k]);

        const conflictTarget = onConflict || 'id';
        const rowId = norm[conflictTarget] || norm.id;

        // Determine if row existed prior to this upsert
        let existed = false;
        if (rowId) {
          try {
            const existingRow = await env.DB.prepare(
              `SELECT "${conflictTarget}" FROM "${cleanTable}" WHERE "${conflictTarget}" = ?`
            ).bind(rowId).first();
            if (existingRow) existed = true;
          } catch (e) {}
        }

        const updateClauses = keys
          .filter(k => k !== conflictTarget)
          .map(k => `"${k}" = excluded."${k}"`)
          .join(', ');

        const sql = `INSERT INTO "${cleanTable}" (${cols}) VALUES (${placeholders})
                     ON CONFLICT("${conflictTarget}") DO UPDATE SET ${updateClauses}`;

        await env.DB.prepare(sql).bind(...vals).run();

        let finalRow = norm;
        if (rowId) {
          const fetchStmt = env.DB.prepare(`SELECT * FROM "${cleanTable}" WHERE "${conflictTarget}" = ?`).bind(rowId);
          const found = await fetchStmt.first();
          if (found) finalRow = normalizeOutgoingRow(table, found, isAdmin);
        }
        upserted.push(finalRow);

        // Crucial: emit 'INSERT' for new rows so kitchen & admin chimes fire immediately!
        const eventType = existed ? 'UPDATE' : 'INSERT';

        try {
          await env.DB.prepare(
            `INSERT INTO app_events (table_name, event_type, record_id, payload, created_at) VALUES (?, ?, ?, ?, ?)`
          ).bind(table, eventType, String(rowId || ''), JSON.stringify(finalRow), new Date().toISOString()).run();
        } catch (e) {}
      }

      const resData = Array.isArray(data) ? upserted : upserted[0];
      return new Response(JSON.stringify({ data: resData, error: null }), { headers: CORS_HEADERS });
    }

    // ------------------------------------------------------------------------
    // 5. DELETE ACTION
    // ------------------------------------------------------------------------
    if (action === 'delete') {
      const whereClauses = [];
      const params = [];

      for (const f of filters) {
        const col = f.col || f.column;
        const op = f.op || f.operator;
        const rawVal = f.val !== undefined ? f.val : (f.value !== undefined ? f.value : null);
        const val = rawVal === undefined ? null : rawVal;

        if (op === 'eq' || op === 'ilike') {
          if (['id', 'rider_id', 'status', 'customer_phone', 'customer_email', 'phone'].includes(col) && typeof val === 'string') {
            whereClauses.push(`LOWER("${col}") = LOWER(?)`);
            params.push(val);
          } else {
            whereClauses.push(`"${col}" = ?`);
            params.push(val);
          }
        } else if (op === 'in') {
          if (Array.isArray(val) && val.length > 0) {
            const placeholders = val.map(() => '?').join(',');
            whereClauses.push(`"${col}" IN (${placeholders})`);
            params.push(...val);
          } else {
            whereClauses.push('1 = 0');
          }
        } else if (op === 'neq') {
          if (val === null) {
            whereClauses.push(`"${col}" IS NOT NULL`);
          } else {
            whereClauses.push(`"${col}" != ?`);
            params.push(val);
          }
        }
      }

      if (whereClauses.length === 0) {
        return new Response(
          JSON.stringify({ data: null, error: { message: 'Filter required for delete' } }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const idsBefore = (await env.DB.prepare(`SELECT id FROM "${cleanTable}" WHERE ${whereClauses.join(' AND ')}`).bind(...params).all()).results || [];

      const sql = `DELETE FROM "${cleanTable}" WHERE ${whereClauses.join(' AND ')}`;
      await env.DB.prepare(sql).bind(...params).run();

      for (const item of idsBefore) {
        try {
          await env.DB.prepare(
            `INSERT INTO app_events (table_name, event_type, record_id, payload, created_at) VALUES (?, 'DELETE', ?, '{}', ?)`
          ).bind(table, String(item.id), new Date().toISOString()).run();
        } catch (e) {}
      }

      return new Response(JSON.stringify({ data: null, error: null }), { headers: CORS_HEADERS });
    }

    return new Response(
      JSON.stringify({ data: null, error: { message: `Unknown action: ${action}` } }),
      { status: 400, headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error('API Error in /api/query:', err);
    return new Response(
      JSON.stringify({ data: null, error: { message: err.message || String(err) } }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
