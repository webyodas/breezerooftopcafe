/**
 * ============================================================================
 * BREEZE ROOFTOP CAFE - LIVE ORDER TRACKING & RADAR CONTROLLER (v2.0)
 * ============================================================================
 * Features:
 * 1. Direct Order ID / Token tracking with zero main-thread freeze.
 * 2. Multi-Order lookup by 10-digit mobile number: displays all orders on the go,
 *    with an intuitive active orders switcher and full past delivered orders list.
 * 3. 60-Second Grace Cancellation window & Kitchen Lock status synchronization.
 * 4. Realtime updates via Cloudflare D1 events with loop-guarded subscription.
 * 5. One-shot non-looping gentle chime on order milestone transitions.
 * 6. Direct WhatsApp Cafe Manager inquiry button.
 */

(function () {
  'use strict';

  // DOM Elements - Search & State Containers
  const trackSearchForm = document.getElementById('trackSearchForm');
  const trackInputLookup = document.getElementById('trackInputLookup');
  const btnTrackLookup = document.getElementById('btnTrackLookup');
  const trackRecentBtn = document.getElementById('trackRecentBtn');
  const trackResultsContainer = document.getElementById('trackResultsContainer');
  const trackEmptyState = document.getElementById('trackEmptyState');
  const trackLoadingState = document.getElementById('trackLoadingState');
  const trackNoActiveOrdersBanner = document.getElementById('trackNoActiveOrdersBanner');

  // DOM Elements - Active Orders on the Go Bar
  const trackActiveChipsBar = document.getElementById('trackActiveChipsBar');
  const trackActiveCount = document.getElementById('trackActiveCount');
  const trackActiveChipsList = document.getElementById('trackActiveChipsList');

  // DOM Elements - Past Orders Section
  const trackPastOrdersSection = document.getElementById('trackPastOrdersSection');
  const trackPastCount = document.getElementById('trackPastCount');
  const trackPastOrdersList = document.getElementById('trackPastOrdersList');

  // DOM Elements - Order Header Card
  const trackDisplayOrderId = document.getElementById('trackDisplayOrderId');
  const trackStatusBadge = document.getElementById('trackStatusBadge');
  const trackStatusBadgeText = document.getElementById('trackStatusBadgeText');
  const trackOrderDate = document.getElementById('trackOrderDate');
  const trackingHeroCard = document.getElementById('trackingHeroCard');
  const trackHeroIcon = document.getElementById('trackingHeroIcon');
  const trackHeroHeading = document.getElementById('trackingHeroHeading');
  const trackHeroSubtext = document.getElementById('trackingHeroSubtext');
  const trackPrepEstimate = document.getElementById('trackingPrepEstimate');
  const trackPrepTimeText = document.getElementById('trackingPrepTimeText');

  // DOM Elements - Cancellation & Kitchen Lock
  const trackCancelBox = document.getElementById('trackingCancelBox');
  const cancelTimerCountdown = document.getElementById('cancelTimerCountdown');
  const btnCancelOrder = document.getElementById('btnCancelOrder');
  const trackKitchenLocked = document.getElementById('trackingKitchenLocked');

  // DOM Elements - 5-Step Stepper
  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  const step3 = document.getElementById('step3');
  const step4 = document.getElementById('step4');
  const step5 = document.getElementById('step5');

  // DOM Elements - Rider Partner Card
  const trackRiderCard = document.getElementById('trackingRiderCard');
  const trackRiderName = document.getElementById('trackingRiderName');
  const trackRiderPhoneBtn = document.getElementById('trackingRiderPhoneBtn');
  const trackRiderVehicle = document.getElementById('trackingRiderVehicle');

  // DOM Elements - Items & Bill
  const trackItemsList = document.getElementById('trackingItemsList');
  const trackSubtotalAmount = document.getElementById('trackSubtotalAmount');
  const trackTotalAmount = document.getElementById('trackingTotalAmount');
  const trackPaymentPill = document.getElementById('trackingPaymentPill');
  const trackDestinationInfo = document.getElementById('trackingDestinationInfo');
  const trackHelpWhatsappBtn = document.getElementById('trackHelpWhatsappBtn');

  // DOM Elements - Delivered Celebration & Rating
  const trackDeliveredCard = document.getElementById('trackingDeliveredCard');
  const trackRatingStars = document.getElementById('trackingRatingStars');
  const ratingFeedbackMsg = document.getElementById('ratingFeedbackMsg');
  const btnReorderFromTracking = document.getElementById('btnReorderFromTracking');

  // In-Memory State
  let currentActiveOrder = null;
  let activeRealtimeOrderId = null;
  let activeRealtimeChannel = null;
  let graceTimerInterval = null;
  let lastNotifiedStatus = null;
  let lastChimeTimestamp = 0;
  let cachedOrdersForPhone = [];

  // --------------------------------------------------------------------------
  // ESCAPE HTML HELPER
  // --------------------------------------------------------------------------
  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str || '');
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --------------------------------------------------------------------------
  // ACTIVE STATUS HELPER
  // --------------------------------------------------------------------------
  function isActiveStatus(status) {
    const s = String(status || '').toLowerCase().trim();
    return s === 'placed' || s === 'pending' || s === 'confirmed' || s === 'accepted' ||
           s === 'cooking' || s === 'preparing' || s === 'food_ready' ||
           s === 'out_for_delivery' || s === 'dispatched';
  }

  // --------------------------------------------------------------------------
  // GENTLE CUSTOMER NOTIFICATION SOUND ENGINE (One-shot, non-looping chime)
  // --------------------------------------------------------------------------
  function playCustomerNotificationChime(type = 'info') {
    try {
      const now = Date.now();
      if (now - lastChimeTimestamp < 2500) return; // Strict throttle
      lastChimeTimestamp = now;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (type === 'declined') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, t);
        osc.frequency.exponentialRampToValueAtTime(390, t + 0.35);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.35);
      } else {
        // Pure harmonic sine bell chime (784Hz -> 1046.5Hz, 0.18 gain, 0.55s decay)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(784, t);
        osc.frequency.exponentialRampToValueAtTime(1046.5, t + 0.08);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.55);
      }

      if (navigator.vibrate) {
        try { navigator.vibrate(60); } catch (e) {}
      }
    } catch (e) {
      // Autoplay silently handled
    }
  }

  // --------------------------------------------------------------------------
  // ORDER NORMALIZATION HELPER
  // --------------------------------------------------------------------------
  function normalizeOrderRecord(row) {
    if (!row) return null;

    let items = [];
    try {
      items = typeof row.items === 'string' ? JSON.parse(row.items) : (Array.isArray(row.items) ? row.items : []);
    } catch (e) {
      items = [];
    }

    let customer = {};
    try {
      customer = typeof row.customer === 'string' ? JSON.parse(row.customer) : (row.customer || {});
    } catch (e) {
      customer = {};
    }

    let step = 1;
    const st = (row.status || '').toLowerCase().trim();
    if (st === 'placed' || st === 'pending') step = 1;
    else if (st === 'confirmed' || st === 'accepted') step = 2;
    else if (st === 'cooking' || st === 'preparing') step = 3;
    else if (st === 'food_ready' || st === 'dispatched' || st === 'out_for_delivery') step = 4;
    else if (st === 'delivered' || st === 'completed') step = 5;
    else if (st === 'cancelled' || st === 'rejected') step = 0;

    const totalVal = Number(row.total_amount !== undefined ? row.total_amount : (row.total || 0));
    const subtotalVal = Number(row.subtotal !== undefined ? row.subtotal : (totalVal || 0));

    return {
      id: row.id,
      created_at: row.created_at || new Date().toISOString(),
      status: row.status || 'placed',
      items: items,
      total: totalVal,
      total_amount: totalVal,
      subtotal: subtotalVal,
      delivery_fee: Number(row.delivery_fee || 0),
      customer: customer,
      customer_name: customer.name || row.customer_name || 'Valued Guest',
      customer_phone: customer.phone || row.customer_phone || '',
      customer_address: customer.address || row.customer_address || '',
      table_number: customer.table || row.table_number || '',
      order_type: customer.type || row.order_type || 'Home Delivery',
      rider_id: row.rider_id || null,
      rider_name: row.rider_name || null,
      rider_phone: row.rider_phone || null,
      payment_method: row.payment_method || 'cod',
      payment_status: row.payment_status || 'PENDING',
      currentStep: step,
      estimated_prep_time: row.estimated_prep_time || 25,
      cancellation_reason: row.cancellation_reason || null,
      cancelled_by: row.cancelled_by || null
    };
  }

  // --------------------------------------------------------------------------
  // RENDER ORDER TRACKING UI (Single Order Focus)
  // --------------------------------------------------------------------------
  function renderOrderTracking(order, shouldSubscribe = true) {
    if (!order) return;
    currentActiveOrder = order;

    if (trackEmptyState) trackEmptyState.style.display = 'none';
    if (trackLoadingState) trackLoadingState.style.display = 'none';
    if (trackResultsContainer) trackResultsContainer.style.display = 'block';

    // Order Header
    if (trackDisplayOrderId) {
      trackDisplayOrderId.innerHTML = `Order #${escapeHtml(order.id)}`;
    }

    if (trackOrderDate) {
      try {
        const d = new Date(order.created_at);
        trackOrderDate.textContent = d.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch (e) {
        trackOrderDate.textContent = 'Today';
      }
    }

    const st = (order.status || '').toLowerCase().trim();

    // Status Badge & Stepper Mapping
    updateStepperAndHero(order);

    // 60-Second Grace Cancellation Timer
    startGraceWindowTimer(order);

    // Delivery Partner / Rider Card
    if (trackRiderCard) {
      if ((st === 'out_for_delivery' || st === 'dispatched' || st === 'food_ready' || st === 'delivered') && order.rider_name) {
        trackRiderCard.style.display = 'block';
        if (trackRiderName) trackRiderName.textContent = order.rider_name;
        if (trackRiderVehicle) trackRiderVehicle.textContent = 'Breeze Express Partner • Out for Delivery';
        if (trackRiderPhoneBtn) {
          if (order.rider_phone) {
            trackRiderPhoneBtn.href = 'tel:' + encodeURIComponent(order.rider_phone);
            trackRiderPhoneBtn.style.display = 'inline-flex';
          } else {
            trackRiderPhoneBtn.style.display = 'none';
          }
        }
      } else {
        trackRiderCard.style.display = 'none';
      }
    }

    // Items List
    if (trackItemsList) {
      let itemsHtml = '';
      (order.items || []).forEach(it => {
        const qty = it.qty || 1;
        const price = Number(it.price || 0);
        itemsHtml += `
          <div class="tracking-item-row" style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid rgba(0,0,0,0.06);">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-weight:700; color:var(--primary-gold); font-size:0.9rem;">${qty}x</span>
              <span style="font-weight:600; color:var(--text-dark); font-size:0.92rem;">${escapeHtml(it.name)}</span>
            </div>
            <span style="font-weight:700; color:var(--text-dark); font-size:0.92rem;">₹${price * qty}</span>
          </div>
        `;
      });
      trackItemsList.innerHTML = itemsHtml || '<div style="color:#78716c; font-size:0.85rem; padding:12px 0;">Items details unavailable</div>';
    }

    if (trackSubtotalAmount) trackSubtotalAmount.textContent = '₹' + (order.subtotal || order.total);
    if (trackTotalAmount) trackTotalAmount.textContent = '₹' + order.total;

    // Payment Pill
    if (trackPaymentPill) {
      const pm = (order.payment_method || '').toLowerCase();
      const ps = (order.payment_status || '').toUpperCase();
      if (pm === 'razorpay' || ps === 'PAID') {
        trackPaymentPill.className = 'tracking-payment-pill';
        trackPaymentPill.innerHTML = `<i class="fas fa-check-circle"></i> Paid Online via UPI / Razorpay (₹${order.total})`;
      } else if (pm === 'online_doorstep') {
        trackPaymentPill.className = 'tracking-payment-pill';
        trackPaymentPill.innerHTML = `<i class="fas fa-qrcode"></i> Doorstep UPI QR Due: ₹${order.total}`;
      } else {
        trackPaymentPill.className = 'tracking-payment-pill cod';
        trackPaymentPill.innerHTML = `<i class="fas fa-money-bill-wave"></i> Cash on Delivery Due: ₹${order.total}`;
      }
    }

    // Destination Info
    if (trackDestinationInfo) {
      const cType = order.order_type || 'Home Delivery';
      const cName = order.customer_name || 'Guest';
      const cPhone = order.customer_phone || '';
      const cAddr = order.customer_address || '';
      const cTable = order.table_number || 'Terrace Table';

      if (cType === 'Home Delivery') {
        trackDestinationInfo.innerHTML = `<i class="fas fa-motorcycle" style="color:var(--primary-gold);"></i> Delivering to <strong>${escapeHtml(cName)}</strong>${cPhone ? ' (' + escapeHtml(cPhone) + ')' : ''}${cAddr ? '<br><span style="color:#78716c; font-size:0.85rem;">' + escapeHtml(cAddr) + '</span>' : ''}`;
      } else if (cType.includes('Dine-In')) {
        trackDestinationInfo.innerHTML = `<i class="fas fa-utensils" style="color:var(--primary-gold);"></i> Rooftop Dine-In for <strong>${escapeHtml(cName)}</strong> (${escapeHtml(cTable)})`;
      } else {
        trackDestinationInfo.innerHTML = `<i class="fas fa-shopping-bag" style="color:var(--primary-gold);"></i> Takeaway / Pick-Up for <strong>${escapeHtml(cName)}</strong>`;
      }
    }

    // Delivered Celebration Card
    if (trackDeliveredCard) {
      if (st === 'delivered' || st === 'completed') {
        trackDeliveredCard.style.display = 'block';
      } else {
        trackDeliveredCard.style.display = 'none';
      }
    }

    // Direct WhatsApp Manager Inquiry
    if (trackHelpWhatsappBtn) {
      const waText = encodeURIComponent(`Hi Breeze Cafe Manager, I am inquiring regarding my Order #${order.id}.`);
      trackHelpWhatsappBtn.href = `https://wa.me/919623999095?text=${waText}`;
    }

    // Live Supabase / CF Realtime Subscription (Loop-guarded)
    if (shouldSubscribe && order.id) {
      subscribeToOrderRealtime(order.id);
    }
  }

  // --------------------------------------------------------------------------
  // STEPPER & HERO STATUS SYNCHRONIZATION
  // --------------------------------------------------------------------------
  function updateStepperAndHero(order) {
    const st = (order.status || '').toLowerCase().trim();
    const steps = [step1, step2, step3, step4, step5];

    let activeIndex = 0;
    let badgeText = 'Order Placed';
    let badgeClass = 'placed';
    let heroIcon = 'fa-receipt';
    let heroHeading = 'Order Placed Successfully!';
    let heroSub = 'We have received your order and sent it directly to the kitchen.';
    let isDeliveredState = false;
    let isCancelledState = false;

    if (st === 'placed' || st === 'pending') {
      activeIndex = 0;
      badgeText = 'Order Placed';
      badgeClass = 'placed';
      heroIcon = 'fa-receipt';
      heroHeading = 'Order Placed Successfully!';
      heroSub = 'We have received your order and sent it directly to the kitchen.';
    } else if (st === 'confirmed' || st === 'accepted') {
      activeIndex = 1;
      badgeText = 'Kitchen Confirmed';
      badgeClass = 'confirmed';
      heroIcon = 'fa-check-double';
      heroHeading = 'Order Accepted by Kitchen!';
      heroSub = 'Restaurant has accepted and scheduled your dishes for cooking.';
    } else if (st === 'cooking' || st === 'preparing') {
      activeIndex = 2;
      badgeText = 'Food Being Prepared';
      badgeClass = 'cooking';
      heroIcon = 'fa-utensils';
      heroHeading = 'Chef is Cooking Your Meal';
      heroSub = 'Fresh artisanal dishes are being prepared on our rooftop kitchen.';
    } else if (st === 'food_ready') {
      activeIndex = 3;
      badgeText = 'Packed & Ready';
      badgeClass = 'ready';
      heroIcon = 'fa-box-open';
      heroHeading = 'Food is Freshly Packed!';
      heroSub = order.rider_name ? `Assigned to delivery partner ${order.rider_name}. Dispatching momentarily.` : 'Awaiting delivery partner dispatch.';
    } else if (st === 'out_for_delivery' || st === 'dispatched') {
      activeIndex = 3;
      badgeText = 'Out for Delivery';
      badgeClass = 'transit';
      heroIcon = 'fa-motorcycle';
      heroHeading = 'Out for Delivery!';
      heroSub = order.rider_name ? `Your rider ${order.rider_name} is on the way with your hot meal.` : 'Your delivery partner is en route to your address.';
    } else if (st === 'delivered' || st === 'completed') {
      activeIndex = 4;
      badgeText = 'Delivered & Settled';
      badgeClass = 'delivered';
      heroIcon = 'fa-smile-beam';
      heroHeading = 'Enjoy Your Meal!';
      heroSub = 'Your order has been delivered successfully. Thank you for dining with Breeze!';
      isDeliveredState = true;
    } else if (st === 'cancelled' || st === 'rejected') {
      activeIndex = -1;
      const isCust = (order.cancelled_by === 'customer');
      badgeText = isCust ? 'Cancelled by You' : 'Cancelled by Restaurant';
      badgeClass = isCust ? 'customer-cancelled' : 'cancelled';
      heroIcon = isCust ? 'fa-user-check' : 'fa-times-circle';
      heroHeading = isCust ? 'Order Cancelled by You' : 'Order Cancelled by Restaurant';
      heroSub = isCust
        ? 'You cancelled this order during the grace period. No charges were incurred.'
        : (order.cancellation_reason ? ('Reason: ' + order.cancellation_reason) : 'Our kitchen was unable to fulfill this order at this time. We apologize for the inconvenience.');
      isCancelledState = true;
    }

    // Update Status Badge
    if (trackStatusBadgeText) trackStatusBadgeText.textContent = badgeText;
    if (trackStatusBadge) {
      trackStatusBadge.className = 'tracking-header-badge ' + badgeClass;
    }

    // Update Hero Card Classes & Texts
    if (trackingHeroCard) {
      trackingHeroCard.classList.remove('delivered-state', 'cancelled-state', 'user-cancelled-state');
      if (isDeliveredState) trackingHeroCard.classList.add('delivered-state');
      if (isCancelledState) {
        const isCust = (order.cancelled_by === 'customer');
        trackingHeroCard.classList.add(isCust ? 'user-cancelled-state' : 'cancelled-state');
      }
    }
    if (trackHeroIcon) {
      trackHeroIcon.className = 'fas ' + heroIcon;
    }
    if (trackHeroHeading) trackHeroHeading.textContent = heroHeading;
    if (trackHeroSubtext) trackHeroSubtext.textContent = heroSub;
    if (trackPrepTimeText) {
      trackPrepTimeText.textContent = (st === 'delivered' || st === 'completed')
        ? 'Delivered on time'
        : `Est. Prep & Delivery: ~${order.estimated_prep_time || 25} Mins`;
    }

    // Update Stepper Elements
    steps.forEach((stepEl, idx) => {
      if (!stepEl) return;
      stepEl.classList.remove('completed', 'active');
      if (activeIndex === -1) {
        stepEl.style.opacity = '0.35';
      } else {
        stepEl.style.opacity = '1';
        if (idx < activeIndex) {
          stepEl.classList.add('completed');
        } else if (idx === activeIndex) {
          stepEl.classList.add('active');
        }
      }
    });
  }

  // --------------------------------------------------------------------------
  // 60-SECOND GRACE CANCELLATION TIMER
  // --------------------------------------------------------------------------
  function startGraceWindowTimer(order) {
    if (graceTimerInterval) clearInterval(graceTimerInterval);
    if (!trackCancelBox || !trackKitchenLocked) return;

    const st = (order.status || '').toLowerCase().trim();
    if (st !== 'placed' && st !== 'pending') {
      trackCancelBox.style.display = 'none';
      if (st === 'confirmed' || st === 'cooking' || st === 'preparing' || st === 'food_ready' || st === 'out_for_delivery') {
        trackKitchenLocked.style.display = 'flex';
      } else {
        trackKitchenLocked.style.display = 'none';
      }
      return;
    }

    const createdAt = new Date(order.created_at).getTime();
    const graceWindowMs = 60 * 1000;
    const expiresAt = createdAt + graceWindowMs;

    function tick() {
      const remainingMs = expiresAt - Date.now();
      const remainingSecs = Math.max(0, Math.ceil(remainingMs / 1000));

      if (remainingSecs > 0) {
        trackCancelBox.style.display = 'flex';
        trackKitchenLocked.style.display = 'none';
        if (cancelTimerCountdown) cancelTimerCountdown.textContent = remainingSecs + 's';
      } else {
        clearInterval(graceTimerInterval);
        trackCancelBox.style.display = 'none';
        trackKitchenLocked.style.display = 'flex';
      }
    }

    tick();
    graceTimerInterval = setInterval(tick, 1000);
  }

  // --------------------------------------------------------------------------
  // CANCEL ORDER HANDLER
  // --------------------------------------------------------------------------
  async function handleCustomerCancellation() {
    if (!currentActiveOrder) return;
    const confirmed = window.confirm('Are you sure you want to cancel Order #' + currentActiveOrder.id + '? This cannot be undone.');
    if (!confirmed) return;

    if (btnCancelOrder) {
      btnCancelOrder.disabled = true;
      btnCancelOrder.textContent = 'Cancelling...';
    }

    try {
      const client = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null;
      if (client) {
        await client.from('orders').update({
          status: 'cancelled',
          cancelled_by: 'customer',
          cancellation_reason: 'Cancelled by customer within 60s grace window'
        }).eq('id', currentActiveOrder.id);
      }

      currentActiveOrder.status = 'cancelled';
      currentActiveOrder.cancelled_by = 'customer';
      currentActiveOrder.cancellation_reason = 'Cancelled by customer within 60s grace window';
      renderOrderTracking(currentActiveOrder, false);
      if (window.showToast) window.showToast('Order #' + currentActiveOrder.id + ' has been cancelled.');
      playCustomerNotificationChime('declined');
    } catch (e) {
      console.error('Cancellation error:', e);
      if (window.showToast) window.showToast('Could not cancel order. Please call cafe desk directly.');
    } finally {
      if (btnCancelOrder) {
        btnCancelOrder.disabled = false;
        btnCancelOrder.textContent = 'Cancel Order';
      }
    }
  }

  // --------------------------------------------------------------------------
  // REALTIME SUBSCRIPTION ENGINE (Safeguarded against re-entrancy)
  // --------------------------------------------------------------------------
  function subscribeToOrderRealtime(orderId) {
    if (!orderId) return;
    if (activeRealtimeOrderId === orderId && activeRealtimeChannel) {
      return; // Already subscribed to this order
    }

    const client = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null;
    if (!client) return;

    if (activeRealtimeChannel) {
      try { activeRealtimeChannel.unsubscribe(); } catch (e) {}
      activeRealtimeChannel = null;
    }

    activeRealtimeOrderId = orderId;

    try {
      activeRealtimeChannel = client.channel('track-page-' + orderId)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`
        }, (payload) => {
          if (payload && payload.new) {
            const updated = normalizeOrderRecord(payload.new);
            const prevSt = (currentActiveOrder && currentActiveOrder.status) ? String(currentActiveOrder.status).toLowerCase().trim() : '';
            const newSt = (updated.status || '').toLowerCase().trim();

            if (newSt && newSt !== prevSt && newSt !== lastNotifiedStatus) {
              lastNotifiedStatus = newSt;
              if (newSt === 'cancelled' || newSt === 'rejected') {
                playCustomerNotificationChime('declined');
              } else {
                playCustomerNotificationChime('info');
              }

              if (window.showToast) {
                if (newSt === 'confirmed' || newSt === 'accepted') {
                  window.showToast('👨‍🍳 Order confirmed by kitchen!');
                } else if (newSt === 'cooking' || newSt === 'preparing') {
                  window.showToast('🍳 Chef is preparing your dishes.');
                } else if (newSt === 'food_ready') {
                  window.showToast('🍱 Food is packed and ready!');
                } else if (newSt === 'out_for_delivery') {
                  window.showToast('🛵 Order is out for delivery with your partner!');
                } else if (newSt === 'delivered' || newSt === 'completed') {
                  window.showToast('🎉 Your food has been delivered! Enjoy your meal.');
                }
              }
            }

            // Re-render UI WITHOUT re-subscribing (flag false prevents recursion)
            renderOrderTracking(updated, false);
          }
        })
        .subscribe();
    } catch (err) {
      console.warn('Realtime subscription error:', err);
    }
  }

  // --------------------------------------------------------------------------
  // MULTI-ORDER CHIPS & PAST ORDERS RENDERING
  // --------------------------------------------------------------------------
  function renderActiveOrdersChips(activeOrders, selectedOrderId) {
    if (!trackActiveChipsBar || !trackActiveChipsList) return;

    if (!Array.isArray(activeOrders) || activeOrders.length <= 1) {
      trackActiveChipsBar.style.display = 'none';
      return;
    }

    if (trackActiveCount) trackActiveCount.textContent = activeOrders.length;
    trackActiveChipsBar.style.display = 'block';

    let html = '';
    activeOrders.forEach(ord => {
      const isSelected = ord.id === selectedOrderId;
      const idParts = String(ord.id).split('-');
      const token = idParts.length >= 3 ? idParts[idParts.length - 1] : ord.id.slice(-4);
      const st = (ord.status || '').toLowerCase().trim();

      let statusLabel = 'Placed';
      let icon = 'fa-clock';
      if (st === 'confirmed' || st === 'accepted') { statusLabel = 'Confirmed'; icon = 'fa-check-double'; }
      else if (st === 'cooking' || st === 'preparing') { statusLabel = 'Cooking'; icon = 'fa-utensils'; }
      else if (st === 'food_ready') { statusLabel = 'Packed'; icon = 'fa-box-open'; }
      else if (st === 'out_for_delivery' || st === 'dispatched') { statusLabel = 'On Way'; icon = 'fa-motorcycle'; }

      html += `
        <button type="button" class="track-active-chip ${isSelected ? 'active' : ''}" data-order-id="${escapeHtml(ord.id)}">
          <i class="fas ${icon}"></i>
          <span>#${escapeHtml(ord.id)}</span>
          <span class="chip-badge">${statusLabel}</span>
        </button>
      `;
    });

    trackActiveChipsList.innerHTML = html;

    // Attach click listeners to chips
    trackActiveChipsList.querySelectorAll('.track-active-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const oId = btn.dataset.orderId;
        const target = activeOrders.find(o => o.id === oId);
        if (target) {
          renderOrderTracking(target, true);
          renderActiveOrdersChips(activeOrders, target.id);
          try {
            const url = new URL(window.location.href);
            url.searchParams.set('id', target.id);
            window.history.replaceState({ orderId: target.id }, document.title, url.toString());
          } catch (e) {}
        }
      });
    });
  }

  function renderPastOrdersList(pastOrders) {
    if (!trackPastOrdersSection || !trackPastOrdersList) return;

    if (!Array.isArray(pastOrders) || pastOrders.length === 0) {
      trackPastOrdersSection.style.display = 'none';
      return;
    }

    if (trackPastCount) trackPastCount.textContent = pastOrders.length;
    trackPastOrdersSection.style.display = 'block';

    let html = '';
    pastOrders.forEach(ord => {
      const idParts = String(ord.id).split('-');
      const token = idParts.length >= 3 ? idParts[idParts.length - 1] : ord.id.slice(-4);
      const isCancelled = ord.status === 'cancelled' || ord.status === 'rejected';
      const isDelivered = ord.status === 'delivered' || ord.status === 'completed';
      const statusText = isCancelled ? 'Cancelled' : (isDelivered ? 'Delivered' : 'Settled');
      const badgeStyle = isCancelled
        ? 'background:#fee2e2; color:#991b1b; border:1px solid #fca5a5;'
        : 'background:#dcfce7; color:#166534; border:1px solid #86efac;';

      const itemsSummary = (ord.items || []).map(i => `${i.qty || 1}x ${escapeHtml(i.name)}`).join(', ') || 'Breeze Dishes';

      let dateStr = 'Recent';
      try {
        const d = new Date(ord.created_at);
        dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      } catch (e) {}

      html += `
        <div class="track-past-card">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <strong style="color:#1c1917; font-size:0.95rem;">Order #${escapeHtml(ord.id)}</strong>
              <span style="font-size:0.78rem; color:#78716c;">• ${escapeHtml(dateStr)}</span>
            </div>
            <span style="font-size:0.75rem; font-weight:800; padding:3px 10px; border-radius:999px; ${badgeStyle}">
              ${statusText}
            </span>
          </div>

          <p style="font-size:0.86rem; color:#44403c; margin:6px 0 12px; line-height:1.4;">
            ${itemsSummary}
          </p>

          <div style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px solid #f2ece1; flex-wrap:wrap; gap:8px;">
            <div style="font-size:1.15rem; font-weight:800; color:#1c1917;">
              ₹${ord.total}
            </div>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn btn-outline-gold btn-sm btn-view-past-receipt" data-order-id="${escapeHtml(ord.id)}" style="padding:6px 14px; font-size:0.82rem; border-radius:8px;">
                <i class="fas fa-receipt"></i> <span>View Receipt</span>
              </button>
              <button type="button" class="btn btn-primary btn-sm btn-past-reorder" data-order-id="${escapeHtml(ord.id)}" style="padding:6px 14px; font-size:0.82rem; border-radius:8px;">
                <i class="fas fa-redo"></i> <span>Reorder</span>
              </button>
            </div>
          </div>
        </div>
      `;
    });

    trackPastOrdersList.innerHTML = html;

    // View Receipt handlers
    trackPastOrdersList.querySelectorAll('.btn-view-past-receipt').forEach(btn => {
      btn.addEventListener('click', () => {
        const oId = btn.dataset.orderId;
        const target = pastOrders.find(o => o.id === oId);
        if (target) {
          renderOrderTracking(target, false);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });

    // Reorder handlers
    trackPastOrdersList.querySelectorAll('.btn-past-reorder').forEach(btn => {
      btn.addEventListener('click', () => {
        const oId = btn.dataset.orderId;
        const target = pastOrders.find(o => o.id === oId);
        if (target && Array.isArray(target.items) && target.items.length > 0) {
          try {
            const CART_KEY = 'breeze_rooftop_cart';
            let cart = [];
            try {
              const saved = localStorage.getItem(CART_KEY);
              if (saved) cart = JSON.parse(saved);
              if (!Array.isArray(cart)) cart = [];
            } catch (e) { cart = []; }

            target.items.forEach(it => {
              const existing = cart.find(c => c.name.toLowerCase() === it.name.toLowerCase());
              if (existing) {
                existing.qty = (existing.qty || 1) + (it.qty || 1);
              } else {
                cart.push({
                  name: it.name,
                  price: Number(it.price || 0),
                  qty: Number(it.qty || 1)
                });
              }
            });

            localStorage.setItem(CART_KEY, JSON.stringify(cart));
            sessionStorage.setItem('breeze_auto_open_cart', 'true');
          } catch (e) {}
          window.location.href = '/menu?openCart=1';
        }
      });
    });
  }

  // --------------------------------------------------------------------------
  // ORDER LOOKUP DISPATCHER (By ID or 10-Digit Mobile Number)
  // --------------------------------------------------------------------------
  async function lookupOrder(query) {
    if (!query) return;
    const raw = String(query).trim();
    if (!raw) return;

    if (trackLoadingState) trackLoadingState.style.display = 'block';
    if (trackEmptyState) trackEmptyState.style.display = 'none';
    if (trackResultsContainer) trackResultsContainer.style.display = 'none';
    if (trackActiveChipsBar) trackActiveChipsBar.style.display = 'none';
    if (trackNoActiveOrdersBanner) trackNoActiveOrdersBanner.style.display = 'none';
    if (trackPastOrdersSection) trackPastOrdersSection.style.display = 'none';

    try {
      const client = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null;
      if (!client) {
        throw new Error('Database client offline');
      }

      const digits = raw.replace(/[^0-9]/g, '');

      // ======================================================================
      // CASE 1: 10-Digit Indian Mobile Number
      // ======================================================================
      if (digits.length === 10) {
        const { data, error } = await client.from('orders')
          .select('*')
          .or(`customer_phone.eq.${digits},customer_phone.eq.+91${digits}`)
          .order('created_at', { ascending: false })
          .limit(25);

        if (trackLoadingState) trackLoadingState.style.display = 'none';

        if (error || !Array.isArray(data) || data.length === 0) {
          if (trackEmptyState) {
            trackEmptyState.style.display = 'block';
            const notFoundText = trackEmptyState.querySelector('p');
            if (notFoundText) {
              notFoundText.textContent = `No orders found for mobile number ${digits}. Please verify your 10-digit number.`;
            }
          }
          return;
        }

        const normalizedList = data.map(normalizeOrderRecord).filter(Boolean);
        cachedOrdersForPhone = normalizedList;

        const activeOrders = normalizedList.filter(o => isActiveStatus(o.status));
        const pastOrders = normalizedList.filter(o => !isActiveStatus(o.status));

        // Subcase 1A: Has Active Orders on the Go
        if (activeOrders.length > 0) {
          const selectedOrder = activeOrders[0];
          renderOrderTracking(selectedOrder, true);
          renderActiveOrdersChips(activeOrders, selectedOrder.id);
          renderPastOrdersList(pastOrders);

          // Update URL cleanly
          try {
            const url = new URL(window.location.href);
            url.searchParams.set('phone', digits);
            url.searchParams.set('id', selectedOrder.id);
            window.history.replaceState({ orderId: selectedOrder.id, phone: digits }, document.title, url.toString());
          } catch (e) {}
          return;
        }

        // Subcase 1B: No Active Orders, but has Past Completed Orders
        if (pastOrders.length > 0) {
          if (trackNoActiveOrdersBanner) trackNoActiveOrdersBanner.style.display = 'block';
          // Render the latest delivered order in tracker as receipt
          renderOrderTracking(pastOrders[0], false);
          renderPastOrdersList(pastOrders);

          try {
            const url = new URL(window.location.href);
            url.searchParams.set('phone', digits);
            url.searchParams.delete('id');
            window.history.replaceState({ phone: digits }, document.title, url.toString());
          } catch (e) {}
          return;
        }
      }

      // ======================================================================
      // CASE 2: Order ID (Exact, Uppercase, or Suffix Token)
      // ======================================================================
      let row = null;

      // 2A: Exact match
      const { data: d1, error: e1 } = await client.from('orders')
        .select('*')
        .eq('id', raw)
        .maybeSingle();

      if (!e1 && d1) row = d1;

      // 2B: Uppercase match
      if (!row) {
        const { data: d2, error: e2 } = await client.from('orders')
          .select('*')
          .eq('id', raw.toUpperCase())
          .maybeSingle();

        if (!e2 && d2) row = d2;
      }

      // 2C: Token Suffix lookup (e.g. "4321" or "#4321")
      if (!row && digits.length >= 3 && digits.length <= 6) {
        const { data: d3 } = await client.from('orders')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (Array.isArray(d3)) {
          row = d3.find(r => r.id && String(r.id).endsWith('-' + digits)) || null;
        }
      }

      if (trackLoadingState) trackLoadingState.style.display = 'none';

      if (row) {
        const normalized = normalizeOrderRecord(row);
        renderOrderTracking(normalized, true);

        // Update URL cleanly
        try {
          const url = new URL(window.location.href);
          url.searchParams.set('id', normalized.id);
          window.history.replaceState({ orderId: normalized.id }, document.title, url.toString());
        } catch (e) {}

        // In background: if this order has a phone number, fetch other orders to populate chips / past orders
        const cPhone = normalized.customer_phone ? String(normalized.customer_phone).replace(/[^0-9]/g, '').slice(-10) : '';
        if (cPhone && cPhone.length === 10) {
          client.from('orders')
            .select('*')
            .or(`customer_phone.eq.${cPhone},customer_phone.eq.+91${cPhone}`)
            .order('created_at', { ascending: false })
            .limit(20)
            .then(({ data: phoneRows }) => {
              if (Array.isArray(phoneRows) && phoneRows.length > 1) {
                const phoneList = phoneRows.map(normalizeOrderRecord).filter(Boolean);
                const activeList = phoneList.filter(o => isActiveStatus(o.status));
                const pastList = phoneList.filter(o => !isActiveStatus(o.status) && o.id !== normalized.id);

                if (activeList.length > 1) {
                  renderActiveOrdersChips(activeList, normalized.id);
                }
                if (pastList.length > 0) {
                  renderPastOrdersList(pastList);
                }
              }
            })
            .catch(() => {});
        }
      } else {
        if (trackEmptyState) {
          trackEmptyState.style.display = 'block';
          const notFoundText = trackEmptyState.querySelector('p');
          if (notFoundText) {
            notFoundText.textContent = `No order found matching "${escapeHtml(raw)}". Please check your Order ID or mobile number.`;
          }
        }
      }
    } catch (err) {
      console.error('Order lookup error:', err);
      if (trackLoadingState) trackLoadingState.style.display = 'none';
      if (trackEmptyState) trackEmptyState.style.display = 'block';
      if (window.showToast) window.showToast('Network error while looking up order. Please retry.');
    }
  }

  // --------------------------------------------------------------------------
  // EVENT LISTENERS & INITIALIZATION
  // --------------------------------------------------------------------------
  if (trackSearchForm) {
    trackSearchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (trackInputLookup) lookupOrder(trackInputLookup.value);
    });
  }

  if (btnCancelOrder) {
    btnCancelOrder.addEventListener('click', handleCustomerCancellation);
  }

  // Rating Stars
  if (trackRatingStars) {
    trackRatingStars.querySelectorAll('.rating-star').forEach(star => {
      star.addEventListener('click', (e) => {
        const val = Number(e.currentTarget.dataset.star) || 5;
        trackRatingStars.querySelectorAll('.rating-star').forEach((s, idx) => {
          if (idx < val) {
            s.classList.remove('far');
            s.classList.add('fas');
            s.style.color = '#eab308';
          } else {
            s.classList.remove('fas');
            s.classList.add('far');
            s.style.color = '#d1d5db';
          }
        });
        if (ratingFeedbackMsg) {
          ratingFeedbackMsg.style.display = 'block';
          ratingFeedbackMsg.textContent = `⭐ Thank you for your ${val}-star rating!`;
        }
        if (window.showToast) window.showToast(`Thank you for rating us ${val} stars!`);
      });
    });
  }

  // Reorder button redirects to menu with items
  if (btnReorderFromTracking) {
    btnReorderFromTracking.addEventListener('click', () => {
      if (currentActiveOrder && Array.isArray(currentActiveOrder.items) && currentActiveOrder.items.length > 0) {
        try {
          const CART_KEY = 'breeze_rooftop_cart';
          let cart = [];
          try {
            const saved = localStorage.getItem(CART_KEY);
            if (saved) cart = JSON.parse(saved);
            if (!Array.isArray(cart)) cart = [];
          } catch (e) { cart = []; }

          currentActiveOrder.items.forEach(it => {
            const existing = cart.find(c => c.name.toLowerCase() === it.name.toLowerCase());
            if (existing) {
              existing.qty = (existing.qty || 1) + (it.qty || 1);
            } else {
              cart.push({
                name: it.name,
                price: Number(it.price || 0),
                qty: Number(it.qty || 1)
              });
            }
          });

          localStorage.setItem(CART_KEY, JSON.stringify(cart));
          sessionStorage.setItem('breeze_auto_open_cart', 'true');
        } catch (e) {}
      }
      window.location.href = '/menu?openCart=1';
    });
  }

  // Auto-init on page load from URL parameters or Active Order
  window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const targetId = params.get('id') || params.get('track') || params.get('orderId');
    const targetPhone = params.get('phone');

    if (targetId) {
      if (trackInputLookup) trackInputLookup.value = targetId;
      lookupOrder(targetId);
      return;
    }

    if (targetPhone) {
      if (trackInputLookup) trackInputLookup.value = targetPhone;
      lookupOrder(targetPhone);
      return;
    }

    // Fallback: Check localStorage active order
    try {
      const activeRaw = localStorage.getItem('breeze_active_order');
      if (activeRaw) {
        const parsed = JSON.parse(activeRaw);
        if (parsed && parsed.id) {
          if (trackRecentBtn) {
            trackRecentBtn.style.display = 'inline-flex';
            trackRecentBtn.addEventListener('click', () => {
              if (trackInputLookup) trackInputLookup.value = parsed.id;
              lookupOrder(parsed.id);
            });
          }
          if (trackInputLookup) trackInputLookup.value = parsed.id;
          lookupOrder(parsed.id);
          return;
        }
      }
    } catch (e) {}

    // Check user profile for last order phone
    try {
      const profRaw = localStorage.getItem('breeze_customer_profile');
      if (profRaw) {
        const prof = JSON.parse(profRaw);
        if (prof && prof.phone) {
          if (trackInputLookup) trackInputLookup.value = prof.phone;
          lookupOrder(prof.phone);
        }
      }
    } catch (e) {}
  });

  // Export functions to window for interoperability
  window.lookupCustomerOrder = lookupOrder;
  window.renderOrderTracking = renderOrderTracking;
  window.playCustomerNotificationChime = playCustomerNotificationChime;

})();
