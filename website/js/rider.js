/**
 * ============================================================================
 * BREEZE THE ROOFTOP CAFE — DELIVERY PARTNER ENGINE (/rider)
 * ============================================================================
 * Real-time rider cockpit: Multi-rider authentication, Supabase Realtime order
 * assignment alerts, Web Audio chime, 1-tap navigation, and delivery lifecycle.
 */

document.addEventListener('DOMContentLoaded', () => {
  const RIDER_SESSION_KEY = 'breeze_rider_session';
  const RIDER_TOKEN_KEY = 'breeze_rider_token';
  const RIDER_AUDIO_KEY = 'breeze_rider_audio_pref';

  // Config fallback
  const config = window.BREEZE_CONFIG || {
    API_BASE_URL: '',
    SUPABASE_URL: 'cloudflare-d1',
    SUPABASE_ANON_KEY: 'cloudflare-d1-token',
    CLOUDFLARE_D1: true
  };

  let supabaseClient = null;
  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    try {
      supabaseClient = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    } catch (e) {
      console.warn('Rider Supabase init error:', e);
    }
  }

  // State
  let currentRider = null;
  let activeDeliveryOrder = null;
  let todayCompletedOrders = [];
  let isAudioEnabled = localStorage.getItem(RIDER_AUDIO_KEY) !== 'false';
  let realtimeChannel = null;
  let riderHeartbeatTimer = null;

  // DOM Elements - Auth View
  const riderAuthView = document.getElementById('riderAuthView');
  const riderCockpitView = document.getElementById('riderCockpitView');
  const riderLoginForm = document.getElementById('riderLoginForm');
  const inputRiderId = document.getElementById('inputRiderId');
  const inputRiderPasscode = document.getElementById('inputRiderPasscode');
  const checkRememberRider = document.getElementById('checkRememberRider');
  const btnRiderLogout = document.getElementById('btnRiderLogout');
  const btnAudioToggle = document.getElementById('btnAudioToggle');

  // DOM Elements - Cockpit View
  const dispRiderAvatar = document.getElementById('dispRiderAvatar');
  const dispRiderName = document.getElementById('dispRiderName');
  const dispRiderVehicle = document.getElementById('dispRiderVehicle');
  const statusToggleBtn = document.getElementById('statusToggleBtn');
  const statusToggleText = document.getElementById('statusToggleText');
  const dispTodayDeliveries = document.getElementById('dispTodayDeliveries');
  const dispTodayCash = document.getElementById('dispTodayCash');
  const tileCashInHand = document.getElementById('tileCashInHand');

  // Active Order Card Elements
  const emptyCockpitState = document.getElementById('emptyCockpitState');
  const activeOrderCard = document.getElementById('activeOrderCard');
  const cardOrderId = document.getElementById('cardOrderId');
  const cardOrderTime = document.getElementById('cardOrderTime');
  const cardOrderStepTag = document.getElementById('cardOrderStepTag');
  const cardPaymentAlert = document.getElementById('cardPaymentAlert');
  const cardPaymentAlertText = document.getElementById('cardPaymentAlertText');
  const cardCustomerName = document.getElementById('cardCustomerName');
  const cardOrderTotal = document.getElementById('cardOrderTotal');
  const cardCustomerAddress = document.getElementById('cardCustomerAddress');
  const btnCallCustomer = document.getElementById('btnCallCustomer');
  const btnNavCustomer = document.getElementById('btnNavCustomer');
  const cardItemsList = document.getElementById('cardItemsList');
  const cardKitchenEtaNotice = document.getElementById('cardKitchenEtaNotice');
  const cardKitchenEtaIcon = document.getElementById('cardKitchenEtaIcon');
  const cardKitchenEtaTitle = document.getElementById('cardKitchenEtaTitle');
  const cardKitchenEtaSubtext = document.getElementById('cardKitchenEtaSubtext');
  const cardKitchenStatusBadge = document.getElementById('cardKitchenStatusBadge');

  // Progress Action Buttons
  const btnActionPickup = document.getElementById('btnActionPickup');
  const btnActionTransit = document.getElementById('btnActionTransit');
  const btnActionDelivered = document.getElementById('btnActionDelivered');
  const completedDeliveriesList = document.getElementById('completedDeliveriesList');

  // Toast
  const riderToast = document.getElementById('riderToast');
  const riderToastText = document.getElementById('riderToastText');

  function showRiderToast(msg) {
    if (!riderToast) return;
    riderToastText.textContent = msg;
    riderToast.style.display = 'flex';
    setTimeout(() => { riderToast.style.display = 'none'; }, 3500);
  }

  // --------------------------------------------------------------------------
  // AUDIO CHIME ALERT (Synthesized Web Audio API)
  // --------------------------------------------------------------------------
  function playOrderArrivalChime() {
    if (!isAudioEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      // Note 1: 880 Hz (A5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, ctx.currentTime);
      gain1.gain.setValueAtTime(0.3, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.4);

      // Note 2: 1320 Hz (E6)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1320, ctx.currentTime + 0.2);
      gain2.gain.setValueAtTime(0.4, ctx.currentTime + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.2);
      osc2.stop(ctx.currentTime + 0.7);

      if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
    } catch (e) {
      console.warn('Audio chime playback notice:', e);
    }
  }

  // --------------------------------------------------------------------------
  // CONTINUOUS NEW ASSIGNMENT RINGER ENGINE (RIDER COCKPIT)
  // Keeps ringing with alarm sound every 3.5s until acknowledged or picked up
  // --------------------------------------------------------------------------
  let riderRingerTimer = null;
  let isRiderRingingActive = false;

  function startRiderRinger(orderId) {
    if (!isAudioEnabled) return;
    isRiderRingingActive = true;
    updateRiderRingingBanner(orderId);
    playOrderArrivalChime();

    if (!riderRingerTimer) {
      riderRingerTimer = setInterval(() => {
        if (!isAudioEnabled || !isRiderRingingActive) {
          stopRiderRinger();
          return;
        }
        playOrderArrivalChime();
        updateRiderRingingBanner(orderId);
      }, 3500);
    }
  }

  function stopRiderRinger() {
    isRiderRingingActive = false;
    if (riderRingerTimer) {
      clearInterval(riderRingerTimer);
      riderRingerTimer = null;
    }
    hideRiderRingingBanner();
  }

  function updateRiderRingingBanner(orderId) {
    let banner = document.getElementById('riderRingingBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'riderRingingBanner';
      banner.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;align-items:center;gap:12px;padding:10px 20px;border-radius:30px;background:#0284c7;color:#ffffff;font-size:0.88rem;font-weight:700;box-shadow:0 8px 24px rgba(2,132,199,0.45);animation:pulseRinger 1.2s infinite ease-in-out;cursor:pointer;';
      banner.innerHTML = `
        <i class="fas fa-motorcycle fa-shake" style="font-size:1.15rem;"></i>
        <span id="riderRingingText">🛵 New Delivery Assigned!</span>
        <button type="button" id="btnRiderSilenceRinger" style="background:#ffffff;color:#0284c7;border:none;border-radius:20px;padding:5px 14px;font-size:0.78rem;font-weight:800;cursor:pointer;margin-left:4px;box-shadow:0 2px 6px rgba(0,0,0,0.15);">Acknowledge</button>
      `;
      document.body.appendChild(banner);
      const silenceBtn = banner.querySelector('#btnRiderSilenceRinger');
      if (silenceBtn) {
        silenceBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          stopRiderRinger();
          showRiderToast('🔕 Alert acknowledged.');
        });
      }
      banner.addEventListener('click', () => {
        stopRiderRinger();
      });
    }
    banner.style.display = 'flex';
  }

  function hideRiderRingingBanner() {
    const banner = document.getElementById('riderRingingBanner');
    if (banner) banner.style.display = 'none';
  }

  if (btnAudioToggle) {
    btnAudioToggle.addEventListener('click', () => {
      isAudioEnabled = !isAudioEnabled;
      localStorage.setItem(RIDER_AUDIO_KEY, isAudioEnabled ? 'true' : 'false');
      btnAudioToggle.classList.toggle('active', isAudioEnabled);
      btnAudioToggle.innerHTML = isAudioEnabled ? '<i class="fas fa-volume-up"></i>' : '<i class="fas fa-volume-mute"></i>';
      if (!isAudioEnabled) {
        stopRiderRinger();
      }
      showRiderToast(isAudioEnabled ? 'Audio alerts turned ON' : 'Audio alerts muted');
    });
  }

  // --------------------------------------------------------------------------
  // AUTHENTICATION LOGIC (CLEAN PARTNER ID & PASSCODE)
  // --------------------------------------------------------------------------
  if (riderLoginForm) {
    riderLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const targetId = (inputRiderId ? inputRiderId.value.trim() : '').toUpperCase();
      const enteredPasscode = inputRiderPasscode.value.trim();

      if (!targetId) {
        showRiderToast('Please enter your Partner ID');
        if (inputRiderId) inputRiderId.focus();
        return;
      }

      if (!enteredPasscode) {
        showRiderToast('Please enter your rider password');
        if (inputRiderPasscode) inputRiderPasscode.focus();
        return;
      }

      const btnSubmit = riderLoginForm.querySelector('button[type="submit"]');
      const origHtml = btnSubmit ? btnSubmit.innerHTML : '';
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Authenticating...';
      }

      try {
        const res = await fetch('/api/auth?action=login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            type: 'rider',
            id: targetId,
            password: enteredPasscode
          })
        });
        const json = await res.json();

        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = origHtml;
        }

        if (res.ok && json.success && json.token) {
          currentRider = json.rider;
          window.BREEZE_RIDER_TOKEN = json.token;
          if (checkRememberRider && checkRememberRider.checked) {
            localStorage.setItem(RIDER_TOKEN_KEY, json.token);
            localStorage.setItem(RIDER_SESSION_KEY, JSON.stringify(currentRider));
          } else {
            sessionStorage.setItem(RIDER_TOKEN_KEY, json.token);
            sessionStorage.setItem(RIDER_SESSION_KEY, JSON.stringify(currentRider));
            localStorage.removeItem(RIDER_TOKEN_KEY);
            localStorage.removeItem(RIDER_SESSION_KEY);
          }

          if (supabaseClient) {
            try {
              await supabaseClient.from('delivery_partners').update({
                status: 'available',
                updated_at: new Date().toISOString()
              }).eq('id', currentRider.id);
            } catch(e) {}
          }

          showRiderToast('Welcome, ' + currentRider.name + '! 👋');
          initCockpit();
        } else {
          showRiderToast(json.error || 'Invalid Rider ID or Passcode');
        }
      } catch (err) {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = origHtml;
        }
        console.warn('Rider auth error:', err);
        showRiderToast('Network error during authentication. Please retry.');
      }
    });
  }

  if (btnRiderLogout) {
    btnRiderLogout.addEventListener('click', async () => {
      if (confirm('Are you sure you want to sign out of the rider portal?')) {
        if (currentRider && supabaseClient) {
          try {
            await supabaseClient.from('delivery_partners').update({
              status: 'offline',
              updated_at: new Date().toISOString()
            }).eq('id', currentRider.id);
          } catch(e) {}
        }
        try {
          await fetch('/api/auth?action=logout', { method: 'POST', credentials: 'include' });
        } catch(e){}
        if (riderHeartbeatTimer) {
          clearInterval(riderHeartbeatTimer);
          riderHeartbeatTimer = null;
        }
        localStorage.removeItem(RIDER_SESSION_KEY);
        localStorage.removeItem(RIDER_TOKEN_KEY);
        sessionStorage.removeItem(RIDER_SESSION_KEY);
        sessionStorage.removeItem(RIDER_TOKEN_KEY);
        window.BREEZE_RIDER_TOKEN = null;
        currentRider = null;
        if (realtimeChannel) realtimeChannel.unsubscribe();
        location.reload();
      }
    });
  }

  // --------------------------------------------------------------------------
  // COCKPIT CONTROLLER
  // --------------------------------------------------------------------------
  async function initCockpit() {
    if (!currentRider) return;

    riderAuthView.style.display = 'none';
    riderCockpitView.style.display = 'flex';
    btnRiderLogout.style.display = 'inline-flex';

    // Populate header info
    dispRiderName.textContent = currentRider.name || currentRider.id;
    dispRiderAvatar.textContent = (currentRider.name || 'R').charAt(0).toUpperCase();
    dispRiderVehicle.textContent = (currentRider.vehicle_type || 'Vehicle') + (currentRider.vehicle_number ? (' • ' + currentRider.vehicle_number) : '');

    updateStatusUI(currentRider.status || 'available');

    // Load active order & today's history
    await fetchActiveOrder();
    await fetchTodayCompletedOrders();

    // Start real-time live channel
    setupRealtimeSubscription();

    // 15-second background heartbeat poll to keep orders & cash status in sync
    if (!riderHeartbeatTimer) {
      riderHeartbeatTimer = setInterval(async () => {
        if (!currentRider) return;
        await fetchActiveOrder();
        await fetchTodayCompletedOrders();
        if (supabaseClient && currentRider.status !== 'offline') {
          try {
            await supabaseClient.from('delivery_partners').update({
              updated_at: new Date().toISOString()
            }).eq('id', currentRider.id);
          } catch(e) {}
        }
      }, 15000);
    }
  }

  // Status toggle (Online / Offline)
  if (statusToggleBtn) {
    statusToggleBtn.addEventListener('click', async () => {
      if (!currentRider) return;
      const newStatus = (currentRider.status === 'offline') ? 'available' : 'offline';
      currentRider.status = newStatus;
      updateStatusUI(newStatus);

      if (supabaseClient) {
        await supabaseClient.from('delivery_partners').update({ status: newStatus }).eq('id', currentRider.id);
      }
      showRiderToast(newStatus === 'available' ? 'You are now Online & Available!' : 'You are now Offline');
    });
  }

  function updateStatusUI(status) {
    const isOnline = (status !== 'offline');
    statusToggleBtn.className = isOnline ? 'status-pill online' : 'status-pill offline';
    statusToggleText.textContent = isOnline ? 'Online' : 'Offline';
  }

  // --------------------------------------------------------------------------
  // ORDER MANAGEMENT & REALTIME SYNC
  // --------------------------------------------------------------------------
  async function fetchActiveOrder() {
    if (!currentRider) return;

    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('orders')
          .select('*')
          .ilike('rider_id', currentRider.id)
          .neq('status', 'delivered')
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false })
          .limit(1);

        if (!error && Array.isArray(data) && data.length > 0) {
          const incomingOrder = data[0];
          if (activeDeliveryOrder && activeDeliveryOrder.id === incomingOrder.id) {
            const ranks = {
              'placed': 1, 'pending': 1,
              'accepted': 2, 'confirmed': 2, 'preparing': 2, 'cooking': 2,
              'food_ready': 3, 'ready': 3,
              'out_for_delivery': 4, 'dispatched': 4,
              'delivered': 5, 'completed': 5,
              'cancelled': 99, 'rejected': 99
            };
            const curRank = ranks[String(activeDeliveryOrder.status).toLowerCase().trim()] || 0;
            const incomingRank = ranks[String(incomingOrder.status).toLowerCase().trim()] || 0;
            if ((curRank === 99 && incomingRank < 99) || (curRank > incomingRank && incomingRank < 99 && curRank < 99)) {
              console.warn(`[Rider Fetch] Blocked status regression for #${incomingOrder.id}: ${activeDeliveryOrder.status} -> ${incomingOrder.status}`);
              incomingOrder.status = activeDeliveryOrder.status;
            }
          }
          activeDeliveryOrder = incomingOrder;
          renderActiveOrderUI(activeDeliveryOrder);
          return;
        }
      } catch (e) {
        console.warn('Active order fetch error:', e);
      }
    }

    // No active order found
    activeDeliveryOrder = null;
    renderActiveOrderUI(null);
  }

  async function fetchTodayCompletedOrders() {
    if (!currentRider) return;

    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('orders')
          .select('*')
          .ilike('rider_id', currentRider.id)
          .ilike('status', 'delivered')
          .order('created_at', { ascending: false })
          .limit(50);

        if (!error && Array.isArray(data)) {
          todayCompletedOrders = data;
          renderCompletedOrdersUI();
          return;
        }
      } catch (e) {
        console.warn('Completed orders fetch error:', e);
      }
    }

    if (!todayCompletedOrders || todayCompletedOrders.length === 0) {
      todayCompletedOrders = [];
      renderCompletedOrdersUI();
    }
  }

  function renderActiveOrderUI(ord) {
    if (!ord) {
      emptyCockpitState.style.display = 'block';
      activeOrderCard.style.display = 'none';
      return;
    }

    emptyCockpitState.style.display = 'none';
    activeOrderCard.style.display = 'block';

    cardOrderId.textContent = '#' + ord.id;
    const timeAgo = ord.created_at ? new Date(ord.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recent';
    cardOrderTime.textContent = 'Placed at ' + timeAgo;

    // Total & Customer Details
    cardCustomerName.textContent = ord.customer_name || 'Customer';
    cardOrderTotal.textContent = 'Total Bill: ₹' + (ord.total_amount || 0);
    cardCustomerAddress.textContent = ord.customer_address || 'No address specified';

    // Direct phone link
    if (ord.customer_phone) {
      btnCallCustomer.href = 'tel:' + ord.customer_phone;
      btnCallCustomer.style.display = 'flex';
    } else {
      btnCallCustomer.style.display = 'none';
    }

    // Google Maps Navigation link
    if (ord.customer_address) {
      btnNavCustomer.href = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(ord.customer_address + ', Palghar');
      btnNavCustomer.style.display = 'flex';
    } else {
      btnNavCustomer.style.display = 'none';
    }

    // Payment warning
    const isCod = ord.payment_method === 'cod' || ord.payment_status !== 'paid';
    if (isCod) {
      cardPaymentAlert.className = 'payment-notice-bar cod';
      cardPaymentAlertText.innerHTML = '<i class="fas fa-money-bill-wave"></i> <strong>CASH ON DELIVERY:</strong> Collect ₹' + (ord.total_amount || 0) + ' from customer (Cash / your GPay)';
    } else {
      cardPaymentAlert.className = 'payment-notice-bar online';
      cardPaymentAlertText.innerHTML = '<i class="fas fa-check-circle"></i> <strong>PRE-PAID ONLINE:</strong> Do NOT collect cash from customer';
    }

    // Kitchen Prep Time & Delivery ETA
    if (cardKitchenEtaNotice) {
      const isFoodReady = ord.status === 'food_ready';
      const isCooking = ['accepted', 'preparing', 'cooking', 'confirmed'].includes(ord.status);
      const isOutForDeliv = ord.status === 'out_for_delivery';

      const prepMins = ord.estimated_prep_time || 20;
      let elapsedMins = 0;
      if (ord.accepted_at) {
        elapsedMins = Math.max(0, Math.floor((Date.now() - new Date(ord.accepted_at).getTime()) / 60000));
      } else if (ord.created_at) {
        elapsedMins = Math.max(0, Math.floor((Date.now() - new Date(ord.created_at).getTime()) / 60000));
      }

      let deliveryTimeFormatted = '';
      if (ord.estimated_delivery_by) {
        deliveryTimeFormatted = new Date(ord.estimated_delivery_by).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      if (isFoodReady) {
        cardKitchenEtaNotice.style.display = 'flex';
        cardKitchenEtaNotice.style.background = '#f0fdf4';
        cardKitchenEtaNotice.style.borderColor = '#bbf7d0';
        if (cardKitchenEtaIcon) {
          cardKitchenEtaIcon.style.background = '#dcfce7';
          cardKitchenEtaIcon.style.color = '#16a34a';
          cardKitchenEtaIcon.innerHTML = '<i class="fas fa-box-open"></i>';
        }
        if (cardKitchenEtaTitle) cardKitchenEtaTitle.textContent = '📦 Food Packed & Ready for Pickup!';
        if (cardKitchenEtaSubtext) cardKitchenEtaSubtext.textContent = deliveryTimeFormatted ? `Collect order • Target delivery: ${deliveryTimeFormatted}` : 'Collect order from counter and start delivery';
        if (cardKitchenStatusBadge) {
          cardKitchenStatusBadge.style.background = '#dcfce7';
          cardKitchenStatusBadge.style.color = '#15803d';
          cardKitchenStatusBadge.textContent = 'Food Ready';
        }
      } else if (isCooking) {
        const remMins = Math.max(1, prepMins - elapsedMins);
        cardKitchenEtaNotice.style.display = 'flex';
        cardKitchenEtaNotice.style.background = '#fdfbf7';
        cardKitchenEtaNotice.style.borderColor = '#e8dec8';
        if (cardKitchenEtaIcon) {
          cardKitchenEtaIcon.style.background = '#fef3c7';
          cardKitchenEtaIcon.style.color = '#b45309';
          cardKitchenEtaIcon.innerHTML = '<i class="fas fa-fire-burner"></i>';
        }
        if (cardKitchenEtaTitle) cardKitchenEtaTitle.textContent = `🍳 Kitchen Cooking • Ready in ~${remMins} mins`;
        if (cardKitchenEtaSubtext) cardKitchenEtaSubtext.textContent = deliveryTimeFormatted ? `Target Customer Delivery by ${deliveryTimeFormatted}` : `Estimated prep time: ${prepMins} mins`;
        if (cardKitchenStatusBadge) {
          cardKitchenStatusBadge.style.background = '#fef3c7';
          cardKitchenStatusBadge.style.color = '#b45309';
          cardKitchenStatusBadge.textContent = `Cooking (${prepMins}m)`;
        }
      } else if (isOutForDeliv) {
        cardKitchenEtaNotice.style.display = 'flex';
        cardKitchenEtaNotice.style.background = '#f0f9ff';
        cardKitchenEtaNotice.style.borderColor = '#bae6fd';
        if (cardKitchenEtaIcon) {
          cardKitchenEtaIcon.style.background = '#e0f2fe';
          cardKitchenEtaIcon.style.color = '#0284c7';
          cardKitchenEtaIcon.innerHTML = '<i class="fas fa-motorcycle"></i>';
        }
        if (cardKitchenEtaTitle) cardKitchenEtaTitle.textContent = '🛵 Out for Delivery • On the Road';
        if (cardKitchenEtaSubtext) cardKitchenEtaSubtext.textContent = deliveryTimeFormatted ? `Target Arrival by ${deliveryTimeFormatted}` : 'Drive safely to customer address';
        if (cardKitchenStatusBadge) {
          cardKitchenStatusBadge.style.background = '#e0f2fe';
          cardKitchenStatusBadge.style.color = '#0369a1';
          cardKitchenStatusBadge.textContent = 'In Transit';
        }
      } else {
        cardKitchenEtaNotice.style.display = 'none';
      }
    }

    // Items list
    let itemsHtml = '';
    const items = Array.isArray(ord.items) ? ord.items : [];
    items.forEach(it => {
      itemsHtml += `<div class="item-pill-row">
        <span>${escapeHtml(it.name || 'Dish')}</span>
        <strong>${it.qty || it.quantity || 1}x</strong>
      </div>`;
    });
    cardItemsList.innerHTML = itemsHtml || '<div style="font-size:0.8rem;color:#94a3b8;">Standard Order Items</div>';

    // Button Progression States:
    // 1. If not picked up and not out for delivery -> Show "Pick Up Order & Start Delivery"
    // 2. Once picked up or out for delivery -> Show "Complete Delivery"
    const isOutForDelivery = ord.status === 'out_for_delivery' || ord.status === 'dispatched' || Boolean(ord.picked_up_at);
    if (!isOutForDelivery) {
      cardOrderStepTag.textContent = (ord.status === 'food_ready') ? 'Food Ready • Collect Order' : 'Order Assigned • In Kitchen';
      btnActionPickup.style.display = 'flex';
      btnActionPickup.innerHTML = '<i class="fas fa-box-open"></i> Pick Up Order & Start Delivery';
      btnActionTransit.style.display = 'none';
      btnActionDelivered.style.display = 'none';
    } else {
      cardOrderStepTag.textContent = 'Out for Delivery 🛵';
      btnActionPickup.style.display = 'none';
      btnActionTransit.style.display = 'none';
      btnActionDelivered.style.display = 'flex';
      const isCod = ord.payment_method === 'cod' || ord.payment_status !== 'paid';
      if (isCod) {
        btnActionDelivered.innerHTML = `<i class="fas fa-money-bill-wave"></i> Collect ₹${ord.total_amount || 0} Cash & Complete Delivery`;
        btnActionDelivered.style.background = '#15803d';
      } else {
        btnActionDelivered.innerHTML = `<i class="fas fa-check-circle"></i> Hand Over Food & Complete Delivery`;
        btnActionDelivered.style.background = '#0284c7';
      }
    }
  }

  function updateRiderKpiTotals() {
    if (dispTodayDeliveries) {
      dispTodayDeliveries.textContent = todayCompletedOrders.length;
    }

    let unsettledCash = 0;
    todayCompletedOrders.forEach(o => {
      const isCash = (o.payment_method === 'cod' || Number(o.cash_collected || 0) > 0);
      if (isCash && !o.settled_with_admin) {
        unsettledCash += Number(o.cash_collected !== undefined ? o.cash_collected : (o.total_amount || 0));
      }
    });

    const riderDbBalance = currentRider ? Number(currentRider.cash_in_hand || 0) : 0;
    const totalDue = Math.max(unsettledCash, riderDbBalance);

    if (dispTodayCash) {
      dispTodayCash.textContent = '₹' + Math.round(totalDue);
      dispTodayCash.style.color = totalDue > 0 ? '#b45309' : '#16a34a';
    }

    if (tileCashInHand) {
      if (totalDue > 0) {
        tileCashInHand.classList.add('has-cash');
      } else {
        tileCashInHand.classList.remove('has-cash');
      }
    }
  }

  function renderCompletedOrdersUI() {
    updateRiderKpiTotals();

    if (todayCompletedOrders.length === 0) {
      completedDeliveriesList.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 20px;">
        No deliveries completed today yet.
      </div>`;
      return;
    }

    let historyHtml = '';
    todayCompletedOrders.forEach(o => {
      const isCod = o.payment_method === 'cod' || Number(o.cash_collected || 0) > 0;
      const timeStr = o.delivered_at ? new Date(o.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Completed';
      const isSettled = o.settled_with_admin === true;

      let tagClass = 'online';
      let tagLabel = 'Prepaid Online';
      if (isCod) {
        if (isSettled) {
          tagClass = 'online';
          tagLabel = 'Cash Handed Over (Cleared ✅)';
        } else {
          tagClass = 'cod';
          tagLabel = 'Cash in Hand (Due ₹' + (o.cash_collected || o.total_amount || 0) + ')';
        }
      }

      historyHtml += `
        <div class="history-card">
          <div class="history-meta">
            <strong>#${escapeHtml(o.id)} • ${escapeHtml(o.customer_name || 'Customer')}</strong>
            <small><i class="far fa-clock"></i> ${timeStr}</small>
          </div>
          <div class="history-amt">
            <strong>₹${o.total_amount || 0}</strong>
            <small class="${tagClass}">${tagLabel}</small>
          </div>
        </div>
      `;
    });
    completedDeliveriesList.innerHTML = historyHtml;
  }

  // --------------------------------------------------------------------------
  // ACTION HANDLERS
  // --------------------------------------------------------------------------
  if (btnActionPickup) {
    btnActionPickup.addEventListener('click', async () => {
      stopRiderRinger();
      if (!activeDeliveryOrder) return;
      btnActionPickup.disabled = true;
      btnActionPickup.innerHTML = '<i class="fas fa-motorcycle"></i> Starting Delivery...';

      const now = new Date().toISOString();
      activeDeliveryOrder.picked_up_at = now;
      activeDeliveryOrder.dispatched_at = now;
      activeDeliveryOrder.status = 'out_for_delivery';

      if (supabaseClient) {
        try {
          const { error } = await supabaseClient.from('orders').update({
            picked_up_at: now,
            dispatched_at: now,
            status: 'out_for_delivery',
            updated_at: now
          }).eq('id', activeDeliveryOrder.id);

          if (error) {
            console.error('Error updating order on pickup:', error);
            showRiderToast('⚠️ Sync notice: ' + error.message);
          }

          if (currentRider) {
            await supabaseClient.from('delivery_partners').update({
              status: 'on_delivery',
              active_order_id: activeDeliveryOrder.id,
              updated_at: now
            }).eq('id', currentRider.id);
          }
        } catch (err) {
          console.error('Pickup update error:', err);
        }
      }

      showRiderToast('🛵 Order picked up! Out for delivery to customer.');
      renderActiveOrderUI(activeDeliveryOrder);
      btnActionPickup.disabled = false;
    });
  }

  if (btnActionTransit) {
    btnActionTransit.addEventListener('click', async () => {
      stopRiderRinger();
      if (!activeDeliveryOrder) return;
      btnActionTransit.disabled = true;
      btnActionTransit.innerHTML = '<i class="fas fa-motorcycle"></i> Starting Delivery...';

      const now = new Date().toISOString();
      activeDeliveryOrder.status = 'out_for_delivery';
      if (!activeDeliveryOrder.dispatched_at) activeDeliveryOrder.dispatched_at = now;
      if (!activeDeliveryOrder.picked_up_at) activeDeliveryOrder.picked_up_at = now;

      if (supabaseClient) {
        await supabaseClient.from('orders').update({
          status: 'out_for_delivery',
          dispatched_at: activeDeliveryOrder.dispatched_at,
          picked_up_at: activeDeliveryOrder.picked_up_at
        }).eq('id', activeDeliveryOrder.id);
      }

      showRiderToast('🛵 Out for delivery! Customer tracking screen updated.');
      renderActiveOrderUI(activeDeliveryOrder);
      btnActionTransit.disabled = false;
    });
  }

  if (btnActionDelivered) {
    btnActionDelivered.addEventListener('click', async () => {
      stopRiderRinger();
      if (!activeDeliveryOrder) return;

      const isCod = activeDeliveryOrder.payment_method === 'cod' || activeDeliveryOrder.payment_status !== 'paid';
      const amt = Number(activeDeliveryOrder.total_amount || 0);
      const promptMsg = isCod
        ? `Confirm Delivery of Order #${activeDeliveryOrder.id}?\n\nPlease confirm you collected ₹${amt} CASH (or personal GPay) from ${activeDeliveryOrder.customer_name}.`
        : `Confirm Delivery of Order #${activeDeliveryOrder.id} to ${activeDeliveryOrder.customer_name}?`;

      if (!confirm(promptMsg)) return;

      btnActionDelivered.disabled = true;
      btnActionDelivered.innerHTML = '<i class="fas fa-check-circle"></i> Completing Delivery...';

      const now = new Date().toISOString();
      const deliveredId = activeDeliveryOrder.id;
      const cashAmt = isCod ? amt : 0;

      activeDeliveryOrder.status = 'delivered';
      activeDeliveryOrder.delivered_at = now;
      activeDeliveryOrder.cash_collected = cashAmt;
      activeDeliveryOrder.settled_with_admin = false;

      // Update Supabase
      if (supabaseClient) {
        try {
          const { error: ordErr } = await supabaseClient.from('orders').update({
            status: 'delivered',
            payment_status: 'PAID',
            delivered_at: now,
            cash_collected: cashAmt,
            settled_with_admin: false,
            updated_at: now
          }).eq('id', deliveredId);

          if (ordErr) {
            console.error('Error updating delivery status in Supabase:', ordErr);
            alert('Failed to update order status: ' + ordErr.message);
            btnActionDelivered.disabled = false;
            btnActionDelivered.innerHTML = isCod ? `<i class="fas fa-money-bill-wave"></i> Collect ₹${amt} Cash & Complete Delivery` : `<i class="fas fa-check-circle"></i> Hand Over Food & Complete Delivery`;
            return;
          }

          const prevCash = Number(currentRider.cash_in_hand || 0);
          const updatedCashInHand = prevCash + cashAmt;
          currentRider.cash_in_hand = updatedCashInHand;
          currentRider.total_deliveries = (currentRider.total_deliveries || 0) + 1;

          await supabaseClient.from('delivery_partners').update({
            active_order_id: null,
            status: 'available',
            total_deliveries: currentRider.total_deliveries,
            cash_in_hand: updatedCashInHand,
            updated_at: now
          }).eq('id', currentRider.id);

          try { localStorage.setItem(RIDER_SESSION_KEY, JSON.stringify(currentRider)); } catch(e){}
        } catch (err) {
          console.error('Error updating delivery status in Supabase:', err);
        }
      }

      playOrderArrivalChime();
      if (navigator.vibrate) navigator.vibrate([150, 100, 250]);

      todayCompletedOrders.unshift(Object.assign({}, activeDeliveryOrder));
      activeDeliveryOrder = null;

      showRiderToast(isCod
        ? `🎉 Order delivered! Collected ₹${cashAmt} cash in hand.`
        : `🎉 Order delivered! Great job.`);

      renderActiveOrderUI(null);
      renderCompletedOrdersUI();
    });
  }



  // --------------------------------------------------------------------------
  // SUPABASE REALTIME SUBSCRIPTION
  // --------------------------------------------------------------------------
  function setupRealtimeSubscription() {
    if (!supabaseClient || !currentRider) return;

    try {
      if (realtimeChannel) realtimeChannel.unsubscribe();

      realtimeChannel = supabaseClient.channel('rider-cockpit-' + currentRider.id)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `rider_id=eq.${currentRider.id}`
        }, (payload) => {
          handleIncomingRealtimeOrder(payload);
        })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'delivery_partners',
          filter: `id=eq.${currentRider.id}`
        }, (payload) => {
          handleIncomingRiderPartnerUpdate(payload);
        })
        .subscribe((status) => {
          const liveSyncEl = document.getElementById('liveSyncStatus');
          if (liveSyncEl) {
            if (status === 'SUBSCRIBED') {
              liveSyncEl.innerHTML = '<i class="fas fa-circle" style="font-size: 6px; color:#22c55e;"></i> Live Sync';
            } else {
              liveSyncEl.innerHTML = '<i class="fas fa-circle" style="font-size: 6px; color:#eab308;"></i> Connecting...';
            }
          }
        });
    } catch (e) {
      console.warn('Realtime channel subscribe notice:', e);
    }
  }

  function handleIncomingRiderPartnerUpdate(payload) {
    if (!payload) return;

    if (payload.eventType === 'DELETE') {
      localStorage.removeItem(RIDER_SESSION_KEY);
      currentRider = null;
      if (riderAuthView) riderAuthView.style.display = 'block';
      if (riderCockpitView) riderCockpitView.style.display = 'none';
      if (btnRiderLogout) btnRiderLogout.style.display = 'none';
      showRiderToast('Rider account was reset or removed.');
      return;
    }

    if (!payload.new) return;
    const prevCash = Number(currentRider.cash_in_hand || 0);
    currentRider = Object.assign({}, currentRider, payload.new);
    try { localStorage.setItem(RIDER_SESSION_KEY, JSON.stringify(currentRider)); } catch(e){}

    fetchTodayCompletedOrders();

    if (prevCash > 0 && Number(payload.new.cash_in_hand || 0) === 0) {
      playOrderArrivalChime();
      if (navigator.vibrate) navigator.vibrate([200, 100, 300]);
      showRiderToast('🎉 Cash handover confirmed by manager! All dues cleared (₹0).');
    }
  }

  function handleIncomingRealtimeOrder(payload) {
    if (!payload) return;

    if (payload.eventType === 'DELETE') {
      if (payload.old) {
        if (activeDeliveryOrder && activeDeliveryOrder.id === payload.old.id) {
          activeDeliveryOrder = null;
          renderActiveOrderUI(null);
        }
        todayCompletedOrders = todayCompletedOrders.filter(o => o.id !== payload.old.id);
      } else {
        activeDeliveryOrder = null;
        renderActiveOrderUI(null);
        todayCompletedOrders = [];
      }
      renderCompletedOrdersUI();
      return;
    }

    const updated = payload.new;
    if (!updated) return;

    // CRITICAL GUARD: Only handle if this order is assigned to THIS rider!
    const riderIdStr = currentRider ? String(currentRider.id || '').trim().toLowerCase() : '';
    const orderRiderIdStr = updated.rider_id ? String(updated.rider_id).trim().toLowerCase() : '';
    if (!riderIdStr || !orderRiderIdStr || orderRiderIdStr !== riderIdStr) {
      if (activeDeliveryOrder && activeDeliveryOrder.id === updated.id) {
        activeDeliveryOrder = null;
        renderActiveOrderUI(null);
      }
      return; // NEVER ring or display unassigned or other rider orders!
    }

    if (updated.settled_with_admin) {
      fetchTodayCompletedOrders();
    }

    if (updated.status === 'delivered') {
      if (activeDeliveryOrder && activeDeliveryOrder.id === updated.id) {
        activeDeliveryOrder = null;
        renderActiveOrderUI(null);
      }
      fetchTodayCompletedOrders();
      return;
    }

    if (updated.status === 'cancelled') {
      stopRiderRinger();
      if (activeDeliveryOrder && activeDeliveryOrder.id === updated.id) {
        const by = (updated.cancelled_by === 'customer') ? 'customer' : 'restaurant kitchen';
        showRiderToast('⚠️ Order #' + updated.id + ' was cancelled by ' + by + '.');
        activeDeliveryOrder = null;
        renderActiveOrderUI(null);
      }
      return;
    }

    // Guard against out-of-order lower status overwriting higher status
    if (activeDeliveryOrder && activeDeliveryOrder.id === updated.id) {
      const ranks = {
        'placed': 1, 'pending': 1,
        'accepted': 2, 'confirmed': 2, 'preparing': 2, 'cooking': 2,
        'food_ready': 3, 'ready': 3,
        'out_for_delivery': 4, 'dispatched': 4,
        'delivered': 5, 'completed': 5,
        'cancelled': 99, 'rejected': 99
      };
      const curRank = ranks[activeDeliveryOrder.status] || 0;
      const incomingRank = ranks[updated.status] || 0;
      if ((curRank === 99 && incomingRank < 99) || (incomingRank > 0 && incomingRank < curRank && updated.status !== 'cancelled' && updated.status !== 'rejected')) {
        updated.status = activeDeliveryOrder.status;
      }
    }

    // New or updated active order!
    const isNew = !activeDeliveryOrder || activeDeliveryOrder.id !== updated.id;
    activeDeliveryOrder = updated;
    renderActiveOrderUI(activeDeliveryOrder);

    if (isNew) {
      if (!updated.picked_up_at && updated.status !== 'delivered' && updated.status !== 'cancelled') {
        startRiderRinger(updated.id);
      } else {
        playOrderArrivalChime();
      }
      showRiderToast('🔔 NEW DELIVERY ORDER: #' + updated.id);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // --------------------------------------------------------------------------
  // AUTO-LOGIN ON BOOT (WITH SERVER TOKEN VALIDATION)
  // --------------------------------------------------------------------------
  (async function verifyAndRestoreRiderSession() {
    try {
      const token = localStorage.getItem(RIDER_TOKEN_KEY) || sessionStorage.getItem(RIDER_TOKEN_KEY);
      const saved = localStorage.getItem(RIDER_SESSION_KEY) || sessionStorage.getItem(RIDER_SESSION_KEY);
      if (token || saved) {
        const headers = {};
        if (token) {
          headers['Authorization'] = 'Bearer ' + token;
          window.BREEZE_RIDER_TOKEN = token;
        }
        const res = await fetch('/api/auth?action=me', {
          headers,
          credentials: 'include'
        });
        const json = await res.json();
        if (json && json.authenticated && json.user && json.user.type === 'rider') {
          currentRider = { ...json.user };
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              currentRider = { ...parsed, ...json.user };
            } catch(e){}
          }
          if (supabaseClient) {
            try {
              const { data } = await supabaseClient
                .from('delivery_partners')
                .select('*')
                .eq('id', currentRider.id)
                .single();
              if (data) currentRider = { ...currentRider, ...data };
            } catch(e){}
          }
          initCockpit();
          return;
        } else {
          console.warn('[Rider Auth] Invalid session or token expired, clearing session');
          localStorage.removeItem(RIDER_SESSION_KEY);
          localStorage.removeItem(RIDER_TOKEN_KEY);
          sessionStorage.removeItem(RIDER_SESSION_KEY);
          sessionStorage.removeItem(RIDER_TOKEN_KEY);
          window.BREEZE_RIDER_TOKEN = null;
          currentRider = null;
          if (riderAuthView) riderAuthView.style.display = 'block';
          if (riderCockpitView) riderCockpitView.style.display = 'none';
          if (btnRiderLogout) btnRiderLogout.style.display = 'none';
        }
      }
    } catch (e) {
      console.warn('[Rider Auth] Error verifying session:', e);
      const token = localStorage.getItem(RIDER_TOKEN_KEY) || sessionStorage.getItem(RIDER_TOKEN_KEY);
      const saved = localStorage.getItem(RIDER_SESSION_KEY) || sessionStorage.getItem(RIDER_SESSION_KEY);
      if (token && saved) {
        try {
          currentRider = JSON.parse(saved);
          window.BREEZE_RIDER_TOKEN = token;
          initCockpit();
        } catch(err){}
      }
    }
  })();

});
