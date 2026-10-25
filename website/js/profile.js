/**
 * ============================================================================
 * BREEZE THE ROOFTOP CAFE — DEDICATED CUSTOMER PROFILE ENGINE (/profile)
 * ============================================================================
 * Full-page account dashboard: Saved delivery addresses (CRUD), past orders & receipts,
 * personal contact details, and instant bidirectional auth synchronization.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Guard: Only execute if on the profile page
  const profileDashboardView = document.getElementById('profileDashboardView');
  const profileGuestGateway = document.getElementById('profileGuestGateway');
  if (!profileDashboardView && !profileGuestGateway) return;

  const CUSTOMER_PROFILE_KEY = 'breeze_customer_profile';

  // Helper: Retrieve the latest, authoritative profile from main.js or localStorage
  function getLatestProfile() {
    let p = {
      name: '',
      email: '',
      avatar: '',
      phone: '',
      address: '',
      saved_addresses: [],
      isLoggedIn: false
    };

    // 1. Try window.getCustomerProfile() from main.js
    if (typeof window.getCustomerProfile === 'function') {
      try {
        const cp = window.getCustomerProfile();
        if (cp && (cp.email || cp.phone || cp.name)) {
          p = Object.assign(p, cp);
        }
      } catch (e) {}
    }

    // 2. Read directly from localStorage
    try {
      const raw = localStorage.getItem(CUSTOMER_PROFILE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        p = Object.assign(p, parsed);
      }
    } catch (e) {}

    if (!Array.isArray(p.saved_addresses)) {
      p.saved_addresses = [];
    }

    return p;
  }

  let profile = getLatestProfile();

  // Header Nav Elements
  const navUserArea = document.getElementById('navUserArea');
  const navAuthBtn = document.getElementById('navAuthBtn');
  const navUserDropdown = document.getElementById('navUserDropdown');
  const navUserProfileToggle = document.getElementById('navUserProfileToggle');
  const navUserAvatar = document.getElementById('navUserAvatar');
  const navUserName = document.getElementById('navUserName');
  const navUserMenu = document.getElementById('navUserMenu');
  const dropdownAvatar = document.getElementById('dropdownAvatar');
  const dropdownUserName = document.getElementById('dropdownUserName');
  const dropdownUserPhone = document.getElementById('dropdownUserPhone');
  const menuSignOutBtn = document.getElementById('menuSignOutBtn');

  // Page Hero Elements
  const pageHeroAvatar = document.getElementById('pageHeroAvatar');
  const pageHeroName = document.getElementById('pageHeroName');
  const pageHeroEmail = document.getElementById('pageHeroEmail');
  const pageHeroPhone = document.getElementById('pageHeroPhone');
  const pageStatOrdersCount = document.getElementById('pageStatOrdersCount');
  const pageStatTotalSpent = document.getElementById('pageStatTotalSpent');
  const pageStatSavedAddrCount = document.getElementById('pageStatSavedAddrCount');

  // Tab Navigation Elements
  const tabBtnPageAddresses = document.getElementById('tabBtnPageAddresses');
  const tabBtnPageOrders = document.getElementById('tabBtnPageOrders');
  const tabBtnPagePersonal = document.getElementById('tabBtnPagePersonal');
  const tabAddrBadge = document.getElementById('tabAddrBadge');
  const tabOrdersBadge = document.getElementById('tabOrdersBadge');
  const btnPageSignOut = document.getElementById('btnPageSignOut');

  // Panes
  const panePageAddresses = document.getElementById('panePageAddresses');
  const panePageOrders = document.getElementById('panePageOrders');
  const panePagePersonal = document.getElementById('panePagePersonal');

  // Address Editor Elements
  const btnPageAddNewAddress = document.getElementById('btnPageAddNewAddress');
  const pageAddressEditorBox = document.getElementById('pageAddressEditorBox');
  const pageAddressEditorTitle = document.getElementById('pageAddressEditorTitle');
  const btnPageCancelEditor = document.getElementById('btnPageCancelEditor');
  const btnPageDiscardEditor = document.getElementById('btnPageDiscardEditor');
  const pageEditorAddressText = document.getElementById('pageEditorAddressText');
  const pageEditorAddressLandmark = document.getElementById('pageEditorAddressLandmark');
  const pageEditorAddressIsDefault = document.getElementById('pageEditorAddressIsDefault');
  const btnPageSaveAddress = document.getElementById('btnPageSaveAddress');
  const pageSavedAddressesCardsList = document.getElementById('pageSavedAddressesCardsList');

  // Orders Elements
  const btnPageRefreshOrders = document.getElementById('btnPageRefreshOrders');
  const pageOrdersListContainer = document.getElementById('pageOrdersListContainer');

  // Personal Info Elements
  const pageInputName = document.getElementById('pageInputName');
  const pageInputPhone = document.getElementById('pageInputPhone');
  const pageDisplayEmail = document.getElementById('pageDisplayEmail');
  const pageDisplayEmailText = document.getElementById('pageDisplayEmailText');
  const btnPageSavePersonal = document.getElementById('btnPageSavePersonal');

  let currentEditingAddressId = null;
  let userOrdersHistory = [];

  // Helper: Toast notification
  function notify(msg) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg);
    } else {
      const container = document.getElementById('toastContainer');
      if (!container) return;
      const t = document.createElement('div');
      t.className = 'toast show';
      t.innerHTML = msg;
      container.appendChild(t);
      setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
      }, 3500);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // --------------------------------------------------------------------------
  // HEADER USER PROFILE TOGGLE & DROPDOWN
  // --------------------------------------------------------------------------
  if (navUserProfileToggle && navUserMenu) {
    navUserProfileToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      navUserMenu.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (navUserMenu.classList.contains('active') && !navUserMenu.contains(e.target) && !navUserProfileToggle.contains(e.target)) {
        navUserMenu.classList.remove('active');
      }
    });
  }

  if (navAuthBtn) {
    navAuthBtn.addEventListener('click', () => {
      const authModal = document.getElementById('customerAuthModal');
      if (authModal) {
        authModal.classList.add('active');
        document.body.style.overflow = 'hidden';
      } else {
        const guestGateway = document.getElementById('profileGuestGateway');
        if (guestGateway) guestGateway.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  // Header Dropdown Menu Navigation (Smooth in-page tab switches)
  const menuProfileBtn = document.getElementById('menuProfileBtn');
  const menuOrderHistoryBtn = document.getElementById('menuOrderHistoryBtn');
  if (menuProfileBtn) {
    menuProfileBtn.addEventListener('click', (e) => {
      e.preventDefault();
      switchPageTab('addresses');
      if (navUserMenu) navUserMenu.classList.remove('active');
    });
  }
  if (menuOrderHistoryBtn) {
    menuOrderHistoryBtn.addEventListener('click', (e) => {
      e.preventDefault();
      switchPageTab('orders');
      if (navUserMenu) navUserMenu.classList.remove('active');
    });
  }

  // --------------------------------------------------------------------------
  // AUTH STATE SWITCHER & HEADER SYNC
  // --------------------------------------------------------------------------
  function checkAuthState() {
    profile = getLatestProfile();

    const isLoggedIn = Boolean(
      profile.isLoggedIn ||
      (profile.name && (profile.phone || profile.email)) ||
      (profile.phone) ||
      (profile.email)
    );
    profile.isLoggedIn = isLoggedIn;

    // 1. Synchronize Header Navigation UI
    if (navAuthBtn && navUserDropdown) {
      if (isLoggedIn) {
        navAuthBtn.style.setProperty('display', 'none', 'important');
        navAuthBtn.classList.add('hidden');
        if (navUserArea) navUserArea.classList.add('logged-in');
        navUserDropdown.style.removeProperty('display');
        navUserDropdown.classList.remove('hidden');

        const displayName = profile.name || (profile.phone ? ('Customer ' + profile.phone.slice(-4)) : 'Verified Customer');
        const initial = (profile.name || 'B').trim().charAt(0).toUpperCase() || 'B';
        const firstName = profile.name ? profile.name.trim().split(' ')[0] : 'Account';

        if (navUserAvatar) {
          if (profile.avatar) {
            navUserAvatar.innerHTML = `<img src="${escapeHtml(profile.avatar)}" alt="${escapeHtml(displayName)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">`;
          } else {
            navUserAvatar.textContent = initial;
          }
        }
        if (navUserName) navUserName.textContent = firstName;

        if (dropdownAvatar) {
          if (profile.avatar) {
            dropdownAvatar.innerHTML = `<img src="${escapeHtml(profile.avatar)}" alt="${escapeHtml(displayName)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">`;
          } else {
            dropdownAvatar.textContent = initial;
          }
        }
        if (dropdownUserName) dropdownUserName.textContent = displayName;
        if (dropdownUserPhone) dropdownUserPhone.textContent = profile.phone ? ('+91 ' + profile.phone) : (profile.email || 'Verified Customer');
      } else {
        navAuthBtn.style.removeProperty('display');
        navAuthBtn.classList.remove('hidden');
        if (navUserArea) navUserArea.classList.remove('logged-in');
        navUserDropdown.style.setProperty('display', 'none', 'important');
        navUserDropdown.classList.add('hidden');
        if (navUserMenu) navUserMenu.classList.remove('active');
      }
    }

    // 2. Synchronize Main Page View
    if (isLoggedIn) {
      if (profileGuestGateway) profileGuestGateway.style.display = 'none';
      if (profileDashboardView) profileDashboardView.style.display = 'block';
      initDashboardView();
    } else {
      if (profileGuestGateway) profileGuestGateway.style.display = 'block';
      if (profileDashboardView) profileDashboardView.style.display = 'none';
      initGuestGateway();
    }
  }

  // Expose globally so main.js can immediately trigger a view flip upon login/logout
  window.checkProfileAuthState = checkAuthState;

  
  // Fast Direct Phone & Name Login for Profile
  const profileDirectAuthForm = document.getElementById('profileDirectAuthForm');
  const profileAuthPhoneInput = document.getElementById('profileAuthPhoneInput');
  const profileAuthNameInput = document.getElementById('profileAuthNameInput');

  if (profileDirectAuthForm) {
    profileDirectAuthForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const phone = profileAuthPhoneInput ? profileAuthPhoneInput.value.trim() : '';
      const name = profileAuthNameInput ? profileAuthNameInput.value.trim() : '';
      const digits = phone.replace(/[^0-9]/g, '').slice(-10);
      if (digits.length !== 10 || !/^[6-9]/.test(digits)) {
        notify('Please enter a valid 10-digit Indian mobile number');
        return;
      }
      if (!name || name.length < 2) {
        notify('Please enter your full name');
        return;
      }

      profile.name = name;
      profile.phone = digits;
      profile.isLoggedIn = true;
      localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(profile));

      if (typeof window.syncCustomerToSupabase === 'function') {
        window.syncCustomerToSupabase(profile);
      }

      try {
        window.dispatchEvent(new CustomEvent('breeze:auth_change', {
          detail: { isLoggedIn: true, profile: profile }
        }));
      } catch (err) {}

      notify('Welcome to Breeze, ' + name + '! 🎉');
      checkAuthState();
    });
  }

  function initGuestGateway() {
    const phoneInput = document.getElementById('profileAuthPhoneInput');
    if (phoneInput && document.activeElement !== phoneInput) {
      try { phoneInput.focus(); } catch(e){}
    }
  }

  // --------------------------------------------------------------------------
  // DASHBOARD INITIALIZATION
  // --------------------------------------------------------------------------
  async function initDashboardView() {
    renderHeroSummary();
    renderPersonalForm();
    renderAddressesList();

    // Check URL parameters for active tab (?tab=orders | ?tab=personal)
    const urlParams = new URLSearchParams(window.location.search);
    const targetTab = urlParams.get('tab') || 'addresses';
    switchPageTab(targetTab);

    // Fetch and hydrate cloud profile & orders from Supabase
    if (profile.email || profile.phone) {
      if (typeof window.loadCustomerFromSupabase === 'function') {
        window.loadCustomerFromSupabase(profile.email || profile.phone, (dbData) => {
          if (dbData) {
            let updated = false;
            if (Array.isArray(dbData.saved_addresses) && dbData.saved_addresses.length > 0) {
              profile.saved_addresses = dbData.saved_addresses;
              updated = true;
            } else if (dbData.default_address && profile.saved_addresses.length === 0) {
              profile.saved_addresses = [{
                id: 'addr_1',
                label: 'Home',
                address: dbData.default_address,
                landmark: '',
                is_default: true
              }];
              updated = true;
            }
            if (!profile.phone && dbData.phone) {
              profile.phone = dbData.phone;
              updated = true;
            }
            if (updated) {
              localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(profile));
              renderHeroSummary();
              renderPersonalForm();
              renderAddressesList();
            }
          }
        });
      }

      await loadOrdersFromCloud();
    }
  }

  function renderHeroSummary() {
    const displayName = profile.name || (profile.phone ? ('Customer ' + profile.phone.slice(-4)) : 'Verified Customer');
    const initial = (profile.name || 'B').trim().charAt(0).toUpperCase() || 'B';

    if (pageHeroAvatar) {
      if (profile.avatar) {
        pageHeroAvatar.innerHTML = `<img src="${escapeHtml(profile.avatar)}" alt="${escapeHtml(displayName)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;">`;
      } else {
        pageHeroAvatar.textContent = initial;
      }
    }

    if (pageHeroName) pageHeroName.textContent = displayName;
    if (pageHeroEmail) {
      if (profile.email) {
        pageHeroEmail.style.display = 'inline-flex';
        pageHeroEmail.innerHTML = `<i class="fas fa-envelope" style="color: #6366f1;"></i> ${escapeHtml(profile.email)}`;
      } else {
        pageHeroEmail.style.display = 'inline-flex';
        pageHeroEmail.innerHTML = `<i class="fas fa-shield-alt" style="color: #16a34a;"></i> Verified Customer`;
      }
    }
    if (pageHeroPhone) {
      pageHeroPhone.innerHTML = profile.phone
        ? `<i class="fas fa-phone" style="color: #16a34a;"></i> +91 ${escapeHtml(profile.phone)}`
        : `<i class="fas fa-phone" style="color: #16a34a;"></i> Verified Session`;
    }

    updateStatsBar();
  }

  function updateStatsBar() {
    const ordersCount = userOrdersHistory.length;
    const totalSpent = userOrdersHistory.reduce((acc, o) => {
      return o.status !== 'cancelled' ? acc + (Number(o.total) || 0) : acc;
    }, 0);
    const addrCount = (profile.saved_addresses || []).length;

    if (pageStatOrdersCount) pageStatOrdersCount.textContent = ordersCount;
    if (pageStatTotalSpent) pageStatTotalSpent.textContent = `₹${totalSpent.toLocaleString('en-IN')}`;
    if (pageStatSavedAddrCount) pageStatSavedAddrCount.textContent = `${addrCount}`;

    if (tabAddrBadge) tabAddrBadge.textContent = `${addrCount}`;
    if (tabOrdersBadge) tabOrdersBadge.textContent = ordersCount;
  }

  // --------------------------------------------------------------------------
  // TAB NAVIGATION
  // --------------------------------------------------------------------------
  function switchPageTab(tabName) {
    const tabs = [
      { btn: tabBtnPageAddresses, pane: panePageAddresses, name: 'addresses' },
      { btn: tabBtnPageOrders, pane: panePageOrders, name: 'orders' },
      { btn: tabBtnPagePersonal, pane: panePagePersonal, name: 'personal' }
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

    // Update browser URL query string without reloading page
    const url = new URL(window.location);
    url.searchParams.set('tab', tabName);
    window.history.replaceState({}, '', url);

    if (tabName === 'addresses') {
      renderAddressesList();
    } else if (tabName === 'orders') {
      renderOrdersList();
    }
  }

  if (tabBtnPageAddresses) tabBtnPageAddresses.addEventListener('click', () => switchPageTab('addresses'));
  if (tabBtnPageOrders) tabBtnPageOrders.addEventListener('click', () => switchPageTab('orders'));
  if (tabBtnPagePersonal) tabBtnPagePersonal.addEventListener('click', () => switchPageTab('personal'));

  // --------------------------------------------------------------------------
  // SAVED ADDRESSES ENGINE (UNLIMITED ADDRESSES)
  // --------------------------------------------------------------------------
  function renderAddressesList() {
    if (!pageSavedAddressesCardsList) return;
    const list = Array.isArray(profile.saved_addresses) ? profile.saved_addresses : [];

    updateStatsBar();

    if (btnPageAddNewAddress) {
      btnPageAddNewAddress.style.opacity = '1';
      btnPageAddNewAddress.title = 'Add a new delivery address';
    }

    if (list.length === 0) {
      pageSavedAddressesCardsList.innerHTML = `
        <div class="empty-state-v2" style="grid-column: 1 / -1;">
          <div class="empty-state-icon-circle">
            <i class="fas fa-map-marker-alt"></i>
          </div>
          <h5 class="empty-state-title">No Delivery Addresses Saved Yet</h5>
          <p class="empty-state-desc">
            Save all your delivery addresses (Home, Work, Family, Friends) for instant 1-tap checkout next time you order!
          </p>
          <button type="button" class="btn-luxury-gold" id="btnPageEmptyAddAddr">
            <i class="fas fa-plus"></i> Add First Delivery Address
          </button>
        </div>
      `;
      const btnEmpty = document.getElementById('btnPageEmptyAddAddr');
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
        <div class="addr-card-v2 ${addr.is_default ? 'is-default' : ''}" data-id="${escapeHtml(addr.id)}">
          <div class="addr-card-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="addr-pill-tag ${lbl}">
                <i class="fas fa-${icon}"></i> ${escapeHtml(addr.label || 'Home')}
              </span>
              ${addr.is_default ? '<span class="badge-default-star"><i class="fas fa-check-circle"></i> Default</span>' : ''}
            </div>
            <div class="addr-actions-btns">
              <button type="button" class="btn-icon-action btn-edit-addr" data-id="${escapeHtml(addr.id)}" title="Edit this address">
                <i class="fas fa-pen"></i>
              </button>
              <button type="button" class="btn-icon-action delete btn-delete-addr" data-id="${escapeHtml(addr.id)}" title="Delete this address">
                <i class="fas fa-trash-alt"></i>
              </button>
            </div>
          </div>
          <div class="addr-card-address-text">${escapeHtml(addr.address)}</div>
          ${addr.landmark ? `<div class="addr-card-landmark"><i class="fas fa-compass" style="color:var(--primary-gold);"></i> Landmark: ${escapeHtml(addr.landmark)}</div>` : ''}
          ${!addr.is_default ? `
            <div style="margin-top: 14px; padding-top: 10px; border-top: 1px solid #f0ebe1;">
              <button type="button" class="btn-set-default-v2 btn-set-default" data-id="${escapeHtml(addr.id)}">
                <i class="far fa-star"></i> Set as Default Address
              </button>
            </div>
          ` : ''}
        </div>
      `;
    });

    pageSavedAddressesCardsList.innerHTML = cardsHtml;

    // Attach listeners
    pageSavedAddressesCardsList.querySelectorAll('.btn-edit-addr').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        openAddressEditor(b.dataset.id);
      });
    });

    pageSavedAddressesCardsList.querySelectorAll('.btn-delete-addr').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteAddress(b.dataset.id);
      });
    });

    pageSavedAddressesCardsList.querySelectorAll('.btn-set-default').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        setDefaultAddress(b.dataset.id);
      });
    });
  }

  function openAddressEditor(addrId = null) {
    if (!pageAddressEditorBox) return;
    const list = Array.isArray(profile.saved_addresses) ? profile.saved_addresses : [];

    currentEditingAddressId = addrId;

    if (pageAddressEditorTitle) {
      pageAddressEditorTitle.textContent = addrId ? 'Edit Delivery Address' : 'Add New Delivery Address';
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

    const pills = pageAddressEditorBox.querySelectorAll('.label-selector-btn, .addr-label-pill');
    pills.forEach(pill => {
      if (pill.dataset.label.toLowerCase() === targetLabel.toLowerCase()) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });

    if (pageEditorAddressText) pageEditorAddressText.value = targetAddress;
    if (pageEditorAddressLandmark) pageEditorAddressLandmark.value = targetLandmark;
    if (pageEditorAddressIsDefault) {
      pageEditorAddressIsDefault.checked = targetIsDefault;
      pageEditorAddressIsDefault.disabled = (list.length <= 1 && targetIsDefault);
    }

    pageAddressEditorBox.style.display = 'block';
    pageAddressEditorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (pageEditorAddressText) {
      setTimeout(() => pageEditorAddressText.focus(), 150);
    }
  }

  function closeAddressEditor() {
    if (!pageAddressEditorBox) return;
    pageAddressEditorBox.style.display = 'none';
    currentEditingAddressId = null;
    if (pageEditorAddressText) pageEditorAddressText.value = '';
    if (pageEditorAddressLandmark) pageEditorAddressLandmark.value = '';
  }

  function saveAddressFromEditor() {
    if (!pageEditorAddressText) return;
    const addrVal = pageEditorAddressText.value.trim();
    if (!addrVal) {
      notify('Please enter your complete delivery address');
      pageEditorAddressText.focus();
      return;
    }

    let selectedLabel = 'Home';
    const activePill = pageAddressEditorBox ? pageAddressEditorBox.querySelector('.label-selector-btn.active, .addr-label-pill.active') : null;
    if (activePill) {
      selectedLabel = activePill.dataset.label || 'Home';
    }

    const landmarkVal = pageEditorAddressLandmark ? pageEditorAddressLandmark.value.trim() : '';
    const isDefault = pageEditorAddressIsDefault ? pageEditorAddressIsDefault.checked : false;

    if (currentEditingAddressId) {
      const idx = profile.saved_addresses.findIndex(a => a.id === currentEditingAddressId);
      if (idx !== -1) {
        profile.saved_addresses[idx].label = selectedLabel;
        profile.saved_addresses[idx].address = addrVal;
        profile.saved_addresses[idx].landmark = landmarkVal;
        if (isDefault) {
          profile.saved_addresses.forEach((a, i) => a.is_default = (i === idx));
          profile.address = addrVal + (landmarkVal ? ' (Landmark: ' + landmarkVal + ')' : '');
        } else if (profile.saved_addresses.length === 1) {
          profile.saved_addresses[idx].is_default = true;
          profile.address = addrVal + (landmarkVal ? ' (Landmark: ' + landmarkVal + ')' : '');
        }
      }
    } else {
      const newAddrId = 'addr_' + Date.now();
      const shouldBeDefault = isDefault || profile.saved_addresses.length === 0;

      if (shouldBeDefault) {
        profile.saved_addresses.forEach(a => a.is_default = false);
        profile.address = addrVal + (landmarkVal ? ' (Landmark: ' + landmarkVal + ')' : '');
      }

      profile.saved_addresses.push({
        id: newAddrId,
        label: selectedLabel,
        address: addrVal,
        landmark: landmarkVal,
        is_default: shouldBeDefault
      });
    }

    saveProfileState();
    closeAddressEditor();
    renderAddressesList();
    notify('✓ Delivery address saved successfully!');
  }

  function setDefaultAddress(addrId) {
    const target = profile.saved_addresses.find(a => a.id === addrId);
    if (!target) return;

    profile.saved_addresses.forEach(a => {
      a.is_default = (a.id === addrId);
    });

    profile.address = target.address + (target.landmark ? ' (Landmark: ' + target.landmark + ')' : '');
    saveProfileState();
    renderAddressesList();
    notify(`✓ Set "${target.label || 'Address'}" as default`);
  }

  function deleteAddress(addrId) {
    const target = profile.saved_addresses.find(a => a.id === addrId);
    const targetLabel = target ? (target.label || 'Address') : 'Address';

    profile.saved_addresses = profile.saved_addresses.filter(a => a.id !== addrId);

    if (profile.saved_addresses.length > 0) {
      const hasDefault = profile.saved_addresses.some(a => a.is_default);
      if (!hasDefault) {
        profile.saved_addresses[0].is_default = true;
        profile.address = profile.saved_addresses[0].address + (profile.saved_addresses[0].landmark ? ' (Landmark: ' + profile.saved_addresses[0].landmark + ')' : '');
      }
    } else {
      profile.address = '';
    }

    saveProfileState();
    renderAddressesList();
    notify(`Removed "${targetLabel}"`);
  }

  function saveProfileState() {
    localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(profile));
    if (typeof window.saveCustomerProfile === 'function') {
      window.saveCustomerProfile(profile);
    } else if (typeof window.syncCustomerToSupabase === 'function') {
      window.syncCustomerToSupabase(profile);
    }
  }

  // Address Editor Listeners
  if (btnPageAddNewAddress) btnPageAddNewAddress.addEventListener('click', () => openAddressEditor(null));
  if (btnPageCancelEditor) btnPageCancelEditor.addEventListener('click', closeAddressEditor);
  if (btnPageDiscardEditor) btnPageDiscardEditor.addEventListener('click', closeAddressEditor);
  if (btnPageSaveAddress) btnPageSaveAddress.addEventListener('click', saveAddressFromEditor);

  if (pageAddressEditorBox) {
    pageAddressEditorBox.querySelectorAll('.label-selector-btn, .addr-label-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        pageAddressEditorBox.querySelectorAll('.label-selector-btn, .addr-label-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
      });
    });
  }

  // --------------------------------------------------------------------------
  // ORDER HISTORY & RECEIPTS ENGINE
  // --------------------------------------------------------------------------
  async function loadOrdersFromCloud() {
    try {
      let fetchFn = window.fetchUserOrdersFromSupabase;
      if (typeof fetchFn !== 'function') {
        for (let i = 0; i < 5; i++) {
          await new Promise(r => setTimeout(r, 100));
          if (typeof window.fetchUserOrdersFromSupabase === 'function') {
            fetchFn = window.fetchUserOrdersFromSupabase;
            break;
          }
        }
      }

      // Resolve phone from profile or saved auth
      let queryPhone = (profile && profile.phone) ? profile.phone : '';
      let queryEmail = (profile && profile.email) ? profile.email : '';
      if (!queryPhone) {
        try {
          const authRaw = localStorage.getItem('breeze_customer_profile');
          if (authRaw) {
            const parsed = JSON.parse(authRaw);
            queryPhone = parsed.phone || '';
            queryEmail = queryEmail || parsed.email || '';
          }
        } catch (e) {}
      }

      if (typeof fetchFn === 'function' && (queryEmail || queryPhone)) {
        const { history } = await fetchFn(queryEmail, queryPhone);
        userOrdersHistory = history || [];
      } else {
        const cached = localStorage.getItem('breeze_orders_history');
        if (cached) userOrdersHistory = JSON.parse(cached);
      }
    } catch (e) {
      console.warn('Orders load error:', e);
    }
    renderOrdersList();
    updateStatsBar();
  }

  function renderOrdersList() {
    if (!pageOrdersListContainer) return;

    if (!Array.isArray(userOrdersHistory) || userOrdersHistory.length === 0) {
      pageOrdersListContainer.innerHTML = `
        <div class="empty-state-v2">
          <div class="empty-state-icon-circle">
            <i class="fas fa-receipt"></i>
          </div>
          <h5 class="empty-state-title">No Orders Found</h5>
          <p class="empty-state-desc">
            Orders placed with your account will appear here with live kitchen radar, official receipts, and 1-click reorder!
          </p>
          <a href="/menu" class="btn-luxury-gold" style="text-decoration: none;">
            <i class="fas fa-utensils"></i> Explore Rooftop Menu
          </a>
        </div>
      `;
      return;
    }

    const activeOrders = userOrdersHistory.filter(o => {
      const st = (o.status || '').toLowerCase().trim();
      return st !== 'delivered' && st !== 'completed' && st !== 'cancelled' && st !== 'rejected';
    });

    const pastOrders = userOrdersHistory.filter(o => {
      const st = (o.status || '').toLowerCase().trim();
      return st === 'delivered' || st === 'completed' || st === 'cancelled' || st === 'rejected';
    });

    function buildOrderCardHtml(ord, isActive) {
      const dateStr = ord.placedAt ? new Date(ord.placedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Recent';
      const itemsSummary = (ord.items || []).map(i => `${i.qty || 1}x ${escapeHtml(i.name)}`).join(', ') || 'Breeze Rooftop Dishes';
      const isCancelled = ord.status === 'cancelled' || ord.status === 'rejected';
      const isDelivered = ord.status === 'delivered' || ord.status === 'completed';

      let statusBg = '#fef3c7';
      let statusColor = '#92400e';
      let statusBorder = '#fde68a';
      let statusText = 'In Kitchen';

      if (isCancelled) {
        statusBg = '#fee2e2'; statusColor = '#991b1b'; statusBorder = '#fca5a5'; statusText = 'Cancelled';
      } else if (isDelivered) {
        statusBg = '#dcfce7'; statusColor = '#166534'; statusBorder = '#86efac'; statusText = 'Delivered';
      } else {
        const st = (ord.status || '').toLowerCase().trim();
        if (st === 'cooking' || st === 'preparing') statusText = 'Cooking in Kitchen';
        else if (st === 'food_ready') statusText = 'Packed & Ready';
        else if (st === 'out_for_delivery' || st === 'dispatched') statusText = 'Out for Delivery';
        else statusText = 'Order Confirmed';
      }

      const cardBorder = isActive
        ? 'border: 2px solid rgba(181, 136, 61, 0.55); box-shadow: 0 4px 16px rgba(181, 136, 61, 0.12);'
        : 'border: 1px solid #e7e2d9;';

      return `
        <div class="addr-card-v2" style="background:#ffffff; margin-bottom:14px; ${cardBorder} padding:20px; border-radius:16px;">
          <div class="addr-card-header" style="margin-bottom:10px;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="font-weight:800; font-size:1rem; color:#1c1917;">#${escapeHtml(ord.id)}</span>
              <span style="font-size:0.78rem; color:#78716c;"><i class="far fa-calendar-alt"></i> ${escapeHtml(dateStr)}</span>
            </div>
            <span style="font-size:0.75rem; font-weight:700; padding:4px 10px; border-radius:999px; background:${statusBg}; color:${statusColor}; border:1px solid ${statusBorder};">
              ${statusText}
            </span>
          </div>

          <div style="font-size:0.9rem; color:#44403c; margin:8px 0 16px; line-height:1.5;">
            ${itemsSummary}
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; padding-top:14px; border-top:1px solid #f0ebe1; flex-wrap:wrap; gap:10px;">
            <div style="font-size:1.2rem; font-weight:800; color:#1c1917; font-family:'Plus Jakarta Sans', sans-serif;">
              ₹${escapeHtml(String(ord.total))}
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${isActive ? `
                <a href="/track?id=${encodeURIComponent(ord.id)}" class="btn-luxury-gold" style="padding:8px 16px; font-size:0.84rem; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
                  <i class="fas fa-satellite-dish"></i> Live Track Order
                </a>
              ` : `
                <button type="button" class="btn-set-default-v2 btn-profile-track" data-id="${escapeHtml(ord.id)}">
                  <i class="fas fa-file-invoice"></i> View Receipt
                </button>
              `}
              <button type="button" class="btn-luxury-gold btn-profile-reorder" data-id="${escapeHtml(ord.id)}" style="padding:8px 18px; font-size:0.84rem;">
                <i class="fas fa-redo-alt"></i> Reorder
              </button>
            </div>
          </div>
        </div>
      `;
    }

    let ordersHtml = '';

    // 1. Active Orders on the Go
    if (activeOrders.length > 0) {
      ordersHtml += `
        <div style="margin-bottom: 24px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.2);"></span>
              <h5 style="margin: 0; font-weight: 800; font-size: 1.05rem; color: #1c1917;">Active Orders on the Go (${activeOrders.length})</h5>
            </div>
            <a href="/track" style="font-size: 0.82rem; font-weight: 700; color: var(--primary-gold); text-decoration: none;">
              <i class="fas fa-radar"></i> Open Live Radar
            </a>
          </div>
          ${activeOrders.map(o => buildOrderCardHtml(o, true)).join('')}
        </div>
      `;
    }

    // 2. Past Completed & Delivered Orders
    if (pastOrders.length > 0) {
      ordersHtml += `
        <div>
          <h5 style="margin: 0 0 12px; font-weight: 800; font-size: 1rem; color: #44403c;">
            <i class="fas fa-history" style="color: var(--primary-gold);"></i> Completed & Delivered Orders (${pastOrders.length})
          </h5>
          ${pastOrders.map(o => buildOrderCardHtml(o, false)).join('')}
        </div>
      `;
    }

    pageOrdersListContainer.innerHTML = ordersHtml;

    // Attach Reorder handlers
    pageOrdersListContainer.querySelectorAll('.btn-profile-reorder').forEach(btn => {
      btn.addEventListener('click', () => {
        handleReorder(btn.dataset.id);
      });
    });

    // Attach Track handlers
    pageOrdersListContainer.querySelectorAll('.btn-profile-track').forEach(btn => {
      btn.addEventListener('click', () => {
        const orderId = btn.dataset.id;
        const targetOrder = userOrdersHistory.find(o => o.id === orderId);
        if (targetOrder && typeof window.openOrderTrackingModal === 'function') {
          window.openOrderTrackingModal(targetOrder);
        }
      });
    });
  }

  function handleReorder(orderId) {
    const target = userOrdersHistory.find(o => o.id === orderId);
    if (!target || !Array.isArray(target.items) || target.items.length === 0) {
      notify('Could not load items from this order.');
      return;
    }

    const CART_KEY = 'breeze_rooftop_cart';
    let cart = [];
    try {
      const saved = localStorage.getItem(CART_KEY);
      if (saved) cart = JSON.parse(saved);
      if (!Array.isArray(cart)) cart = [];
    } catch (e) {
      cart = [];
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
          image: ordItem.image || 'assets/logo-emblem.png',
          category: ordItem.category || 'Highlights',
          petpooja_code: ordItem.petpooja_code || null
        });
      }
    });

    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
      sessionStorage.setItem('breeze_auto_open_cart', 'true');
    } catch (e) {}

    const drawer = document.getElementById('cartDrawer');
    if (drawer && typeof window.openCartDrawer === 'function') {
      window.openCartDrawer();
      notify(`✓ Added items from #${orderId} to your cart!`);
    } else {
      window.location.href = '/menu?openCart=1';
    }
  }

  if (btnPageRefreshOrders) {
    btnPageRefreshOrders.addEventListener('click', async () => {
      await loadOrdersFromCloud();
      notify('✓ Order history refreshed');
    });
  }

  // --------------------------------------------------------------------------
  // PERSONAL DETAILS FORM
  // --------------------------------------------------------------------------
  function renderPersonalForm() {
    if (pageInputName) pageInputName.value = profile.name || '';
    if (pageInputPhone) pageInputPhone.value = profile.phone || '';
    if (pageDisplayEmail) pageDisplayEmail.value = profile.email || '';
    const pageDisplaySecurityPhone = document.getElementById('pageDisplaySecurityPhone');
    if (pageDisplaySecurityPhone) {
      pageDisplaySecurityPhone.textContent = profile.phone ? ('+91 ' + profile.phone) : 'Direct Mobile Session';
    }
  }

  function savePersonalDetails() {
    if (!pageInputName || !pageInputPhone) return;
    const nameVal = pageInputName.value.trim();
    if (!nameVal) {
      notify('Please enter your full name');
      pageInputName.focus();
      return;
    }

    const rawPhone = pageInputPhone.value.trim();
    const digits = rawPhone.replace(/[^0-9]/g, '');

    if (typeof window.isValidIndianMobile === 'function') {
      if (!window.isValidIndianMobile(digits)) {
        notify('Please enter a valid 10-digit Indian mobile number');
        pageInputPhone.focus();
        return;
      }
    } else if (digits.length !== 10) {
      notify('Please enter a valid 10-digit mobile number');
      pageInputPhone.focus();
      return;
    }

    profile.name = nameVal;
    profile.phone = digits;
    saveProfileState();
    renderHeroSummary();
    const pageDisplaySecurityPhone = document.getElementById('pageDisplaySecurityPhone');
    if (pageDisplaySecurityPhone) {
      pageDisplaySecurityPhone.textContent = '+91 ' + digits;
    }
    notify('✓ Personal details updated successfully!');
  }

  if (btnPageSavePersonal) btnPageSavePersonal.addEventListener('click', savePersonalDetails);
  if (pageInputPhone) {
    pageInputPhone.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
    });
  }

  // --------------------------------------------------------------------------
  // BULLETPROOF TWO-WAY SIGN OUT SYNCHRONIZATION
  // --------------------------------------------------------------------------
  function executeSignOut() {
    // 1. Wipe all storage
    try {
      localStorage.removeItem(CUSTOMER_PROFILE_KEY);
      localStorage.removeItem('breeze_rooftop_cart');
      localStorage.removeItem('breeze_cart');
      localStorage.removeItem('breeze_active_order');
      localStorage.removeItem('breeze_orders_history');
    } catch (e) {}

    // 2. Reset internal state
    profile = {
      name: '',
      email: '',
      avatar: '',
      phone: '',
      address: '',
      saved_addresses: [],
      isLoggedIn: false
    };
    userOrdersHistory = [];

    // 3. Inform main.js if available
    let mainHandled = false;
    if (typeof window.performSignOut === 'function') {
      try {
        window.performSignOut();
        mainHandled = true;
      } catch (e) {}
    }

    // 4. Directly update Header Nav UI on profile page
    if (navUserArea) navUserArea.classList.remove('logged-in');
    if (navAuthBtn) {
      navAuthBtn.classList.remove('hidden');
      navAuthBtn.style.removeProperty('display');
      navAuthBtn.style.display = 'inline-flex';
    }
    if (navUserDropdown) {
      navUserDropdown.classList.add('hidden');
      navUserDropdown.style.setProperty('display', 'none', 'important');
    }
    if (navUserMenu) navUserMenu.classList.remove('active');

    // 5. Directly update Main View
    if (profileDashboardView) profileDashboardView.style.display = 'none';
    if (profileGuestGateway) profileGuestGateway.style.display = 'block';

    // 6. Broadcast global auth event for any other listeners
    try {
      window.dispatchEvent(new CustomEvent('breeze:auth_change', {
        detail: { isLoggedIn: false, profile: profile }
      }));
    } catch (err) {}

    initGuestGateway();
    if (!mainHandled) {
      notify('Signed out of Breeze account.');
    }
  }

  // Listen to Main Screen Sign Out button
  if (btnPageSignOut) {
    btnPageSignOut.addEventListener('click', (e) => {
      e.preventDefault();
      executeSignOut();
    });
  }

  // Listen to Header Dropdown Sign Out button
  if (menuSignOutBtn) {
    menuSignOutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      executeSignOut();
    });
  }

  // Reactive listeners for instant view synchronization across all actions
  window.addEventListener('breeze:auth_change', (e) => {
    checkAuthState();
  });

  window.addEventListener('storage', (e) => {
    checkAuthState();
  });

  window.addEventListener('focus', () => {
    checkAuthState();
  });

  // Initial Boot
  checkAuthState();
});
