/**
 * ============================================================================
 * CLOUDFLARE D1 + PAGES FUNCTIONS CLIENT ADAPTER
 * ============================================================================
 * Seamless 100% drop-in replacement for @supabase/supabase-js in Breeze 2.
 * Connects directly to Cloudflare Pages Functions (/api/query and /api/events).
 */

(function () {
  'use strict';

  function getApiBaseUrl() {
    if (typeof window !== 'undefined' && window.BREEZE_CONFIG && window.BREEZE_CONFIG.API_BASE_URL) {
      return window.BREEZE_CONFIG.API_BASE_URL.replace(/\/$/, '');
    }
    return '';
  }

  function rowMatchesFilter(row, filterString) {
    if (!filterString) return true;
    if (!row) return false;

    const trimmed = String(filterString).trim();

    // e.g. "or(customer_phone=eq.9890332798,customer_phone=eq.+919890332798)" or comma-separated
    if (trimmed.startsWith('or(') && trimmed.endsWith(')')) {
      const inner = trimmed.slice(3, -1);
      const parts = inner.split(',').map(s => s.trim()).filter(Boolean);
      return parts.some(part => {
        let norm = part;
        const firstDot = part.indexOf('.');
        if (firstDot !== -1 && !part.includes('=')) {
          norm = part.substring(0, firstDot) + '=' + part.substring(firstDot + 1);
        }
        return rowMatchesFilter(row, norm);
      });
    }

    // e.g. "rider_id=eq.RAJESH" or "rider_id.eq.RAJESH"
    const eqIdx = trimmed.indexOf('=eq.');
    if (eqIdx !== -1) {
      const col = trimmed.slice(0, eqIdx).trim();
      const expectedVal = trimmed.slice(eqIdx + 4).trim();
      const actualVal = row[col];
      if (actualVal === null || actualVal === undefined) return false;
      return String(actualVal).trim().toLowerCase() === expectedVal.trim().toLowerCase();
    }

    const dotEqIdx = trimmed.indexOf('.eq.');
    if (dotEqIdx !== -1) {
      const col = trimmed.slice(0, dotEqIdx).trim();
      const expectedVal = trimmed.slice(dotEqIdx + 4).trim();
      const actualVal = row[col];
      if (actualVal === null || actualVal === undefined) return false;
      return String(actualVal).trim().toLowerCase() === expectedVal.trim().toLowerCase();
    }

    // e.g. "status=neq.cancelled"
    const neqIdx = trimmed.indexOf('=neq.');
    if (neqIdx !== -1) {
      const col = trimmed.slice(0, neqIdx).trim();
      const expectedVal = trimmed.slice(neqIdx + 5).trim();
      const actualVal = row[col];
      if (actualVal === null || actualVal === undefined) return true;
      return String(actualVal).trim().toLowerCase() !== expectedVal.trim().toLowerCase();
    }

    // e.g. "id=in.(1,2,3)"
    const inIdx = trimmed.indexOf('=in.(');
    if (inIdx !== -1) {
      const col = trimmed.slice(0, inIdx).trim();
      const expectedList = trimmed.slice(inIdx + 5, -1).split(',').map(s => s.trim().toLowerCase());
      const actualVal = row[col];
      if (actualVal === null || actualVal === undefined) return false;
      return expectedList.includes(String(actualVal).trim().toLowerCase());
    }

    return true;
  }

  // Global Realtime Dispatcher
  const realtimeRegistry = {
    channels: new Map(),
    activePoller: null,
    lastEventId: 0,
    pollingIntervalMs: 1000,
    isPolling: false,

    register(channel) {
      this.channels.set(channel.name, channel);
      this.startPoller();
    },

    unregister(channelName) {
      this.channels.delete(channelName);
      if (this.channels.size === 0) {
        this.stopPoller();
      }
    },

    startPoller() {
      if (this.activePoller) return;
      this.fetchLatestId().then(() => {
        if (!this.activePoller && this.channels.size > 0) {
          this.activePoller = setInterval(() => this.pollEvents(), this.pollingIntervalMs);
        }
      });
    },

    stopPoller() {
      if (this.activePoller) {
        clearInterval(this.activePoller);
        this.activePoller = null;
      }
    },

    async fetchLatestId() {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/events?since=0`);
        if (res.ok) {
          const json = await res.json();
          this.lastEventId = json.lastId || 0;
        }
      } catch (e) {}
    },

    async pollEvents() {
      if (this.channels.size === 0 || this.isPolling) return;
      this.isPolling = true;
      try {
        const eventHeaders = {};
        const authToken = (typeof window !== 'undefined') && (
          window.BREEZE_AUTH_TOKEN ||
          window.BREEZE_RIDER_TOKEN ||
          sessionStorage.getItem('breeze_admin_token') ||
          localStorage.getItem('breeze_admin_token') ||
          localStorage.getItem('breeze_rider_token') ||
          sessionStorage.getItem('breeze_rider_token')
        );
        if (authToken) eventHeaders['Authorization'] = `Bearer ${authToken}`;

        const res = await fetch(`${getApiBaseUrl()}/api/events?since=${this.lastEventId}`, {
          headers: eventHeaders,
          credentials: 'include'
        });
        if (!res.ok) return;
        const data = await res.json();
        const events = data.events || [];
        if (data.lastId) {
          this.lastEventId = Math.max(this.lastEventId, data.lastId);
        }

        for (const evt of events) {
          this.dispatch(evt);
        }
      } catch (e) {
        // Network retry silently
      } finally {
        this.isPolling = false;
      }
    },

    dispatch(event) {
      // Snapshot entries to prevent infinite loop if a callback mutates this.channels
      const channelEntries = Array.from(this.channels.entries());
      for (const [name, channel] of channelEntries) {
        // If channel was unregistered during dispatch, skip it
        if (!this.channels.has(name) || !channel.isSubscribed) continue;

        const listenersSnapshot = Array.from(channel.listeners);
        for (const listener of listenersSnapshot) {
          // Table filter
          if (listener.table && listener.table !== event.table) {
            continue;
          }

          // Event type filter ('*' or 'INSERT' or 'UPDATE' or 'DELETE')
          if (listener.eventFilter && listener.eventFilter !== '*') {
            const evMatch = listener.eventFilter.toUpperCase() === event.eventType.toUpperCase();
            if (!evMatch) continue;
          }

          // Column attribute filter (e.g. rider_id=eq.RAJESH)
          if (listener.rawFilter) {
            const targetRow = event.new || event.old;
            if (!rowMatchesFilter(targetRow, listener.rawFilter)) {
              continue; // Do NOT dispatch to this listener!
            }
          }

          try {
            listener.callback({
              eventType: event.eventType,
              new: event.new,
              old: event.old,
              table: event.table,
              commit_timestamp: event.created_at
            });
          } catch (err) {
            console.error('[Realtime Dispatch Error]', err);
          }
        }
      }
    }
  };

  class RealtimeChannel {
    constructor(name) {
      this.name = name;
      this.listeners = [];
      this.isSubscribed = false;
    }

    on(type, filter, callback) {
      const table = (filter && filter.table) || null;
      const eventFilter = (filter && filter.event) || '*';
      const rawFilter = (filter && filter.filter) || null;
      this.listeners.push({ type, table, eventFilter, rawFilter, callback });
      return this;
    }

    subscribe(callback) {
      this.isSubscribed = true;
      realtimeRegistry.register(this);
      if (typeof callback === 'function') {
        setTimeout(() => callback('SUBSCRIBED'), 50);
      }
      return this;
    }

    unsubscribe() {
      this.isSubscribed = false;
      realtimeRegistry.unregister(this.name);
      return this;
    }
  }

  class QueryBuilder {
    constructor(table) {
      this.table = table;
      this.action = null; // Defaults to 'select' in execute() unless set to insert/update/upsert/delete
      this.columns = '*';
      this.filters = [];
      this.orderClause = null;
      this.limitVal = null;
      this.offsetVal = null;
      this.isSingle = false;
      this.isMaybeSingle = false;
      this.payloadData = null;
      this.conflictTarget = null;
    }

    select(columns = '*') {
      // In Supabase, chaining .select() after .insert() / .update() / .upsert()
      // specifies returning representation and must NOT overwrite the mutation action!
      if (!this.action || this.action === 'select') {
        this.action = 'select';
      }
      this.columns = columns;
      return this;
    }

    insert(data) {
      this.action = 'insert';
      this.payloadData = data;
      return this;
    }

    update(data) {
      this.action = 'update';
      this.payloadData = data;
      return this;
    }

    upsert(data, options = {}) {
      this.action = 'upsert';
      this.payloadData = data;
      if (options && options.onConflict) {
        this.conflictTarget = options.onConflict;
      }
      return this;
    }

    delete() {
      this.action = 'delete';
      return this;
    }

    or(orString) {
      if (typeof orString === 'string' && orString.trim()) {
        this.filters.push({ op: 'or', val: orString.trim() });
      }
      return this;
    }

    eq(col, val) {
      this.filters.push({ col, op: 'eq', val });
      return this;
    }

    neq(col, val) {
      this.filters.push({ col, op: 'neq', val });
      return this;
    }

    ilike(col, val) {
      this.filters.push({ col, op: 'ilike', val });
      return this;
    }

    like(col, val) {
      this.filters.push({ col, op: 'like', val });
      return this;
    }

    gt(col, val) {
      this.filters.push({ col, op: 'gt', val });
      return this;
    }

    gte(col, val) {
      this.filters.push({ col, op: 'gte', val });
      return this;
    }

    lt(col, val) {
      this.filters.push({ col, op: 'lt', val });
      return this;
    }

    lte(col, val) {
      this.filters.push({ col, op: 'lte', val });
      return this;
    }

    is(col, val) {
      this.filters.push({ col, op: 'is', val });
      return this;
    }

    in(col, val) {
      this.filters.push({ col, op: 'in', val });
      return this;
    }

    order(col, options = {}) {
      this.orderClause = {
        col,
        ascending: options.ascending !== false
      };
      return this;
    }

    limit(n) {
      this.limitVal = n;
      return this;
    }

    range(from, to) {
      this.offsetVal = from;
      this.limitVal = to - from + 1;
      return this;
    }

    single() {
      this.isSingle = true;
      return this;
    }

    maybeSingle() {
      this.isMaybeSingle = true;
      return this;
    }

    async execute() {
      const finalAction = this.action || 'select';
      const body = {
        action: finalAction,
        table: this.table,
        columns: this.columns,
        filters: this.filters,
        order: this.orderClause,
        limit: this.limitVal,
        offset: this.offsetVal,
        single: this.isSingle,
        maybeSingle: this.isMaybeSingle,
        data: this.payloadData,
        onConflict: this.conflictTarget
      };

      try {
        const headers = {
          'Content-Type': 'application/json'
        };

        const authToken = (typeof window !== 'undefined') && (
          window.BREEZE_AUTH_TOKEN ||
          window.BREEZE_RIDER_TOKEN ||
          sessionStorage.getItem('breeze_admin_token') ||
          localStorage.getItem('breeze_admin_token') ||
          localStorage.getItem('breeze_rider_token') ||
          sessionStorage.getItem('breeze_rider_token')
        );
        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`;
        }

        const res = await fetch(`${getApiBaseUrl()}/api/query`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(body)
        });

        const json = await res.json();
        let retData = json.data !== undefined ? json.data : null;
        let retError = json.error || null;

        if (this.isSingle) {
          if (Array.isArray(retData)) {
            if (retData.length === 0) {
              retData = null;
              retError = retError || { message: 'No rows returned for single()', code: 'PGRST116' };
            } else {
              retData = retData[0];
            }
          } else if (retData === null && !retError) {
            retError = { message: 'No rows returned for single()', code: 'PGRST116' };
          }
        } else if (this.isMaybeSingle && Array.isArray(retData)) {
          retData = retData.length > 0 ? retData[0] : null;
        }

        return {
          data: retData,
          error: retError
        };
      } catch (err) {
        return {
          data: null,
          error: { message: err.message || String(err) }
        };
      }
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }
  }

  class CloudflareClient {
    constructor(url, key) {
      this.url = url;
      this.key = key;

      this.auth = {
        getUser: async () => {
          let user = null;
          try {
            const raw = localStorage.getItem('breeze_customer_profile');
            if (raw) user = JSON.parse(raw);
          } catch (e) {}
          return { data: { user }, error: null };
        },
        getSession: async () => {
          return { data: { session: null }, error: null };
        },
        signOut: async () => {
          try {
            localStorage.removeItem('breeze_customer_profile');
            localStorage.removeItem('breeze_admin_session');
          } catch (e) {}
          return { error: null };
        },
        onAuthStateChange: (cb) => {
          return { data: { subscription: { unsubscribe: () => {} } } };
        }
      };
    }

    from(table) {
      return new QueryBuilder(table);
    }

    channel(name) {
      return new RealtimeChannel(name);
    }
  }

  window.createCloudflareClient = (url, key) => new CloudflareClient(url, key);

  window.supabase = {
    createClient: (url, key) => new CloudflareClient(url, key)
  };

  console.log('✓ Cloudflare D1 client adapter with Realtime Filter matching initialized');
})();
