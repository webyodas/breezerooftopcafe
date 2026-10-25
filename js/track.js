/**
 * ============================================================================
 * BREEZE ROOFTOP CAFE - LIVE ORDER TRACKING CONTROLLER
 * ============================================================================
 * Provides standalone live order tracking, status radar, rider partner cards,
 * 60s grace cancellation window, and gentle one-shot notification bell chime.
 */

(function () {
  'use strict';

  // DOM Elements
  const trackSearchForm = document.getElementById('trackSearchForm');
  const trackInputLookup = document.getElementById('trackInputLookup');
  const btnTrackLookup = document.getElementById('btnTrackLookup');
  const trackRecentBtn = document.getElementById('trackRecentBtn');
  const trackResultsContainer = document.getElementById('trackResultsContainer');
  const trackEmptyState = document.getElementById('trackEmptyState');
  const trackLoadingState = document.getElementById('trackLoadingState');

  // Order Details Elements
  const trackDisplayOrderId = document.getElementById('trackDisplayOrderId');
  const trackStatusBadge = document.getElementById('trackStatusBadge');
  const trackStatusBadgeText = document.getElementById('trackStatusBadgeText');
  const trackOrderDate = document.getElementById('trackOrderDate');
  const trackHeroIcon = document.getElementById('trackingHeroIcon');
  const trackHeroHeading = document.getElementById('trackingHeroHeading');
  const trackHeroSubtext = document.getElementById('trackingHeroSubtext');
  const trackPrepTimeText = document.getElementById('trackingPrepTimeText');

  // Cancel & Lock Elements
  const trackCancelBox = document.getElementById('trackingCancelBox');
  const cancelTimerCountdown = document.getElementById('cancelTimerCountdown');
  const btnCancelOrder = document.getElementById('btnCancelOrder');
  const trackKitchenLocked = document.getElementById('trackingKitchenLocked');

  // Stepper Elements
  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  const step3 = document.getElementById('step3');
  const step4 = document.getElementById('step4');
  const step5 = document.getElementById('step5');

  // Rider Card Elements
  const trackRiderCard = document.getElementById('trackingRiderCard');
  const trackRiderName = document.getElementById('trackingRiderName');
  const trackRiderPhoneBtn = document.getElementById('trackingRiderPhoneBtn');
  const trackRiderVehicle = document.getElementById('trackingRiderVehicle');

  // Items & Bill Elements
  const trackItemsList = document.getElementById('trackingItemsList');
  const trackSubtotalAmount = document.getElementById('trackSubtotalAmount');
  const trackTotalAmount = document.getElementById('trackingTotalAmount');
  const trackPaymentPill = document.getElementById('trackingPaymentPill');
  const trackDestinationInfo = document.getElementById('trackingDestinationInfo');

  // Delivered & Rating Elements
  const trackDeliveredCard = document.getElementById('trackingDeliveredCard');
  const trackRatingStars = document.getElementById('trackingRatingStars');
  const ratingFeedbackMsg = document.getElementById('ratingFeedbackMsg');
  const btnReorderFromTracking = document.getElementById('btnReorderFromTracking');

  let currentActiveOrder = null;
  let activeRealtimeChannel = null;
  let graceTimerInterval = null;
  let lastNotifiedStatus = null;
  let lastChimeTimestamp = 0;

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

    return {
      id: row.id,
      created_at: row.created_at || new Date().toISOString(),
      status: row.status || 'placed',
      items: items,
      total: Number(row.total || 0),
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
  // RENDER ORDER TRACKING UI
  // --------------------------------------------------------------------------
  function renderOrderTracking(order) {
    if (!order) return;
    currentActiveOrder = order;

    if (trackEmptyState) trackEmptyState.style.display = 'none';
    if (trackLoadingState) trackLoadingState.style.display = 'none';
    if (trackResultsContainer) trackResultsContainer.style.display = 'block';

    // Order Header
    const idParts = String(order.id).split('-');
    const token = idParts.length >= 3 ? idParts[idParts.length - 1] : order.id.slice(-4);
    if (trackDisplayOrderId) {
      trackDisplayOrderId.innerHTML = `Order #${order.id} <span class="tracking-token-pill">Token #${token}</span>`;
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
        trackOrderDate.textContent = 'Just now';
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
            trackRiderPhoneBtn.href = 'tel:' + order.rider_phone;
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
              <span style="font-weight:600; color:var(--text-dark); font-size:0.92rem;">${window.escapeHtml ? window.escapeHtml(it.name) : it.name}</span>
            </div>
            <span style="font-weight:700; color:var(--text-dark); font-size:0.92rem;">₹${price * qty}</span>
          </div>
        `;
      });
      trackItemsList.innerHTML = itemsHtml || '<div style="color:#78716c; font-size:0.85rem; padding:12px 0;">Items details unavailable</div>';
    }

    if (trackSubtotalAmount) trackSubtotalAmount.textContent = '₹' + order.total;
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
        trackDestinationInfo.innerHTML = `<i class="fas fa-motorcycle" style="color:var(--primary-gold);"></i> Delivering to <strong>${window.escapeHtml ? window.escapeHtml(cName) : cName}</strong>${cPhone ? ' (' + cPhone + ')' : ''}${cAddr ? '<br><span style="color:#78716c; font-size:0.85rem;">' + (window.escapeHtml ? window.escapeHtml(cAddr) : cAddr) + '</span>' : ''}`;
      } else if (cType.includes('Dine-In')) {
        trackDestinationInfo.innerHTML = `<i class="fas fa-utensils" style="color:var(--primary-gold);"></i> Rooftop Dine-In for <strong>${window.escapeHtml ? window.escapeHtml(cName) : cName}</strong> (${cTable})`;
      } else {
        trackDestinationInfo.innerHTML = `<i class="fas fa-shopping-bag" style="color:var(--primary-gold);"></i> Takeaway / Pick-Up for <strong>${window.escapeHtml ? window.escapeHtml(cName) : cName}</strong>`;
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

    // Subscribe to live updates
    subscribeToOrderRealtime(order.id);
  }

  // --------------------------------------------------------------------------
  // STEPPER & HERO STATUS SYNCHRONIZATION
  // --------------------------------------------------------------------------
  function updateStepperAndHero(order) {
    const st = (order.status || '').toLowerCase().trim();
    const steps = [step1, step2, step3, step4, step5];

    let activeIndex = 0;
    let badgeText = 'Order Placed';
    let badgeClass = 'status-placed';
    let heroIcon = 'fa-receipt';
    let heroHeading = 'Order Placed Successfully!';
    let heroSub = 'We have received your order and sent it directly to the kitchen.';

    if (st === 'placed' || st === 'pending') {
      activeIndex = 0;
      badgeText = 'Order Placed';
      badgeClass = 'status-placed';
      heroIcon = 'fa-receipt';
      heroHeading = 'Order Placed Successfully!';
      heroSub = 'We have received your order and sent it directly to the kitchen.';
    } else if (st === 'confirmed' || st === 'accepted') {
      activeIndex = 1;
      badgeText = 'Kitchen Confirmed';
      badgeClass = 'status-confirmed';
      heroIcon = 'fa-check-double';
      heroHeading = 'Order Accepted by Kitchen!';
      heroSub = 'Restaurant has reviewed and scheduled your dishes for immediate cooking.';
    } else if (st === 'cooking' || st === 'preparing') {
      activeIndex = 2;
      badgeText = 'Food Being Prepared';
      badgeClass = 'status-cooking';
      heroIcon = 'fa-utensils';
      heroHeading = 'Chef is Cooking Your Meal';
      heroSub = 'Fresh artisanal ingredients are being prepared on our rooftop kitchen.';
    } else if (st === 'food_ready') {
      activeIndex = 3;
      badgeText = 'Packed & Ready';
      badgeClass = 'status-ready';
      heroIcon = 'fa-box-open';
      heroHeading = 'Food is Freshly Packed!';
      heroSub = order.rider_name ? `Assigned to delivery partner ${order.rider_name}. Dispatching momentarily.` : 'Awaiting delivery partner dispatch.';
    } else if (st === 'out_for_delivery' || st === 'dispatched') {
      activeIndex = 3;
      badgeText = 'Out for Delivery';
      badgeClass = 'status-delivery';
      heroIcon = 'fa-motorcycle';
      heroHeading = 'Out for Delivery!';
      heroSub = order.rider_name ? `Your rider ${order.rider_name} is on the way with your hot meal.` : 'Your delivery partner is en route to your address.';
    } else if (st === 'delivered' || st === 'completed') {
      activeIndex = 4;
      badgeText = 'Delivered & Settled';
      badgeClass = 'status-delivered';
      heroIcon = 'fa-smile-beam';
      heroHeading = 'Enjoy Your Meal!';
      heroSub = 'Your order has been delivered successfully. Thank you for dining with Breeze Rooftop Cafe!';
    } else if (st === 'cancelled' || st === 'rejected') {
      activeIndex = -1;
      badgeText = 'Order Cancelled';
      badgeClass = 'status-cancelled';
      heroIcon = 'fa-times-circle';
      heroHeading = 'Order Cancelled';
      heroSub = order.cancellation_reason || 'This order was cancelled.';
    }

    // Update Status Badge
    if (trackStatusBadgeText) trackStatusBadgeText.textContent = badgeText;
    if (trackStatusBadge) {
      trackStatusBadge.className = 'tracking-header-badge ' + badgeClass;
    }

    // Update Hero Card
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
        // Cancelled
        stepEl.style.opacity = '0.4';
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
      currentActiveOrder.cancellation_reason = 'Cancelled by customer';
      renderOrderTracking(currentActiveOrder);
      if (window.showToast) window.showToast('Order #' + currentActiveOrder.id + ' has been cancelled.');
      playCustomerNotificationChime('info');
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
  // SUPABASE REALTIME SUBSCRIPTION FOR INSTANT STATUS CHANGES
  // --------------------------------------------------------------------------
  function subscribeToOrderRealtime(orderId) {
    if (!orderId) return;
    const client = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null;
    if (!client) return;

    if (activeRealtimeChannel) {
      try { activeRealtimeChannel.unsubscribe(); } catch (e) {}
    }

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
                } else if (newSt === 'out_for_delivery') {
                  window.showToast('🛵 Order is out for delivery!');
                } else if (newSt === 'delivered' || newSt === 'completed') {
                  window.showToast('🎉 Your food has been delivered! Enjoy your meal.');
                }
              }
            }
            renderOrderTracking(updated);
          }
        })
        .subscribe();
    } catch (err) {
      console.warn('Realtime subscription error:', err);
    }
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

    try {
      const client = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null;
      if (!client) {
        throw new Error('Database client offline');
      }

      let row = null;
      const digits = raw.replace(/[^0-9]/g, '');

      // Case 1: 10-Digit Indian Mobile Number
      if (digits.length === 10) {
        const { data, error } = await client.from('orders')
          .select('*')
          .or(`customer_phone.eq.${digits},customer_phone.eq.+91${digits}`)
          .order('created_at', { ascending: false })
          .limit(1);

        if (!error && Array.isArray(data) && data.length > 0) {
          row = data[0];
        }
      }

      // Case 2: Exact Order ID (e.g. BRZ-1729864200000-4321)
      if (!row) {
        const { data, error } = await client.from('orders')
          .select('*')
          .eq('id', raw)
          .maybeSingle();

        if (!error && data) {
          row = data;
        }
      }

      // Case 3: Case-insensitive / Uppercase Order ID
      if (!row) {
        const { data, error } = await client.from('orders')
          .select('*')
          .eq('id', raw.toUpperCase())
          .maybeSingle();

        if (!error && data) {
          row = data;
        }
      }

      // Case 4: Token Suffix lookup (e.g. "4321" or "#4321")
      if (!row && digits.length >= 3 && digits.length <= 6) {
        const { data } = await client.from('orders')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (Array.isArray(data)) {
          row = data.find(r => r.id && String(r.id).endsWith('-' + digits)) || null;
        }
      }

      if (row) {
        const normalized = normalizeOrderRecord(row);
        renderOrderTracking(normalized);

        // Update URL query parameter cleanly without reloading page
        try {
          const newUrl = window.location.pathname + '?id=' + encodeURIComponent(normalized.id);
          window.history.replaceState({ orderId: normalized.id }, document.title, newUrl);
        } catch (e) {}
      } else {
        if (trackLoadingState) trackLoadingState.style.display = 'none';
        if (trackEmptyState) {
          trackEmptyState.style.display = 'block';
          const notFoundText = trackEmptyState.querySelector('p');
          if (notFoundText) {
            notFoundText.textContent = `No order found matching "${window.escapeHtml ? window.escapeHtml(raw) : raw}". Please verify your order ID or mobile number.`;
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

  if (btnTrackLookup) {
    btnTrackLookup.addEventListener('click', () => {
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
          localStorage.setItem('breeze_cart', JSON.stringify(currentActiveOrder.items));
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

    // Check user profile for last order
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
