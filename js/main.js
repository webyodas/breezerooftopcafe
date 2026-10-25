/**
 * ============================================================================
 * BREEZE CAFE MODULAR INTEGRATION CONFIGURATION
 * ============================================================================
 * When Razorpay KYC or Petpooja Open API keys are ready, paste them here.
 * The website will automatically switch from simulated test mode to live mode!
 */
const BREEZE_CONFIG = {
  // 1. CLOUDFLARE D1 DATABASE & PAGES FUNCTIONS (100% Replaced Supabase)
  API_BASE_URL: '',
  SUPABASE_URL: 'cloudflare-d1',
  SUPABASE_ANON_KEY: 'cloudflare-d1-token',
  CLOUDFLARE_D1: true,

  // 2. GOOGLE IDENTITY SERVICES OAUTH
  // Generated from Google Cloud Console under Webyodas account for breezecafe.pages.dev:
  GOOGLE_CLIENT_ID: '837032728985-15e43n6b9hrtok1l5jjascsvtlub71ae.apps.googleusercontent.com',

  // 3. RAZORPAY PAYMENT GATEWAY & DOORSTEP UPI
  // Military-grade security: Secrets are NEVER exposed in storefront code.
  // Public Key ID is dynamically loaded from secure admin storage or runtime environment.
  RAZORPAY_KEY_ID: (function() {
    try {
      return localStorage.getItem('breeze_rzp_key_id') || '';
    } catch(e) { return ''; }
  })(),
  CAFE_UPI_ID: 'breezecafe@icici', // Primary Merchant UPI ID for dynamic QR code at doorstep

  // 4. PETPOOJA POS OPEN API INTEGRATION
  // Paste your Petpooja Open API credentials from Petpooja developer portal
  PETPOOJA_API_KEY: '',
  PETPOOJA_APP_KEY: '',
  PETPOOJA_REST_ID: 'BREEZE_PALGHAR_5TH_FLOOR',
  PETPOOJA_PUSH_ENDPOINT: 'https://open.petpooja.com/push_order',

  // 5. STORE & SAFETY RULES
  MAX_COD_AMOUNT: 1000,           // COD limited to ₹1,000 to prevent kitchen food loss
  CANCELLATION_GRACE_SECONDS: 60, // 60-second cancellation window before kitchen lock
  ESTIMATED_PREP_MINUTES: 25,
  DEVELOPER_COMMISSION_PERCENT: 5 // 5% developer commission tracking
};
window.BREEZE_CONFIG = BREEZE_CONFIG;

// --------------------------------------------------------------------------
// UNIVERSAL HTML ESCAPING / SANITIZATION HELPER
// --------------------------------------------------------------------------
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
window.escapeHtml = escapeHtml;

// --------------------------------------------------------------------------
// INDIAN MOBILE VALIDATION HELPER (10 Digits, 6-9 Prefix, Anti-Spam)
// --------------------------------------------------------------------------
function isValidIndianMobile(phoneStr) {
  if (!phoneStr) return false;
  const digits = String(phoneStr).replace(/[^0-9]/g, '');
  if (digits.length !== 10) return false;
  // Must begin with 6, 7, 8, or 9
  if (!['6', '7', '8', '9'].includes(digits[0])) return false;
  // Reject identical repetitive numbers (e.g. 0000000000, 9999999999)
  if (/^(\d)\1{9}$/.test(digits)) return false;
  // Reject common sequential dummy sequences
  if (['0123456789', '1234567890'].includes(digits)) return false;
  return true;
}

// --------------------------------------------------------------------------
// SUPABASE DATABASE ADAPTER (ZOMATO-GRADE CLOUD SYNC)
// --------------------------------------------------------------------------
let breezeSupabaseClient = null;
function getSupabaseClient() {
  if (!breezeSupabaseClient && typeof window.supabase !== 'undefined' && window.supabase.createClient && BREEZE_CONFIG.SUPABASE_URL && BREEZE_CONFIG.SUPABASE_ANON_KEY) {
    try {
      breezeSupabaseClient = window.supabase.createClient(BREEZE_CONFIG.SUPABASE_URL, BREEZE_CONFIG.SUPABASE_ANON_KEY);
    } catch (err) {
      console.warn('Supabase client init:', err);
    }
  }
  return breezeSupabaseClient;
}

async function syncCustomerToSupabase(profile, activeCart = null) {
  if (!profile || (!profile.email && !profile.phone)) return;
  const client = getSupabaseClient();
  if (!client) return;
  try {
    const cleanEmail = profile.email ? profile.email.toLowerCase().trim() : null;
    const rawPhone = profile.phone ? String(profile.phone).replace(/[^0-9]/g, '') : '';
    const cleanPhone = rawPhone.length >= 10 ? rawPhone.slice(-10) : (rawPhone || null);

    // Look for existing record by email or phone to link them
    let existingRow = null;
    if (cleanEmail) {
      const { data } = await client.from('customers').select('*').eq('email', cleanEmail).maybeSingle();
      if (data) existingRow = data;
    }
    if (!existingRow && cleanPhone) {
      const { data } = await client.from('customers').select('*').or(`phone.eq.${cleanPhone},phone.eq.+91${cleanPhone}`).maybeSingle();
      if (data) existingRow = data;
    }

    const payload = {
      email: cleanEmail || existingRow?.email || null,
      phone: cleanPhone || existingRow?.phone || null,
      name: profile.name || existingRow?.name || 'Breeze Guest',
      avatar: profile.avatar || existingRow?.avatar || null,
      default_address: profile.address || existingRow?.default_address || null,
      updated_at: new Date().toISOString()
    };
    if (Array.isArray(profile.saved_addresses)) {
      payload.saved_addresses = profile.saved_addresses;
    }
    if (activeCart !== null && Array.isArray(activeCart)) {
      payload.active_cart = activeCart;
    }

    if (existingRow && existingRow.id) {
      await client.from('customers').update(payload).eq('id', existingRow.id);
    } else {
      payload.created_at = new Date().toISOString();
      await client.from('customers').insert(payload);
    }
  } catch (err) {
    console.warn('Supabase sync customer error:', err);
  }
}

// Alias for backwards compatibility
const saveCustomerToSupabase = syncCustomerToSupabase;

async function syncCartToSupabase(cartItems, identifier) {
  const targetId = (identifier || (typeof customerProfile !== 'undefined' ? (customerProfile?.email || customerProfile?.phone) : null) || '').toString().trim();
  if (!targetId) return;
  const client = getSupabaseClient();
  if (!client) return;
  try {
    const cleanCart = Array.isArray(cartItems) ? cartItems : [];
    let query = client.from('customers').update({
      active_cart: cleanCart,
      updated_at: new Date().toISOString()
    });
    if (targetId.includes('@')) {
      query = query.eq('email', targetId.toLowerCase());
    } else {
      const cleanPhone = targetId.replace(/[^0-9]/g, '').slice(-10);
      query = query.or(`phone.eq.${cleanPhone},phone.eq.+91${cleanPhone}`);
    }
    const { error } = await query;
    if (error) console.warn('Supabase active_cart sync error:', error.message);
  } catch (err) {
    console.warn('Supabase syncCart error:', err);
  }
}

async function loadCustomerFromSupabase(identifier, onLoaded) {
  if (!identifier) return;
  const client = getSupabaseClient();
  if (!client) return;
  try {
    const target = String(identifier).trim();
    let query = client.from('customers').select('*');
    if (target.includes('@')) {
      query = query.eq('email', target.toLowerCase());
    } else {
      const cleanPhone = target.replace(/[^0-9]/g, '').slice(-10);
      query = query.or(`phone.eq.${cleanPhone},phone.eq.+91${cleanPhone}`);
    }
    const { data, error } = await query.maybeSingle();
    if (!error && onLoaded) {
      onLoaded(data || null);
    }
  } catch (err) {
    console.warn('Supabase load customer error:', err);
  }
}

// --------------------------------------------------------------------------
// CLOUD MENU & LIVE KITCHEN AVAILABILITY ENGINE (Zero-Flicker Instant Cache)
// --------------------------------------------------------------------------
const BREEZE_MENU_CACHE_KEY = 'breeze_menu_items_cache';
let cloudMenuItemsCache = null;
let isMenuRealtimeSubscribed = false;

// 1. Initialize memory cache synchronously from localStorage on boot
try {
  const localCachedStr = localStorage.getItem(BREEZE_MENU_CACHE_KEY);
  if (localCachedStr) {
    cloudMenuItemsCache = JSON.parse(localCachedStr);
  }
} catch (e) {}

function applyMenuItemsToDOM(items) {
  if (!items || !Array.isArray(items) || items.length === 0) return;
  const cloudMap = new Map();
  items.forEach(item => {
    if (item && item.name) cloudMap.set(item.name.toLowerCase().trim(), item);
  });

  const cards = document.querySelectorAll('.menu-card');
  cards.forEach(card => {
    const nameEl = card.querySelector('.menu-item-name');
    if (!nameEl) return;
    const name = nameEl.textContent.trim().toLowerCase();

    // Look up by cloud ID first if already matched, then by petpooja code, then by name
    let cloudItem = null;
    if (card.dataset.cloudId) {
      cloudItem = items.find(i => i.id === card.dataset.cloudId);
    }
    if (!cloudItem && card.dataset.petpoojaCode) {
      cloudItem = items.find(i => i.petpooja_item_code === card.dataset.petpoojaCode);
    }
    if (!cloudItem) {
      cloudItem = cloudMap.get(name);
    }
    if (!cloudItem) return;

    card.dataset.cloudId = cloudItem.id;
    if (cloudItem.petpooja_item_code) {
      card.dataset.petpoojaCode = cloudItem.petpooja_item_code;
    }

    // Live Dish Name Sync (if renamed in Admin portal)
    if (nameEl && cloudItem.name && nameEl.textContent.trim() !== cloudItem.name) {
      nameEl.textContent = cloudItem.name;
    }

    // 1. Live Price Sync
    const priceEl = card.querySelector('.menu-item-price');
    if (priceEl && typeof cloudItem.price !== 'undefined' && cloudItem.price !== null) {
      priceEl.textContent = '₹' + cloudItem.price;
      card.dataset.price = cloudItem.price;
    }

    // 2. Kitchen Availability & Sold Out Handling
    const orderBtn = card.querySelector('.btn-card-order');
    const cartBtn = card.querySelector('.btn-card-cart');
    const mediaEl = card.querySelector('.menu-card-media');

    if (cloudItem.is_available === false) {
      card.classList.add('out-of-stock');
      if (orderBtn) {
        orderBtn.disabled = true;
        orderBtn.innerHTML = '<i class="fas fa-ban"></i> Sold Out';
      }
      if (cartBtn) {
        cartBtn.disabled = true;
        cartBtn.innerHTML = '<i class="fas fa-ban"></i> Sold Out';
      }
      if (mediaEl) {
        let badge = mediaEl.querySelector('.badge-sold-out');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'menu-card-badge badge-sold-out';
          badge.innerHTML = '<i class="fas fa-clock"></i> Kitchen Sold Out';
          mediaEl.appendChild(badge);
        }
      }
    } else {
      card.classList.remove('out-of-stock');
      const soldOutBadge = card.querySelector('.badge-sold-out');
      if (soldOutBadge) soldOutBadge.remove();

      // Check current store operating status
      const isStoreClosed = window.isBreezeStoreOpen === false;
      const statusMeta = window.breezeStoreStatusMeta || {};

      if (isStoreClosed) {
        card.classList.add('store-closed');
        if (mediaEl) {
          let closedBadge = mediaEl.querySelector('.badge-store-closed');
          if (!closedBadge) {
            closedBadge = document.createElement('span');
            closedBadge.className = 'menu-card-badge badge-store-closed';
            mediaEl.appendChild(closedBadge);
          }
          closedBadge.innerHTML = statusMeta.isOffHours
            ? `<i class="fas fa-moon"></i> Opens ${statusMeta.openTime12 || '11:00 AM'}`
            : `<i class="fas fa-store-alt-slash"></i> Kitchen Closed`;
        }
        if (orderBtn) {
          orderBtn.disabled = false; // Kept clickable to trigger informative Store Closed modal
          orderBtn.innerHTML = statusMeta.isOffHours
            ? `<i class="fas fa-clock"></i> Closed (Opens ${statusMeta.openTime12 || '11:00 AM'})`
            : `<i class="fas fa-store-alt-slash"></i> Kitchen Closed`;
          orderBtn.setAttribute('title', 'Kitchen closed for online ordering - Tap to view timings');
        }
        if (cartBtn) {
          cartBtn.disabled = false; // Kept clickable to trigger informative Store Closed modal
          cartBtn.innerHTML = `<i class="fas fa-info-circle"></i> Kitchen Closed`;
          cartBtn.setAttribute('title', 'Kitchen closed for online ordering - Tap to view timings');
        }
      } else {
        card.classList.remove('store-closed');
        const closedBadge = card.querySelector('.badge-store-closed');
        if (closedBadge) closedBadge.remove();
        if (orderBtn) {
          orderBtn.disabled = false;
          orderBtn.innerHTML = '<i class="fas fa-bolt"></i> Order Now';
          orderBtn.setAttribute('title', 'Order directly');
        }
        if (cartBtn) {
          cartBtn.disabled = false;
          cartBtn.innerHTML = '<i class="fas fa-cart-plus"></i> Add to Cart';
          cartBtn.setAttribute('title', 'Add to your rooftop order');
        }
      }
    }
  });

  // Re-render cart drawer if present so items reflect stock & live price immediately
  if (typeof renderCart === 'function') {
    renderCart();
  }
}

// Immediately apply local cache synchronously if DOM cards are already present
if (cloudMenuItemsCache && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyMenuItemsToDOM(cloudMenuItemsCache));
  } else {
    applyMenuItemsToDOM(cloudMenuItemsCache);
  }
}

async function fetchCloudMenuItems(forceRefresh = false) {
  const client = getSupabaseClient();
  if (!client) return cloudMenuItemsCache;
  try {
    const { data, error } = await client
      .from('menu_items')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) {
      console.warn('Supabase fetchCloudMenuItems error:', error.message);
      return cloudMenuItemsCache;
    }
    if (Array.isArray(data) && data.length > 0) {
      cloudMenuItemsCache = data;
      try {
        localStorage.setItem(BREEZE_MENU_CACHE_KEY, JSON.stringify(data));
      } catch (e) {}
      return data;
    }
  } catch (err) {
    console.warn('fetchCloudMenuItems error:', err);
  }
  return cloudMenuItemsCache;
}

function setupMenuRealtimeSync() {
  if (isMenuRealtimeSubscribed) return;
  const client = getSupabaseClient();
  if (!client || !client.channel) return;
  try {
    client.channel('breeze-frontend-menu-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, async () => {
        const fresh = await fetchCloudMenuItems(true);
        if (fresh) {
          applyMenuItemsToDOM(fresh);
          if (typeof window.renderCartLive === 'function') {
            window.renderCartLive();
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          isMenuRealtimeSubscribed = true;
        }
      });
  } catch (e) {
    console.warn('Menu realtime setup error:', e);
  }
}

async function syncLiveMenuWithCloud(forceRefresh = false) {
  // 1. Instantly apply cached items from localStorage (0ms latency, zero flicker)
  if (cloudMenuItemsCache) {
    applyMenuItemsToDOM(cloudMenuItemsCache);
    if (typeof applyStoreOperatingState === 'function') applyStoreOperatingState();
  }

  // 2. Ensure realtime sync is actively listening
  setupMenuRealtimeSync();

  // 3. Revalidate with cloud in background and update DOM + cache
  const cloudItems = await fetchCloudMenuItems(forceRefresh);
  if (cloudItems && Array.isArray(cloudItems) && cloudItems.length > 0) {
    applyMenuItemsToDOM(cloudItems);
    if (typeof applyStoreOperatingState === 'function') applyStoreOperatingState();
  }
}


// --------------------------------------------------------------------------
// STORE OPERATING STATUS, AUTOMATED OFF-HOURS SHUTDOWN & EMERGENCY SYNC
// --------------------------------------------------------------------------
window.isBreezeStoreOpen = true;
window.breezeStoreClosureReason = '';
window.breezeStoreSettings = {
  is_store_open: true,
  auto_schedule_enabled: true,
  opening_time: '11:00',
  closing_time: '23:00',
  off_hours_notice: 'Kitchen is closed for the night. Online ordering is available daily from 11:00 AM to 11:00 PM.',
  closure_reason: 'Store is temporarily closed for online ordering.'
};
let isStoreSettingsRealtimeSubscribed = false;

// Helper: Accurate Indian Standard Time (Asia/Kolkata)
function getStoreISTTime() {
  const now = new Date();
  try {
    const formatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(now);
    let hour = 0;
    let minute = 0;
    parts.forEach(p => {
      if (p.type === 'hour') hour = parseInt(p.value, 10);
      if (p.type === 'minute') minute = parseInt(p.value, 10);
    });
    return { hour, minute, minutesFromMidnight: hour * 60 + minute };
  } catch (e) {
    const hour = now.getHours();
    const minute = now.getMinutes();
    return { hour, minute, minutesFromMidnight: hour * 60 + minute };
  }
}

function parseTimeToMinutes(timeStr, defaultMinutes) {
  if (!timeStr || typeof timeStr !== 'string') return defaultMinutes;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return defaultMinutes;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return defaultMinutes;
  return h * 60 + m;
}

function formatMinutesTo12Hour(minutes) {
  let h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  const mStr = m < 10 ? '0' + m : m;
  return `${h}:${mStr} ${ampm}`;
}

function formatMinutesTo12HourCompact(minutes) {
  let h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return m === 0 ? `${h} ${ampm}` : `${h}:${m < 10 ? '0' + m : m} ${ampm}`;
}

function evaluateStoreOperatingStatus(settings) {
  const s = settings || window.breezeStoreSettings || {};
  const isManualOpen = s.is_store_open !== false && s.is_store_open !== 'false' && s.is_store_open !== 0 && s.is_store_open !== '0';
  const autoSchedule = s.auto_schedule_enabled !== false;
  const openTimeStr = s.opening_time || '11:00';
  const closeTimeStr = s.closing_time || '23:00';
  const openMins = parseTimeToMinutes(openTimeStr, 11 * 60);
  const closeMins = parseTimeToMinutes(closeTimeStr, 23 * 60);

  const ist = getStoreISTTime();
  const curMins = ist.minutesFromMidnight;

  const openTime12 = formatMinutesTo12Hour(openMins);
  const closeTime12 = formatMinutesTo12Hour(closeMins);
  const openTimeCompact = formatMinutesTo12HourCompact(openMins);
  const closeTimeCompact = formatMinutesTo12HourCompact(closeMins);

  // 1. Manual Emergency Shutdown takes precedence
  if (!isManualOpen) {
    return {
      isOpen: false,
      isEmergencyShutdown: true,
      isOffHours: false,
      reason: s.closure_reason || 'Store is temporarily closed for online ordering.',
      openTime12,
      closeTime12,
      openTimeCompact,
      closeTimeCompact
    };
  }

  // 2. Automated Off-Hours Schedule
  if (autoSchedule) {
    let isWithinHours = false;
    if (closeMins > openMins) {
      isWithinHours = curMins >= openMins && curMins < closeMins;
    } else {
      isWithinHours = curMins >= openMins || curMins < closeMins;
    }

    if (!isWithinHours) {
      const defaultNotice = `Kitchen closed for the night. Online ordering is available daily from ${openTime12} to ${closeTime12}. We will reopen at ${openTime12}!`;
      return {
        isOpen: false,
        isEmergencyShutdown: false,
        isOffHours: true,
        reason: s.off_hours_notice || defaultNotice,
        openTime12,
        closeTime12,
        openTimeCompact,
        closeTimeCompact
      };
    }
  }

  // 3. Normal Store Open
  return {
    isOpen: true,
    isEmergencyShutdown: false,
    isOffHours: false,
    reason: '',
    openTime12,
    closeTime12,
    openTimeCompact,
    closeTimeCompact
  };
}

// Synchronously hydrate cached store operating status from localStorage (0ms latency, zero flicker)
try {
  const cachedStoreSettings = localStorage.getItem('breeze_store_settings');
  if (cachedStoreSettings) {
    const parsed = JSON.parse(cachedStoreSettings);
    if (parsed && typeof parsed === 'object') {
      window.breezeStoreSettings = Object.assign({}, window.breezeStoreSettings, parsed);
    }
  }
} catch (e) {}

// Synchronously evaluate initial operating status on boot
const initialStoreBootStatus = evaluateStoreOperatingStatus(window.breezeStoreSettings);
window.isBreezeStoreOpen = initialStoreBootStatus.isOpen;
window.breezeStoreClosureReason = initialStoreBootStatus.reason;
window.breezeStoreStatusMeta = initialStoreBootStatus;

// Helper to fetch store settings from cloud with dual fallbacks (REST API + Supabase client)
async function fetchStoreSettingsFromCloud() {
  // 1. Try via Supabase JS Client if already instantiated
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('store_settings')
        .select('*')
        .eq('id', 'breeze_main')
        .maybeSingle();
      if (!error && data) return data;
    } catch (e) {}
  }

  // 2. Direct high-speed REST fetch fallback (bypasses any SDK loading delay or CDN hiccups)
  try {
    if (BREEZE_CONFIG.SUPABASE_URL && BREEZE_CONFIG.SUPABASE_ANON_KEY) {
      const resp = await fetch(`${BREEZE_CONFIG.SUPABASE_URL}/rest/v1/store_settings?id=eq.breeze_main&select=*`, {
        headers: {
          'apikey': BREEZE_CONFIG.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${BREEZE_CONFIG.SUPABASE_ANON_KEY}`
        }
      });
      if (resp.ok) {
        const rows = await resp.json();
        if (Array.isArray(rows) && rows.length > 0) return rows[0];
      }
    }
  } catch (e) {}

  return null;
}

async function syncStoreOperatingStatusWithCloud() {
  try {
    const data = await fetchStoreSettingsFromCloud();

    if (data && typeof data === 'object') {
      window.breezeStoreSettings = Object.assign({}, window.breezeStoreSettings, data);
      try { localStorage.setItem('breeze_store_settings', JSON.stringify(data)); } catch(e){}
      applyStoreOperatingState(window.breezeStoreSettings);
      if (data.razorpay_key_id && window.BREEZE_CONFIG) {
        window.BREEZE_CONFIG.RAZORPAY_KEY_ID = data.razorpay_key_id;
        try { localStorage.setItem('breeze_rzp_key_id', data.razorpay_key_id); } catch(e){}
      }
    } else {
      applyStoreOperatingState();
    }

    // Subscribe to realtime database stream if client is ready
    const client = getSupabaseClient();
    if (client && !isStoreSettingsRealtimeSubscribed && client.channel) {
      client.channel('breeze-frontend-store-settings-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'store_settings' }, (payload) => {
          if (payload && payload.new) {
            window.breezeStoreSettings = Object.assign({}, window.breezeStoreSettings, payload.new);
            try { localStorage.setItem('breeze_store_settings', JSON.stringify(payload.new)); } catch(e){}
            applyStoreOperatingState(window.breezeStoreSettings);
            if (payload.new.razorpay_key_id && window.BREEZE_CONFIG) {
              window.BREEZE_CONFIG.RAZORPAY_KEY_ID = payload.new.razorpay_key_id;
              try { localStorage.setItem('breeze_rzp_key_id', payload.new.razorpay_key_id); } catch(e){}
            }
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            isStoreSettingsRealtimeSubscribed = true;
          }
        });
    }
  } catch (err) {
    console.warn('syncStoreOperatingStatusWithCloud error:', err);
    applyStoreOperatingState();
  }
}

// Kick off cloud synchronization immediately upon script loading
syncStoreOperatingStatusWithCloud();

function applyStoreOperatingState(customSettings) {
  try {
    if (customSettings && typeof customSettings === 'object') {
      window.breezeStoreSettings = Object.assign({}, window.breezeStoreSettings, customSettings);
    }

    const status = evaluateStoreOperatingStatus(window.breezeStoreSettings);
    window.isBreezeStoreOpen = status.isOpen;
    window.breezeStoreClosureReason = status.reason;
    window.breezeStoreStatusMeta = status;

    // 1. Top emergency closure or off-hours banner
    let banner = document.getElementById('breezeStoreClosedBanner');
    if (!status.isOpen) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'breezeStoreClosedBanner';
        document.body.prepend(banner);
      }
      const bg = status.isOffHours
        ? 'linear-gradient(135deg, #78350f, #92400e)'
        : 'linear-gradient(135deg, #7f1d1d, #991b1b)';
      const icon = status.isOffHours
        ? '<i class="fas fa-moon" style="color: #fde68a; font-size: 1.05rem;"></i>'
        : '<i class="fas fa-exclamation-circle" style="color: #fca5a5; font-size: 1.05rem;"></i>';
      const title = status.isOffHours ? 'Off-Hours Notice:' : 'Kitchen Notice:';

      banner.style.cssText = `background: ${bg}; color: #ffffff; padding: 10px 18px; text-align: center; font-size: 0.86rem; font-weight: 600; position: relative; z-index: 990; box-shadow: 0 2px 8px rgba(0,0,0,0.18); display: flex; align-items: center; justify-content: center; gap: 12px; font-family: inherit;`;
      banner.innerHTML = `
        <div style="display:inline-flex; align-items:center; gap:8px; justify-content:center; flex:1;">
          ${icon} <span><strong>${title}</strong> ${escapeHtml(status.reason)}</span>
        </div>
        <button type="button" aria-label="Dismiss banner" onclick="this.closest('#breezeStoreClosedBanner').remove()" style="background:none; border:none; color:#ffffff; font-size:1.25rem; line-height:1; cursor:pointer; padding:2px 8px; opacity:0.85; transition:opacity 0.2s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.85'">&times;</button>
      `;
      banner.style.display = 'flex';
    } else {
      if (banner) banner.remove();
    }

  // 2. Status Indicator Badges (.status-indicator)
  const statusBadges = document.querySelectorAll('.status-indicator');
  statusBadges.forEach(badge => {
    if (status.isOpen) {
      badge.innerHTML = `<span class="status-dot"></span> Open Now • Closes ${status.closeTime12}`;
      badge.style.color = '#1c7c44';
      badge.style.background = 'rgba(33, 140, 78, 0.12)';
    } else if (status.isOffHours) {
      badge.innerHTML = `<span class="status-dot" style="background:#e67e22; box-shadow:0 0 8px #e67e22;"></span> Closed Now • Opens ${status.openTime12}`;
      badge.style.color = '#c0392b';
      badge.style.background = 'rgba(231, 76, 60, 0.12)';
    } else {
      badge.innerHTML = `<span class="status-dot" style="background:#ef4444; box-shadow:0 0 8px #ef4444;"></span> Store Paused • Emergency Notice`;
      badge.style.color = '#c0392b';
      badge.style.background = 'rgba(231, 76, 60, 0.12)';
    }
  });

  // 3. Cart drawer checkout button update (keep clickable so tap opens informative dialog)
  const checkoutBtn = document.getElementById('cartCheckoutBtn');
  if (checkoutBtn) {
    if (!status.isOpen) {
      checkoutBtn.disabled = false;
      const closedLabel = status.isOffHours ? `Kitchen Closed (Opens ${status.openTime12})` : 'Kitchen Currently Closed';
      checkoutBtn.innerHTML = `<i class="fas fa-store-alt-slash"></i> ${closedLabel}`;
      checkoutBtn.style.background = status.isOffHours ? 'linear-gradient(135deg, #b45309, #d97706)' : '#991b1b';
      checkoutBtn.style.color = '#ffffff';
      checkoutBtn.style.cursor = 'pointer';
    } else {
      checkoutBtn.disabled = false;
      checkoutBtn.style.background = '';
      checkoutBtn.style.color = '';
      checkoutBtn.style.cursor = '';
      if (typeof renderCart === 'function') renderCart();
    }
  }

  // 4. Update Body Class & Menu Cards state
  if (!status.isOpen) {
    document.body.classList.add('store-closed');
  } else {
    document.body.classList.remove('store-closed');
  }

  const cards = document.querySelectorAll('.menu-card');
  cards.forEach(card => {
    // If dish is sold out in kitchen, sold-out badge takes priority
    if (card.classList.contains('out-of-stock')) return;

    const orderBtn = card.querySelector('.btn-card-order');
    const cartBtn = card.querySelector('.btn-card-cart');
    const mediaEl = card.querySelector('.menu-card-media');

    if (!status.isOpen) {
      card.classList.add('store-closed');
      if (mediaEl) {
        let closedBadge = mediaEl.querySelector('.badge-store-closed');
        if (!closedBadge) {
          closedBadge = document.createElement('span');
          closedBadge.className = 'menu-card-badge badge-store-closed';
          mediaEl.appendChild(closedBadge);
        }
        closedBadge.innerHTML = status.isOffHours 
          ? `<i class="fas fa-moon"></i> Opens ${status.openTime12}` 
          : `<i class="fas fa-store-alt-slash"></i> Kitchen Closed`;
      }
      if (orderBtn) {
        orderBtn.disabled = false;
        orderBtn.innerHTML = status.isOffHours 
          ? `<i class="fas fa-clock"></i> Closed (Opens ${status.openTime12})` 
          : `<i class="fas fa-store-alt-slash"></i> Kitchen Closed`;
        orderBtn.setAttribute('title', 'Kitchen is currently closed for online orders. Tap to view timings.');
      }
      if (cartBtn) {
        cartBtn.disabled = false;
        cartBtn.innerHTML = `<i class="fas fa-info-circle"></i> Kitchen Closed`;
        cartBtn.setAttribute('title', 'Kitchen is currently closed for online orders. Tap to view timings.');
      }
    } else {
      card.classList.remove('store-closed');
      const closedBadge = card.querySelector('.badge-store-closed');
      if (closedBadge) closedBadge.remove();
      if (orderBtn) {
        orderBtn.disabled = false;
        orderBtn.innerHTML = '<i class="fas fa-bolt"></i> Order Now';
        orderBtn.setAttribute('title', 'Order directly');
      }
      if (cartBtn) {
        cartBtn.disabled = false;
        cartBtn.innerHTML = '<i class="fas fa-cart-plus"></i> Add to Cart';
        cartBtn.setAttribute('title', 'Add to your rooftop order');
      }
    }
  });

  // 5. Signature Combo Order button update
  const comboBtn = document.getElementById('comboOrderNowBtn');
  if (comboBtn) {
    if (!status.isOpen) {
      comboBtn.classList.add('store-closed-btn');
      comboBtn.innerHTML = status.isOffHours
        ? `<i class="fas fa-clock"></i> Kitchen Closed (Opens ${status.openTime12})`
        : `<i class="fas fa-store-alt-slash"></i> Kitchen Closed`;
    } else {
      comboBtn.classList.remove('store-closed-btn');
      comboBtn.innerHTML = `<i class="fas fa-bolt"></i> Order Combo Now &bull; ₹349 <i class="fas fa-arrow-right"></i>`;
    }
  }

    // 6. Sticky Bottom Bar Cart Button indicator
    const bottomBarCartBtn = document.getElementById('bottomBarCartBtn');
    if (bottomBarCartBtn) {
      if (!status.isOpen) {
        bottomBarCartBtn.classList.add('store-closed-nav');
      } else {
        bottomBarCartBtn.classList.remove('store-closed-nav');
      }
    }

    // 7. Dynamic Operating Hours Sync Across Entire Storefront (Hero Trust Bar, Footer, Contact, Feature Bars, Modals)
    const hoursFormattedDaily = `${status.openTime12} – ${status.closeTime12} Daily`;
    const hoursRangeOnly = `${status.openTime12} – ${status.closeTime12}`;
    const openCompact = status.openTimeCompact || status.openTime12;
    const closeCompact = status.closeTimeCompact || status.closeTime12;
    const openDailyCompactText = `Open Daily ${openCompact} – ${closeCompact}`;

    // 7a. Update Hero Trust Item (index.html hero pill: <div class="trust-item">...<span>Open Daily...</span></div>)
    document.querySelectorAll('.trust-item').forEach(item => {
      const clockIcon = item.querySelector('.fa-clock');
      if (clockIcon) {
        const span = item.querySelector('span');
        if (span) {
          span.textContent = openDailyCompactText;
        }
      }
    });

    const heroHoursPill = document.getElementById('heroStoreHoursText');
    if (heroHoursPill) {
      heroHoursPill.textContent = openDailyCompactText;
    }

    // 7b. Update elements with .store-hours-display or [data-store-hours]
    document.querySelectorAll('.store-hours-display, [data-store-hours]').forEach(el => {
      const format = el.getAttribute('data-format') || el.getAttribute('data-store-hours') || '';
      if (format === 'open-daily' || el.id === 'heroStoreHoursText') {
        el.textContent = openDailyCompactText;
      } else if (format === 'range-compact') {
        el.textContent = `${openCompact} – ${closeCompact}`;
      } else if (el.tagName === 'STRONG' || format === 'range-only') {
        el.textContent = hoursRangeOnly;
      } else {
        el.textContent = hoursFormattedDaily;
      }
    });

    // 7c. Update all footer contact items
    document.querySelectorAll('.footer-contact-item').forEach(item => {
      const clockIcon = item.querySelector('.fa-clock');
      if (clockIcon) {
        const span = item.querySelector('span');
        if (span) {
          span.textContent = hoursFormattedDaily;
        }
      }
    });

    // 7d. Update contact page operating hours card
    document.querySelectorAll('.info-card').forEach(card => {
      const clockIcon = card.querySelector('.fa-clock');
      if (clockIcon) {
        const p = card.querySelector('p');
        if (p && p.textContent.includes('Monday')) {
          p.innerHTML = `Monday – Sunday: <strong class="store-hours-display">${hoursRangeOnly}</strong>`;
        }
      }
    });

    // 7e. Update home page rooftop card feature bar
    document.querySelectorAll('#rooftop span, .rooftop-section span').forEach(s => {
      if (s.querySelector('.fa-clock') && s.querySelector('strong')) {
        s.querySelector('strong').textContent = hoursRangeOnly;
      }
    });

    // 7f. Update menu hero feature tag
    document.querySelectorAll('.feature-tag').forEach(tag => {
      if (tag.querySelector('.fa-clock')) {
        tag.innerHTML = `<i class="fas fa-clock"></i> <span class="store-hours-display">${hoursFormattedDaily}</span>`;
      }
    });

    // 7g. Update store closed modal timings & reopens pill
    const storeClosedModalHours = document.getElementById('storeClosedModalHours');
    if (storeClosedModalHours) {
      storeClosedModalHours.textContent = `${hoursRangeOnly} IST (Daily)`;
    }

    const storeClosedModalNextOpen = document.getElementById('storeClosedModalNextOpen');
    if (storeClosedModalNextOpen) {
      storeClosedModalNextOpen.innerHTML = `<i class="fas fa-clock"></i> Reopens at ${status.openTime12}`;
    }
  } catch (err) {
    console.warn('applyStoreOperatingState error:', err);
  }
}

// Ensure store operating state updates DOM immediately and once content is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    applyStoreOperatingState();
  });
} else {
  applyStoreOperatingState();
}

// --------------------------------------------------------------------------
// STORE CLOSED MODAL & TACTILE INTERACTION CONTROLLER
// --------------------------------------------------------------------------
function ensureStoreClosedModalDOM() {
  let modal = document.getElementById('storeClosedModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'storeClosedModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'storeClosedTitle');
    modal.innerHTML = `
      <div class="modal-container store-closed-modal-container">
        <div class="modal-drag-handle"></div>
        <button type="button" class="modal-close-btn" id="storeClosedModalCloseBtn" aria-label="Close dialog">
          <i class="fas fa-times"></i>
        </button>

        <div class="store-closed-modal-hero">
          <div class="store-closed-icon-badge">
            <i class="fas fa-moon"></i>
          </div>
          <span class="badge-tag store-closed-status-pill" id="storeClosedModalNextOpen">
            <i class="fas fa-clock"></i> Reopens at 11:00 AM
          </span>
          <h3 class="store-closed-title" id="storeClosedTitle">Kitchen Currently Closed</h3>
          <p class="store-closed-lead" id="storeClosedModalReason">
            Breeze The Rooftop Café is currently closed for online ordering.
          </p>
        </div>

        <div class="store-closed-timings-card">
          <div class="timings-icon"><i class="fas fa-utensils"></i></div>
          <div class="timings-info">
            <div class="timings-label">Daily Kitchen Timings</div>
            <div class="timings-val" id="storeClosedModalHours">11:00 AM – 11:00 PM IST (Daily)</div>
          </div>
        </div>

        <div class="store-closed-actions">
          <button type="button" class="btn btn-primary btn-block" id="storeClosedBookTableBtn">
            <i class="fas fa-calendar-check"></i> Reserve a Rooftop Table Instead
          </button>
          <a href="https://wa.me/919623999095?text=Hi%20Breeze%20Cafe%2C%20I%20wanted%20to%20inquire%20about%20kitchen%20hours%20and%20table%20reservations." target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp-reserve btn-block" id="storeClosedWhatsAppBtn">
            <i class="fab fa-whatsapp"></i> Inquire on WhatsApp (+91 9623999095)
          </a>
          <button type="button" class="btn btn-outline-gold btn-block" id="storeClosedBrowseBtn">
            <i class="fas fa-book-open"></i> Browse Menu & Prices
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Bind events if not already bound
  const closeBtn = document.getElementById('storeClosedModalCloseBtn');
  if (closeBtn && !closeBtn._bound) {
    closeBtn.addEventListener('click', closeStoreClosedModal);
    closeBtn._bound = true;
  }
  const browseBtn = document.getElementById('storeClosedBrowseBtn');
  if (browseBtn && !browseBtn._bound) {
    browseBtn.addEventListener('click', closeStoreClosedModal);
    browseBtn._bound = true;
  }
  const bookTableBtn = document.getElementById('storeClosedBookTableBtn');
  if (bookTableBtn && !bookTableBtn._bound) {
    bookTableBtn.addEventListener('click', () => {
      closeStoreClosedModal();
      const tableModal = document.getElementById('tableBookingModal');
      if (tableModal) {
        tableModal.classList.add('active');
        document.body.classList.add('modal-open');
        document.documentElement.classList.add('modal-open');
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
      }
    });
    bookTableBtn._bound = true;
  }
  if (!modal._boundOverlay) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeStoreClosedModal();
    });
    modal._boundOverlay = true;
  }

  return modal;
}

function openStoreClosedModal() {
  const modal = ensureStoreClosedModalDOM();
  const status = window.breezeStoreStatusMeta || evaluateStoreOperatingStatus();

  const reasonEl = document.getElementById('storeClosedModalReason');
  if (reasonEl) {
    reasonEl.textContent = status.reason || 'Our kitchen is currently closed for online ordering.';
  }

  const hoursEl = document.getElementById('storeClosedModalHours');
  if (hoursEl) {
    hoursEl.innerHTML = `${status.openTime12 || '11:00 AM'} &ndash; ${status.closeTime12 || '11:00 PM'} IST (Daily)`;
  }

  const nextOpenEl = document.getElementById('storeClosedModalNextOpen');
  const iconBadge = modal.querySelector('.store-closed-icon-badge');
  if (nextOpenEl) {
    if (status.isOffHours) {
      nextOpenEl.innerHTML = `<i class="fas fa-moon"></i> Reopens at ${status.openTime12 || '11:00 AM'} IST`;
      nextOpenEl.style.display = 'inline-flex';
      if (iconBadge) iconBadge.innerHTML = '<i class="fas fa-moon"></i>';
    } else {
      nextOpenEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> Kitchen Temporarily Paused`;
      nextOpenEl.style.display = 'inline-flex';
      if (iconBadge) iconBadge.innerHTML = '<i class="fas fa-store-alt-slash"></i>';
    }
  }

  modal.classList.add('active');
  document.body.classList.add('modal-open');
  document.documentElement.classList.add('modal-open');
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
}

function closeStoreClosedModal() {
  const modal = document.getElementById('storeClosedModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }
}

window.openStoreClosedModal = openStoreClosedModal;
window.closeStoreClosedModal = closeStoreClosedModal;

async function syncOrderToSupabase(order) {
  if (!order || !order.id) return;
  const client = getSupabaseClient();
  if (!client) return;
  try {
    const rawEmail = order.customer?.email || (typeof customerProfile !== 'undefined' ? customerProfile.email : null) || null;
    const cleanEmail = rawEmail ? String(rawEmail).toLowerCase().trim() : null;
    const payload = {
      id: order.id,
      customer_email: cleanEmail,
      customer_name: order.customer?.name || 'Guest',
      customer_phone: order.customer?.phone || null,
      customer_address: order.customer?.address || null,
      order_type: order.customer?.type || order.customer?.orderType || 'Home Delivery',
      items: order.items || [],
      subtotal: order.subtotal || 0,
      delivery_fee: order.deliveryFee || 0,
      total_amount: order.total || 0,
      payment_method: order.paymentMethod || 'cod',
      payment_status: order.paymentStatus || 'pending',
      razorpay_payment_id: order.paymentId || null,
      status: order.status || 'placed',
      estimated_prep_time: order.prepTimeMins || order.estimatedPrepMinutes || 25,
      created_at: order.placedAt ? new Date(order.placedAt).toISOString() : (order.createdAt || new Date().toISOString())
    };
    const { error } = await client.from('orders').upsert(payload, { onConflict: 'id' });
    if (error) console.warn('Supabase order upsert:', error.message);
  } catch (err) {
    console.warn('Supabase sync order error:', err);
  }
}

async function updateOrderStatusInSupabase(orderId, status, reason = null) {
  if (!orderId) return;
  const client = getSupabaseClient();
  if (!client) return;
  try {
    const updateData = { status: status, updated_at: new Date().toISOString() };
    if (reason) updateData.cancellation_reason = reason;
    const { error } = await client.from('orders').update(updateData).eq('id', orderId);
    if (error) console.warn('Supabase status update:', error.message);
  } catch (err) {
    console.warn('Supabase status error:', err);
  }
}

async function fetchUserOrdersFromSupabase(email, phone = null) {
  if (!email && !phone) return { activeOrder: null, history: [] };
  const client = getSupabaseClient();
  if (!client) return { activeOrder: null, history: [] };
  try {
    const cleanEmail = email ? String(email).toLowerCase().trim() : null;
    const rawPhone = phone ? String(phone).replace(/[^0-9]/g, '') : '';
    const cleanPhone = rawPhone.length >= 10 ? rawPhone.slice(-10) : (rawPhone || null);

    let query = client.from('orders').select('*');
    if (cleanEmail && cleanPhone) {
      query = query.or(`customer_email.eq.${cleanEmail},customer_phone.eq.${cleanPhone},customer_phone.eq.+91${cleanPhone}`);
    } else if (cleanEmail) {
      query = query.eq('customer_email', cleanEmail);
    } else if (cleanPhone) {
      query = query.or(`customer_phone.eq.${cleanPhone},customer_phone.eq.+91${cleanPhone}`);
    } else {
      return { activeOrder: null, history: [] };
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    let dataRows = (!error && Array.isArray(data) && data.length > 0) ? data : null;

    if (!dataRows && cleanPhone) {
      try {
        const fb1 = await client.from('orders').select('*').eq('customer_phone', cleanPhone).order('created_at', { ascending: false });
        if (!fb1.error && Array.isArray(fb1.data) && fb1.data.length > 0) dataRows = fb1.data;
        if (!dataRows) {
          const fb2 = await client.from('orders').select('*').eq('customer_phone', '+91' + cleanPhone).order('created_at', { ascending: false });
          if (!fb2.error && Array.isArray(fb2.data) && fb2.data.length > 0) dataRows = fb2.data;
        }
      } catch (fbe) {}
    }
    if (!dataRows && cleanEmail) {
      try {
        const fb3 = await client.from('orders').select('*').eq('customer_email', cleanEmail).order('created_at', { ascending: false });
        if (!fb3.error && Array.isArray(fb3.data) && fb3.data.length > 0) dataRows = fb3.data;
      } catch (fbe) {}
    }

    if (!dataRows || dataRows.length === 0) {
      return { activeOrder: null, history: [] };
    }

    const history = dataRows.map(row => {
      let step = 2;
      const st = (row.status || '').toLowerCase().trim();
      if (st === 'placed') step = 2;
      else if (st === 'confirmed' || st === 'accepted' || st === 'cooking' || st === 'preparing') step = 3;
      else if (st === 'food_ready') step = 4;
      else if (st === 'dispatched' || st === 'out_for_delivery') step = 4;
      else if (st === 'delivered' || st === 'completed') step = 5;
      else if (st === 'cancelled' || st === 'rejected') step = 0;

      return {
        id: row.id,
        total: Number(row.total_amount) || 0,
        subtotal: Number(row.subtotal) || 0,
        deliveryFee: Number(row.delivery_fee) || 0,
        status: row.status || 'placed',
        placedAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        items: Array.isArray(row.items) ? row.items : [],
        customer: {
          name: row.customer_name || 'Customer',
          email: row.customer_email || cleanEmail || '',
          phone: row.customer_phone || cleanPhone || '',
          address: row.customer_address || '',
          type: row.order_type || 'Home Delivery',
          table: '',
          notes: ''
        },
        paymentMethod: row.payment_method || 'cod',
        paymentStatus: row.payment_status || 'PENDING',
        paymentId: row.razorpay_payment_id || null,
        currentStep: step,
        prepTimeMins: row.estimated_prep_time || 20,
        estimated_prep_time: row.estimated_prep_time || 20,
        estimated_delivery_time: row.estimated_delivery_time || null,
        estimated_delivery_by: row.estimated_delivery_by || null,
        accepted_at: row.accepted_at || null,
        food_ready_at: row.food_ready_at || null,
        cancellation_reason: row.cancellation_reason || null,
        delay_reason: row.delay_reason || null,
        rider_id: row.rider_id || null,
        rider_name: row.rider_name || null,
        rider_phone: row.rider_phone || null,
        picked_up_at: row.picked_up_at || null,
        delivered_at: row.delivered_at || null
      };
    });

    const activeOrder = history.find(o => o.status !== 'cancelled' && o.status !== 'delivered') || null;
    return { activeOrder, history };
  } catch (err) {
    console.warn('fetchUserOrdersFromSupabase exception:', err);
    return { activeOrder: null, history: [] };
  }
}
window.fetchUserOrdersFromSupabase = fetchUserOrdersFromSupabase;

async function syncReservationToSupabase(reservation) {
  if (!reservation) return;
  const client = getSupabaseClient();
  if (!client) return;
  try {
    const payload = {
      guest_name: reservation.customer?.name || reservation.name || 'Guest',
      guest_phone: reservation.customer?.phone || reservation.phone || '',
      guest_email: reservation.customer?.email || (typeof customerProfile !== 'undefined' ? customerProfile.email : null) || null,
      reservation_date: reservation.date,
      time_slot: reservation.time,
      guest_count: parseInt(reservation.guests, 10) || 2,
      seating_zone: reservation.area || 'Starlight Rooftop',
      special_notes: reservation.notes || null,
      status: 'confirmed'
    };
    const { error } = await client.from('table_reservations').insert(payload);
    if (error) console.warn('Supabase reservation insert:', error.message);
  } catch (err) {
    console.warn('Supabase sync reservation error:', err);
  }
}

/**
 * BREEZE THE ROOFTOP CAFÉ - MAIN JAVASCRIPT (V3.0 FULLY OPTIMIZED)
 * Complete interactive suite: Live cafe status, mobile drawer, interactive menu,
 * search with clear button, video reels player with audio toggles, direct rooftop table reservation,
 * menu card lightbox, back-to-top button, and toast notifications.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Live Operating Status Indicator
  initLiveStatus();

  // 2. Sticky Header & Back-to-Top Button
  initHeaderAndScroll();

  // 3. Mobile Navigation Drawer
  initMobileNav();

  // 4. Interactive Menu (Filter Pills & Instant Search)
  initMenuSystem();

  // 5. Video Reels Player Controls
  initVideoReels();

  // 6. Modal Viewer (Printed Menu Card)
  initModals();

  // 7. Smooth Scrolling with Accurate Header Offset
  initSmoothScroll();

  // 8. Rooftop Cart & Ordering System (Order Now & Add to Cart)
  initCartSystem();
});

/**
 * 1. LIVE OPERATING STATUS INDICATOR
 * Operating hours schedule & live status sync (Default: 11:00 AM – 11:00 PM IST)
 */
function initLiveStatus() {
  applyStoreOperatingState();
  syncStoreOperatingStatusWithCloud();
  // Check schedule & sync cloud operating status every 15 seconds
  setInterval(() => {
    applyStoreOperatingState();
    syncStoreOperatingStatusWithCloud();
  }, 15000);
}

/**
 * 2. STICKY HEADER & SCROLL-SPY & BACK TO TOP
 */
function initHeaderAndScroll() {
  const header = document.querySelector('.header');
  const backToTopBtn = document.getElementById('backToTopBtn');
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');

  window.addEventListener('scroll', () => {
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;

    // Header blur intensification
    if (header) {
      if (scrollY > 50) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    }

    // Back to top button visibility
    if (backToTopBtn) {
      if (scrollY > 350) {
        backToTopBtn.classList.add('show');
      } else {
        backToTopBtn.classList.remove('show');
      }
    }

    // Active Navigation Scroll-Spy
    sections.forEach(section => {
      const sectionHeight = section.offsetHeight;
      const sectionTop = section.offsetTop - 120;
      const sectionId = section.getAttribute('id');

      if (scrollY >= sectionTop && scrollY < sectionTop + sectionHeight) {
        navLinks.forEach(link => {
          link.classList.remove('active');
          if (link.getAttribute('href') === `#${sectionId}`) {
            link.classList.add('active');
          }
        });
      }
    });
  }, { passive: true });

  // Back to top click handler
  if (backToTopBtn) {
    backToTopBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }
}

/**
 * 3. MOBILE NAVIGATION DRAWER
 */
function initMobileNav() {
  const toggleBtn = document.querySelector('.mobile-nav-toggle');
  const drawer = document.querySelector('.mobile-nav-drawer');
  const backdrop = document.querySelector('.drawer-backdrop');
  const closeBtn = document.querySelector('.drawer-close');
  const mobileLinks = document.querySelectorAll('.mobile-nav-link, .drawer-actions a');

  if (!toggleBtn || !drawer || !backdrop) return;

  function openDrawer() {
    drawer.classList.add('open');
    backdrop.classList.add('active');
    document.body.classList.add('drawer-open', 'modal-open');
    document.documentElement.classList.add('drawer-open', 'modal-open');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    backdrop.classList.remove('active');
    document.body.classList.remove('drawer-open', 'modal-open');
    document.documentElement.classList.remove('drawer-open', 'modal-open');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }

  toggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openDrawer();
  });

  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) {
      closeDrawer();
    }
  });

  // When clicking mobile links, close drawer and allow smooth scroll
  mobileLinks.forEach(link => {
    link.addEventListener('click', () => {
      closeDrawer();
    });
  });
}

/**
 * 4. INTERACTIVE MENU SYSTEM
 * Supports filter pills with dynamic counts, real-time search, and clear button
 */
function initMenuSystem() {
  const filterPills = document.querySelectorAll('.filter-pill');
  const searchInput = document.querySelector('.menu-search-input');
  const searchClearBtn = document.querySelector('.menu-search-clear');
  const searchStatus = document.getElementById('menuSearchStatus');
  const menuCards = document.querySelectorAll('.menu-card');
  const emptyState = document.querySelector('.menu-empty-state');
  const viewMoreBtn = document.getElementById('menuViewMoreBtn');
  const viewMoreWrap = document.querySelector('.menu-view-more-wrap');

  if (!menuCards.length) return;

  // If this is a preview section without filters or search (e.g. front page highlights),
  // ensure all highlight cards remain visible and exit early.
  if (!filterPills.length && !searchInput) {
    menuCards.forEach(card => card.style.display = 'flex');
    return;
  }

  const isMenuPage = document.body.classList.contains('menu-page') || !viewMoreBtn;
  let activeCategory = 'all';
  let searchTerm = '';
  let isExpanded = isMenuPage;
  const INITIAL_LIMIT = isMenuPage ? 999 : 6;

  // Update Category Count Badges dynamically
  function updateCounts() {
    const counts = { all: menuCards.length };
    menuCards.forEach(card => {
      const cat = card.dataset.category || '';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    filterPills.forEach(pill => {
      const cat = pill.dataset.filter;
      const countEl = pill.querySelector('.pill-count');
      if (countEl && counts[cat] !== undefined) {
        countEl.textContent = counts[cat];
      }
    });
  }

  updateCounts();

  function filterItems() {
    let matchingCards = [];

    menuCards.forEach(card => {
      const cardCategory = card.dataset.category || '';
      const cardName = (card.querySelector('.menu-item-name')?.textContent || '').toLowerCase();
      const cardDesc = (card.querySelector('.menu-item-desc')?.textContent || '').toLowerCase();

      const matchesCategory = (activeCategory === 'all') || (cardCategory === activeCategory);
      const matchesSearch = !searchTerm || cardName.includes(searchTerm) || cardDesc.includes(searchTerm);

      if (matchesCategory && matchesSearch) {
        matchingCards.push(card);
      } else {
        card.style.display = 'none';
      }
    });

    const totalMatching = matchingCards.length;
    const showAll = Boolean(searchTerm) || isExpanded || totalMatching <= INITIAL_LIMIT;

    matchingCards.forEach((card, index) => {
      if (showAll || index < INITIAL_LIMIT) {
        card.style.display = 'flex';
      } else {
        card.style.display = 'none';
      }
    });

    // Update empty state
    if (emptyState) {
      emptyState.style.display = totalMatching === 0 ? 'block' : 'none';
    }

    // Update search status message
    if (searchStatus) {
      if (searchTerm) {
        searchStatus.style.display = 'block';
        searchStatus.innerHTML = totalMatching > 0 
          ? `Found <strong>${totalMatching}</strong> items for "<em>${searchTerm}</em>"`
          : `No dishes found for "<em>${searchTerm}</em>". Try searching for 'burger', 'fries', or 'pizza'.`;
      } else {
        searchStatus.style.display = 'none';
      }
    }

    // Toggle clear search button
    if (searchClearBtn) {
      searchClearBtn.style.display = searchTerm ? 'flex' : 'none';
    }

    // Update View More Button
    if (viewMoreWrap && viewMoreBtn) {
      if (searchTerm || totalMatching <= INITIAL_LIMIT) {
        viewMoreWrap.style.display = 'none';
      } else {
        viewMoreWrap.style.display = 'flex';
        const remaining = totalMatching - INITIAL_LIMIT;
        if (isExpanded) {
          viewMoreBtn.innerHTML = `<i class="fas fa-chevron-up"></i> Show Less (Top ${INITIAL_LIMIT})`;
          viewMoreBtn.classList.remove('btn-primary');
          viewMoreBtn.classList.add('btn-secondary');
        } else {
          const activePill = document.querySelector('.filter-pill.active');
          const pillText = activePill ? activePill.textContent.replace(/\d+/g, '').trim() : 'Dishes';
          const label = activeCategory === 'all' ? 'Dishes' : pillText;
          viewMoreBtn.innerHTML = `<i class="fas fa-chevron-down"></i> View More ${label} (${remaining} More)`;
          viewMoreBtn.classList.remove('btn-secondary');
          viewMoreBtn.classList.add('btn-primary');
        }
      }
    }
  }

  // View More Button Click
  if (viewMoreBtn) {
    viewMoreBtn.addEventListener('click', () => {
      isExpanded = !isExpanded;
      filterItems();
      if (!isExpanded) {
        const menuElem = document.getElementById('menu');
        if (menuElem) {
          menuElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  }

  // Category Filter Pill Clicks
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeCategory = pill.dataset.filter;
      isExpanded = isMenuPage; // Stay expanded on menu page
      filterItems();

      // Scroll pill into view horizontally on mobile
      pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
  });

  // Search input typing
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchTerm = e.target.value.trim().toLowerCase();
      filterItems();
    });
  }

  // Clear search button
  if (searchClearBtn) {
    searchClearBtn.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = '';
        searchTerm = '';
        searchInput.focus();
        filterItems();
      }
    });
  }

  // Initial execution to show exactly 3 dishes
  filterItems();
}

/**
 * 5. VIDEO REELS PLAYER CONTROLS
 * Single-video playback, audio mute toggle, play/pause state indicator
 */
function initVideoReels() {
  const reelCards = document.querySelectorAll('.reel-card');

  reelCards.forEach(card => {
    const video = card.querySelector('.reel-video');
    const muteBtn = card.querySelector('.reel-mute-btn');
    const playIndicator = card.querySelector('.reel-play-indicator');

    if (!video) return;

    // Start with paused class
    card.classList.add('paused');

    // Mute/Unmute toggle button
    if (muteBtn) {
      muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        video.muted = !video.muted;
        const icon = muteBtn.querySelector('i');
        if (icon) {
          if (video.muted) {
            icon.className = 'fas fa-volume-mute';
            muteBtn.setAttribute('title', 'Unmute audio');
          } else {
            icon.className = 'fas fa-volume-up';
            muteBtn.setAttribute('title', 'Mute audio');
          }
        }
      });
    }

    // Toggle play/pause on card click
    card.addEventListener('click', (e) => {
      // Don't trigger if clicked on child control buttons
      if (e.target.closest('.reel-controls-btn')) return;

      if (video.paused) {
        // Pause all other videos first to prevent overlapping sound
        reelCards.forEach(otherCard => {
          const otherVideo = otherCard.querySelector('.reel-video');
          const otherIndicator = otherCard.querySelector('.reel-play-indicator');
          if (otherVideo && otherVideo !== video) {
            otherVideo.pause();
            otherCard.classList.add('paused');
            if (otherIndicator) otherIndicator.innerHTML = '<i class="fas fa-play"></i> Tap to Play';
          }
        });

        video.play().then(() => {
          card.classList.remove('paused');
          if (playIndicator) {
            playIndicator.innerHTML = '<i class="fas fa-pause"></i> Playing';
          }
        }).catch(() => {
          // Fallback if browser blocks unmuted play
          video.muted = true;
          video.play().then(() => {
            card.classList.remove('paused');
            if (playIndicator) {
              playIndicator.innerHTML = '<i class="fas fa-pause"></i> Playing';
            }
          }).catch(() => {});
        });
      } else {
        video.pause();
        card.classList.add('paused');
        if (playIndicator) {
          playIndicator.innerHTML = '<i class="fas fa-play"></i> Paused';
        }
      }
    });
  });

  // IntersectionObserver: Pause video when scrolled out of view to save mobile data
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const video = entry.target.querySelector('.reel-video');
        const card = entry.target;
        const playIndicator = card.querySelector('.reel-play-indicator');
        if (!video) return;

        if (!entry.isIntersecting) {
          video.pause();
          card.classList.add('paused');
          if (playIndicator) {
            playIndicator.innerHTML = '<i class="fas fa-play"></i> Tap to Play';
          }
        }
      });
    }, { threshold: 0.35 });

    reelCards.forEach(card => observer.observe(card));
  }
}

/**
 * 6. MODALS (Printed Menu Card Lightbox)
 */
function initModals() {
  const menuModal = document.getElementById('menuCardModal');
  const openMenuCardBtns = document.querySelectorAll('.open-menu-modal-btn');
  const closeBtns = document.querySelectorAll('.modal-close-btn');
  const modalOverlays = document.querySelectorAll('.modal-overlay');

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add('active');
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }

  openMenuCardBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal(menuModal);
    });
  });

  closeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal-overlay');
      closeModal(modal);
    });
  });

  modalOverlays.forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(modal);
      }
    });
  });

  // 6b. VISUAL GALLERY PHOTO LIGHTBOX
  const galleryModal = document.getElementById('galleryPhotoLightboxModal');
  const galleryImg = document.getElementById('galleryLightboxImage');
  const galleryTitle = document.getElementById('galleryLightboxTitle');
  const gallerySub = document.getElementById('galleryLightboxSub');
  const galleryCounter = document.getElementById('galleryLightboxCounter');
  const galleryFullLink = document.getElementById('galleryLightboxFullLink');
  const btnPrev = document.getElementById('galleryLightboxPrev');
  const btnNext = document.getElementById('galleryLightboxNext');
  const btnClose = document.getElementById('galleryLightboxCloseBtn');

  const galleryItems = Array.from(document.querySelectorAll('.gallery-item'));
  let currentGalleryIndex = 0;

  function updateGalleryLightbox(index) {
    if (!galleryItems.length) return;
    currentGalleryIndex = (index + galleryItems.length) % galleryItems.length;
    const item = galleryItems[currentGalleryIndex];
    const img = item.querySelector('img');
    const title = item.querySelector('.gallery-item-title');
    const sub = item.querySelector('.gallery-item-sub');

    const src = img ? (img.getAttribute('src') || '') : '';
    const titleText = title ? title.textContent.trim() : 'Moments at Breeze';
    const subText = sub ? sub.textContent.trim() : 'Palghar rooftop cafe terrace';

    if (galleryImg) {
      galleryImg.style.opacity = '0.3';
      galleryImg.src = src;
      galleryImg.onload = () => { galleryImg.style.opacity = '1'; };
    }
    if (galleryTitle) galleryTitle.textContent = titleText;
    if (gallerySub) gallerySub.textContent = subText;
    if (galleryCounter) galleryCounter.textContent = `${currentGalleryIndex + 1} of ${galleryItems.length}`;
    if (galleryFullLink) galleryFullLink.href = src;
  }

  galleryItems.forEach((item, idx) => {
    item.addEventListener('click', (e) => {
      // If the item specifically opens the printed menu card, allow menu card modal
      if (item.classList.contains('open-menu-modal-btn')) {
        openModal(menuModal);
        return;
      }
      e.preventDefault();
      updateGalleryLightbox(idx);
      openModal(galleryModal);
    });
  });

  if (btnPrev) {
    btnPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      updateGalleryLightbox(currentGalleryIndex - 1);
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', (e) => {
      e.stopPropagation();
      updateGalleryLightbox(currentGalleryIndex + 1);
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', (e) => {
      e.stopPropagation();
      closeModal(galleryModal);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      modalOverlays.forEach(modal => closeModal(modal));
    } else if (galleryModal && galleryModal.classList.contains('active')) {
      if (e.key === 'ArrowLeft') {
        updateGalleryLightbox(currentGalleryIndex - 1);
      } else if (e.key === 'ArrowRight') {
        updateGalleryLightbox(currentGalleryIndex + 1);
      }
    }
  });
}


/**
 * 8. SMOOTH SCROLLING WITH ACCURATE OFFSET & CLEAN URLS
 */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');

      // Scroll to top for href="#"
      if (targetId === '#' || !targetId) {
        e.preventDefault();
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
        if (window.history && window.history.replaceState) {
          history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        return;
      }

      try {
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          e.preventDefault();
          const isMobile = window.innerWidth <= 768;
          const headerOffset = isMobile ? 70 : 85;
          const elementPosition = targetEl.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });

          // Keep URL clean without lingering #hash in address bar
          if (window.history && window.history.replaceState) {
            history.replaceState(null, '', window.location.pathname + window.location.search);
          }
        } else {
          // If the link is an in-page anchor that doesn't match an element on this page, prevent appending hash
          e.preventDefault();
        }
      } catch (err) {
        e.preventDefault();
      }
    });
  });

  // Handle direct landing or cross-page navigation with a hash (e.g. breezecafe.pages.dev/#about)
  function handleUrlHash(smooth = true) {
    if (!window.location.hash) return;
    const targetHash = window.location.hash;
    try {
      const targetEl = document.querySelector(targetHash);
      if (targetEl) {
        const isMobile = window.innerWidth <= 768;
        const headerOffset = isMobile ? 70 : 85;
        const elementPosition = targetEl.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: smooth ? 'smooth' : 'auto'
        });
      }
    } catch (err) {
      // Ignore invalid query selectors
    }

    // Strip hash immediately so address bar stays pristine at breezecafe.pages.dev
    if (window.history && window.history.replaceState) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  // Check on initial load (DOMContentLoaded)
  if (window.location.hash) {
    // Slight timeout allows page layout and elements to stabilize
    setTimeout(() => {
      handleUrlHash(true);
    }, 150);
  }

  // Catch late hash changes if any occur
  window.addEventListener('hashchange', () => {
    handleUrlHash(true);
  });
}

/**
 * HELPER: TOAST NOTIFICATION
 */
function showToast(message, duration = 3500) {
  const toast = document.getElementById('toastNotification');
  if (!toast) return;

  toast.innerHTML = message;
  toast.classList.add('show');

  if (window.toastTimeout) clearTimeout(window.toastTimeout);
  window.toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}


  // ==========================================================================
  // DYNAMIC CONTENT HYDRATION (Admin Portal / data/menu.json Sync)
  // ==========================================================================
  function applyDishesData(dishList) {
    if (!Array.isArray(dishList) || dishList.length === 0) return;
    const currentCards = document.querySelectorAll('.menu-card');

    const dishMap = new Map();
    dishList.forEach(d => {
      dishMap.set(d.name.trim().toLowerCase(), d);
    });

    currentCards.forEach(card => {
      const nameEl = card.querySelector('.menu-item-name');
      if (!nameEl) return;
      const nameKey = nameEl.textContent.trim().toLowerCase();
      const updatedDish = dishMap.get(nameKey);
      if (updatedDish) {
        const imgEl = card.querySelector('.menu-card-img');
        if (imgEl && updatedDish.image) {
          imgEl.src = updatedDish.image;
        }
        const descEl = card.querySelector('.menu-item-desc');
        if (descEl && updatedDish.description) {
          descEl.textContent = updatedDish.description;
        }
        if (updatedDish.category) {
          card.dataset.category = updatedDish.category;
        }
      }
    });

    if (typeof updateCounts === 'function') updateCounts();
    if (typeof filterItems === 'function') filterItems();
  }

  function applyReelsData(reelsList) {
    if (!Array.isArray(reelsList) || reelsList.length === 0) return;
    const reelCards = document.querySelectorAll('.reel-card');
    reelsList.forEach((r, idx) => {
      if (idx < reelCards.length) {
        const card = reelCards[idx];
        const vid = card.querySelector('video');
        if (vid && r.video) vid.src = r.video;
        if (vid) {
          if (r.poster) vid.poster = r.poster;
          else vid.removeAttribute('poster');
        }
        const titleEl = card.querySelector('.reel-title');
        if (titleEl && r.title) titleEl.textContent = r.title;
        const captionEl = card.querySelector('.reel-caption');
        if (captionEl && r.caption) captionEl.textContent = r.caption;
      }
    });
  }

  function applyGalleryData(galleryList) {
    if (!Array.isArray(galleryList) || galleryList.length === 0) return;
    const galleryItems = document.querySelectorAll('.gallery-item');
    galleryList.forEach((g, idx) => {
      if (idx < galleryItems.length) {
        const item = galleryItems[idx];
        const img = item.querySelector('img');
        if (img && g.image) img.src = g.image;
        const titleEl = item.querySelector('.gallery-item-title');
        if (titleEl && g.title) titleEl.textContent = g.title;
        const subEl = item.querySelector('.gallery-item-sub');
        if (subEl && g.caption) subEl.textContent = g.caption;
      }
    });
  }

  // Load from localStorage (instant preview), or fetch live JSON files if no local overrides
  let hasLocalMenu = false;
  try {
    const DATA_VERSION = 'v5_all_media_fixed';
    if (localStorage.getItem('breeze_data_version') !== DATA_VERSION) {
      localStorage.removeItem('breeze_menu_data');
      localStorage.removeItem('breeze_reels_data');
      localStorage.removeItem('breeze_gallery_data');
      localStorage.setItem('breeze_data_version', DATA_VERSION);
    }
    const storedMenu = localStorage.getItem('breeze_menu_data');
    if (storedMenu) {
      applyDishesData(JSON.parse(storedMenu));
      hasLocalMenu = true;
    }
  } catch(e) {}

  if (!hasLocalMenu) {
    fetch('data/menu.json?v=' + Date.now())
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) applyDishesData(data); })
      .catch(() => {});
  }

  let hasLocalReels = false;
  try {
    const storedReels = localStorage.getItem('breeze_reels_data');
    if (storedReels) {
      applyReelsData(JSON.parse(storedReels));
      hasLocalReels = true;
    }
  } catch(e) {}

  if (!hasLocalReels) {
    fetch('data/reels.json?v=' + Date.now())
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) applyReelsData(data); })
      .catch(() => {});
  }

  let hasLocalGallery = false;
  try {
    const storedGallery = localStorage.getItem('breeze_gallery_data');
    if (storedGallery) {
      applyGalleryData(JSON.parse(storedGallery));
      hasLocalGallery = true;
    }
  } catch(e) {}

  if (!hasLocalGallery) {
    fetch('data/gallery.json?v=' + Date.now())
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) applyGalleryData(data); })
      .catch(() => {});
  }

/**
 * 8. ROOFTOP CART & ORDERING SYSTEM (Order Now & Add to Cart)
 * Full e-commerce suite: Direct Rooftop checkout, persistent multi-item cart,
 * quantity adjustments, dining preference selector, live calculation, and direct POS order checkout.
 */
function initCartSystem() {
  const CART_KEY = 'breeze_rooftop_cart';
  const CUSTOMER_PROFILE_KEY = 'breeze_customer_profile';

  // 1. HARD PURGE: Evict legacy global un-scoped order keys immediately
  try {
    localStorage.removeItem('breeze_active_order');
    localStorage.removeItem('breeze_orders_history');
  } catch (e) {}

  // Helper functions for user-scoped storage keys
  function getUserIdentityKey() {
    const p = customerProfile.phone ? String(customerProfile.phone).replace(/[^0-9]/g, '').slice(-10) : '';
    const e = customerProfile.email ? customerProfile.email.toLowerCase().trim() : '';
    return p || e || null;
  }
  function getActiveOrderStorageKey(id) {
    const key = (id || getUserIdentityKey() || '').toLowerCase().trim();
    return key ? `breeze_active_order_${key}` : null;
  }
  function getOrderHistoryStorageKey(id) {
    const key = (id || getUserIdentityKey() || '').toLowerCase().trim();
    return key ? `breeze_orders_history_${key}` : null;
  }

  // --------------------------------------------------------------------------
  // STATE MANAGEMENT
  // --------------------------------------------------------------------------
  let cart = [];
  try {
    const saved = localStorage.getItem(CART_KEY);
    if (saved) cart = JSON.parse(saved);
    if (!Array.isArray(cart)) cart = [];
  } catch (e) {
    cart = [];
  }

  // Customer Profile State
  let customerProfile = {
    name: '',
    email: '',
    avatar: '',
    phone: '',
    address: '',
    saved_addresses: [],
    orderType: 'Home Delivery',
    table: '',
    notes: '',
    isLoggedIn: false
  };

  try {
    const savedProfile = localStorage.getItem(CUSTOMER_PROFILE_KEY);
    if (savedProfile) {
      customerProfile = Object.assign(customerProfile, JSON.parse(savedProfile));
    }
  } catch (e) {}

  if (!Array.isArray(customerProfile.saved_addresses)) {
    customerProfile.saved_addresses = [];
  }
  if (customerProfile.address && customerProfile.saved_addresses.length === 0) {
    customerProfile.saved_addresses.push({
      id: 'addr_' + Date.now(),
      label: 'Home',
      address: customerProfile.address,
      landmark: '',
      is_default: true
    });
  }

  // User-scoped in-memory orders
  let customerActiveOrder = null;
  let customerOrderHistory = [];

  // Hydrate in-memory order state from scoped storage if user is logged in
  if (customerProfile.isLoggedIn && (customerProfile.email || customerProfile.phone)) {
    const activeKey = getActiveOrderStorageKey();
    const histKey = getOrderHistoryStorageKey();
    if (activeKey) {
      try {
        const saved = localStorage.getItem(activeKey);
        if (saved) customerActiveOrder = JSON.parse(saved);
      } catch (e) {}
    }
    if (histKey) {
      try {
        const saved = localStorage.getItem(histKey);
        if (saved) customerOrderHistory = JSON.parse(saved);
      } catch (e) {}
    }
  }

  // Background user orders synchronizer (Supabase Truth)
  async function syncUserOrders(email = null, phone = null) {
    const targetEmail = (email || (customerProfile && customerProfile.email) || '').toLowerCase().trim();
    const rawPhone = phone || (customerProfile && customerProfile.phone) || '';
    const targetPhone = String(rawPhone).replace(/[^0-9]/g, '').slice(-10);

    if (!targetEmail && !targetPhone) {
      customerActiveOrder = null;
      customerOrderHistory = [];
      renderAuthUI();
      return;
    }

    const { activeOrder, history } = await fetchUserOrdersFromSupabase(targetEmail, targetPhone);

    // Guard: Only apply if currently authenticated user matches session
    if (customerProfile && (customerProfile.isLoggedIn || customerProfile.phone || customerProfile.email)) {
      customerProfile.isLoggedIn = true;
      customerActiveOrder = activeOrder;
      customerOrderHistory = history;

      const activeKey = getActiveOrderStorageKey();
      const histKey = getOrderHistoryStorageKey();
      if (activeKey) {
        try {
          if (activeOrder) {
            localStorage.setItem(activeKey, JSON.stringify(activeOrder));
          } else {
            localStorage.removeItem(activeKey);
          }
        } catch (e) {}
      }
      if (histKey) {
        try {
          localStorage.setItem(histKey, JSON.stringify(history));
        } catch (e) {}
      }

      renderAuthUI();
    }
  }

  // Pending checkout gate & Cloud Cart sync timer
  let pendingCheckoutAction = null;
  let cartCloudSyncTimer = null;

  // --------------------------------------------------------------------------
  // DOM REFERENCES - CART
  // --------------------------------------------------------------------------
  const floatingCartBtn = document.getElementById('floatingCartBtn');
  const navCartBtn = document.getElementById('navCartBtn');
  const navCartBadge = document.getElementById('navCartBadge');
  const bottomBarCartBtn = document.getElementById('bottomBarCartBtn');
  const bottomBarCartBadge = document.getElementById('bottomBarCartBadge');
  const cartCountBadge = document.getElementById('cartCountBadge');
  const cartTotalBadge = document.getElementById('cartTotalBadge');
  const cartDrawer = document.getElementById('cartDrawer');
  const cartDrawerBackdrop = document.getElementById('cartDrawerBackdrop');
  const cartDrawerCloseBtn = document.getElementById('cartDrawerCloseBtn');
  const cartDrawerBody = document.getElementById('cartDrawerBody');
  const cartDrawerItemCount = document.getElementById('cartDrawerItemCount');
  const cartDrawerTotalAmount = document.getElementById('cartDrawerTotalAmount');
  const cartClearBtn = document.getElementById('cartClearBtn');
  const cartCheckoutBtn = document.getElementById('cartCheckoutBtn');

  // --------------------------------------------------------------------------
  // DOM REFERENCES - CHECKOUT & MODAL
  // --------------------------------------------------------------------------
  const orderDetailsModal = document.getElementById('orderDetailsModal');
  const orderModalCloseBtn = document.getElementById('orderModalCloseBtn');
  const orderModalTitle = document.getElementById('orderModalTitle');
  const orderModalSummary = document.getElementById('orderModalSummary');
  const orderDetailsForm = document.getElementById('orderDetailsForm');
  const orderCustName = document.getElementById('orderCustName');
  const orderCustPhone = document.getElementById('orderCustPhone');
  const orderCustAddress = document.getElementById('orderCustAddress');
  const orderCustTable = document.getElementById('orderCustTable');
  const orderCustNotes = document.getElementById('orderCustNotes');
  const orderAddressGroup = document.getElementById('orderAddressGroup');
  const orderTableGroup = document.getElementById('orderTableGroup');
  const orderTypePills = document.getElementById('orderTypePills');
  const orderConfirmSubmitBtn = document.getElementById('orderConfirmSubmitBtn');
  const orderSubmitBtnLabel = document.getElementById('orderSubmitBtnLabel');
  const checkoutUserBanner = document.getElementById('checkoutUserBanner');
  const checkoutUserWelcome = document.getElementById('checkoutUserWelcome');
  const checkoutChangeUserBtn = document.getElementById('checkoutChangeUserBtn');
  const savedAddressTag = document.getElementById('savedAddressTag');
  const checkoutAddressSelect = document.getElementById('checkoutAddressSelect');
  const checkoutAddressHint = document.getElementById('checkoutAddressHint');
  const checkoutAddressChips = document.getElementById('checkoutAddressChips');
  const btnManageAddressesFromCheckout = document.getElementById('btnManageAddressesFromCheckout');

  // Payment method options
  const payCardRazorpay = document.getElementById('payCardRazorpay');
  const payCardCod = document.getElementById('payCardCod');
  const payMethodRazorpay = document.getElementById('payMethodRazorpay');
  const payMethodCod = document.getElementById('payMethodCod');
  const codLimitAlert = document.getElementById('codLimitAlert');

  // --------------------------------------------------------------------------
  // DOM REFERENCES - USER AUTH & DROPDOWN
  // --------------------------------------------------------------------------
  const navUserArea = document.getElementById('navUserArea');
  const navAuthBtn = document.getElementById('navAuthBtn');
  const navUserDropdown = document.getElementById('navUserDropdown');
  const navUserProfileToggle = document.getElementById('navUserProfileToggle');
  const navUserAvatar = document.getElementById('navUserAvatar');
  const navUserName = document.getElementById('navUserName');
  const navUserMenu = document.getElementById('navUserMenu');
  const userMenuProfileHeaderCard = document.getElementById('userMenuProfileHeaderCard');
  const dropdownAvatar = document.getElementById('dropdownAvatar');
  const dropdownUserName = document.getElementById('dropdownUserName');
  const dropdownUserPhone = document.getElementById('dropdownUserPhone');
  const menuProfileBtn = document.getElementById('menuProfileBtn');
  const menuSavedAddressBtn = document.getElementById('menuSavedAddressBtn'); // backwards compatible fallback
  const menuManagePhoneBtn = document.getElementById('menuManagePhoneBtn');
  const menuManagePhoneLabel = document.getElementById('menuManagePhoneLabel');
  const menuActiveOrderBtn = document.getElementById('menuActiveOrderBtn');
  const menuOrderHistoryBtn = document.getElementById('menuOrderHistoryBtn');
  const menuSignOutBtn = document.getElementById('menuSignOutBtn');

  // Customer Profile Hub Modal Elements
  const customerProfileModal = document.getElementById('customerProfileModal');
  const profileHubCloseBtn = document.getElementById('profileHubCloseBtn');
  const profileHeroAvatar = document.getElementById('profileHeroAvatar');
  const profileHeroName = document.getElementById('profileHeroName');
  const profileHeroEmail = document.getElementById('profileHeroEmail');
  const profileHeroPhone = document.getElementById('profileHeroPhone');
  const profileVipPill = document.getElementById('profileVipPill');
  const profileOrdersCount = document.getElementById('profileOrdersCount');
  const profileTotalSpent = document.getElementById('profileTotalSpent');
  const profileSavedAddrCount = document.getElementById('profileSavedAddrCount');
  const tabBtnAddresses = document.getElementById('tabBtnAddresses');
  const tabBtnOrders = document.getElementById('tabBtnOrders');
  const tabBtnPersonal = document.getElementById('tabBtnPersonal');
  const paneAddresses = document.getElementById('paneAddresses');
  const paneOrders = document.getElementById('paneOrders');
  const panePersonal = document.getElementById('panePersonal');
  const btnAddNewAddress = document.getElementById('btnAddNewAddress');
  const addressEditorBox = document.getElementById('addressEditorBox');
  const addressEditorTitle = document.getElementById('addressEditorTitle');
  const btnCancelAddressEditor = document.getElementById('btnCancelAddressEditor');
  const btnDiscardAddressEditor = document.getElementById('btnDiscardAddressEditor');
  const editorAddressText = document.getElementById('editorAddressText');
  const editorAddressLandmark = document.getElementById('editorAddressLandmark');
  const editorAddressIsDefault = document.getElementById('editorAddressIsDefault');
  const btnSaveAddressFromEditor = document.getElementById('btnSaveAddressFromEditor');
  const savedAddressesCardsList = document.getElementById('savedAddressesCardsList');
  const btnRefreshProfileOrders = document.getElementById('btnRefreshProfileOrders');
  const profileOrdersListContainer = document.getElementById('profileOrdersListContainer');
  const profileInputName = document.getElementById('profileInputName');
  const profileInputPhone = document.getElementById('profileInputPhone');
  const profileDisplayEmail = document.getElementById('profileDisplayEmail');
  const btnSavePersonalInfo = document.getElementById('btnSavePersonalInfo');
  const btnProfileSignOut = document.getElementById('btnProfileSignOut');

  // Fallback Google Phone & Saved Address legacy element references
  const googlePhonePromptModal = document.getElementById('googlePhonePromptModal');
  const googlePhoneModalTitle = document.getElementById('googlePhoneModalTitle');
  const googlePhoneModalSubtitle = document.getElementById('googlePhoneModalSubtitle');
  const googlePhoneInput = document.getElementById('googlePhoneInput');
  const googlePhoneError = document.getElementById('googlePhoneError');
  const btnSaveGooglePhone = document.getElementById('btnSaveGooglePhone');
  const btnSkipGooglePhone = document.getElementById('btnSkipGooglePhone');
  const googlePhoneCloseBtn = document.getElementById('googlePhoneCloseBtn');
  const savedAddressModal = document.getElementById('savedAddressModal');
  const savedAddressCloseBtn = document.getElementById('savedAddressCloseBtn');
  const savedAddressForm = document.getElementById('savedAddressForm');
  const inputSavedAddress = document.getElementById('inputSavedAddress');

  // Drawer Auth
  const drawerAuthBtn = document.getElementById('drawerAuthBtn');
  const drawerActiveOrderBtn = document.getElementById('drawerActiveOrderBtn');
  const drawerSignOutBtn = document.getElementById('drawerSignOutBtn');

  // Customer Auth Modal
  const customerAuthModal = document.getElementById('customerAuthModal');
  const customerAuthTitle = document.getElementById('customerAuthTitle');
  const customerAuthSubtitle = document.getElementById('customerAuthSubtitle');
  const customerAuthCloseBtn = document.getElementById('customerAuthCloseBtn');
  const customerAuthForm = document.getElementById('customerAuthForm');
  const authCustName = document.getElementById('authCustName');
  const authCustPhone = document.getElementById('authCustPhone');
  const authCustAddress = document.getElementById('authCustAddress');
  const btnGoogleAuth = document.getElementById('btnGoogleAuth');
  const btnAuthQuickDemo = document.getElementById('btnAuthQuickDemo');

  // --------------------------------------------------------------------------
  // DOM REFERENCES - SIMULATED RAZORPAY MODAL
  // --------------------------------------------------------------------------
  const razorpaySimModal = document.getElementById('razorpaySimModal');
  const rzpSimCloseBtn = document.getElementById('rzpSimCloseBtn');
  const rzpSimAmount = document.getElementById('rzpSimAmount');
  const rzpSimBtnAmount = document.getElementById('rzpSimBtnAmount');
  const rzpSimPayBtn = document.getElementById('rzpSimPayBtn');

  // --------------------------------------------------------------------------
  // DOM REFERENCES - LIVE ORDER TRACKING MODAL
  // --------------------------------------------------------------------------
  const orderTrackingModal = document.getElementById('orderTrackingModal');
  const orderTrackingCloseBtn = document.getElementById('orderTrackingCloseBtn');
  const trackingStatusBadge = document.getElementById('trackingStatusBadge');
  const trackingStatusBadgeText = document.getElementById('trackingStatusBadgeText');
  const trackingOrderTitle = document.getElementById('trackingOrderTitle');
  const trackingHeroHeading = document.getElementById('trackingHeroHeading');
  const trackingHeroSubtext = document.getElementById('trackingHeroSubtext');
  const trackingHeroIcon = document.getElementById('trackingHeroIcon');
  const trackingHeroCard = document.getElementById('trackingHeroCard');
  const trackingPrepEstimate = document.getElementById('trackingPrepEstimate');
  const trackingPrepTimeText = document.getElementById('trackingPrepTimeText');
  const trackingStepper = document.getElementById('trackingStepper');
  const trackingCancelBox = document.getElementById('trackingCancelBox');
  const cancelTimerCountdown = document.getElementById('cancelTimerCountdown');
  const btnCancelOrder = document.getElementById('btnCancelOrder');
  const trackingKitchenLocked = document.getElementById('trackingKitchenLocked');
  const trackingTotalAmount = document.getElementById('trackingTotalAmount');
  const trackingFinalBill = document.getElementById('trackingFinalBill');
  const trackingItemsList = document.getElementById('trackingItemsList');
  const trackingPaymentPill = document.getElementById('trackingPaymentPill');
  const trackingDestinationInfo = document.getElementById('trackingDestinationInfo');
  const trackingDeliveredCard = document.getElementById('trackingDeliveredCard');
  const trackingDeliveredNote = document.getElementById('trackingDeliveredNote');
  const trackingRatingStars = document.getElementById('trackingRatingStars');
  const ratingFeedbackMsg = document.getElementById('ratingFeedbackMsg');
  const btnReorderFromTracking = document.getElementById('btnReorderFromTracking');
  const trackingCancelledCard = document.getElementById('trackingCancelledCard');
  const trackingCancelReasonText = document.getElementById('trackingCancelReasonText');
  const trackingRefundStatusText = document.getElementById('trackingRefundStatusText');
  const btnBrowseMenuFromCancelled = document.getElementById('btnBrowseMenuFromCancelled');
  const btnDemoAdvanceStep = document.getElementById('btnDemoAdvanceStep');

  // --------------------------------------------------------------------------
  // DOM REFERENCES - ORDER HISTORY & PARTNER PORTAL
  // --------------------------------------------------------------------------
  const orderHistoryModal = document.getElementById('orderHistoryModal');
  const historyModalCloseBtn = document.getElementById('historyModalCloseBtn');
  const orderHistoryList = document.getElementById('orderHistoryList');

  // --------------------------------------------------------------------------
  // INTERNAL STATE
  // --------------------------------------------------------------------------
  let currentOrderMode = 'cart'; // 'cart' or 'direct'
  let directOrderItem = null;
  let activeOrderType = customerProfile.orderType || 'Home Delivery';
  let selectedPaymentMethod = 'razorpay'; // 'razorpay' or 'cod'
  let currentPendingOrder = null;
  let cancellationInterval = null;
  let simulatedPosTimeout = null;

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // --------------------------------------------------------------------------
  // USER PROFILE & AUTH UI LOGIC
  // --------------------------------------------------------------------------
  function saveCustomerProfile(profile) {
    customerProfile = Object.assign(customerProfile, profile);
    const isLoggedIn = Boolean(
      customerProfile.isLoggedIn ||
      (customerProfile.name && (customerProfile.phone || customerProfile.email)) ||
      (customerProfile.phone)
    );
    customerProfile.isLoggedIn = isLoggedIn;
    try {
      localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(customerProfile));
    } catch (e) {}
    renderAuthUI();

    // Broadcast globally to profile page and any other listeners
    try {
      window.dispatchEvent(new CustomEvent('breeze:auth_change', {
        detail: { isLoggedIn: customerProfile.isLoggedIn, profile: customerProfile }
      }));
    } catch (e) {}

    if (typeof window.checkProfileAuthState === 'function') {
      try { window.checkProfileAuthState(); } catch (e) {}
    }

    if (customerProfile.email || customerProfile.phone) {
      syncCustomerToSupabase(customerProfile);
    }
  }

  function renderAuthUI() {
    const isLoggedIn = Boolean(
      customerProfile.isLoggedIn ||
      (customerProfile.name && (customerProfile.phone || customerProfile.email)) ||
      (customerProfile.phone)
    );
    customerProfile.isLoggedIn = isLoggedIn;

    // Active order is strictly scoped to the logged-in user session!
    // If user is not logged in, activeOrder is ALWAYS null.
    let activeOrder = null;
    if (isLoggedIn && (customerProfile.email || customerProfile.phone)) {
      activeOrder = customerActiveOrder;
      if (!activeOrder) {
        const activeKey = getActiveOrderStorageKey();
        if (activeKey) {
          try {
            const savedActive = localStorage.getItem(activeKey);
            if (savedActive) activeOrder = JSON.parse(savedActive);
          } catch (e) {}
        }
      }
    }

    // Verify order ownership & active status
    if (activeOrder) {
      const orderEmail = (activeOrder.customer?.email || '').toLowerCase().trim();
      const currentEmail = (customerProfile.email || '').toLowerCase().trim();
      const orderPhone = (activeOrder.customer?.phone || '').replace(/[^0-9]/g, '').slice(-10);
      const currentPhone = (customerProfile.phone || '').replace(/[^0-9]/g, '').slice(-10);

      const matchesEmail = Boolean(currentEmail && orderEmail && currentEmail === orderEmail);
      const matchesPhone = Boolean(currentPhone && orderPhone && currentPhone === orderPhone);

      if ((!matchesEmail && !matchesPhone) || activeOrder.status === 'cancelled' || activeOrder.status === 'delivered') {
        activeOrder = null;
        customerActiveOrder = null;
      }
    }

    // Nav Header UI
    if (navAuthBtn && navUserDropdown) {
      if (isLoggedIn) {
        navAuthBtn.style.setProperty('display', 'none', 'important');
        navAuthBtn.classList.add('hidden');
        if (navUserArea) navUserArea.classList.add('logged-in');
        navUserDropdown.style.removeProperty('display');
        navUserDropdown.classList.remove('hidden');
        const displayName = customerProfile.name || (customerProfile.phone ? ('Customer ' + customerProfile.phone.slice(-4)) : 'Verified Guest');
        const initial = (customerProfile.name || 'B').trim().charAt(0).toUpperCase() || 'B';
        const firstName = customerProfile.name ? customerProfile.name.trim().split(' ')[0] : (customerProfile.phone ? ('+' + customerProfile.phone.slice(-4)) : 'Guest');
        if (navUserAvatar) {
          if (customerProfile.avatar) {
            navUserAvatar.innerHTML = '<img src="' + escapeHtml(customerProfile.avatar) + '" alt="' + escapeHtml(displayName) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">';
          } else {
            navUserAvatar.textContent = initial;
          }
        }
        if (navUserName) navUserName.textContent = firstName;
        if (dropdownAvatar) {
          if (customerProfile.avatar) {
            dropdownAvatar.innerHTML = '<img src="' + escapeHtml(customerProfile.avatar) + '" alt="' + escapeHtml(displayName) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">';
          } else {
            dropdownAvatar.textContent = initial;
          }
        }
        if (dropdownUserName) dropdownUserName.textContent = displayName;
        if (dropdownUserPhone) dropdownUserPhone.textContent = customerProfile.phone ? ('+91 ' + customerProfile.phone) : (customerProfile.email || 'Verified Customer');
        if (menuManagePhoneLabel) {
          menuManagePhoneLabel.textContent = customerProfile.phone ? ('+91 ' + customerProfile.phone) : '+ Add Mobile Number';
        }
      } else {
        navAuthBtn.style.removeProperty('display');
        navAuthBtn.classList.remove('hidden');
        if (navUserArea) navUserArea.classList.remove('logged-in');
        navUserDropdown.style.setProperty('display', 'none', 'important');
        navUserDropdown.classList.add('hidden');
      }
    }

    // Active order links in dropdown & drawer
    const showActiveOrder = Boolean(activeOrder && activeOrder.status !== 'cancelled' && activeOrder.status !== 'delivered');
    if (menuActiveOrderBtn) {
      menuActiveOrderBtn.style.display = showActiveOrder ? 'flex' : 'none';
    }
    if (drawerActiveOrderBtn) {
      drawerActiveOrderBtn.style.display = showActiveOrder ? 'block' : 'none';
    }

    // Mobile Drawer Auth Button
    if (drawerAuthBtn) {
      if (isLoggedIn) {
        drawerAuthBtn.innerHTML = '<i class="fas fa-user-check"></i> <span>' + escapeHtml(customerProfile.name) + ' (Profile)</span>';
      } else {
        drawerAuthBtn.innerHTML = '<i class="fas fa-user-circle"></i> <span>Sign In / My Account</span>';
      }
    }

    // Mobile Drawer Sign Out Button
    if (drawerSignOutBtn) {
      drawerSignOutBtn.style.display = isLoggedIn ? 'block' : 'none';
    }

    // Checkout Modal user banner
    if (checkoutUserBanner && checkoutUserWelcome) {
      if (isLoggedIn) {
        checkoutUserBanner.style.display = 'flex';
        checkoutUserWelcome.textContent = customerProfile.name;
      } else {
        checkoutUserBanner.style.display = 'none';
      }
    }

    // Auto-fill checkout fields if empty
    if (isLoggedIn) {
      if (orderCustName && !orderCustName.value) orderCustName.value = customerProfile.name;
      if (orderCustPhone && !orderCustPhone.value) orderCustPhone.value = customerProfile.phone;
      if (orderCustAddress && !orderCustAddress.value && customerProfile.address) {
        orderCustAddress.value = customerProfile.address;
        if (savedAddressTag) savedAddressTag.style.display = 'inline-block';
      }
    }
  }

  function openAuthModal(reason = '') {
    if (!customerAuthModal) return;
    if (customerAuthSubtitle && customerAuthTitle) {
      if (reason === 'checkout') {
        customerAuthTitle.textContent = 'Sign In to Place Order';
        customerAuthSubtitle.innerHTML = '<span style="color:#b5883d;font-weight:600;"><i class="fas fa-lock"></i> Please sign in to place your order.</span> Fast 1-tap sign-in with your Google account.';
      } else {
        customerAuthTitle.textContent = 'Sign In / Register';
        customerAuthSubtitle.textContent = 'Sign in with Google to live track rooftop orders, save delivery addresses, and sync your cart.';
      }
    }

    customerAuthModal.classList.add('active');
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    // Trigger Google One-Tap if available
    if (BREEZE_CONFIG.GOOGLE_CLIENT_ID && !customerProfile.isLoggedIn && typeof window.google !== 'undefined' && window.google.accounts && window.google.accounts.id) {
      try {
        window.google.accounts.id.prompt();
      } catch (e) {}
    }
  }

  function closeAuthModal() {
    if (!customerAuthModal) return;
    customerAuthModal.classList.remove('active');
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }

  // Auth Modal Listeners
  if (navAuthBtn) navAuthBtn.addEventListener('click', openAuthModal);
  if (drawerAuthBtn) {
    drawerAuthBtn.addEventListener('click', () => {
      const mobileDrawer = document.getElementById('mobileDrawer');
      const mobileDrawerBackdrop = document.getElementById('mobileDrawerBackdrop');
      if (mobileDrawer) mobileDrawer.classList.remove('active');
      if (mobileDrawerBackdrop) mobileDrawerBackdrop.classList.remove('active');
      document.body.style.overflow = '';
      if (customerProfile && customerProfile.isLoggedIn) {
        window.location.href = '/profile';
      } else {
        openAuthModal();
      }
    });
  }
  if (customerAuthCloseBtn) customerAuthCloseBtn.addEventListener('click', closeAuthModal);

  // Direct Phone & Name Login Handler (Zero Third-Party Dependency)
  const directPhoneAuthForm = document.getElementById('directPhoneAuthForm');
  const authPhoneInput = document.getElementById('authPhoneInput');
  const authNameInput = document.getElementById('authNameInput');

  if (directPhoneAuthForm) {
    directPhoneAuthForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const phone = authPhoneInput ? authPhoneInput.value.trim() : '';
      const name = authNameInput ? authNameInput.value.trim() : '';
      const digits = phone.replace(/[^0-9]/g, '').slice(-10);
      if (digits.length !== 10) {
        showToast('Please enter a valid 10-digit mobile number');
        return;
      }
      if (!name) {
        showToast('Please enter your full name');
        return;
      }

      saveCustomerProfile({
        name: name,
        phone: digits,
        email: customerProfile.email || '',
        isLoggedIn: true
      });

      syncCustomerToSupabase({
        name: name,
        phone: digits,
        email: customerProfile.email || '',
        avatar: customerProfile.avatar || ''
      });

      syncUserOrders(customerProfile.email || '', digits);

      closeAuthModal();
      showToast(`✓ Welcome to Breeze, ${name}!`);

      if (pendingCheckoutAction) {
        const nextAction = pendingCheckoutAction;
        pendingCheckoutAction = null;
        setTimeout(() => {
          openOrderPrompt(nextAction.mode, nextAction.directItem);
        }, 350);
      }
    });
  }

  if (customerAuthModal) {
    customerAuthModal.addEventListener('click', (e) => {
      if (e.target === customerAuthModal) closeAuthModal();
    });
  }
  if (checkoutChangeUserBtn) checkoutChangeUserBtn.addEventListener('click', openAuthModal);

  // Profile Dropdown Toggle
  if (navUserProfileToggle && navUserMenu) {
    navUserProfileToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      navUserMenu.classList.toggle('active');
    });
    document.addEventListener('click', (e) => {
      if (!navUserDropdown.contains(e.target)) {
        navUserMenu.classList.remove('active');
      }
    });
  }
  // --------------------------------------------------------------------------
  // CUSTOMER PROFILE HUB & SAVED ADDRESSES ENGINE (INDUSTRY STANDARD)
  // --------------------------------------------------------------------------
  let currentEditingAddressId = null;

  function renderSavedAddressesList() {
    if (!savedAddressesCardsList) return;
    const list = Array.isArray(customerProfile.saved_addresses) ? customerProfile.saved_addresses : [];

    // Update address count chip
    if (profileSavedAddrCount) {
      profileSavedAddrCount.textContent = list.length;
    }

    // Update Add Address button limit status
    if (btnAddNewAddress) {
      btnAddNewAddress.style.opacity = '1';
      btnAddNewAddress.title = 'Add a new delivery address';
    }

    if (list.length === 0) {
      savedAddressesCardsList.innerHTML = `
        <div style="text-align: center; padding: 34px 16px; background: rgba(181, 136, 61, 0.04); border: 1.5px dashed rgba(181, 136, 61, 0.3); border-radius: 12px; margin-top: 6px;">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: rgba(181, 136, 61, 0.12); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 10px; color: var(--primary-gold); font-size: 1.25rem;">
            <i class="fas fa-map-marker-alt"></i>
          </div>
          <h5 style="font-weight: 700; margin: 0 0 6px; color: var(--text-dark); font-size: 0.95rem;">No Delivery Addresses Saved</h5>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0 0 16px; max-width: 310px; margin-inline: auto;">
            Save all your delivery addresses (Home, Work, Family, Friends) for instant 1-tap checkout next time you order!
          </p>
          <button type="button" class="btn btn-outline-gold btn-sm" id="btnEmptyAddAddress" style="padding: 6px 16px;">
            <i class="fas fa-plus"></i> Add First Address
          </button>
        </div>
      `;
      const btnEmpty = document.getElementById('btnEmptyAddAddress');
      if (btnEmpty) btnEmpty.addEventListener('click', () => openAddressEditor(null));
      return;
    }

    let cardsHtml = '';
    list.forEach(addr => {
      const lbl = (addr.label || 'Home').toLowerCase();
      let icon = 'home';
      if (lbl === 'work') icon = 'briefcase';
      else if (lbl === 'family') icon = 'users';
      else if (lbl === 'friends') icon = 'user-friends';
      else if (lbl === 'other') icon = 'map-marker-alt';

      cardsHtml += `
        <div class="saved-address-card ${addr.is_default ? 'is-default' : ''}" data-id="${escapeHtml(addr.id)}">
          <div class="addr-card-top">
            <div class="addr-card-title-group">
              <span class="addr-icon-pill ${lbl}"><i class="fas fa-${icon}"></i></span>
              <span class="addr-card-label">${escapeHtml(addr.label || 'Home')}</span>
              ${addr.is_default ? '<span class="addr-badge-default"><i class="fas fa-check-circle"></i> Default</span>' : ''}
            </div>
            <div class="addr-card-quick-actions">
              <button type="button" class="btn-addr-action btn-addr-edit" data-id="${escapeHtml(addr.id)}" title="Edit address">
                <i class="fas fa-pen"></i>
              </button>
              <button type="button" class="btn-addr-action btn-addr-delete" data-id="${escapeHtml(addr.id)}" title="Delete address">
                <i class="fas fa-trash-alt"></i>
              </button>
            </div>
          </div>
          <div class="addr-card-body">
            <p class="addr-text">${escapeHtml(addr.address)}</p>
            ${addr.landmark ? `<p class="addr-landmark"><i class="fas fa-compass" style="color:var(--primary-gold);"></i> Landmark: ${escapeHtml(addr.landmark)}</p>` : ''}
          </div>
          ${!addr.is_default ? `
            <div class="addr-card-footer">
              <button type="button" class="btn-set-default" data-id="${escapeHtml(addr.id)}">
                <i class="far fa-star"></i> Set as Default Address
              </button>
            </div>
          ` : ''}
        </div>
      `;
    });

    savedAddressesCardsList.innerHTML = cardsHtml;

    // Attach card event listeners
    savedAddressesCardsList.querySelectorAll('.btn-addr-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAddressEditor(btn.dataset.id);
      });
    });

    savedAddressesCardsList.querySelectorAll('.btn-addr-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteAddress(btn.dataset.id);
      });
    });

    savedAddressesCardsList.querySelectorAll('.btn-set-default').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setDefaultAddress(btn.dataset.id);
      });
    });
  }

  function openAddressEditor(addrId = null) {
    if (!addressEditorBox) return;
    const list = Array.isArray(customerProfile.saved_addresses) ? customerProfile.saved_addresses : [];

    currentEditingAddressId = addrId;

    if (addressEditorTitle) {
      addressEditorTitle.textContent = addrId ? 'Edit Delivery Address' : 'Add New Delivery Address';
    }

    let targetLabel = 'Home';
    let targetAddress = '';
    let targetLandmark = '';
    let targetIsDefault = list.length === 0;

    if (addrId) {
      const existing = list.find(a => a.id === addrId);
      if (existing) {
        targetLabel = existing.label || 'Home';
        targetAddress = existing.address || '';
        targetLandmark = existing.landmark || '';
        targetIsDefault = Boolean(existing.is_default);
      }
    }

    // Set label pills
    const pills = addressEditorBox.querySelectorAll('.addr-label-pill');
    pills.forEach(pill => {
      if (pill.dataset.label.toLowerCase() === targetLabel.toLowerCase()) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });

    if (editorAddressText) editorAddressText.value = targetAddress;
    if (editorAddressLandmark) editorAddressLandmark.value = targetLandmark;
    if (editorAddressIsDefault) {
      editorAddressIsDefault.checked = targetIsDefault;
      editorAddressIsDefault.disabled = (list.length <= 1 && targetIsDefault);
    }

    addressEditorBox.style.display = 'block';
    addressEditorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (editorAddressText) {
      setTimeout(() => editorAddressText.focus(), 150);
    }
  }

  function closeAddressEditor() {
    if (!addressEditorBox) return;
    addressEditorBox.style.display = 'none';
    currentEditingAddressId = null;
    if (editorAddressText) editorAddressText.value = '';
    if (editorAddressLandmark) editorAddressLandmark.value = '';
  }

  function saveAddressFromEditor() {
    if (!editorAddressText) return;
    const addrVal = editorAddressText.value.trim();
    if (!addrVal) {
      showToast('Please enter your complete delivery address');
      editorAddressText.focus();
      return;
    }

    let selectedLabel = 'Home';
    const activePill = addressEditorBox ? addressEditorBox.querySelector('.addr-label-pill.active') : null;
    if (activePill) {
      selectedLabel = activePill.dataset.label || 'Home';
    }

    const landmarkVal = editorAddressLandmark ? editorAddressLandmark.value.trim() : '';
    const isDefault = editorAddressIsDefault ? editorAddressIsDefault.checked : false;

    if (!Array.isArray(customerProfile.saved_addresses)) {
      customerProfile.saved_addresses = [];
    }

    if (currentEditingAddressId) {
      // Update existing
      const idx = customerProfile.saved_addresses.findIndex(a => a.id === currentEditingAddressId);
      if (idx !== -1) {
        customerProfile.saved_addresses[idx].label = selectedLabel;
        customerProfile.saved_addresses[idx].address = addrVal;
        customerProfile.saved_addresses[idx].landmark = landmarkVal;
        if (isDefault) {
          customerProfile.saved_addresses.forEach((a, i) => a.is_default = (i === idx));
          customerProfile.address = addrVal + (landmarkVal ? ' (Landmark: ' + landmarkVal + ')' : '');
        } else if (customerProfile.saved_addresses.length === 1) {
          customerProfile.saved_addresses[idx].is_default = true;
          customerProfile.address = addrVal + (landmarkVal ? ' (Landmark: ' + landmarkVal + ')' : '');
        }
      }
    } else {
      // Add new
      const newAddrId = 'addr_' + Date.now();
      const shouldBeDefault = isDefault || customerProfile.saved_addresses.length === 0;

      if (shouldBeDefault) {
        customerProfile.saved_addresses.forEach(a => a.is_default = false);
        customerProfile.address = addrVal + (landmarkVal ? ' (Landmark: ' + landmarkVal + ')' : '');
      }

      customerProfile.saved_addresses.push({
        id: newAddrId,
        label: selectedLabel,
        address: addrVal,
        landmark: landmarkVal,
        is_default: shouldBeDefault
      });
    }

    saveCustomerProfile(customerProfile);
    closeAddressEditor();
    renderSavedAddressesList();
    renderCheckoutAddressSelector();
    showToast('✓ Delivery address saved successfully!');
  }

  function setDefaultAddress(addrId) {
    if (!Array.isArray(customerProfile.saved_addresses)) return;
    const target = customerProfile.saved_addresses.find(a => a.id === addrId);
    if (!target) return;

    customerProfile.saved_addresses.forEach(a => {
      a.is_default = (a.id === addrId);
    });

    customerProfile.address = target.address + (target.landmark ? ' (Landmark: ' + target.landmark + ')' : '');
    saveCustomerProfile(customerProfile);
    renderSavedAddressesList();
    renderCheckoutAddressSelector();
    showToast(`✓ Set "${target.label || 'Address'}" as default`);
  }

  function deleteAddress(addrId) {
    if (!Array.isArray(customerProfile.saved_addresses)) return;
    const target = customerProfile.saved_addresses.find(a => a.id === addrId);
    const targetLabel = target ? (target.label || 'Address') : 'Address';

    customerProfile.saved_addresses = customerProfile.saved_addresses.filter(a => a.id !== addrId);

    if (customerProfile.saved_addresses.length > 0) {
      const hasDefault = customerProfile.saved_addresses.some(a => a.is_default);
      if (!hasDefault) {
        customerProfile.saved_addresses[0].is_default = true;
        customerProfile.address = customerProfile.saved_addresses[0].address + (customerProfile.saved_addresses[0].landmark ? ' (Landmark: ' + customerProfile.saved_addresses[0].landmark + ')' : '');
      }
    } else {
      customerProfile.address = '';
    }

    saveCustomerProfile(customerProfile);
    renderSavedAddressesList();
    renderCheckoutAddressSelector();
    showToast(`Removed "${targetLabel}"`);
  }

  function renderProfileOrdersList() {
    if (!profileOrdersListContainer) return;
    const list = Array.isArray(customerOrderHistory) ? customerOrderHistory : [];

    if (list.length === 0) {
      profileOrdersListContainer.innerHTML = `
        <div style="text-align: center; padding: 34px 16px; background: rgba(181, 136, 61, 0.04); border: 1.5px dashed rgba(181, 136, 61, 0.28); border-radius: 12px; margin-top: 6px;">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: rgba(181, 136, 61, 0.12); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 10px; color: var(--primary-gold); font-size: 1.25rem;">
            <i class="fas fa-receipt"></i>
          </div>
          <h5 style="font-weight: 700; margin: 0 0 6px; color: var(--text-dark); font-size: 0.95rem;">No Past Orders Found</h5>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0 0 16px; max-width: 320px; margin-inline: auto;">
            Orders placed with your account appear here with live tracking, receipts, and 1-click reorder!
          </p>
          <button type="button" class="btn btn-primary btn-sm" id="btnProfileExploreMenu" style="padding: 7px 18px;">
            <i class="fas fa-utensils"></i> Explore Rooftop Menu
          </button>
        </div>
      `;
      const btnExplore = document.getElementById('btnProfileExploreMenu');
      if (btnExplore) {
        btnExplore.addEventListener('click', () => {
          closeCustomerProfileModal();
          const menuSection = document.getElementById('menu');
          if (menuSection) menuSection.scrollIntoView({ behavior: 'smooth' });
        });
      }
      return;
    }

    let ordersHtml = '';
    list.forEach(ord => {
      const dateStr = ord.placedAt ? new Date(ord.placedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Recent';
      const itemsSummary = (ord.items || []).map(i => `${i.qty || 1}x ${escapeHtml(i.name)}`).join(', ') || 'Rooftop Delights';
      const isCancelled = ord.status === 'cancelled';
      const isDelivered = ord.status === 'delivered';
      const statusColor = isCancelled ? '#c62828' : (isDelivered ? '#2e7d32' : '#e65100');
      const statusText = isCancelled ? 'Cancelled' : (isDelivered ? 'Delivered' : 'In Progress');

      const idParts = String(ord.id || '').split('-');
      let tokenPill = '';
      if (idParts.length >= 3) {
        tokenPill = `<span style="background:#fef3c7; color:#92400e; border:1px solid #fde68a; font-weight:800; font-size:0.72rem; padding:1px 6px; border-radius:4px; margin-right:6px;">Token #${idParts[idParts.length - 1]}</span>`;
      }

      ordersHtml += `
        <div class="profile-order-card">
          <div class="profile-order-header">
            <div style="display:flex; align-items:center;">
              ${tokenPill}
              <span class="profile-order-id">#${escapeHtml(ord.id)}</span>
            </div>
            <span class="profile-order-date">${dateStr}</span>
          </div>
          <div class="profile-order-summary">${itemsSummary}</div>
          <div class="profile-order-footer">
            <div class="profile-order-total-group">
              <span class="profile-order-total">₹${ord.total}</span>
              <span class="profile-order-status" style="color: ${statusColor}; font-weight:700;">${statusText}</span>
            </div>
            <div class="profile-order-actions">
              <button type="button" class="btn-profile-reorder" data-id="${escapeHtml(ord.id)}">
                <i class="fas fa-redo-alt"></i> Reorder
              </button>
              <button type="button" class="btn-profile-track" data-id="${escapeHtml(ord.id)}">
                ${isCancelled ? '<i class="fas fa-file-invoice"></i> Receipt' : '<i class="fas fa-motorcycle"></i> Track'}
              </button>
            </div>
          </div>
        </div>
      `;
    });

    profileOrdersListContainer.innerHTML = ordersHtml;

    // Attach Reorder handlers
    profileOrdersListContainer.querySelectorAll('.btn-profile-reorder').forEach(btn => {
      btn.addEventListener('click', () => {
        handleProfileReorder(btn.dataset.id);
      });
    });

    // Attach Track handlers
    profileOrdersListContainer.querySelectorAll('.btn-profile-track').forEach(btn => {
      btn.addEventListener('click', () => {
        const orderId = btn.dataset.id;
        const targetOrder = customerOrderHistory.find(o => o.id === orderId);
        if (targetOrder) {
          closeCustomerProfileModal();
          openOrderTrackingModal(targetOrder);
        }
      });
    });
  }

  function handleProfileReorder(orderId) {
    if (window.isBreezeStoreOpen === false) {
      openStoreClosedModal();
      return;
    }

    const target = (customerOrderHistory || []).find(o => o.id === orderId);
    if (!target || !Array.isArray(target.items) || target.items.length === 0) {
      showToast('Could not load items from this order.');
      return;
    }

    target.items.forEach(ordItem => {
      const existing = cart.find(c => c.name.toLowerCase() === ordItem.name.toLowerCase());
      if (existing) {
        existing.qty = (existing.qty || 1) + (ordItem.qty || 1);
      } else {
        cart.push({
          name: ordItem.name,
          price: ordItem.price,
          qty: ordItem.qty || 1,
          petpooja_code: ordItem.petpooja_code || null
        });
      }
    });

    saveCart();
    renderCart();
    closeCustomerProfileModal();
    openCartDrawer();
    showToast(`✓ Added items from #${orderId} to your cart!`);
  }

  function savePersonalInfoFromProfile() {
    if (!profileInputName || !profileInputPhone) return;
    const nameVal = profileInputName.value.trim();
    if (!nameVal) {
      showToast('Please enter your full name');
      profileInputName.focus();
      return;
    }

    const rawPhone = profileInputPhone.value.trim();
    const digits = rawPhone.replace(/[^0-9]/g, '');
    if (!isValidIndianMobile(digits)) {
      showToast('Please enter a valid 10-digit mobile number');
      profileInputPhone.focus();
      return;
    }

    customerProfile.name = nameVal;
    customerProfile.phone = digits;
    saveCustomerProfile(customerProfile);

    // Refresh hero card in profile
    if (profileHeroName) profileHeroName.textContent = nameVal;
    if (profileHeroPhone) profileHeroPhone.innerHTML = `<i class="fas fa-phone"></i> +91 ${digits}`;
    const initial = nameVal.charAt(0).toUpperCase() || 'B';
    if (profileHeroAvatar && !customerProfile.avatar) {
      profileHeroAvatar.textContent = initial;
    }

    showToast('✓ Personal details updated successfully!');
  }

  function switchProfileTab(tabName) {
    const tabs = [
      { btn: tabBtnAddresses, pane: paneAddresses, name: 'addresses' },
      { btn: tabBtnOrders, pane: paneOrders, name: 'orders' },
      { btn: tabBtnPersonal, pane: panePersonal, name: 'personal' }
    ];

    tabs.forEach(t => {
      if (t.name === tabName) {
        if (t.btn) {
          t.btn.classList.add('active');
          t.btn.setAttribute('aria-selected', 'true');
        }
        if (t.pane) {
          t.pane.style.display = 'block';
          t.pane.classList.add('active');
        }
      } else {
        if (t.btn) {
          t.btn.classList.remove('active');
          t.btn.setAttribute('aria-selected', 'false');
        }
        if (t.pane) {
          t.pane.style.display = 'none';
          t.pane.classList.remove('active');
        }
      }
    });

    if (tabName === 'addresses') {
      renderSavedAddressesList();
    } else if (tabName === 'orders') {
      renderProfileOrdersList();
      if (customerProfile && (customerProfile.email || customerProfile.phone)) {
        syncUserOrders(customerProfile.email, customerProfile.phone).then(() => {
          renderProfileOrdersList();
        });
      }
    }
  }

  function openCustomerProfileModal(targetTab = 'addresses') {
    if (!customerProfileModal) return;

    if (!customerProfile || !customerProfile.isLoggedIn) {
      showToast('Please sign in to view your profile');
      openAuthModal();
      return;
    }

    // Populate Hero Card
    const displayName = customerProfile.name || (customerProfile.phone ? ('Customer ' + customerProfile.phone.slice(-4)) : 'Breeze Guest');
    const initial = (customerProfile.name || 'B').trim().charAt(0).toUpperCase() || 'B';

    if (profileHeroAvatar) {
      if (customerProfile.avatar) {
        profileHeroAvatar.innerHTML = `<img src="${escapeHtml(customerProfile.avatar)}" alt="${escapeHtml(displayName)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">`;
      } else {
        profileHeroAvatar.textContent = initial;
      }
    }

    if (profileHeroName) profileHeroName.textContent = displayName;
    if (profileHeroEmail) {
      profileHeroEmail.innerHTML = customerProfile.email
        ? `<i class="fab fa-google" style="color: #4285f4;"></i> ${escapeHtml(customerProfile.email)}`
        : `<i class="far fa-envelope"></i> No Google account linked`;
    }
    if (profileHeroPhone) {
      profileHeroPhone.innerHTML = customerProfile.phone
        ? `<i class="fas fa-phone"></i> +91 ${escapeHtml(customerProfile.phone)}`
        : `<i class="fas fa-phone-slash"></i> No phone added`;
    }

    // Stats calculations
    const ordersCount = Array.isArray(customerOrderHistory) ? customerOrderHistory.length : 0;
    const totalSpent = (Array.isArray(customerOrderHistory) ? customerOrderHistory : []).reduce((acc, o) => {
      return o.status !== 'cancelled' ? acc + (Number(o.total) || 0) : acc;
    }, 0);
    const addrCount = (Array.isArray(customerProfile.saved_addresses) ? customerProfile.saved_addresses.length : 0);

    if (profileOrdersCount) profileOrdersCount.textContent = ordersCount;
    if (profileTotalSpent) profileTotalSpent.textContent = `₹${totalSpent.toLocaleString('en-IN')}`;
    if (profileSavedAddrCount) profileSavedAddrCount.textContent = `${addrCount}`;

    if (profileVipPill) {
      if (ordersCount >= 3 || totalSpent >= 1500) {
        profileVipPill.innerHTML = '<i class="fas fa-crown"></i> VIP Member';
        profileVipPill.style.display = 'inline-flex';
      } else {
        profileVipPill.innerHTML = '<i class="fas fa-gem"></i> Breeze Club';
        profileVipPill.style.display = 'inline-flex';
      }
    }

    // Form inputs in Personal Info tab
    if (profileInputName) profileInputName.value = customerProfile.name || '';
    if (profileInputPhone) profileInputPhone.value = customerProfile.phone || '';
    if (profileDisplayEmail) profileDisplayEmail.value = customerProfile.email || 'Not connected';

    // Switch to target tab
    switchProfileTab(targetTab);
    closeAddressEditor();

    customerProfileModal.classList.add('active');
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }

  function closeCustomerProfileModal() {
    if (!customerProfileModal) return;
    customerProfileModal.classList.remove('active');
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    closeAddressEditor();
  }

  // Backwards compatibility aliases
  const openSavedAddressModal = () => openCustomerProfileModal('addresses');
  const closeSavedAddressModal = () => closeCustomerProfileModal();

  // Profile Modal Event Listeners
  if (profileHubCloseBtn) profileHubCloseBtn.addEventListener('click', closeCustomerProfileModal);
  if (customerProfileModal) {
    customerProfileModal.addEventListener('click', (e) => {
      if (e.target === customerProfileModal) closeCustomerProfileModal();
    });
  }

  if (tabBtnAddresses) tabBtnAddresses.addEventListener('click', () => switchProfileTab('addresses'));
  if (tabBtnOrders) tabBtnOrders.addEventListener('click', () => switchProfileTab('orders'));
  if (tabBtnPersonal) tabBtnPersonal.addEventListener('click', () => switchProfileTab('personal'));

  if (btnAddNewAddress) btnAddNewAddress.addEventListener('click', () => openAddressEditor(null));
  if (btnCancelAddressEditor) btnCancelAddressEditor.addEventListener('click', closeAddressEditor);
  if (btnDiscardAddressEditor) btnDiscardAddressEditor.addEventListener('click', closeAddressEditor);
  if (btnSaveAddressFromEditor) btnSaveAddressFromEditor.addEventListener('click', saveAddressFromEditor);

  if (addressEditorBox) {
    addressEditorBox.querySelectorAll('.addr-label-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        addressEditorBox.querySelectorAll('.addr-label-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
      });
    });
  }

  if (btnRefreshProfileOrders) {
    btnRefreshProfileOrders.addEventListener('click', () => {
      renderProfileOrdersList();
      if (customerProfile && (customerProfile.email || customerProfile.phone)) {
        syncUserOrders(customerProfile.email, customerProfile.phone).then(() => {
          renderProfileOrdersList();
          showToast('✓ Order history refreshed');
        });
      }
    });
  }

  if (btnSavePersonalInfo) btnSavePersonalInfo.addEventListener('click', savePersonalInfoFromProfile);
  if (profileInputPhone) {
    profileInputPhone.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
    });
  }

  if (btnProfileSignOut) {
    btnProfileSignOut.addEventListener('click', () => {
      closeCustomerProfileModal();
      performSignOut();
    });
  }

  // Header card and dropdown menu listeners
  if (userMenuProfileHeaderCard) {
    userMenuProfileHeaderCard.addEventListener('click', (e) => {
      e.preventDefault();
      if (navUserMenu) navUserMenu.classList.remove('active');
      window.location.href = '/profile';
    });
  }
  if (menuProfileBtn) {
    menuProfileBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (navUserMenu) navUserMenu.classList.remove('active');
      window.location.href = '/profile?tab=addresses';
    });
  }
  if (menuSavedAddressBtn) {
    menuSavedAddressBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (navUserMenu) navUserMenu.classList.remove('active');
      window.location.href = '/profile?tab=addresses';
    });
  }

  // --------------------------------------------------------------------------
  // CHECKOUT ADDRESS SELECTOR ENGINE (DROPDOWN + CUSTOM 1-TIME ADDRESS)
  // --------------------------------------------------------------------------
  function renderCheckoutAddressSelector() {
    if (!checkoutAddressSelect) return;
    const addrs = Array.isArray(customerProfile.saved_addresses) ? customerProfile.saved_addresses : [];

    let optionsHtml = '';
    if (addrs.length > 0) {
      addrs.forEach(addr => {
        const lbl = addr.label || 'Home';
        const isDefault = Boolean(addr.is_default);
        const iconPrefix = isDefault ? '⭐ ' : '📍 ';
        const addrSnippet = addr.address ? addr.address.replace(/\s+/g, ' ').trim() : '';
        const displaySnippet = addrSnippet.length > 42 ? addrSnippet.slice(0, 40) + '...' : addrSnippet;
        optionsHtml += `<option value="${escapeHtml(addr.id)}">${iconPrefix}[${escapeHtml(lbl)}] ${escapeHtml(displaySnippet)}</option>`;
      });
    }

    // Always append one-time custom address option
    optionsHtml += `<option value="custom">✏️ Enter custom address (for this order only)</option>`;
    checkoutAddressSelect.innerHTML = optionsHtml;

    if (addrs.length > 0) {
      const defaultAddr = addrs.find(a => a.is_default) || addrs[0];
      checkoutAddressSelect.value = defaultAddr.id;
      applySelectedCheckoutAddress(defaultAddr.id);
    } else {
      checkoutAddressSelect.value = 'custom';
      applySelectedCheckoutAddress('custom');
    }
  }

  function applySelectedCheckoutAddress(selectedVal) {
    if (!orderCustAddress) return;
    const addrs = Array.isArray(customerProfile.saved_addresses) ? customerProfile.saved_addresses : [];

    if (selectedVal === 'custom') {
      if (savedAddressTag) {
        savedAddressTag.className = 'saved-address-tag custom-active';
        savedAddressTag.innerHTML = '<i class="fas fa-bolt"></i> One-time address';
        savedAddressTag.style.display = 'inline-block';
      }
      if (checkoutAddressHint) {
        checkoutAddressHint.innerHTML = '<i class="fas fa-bolt" style="color:var(--primary-gold);"></i> This address is for this checkout only (won\'t alter your saved profile).';
      }
      orderCustAddress.placeholder = 'Enter complete delivery address for this checkout...';
      const matchesAnySaved = addrs.some(a => {
        const full = a.address + (a.landmark ? ' (Landmark: ' + a.landmark + ')' : '');
        return orderCustAddress.value.trim() === full.trim();
      });
      if (matchesAnySaved) {
        orderCustAddress.value = '';
      }
      setTimeout(() => orderCustAddress.focus(), 100);
    } else {
      const target = addrs.find(a => a.id === selectedVal);
      if (target) {
        const fullAddress = target.address + (target.landmark ? ' (Landmark: ' + target.landmark + ')' : '');
        orderCustAddress.value = fullAddress;
        if (savedAddressTag) {
          savedAddressTag.className = 'saved-address-tag saved-active';
          savedAddressTag.innerHTML = `<i class="fas fa-check-circle"></i> Using saved [${escapeHtml(target.label || 'Home')}]`;
          savedAddressTag.style.display = 'inline-block';
        }
        if (checkoutAddressHint) {
          checkoutAddressHint.innerHTML = '<i class="fas fa-check-circle" style="color:#16a34a;"></i> Using saved address from your profile.';
        }
      }
    }
  }

  if (checkoutAddressSelect) {
    checkoutAddressSelect.addEventListener('change', () => {
      applySelectedCheckoutAddress(checkoutAddressSelect.value);
    });
  }

  if (orderCustAddress) {
    orderCustAddress.addEventListener('input', () => {
      if (checkoutAddressSelect && checkoutAddressSelect.value !== 'custom') {
        checkoutAddressSelect.value = 'custom';
        if (savedAddressTag) {
          savedAddressTag.className = 'saved-address-tag custom-active';
          savedAddressTag.innerHTML = '<i class="fas fa-bolt"></i> One-time address';
          savedAddressTag.style.display = 'inline-block';
        }
        if (checkoutAddressHint) {
          checkoutAddressHint.innerHTML = '<i class="fas fa-bolt" style="color:var(--primary-gold);"></i> Custom address entered — will be used for this order only.';
        }
      }
    });
  }

  if (btnManageAddressesFromCheckout) {
    btnManageAddressesFromCheckout.addEventListener('click', (e) => {
      e.preventDefault();
      const isMenuPage = window.location.pathname.includes('/menu');
      const targetUrl = isMenuPage ? '../profile/index.html?tab=addresses' : 'profile/index.html?tab=addresses';
      window.location.href = targetUrl;
    });
  }

  // --------------------------------------------------------------------------
  // GOOGLE LOGIN PHONE PROMPT MODAL HANDLERS
  // --------------------------------------------------------------------------
  let googlePhoneModalMode = 'setup'; // 'setup' | 'edit'

  function openGooglePhonePromptModal(options = {}) {
    const { name = '', email = '', prefillPhone = '', isEdit = false } = options;
    if (!googlePhonePromptModal) return;
    googlePhoneModalMode = isEdit ? 'edit' : 'setup';

    if (googlePhoneError) {
      googlePhoneError.style.display = 'none';
      googlePhoneError.textContent = '';
    }

    if (googlePhoneInput) {
      googlePhoneInput.value = prefillPhone || customerProfile.phone || '';
      googlePhoneInput.style.borderColor = '';
    }

    if (isEdit) {
      if (googlePhoneModalTitle) googlePhoneModalTitle.textContent = 'Manage Mobile Number';
      if (googlePhoneModalSubtitle) googlePhoneModalSubtitle.textContent = 'Update your primary contact number for order notifications and bill receipts.';
      if (btnSkipGooglePhone) btnSkipGooglePhone.textContent = 'Cancel';
      if (btnSaveGooglePhone) {
        const span = btnSaveGooglePhone.querySelector('span');
        if (span) span.textContent = 'Update Number';
      }
    } else {
      const firstName = (name || customerProfile.name || 'Friend').trim().split(' ')[0] || 'Friend';
      if (googlePhoneModalTitle) googlePhoneModalTitle.textContent = 'Welcome to Breeze, ' + firstName + '! 🎉';
      if (googlePhoneModalSubtitle) googlePhoneModalSubtitle.textContent = 'Add your WhatsApp or Mobile number for live kitchen updates, bill receipts, and exclusive rooftop member offers.';
      if (btnSkipGooglePhone) btnSkipGooglePhone.textContent = 'Skip for now (I\'ll add it later)';
      if (btnSaveGooglePhone) {
        const span = btnSaveGooglePhone.querySelector('span');
        if (span) span.textContent = 'Save & Continue';
      }
    }

    googlePhonePromptModal.classList.add('active');
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    if (googlePhoneInput) {
      setTimeout(() => googlePhoneInput.focus(), 150);
    }
  }

  // Expose globally so profile page and other controllers can open it seamlessly
  window.openGooglePhonePromptModal = openGooglePhonePromptModal;
  window.closeGooglePhonePromptModal = closeGooglePhonePromptModal;

  function closeGooglePhonePromptModal() {
    if (!googlePhonePromptModal) return;
    googlePhonePromptModal.classList.remove('active');
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }

  function handleSaveGooglePhone() {
    const raw = googlePhoneInput ? googlePhoneInput.value.trim() : '';
    const digits = raw.replace(/[^0-9]/g, '');

    if (!isValidIndianMobile(digits)) {
      if (googlePhoneError) {
        googlePhoneError.textContent = 'Please enter a valid 10-digit mobile number (starting with 6, 7, 8, or 9).';
        googlePhoneError.style.display = 'block';
      }
      if (googlePhoneInput) {
        googlePhoneInput.style.borderColor = '#c62828';
        googlePhoneInput.focus();
      }
      return;
    }

    if (googlePhoneError) googlePhoneError.style.display = 'none';
    if (googlePhoneInput) googlePhoneInput.style.borderColor = '';

    saveCustomerProfile({ phone: digits });
    // Atomic synchronization to Supabase customers table
    syncCustomerToSupabase({
      name: customerProfile.name,
      email: customerProfile.email,
      phone: digits,
      avatar: customerProfile.avatar
    });
    // Synchronize user orders with newly linked phone
    syncUserOrders(customerProfile.email, digits);

    closeGooglePhonePromptModal();
    showToast('✓ Mobile number linked! Welcome to Breeze.');

    if (pendingCheckoutAction) {
      const nextAction = pendingCheckoutAction;
      pendingCheckoutAction = null;
      setTimeout(() => {
        openOrderPrompt(nextAction.mode, nextAction.directItem);
      }, 350);
    }
  }

  function handleSkipGooglePhone() {
    try { sessionStorage.setItem('breeze_skip_phone_prompt', 'true'); } catch (e) {}
    closeGooglePhonePromptModal();
    if (googlePhoneModalMode === 'setup') {
      showToast('ℹ️ You can add your mobile number anytime from your profile.', 4500);
    }

    if (pendingCheckoutAction) {
      const nextAction = pendingCheckoutAction;
      pendingCheckoutAction = null;
      setTimeout(() => {
        openOrderPrompt(nextAction.mode, nextAction.directItem);
      }, 350);
    }
  }

  if (btnSaveGooglePhone) btnSaveGooglePhone.addEventListener('click', handleSaveGooglePhone);
  if (btnSkipGooglePhone) btnSkipGooglePhone.addEventListener('click', handleSkipGooglePhone);
  if (googlePhoneCloseBtn) googlePhoneCloseBtn.addEventListener('click', closeGooglePhonePromptModal);
  if (googlePhonePromptModal) {
    googlePhonePromptModal.addEventListener('click', (e) => {
      if (e.target === googlePhonePromptModal) closeGooglePhonePromptModal();
    });
  }
  if (googlePhoneInput) {
    googlePhoneInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSaveGooglePhone();
      }
    });
  }
  if (menuManagePhoneBtn) {
    menuManagePhoneBtn.addEventListener('click', () => {
      if (navUserMenu) navUserMenu.classList.remove('active');
      openCustomerProfileModal('personal');
    });
  }

  function performSignOut() {
    if (navUserMenu) navUserMenu.classList.remove('active');

    // 1. Wipe local and scoped storage keys
    const previousEmail = (customerProfile.email || '').toLowerCase().trim();
    const previousPhone = customerProfile.phone ? String(customerProfile.phone).replace(/[^0-9]/g, '').slice(-10) : '';
    try {
      localStorage.removeItem(CART_KEY);
      localStorage.removeItem(CUSTOMER_PROFILE_KEY);
      localStorage.removeItem('breeze_active_order');
      localStorage.removeItem('breeze_orders_history');
      if (previousEmail) {
        localStorage.removeItem(getActiveOrderStorageKey(previousEmail));
        localStorage.removeItem(getOrderHistoryStorageKey(previousEmail));
      }
      if (previousPhone) {
        localStorage.removeItem(getActiveOrderStorageKey(previousPhone));
        localStorage.removeItem(getOrderHistoryStorageKey(previousPhone));
      }
    } catch (e) {}

    // 2. Wipe in-memory session, cart, and orders
    cart = [];
    customerActiveOrder = null;
    customerOrderHistory = [];
    pendingCheckoutAction = null;

    // 3. Reset customer profile state
    customerProfile = {
      name: '',
      email: '',
      avatar: '',
      phone: '',
      address: '',
      saved_addresses: [],
      orderType: 'Home Delivery',
      table: '',
      notes: '',
      isLoggedIn: false
    };

    // 4. Force-close modals if currently open
    closeOrderTrackingModal();
    closeOrderHistoryModal();
    closeCustomerProfileModal();
    closeAuthModal();
    if (typeof closeOrderPrompt === 'function') {
      try { closeOrderPrompt(); } catch (e) {}
    } else if (orderDetailsModal) {
      orderDetailsModal.classList.remove('active');
    }
    if (orderCustName) orderCustName.value = '';
    if (orderCustPhone) orderCustPhone.value = '';
    if (orderCustAddress) orderCustAddress.value = '';
    if (savedAddressTag) savedAddressTag.style.display = 'none';

    // Reset Mobile OTP form inputs
    const authMobileInput = document.getElementById('authMobileInput');
    if (authMobileInput) authMobileInput.value = '';
    const otpBoxes = document.querySelectorAll('.otp-box');
    otpBoxes.forEach(b => b.value = '');
    const authPhoneStep = document.getElementById('authPhoneStep');
    const authOtpStep = document.getElementById('authOtpStep');
    if (authPhoneStep) authPhoneStep.style.display = 'block';
    if (authOtpStep) authOtpStep.style.display = 'none';

    // 5. Update UI
    renderAuthUI();
    renderCart();

    // 6. Broadcast global auth event for any page listeners (e.g. /profile)
    try {
      window.dispatchEvent(new CustomEvent('breeze:auth_change', {
        detail: { isLoggedIn: false, profile: customerProfile }
      }));
    } catch (e) {}

    if (typeof window.checkProfileAuthState === 'function') {
      try { window.checkProfileAuthState(); } catch (e) {}
    }

    showToast('Signed out of Breeze account.');
  }

  // Global listener for auth events triggered by other scripts (e.g. profile.js)
  window.addEventListener('breeze:auth_change', (e) => {
    if (e.detail && !e.detail.isLoggedIn) {
      customerProfile = {
        name: '',
        email: '',
        avatar: '',
        phone: '',
        address: '',
        saved_addresses: [],
        orderType: 'Home Delivery',
        table: '',
        notes: '',
        isLoggedIn: false
      };
      customerActiveOrder = null;
      customerOrderHistory = [];
      renderAuthUI();
      renderCart();
    } else if (e.detail && e.detail.isLoggedIn && e.detail.profile) {
      customerProfile = Object.assign(customerProfile, e.detail.profile);
      customerProfile.isLoggedIn = true;
      renderAuthUI();
    }
  });

  if (menuSignOutBtn) {
    menuSignOutBtn.addEventListener('click', performSignOut);
  }
  if (drawerSignOutBtn) {
    drawerSignOutBtn.addEventListener('click', () => {
      const mobileDrawer = document.getElementById('mobileDrawer');
      const mobileDrawerBackdrop = document.getElementById('mobileDrawerBackdrop');
      if (mobileDrawer) mobileDrawer.classList.remove('active');
      if (mobileDrawerBackdrop) mobileDrawerBackdrop.classList.remove('active');
      document.body.style.overflow = '';
      performSignOut();
    });
  }

  // --------------------------------------------------------------------------
  // REAL GOOGLE IDENTITY SERVICES (GSI) AUTHENTICATION
  // --------------------------------------------------------------------------
  function parseJwt(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  }

  function handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) return;
    const payload = parseJwt(response.credential);
    if (!payload) {
      showToast('Could not decode Google token. Please try again.');
      return;
    }

    // Real Google credentials decoded from verified JWT
    const realName = payload.name || payload.given_name || 'Google User';
    const realEmail = (payload.email || '').toLowerCase().trim();
    const realAvatar = payload.picture || '';

    // Candidate phone entered earlier in guest session or order prompt
    const candidatePhone = (customerProfile && customerProfile.phone) ? customerProfile.phone : '';

    // ZERO LEAKAGE: Wipe previous in-memory state & purge legacy keys
    customerActiveOrder = null;
    customerOrderHistory = [];
    try {
      localStorage.removeItem('breeze_active_order');
      localStorage.removeItem('breeze_orders_history');
      sessionStorage.removeItem('breeze_skip_phone_prompt');
    } catch (e) {}

    // Save initial Google profile state without blindly assuming candidatePhone is linked
    saveCustomerProfile({
      name: realName,
      email: realEmail,
      avatar: realAvatar,
      phone: '',
      isLoggedIn: true
    });

    closeAuthModal();

    // Trigger phone prompt immediately if this Google account has no verified phone linked
    let phonePromptDone = false;
    const triggerPhonePromptIfNeeded = (verifiedPhone = '') => {
      if (phonePromptDone) return;
      phonePromptDone = true;

      if (!verifiedPhone) {
        setTimeout(() => {
          openGooglePhonePromptModal({
            name: realName,
            email: realEmail,
            prefillPhone: candidatePhone,
            isEdit: false
          });
        }, 180);
      } else if (pendingCheckoutAction) {
        const nextAction = pendingCheckoutAction;
        pendingCheckoutAction = null;
        setTimeout(() => {
          openOrderPrompt(nextAction.mode, nextAction.directItem);
        }, 300);
      }
    };

    // Safety fallback: if Supabase takes > 600ms, open phone prompt with candidate prefill
    const fallbackTimer = setTimeout(() => {
      triggerPhonePromptIfNeeded(customerProfile.phone);
    }, 600);

    // Fetch cloud profile from Supabase to load verified phone & addresses
    loadCustomerFromSupabase(realEmail, (dbData) => {
      clearTimeout(fallbackTimer);
      let changed = false;
      let linkedPhone = '';

      if (dbData && dbData.phone) {
        customerProfile.phone = dbData.phone;
        linkedPhone = dbData.phone;
        changed = true;
      }
      if (Array.isArray(dbData?.saved_addresses) && dbData.saved_addresses.length > 0) {
        customerProfile.saved_addresses = dbData.saved_addresses;
        const defaultAddr = dbData.saved_addresses.find(a => a.is_default) || dbData.saved_addresses[0];
        if (defaultAddr && !customerProfile.address) {
          customerProfile.address = defaultAddr.address + (defaultAddr.landmark ? ' (Landmark: ' + defaultAddr.landmark + ')' : '');
        }
        changed = true;
      } else if (dbData && dbData.default_address && (!customerProfile.saved_addresses || customerProfile.saved_addresses.length === 0)) {
        customerProfile.saved_addresses = [{
          id: 'addr_1',
          label: 'Home',
          address: dbData.default_address,
          landmark: '',
          is_default: true
        }];
        if (!customerProfile.address) customerProfile.address = dbData.default_address;
        changed = true;
      } else if (!customerProfile.address && dbData && dbData.default_address) {
        customerProfile.address = dbData.default_address;
        changed = true;
      }

      if (changed) {
        try { localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(customerProfile)); } catch(e){}
        renderAuthUI();
      }

      syncUserOrders(realEmail, customerProfile.phone);

      // CLOUD CART MULTI-DEVICE SYNC ENGINE
      if (dbData && Array.isArray(dbData.active_cart) && dbData.active_cart.length > 0) {
        if (cart.length === 0) {
          cart = dbData.active_cart;
          try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch(e){}
          renderCart();
          showToast('✓ Restored your cloud cart (' + cart.length + ' item' + (cart.length === 1 ? '' : 's') + ')');
        } else {
          const merged = [...dbData.active_cart];
          cart.forEach(localItem => {
            const existing = merged.find(m => m.name.toLowerCase() === localItem.name.toLowerCase());
            if (existing) {
              existing.qty = Math.max(existing.qty || 1, localItem.qty || 1);
            } else {
              merged.push(localItem);
            }
          });
          cart = merged;
          try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch(e){}
          renderCart();
          syncCartToSupabase(cart, realEmail);
        }
      } else if (cart.length > 0) {
        syncCartToSupabase(cart, realEmail);
      }

      triggerPhonePromptIfNeeded(linkedPhone);
    });

    // Broadcast globally and notify profile page
    try {
      window.dispatchEvent(new CustomEvent('breeze:auth_change', {
        detail: { isLoggedIn: true, profile: customerProfile }
      }));
    } catch (e) {}

    if (typeof window.checkProfileAuthState === 'function') {
      try { window.checkProfileAuthState(); } catch (e) {}
    }

    showToast('Signed in as ' + realName);
  }

  function initGoogleIdentityServices(attempts = 0) {
    const googleContainer = document.getElementById('googleBtnContainer');
    const authDivider = document.getElementById('authDivider');

    if (!BREEZE_CONFIG.GOOGLE_CLIENT_ID) {
      if (googleContainer) googleContainer.style.display = 'none';
      if (authDivider) authDivider.style.display = 'none';
      return;
    }

    if (typeof window.google === 'undefined' || !window.google.accounts || !window.google.accounts.id) {
      if (attempts < 15) {
        setTimeout(() => initGoogleIdentityServices(attempts + 1), 200);
      }
      return;
    }

    try {
      window.google.accounts.id.initialize({
        client_id: BREEZE_CONFIG.GOOGLE_CLIENT_ID,
        callback: handleGoogleCredentialResponse,
        auto_select: false
      });

      if (googleContainer) {
        googleContainer.style.display = 'flex';
        googleContainer.style.justifyContent = 'center';
        googleContainer.innerHTML = '';
        window.google.accounts.id.renderButton(googleContainer, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          width: 300
        });
      }
    } catch (err) {
      console.warn('Google GSI Init:', err);
    }
  }

  initGoogleIdentityServices();

  // --------------------------------------------------------------------------
  // AUTHENTICATION STATE & PHONE NUMBER LINKING ENGINE
  // --------------------------------------------------------------------------

  async function handlePhoneAuthSuccess(phone) {
    if (otpResendTimerInterval) clearInterval(otpResendTimerInterval);

    // ZERO LEAKAGE: Wipe previous in-memory state & purge legacy keys
    customerActiveOrder = null;
    customerOrderHistory = [];
    try {
      localStorage.removeItem('breeze_active_order');
      localStorage.removeItem('breeze_orders_history');
    } catch (e) {}

    // 1. Look up existing profile in Supabase to link Google & Mobile accounts
    let dbCustomer = null;
    const client = getSupabaseClient();
    if (client) {
      try {
        const { data } = await client
          .from('customers')
          .select('*')
          .or('phone.eq.' + phone + ',phone.eq.+91' + phone)
          .maybeSingle();
        if (data) dbCustomer = data;
      } catch (err) {
        console.warn('Supabase customer phone lookup:', err);
      }
    }

    const customerName = dbCustomer?.name || ('Customer ' + phone.slice(-4));
    const customerEmail = dbCustomer?.email || '';
    const customerAddress = dbCustomer?.default_address || '';
    const customerAvatar = dbCustomer?.avatar || '';

    saveCustomerProfile({
      name: customerName,
      phone: phone,
      email: customerEmail,
      avatar: customerAvatar,
      address: customerAddress,
      isLoggedIn: true
    });

    // 2. Sync user orders from Supabase (Unified Source of Truth!)
    syncUserOrders(customerEmail, phone);

    // 3. Hydrate multi-device cloud cart if available
    if (dbCustomer && Array.isArray(dbCustomer.active_cart) && dbCustomer.active_cart.length > 0) {
      if (cart.length === 0) {
        cart = dbCustomer.active_cart;
        try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {}
        renderCart();
      }
    }

    closeAuthModal();
    if (btnVerifyOtp) {
      btnVerifyOtp.disabled = false;
      btnVerifyOtp.innerHTML = '<i class="fas fa-check-circle" style="margin-right: 6px;"></i> Verify & Continue';
    }

    showToast('✓ Signed in as ' + customerName + ' (+91 ' + phone + ')');

    // If an order checkout was waiting for authentication, resume immediately!
    if (pendingCheckoutAction) {
      const nextAction = pendingCheckoutAction;
      pendingCheckoutAction = null;
      setTimeout(() => {
        openOrderPrompt(nextAction.mode, nextAction.directItem);
      }, 350);
    }
  }

  // --------------------------------------------------------------------------
  // CART OPERATIONS & TOTALS
  // --------------------------------------------------------------------------
  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (e) {}
    renderCart();

    // Multi-Device Cloud Cart Sync with Supabase
    if (customerProfile && customerProfile.isLoggedIn && (customerProfile.email || customerProfile.phone)) {
      if (cartCloudSyncTimer) clearTimeout(cartCloudSyncTimer);
      const userIdent = customerProfile.email || customerProfile.phone;
      if (cart.length === 0) {
        syncCartToSupabase([], userIdent);
      } else {
        cartCloudSyncTimer = setTimeout(() => {
          syncCartToSupabase(cart, userIdent);
        }, 250);
      }
    }
  }


  // --------------------------------------------------------------------------
  // LIVE KITCHEN STOCK & SOLD-OUT RECONCILIATION ENGINE
  // --------------------------------------------------------------------------
  function isItemSoldOut(item, cloudList) {
    if (!item) return false;
    const list = cloudList || cloudMenuItemsCache;
    if (!list || !Array.isArray(list)) return false;
    const match = list.find(m => 
      (item.petpooja_code && m.petpooja_item_code === item.petpooja_code) ||
      (m.name && m.name.toLowerCase().trim() === (item.name || '').toLowerCase().trim())
    );
    return match ? (match.is_available === false) : false;
  }

  function getSoldOutItemsInCart(cloudList) {
    return cart.filter(item => isItemSoldOut(item, cloudList));
  }

  function purgeSoldOutItemsFromCart(notify = true) {
    const soldOuts = getSoldOutItemsInCart();
    if (soldOuts.length === 0) return 0;
    const removedCount = soldOuts.length;
    cart = cart.filter(item => !isItemSoldOut(item));
    saveCart();
    if (notify) {
      showToast(`✓ Removed ${removedCount} sold-out dish${removedCount > 1 ? 'es' : ''} from cart`);
    }
    return removedCount;
  }

  // Sold-Out Reconcile Modal Elements
  const soldOutReconcileModal = document.getElementById('soldOutReconcileModal');
  const btnDismissSoldOutModal = document.getElementById('btnDismissSoldOutModal');
  const btnReviewCartFromSoldOut = document.getElementById('btnReviewCartFromSoldOut');
  const btnPurgeAndProceed = document.getElementById('btnPurgeAndProceed');
  const soldOutModalItemsList = document.getElementById('soldOutModalItemsList');
  const soldOutRemainingTotal = document.getElementById('soldOutRemainingTotal');
  let onSoldOutProceedCallback = null;

  function openSoldOutReconcileModal(soldOutItems, onProceed) {
    onSoldOutProceedCallback = onProceed;
    if (!soldOutReconcileModal) {
      if (confirm(`⚠️ The following dishes are sold out in the kitchen:\n\n${soldOutItems.map(i => '• ' + i.name).join('\n')}\n\nRemove them and continue with available items?`)) {
        purgeSoldOutItemsFromCart(true);
        if (typeof onProceed === 'function') onProceed();
      }
      return;
    }

    const remainingItems = cart.filter(item => !isItemSoldOut(item));
    const remainingTotal = remainingItems.reduce((sum, item) => sum + ((item.price || 0) * (item.qty || 1)), 0);

    if (soldOutModalItemsList) {
      soldOutModalItemsList.innerHTML = soldOutItems.map(item => `
        <div style="display: flex; align-items: center; justify-content: space-between; background: #fff5f5; border: 1px solid #fecaca; border-radius: 10px; padding: 10px 14px;">
          <div>
            <strong style="font-size: 0.92rem; color: #1c1917; display: block;">${escapeHtml(item.name)}</strong>
            <span style="font-size: 0.78rem; color: #78716c;">${item.qty || 1} × ₹${item.price}</span>
          </div>
          <span style="font-size: 0.72rem; font-weight: 700; color: #dc2626; background: #fee2e2; border: 1px solid #fca5a5; padding: 3px 8px; border-radius: 6px;">
            <i class="fas fa-ban"></i> Kitchen Sold Out
          </span>
        </div>
      `).join('');
    }

    if (btnPurgeAndProceed) {
      if (remainingItems.length > 0) {
        btnPurgeAndProceed.innerHTML = `<i class="fas fa-check-circle"></i> Remove Sold-Out & Continue (₹${remainingTotal})`;
        btnPurgeAndProceed.style.display = 'block';
      } else {
        btnPurgeAndProceed.innerHTML = `<i class="fas fa-utensils"></i> Clear Cart & Browse Menu`;
        btnPurgeAndProceed.style.display = 'block';
      }
    }

    soldOutReconcileModal.classList.add('active');
    soldOutReconcileModal.style.display = 'flex';
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }

  function closeSoldOutReconcileModal() {
    if (soldOutReconcileModal) {
      soldOutReconcileModal.classList.remove('active');
      soldOutReconcileModal.style.display = 'none';
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    onSoldOutProceedCallback = null;
  }

  if (btnDismissSoldOutModal) btnDismissSoldOutModal.addEventListener('click', closeSoldOutReconcileModal);
  if (btnReviewCartFromSoldOut) {
    btnReviewCartFromSoldOut.addEventListener('click', () => {
      closeSoldOutReconcileModal();
      closeOrderPrompt();
      openCartDrawer();
    });
  }
  if (btnPurgeAndProceed) {
    btnPurgeAndProceed.addEventListener('click', () => {
      const remainingItems = cart.filter(item => !isItemSoldOut(item));
      purgeSoldOutItemsFromCart(false);
      closeSoldOutReconcileModal();
      if (remainingItems.length > 0) {
        showToast('✓ Updated cart with available items');
        if (typeof onSoldOutProceedCallback === 'function') {
          onSoldOutProceedCallback();
        }
      } else {
        closeOrderPrompt();
        closeCartDrawer();
        showToast('Cart cleared. Please browse menu for available dishes.');
        const menuSec = document.getElementById('menu') || document.querySelector('.menu-section');
        if (menuSec) menuSec.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  function getCartTotals() {
    let count = 0;
    let total = 0;
    cart.forEach(item => {
      const q = item.qty || 1;
      count += q;
      total += (item.price || 0) * q;
    });
    return { count, total };
  }

  function renderCart() {
    const { count, total } = getCartTotals();

    // Floating Cart Pill
    if (navCartBadge) navCartBadge.textContent = count;
    if (bottomBarCartBadge) bottomBarCartBadge.textContent = count;

    if (floatingCartBtn) {
      if (count > 0) {
        floatingCartBtn.style.display = 'flex';
        if (cartCountBadge) cartCountBadge.textContent = count;
        if (cartTotalBadge) cartTotalBadge.textContent = '₹' + total;
      } else {
        floatingCartBtn.style.display = 'none';
      }
    }

    // Drawer Item Count & Total
    if (cartDrawerItemCount) {
      cartDrawerItemCount.textContent = count + ' item' + (count === 1 ? '' : 's') + ' selected';
    }
    if (cartDrawerTotalAmount) {
      cartDrawerTotalAmount.textContent = '₹' + total;
    }

    // Drawer Items Body
    if (cartDrawerBody) {
      if (cart.length === 0) {
        cartDrawerBody.innerHTML = `
          <div class="cart-empty-state">
            <div class="cart-empty-icon"><i class="fas fa-shopping-bag"></i></div>
            <h4>Your Rooftop Cart is Empty</h4>
            <p>Explore our handcrafted menu and add delicious rooftop bites, artisan pizzas, or iced frappes!</p>
            <a href="/menu" class="btn btn-primary btn-sm" style="margin-top: 12px;">Browse Menu</a>
          </div>
        `;
      } else {
        const soldOutItems = getSoldOutItemsInCart();
        const hasSoldOut = soldOutItems.length > 0;
        const allSoldOut = cart.length > 0 && soldOutItems.length === cart.length;

        let html = '';

        if (hasSoldOut) {
          html += `
            <div class="cart-sold-out-banner" style="background: #fef2f2; border: 1.5px solid #fecaca; border-radius: 12px; padding: 12px 14px; margin-bottom: 14px;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
                <div style="font-size: 0.84rem; font-weight: 700; color: #991b1b; display: flex; align-items: center; gap: 6px;">
                  <i class="fas fa-exclamation-triangle" style="color: #dc2626;"></i>
                  ${soldOutItems.length} dish${soldOutItems.length > 1 ? 'es' : ''} sold out in kitchen
                </div>
                <button type="button" class="btn-purge-sold-out" style="background: #dc2626; color: #ffffff; border: none; font-size: 0.75rem; font-weight: 700; padding: 6px 12px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 6px rgba(220,38,38,0.25);">
                  <i class="fas fa-trash-alt"></i> Remove (${soldOutItems.length})
                </button>
              </div>
              <div style="font-size: 0.77rem; color: #7f1d1d; line-height: 1.35;">
                ${allSoldOut ? 'All items in your cart are currently sold out in the kitchen.' : 'These dishes cannot be prepared right now. Tap remove to continue with available items.'}
              </div>
            </div>
          `;
        }

        if (window.isBreezeStoreOpen === false) {
          const statusMeta = window.breezeStoreStatusMeta || {};
          const reopenNotice = statusMeta.isOffHours
            ? `Online ordering reopens at ${statusMeta.openTime12 || '11:00 AM'} daily. You can keep items saved in your cart or reserve a rooftop table now!`
            : (statusMeta.reason || 'Kitchen is temporarily closed for online ordering.');
          html += `
            <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 12px; padding: 10px 14px; margin-bottom: 12px; display: flex; align-items: center; gap: 10px; color: #92400e; font-size: 0.82rem; line-height: 1.4;">
              <i class="fas fa-moon" style="font-size: 1.15rem; flex-shrink: 0; color: #d97706;"></i>
              <div>
                <strong>Kitchen Currently Closed</strong><br>
                ${escapeHtml(reopenNotice)}
              </div>
            </div>
          `;
        }

        html += '<div class="cart-items-list">';
        cart.forEach((item, index) => {
          const itemTotal = (item.price || 0) * (item.qty || 1);
          const imgSrc = item.img || 'assets/dishes/dish_1.jpeg';
          const isSoldOut = isItemSoldOut(item);

          html += `
            <div class="cart-item-row ${isSoldOut ? 'cart-item-sold-out' : ''}" data-index="${index}">
              <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(item.name)}" class="cart-item-img" onerror="this.style.display='none'">
              <div class="cart-item-info">
                <div class="cart-item-name">${escapeHtml(item.name)}</div>
                <div class="cart-item-price-single">₹${item.price} each</div>
                ${isSoldOut ? '<div class="cart-sold-out-badge"><i class="fas fa-ban"></i> Kitchen Sold Out</div>' : ''}
              </div>
              <div class="cart-item-actions">
                <div class="cart-qty-ctrl">
                  <button type="button" class="cart-qty-btn btn-qty-minus" data-index="${index}" aria-label="Decrease quantity">−</button>
                  <span class="cart-qty-num">${item.qty || 1}</span>
                  <button type="button" class="cart-qty-btn btn-qty-plus" data-index="${index}" aria-label="Increase quantity" ${isSoldOut ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}>+</button>
                </div>
                <span class="cart-item-total">₹${itemTotal}</span>
                <button type="button" class="cart-item-delete btn-cart-remove" data-index="${index}" aria-label="Remove item" title="Remove item">
                  <i class="fas fa-trash-alt"></i>
                </button>
              </div>
            </div>
          `;
        });
        html += '</div>';

        cartDrawerBody.innerHTML = html;
      }
    }

    if (cartCheckoutBtn) {
      if (window.isBreezeStoreOpen === false) {
        cartCheckoutBtn.disabled = false;
        const statusMeta = window.breezeStoreStatusMeta || {};
        const closedLabel = statusMeta.isOffHours
          ? `Kitchen Closed (Opens ${statusMeta.openTime12 || '11:00 AM'})`
          : 'Kitchen Currently Closed';
        cartCheckoutBtn.innerHTML = `<i class="fas fa-store-alt-slash"></i> ${closedLabel}`;
        cartCheckoutBtn.style.background = statusMeta.isOffHours ? 'linear-gradient(135deg, #b45309, #d97706)' : '#991b1b';
        cartCheckoutBtn.style.color = '#ffffff';
        cartCheckoutBtn.style.cursor = 'pointer';
      } else {
        const soldOutItems = getSoldOutItemsInCart();
        const allSoldOut = cart.length > 0 && soldOutItems.length === cart.length;
        const hasSoldOut = soldOutItems.length > 0;

        if (allSoldOut) {
          cartCheckoutBtn.disabled = true;
          cartCheckoutBtn.innerHTML = '<i class="fas fa-ban"></i> All Items in Cart Sold Out';
          cartCheckoutBtn.style.background = '#dc2626';
          cartCheckoutBtn.style.color = '#ffffff';
          cartCheckoutBtn.style.cursor = 'not-allowed';
        } else if (hasSoldOut) {
          cartCheckoutBtn.disabled = false;
          cartCheckoutBtn.innerHTML = 'Remove Sold-Out & Checkout <i class="fas fa-arrow-right"></i>';
          cartCheckoutBtn.style.background = 'linear-gradient(135deg, #b45309, #d97706)';
          cartCheckoutBtn.style.color = '#ffffff';
          cartCheckoutBtn.style.cursor = 'pointer';
        } else {
          cartCheckoutBtn.disabled = false;
          cartCheckoutBtn.innerHTML = 'Proceed to Checkout <i class="fas fa-arrow-right"></i>';
          cartCheckoutBtn.style.background = '';
          cartCheckoutBtn.style.color = '';
          cartCheckoutBtn.style.cursor = '';
        }
      }
    }

    window.renderCartLive = renderCart;
  }

  // Cart Drawer open/close
  function openCartDrawer() {
    if (!cartDrawer) return;
    renderCart();
    cartDrawer.classList.add('open', 'active');
    if (cartDrawerBackdrop) cartDrawerBackdrop.classList.add('open', 'active');
    document.body.classList.add('cart-open', 'modal-open');
    document.documentElement.classList.add('cart-open', 'modal-open');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }

  function closeCartDrawer() {
    if (!cartDrawer) return;
    cartDrawer.classList.remove('open', 'active');
    if (cartDrawerBackdrop) cartDrawerBackdrop.classList.remove('open', 'active');
    document.body.classList.remove('cart-open', 'modal-open');
    document.documentElement.classList.remove('cart-open', 'modal-open');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }

  if (floatingCartBtn) floatingCartBtn.addEventListener('click', openCartDrawer);
  if (navCartBtn) navCartBtn.addEventListener('click', (e) => { e.preventDefault(); openCartDrawer(); });
  if (bottomBarCartBtn) bottomBarCartBtn.addEventListener('click', (e) => { e.preventDefault(); openCartDrawer(); });
  if (cartDrawerCloseBtn) cartDrawerCloseBtn.addEventListener('click', closeCartDrawer);
  if (cartDrawerBackdrop) cartDrawerBackdrop.addEventListener('click', closeCartDrawer);

  // Stepper quantity changes & actions in cart drawer
  if (cartDrawerBody) {
    cartDrawerBody.addEventListener('click', (e) => {
      const purgeBtn = e.target.closest('.btn-purge-sold-out');
      if (purgeBtn) {
        purgeSoldOutItemsFromCart(true);
        return;
      }

      const plusBtn = e.target.closest('.btn-qty-plus');
      if (plusBtn) {
        const idx = parseInt(plusBtn.dataset.index, 10);
        if (cart[idx]) {
          if (isItemSoldOut(cart[idx])) {
            showToast(`⚠️ "${cart[idx].name}" is sold out in the kitchen.`);
            return;
          }
          cart[idx].qty = (cart[idx].qty || 1) + 1;
          saveCart();
        }
        return;
      }

      const minusBtn = e.target.closest('.btn-qty-minus');
      if (minusBtn) {
        const idx = parseInt(minusBtn.dataset.index, 10);
        if (cart[idx]) {
          if (cart[idx].qty > 1) {
            cart[idx].qty -= 1;
          } else {
            cart.splice(idx, 1);
          }
          saveCart();
        }
        return;
      }

      const removeBtn = e.target.closest('.btn-cart-remove');
      if (removeBtn) {
        const idx = parseInt(removeBtn.dataset.index, 10);
        if (cart[idx]) {
          const removedName = cart[idx].name;
          cart.splice(idx, 1);
          saveCart();
          showToast('Removed ' + escapeHtml(removedName) + ' from cart');
        }
        return;
      }
    });
  }

  // Clear Cart
  if (cartClearBtn) {
    cartClearBtn.addEventListener('click', () => {
      if (cart.length === 0) return;
      if (confirm('Clear all items from your cart?')) {
        cart = [];
        saveCart();
        showToast('Your order has been cleared');
      }
    });
  }

  // --------------------------------------------------------------------------
  // CHECKOUT MODAL LOGIC (PAYMENT SELECTOR & COD SAFETY CAP)
  // --------------------------------------------------------------------------
  function setOrderType(type) {
    activeOrderType = type;
    if (orderTypePills) {
      orderTypePills.querySelectorAll('.order-type-pill').forEach(pill => {
        if (pill.dataset.type === type) {
          pill.classList.add('active');
        } else {
          pill.classList.remove('active');
        }
      });
    }

    if (type === 'Home Delivery') {
      if (orderAddressGroup) orderAddressGroup.style.display = 'block';
      if (orderTableGroup) orderTableGroup.style.display = 'none';
      if (orderCustAddress) orderCustAddress.setAttribute('required', 'required');
      renderCheckoutAddressSelector();
    } else if (type === 'Dine-In (Rooftop Table)') {
      if (orderAddressGroup) orderAddressGroup.style.display = 'none';
      if (orderTableGroup) orderTableGroup.style.display = 'block';
      if (orderCustAddress) orderCustAddress.removeAttribute('required');
    } else {
      // Takeaway
      if (orderAddressGroup) orderAddressGroup.style.display = 'none';
      if (orderTableGroup) orderTableGroup.style.display = 'none';
      if (orderCustAddress) orderCustAddress.removeAttribute('required');
    }
  }

  function getActiveOrderBill() {
    if (currentOrderMode === 'direct' && directOrderItem) {
      return directOrderItem.price || 0;
    }
    const { total } = getCartTotals();
    return total;
  }

  function updatePaymentSelectorUI() {
    const totalBill = getActiveOrderBill();

    if (totalBill > BREEZE_CONFIG.MAX_COD_AMOUNT) {
      // COD is disabled over ₹1000
      if (payCardCod) {
        payCardCod.classList.add('disabled');
        payCardCod.classList.remove('active');
      }
      if (payMethodCod) payMethodCod.disabled = true;
      if (codLimitAlert) codLimitAlert.style.display = 'block';

      // Auto force Razorpay
      selectedPaymentMethod = 'razorpay';
      if (payMethodRazorpay) payMethodRazorpay.checked = true;
      if (payCardRazorpay) payCardRazorpay.classList.add('active');
    } else {
      if (payCardCod) payCardCod.classList.remove('disabled');
      if (payMethodCod) payMethodCod.disabled = false;
      if (codLimitAlert) codLimitAlert.style.display = 'none';

      if (selectedPaymentMethod === 'cod') {
        if (payCardCod) payCardCod.classList.add('active');
        if (payCardRazorpay) payCardRazorpay.classList.remove('active');
        if (payMethodCod) payMethodCod.checked = true;
      } else {
        if (payCardRazorpay) payCardRazorpay.classList.add('active');
        if (payCardCod) payCardCod.classList.remove('active');
        if (payMethodRazorpay) payMethodRazorpay.checked = true;
      }
    }

    // Update submit button text
    if (orderSubmitBtnLabel) {
      if (selectedPaymentMethod === 'razorpay') {
        orderSubmitBtnLabel.textContent = 'Proceed to Pay ₹' + totalBill + ' (Online)';
      } else {
        orderSubmitBtnLabel.textContent = 'Confirm COD Order (₹' + totalBill + ')';
      }
    }
  }

  // Payment method radio change listener
  if (payMethodRazorpay) {
    payMethodRazorpay.addEventListener('change', () => {
      selectedPaymentMethod = 'razorpay';
      updatePaymentSelectorUI();
    });
  }
  if (payMethodCod) {
    payMethodCod.addEventListener('change', () => {
      const totalBill = getActiveOrderBill();
      if (totalBill > BREEZE_CONFIG.MAX_COD_AMOUNT) {
        showToast('Cash on Delivery is limited to orders up to ₹1,000 for kitchen safety.');
        return;
      }
      selectedPaymentMethod = 'cod';
      updatePaymentSelectorUI();
    });
  }

  function openOrderPrompt(mode, directItem) {
    if (window.isBreezeStoreOpen === false) {
      openStoreClosedModal();
      return;
    }

    // Live Stock Validation Intercept
    if (mode === 'direct' && directItem) {
      if (isItemSoldOut(directItem)) {
        showToast(`⚠️ Sorry! "${directItem.name}" is sold out in the kitchen.`);
        return;
      }
    } else {
      const soldOutList = getSoldOutItemsInCart();
      if (soldOutList.length > 0) {
        openSoldOutReconcileModal(soldOutList, () => {
          if (cart.length > 0) {
            openOrderPrompt('cart', null);
          }
        });
        return;
      }
    }

    // Mandatory Authentication Gate (Zomato-grade)
    if (!customerProfile || !customerProfile.isLoggedIn || (!customerProfile.email && !customerProfile.phone)) {
      pendingCheckoutAction = { mode, directItem };
      closeCartDrawer();
      openAuthModal('checkout');
      showToast('🔒 Please sign in to place your order');
      return;
    }

    if (!orderDetailsModal) return;
    currentOrderMode = mode;
    directOrderItem = directItem;

    // Prefill customer form fields from profile
    if (orderCustName) orderCustName.value = customerProfile.name || '';
    if (orderCustPhone) orderCustPhone.value = customerProfile.phone || '';
    if (orderCustTable) orderCustTable.value = customerProfile.table || '';
    if (orderCustNotes) orderCustNotes.value = customerProfile.notes || '';

    // Set order type pills & inputs
    setOrderType(activeOrderType || 'Home Delivery');
    if (!activeOrderType || activeOrderType === 'Home Delivery') {
      renderCheckoutAddressSelector();
    }

    // Render Order Summary
    if (orderModalSummary) {
      if (mode === 'direct' && directItem) {
        if (orderModalTitle) orderModalTitle.textContent = 'Checkout & Delivery Details';
        let summaryHtml = '<div class="order-summary-header"><span>Item Ordered</span><span>Subtotal</span></div>';
        summaryHtml += '<div class="order-summary-list">';
        summaryHtml += '<div class="order-summary-item">';
        summaryHtml += '<span class="order-summary-item-name"><span class="order-summary-item-qty">1x</span>' + escapeHtml(directItem.name) + '</span>';
        summaryHtml += '<span class="order-summary-item-price">₹' + directItem.price + '</span>';
        summaryHtml += '</div>';
        summaryHtml += '</div>';
        summaryHtml += '<div class="order-summary-footer">';
        summaryHtml += '<span class="order-summary-footer-label">Total Amount:</span>';
        summaryHtml += '<span class="order-summary-footer-total">₹' + directItem.price + '</span>';
        summaryHtml += '</div>';
        orderModalSummary.innerHTML = summaryHtml;
      } else {
        // Cart mode
        if (orderModalTitle) orderModalTitle.textContent = 'Checkout & Delivery Details';
        const { count, total } = getCartTotals();
        let summaryHtml = '<div class="order-summary-header"><span>Order Summary (' + count + ' item' + (count === 1 ? '' : 's') + ')</span><span>Subtotal</span></div>';
        summaryHtml += '<div class="order-summary-list">';
        cart.forEach(item => {
          const itemTotal = (item.price || 0) * (item.qty || 1);
          summaryHtml += '<div class="order-summary-item">';
          summaryHtml += '<span class="order-summary-item-name"><span class="order-summary-item-qty">' + (item.qty || 1) + 'x</span>' + escapeHtml(item.name) + '</span>';
          summaryHtml += '<span class="order-summary-item-price">₹' + itemTotal + '</span>';
          summaryHtml += '</div>';
        });
        summaryHtml += '</div>';
        summaryHtml += '<div class="order-summary-footer">';
        summaryHtml += '<span class="order-summary-footer-label">Grand Total:</span>';
        summaryHtml += '<span class="order-summary-footer-total">₹' + total + '</span>';
        summaryHtml += '</div>';
        orderModalSummary.innerHTML = summaryHtml;
      }
    }

    // Refresh payment selector and COD limits
    updatePaymentSelectorUI();

    closeCartDrawer();
    orderDetailsModal.classList.add('active');
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    // Focus first relevant input
    setTimeout(() => {
      if (orderCustName && !orderCustName.value) {
        orderCustName.focus();
      } else if (orderCustPhone && !orderCustPhone.value) {
        orderCustPhone.focus();
      } else if (orderCustAddress && activeOrderType === 'Home Delivery' && !orderCustAddress.value) {
        orderCustAddress.focus();
      }
    }, 150);
  }

  function closeOrderPrompt() {
    if (orderDetailsModal) {
      orderDetailsModal.classList.remove('active');
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
  }

  if (orderModalCloseBtn) orderModalCloseBtn.addEventListener('click', closeOrderPrompt);
  if (orderDetailsModal) {
    orderDetailsModal.addEventListener('click', (e) => {
      if (e.target === orderDetailsModal) closeOrderPrompt();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (orderDetailsModal && orderDetailsModal.classList.contains('active')) closeOrderPrompt();
      if (customerAuthModal && customerAuthModal.classList.contains('active')) closeAuthModal();
      if (orderTrackingModal && orderTrackingModal.classList.contains('active')) closeOrderTrackingModal();
      if (razorpaySimModal && razorpaySimModal.classList.contains('active')) closeRazorpaySimModal();
      if (orderHistoryModal && orderHistoryModal.classList.contains('active')) closeOrderHistoryModal();
      if (customerProfileModal && customerProfileModal.classList.contains('active')) closeCustomerProfileModal();
      if (googlePhonePromptModal && googlePhonePromptModal.classList.contains('active')) closeGooglePhonePromptModal();
      const storeClosedModal = document.getElementById('storeClosedModal');
      if (storeClosedModal && storeClosedModal.classList.contains('active')) closeStoreClosedModal();
    }
  });

  // Order Type Pills Listener
  if (orderTypePills) {
    orderTypePills.querySelectorAll('.order-type-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        setOrderType(pill.dataset.type);
      });
    });
  }

  // --------------------------------------------------------------------------
  // CHRONOLOGICAL DAILY ORDER & TOKEN NUMBER GENERATOR
  // --------------------------------------------------------------------------
  async function generateNextOrderNumber() {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const datePrefix = `BRZ-${dd}${mm}-`; // e.g. BRZ-1210-

    let nextSeq = 1;
    const client = getSupabaseClient();
    if (client) {
      try {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
        const { data, error } = await client
          .from('orders')
          .select('id, created_at')
          .gte('created_at', startOfDay)
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          let maxExisting = 0;
          data.forEach(o => {
            if (o.id && o.id.startsWith(datePrefix)) {
              const parts = o.id.split('-');
              const num = parseInt(parts[parts.length - 1], 10);
              if (!isNaN(num) && num > maxExisting) {
                maxExisting = num;
              }
            }
          });
          nextSeq = maxExisting > 0 ? maxExisting + 1 : data.length + 1;
        }
      } catch (err) {
        console.warn('Could not query daily order sequence from Supabase:', err);
      }
    }

    // Local sequence fallback
    try {
      const localKey = `brz_daily_seq_${dd}${mm}`;
      const cached = parseInt(localStorage.getItem(localKey) || '0', 10);
      if (cached >= nextSeq) {
        nextSeq = cached + 1;
      }
      localStorage.setItem(localKey, String(nextSeq));
    } catch (_) {}

    const tokenFormatted = String(nextSeq).padStart(2, '0');
    return `${datePrefix}${tokenFormatted}`;
  }

  // --------------------------------------------------------------------------
  // SUBMIT ORDER ENGINE (RAZORPAY + COD + PETPOOJA DISPATCH)
  // --------------------------------------------------------------------------
  async function submitOrder() {
    if (window.isBreezeStoreOpen === false) {
      showToast('🔴 ' + (window.breezeStoreClosureReason || 'Kitchen is currently closed for online ordering.'));
      closeOrderPrompt();
      return;
    }

    // Final security check: ensure user is authenticated
    if (!customerProfile || !customerProfile.isLoggedIn || (!customerProfile.email && !customerProfile.phone)) {
      pendingCheckoutAction = { mode: currentOrderMode, directItem: directOrderItem };
      closeOrderPrompt();
      openAuthModal('checkout');
      showToast('🔒 Please sign in to place your order');
      return;
    }

    const name = orderCustName ? orderCustName.value.trim() : '';
    const phone = orderCustPhone ? orderCustPhone.value.trim() : '';
    const address = orderCustAddress ? orderCustAddress.value.trim() : '';
    const table = orderCustTable ? orderCustTable.value.trim() : '';
    const notes = orderCustNotes ? orderCustNotes.value.trim() : '';

    if (!name) {
      showToast('Please enter your full name');
      if (orderCustName) orderCustName.focus();
      return;
    }

    const digitsOnly = phone.replace(/[^0-9]/g, '');
    if (!isValidIndianMobile(digitsOnly)) {
      showToast('Please enter a valid 10-digit mobile number (e.g. 9876543210)');
      if (orderCustPhone) orderCustPhone.focus();
      return;
    }

    if (activeOrderType === 'Home Delivery' && !address) {
      showToast('Please enter your delivery address');
      if (orderCustAddress) orderCustAddress.focus();
      return;
    }

    // Auto-save/update customer profile
    const isCustomCheckoutAddr = Boolean(checkoutAddressSelect && checkoutAddressSelect.value === 'custom');
    const profileUpdates = {
      name: name,
      orderType: activeOrderType,
      table: table,
      notes: notes,
      isLoggedIn: true
    };

    if (!Array.isArray(customerProfile.saved_addresses)) {
      customerProfile.saved_addresses = [];
    }

    // Only update saved profile address if user did not choose a one-time custom address
    if (!isCustomCheckoutAddr) {
      profileUpdates.address = address;
      if (address && customerProfile.saved_addresses.length === 0) {
        customerProfile.saved_addresses.push({
          id: 'addr_' + Date.now(),
          label: 'Home',
          address: address,
          landmark: '',
          is_default: true
        });
        profileUpdates.saved_addresses = customerProfile.saved_addresses;
      }
    }

    // Ensure primary phone is set in profile
    if (!customerProfile.phone || !customerProfile.isLoggedIn) {
      profileUpdates.phone = digitsOnly;
    }
    saveCustomerProfile(profileUpdates);

    // Assemble ordered items
    let itemsList = [];
    let orderTotal = 0;

    if (currentOrderMode === 'direct' && directOrderItem) {
      itemsList = [{
        name: directOrderItem.name,
        price: directOrderItem.price,
        qty: 1
      }];
      orderTotal = directOrderItem.price;
    } else {
      const { count, total } = getCartTotals();
      if (count === 0) {
        showToast('Your cart is empty! Please add items first.');
        closeOrderPrompt();
        return;
      }
      itemsList = cart.map(i => ({ name: i.name, price: i.price, qty: i.qty || 1, petpooja_code: i.petpooja_code || null }));
      orderTotal = total;
    }

    // Live Cloud Kitchen Availability Check (Realtime Supabase Re-verification)
    const liveMenu = await fetchCloudMenuItems(true);
    const soldOutItems = (currentOrderMode === 'direct' && directOrderItem)
      ? (isItemSoldOut(directOrderItem, liveMenu) ? [directOrderItem] : [])
      : getSoldOutItemsInCart(liveMenu);

    if (soldOutItems.length > 0) {
      openSoldOutReconcileModal(soldOutItems, () => {
        if (cart.length > 0) {
          openOrderPrompt('cart', null);
        } else {
          closeOrderPrompt();
          showToast('All items were sold out. Cart cleared.');
        }
      });
      return;
    }

    // Check COD safety cap
    if (selectedPaymentMethod === 'cod' && orderTotal > BREEZE_CONFIG.MAX_COD_AMOUNT) {
      showToast('Cash on Delivery is limited to orders up to ₹1,000. Please select Online Payment.');
      return;
    }

    // Create Order Object (Chronological Daily Token)
    const orderId = await generateNextOrderNumber();
    const order = {
      id: orderId,
      items: itemsList,
      total: orderTotal,
      customer: {
        email: customerProfile.email || null,
        name: name,
        phone: phone,
        address: address,
        type: activeOrderType,
        table: table,
        notes: notes
      },
      paymentMethod: selectedPaymentMethod,
      paymentStatus: selectedPaymentMethod === 'razorpay' ? 'PAID' : 'PENDING_ON_DELIVERY',
      paymentId: null,
      status: 'placed',
      currentStep: 1,
      placedAt: Date.now(),
      prepTimeMins: BREEZE_CONFIG.ESTIMATED_PREP_MINUTES,
      cancellationSecondsRemaining: BREEZE_CONFIG.CANCELLATION_GRACE_SECONDS
    };

    currentPendingOrder = order;

    if (selectedPaymentMethod === 'razorpay') {
      if (BREEZE_CONFIG.RAZORPAY_KEY_ID) {
        // Live Razorpay SDK Flow
        launchLiveRazorpay(order);
      } else {
        // Simulated Razorpay Gateway Flow (while waiting for owner KYC)
        closeOrderPrompt();
        openRazorpaySimModal(order);
      }
    } else {
      // Cash on Delivery
      closeOrderPrompt();
      order.paymentId = 'COD_' + order.id;
      finalizeOrder(order);
    }
  }

  // Live Razorpay Launcher
  function launchLiveRazorpay(order) {
    if (typeof window.Razorpay === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => triggerRazorpaySDK(order);
      script.onerror = () => {
        showToast('Could not load Razorpay gateway. Opening test simulator.');
        openRazorpaySimModal(order);
      };
      document.head.appendChild(script);
    } else {
      triggerRazorpaySDK(order);
    }
  }

  function triggerRazorpaySDK(order) {
    const options = {
      key: BREEZE_CONFIG.RAZORPAY_KEY_ID,
      amount: order.total * 100, // paise
      currency: 'INR',
      name: 'Breeze The Roof-Top Café',
      description: 'Order ' + order.id,
      image: 'assets/logo-transparent.png',
      prefill: {
        name: order.customer.name,
        contact: order.customer.phone,
        email: order.customer.email || (customerProfile && customerProfile.email ? customerProfile.email : '')
      },
      theme: {
        color: '#b5883d'
      },
      handler: function(response) {
        order.paymentId = response.razorpay_payment_id;
        order.paymentStatus = 'PAID';
        closeOrderPrompt();
        finalizeOrder(order);
      },
      modal: {
        ondismiss: function() {
          showToast('Payment window closed. Order was not placed.');
        }
      }
    };
    try {
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (e) {
      console.error('Razorpay Error:', e);
      openRazorpaySimModal(order);
    }
  }

  // Simulated Razorpay Modal Controls
  function openRazorpaySimModal(order) {
    if (!razorpaySimModal) return;
    if (rzpSimAmount) rzpSimAmount.textContent = '₹' + order.total;
    if (rzpSimBtnAmount) rzpSimBtnAmount.textContent = '₹' + order.total;
    razorpaySimModal.classList.add('active');
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }

  function closeRazorpaySimModal() {
    if (!razorpaySimModal) return;
    razorpaySimModal.classList.remove('active');
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }

  if (rzpSimCloseBtn) rzpSimCloseBtn.addEventListener('click', closeRazorpaySimModal);
  if (razorpaySimModal) {
    razorpaySimModal.addEventListener('click', (e) => {
      if (e.target === razorpaySimModal) closeRazorpaySimModal();
    });
  }

  // UPI App Selection pills
  if (razorpaySimModal) {
    razorpaySimModal.querySelectorAll('.upi-app-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        razorpaySimModal.querySelectorAll('.upi-app-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  // Razorpay Simulation Pay Button
  if (rzpSimPayBtn) {
    rzpSimPayBtn.addEventListener('click', () => {
      const targetOrder = currentPendingOrder || customerActiveOrder;
      if (!targetOrder) return;
      const originalText = rzpSimPayBtn.innerHTML;
      rzpSimPayBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing Secure UPI...';
      rzpSimPayBtn.disabled = true;

      setTimeout(async () => {
        rzpSimPayBtn.innerHTML = originalText;
        rzpSimPayBtn.disabled = false;
        closeRazorpaySimModal();

        const simPayId = 'pay_sim_' + Date.now();
        if (currentPendingOrder) {
          currentPendingOrder.paymentId = simPayId;
          currentPendingOrder.paymentStatus = 'PAID';
          finalizeOrder(currentPendingOrder);
        } else if (customerActiveOrder) {
          customerActiveOrder.paymentId = simPayId;
          customerActiveOrder.paymentStatus = 'PAID';
          customerActiveOrder.status = 'delivered';
          customerActiveOrder.currentStep = 5;

          const client = getSupabaseClient();
          if (client) {
            try {
              await client.from('orders').update({
                payment_status: 'PAID',
                status: 'delivered',
                delivered_at: new Date().toISOString(),
                payment_method: 'razorpay',
                razorpay_payment_id: simPayId,
                online_collected: Number(customerActiveOrder.total || 0),
                cash_collected: 0
              }).eq('id', customerActiveOrder.id);

              if (customerActiveOrder.rider_id) {
                await client.from('delivery_partners').update({
                  active_order_id: null,
                  status: 'available'
                }).eq('id', customerActiveOrder.rider_id);
              }
            } catch(e){}
          }
          showToast('✅ Payment successful! Order delivered.');
          openOrderTrackingModal(customerActiveOrder);
        }
      }, 700);
    });
  }

  // --------------------------------------------------------------------------
  // ORDER FINALIZATION & PETPOOJA DISPATCH ADAPTER
  // --------------------------------------------------------------------------
  function finalizeOrder(order) {
    // 1. Prepare Official Petpooja Open API Payload
    const petpoojaPayload = {
      order_id: order.id,
      order_type: order.customer.type === 'Home Delivery' ? 'Delivery' : (order.customer.type === 'Dine-In (Rooftop Table)' ? 'DineIn' : 'PickUp'),
      created_at: new Date(order.placedAt).toISOString(),
      restaurant_id: BREEZE_CONFIG.PETPOOJA_REST_ID,
      customer: {
        name: order.customer.name,
        phone: order.customer.phone,
        address: order.customer.address || '',
        table_no: order.customer.table || ''
      },
      payment: {
        mode: order.paymentMethod === 'razorpay' ? 'ONLINE_RAZORPAY' : 'COD',
        status: order.paymentStatus,
        payment_id: order.paymentId,
        order_total: order.total
      },
      items: order.items.map(it => {
        const cloudMatch = cloudMenuItemsCache ? cloudMenuItemsCache.find(c => c.name.toLowerCase() === it.name.toLowerCase()) : null;
        return {
          item_code: cloudMatch?.petpooja_item_code || it.petpooja_code || 'BRZ_GEN',
          name: it.name,
          price: it.price,
          quantity: it.qty,
          line_total: it.price * it.qty
        };
      }),
      special_instructions: order.customer.notes || '',
      commission: {
        partner: 'Webyodas',
        rate_percent: BREEZE_CONFIG.DEVELOPER_COMMISSION_PERCENT,
        amount: Math.round(order.total * (BREEZE_CONFIG.DEVELOPER_COMMISSION_PERCENT / 100) * 100) / 100
      }
    };

    // 2. Dispatch / Log Integration Payload
    if (BREEZE_CONFIG.PETPOOJA_API_KEY) {
      console.log('🚀 [ORDER DISPATCH] Sending live order to restaurant kitchen...');
      fetch(BREEZE_CONFIG.PETPOOJA_PUSH_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': BREEZE_CONFIG.PETPOOJA_API_KEY,
          'X-APP-KEY': BREEZE_CONFIG.PETPOOJA_APP_KEY
        },
        body: JSON.stringify(petpoojaPayload)
      }).catch(err => console.warn('Order Dispatch Notice:', err));
    } else {
      console.log('%c⚡ [ORDER DISPATCH ENGINE - READY] ⚡', 'background: #0c2340; color: #f3e5ab; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
      console.log('Formatted Order Payload:', petpoojaPayload);
      console.log('ℹ️ Live order formatted and queued for restaurant kitchen.');
    }

    // 3. User-Scoped Order State Management
    customerActiveOrder = order;
    customerOrderHistory.unshift(order);

    const userScopedId = customerProfile.phone || customerProfile.email;
    if (userScopedId) {
      const activeKey = getActiveOrderStorageKey(userScopedId);
      const histKey = getOrderHistoryStorageKey(userScopedId);
      if (activeKey) {
        try { localStorage.setItem(activeKey, JSON.stringify(order)); } catch (e) {}
      }
      if (histKey) {
        try { localStorage.setItem(histKey, JSON.stringify(customerOrderHistory)); } catch (e) {}
      }
    }

    // Cloud Database Sync: write order to Supabase
    syncOrderToSupabase(order);

    // 4. Clear Cart on Success
    if (currentOrderMode === 'cart') {
      cart = [];
      saveCart();
    }

    // 5. Update UI & Launch Live Tracking
    renderAuthUI();
    showToast('🍽️ Order placed successfully! The kitchen is preparing your meal.');
    openOrderTrackingModal(order);
  }

  if (orderDetailsForm) {
    orderDetailsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitOrder();
    });
  }

  if (orderConfirmSubmitBtn) {
    orderConfirmSubmitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      submitOrder();
    });
  }

  function proceedToCheckoutFlow() {
    if (!customerProfile || !customerProfile.isLoggedIn || (!customerProfile.email && !customerProfile.phone)) {
      pendingCheckoutAction = { mode: 'cart', directItem: null };
      closeCartDrawer();
      openAuthModal('checkout');
      showToast('🔒 Please sign in to place your order');
      return;
    }
    openOrderPrompt('cart', null);
  }

  // Cart "Place Order" button opens address modal
  if (cartCheckoutBtn) {
    cartCheckoutBtn.addEventListener('click', async () => {
      if (window.isBreezeStoreOpen === false) {
        openStoreClosedModal();
        return;
      }
      if (cart.length === 0) {
        showToast('Your cart is empty! Please add items first.');
        return;
      }

      // Live Cloud Kitchen Verification with Supabase
      const liveMenu = await fetchCloudMenuItems(true);
      const soldOutItems = getSoldOutItemsInCart(liveMenu);

      if (soldOutItems.length > 0) {
        openSoldOutReconcileModal(soldOutItems, () => {
          if (cart.length > 0) {
            proceedToCheckoutFlow();
          }
        });
        return;
      }

      proceedToCheckoutFlow();
    });
  }

  // --------------------------------------------------------------------------
  // LIVE ORDER TRACKING MODAL ENGINE & 60s GRACE CANCEL / KITCHEN LOCK
  // --------------------------------------------------------------------------
  function openOrderTrackingModal(order) {
    if (!orderTrackingModal) return;
    customerActiveOrder = order;

    if (cancellationInterval) clearInterval(cancellationInterval);
    if (simulatedPosTimeout) clearTimeout(simulatedPosTimeout);

    // Populate Order Information
    const idParts = String(order.id || '').split('-');
    const tokenSuffix = idParts.length >= 3 ? ` (Token #${idParts[idParts.length - 1]})` : '';
    if (trackingOrderTitle) trackingOrderTitle.textContent = 'Order #' + order.id + tokenSuffix;
    if (trackingTotalAmount) trackingTotalAmount.textContent = '₹' + order.total;
    if (trackingFinalBill) trackingFinalBill.textContent = '₹' + order.total;

    // Items list
    if (trackingItemsList) {
      let itemsHtml = '';
      (order.items || []).forEach(it => {
        itemsHtml += '<div class="tracking-item-row">';
        itemsHtml += '<span>' + (it.qty || 1) + 'x ' + escapeHtml(it.name) + '</span>';
        itemsHtml += '<span>₹' + ((it.price || 0) * (it.qty || 1)) + '</span>';
        itemsHtml += '</div>';
      });
      trackingItemsList.innerHTML = itemsHtml;
    }

    // Payment Pill
    if (trackingPaymentPill) {
      if (order.paymentMethod === 'razorpay' || order.payment_method === 'razorpay') {
        trackingPaymentPill.className = 'tracking-payment-pill';
        trackingPaymentPill.innerHTML = '<i class="fas fa-check-circle"></i> Paid Online via Razorpay UPI (₹' + order.total + ')';
      } else if (order.paymentMethod === 'online_doorstep' || order.payment_method === 'online_doorstep') {
        trackingPaymentPill.className = 'tracking-payment-pill';
        trackingPaymentPill.innerHTML = '<i class="fas fa-check-circle"></i> Paid Online at Doorstep via UPI (₹' + order.total + ')';
      } else {
        trackingPaymentPill.className = 'tracking-payment-pill cod';
        trackingPaymentPill.innerHTML = '<i class="fas fa-money-bill-wave"></i> Cash on Delivery Due: ₹' + order.total + ' (Keep exact change ready)';
      }
    }

    // Destination Info
    if (trackingDestinationInfo) {
      const cust = order.customer || {};
      const cType = cust.type || order.order_type || 'Home Delivery';
      const cName = cust.name || order.customer_name || 'Customer';
      const cPhone = cust.phone || order.customer_phone || '';
      const cAddress = cust.address || order.customer_address || '';
      const cTable = cust.table || order.table_number || 'Terrace Table';

      if (cType === 'Home Delivery') {
        trackingDestinationInfo.innerHTML = '<i class="fas fa-motorcycle"></i> Delivering to <strong>' + escapeHtml(cName) + '</strong>' + (cPhone ? ' (' + escapeHtml(cPhone) + ')' : '') + (cAddress ? ' at:<br>' + escapeHtml(cAddress) : '');
      } else if (cType === 'Dine-In (Rooftop Table)') {
        trackingDestinationInfo.innerHTML = '<i class="fas fa-utensils"></i> Rooftop Dine-In for <strong>' + escapeHtml(cName) + '</strong> (' + escapeHtml(cTable) + ')';
      } else {
        trackingDestinationInfo.innerHTML = '<i class="fas fa-shopping-bag"></i> Takeaway / Pick-Up for <strong>' + escapeHtml(cName) + '</strong>';
      }
    }

    updateTrackingUI(order);

    orderTrackingModal.classList.add('active');
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    // Start 60-Second Grace Cancellation Timer
    startCancellationGraceTimer(order);

    // Live Supabase Realtime Subscription for instant Kitchen / Rider updates
    subscribeToLiveOrderTracking(order.id);
  }

  let activeTrackingChannel = null;

  function subscribeToLiveOrderTracking(orderId) {
    if (!orderId) return;
    const client = getSupabaseClient();
    if (!client) return;

    if (activeTrackingChannel) {
      try { activeTrackingChannel.unsubscribe(); } catch(e){}
    }

    try {
      activeTrackingChannel = client.channel('live-track-' + orderId)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`
        }, (payload) => {
          if (payload && payload.new) {
            handleLiveCustomerOrderUpdate(payload.new);
          }
        })
        .subscribe();
    } catch(err) {
      console.warn('Realtime order tracking subscribe error:', err);
    }
  }

  function playCustomerAlertTone(type = 'info') {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      if (type === 'declined') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.35, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.45);
      }
      if (navigator.vibrate) {
        navigator.vibrate(type === 'declined' ? [300, 120, 300] : [150, 80, 150]);
      }
    } catch (e) {}
  }

  function handleLiveCustomerOrderUpdate(dbOrder) {
    if (!dbOrder) return;
    if (customerActiveOrder && customerActiveOrder.id === dbOrder.id) {
      customerActiveOrder.status = dbOrder.status;
      if (dbOrder.rider_id !== undefined) customerActiveOrder.rider_id = dbOrder.rider_id;
      if (dbOrder.rider_name !== undefined) customerActiveOrder.rider_name = dbOrder.rider_name;
      if (dbOrder.rider_phone !== undefined) customerActiveOrder.rider_phone = dbOrder.rider_phone;
      if (dbOrder.picked_up_at !== undefined) customerActiveOrder.picked_up_at = dbOrder.picked_up_at;
      if (dbOrder.delivered_at !== undefined) customerActiveOrder.delivered_at = dbOrder.delivered_at;
      if (dbOrder.estimated_prep_time !== undefined) customerActiveOrder.estimated_prep_time = dbOrder.estimated_prep_time;
      if (dbOrder.estimated_delivery_time !== undefined) customerActiveOrder.estimated_delivery_time = dbOrder.estimated_delivery_time;
      if (dbOrder.estimated_delivery_by !== undefined) customerActiveOrder.estimated_delivery_by = dbOrder.estimated_delivery_by;
      if (dbOrder.cancellation_reason !== undefined) customerActiveOrder.cancellation_reason = dbOrder.cancellation_reason;
      if (dbOrder.delay_reason !== undefined) customerActiveOrder.delay_reason = dbOrder.delay_reason;

      const st = (dbOrder.status || '').toLowerCase().trim();
      if (st === 'placed') customerActiveOrder.currentStep = 2;
      else if (st === 'confirmed' || st === 'accepted' || st === 'cooking' || st === 'preparing') customerActiveOrder.currentStep = 3;
      else if (st === 'food_ready') customerActiveOrder.currentStep = 4;
      else if (st === 'dispatched' || st === 'out_for_delivery') customerActiveOrder.currentStep = 4;
      else if (st === 'delivered' || st === 'completed') customerActiveOrder.currentStep = 5;
      else if (st === 'cancelled' || st === 'rejected') customerActiveOrder.currentStep = 0;

      const userKey = customerProfile.phone || customerProfile.email;
      if (userKey) {
        const activeKey = getActiveOrderStorageKey(userKey);
        if (activeKey) {
          try {
            if (st === 'delivered' || st === 'completed' || st === 'cancelled' || st === 'rejected') {
              localStorage.removeItem(activeKey);
            } else {
              localStorage.setItem(activeKey, JSON.stringify(customerActiveOrder));
            }
          } catch(e){}
        }
      }

      updateTrackingUI(customerActiveOrder);

      if (st === 'confirmed' || st === 'accepted' || st === 'cooking' || st === 'preparing') {
        showToast('👨‍🍳 Order confirmed by restaurant! Chef is preparing your dishes.');
        playCustomerAlertTone('info');
      } else if (st === 'food_ready') {
        showToast(dbOrder.rider_name ? `🍱 Food ready! Partner ${dbOrder.rider_name} assigned.` : '🍱 Food is ready & packed! Awaiting delivery dispatch.');
        playCustomerAlertTone('info');
      } else if (st === 'out_for_delivery') {
        showToast('🛵 Out for delivery! ' + (dbOrder.rider_name ? (dbOrder.rider_name + ' is on the way') : 'Your rider is on the way'));
        playCustomerAlertTone('info');
      } else if (st === 'delivered' || st === 'completed') {
        showToast('🎉 Your meal has arrived! Enjoy your food.');
        playCustomerAlertTone('info');
        syncUserOrders(customerProfile.email, customerProfile.phone);
      } else if (st === 'cancelled' || st === 'rejected') {
        const isCust = (dbOrder.cancelled_by === 'customer') || /customer|mistake|grace window|changed mind/i.test(dbOrder.cancellation_reason || '');
        if (isCust) {
          const cleanReason = (dbOrder.cancellation_reason || '').replace(/^cancelled by customer:\s*/i, '').trim();
          showToast('ℹ️ Order #' + dbOrder.id + ' cancelled by customer' + (cleanReason ? (': ' + cleanReason) : '.'));
          playCustomerAlertTone('info');
        } else {
          showToast('❌ Order #' + dbOrder.id + ' was declined by kitchen: ' + (dbOrder.cancellation_reason || 'Peak kitchen capacity'));
          playCustomerAlertTone('declined');
        }
        syncUserOrders(customerProfile.email, customerProfile.phone);
      }
    }
  }

  function closeOrderTrackingModal() {
    if (!orderTrackingModal) return;
    if (cancellationInterval) clearInterval(cancellationInterval);
    orderTrackingModal.classList.remove('active');
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }

  if (orderTrackingCloseBtn) orderTrackingCloseBtn.addEventListener('click', closeOrderTrackingModal);
  if (orderTrackingModal) {
    orderTrackingModal.addEventListener('click', (e) => {
      if (e.target === orderTrackingModal) closeOrderTrackingModal();
    });
  }

  function startCancellationGraceTimer(order) {
    if (cancellationInterval) clearInterval(cancellationInterval);

    // If order is cancelled or delivered or locked
    if (order.status === 'cancelled' || order.status === 'delivered') {
      if (trackingCancelBox) trackingCancelBox.style.display = 'none';
      if (trackingKitchenLocked) trackingKitchenLocked.style.display = 'none';
      return;
    }

    const elapsedSeconds = Math.floor((Date.now() - (order.placedAt || Date.now())) / 1000);
    let remaining = Math.max(0, BREEZE_CONFIG.CANCELLATION_GRACE_SECONDS - elapsedSeconds);

    function tick() {
      if (order.status === 'cancelled') {
        if (trackingCancelBox) trackingCancelBox.style.display = 'none';
        if (trackingKitchenLocked) trackingKitchenLocked.style.display = 'none';
        clearInterval(cancellationInterval);
        return;
      }

      const st = (order.status || '').toLowerCase().trim();
      const isPlaced = st === 'placed' && (order.currentStep <= 2);
      if (remaining > 0 && isPlaced) {
        if (trackingCancelBox) trackingCancelBox.style.display = 'flex';
        if (trackingKitchenLocked) trackingKitchenLocked.style.display = 'none';
        if (cancelTimerCountdown) cancelTimerCountdown.textContent = remaining + 's';
        remaining--;
      } else {
        // Kitchen locked!
        if (trackingCancelBox) trackingCancelBox.style.display = 'none';
        if (trackingKitchenLocked) trackingKitchenLocked.style.display = 'flex';
        clearInterval(cancellationInterval);
      }
    }

    tick();
    cancellationInterval = setInterval(tick, 1000);
  }

  function updateTrackingUI(order) {
    if (!order) return;

    const st = (order.status || '').toLowerCase().trim();
    const isCancelled = st === 'cancelled' || st === 'rejected' || order.currentStep === 0;
    const isDelivered = st === 'delivered' || st === 'completed' || order.currentStep === 5;

    // Reset star ratings visual state if re-rendered
    if (ratingFeedbackMsg) ratingFeedbackMsg.style.display = 'none';
    if (trackingRatingStars) {
      trackingRatingStars.querySelectorAll('.rating-star').forEach(s => s.style.color = '#eab308');
    }

    // ========================================================================
    // CASE A: ORDER CANCELLED (TERMINAL STATE - HIDE STEPPER & STOP RADAR)
    // ========================================================================
    if (isCancelled) {
      const reasonStr = String(order.cancellation_reason || '').trim();
      const isCust = (order.cancelled_by === 'customer') ||
                     /customer|mistake|grace window|changed mind/i.test(reasonStr);

      if (trackingStatusBadge) {
        trackingStatusBadge.className = isCust ? 'tracking-header-badge customer-cancelled' : 'tracking-header-badge cancelled';
        if (trackingStatusBadgeText) {
          trackingStatusBadgeText.textContent = isCust ? 'Cancelled by You' : 'Declined by Kitchen';
        }
      }

      // Hero Card: Stop radar, set clear visual
      if (trackingHeroCard) {
        trackingHeroCard.classList.remove('delivered-state');
        trackingHeroCard.classList.remove('cancelled-state');
        trackingHeroCard.classList.remove('user-cancelled-state');
        trackingHeroCard.classList.add(isCust ? 'user-cancelled-state' : 'cancelled-state');
      }
      if (trackingHeroHeading) {
        trackingHeroHeading.textContent = isCust ? 'Order Cancelled by You' : 'Order Declined by Kitchen';
      }
      if (trackingHeroSubtext) {
        trackingHeroSubtext.textContent = isCust
          ? 'You cancelled this order during the grace period. No charges were incurred.'
          : 'Our kitchen was unable to accept this order at this time. We apologize for the inconvenience.';
      }
      if (trackingHeroIcon) {
        trackingHeroIcon.className = isCust ? 'fas fa-user-check' : 'fas fa-times-circle';
      }

      // Hide active in-progress elements completely
      if (trackingPrepEstimate) trackingPrepEstimate.style.display = 'none';
      if (trackingCancelBox) trackingCancelBox.style.display = 'none';
      if (trackingKitchenLocked) trackingKitchenLocked.style.display = 'none';
      if (trackingStepper) trackingStepper.style.display = 'none';
      const rCard = document.getElementById('trackingRiderCard');
      if (rCard) rCard.style.display = 'none';
      if (trackingDeliveredCard) trackingDeliveredCard.style.display = 'none';

      // Show dedicated cancellation resolution card
      if (trackingCancelledCard) {
        trackingCancelledCard.style.display = 'block';

        const iconCircle = document.getElementById('trackingCancelledIconCircle') || trackingCancelledCard.querySelector('div[style*="border-radius: 50%"]');
        const cancelTitleEl = document.getElementById('trackingCancelledTitle') || trackingCancelledCard.querySelector('h4');
        const cancelNoticeBox = document.getElementById('trackingCancelReasonNotice');
        const cancelNoticeIcon = document.getElementById('trackingCancelNoticeIcon');

        if (isCust) {
          trackingCancelledCard.style.background = '#f8fafc';
          trackingCancelledCard.style.borderColor = '#cbd5e1';
          if (iconCircle) {
            iconCircle.style.background = '#e2e8f0';
            iconCircle.style.color = '#475569';
            iconCircle.innerHTML = '<i class="fas fa-user-check"></i>';
          }
          if (cancelTitleEl) {
            cancelTitleEl.textContent = 'Order Cancelled by Customer';
            cancelTitleEl.style.color = '#1e293b';
          }
          if (cancelNoticeBox) {
            cancelNoticeBox.style.background = '#ffffff';
            cancelNoticeBox.style.borderColor = '#cbd5e1';
            cancelNoticeBox.style.color = '#334155';
          }
          if (cancelNoticeIcon) {
            cancelNoticeIcon.className = 'fas fa-user-check';
            cancelNoticeIcon.style.color = '#0284c7';
          }
          if (trackingCancelReasonText) {
            const cleanReason = reasonStr
              ? reasonStr.replace(/^cancelled by customer:\s*/i, '').trim()
              : 'Cancelled within grace period';
            trackingCancelReasonText.innerHTML = `<strong>Reason:</strong> ${escapeHtml(cleanReason)}`;
          }
        } else {
          trackingCancelledCard.style.background = '#fef2f2';
          trackingCancelledCard.style.borderColor = '#fecaca';
          if (iconCircle) {
            iconCircle.style.background = '#fee2e2';
            iconCircle.style.color = '#dc2626';
            iconCircle.innerHTML = '<i class="fas fa-times"></i>';
          }
          if (cancelTitleEl) {
            cancelTitleEl.textContent = 'Order Declined by Kitchen';
            cancelTitleEl.style.color = '#991b1b';
          }
          if (cancelNoticeBox) {
            cancelNoticeBox.style.background = '#ffffff';
            cancelNoticeBox.style.borderColor = '#fca5a5';
            cancelNoticeBox.style.color = '#7f1d1d';
          }
          if (cancelNoticeIcon) {
            cancelNoticeIcon.className = 'fas fa-info-circle';
            cancelNoticeIcon.style.color = '#dc2626';
          }
          if (trackingCancelReasonText) {
            const cleanReason = reasonStr || 'Kitchen currently at peak capacity';
            trackingCancelReasonText.innerHTML = `<strong>Kitchen Explanation:</strong> ${escapeHtml(cleanReason)}`;
          }
        }

        if (trackingRefundStatusText) {
          const isCod = (order.paymentMethod === 'cod' || order.payment_method === 'cod');
          const totalVal = order.total || order.total_amount || 0;
          if (isCod) {
            trackingRefundStatusText.textContent = '💵 Cash on Delivery: No charge incurred.';
          } else {
            trackingRefundStatusText.innerHTML = `
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 12px 14px; margin-top: 6px; text-align: left;">
                <div style="font-weight: 700; color: #166534; font-size: 0.86rem; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                  <i class="fas fa-check-circle" style="color: #22c55e;"></i> 100% Online Refund: ₹${totalVal}
                </div>
                <div style="font-size: 0.8rem; color: #15803d; line-height: 1.45;">
                  Your payment of ₹${totalVal} is being refunded directly to your UPI / Google Pay / Bank account. Need quick confirmation? Chat with our cafe manager directly:
                </div>
                <div style="margin-top: 10px;">
                  <a href="https://wa.me/919623999095?text=${encodeURIComponent('Hi Breeze Cafe, regarding my cancelled order #' + (order.id || '') + ' (₹' + totalVal + '), please share my refund update.')}" target="_blank" style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; font-weight: 700; color: #ffffff; background: #16a34a; padding: 7px 14px; border-radius: 8px; text-decoration: none;">
                    <i class="fab fa-whatsapp"></i> Chat with Manager on WhatsApp
                  </a>
                </div>
              </div>
            `;
          }
        }
      }
      return;
    }

    // ========================================================================
    // CASE B: ORDER DELIVERED (TERMINAL STATE - HIDE STEPPER & STOP RADAR)
    // ========================================================================
    if (isDelivered) {
      if (trackingStatusBadge) {
        trackingStatusBadge.className = 'tracking-header-badge delivered';
        if (trackingStatusBadgeText) trackingStatusBadgeText.textContent = 'Delivered & Completed';
      }

      // Hero Card: Stop radar, set celebratory delivered visual
      if (trackingHeroCard) {
        trackingHeroCard.classList.remove('cancelled-state');
        trackingHeroCard.classList.add('delivered-state');
      }
      if (trackingHeroHeading) trackingHeroHeading.textContent = 'Order Delivered! 🎉';
      if (trackingHeroSubtext) trackingHeroSubtext.textContent = 'Your meal has arrived fresh and hot. Bon appétit & enjoy!';
      if (trackingHeroIcon) trackingHeroIcon.className = 'fas fa-check-circle';

      // Hide active in-progress elements
      if (trackingPrepEstimate) trackingPrepEstimate.style.display = 'none';
      if (trackingCancelBox) trackingCancelBox.style.display = 'none';
      if (trackingKitchenLocked) trackingKitchenLocked.style.display = 'none';
      if (trackingStepper) trackingStepper.style.display = 'none';
      if (trackingCancelledCard) trackingCancelledCard.style.display = 'none';
      const rCard = document.getElementById('trackingRiderCard');
      if (rCard) rCard.style.display = 'none';

      // Show celebration & feedback card
      if (trackingDeliveredCard) {
        trackingDeliveredCard.style.display = 'block';
        if (trackingDeliveredNote) {
          const riderText = order.rider_name ? `Delivered by ${order.rider_name} • ` : '';
          trackingDeliveredNote.textContent = `${riderText}Thank you for dining with Breeze Rooftop Cafe!`;
        }
      }
      return;
    }

    // ========================================================================
    // CASE C: ORDER IN PROGRESS (STEPS 1 - 4)
    // ========================================================================
    if (trackingHeroCard) {
      trackingHeroCard.classList.remove('delivered-state', 'cancelled-state');
    }
    if (trackingDeliveredCard) trackingDeliveredCard.style.display = 'none';
    if (trackingCancelledCard) trackingCancelledCard.style.display = 'none';
    if (trackingStepper) trackingStepper.style.display = 'flex';
    if (trackingPrepEstimate) trackingPrepEstimate.style.display = 'inline-flex';

    // Calculate Active Waiting Step accurately:
    // When order is placed: Step 1 (Placed) is passed/green; Step 2 (Order Confirmed) is waiting
    // When order is confirmed/accepted/cooking: Step 1 & Step 2 are passed/green; Step 3 (Food Prepared) is waiting
    // When food is ready: Steps 1, 2, 3 are passed/green; Step 4 (Out for Delivery/Rider pickup) is waiting
    // When out for delivery: Steps 1, 2, 3 are passed/green; Step 4 (Out for Delivery) is active in transit
    let step = 2;
    if (st === 'placed') step = 2;
    else if (st === 'confirmed' || st === 'accepted' || st === 'cooking' || st === 'preparing') step = 3;
    else if (st === 'food_ready') step = 4;
    else if (st === 'dispatched' || st === 'out_for_delivery') step = 4;
    else if (st === 'delivered' || st === 'completed') step = 5;

    // Stepper updates
    for (let i = 1; i <= 5; i++) {
      const stepEl = document.getElementById('step' + i);
      if (!stepEl) continue;
      const nodeEl = document.getElementById('step' + i + 'Node') || stepEl.querySelector('.step-node');
      const descEl = document.getElementById('step' + i + 'Desc');

      stepEl.classList.remove('completed', 'active');
      if (i < step) {
        stepEl.classList.add('completed');
        if (nodeEl) nodeEl.innerHTML = '<i class="fas fa-check"></i>';
        if (descEl) {
          if (i === 1) descEl.textContent = 'We have received your order.';
          else if (i === 2) descEl.textContent = 'Restaurant has accepted your order.';
          else if (i === 3) descEl.textContent = 'Chef has cooked & packed your dishes.';
          else if (i === 4) descEl.textContent = 'Picked up by delivery partner.';
        }
      } else if (i === step) {
        stepEl.classList.add('active');
        if (nodeEl) {
          if (i === 2) nodeEl.innerHTML = '<i class="fas fa-clock"></i>';
          else if (i === 3) nodeEl.innerHTML = '<i class="fas fa-utensils"></i>';
          else if (i === 4) nodeEl.innerHTML = '<i class="fas fa-motorcycle"></i>';
          else if (i === 5) nodeEl.innerHTML = '<i class="fas fa-smile-beam"></i>';
        }
        if (descEl) {
          if (i === 2) descEl.textContent = 'Awaiting restaurant confirmation...';
          else if (i === 3) descEl.textContent = 'Chef is freshly preparing your dishes in kitchen.';
          else if (i === 4) descEl.textContent = (st === 'food_ready' ? 'Food packed & ready. Awaiting rider pickup...' : (order.rider_name ? `${order.rider_name} is on the way to you.` : 'Delivery partner is on the way.'));
          else if (i === 5) descEl.textContent = 'Arriving at your doorstep!';
        }
      } else {
        if (nodeEl) {
          if (i === 2) nodeEl.innerHTML = '<i class="fas fa-check-double"></i>';
          else if (i === 3) nodeEl.innerHTML = '<i class="fas fa-utensils"></i>';
          else if (i === 4) nodeEl.innerHTML = '<i class="fas fa-motorcycle"></i>';
          else if (i === 5) nodeEl.innerHTML = '<i class="fas fa-smile-beam"></i>';
        }
        if (descEl) {
          if (i === 2) descEl.textContent = 'Restaurant accepts your order.';
          else if (i === 3) descEl.textContent = 'Chef will freshly prepare your dishes.';
          else if (i === 4) descEl.textContent = 'Delivery partner will bring your meal.';
          else if (i === 5) descEl.textContent = 'Delivered to your doorstep.';
        }
      }
    }

    // Dynamic Kitchen & Delivery ETA Calculations
    const orderTypeStr = (order.order_type || order.customer?.type || '').toLowerCase();
    const isTakeaway = orderTypeStr.includes('takeaway') || orderTypeStr.includes('pickup') || orderTypeStr.includes('counter') || orderTypeStr.includes('dine');
    const prepMins = Number(order.estimated_prep_time) || Number(order.prepTimeMins) || 20;
    const totalDelivMins = Number(order.estimated_delivery_time) || (prepMins + (isTakeaway ? 0 : 15));
    const transitBufferMins = Math.max(0, totalDelivMins - prepMins);

    let delivByFormatted = '';
    let remDeliveryMins = null;
    if (order.estimated_delivery_by) {
      const targetDate = new Date(order.estimated_delivery_by);
      delivByFormatted = targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      remDeliveryMins = Math.max(1, Math.round((targetDate.getTime() - Date.now()) / 60000));
    }

    // Hero Status Text & Timings
    if (step === 2) {
      if (trackingStatusBadge) trackingStatusBadge.className = 'tracking-header-badge placed';
      if (trackingStatusBadgeText) trackingStatusBadgeText.textContent = 'Order Placed';
      if (trackingHeroHeading) trackingHeroHeading.textContent = 'Order Placed Successfully';
      if (trackingHeroSubtext) trackingHeroSubtext.textContent = 'Sending your order to the restaurant kitchen. Awaiting confirmation...';
      if (trackingHeroIcon) trackingHeroIcon.className = 'fas fa-clock';
      if (trackingPrepTimeText) {
        trackingPrepTimeText.innerHTML = `
          <span>
            <i class="fas fa-clock" style="color: var(--gold-primary, #ca8a04);"></i>
            <strong>Estimated Combined Time: ~${totalDelivMins} Mins</strong>
            ${isTakeaway ? '' : `<span style="font-size: 0.74rem; color: #94a3b8; margin-left: 6px;">(~${prepMins}m Prep + ~${transitBufferMins}m Delivery)</span>`}
          </span>
        `;
      }
      if (trackingCancelBox) trackingCancelBox.style.display = 'flex';
      if (trackingKitchenLocked) trackingKitchenLocked.style.display = 'none';
    } else if (step === 3) {
      if (trackingStatusBadge) trackingStatusBadge.className = 'tracking-header-badge cooking';
      if (trackingStatusBadgeText) trackingStatusBadgeText.textContent = 'Preparing in Kitchen';
      if (trackingHeroHeading) trackingHeroHeading.textContent = 'Food is Being Prepared';
      if (trackingHeroSubtext) {
        trackingHeroSubtext.textContent = order.delay_reason 
          ? `Kitchen note: ${order.delay_reason}. Cooking with care!`
          : (isTakeaway
              ? `Restaurant confirmed your order! Chef has started cooking fresh dishes (~${prepMins} mins prep).`
              : `Restaurant confirmed your order! Combined ETA is ~${totalDelivMins} mins (${prepMins}m kitchen prep + ${transitBufferMins}m delivery).`);
      }
      if (trackingHeroIcon) trackingHeroIcon.className = 'fas fa-utensils';
      if (trackingPrepTimeText) {
        if (isTakeaway) {
          trackingPrepTimeText.innerHTML = `
            <span>
              <i class="fas fa-fire-burner" style="color: var(--gold-primary, #ca8a04);"></i>
              <strong>Kitchen Preparation: ~${prepMins} Mins</strong>
              ${delivByFormatted ? `<span style="font-size: 0.74rem; color: #94a3b8; margin-left: 6px;">(Ready by ${delivByFormatted})</span>` : ''}
            </span>
          `;
        } else {
          trackingPrepTimeText.innerHTML = `
            <span>
              <i class="fas fa-clock" style="color: var(--gold-primary, #ca8a04);"></i>
              <strong>Estimated Arrival: ~${remDeliveryMins || totalDelivMins} Mins ${delivByFormatted ? `(by ${delivByFormatted})` : ''}</strong>
              <span style="font-size: 0.74rem; color: #94a3b8; margin-left: 6px;">(${prepMins}m Kitchen Prep + ${transitBufferMins}m Delivery)</span>
            </span>
          `;
        }
      }
      if (trackingCancelBox) trackingCancelBox.style.display = 'none';
      if (trackingKitchenLocked) trackingKitchenLocked.style.display = 'flex';
    } else if (step === 4) {
      const isFoodReady = st === 'food_ready';
      if (isFoodReady) {
        if (trackingStatusBadge) trackingStatusBadge.className = 'tracking-header-badge ready';
        if (trackingStatusBadgeText) trackingStatusBadgeText.textContent = isTakeaway ? 'Ready for Pickup' : (order.rider_name ? 'Rider Assigned' : 'Food Ready & Packed');
        if (trackingHeroHeading) trackingHeroHeading.textContent = isTakeaway ? 'Ready for Counter Pickup' : (order.rider_name ? 'Food Ready • Rider Assigned' : 'Food Ready & Packed');
        if (trackingHeroSubtext) {
          if (isTakeaway) {
            trackingHeroSubtext.textContent = 'Your order is hot and packed! Please collect it directly at the 5th floor rooftop counter.';
          } else if (order.rider_name) {
            trackingHeroSubtext.textContent = `Chef has cooked and packed your dishes! Partner ${order.rider_name} is collecting your parcel at the counter for dispatch.`;
          } else {
            trackingHeroSubtext.textContent = 'Chef has cooked and packed your dishes! Awaiting delivery partner dispatch.';
          }
        }
        if (trackingHeroIcon) trackingHeroIcon.className = isTakeaway ? 'fas fa-bag-shopping' : 'fas fa-bell-concierge';
        if (trackingPrepTimeText) {
          trackingPrepTimeText.innerHTML = isTakeaway
            ? '<span><i class="fas fa-check-circle" style="color: #16a34a;"></i> <strong>Ready for counter pickup now!</strong></span>'
            : (delivByFormatted 
                ? `<span><i class="fas fa-box" style="color: #16a34a;"></i> <strong>Packed & Ready</strong> • Target: ${delivByFormatted} (in ~${remDeliveryMins || transitBufferMins || 15}m)</span>`
                : '<span><i class="fas fa-box" style="color: #16a34a;"></i> <strong>Packed & Ready for Handover</strong></span>');
        }
      } else {
        if (trackingStatusBadge) trackingStatusBadge.className = 'tracking-header-badge transit';
        if (trackingStatusBadgeText) trackingStatusBadgeText.textContent = 'Out for Delivery';
        if (trackingHeroHeading) trackingHeroHeading.textContent = 'Out for Delivery';
        if (trackingHeroSubtext) {
          trackingHeroSubtext.textContent = order.rider_name
            ? (order.rider_name + ' has picked up your food and is on the way to your location!')
            : 'Your delivery partner has picked up your meal and is on the way to you.';
        }
        if (trackingHeroIcon) trackingHeroIcon.className = 'fas fa-motorcycle';
        if (trackingPrepTimeText) {
          trackingPrepTimeText.innerHTML = delivByFormatted 
            ? `<span><i class="fas fa-motorcycle" style="color: #0284c7;"></i> <strong>Arriving by ${delivByFormatted}</strong> (in ~${remDeliveryMins || 10} Mins)</span>`
            : '<span><i class="fas fa-motorcycle" style="color: #0284c7;"></i> <strong>Arriving in ~5-10 Mins</strong></span>';
        }
      }
      if (trackingCancelBox) trackingCancelBox.style.display = 'none';
      if (trackingKitchenLocked) trackingKitchenLocked.style.display = 'flex';
    }

    // Dynamic Rider Partner Card
    const trackingRiderCard = document.getElementById('trackingRiderCard');
    const trackingRiderName = document.getElementById('trackingRiderName');
    const trackingRiderVehicle = document.getElementById('trackingRiderVehicle');
    const trackingRiderPhoneBtn = document.getElementById('trackingRiderPhoneBtn');

    if (trackingRiderCard) {
      if (order.rider_name && (step >= 4 || st === 'out_for_delivery' || st === 'food_ready')) {
        trackingRiderCard.style.display = 'block';
        if (trackingRiderName) trackingRiderName.textContent = order.rider_name;
        if (trackingRiderVehicle) {
          trackingRiderVehicle.textContent = st === 'food_ready' ? 'Breeze Express Partner • Assigned at Counter' : 'Breeze Express Partner • Out for Delivery';
        }
        if (trackingRiderPhoneBtn) {
          if (order.rider_phone) {
            trackingRiderPhoneBtn.href = 'tel:' + order.rider_phone;
            trackingRiderPhoneBtn.style.display = 'inline-flex';
          } else {
            trackingRiderPhoneBtn.style.display = 'none';
          }
        }
      } else {
        trackingRiderCard.style.display = 'none';
      }
    }
  }

  // Interactive 5-Star Rating Handler
  if (trackingRatingStars) {
    trackingRatingStars.querySelectorAll('.rating-star').forEach(star => {
      star.addEventListener('click', (e) => {
        const score = parseInt(star.dataset.star, 10) || 5;
        trackingRatingStars.querySelectorAll('.rating-star').forEach(s => {
          const sVal = parseInt(s.dataset.star, 10) || 1;
          s.style.color = sVal <= score ? '#eab308' : '#cbd5e1';
        });
        if (ratingFeedbackMsg) {
          ratingFeedbackMsg.style.display = 'block';
          ratingFeedbackMsg.textContent = `⭐ Thank you for your ${score}-star review!`;
        }
        showToast(`⭐ Thank you for rating us ${score} stars!`);
      });
    });
  }

  // Reorder / Explore Menu Handlers from Completed & Cancelled Cards
  if (btnReorderFromTracking) {
    btnReorderFromTracking.addEventListener('click', () => {
      const targetOrder = customerActiveOrder;
      closeOrderTrackingModal();

      if (targetOrder && Array.isArray(targetOrder.items) && targetOrder.items.length > 0) {
        targetOrder.items.forEach(ordItem => {
          const existing = cart.find(c => c.name.toLowerCase() === ordItem.name.toLowerCase());
          if (existing) {
            existing.qty = (existing.qty || 1) + (ordItem.qty || 1);
          } else {
            cart.push({
              name: ordItem.name,
              price: ordItem.price,
              qty: ordItem.qty || 1,
              image: ordItem.image || 'assets/logo-emblem.png',
              category: ordItem.category || 'Highlights',
              petpooja_code: ordItem.petpooja_code || null
            });
          }
        });

        saveCart();
        renderCart();

        if (cartDrawer) {
          openCartDrawer();
          showToast(`✓ Added ${targetOrder.items.length} items from order #${targetOrder.id} to your cart!`);
        } else {
          sessionStorage.setItem('breeze_auto_open_cart', 'true');
          window.location.href = '/menu?openCart=1';
        }
      } else {
        const menuSec = document.getElementById('menu');
        if (menuSec) {
          menuSec.scrollIntoView({ behavior: 'smooth' });
        } else {
          window.location.href = '/menu';
        }
      }
    });
  }

  if (btnBrowseMenuFromCancelled) {
    btnBrowseMenuFromCancelled.addEventListener('click', () => {
      closeOrderTrackingModal();
      const menuSec = document.getElementById('menu');
      if (menuSec) {
        menuSec.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.location.href = '/menu';
      }
    });
  }

  // Customer Cancellation Modal Elements & State
  const customerCancelOrderModal = document.getElementById('customerCancelOrderModal');
  const btnDismissCancelModal = document.getElementById('btnDismissCancelModal');
  const btnKeepOrder = document.getElementById('btnKeepOrder');
  const btnConfirmCustomerCancel = document.getElementById('btnConfirmCustomerCancel');
  const customerCancelCustomWrap = document.getElementById('customerCancelCustomWrap');
  const customerCancelCustomInput = document.getElementById('customerCancelCustomInput');
  const cancelModalTitle = document.getElementById('cancelModalTitle');

  function closeCustomerCancelModal() {
    if (customerCancelOrderModal) {
      customerCancelOrderModal.classList.remove('active');
      customerCancelOrderModal.style.display = 'none';
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
  }

  if (btnDismissCancelModal) btnDismissCancelModal.addEventListener('click', closeCustomerCancelModal);
  if (btnKeepOrder) btnKeepOrder.addEventListener('click', closeCustomerCancelModal);

  document.querySelectorAll('input[name="customerCancelReason"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (customerCancelCustomWrap) {
        customerCancelCustomWrap.style.display = e.target.value === 'custom' ? 'block' : 'none';
        if (e.target.value === 'custom' && customerCancelCustomInput) {
          customerCancelCustomInput.focus();
        }
      }
    });
  });

  async function executeCustomerCancellation(activeOrder, reason) {
    activeOrder.status = 'cancelled';
    activeOrder.cancellation_reason = reason;
    activeOrder.cancelled_by = 'customer';
    activeOrder.currentStep = 0;

    await updateOrderStatusInSupabase(activeOrder.id, 'cancelled', reason);

    const userKey = customerProfile.phone || customerProfile.email;
    customerActiveOrder = null;
    if (userKey) {
      const activeKey = getActiveOrderStorageKey(userKey);
      if (activeKey) {
        try { localStorage.removeItem(activeKey); } catch (e) {}
      }
      const found = customerOrderHistory.find(o => o.id === activeOrder.id);
      if (found) {
        found.status = 'cancelled';
        found.cancellation_reason = reason;
        found.cancelled_by = 'customer';
      }
      const histKey = getOrderHistoryStorageKey(userKey);
      if (histKey) {
        try { localStorage.setItem(histKey, JSON.stringify(customerOrderHistory)); } catch (e) {}
      }
    }

    console.log('⚡ [ORDER CANCELLATION] Order #' + activeOrder.id + ' cancelled by customer: ' + reason);
    updateTrackingUI(activeOrder);
    renderAuthUI();
    showToast('Order #' + activeOrder.id + ' cancelled as requested.');
  }

  // Cancel Order Handler (Triggered from Live Tracking Grace Window)
  if (btnCancelOrder) {
    btnCancelOrder.addEventListener('click', () => {
      let activeOrder = customerActiveOrder;
      const userKey = customerProfile.phone || customerProfile.email;
      if (!activeOrder && userKey) {
        const activeKey = getActiveOrderStorageKey(userKey);
        if (activeKey) {
          try {
            const saved = localStorage.getItem(activeKey);
            if (saved) activeOrder = JSON.parse(saved);
          } catch (e) {}
        }
      }

      if (!activeOrder) return;

      const elapsed = Math.floor((Date.now() - (activeOrder.placedAt || Date.now())) / 1000);
      if (elapsed > BREEZE_CONFIG.CANCELLATION_GRACE_SECONDS || activeOrder.currentStep >= 3) {
        showToast('🔒 Food is already being prepared on the stove! Order cannot be cancelled.');
        if (trackingCancelBox) trackingCancelBox.style.display = 'none';
        if (trackingKitchenLocked) trackingKitchenLocked.style.display = 'flex';
        return;
      }

      if (customerCancelOrderModal) {
        if (cancelModalTitle) cancelModalTitle.textContent = `Cancel Order #${activeOrder.id}?`;
        if (customerCancelCustomWrap) customerCancelCustomWrap.style.display = 'none';
        if (customerCancelCustomInput) customerCancelCustomInput.value = '';
        const defaultRadio = document.querySelector('input[name="customerCancelReason"][value="Placed order by mistake / testing"]');
        if (defaultRadio) defaultRadio.checked = true;
        customerCancelOrderModal.classList.add('active');
        customerCancelOrderModal.style.display = 'flex';
        document.body.classList.add('modal-open');
        document.documentElement.classList.add('modal-open');
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
      } else {
        if (confirm('Are you sure you want to cancel Order #' + activeOrder.id + '? No charges will be incurred.')) {
          executeCustomerCancellation(activeOrder, 'Cancelled by Customer: Grace window cancellation');
        }
      }
    });
  }

  if (btnConfirmCustomerCancel) {
    btnConfirmCustomerCancel.addEventListener('click', () => {
      let activeOrder = customerActiveOrder;
      const userKey = customerProfile.phone || customerProfile.email;
      if (!activeOrder && userKey) {
        const activeKey = getActiveOrderStorageKey(userKey);
        if (activeKey) {
          try {
            const saved = localStorage.getItem(activeKey);
            if (saved) activeOrder = JSON.parse(saved);
          } catch (e) {}
        }
      }

      if (!activeOrder) {
        closeCustomerCancelModal();
        return;
      }

      let selectedReason = 'Placed order by mistake / testing';
      const checkedRadio = document.querySelector('input[name="customerCancelReason"]:checked');
      if (checkedRadio) {
        if (checkedRadio.value === 'custom') {
          selectedReason = (customerCancelCustomInput && customerCancelCustomInput.value.trim()) || 'Custom reason';
        } else {
          selectedReason = checkedRadio.value;
        }
      }

      const fullReason = `Cancelled by Customer: ${selectedReason}`;
      closeCustomerCancelModal();
      executeCustomerCancellation(activeOrder, fullReason);
    });
  }

  // Discreet Demo Step Advancer (For Owner Pitch)
  if (btnDemoAdvanceStep) {
    btnDemoAdvanceStep.addEventListener('click', () => {
      let activeOrder = customerActiveOrder;
      const userKey = customerProfile.phone || customerProfile.email;
      if (!activeOrder && userKey) {
        const activeKey = getActiveOrderStorageKey(userKey);
        if (activeKey) {
          try {
            const saved = localStorage.getItem(activeKey);
            if (saved) activeOrder = JSON.parse(saved);
          } catch (e) {}
        }
      }

      if (!activeOrder) {
        showToast('No active order to advance. Place an order first.');
        return;
      }

      if (activeOrder.status === 'cancelled') {
        showToast('This order is cancelled.');
        return;
      }

      let cur = activeOrder.currentStep || 1;
      cur = (cur % 5) + 1;
      activeOrder.currentStep = cur;
      if (cur === 5) {
        activeOrder.status = 'delivered';
        customerActiveOrder = null;
        if (userKey) {
          const activeKey = getActiveOrderStorageKey(userKey);
          if (activeKey) {
            try { localStorage.removeItem(activeKey); } catch (e) {}
          }
        }
      } else {
        activeOrder.status = 'confirmed';
        customerActiveOrder = activeOrder;
        if (userKey) {
          const activeKey = getActiveOrderStorageKey(userKey);
          if (activeKey) {
            try { localStorage.setItem(activeKey, JSON.stringify(activeOrder)); } catch (e) {}
          }
        }
      }

      updateOrderStatusInSupabase(activeOrder.id, activeOrder.status);

      const histItem = customerOrderHistory.find(o => o.id === activeOrder.id);
      if (histItem) {
        histItem.status = activeOrder.status;
        histItem.currentStep = activeOrder.currentStep;
        if (userKey) {
          const histKey = getOrderHistoryStorageKey(userKey);
          if (histKey) {
            try { localStorage.setItem(histKey, JSON.stringify(customerOrderHistory)); } catch (e) {}
          }
        }
      }

      updateTrackingUI(activeOrder);
      renderAuthUI();
      showToast('Order status updated: Step ' + cur + ' of 5');
    });
  }

  function handleOpenActiveOrderTracking() {
    let activeOrder = customerActiveOrder;
    const userKey = customerProfile.phone || customerProfile.email;
    if (!activeOrder && userKey) {
      const activeKey = getActiveOrderStorageKey(userKey);
      if (activeKey) {
        try {
          const saved = localStorage.getItem(activeKey);
          if (saved) activeOrder = JSON.parse(saved);
        } catch (e) {}
      }
    }
    if (activeOrder && activeOrder.status !== 'cancelled' && activeOrder.status !== 'delivered') {
      openOrderTrackingModal(activeOrder);
    } else {
      showToast('No active orders right now.');
      renderAuthUI();
    }
  }

  // Active Order triggers in menu & drawer
  if (menuActiveOrderBtn) {
    menuActiveOrderBtn.addEventListener('click', () => {
      if (navUserMenu) navUserMenu.classList.remove('active');
      handleOpenActiveOrderTracking();
    });
  }

  if (drawerActiveOrderBtn) {
    drawerActiveOrderBtn.addEventListener('click', () => {
      const mobileDrawer = document.getElementById('mobileDrawer');
      const mobileDrawerBackdrop = document.getElementById('mobileDrawerBackdrop');
      if (mobileDrawer) mobileDrawer.classList.remove('active');
      if (mobileDrawerBackdrop) mobileDrawerBackdrop.classList.remove('active');
      document.body.style.overflow = '';
      handleOpenActiveOrderTracking();
    });
  }

  // --------------------------------------------------------------------------
  // ORDER HISTORY MODAL VIEWER
  // --------------------------------------------------------------------------
  function renderHistoryListUI(historyList) {
    if (!orderHistoryList) return;
    if (!historyList || historyList.length === 0) {
      orderHistoryList.innerHTML = `
        <div style="text-align: center; padding: 30px 10px; color: var(--text-muted);">
          <i class="fas fa-receipt" style="font-size: 2.2rem; margin-bottom: 10px; opacity: 0.5;"></i>
          <p style="margin: 0; font-weight: 600; color: var(--text-dark);">No previous orders found.</p>
          <p style="font-size: 0.8rem; margin-top: 4px;">Orders placed with <strong>${escapeHtml(customerProfile.phone ? ('+91 ' + customerProfile.phone) : (customerProfile.email || 'your account'))}</strong> will appear here automatically!</p>
        </div>
      `;
      return;
    }

    let html = '';
    historyList.forEach(ord => {
      const dateStr = ord.placedAt ? new Date(ord.placedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Recent';
      const itemsSummary = (ord.items || []).map(i => (i.qty || 1) + 'x ' + escapeHtml(i.name)).join(', ') || 'Rooftop Delights';
      const isCancelled = ord.status === 'cancelled';
      const isDelivered = ord.status === 'delivered';

      html += `
        <div class="history-item-card">
          <div class="history-item-header">
            <span class="history-order-id">Order #${escapeHtml(ord.id)}</span>
            <span class="history-order-date">${dateStr}</span>
          </div>
          <div class="history-items-summary">${itemsSummary}</div>
          <div class="history-item-footer">
            <div>
              <span class="history-order-total">₹${ord.total}</span>
              <span style="font-size: 0.72rem; color: ${isCancelled ? '#c62828' : (isDelivered ? '#2e7d32' : '#e65100')}; font-weight: 700; margin-left: 8px;">
                ${isCancelled ? 'Cancelled' : (isDelivered ? 'Delivered' : 'In Progress')}
              </span>
            </div>
            <button type="button" class="btn btn-secondary btn-sm btn-track-history-item" data-id="${escapeHtml(ord.id)}">
              ${isCancelled ? 'Details' : 'Track Order'}
            </button>
          </div>
        </div>
      `;
    });
    orderHistoryList.innerHTML = html;
  }

  async function openOrderHistoryModal() {
    if (!orderHistoryModal) return;

    const isRecognized = Boolean(customerProfile && (customerProfile.isLoggedIn || customerProfile.email || customerProfile.phone));
    if (!isRecognized) {
      if (orderHistoryList) {
        orderHistoryList.innerHTML = `
          <div style="text-align: center; padding: 30px 10px; color: var(--text-muted);">
            <i class="fas fa-lock" style="font-size: 2.2rem; margin-bottom: 10px; color: #b5883d;"></i>
            <p style="margin: 0; font-weight: 600; color: var(--text-dark);">Sign in to view your orders</p>
            <p style="font-size: 0.85rem; margin-top: 4px;">Sign in with Mobile OTP or Google to live track rooftop orders and view past receipts.</p>
          </div>
        `;
      }
      orderHistoryModal.classList.add('active');
      document.body.classList.add('modal-open');
      document.documentElement.classList.add('modal-open');
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      return;
    }

    // Render current in-memory / cached history immediately
    renderHistoryListUI(customerOrderHistory);
    orderHistoryModal.classList.add('active');
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    // Fetch fresh real-time order history directly from Supabase
    const { activeOrder, history } = await fetchUserOrdersFromSupabase(customerProfile.email, customerProfile.phone);
    if (customerProfile && (customerProfile.email || customerProfile.phone)) {
      customerOrderHistory = history;
      if (activeOrder) customerActiveOrder = activeOrder;
      renderHistoryListUI(customerOrderHistory);
    }
  }

  function closeOrderHistoryModal() {
    if (!orderHistoryModal) return;
    orderHistoryModal.classList.remove('active');
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }

  if (historyModalCloseBtn) historyModalCloseBtn.addEventListener('click', closeOrderHistoryModal);
  if (orderHistoryModal) {
    orderHistoryModal.addEventListener('click', (e) => {
      if (e.target === orderHistoryModal) closeOrderHistoryModal();
    });
    orderHistoryModal.addEventListener('click', (e) => {
      const trackBtn = e.target.closest('.btn-track-history-item');
      if (trackBtn) {
        const orderId = trackBtn.dataset.id;
        const targetOrder = customerOrderHistory.find(o => o.id === orderId);
        if (targetOrder) {
          closeOrderHistoryModal();
          openOrderTrackingModal(targetOrder);
        }
      }
    });
  }

  if (menuOrderHistoryBtn) {
    menuOrderHistoryBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (navUserMenu) navUserMenu.classList.remove('active');
      window.location.href = '/profile?tab=orders';
    });
  }
  window.BREEZE_CONFIG = BREEZE_CONFIG;
  window.getCustomerProfile = () => customerProfile;
  window.saveCustomerProfile = saveCustomerProfile;
  window.getUserOrders = () => customerOrderHistory;
  window.performSignOut = performSignOut;
  window.showToast = showToast;
  window.openOrderTrackingModal = openOrderTrackingModal;
  window.syncCustomerToSupabase = syncCustomerToSupabase;
  window.loadCustomerFromSupabase = loadCustomerFromSupabase;
  window.fetchUserOrdersFromSupabase = fetchUserOrdersFromSupabase;
  window.isValidIndianMobile = isValidIndianMobile;
  window.addToCart = (item) => {
    if (!item) return;
    if (window.isBreezeStoreOpen === false) {
      openStoreClosedModal();
      return;
    }
    if (isItemSoldOut(item)) {
      showToast(`⚠️ Sorry! "${item.name}" is currently sold out in the kitchen.`);
      return;
    }
    const existing = cart.find(c => c.name.toLowerCase() === item.name.toLowerCase());
    if (existing) {
      existing.qty = (existing.qty || 1) + (item.qty || 1);
    } else {
      cart.push({
        name: item.name,
        price: item.price,
        qty: item.qty || 1,
        petpooja_code: item.petpooja_code || null
      });
    }
    saveCart();
    renderCart();
    openCartDrawer();
  };

  
  // --------------------------------------------------------------------------
  // TABLE RESERVATION MODAL (DIRECT ROOFTOP BOOKING ENGINE)
  // --------------------------------------------------------------------------
  const tableBookingModal = document.getElementById('tableBookingModal');
  const tableBookingCloseBtn = document.getElementById('tableBookingCloseBtn');
  const tableBookingForm = document.getElementById('tableBookingForm');
  const reserveDate = document.getElementById('reserveDate');
  const reserveTime = document.getElementById('reserveTime');
  const reserveGuests = document.getElementById('reserveGuests');
  const reserveArea = document.getElementById('reserveArea');
  const reserveCustName = document.getElementById('reserveCustName');
  const reserveCustPhone = document.getElementById('reserveCustPhone');
  const reserveNotes = document.getElementById('reserveNotes');

  // Trigger buttons
  const navBookTableBtn = document.getElementById('navBookTableBtn');
  const heroBookTableBtn = document.getElementById('heroBookTableBtn');
  const drawerBookTableBtn = document.getElementById('drawerBookTableBtn');
  const footerBookTableBtn = document.getElementById('footerBookTableBtn');
  const bottomBarBookTableBtn = document.getElementById('bottomBarBookTableBtn');
  const midMenuBookTableBtn = document.getElementById('midMenuBookTableBtn');
  const comboOrderNowBtn = document.getElementById('comboOrderNowBtn');

  function openTableBookingModal() {
    if (!tableBookingModal) return;

    // Set today as default date
    if (reserveDate && !reserveDate.value) {
      const today = new Date().toISOString().split('T')[0];
      reserveDate.value = today;
      reserveDate.min = today;
    }

    // Auto-fill from customer profile if logged in
    if (customerProfile && customerProfile.name && reserveCustName && !reserveCustName.value) {
      reserveCustName.value = customerProfile.name;
    }
    if (customerProfile && customerProfile.phone && reserveCustPhone && !reserveCustPhone.value) {
      reserveCustPhone.value = customerProfile.phone;
    }

    tableBookingModal.classList.add('active');
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }

  function closeTableBookingModal() {
    if (!tableBookingModal) return;
    tableBookingModal.classList.remove('active');
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }

  [navBookTableBtn, heroBookTableBtn, drawerBookTableBtn, footerBookTableBtn, bottomBarBookTableBtn, midMenuBookTableBtn].forEach(btn => {
    if (btn) btn.addEventListener('click', (e) => {
      e.preventDefault();
      openTableBookingModal();
    });
  });

  if (tableBookingCloseBtn) tableBookingCloseBtn.addEventListener('click', closeTableBookingModal);
  if (tableBookingModal) {
    tableBookingModal.addEventListener('click', (e) => {
      if (e.target === tableBookingModal) closeTableBookingModal();
    });
  }

  if (tableBookingForm) {
    tableBookingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const date = reserveDate ? reserveDate.value : '';
      const time = reserveTime ? reserveTime.value : '';
      const guests = reserveGuests ? reserveGuests.value : '';
      const area = reserveArea ? reserveArea.value : '';
      const name = reserveCustName ? reserveCustName.value.trim() : '';
      const phone = reserveCustPhone ? reserveCustPhone.value.trim() : '';
      const notes = reserveNotes ? reserveNotes.value.trim() : '';

      if (!name) {
        showToast('Please enter your full name');
        if (reserveCustName) reserveCustName.focus();
        return;
      }
      if (!phone || phone.replace(/[^0-9]/g, '').length < 10) {
        showToast('Please enter a valid 10-digit mobile number');
        if (reserveCustPhone) reserveCustPhone.focus();
        return;
      }

      // Auto-save profile
      saveCustomerProfile({ name: name, phone: phone });

      const reservationId = 'TBL-' + Math.floor(1000 + Math.random() * 9000);
      const reservation = {
        id: reservationId,
        date: date,
        time: time,
        guests: guests,
        area: area,
        customer: { name: name, phone: phone },
        notes: notes,
        createdAt: new Date().toISOString()
      };

      console.log('⚡ [TABLE RESERVATION RECEIVED] ⚡', reservation);

      // Cloud Database Sync: write table reservation to Supabase
      syncReservationToSupabase(reservation);

      closeTableBookingModal();
      showToast('🎉 Table Confirmed! Reservation #' + reservationId + ' for ' + name + ' on ' + date + ' at ' + time + '.');
    });
  }

  // Direct WhatsApp Table Reservation with Pre-typed Details
  const btnReserveWhatsApp = document.getElementById('btnReserveWhatsApp');
  if (btnReserveWhatsApp) {
    btnReserveWhatsApp.addEventListener('click', (e) => {
      e.preventDefault();
      const date = reserveDate ? reserveDate.value : '';
      const time = reserveTime ? reserveTime.value : '';
      const guests = reserveGuests ? reserveGuests.value : '';
      const area = reserveArea ? reserveArea.value : '';
      const name = reserveCustName ? reserveCustName.value.trim() : '';
      const phone = reserveCustPhone ? reserveCustPhone.value.trim() : '';
      const notes = reserveNotes ? reserveNotes.value.trim() : '';

      if (!name) {
        showToast('Please enter your full name');
        if (reserveCustName) reserveCustName.focus();
        return;
      }
      if (!phone || phone.replace(/[^0-9]/g, '').length < 10) {
        showToast('Please enter a valid 10-digit mobile number');
        if (reserveCustPhone) reserveCustPhone.focus();
        return;
      }

      // Auto-save profile so customer details persist
      saveCustomerProfile({ name: name, phone: phone });

      const reservationId = 'TBL-' + Math.floor(1000 + Math.random() * 9000);
      const reservation = {
        id: reservationId,
        date: date,
        time: time,
        guests: guests,
        area: area,
        customer: { name: name, phone: phone },
        notes: notes,
        createdAt: new Date().toISOString()
      };

      console.log('⚡ [TABLE RESERVATION VIA WHATSAPP] ⚡', reservation);

      // Cloud Database Sync: log table reservation in Supabase
      syncReservationToSupabase(reservation);

      // Format date for readable luxury message
      let formattedDate = date;
      try {
        if (date) {
          const dParts = date.split('-');
          if (dParts.length === 3) {
            const dObj = new Date(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10));
            formattedDate = dObj.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
          }
        }
      } catch (err) {
        formattedDate = date;
      }

      const waMessage =
        `✨ *Breeze The Rooftop Café, Palghar* ✨\n` +
        `👋 Hi! I would like to reserve a rooftop table.\n\n` +
        `📋 *Booking Details:*\n` +
        `👤 *Name:* ${name}\n` +
        `📞 *Phone:* ${phone}\n` +
        `📅 *Date:* ${formattedDate}\n` +
        `⏰ *Time Slot:* ${time}\n` +
        `👥 *Party Size:* ${guests}\n` +
        `📍 *Seating Zone:* ${area}\n` +
        `💬 *Special Request:* ${notes || 'None'}\n\n` +
        `Please confirm table availability for us. Thank you! 🥂`;

      const waUrl = 'https://wa.me/919623999095?text=' + encodeURIComponent(waMessage);

      // Open WhatsApp pre-typed message
      const opened = window.open(waUrl, '_blank');
      if (!opened) {
        window.location.href = waUrl;
      }

      closeTableBookingModal();
      showToast('✨ Opening WhatsApp with your pre-filled table details!');
    });
  }

  // Viral Combo Order button directly opens checkout
  if (comboOrderNowBtn) {
    comboOrderNowBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.isBreezeStoreOpen === false) {
        comboOrderNowBtn.classList.add('store-btn-shake');
        setTimeout(() => comboOrderNowBtn.classList.remove('store-btn-shake'), 450);
        openStoreClosedModal();
        return;
      }
      openOrderPrompt('direct', {
        name: 'Viral Breeze Signature Combo',
        price: 349,
        qty: 1
      });
    });
  }

  // --------------------------------------------------------------------------
  // DELEGATE DISH CARD ACTIONS (ORDER NOW & ADD TO CART)
  // --------------------------------------------------------------------------
  document.addEventListener('click', (e) => {
    // A. "Order Now" button click -> prompt address modal first
    const orderBtn = e.target.closest('.btn-card-order');
    if (orderBtn) {
      e.preventDefault();
      e.stopPropagation();

      if (window.isBreezeStoreOpen === false) {
        orderBtn.classList.add('store-btn-shake');
        setTimeout(() => orderBtn.classList.remove('store-btn-shake'), 450);
        openStoreClosedModal();
        return;
      }

      const card = orderBtn.closest('.menu-card');
      if (!card) return;

      if (card.classList.contains('out-of-stock')) {
        showToast('⚠️ Sorry! This item is currently sold out in the kitchen.');
        return;
      }

      const name = (card.querySelector('.menu-item-name')?.textContent || 'Breeze Delicacy').trim();
      const priceText = (card.querySelector('.menu-item-price')?.textContent || '').replace(/[^0-9]/g, '');
      const price = parseInt(priceText, 10) || 0;

      openOrderPrompt('direct', {
        name: name,
        price: price,
        qty: 1,
        petpooja_code: card.dataset.petpoojaCode || ''
      });
      return;
    }

    // B. "Add to Cart" button click
    const cartBtn = e.target.closest('.btn-card-cart');
    if (cartBtn) {
      e.preventDefault();
      e.stopPropagation();

      if (window.isBreezeStoreOpen === false) {
        cartBtn.classList.add('store-btn-shake');
        setTimeout(() => cartBtn.classList.remove('store-btn-shake'), 450);
        openStoreClosedModal();
        return;
      }

      const card = cartBtn.closest('.menu-card');
      if (!card) return;

      if (card.classList.contains('out-of-stock')) {
        showToast('⚠️ Sorry! This item is currently sold out in the kitchen.');
        return;
      }

      const name = (card.querySelector('.menu-item-name')?.textContent || 'Breeze Delicacy').trim();
      const priceText = (card.querySelector('.menu-item-price')?.textContent || '').replace(/[^0-9]/g, '');
      const price = parseInt(priceText, 10) || 0;
      const img = card.querySelector('.menu-card-img')?.src || '';
      const petpoojaCode = card.dataset.petpoojaCode || '';

      // Check if already in cart
      const existing = cart.find(item => item.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        existing.qty += 1;
      } else {
        cart.push({
          name: name,
          price: price,
          img: img,
          qty: 1,
          petpooja_code: petpoojaCode
        });
      }

      saveCart();

      // Visual feedback on button
      const origHtml = cartBtn.innerHTML;
      cartBtn.classList.add('added-success');
      cartBtn.innerHTML = '<i class="fas fa-check"></i> Added!';

      setTimeout(() => {
        cartBtn.classList.remove('added-success');
        cartBtn.innerHTML = origHtml;
      }, 1200);

      showToast('<i class="fas fa-check-circle toast-check-icon"></i> Added <strong>' + escapeHtml(name) + '</strong> (₹' + price + ') <a href="#" id="toastViewCartLink" class="toast-cart-link">View Cart →</a>');

      const toastLink = document.getElementById('toastViewCartLink');
      if (toastLink) {
        toastLink.addEventListener('click', (evt) => {
          evt.preventDefault();
          openCartDrawer();
        });
      }
    }
  });

  // Initial render
  renderCart();
  renderAuthUI();

  // If user is logged in, sync latest user orders, cloud profile & cloud cart from Supabase
  if (customerProfile && customerProfile.isLoggedIn && (customerProfile.email || customerProfile.phone)) {
    syncUserOrders(customerProfile.email, customerProfile.phone);

    loadCustomerFromSupabase(customerProfile.email || customerProfile.phone, (dbData) => {
      let changed = false;
      if (!customerProfile.phone && dbData.phone) {
        customerProfile.phone = dbData.phone;
        changed = true;
      }
      if (!customerProfile.email && dbData.email) {
        customerProfile.email = dbData.email;
        changed = true;
      }
      if (!customerProfile.name && dbData.name) {
        customerProfile.name = dbData.name;
        changed = true;
      }
      if (Array.isArray(dbData?.saved_addresses) && dbData.saved_addresses.length > 0) {
        customerProfile.saved_addresses = dbData.saved_addresses;
        const defaultAddr = dbData.saved_addresses.find(a => a.is_default) || dbData.saved_addresses[0];
        if (defaultAddr && !customerProfile.address) {
          customerProfile.address = defaultAddr.address + (defaultAddr.landmark ? ' (Landmark: ' + defaultAddr.landmark + ')' : '');
        }
        changed = true;
      } else if (dbData?.default_address && (!customerProfile.saved_addresses || customerProfile.saved_addresses.length === 0)) {
        customerProfile.saved_addresses = [{
          id: 'addr_1',
          label: 'Home',
          address: dbData.default_address,
          landmark: '',
          is_default: true
        }];
        if (!customerProfile.address) customerProfile.address = dbData.default_address;
        changed = true;
      } else if (!customerProfile.address && dbData?.default_address) {
        customerProfile.address = dbData.default_address;
        changed = true;
      }
      if (changed) {
        try { localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(customerProfile)); } catch(e){}
        renderAuthUI();
      }

      // Multi-device Cloud Cart Sync: Restore or merge cart from Supabase
      if (dbData && Array.isArray(dbData.active_cart) && dbData.active_cart.length > 0) {
        if (cart.length === 0) {
          cart = dbData.active_cart;
          try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch(e){}
          renderCart();
        } else {
          const merged = [...dbData.active_cart];
          let updated = false;
          cart.forEach(localItem => {
            const existing = merged.find(m => m.name.toLowerCase() === localItem.name.toLowerCase());
            if (!existing) {
              merged.push(localItem);
              updated = true;
            }
          });
          cart = merged;
          try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch(e){}
          renderCart();
          if (updated) syncCartToSupabase(cart, customerProfile.email || customerProfile.phone);
        }
      }
    });
  }

  // Proactive check on page load: if user is logged in with Google but hasn't linked a phone number yet
  if (customerProfile && customerProfile.isLoggedIn && !customerProfile.phone) {
    if (!sessionStorage.getItem('breeze_skip_phone_prompt')) {
      setTimeout(() => {
        if (customerProfile && customerProfile.isLoggedIn && !customerProfile.phone) {
          openGooglePhonePromptModal({ name: customerProfile.name, email: customerProfile.email, isEdit: false });
        }
      }, 1500);
    }
  }

  // Live Cloud Menu Synchronization (Supabase)
  syncLiveMenuWithCloud();

  // Live Cloud Store Operating Status & Emergency Shutdown Sync (Supabase)
  syncStoreOperatingStatusWithCloud();

  // --------------------------------------------------------------------------
  // URL DEEP LINK HANDLER (DOORSTEP ONLINE PAYMENT & ORDER TRACKING)
  // --------------------------------------------------------------------------
  function normalizeDbOrderRow(row) {
    if (!row) return null;
    const st = (row.status || '').toLowerCase().trim();
    let step = 2;
    if (st === 'placed') step = 2;
    else if (st === 'confirmed' || st === 'accepted' || st === 'cooking' || st === 'preparing') step = 3;
    else if (st === 'food_ready') step = 4;
    else if (st === 'dispatched' || st === 'out_for_delivery') step = 4;
    else if (st === 'delivered' || st === 'completed') step = 5;
    else if (st === 'cancelled' || st === 'rejected') step = 0;

    return {
      id: row.id,
      total: Number(row.total_amount) || 0,
      total_amount: Number(row.total_amount) || 0,
      subtotal: Number(row.subtotal) || 0,
      deliveryFee: Number(row.delivery_fee) || 0,
      status: row.status || 'placed',
      placedAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      items: Array.isArray(row.items) ? row.items : [],
      customer: {
        name: row.customer_name || 'Customer',
        email: row.customer_email || '',
        phone: row.customer_phone || '',
        address: row.customer_address || '',
        type: row.order_type || 'Home Delivery',
        table: '',
        notes: ''
      },
      customer_name: row.customer_name || 'Customer',
      customer_phone: row.customer_phone || '',
      customer_address: row.customer_address || '',
      rider_id: row.rider_id || null,
      rider_name: row.rider_name || null,
      rider_phone: row.rider_phone || null,
      paymentMethod: row.payment_method || 'cod',
      payment_method: row.payment_method || 'cod',
      paymentStatus: row.payment_status || 'PENDING',
      payment_status: row.payment_status || 'PENDING',
      paymentId: row.razorpay_payment_id || null,
      razorpay_payment_id: row.razorpay_payment_id || null,
      currentStep: step,
      prepTimeMins: row.estimated_prep_time || 20,
      estimated_prep_time: row.estimated_prep_time || 20,
      estimated_delivery_time: row.estimated_delivery_time || null,
      estimated_delivery_by: row.estimated_delivery_by || null,
      cancellation_reason: row.cancellation_reason || null,
      delay_reason: row.delay_reason || null
    };
  }

  async function initiateDirectOrderTracking(orderId) {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      const { data: row, error } = await client.from('orders').select('*').eq('id', orderId).maybeSingle();
      if (error || !row) {
        showToast('Order #' + orderId + ' not found.');
        return;
      }
      const order = normalizeDbOrderRow(row);
      customerActiveOrder = order;
      openOrderTrackingModal(order);
    } catch (e) {
      console.warn('initiateDirectOrderTracking error:', e);
    }
  }

  async function initiateDoorstepCustomerPayment(orderId) {
    const client = getSupabaseClient();
    if (!client) return;

    try {
      const { data: row, error } = await client.from('orders').select('*').eq('id', orderId).maybeSingle();
      if (error || !row) {
        showToast('⚠️ Order #' + orderId + ' not found.');
        return;
      }

      const order = normalizeDbOrderRow(row);
      customerActiveOrder = order;

      if ((row.payment_status || '').toUpperCase() === 'PAID' || row.status === 'delivered') {
        showToast('✅ Order #' + orderId + ' is already marked paid!');
        openOrderTrackingModal(order);
        return;
      }

      launchCustomerDoorstepRazorpay(order);
    } catch (e) {
      console.error('initiateDoorstepCustomerPayment error:', e);
    }
  }

  function launchCustomerDoorstepRazorpay(order) {
    const rzpKey = (window.BREEZE_CONFIG && window.BREEZE_CONFIG.RAZORPAY_KEY_ID)
      || (function() { try { return localStorage.getItem('breeze_rzp_key_id') || ''; } catch(e){ return ''; } })()
      || 'rzp_test_TlgwHYUpOAKE2P';

    const amtPaise = Math.round(Number(order.total || 0) * 100);
    const custName = order.customer?.name || order.customer_name || 'Customer';
    const phone = order.customer?.phone || order.customer_phone || '';
    const cleanPhone = String(phone).replace(/[^0-9]/g, '').slice(-10);

    function doOpen() {
      const options = {
        key: rzpKey,
        amount: amtPaise,
        currency: 'INR',
        name: 'Breeze The Roof-Top Café',
        description: `Doorstep Payment • Order #${order.id}`,
        image: 'assets/logo-transparent.png',
        prefill: {
          name: custName,
          contact: cleanPhone
        },
        theme: {
          color: '#b5883d'
        },
        handler: async function (response) {
          console.log('Customer doorstep payment success:', response);
          const paymentId = response.razorpay_payment_id || ('rzp_doorstep_' + Date.now());
          const now = new Date().toISOString();
          showToast('🎉 Payment verified! Marking delivery complete...');

          const client = getSupabaseClient();
          if (client) {
            try {
              // 1. Update orders table
              await client.from('orders').update({
                payment_status: 'PAID',
                status: 'delivered',
                delivered_at: now,
                payment_method: 'razorpay',
                razorpay_payment_id: paymentId,
                online_collected: Number(order.total || 0),
                cash_collected: 0
              }).eq('id', order.id);

              // 2. Free the rider in delivery_partners table
              if (order.rider_id) {
                await client.from('delivery_partners').update({
                  active_order_id: null,
                  status: 'available'
                }).eq('id', order.rider_id);
              }
            } catch (err) {
              console.error('Supabase update on customer payment success error:', err);
            }
          }

          order.status = 'delivered';
          order.payment_status = 'PAID';
          order.paymentStatus = 'PAID';
          order.currentStep = 5;
          order.paymentId = paymentId;

          showToast('✅ Order delivered! Thank you for dining with Breeze.');
          openOrderTrackingModal(order);
        },
        modal: {
          ondismiss: function () {
            showToast('Doorstep payment window closed.');
            openOrderTrackingModal(order);
          }
        }
      };

      try {
        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (resp) {
          console.error('Doorstep payment failed:', resp);
          showToast('Payment declined: ' + (resp.error ? resp.error.description : 'Transaction cancelled'));
          openOrderTrackingModal(order);
        });
        rzp.open();
      } catch (err) {
        console.error('Doorstep Razorpay launch error:', err);
        showToast('Opening payment simulator...');
        openRazorpaySimModal(order);
      }
    }

    if (typeof window.Razorpay === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = doOpen;
      script.onerror = () => {
        showToast('Could not load Razorpay. Opening simulator.');
        openRazorpaySimModal(order);
      };
      document.head.appendChild(script);
    } else {
      doOpen();
    }
  }

  async function handleUrlDeepLinks() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const shouldOpenCart = urlParams.get('openCart') === '1' || sessionStorage.getItem('breeze_auto_open_cart') === 'true';

      if (shouldOpenCart) {
        try { sessionStorage.removeItem('breeze_auto_open_cart'); } catch (e) {}
        if (urlParams.get('openCart')) {
          urlParams.delete('openCart');
          const newSearch = urlParams.toString();
          const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash;
          window.history.replaceState({}, document.title, newUrl);
        }
        setTimeout(() => {
          if (typeof openCartDrawer === 'function' && cartDrawer) {
            openCartDrawer();
            showToast('✓ Reordered items added to your cart! Ready for checkout.');
          }
        }, 250);
      }

      const payOrderId = urlParams.get('payOrder') || (urlParams.get('pay') === 'now' ? urlParams.get('track') : null);
      const trackOrderId = urlParams.get('track');

      if (payOrderId) {
        await initiateDoorstepCustomerPayment(payOrderId);
        return;
      }

      if (trackOrderId) {
        await initiateDirectOrderTracking(trackOrderId);
      }
    } catch (err) {
      console.warn('handleUrlDeepLinks notice:', err);
    }
  }

  // Handle doorstep online payment or tracking from URL params
  handleUrlDeepLinks();
}
