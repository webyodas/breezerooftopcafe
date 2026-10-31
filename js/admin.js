/**
 * ============================================================================
 * BREEZE THE ROOFTOP CAFE — MASTER OPERATIONS & ADMIN ENGINE (/admin)
 * ============================================================================
 * Enterprise real-time cockpit for kitchen management:
 * 1. Admin Authentication with session persistence
 * 2. Real-time Live Orders Cockpit with Web Audio chimes
 * 3. Order Actions: Accept, Reject with reason, Mark as Ready in Kitchen
 * 4. Rider Assignment Engine with live availability indicators
 * 5. Menu & Inventory Stock Management (Instant Supabase sync)
 * 6. Inline Dish & Price Editing + Add Dish
 * 7. Delivery Partner Management & Status Control
 * 8. Sales & Commercial Revenue Analytics + CSV Export
 * 9. Printable Kitchen Order Tickets (KOT)
 */

document.addEventListener('DOMContentLoaded', () => {
  const ADMIN_SESSION_KEY = 'breeze_admin_session';
  const ADMIN_TOKEN_KEY = 'breeze_admin_token';
  const ADMIN_AUDIO_KEY = 'breeze_admin_audio_pref';

  // 1. SUPABASE CLIENT INITIALIZATION
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
      console.warn('Admin Supabase init error:', e);
    }
  }

  // 2. STATE REPOSITORY
  let currentAdmin = null;
  let allOrders = [];
  let allMenuItems = [];
  let allRiders = [];
  let isAudioEnabled = localStorage.getItem(ADMIN_AUDIO_KEY) !== 'false';
  let activeTab = 'orders';
  let orderStatusFilter = 'all';
  let orderSearchQuery = '';
  let orderPaymentFilter = 'all';
  let menuCategoryFilter = 'all';
  let menuSearchQuery = '';
  let menuStockFilter = 'all';

  // Pending Modal Targets
  let activeAssignOrder = null;
  let activeRejectOrder = null;
  let activeKotOrder = null;

  // Realtime Channels
  let ordersChannel = null;
  let ridersChannel = null;
  let menuChannel = null;
  let reservationsChannel = null;
  let adminUsersChannel = null;
  let allAdminUsers = [];

  // Table Reservations State
  let allReservations = [];
  let resDateFilter = 'today';
  let resStatusFilter = 'all';
  let resZoneFilter = 'all';
  let resSearchQuery = '';
  let resCustomStart = '';
  let resCustomEnd = '';

  // 3. DOM ELEMENT REFERENCES
  const adminAuthView = document.getElementById('adminAuthView');
  const adminAppView = document.getElementById('adminAppView');
  const adminHeaderActions = document.getElementById('adminHeaderActions');
  const adminLoginForm = document.getElementById('adminLoginForm');
  const inputAdminId = document.getElementById('inputAdminId');
  const inputAdminPassword = document.getElementById('inputAdminPassword');
  const checkRememberAdmin = document.getElementById('checkRememberAdmin');
  const hintAutofillCreds = document.getElementById('hintAutofillCreds');
  const btnAdminLogout = document.getElementById('btnAdminLogout');
  const btnAudioToggle = document.getElementById('btnAudioToggle');
  const btnRefreshAll = document.getElementById('btnRefreshAll');
  const refreshSpinner = document.getElementById('refreshSpinner');
  const dispAdminName = document.getElementById('dispAdminName');
  const dispAdminAvatar = document.getElementById('dispAdminAvatar');
  const dispAdminRole = document.getElementById('dispAdminRole');

  // Staff & Admin Management Elements
  const btnStaffManagement = document.getElementById('btnStaffManagement');
  const adminStaffModal = document.getElementById('adminStaffModal');
  const btnCloseStaffModal = document.getElementById('btnCloseStaffModal');
  const btnOpenAddStaffDrawer = document.getElementById('btnOpenAddStaffDrawer');
  const btnCancelAddStaff = document.getElementById('btnCancelAddStaff');
  const adminAddStaffContainer = document.getElementById('adminAddStaffContainer');
  const adminAddStaffForm = document.getElementById('adminAddStaffForm');
  const newStaffName = document.getElementById('newStaffName');
  const newStaffUsername = document.getElementById('newStaffUsername');
  const newStaffPassword = document.getElementById('newStaffPassword');
  const newStaffRole = document.getElementById('newStaffRole');
  const newStaffPhone = document.getElementById('newStaffPhone');
  const btnResetStaffForm = document.getElementById('btnResetStaffForm');
  const dispTotalStaffCount = document.getElementById('dispTotalStaffCount');
  const dispActiveStaffCount = document.getElementById('dispActiveStaffCount');
  const adminStaffTableBody = document.getElementById('adminStaffTableBody');

  // Edit Staff Modal Elements
  const adminEditStaffModal = document.getElementById('adminEditStaffModal');
  const btnCloseEditStaffModal = document.getElementById('btnCloseEditStaffModal');
  const btnCancelEditStaffModal = document.getElementById('btnCancelEditStaffModal');
  const adminEditStaffForm = document.getElementById('adminEditStaffForm');
  const editStaffId = document.getElementById('editStaffId');
  const editStaffUsername = document.getElementById('editStaffUsername');
  const editStaffName = document.getElementById('editStaffName');
  const editStaffPassword = document.getElementById('editStaffPassword');
  const btnGenEditPassword = document.getElementById('btnGenEditPassword');
  const editStaffRole = document.getElementById('editStaffRole');
  const editStaffPhone = document.getElementById('editStaffPhone');
  const editStaffIsActive = document.getElementById('editStaffIsActive');

  // Analytics Toolbar Elements & State
  const analyticsPeriodSelect = document.getElementById('analyticsPeriodSelect');
  const pillPeriodThisMonth = document.getElementById('pillPeriodThisMonth');
  const pillPeriodLastMonth = document.getElementById('pillPeriodLastMonth');
  const pillPeriodToday = document.getElementById('pillPeriodToday');
  const pillPeriodCustom = document.getElementById('pillPeriodCustom');
  const pillPeriodAllTime = document.getElementById('pillPeriodAllTime');
  const btnOpenPeriodReportModal = document.getElementById('btnOpenPeriodReportModal');
  const customDateRangeWrap = document.getElementById('customDateRangeWrap');
  const customStartDate = document.getElementById('customStartDate');
  const customEndDate = document.getElementById('customEndDate');
  const btnApplyCustomRange = document.getElementById('btnApplyCustomRange');
  const btnCancelCustomRange = document.getElementById('btnCancelCustomRange');
  const customRangeFeedback = document.getElementById('customRangeFeedback');

  // Modal 12: Period Report Modal Elements
  const periodReportModal = document.getElementById('periodReportModal');
  const periodReportModalTitle = document.getElementById('periodReportModalTitle');
  const reportPeriodSubtitleText = document.getElementById('reportPeriodSubtitleText');
  const btnPrintPeriodReport = document.getElementById('btnPrintPeriodReport');
  const btnExportPeriodCsv = document.getElementById('btnExportPeriodCsv');
  const btnClosePeriodReportModal = document.getElementById('btnClosePeriodReportModal');
  const periodReportModalBody = document.getElementById('periodReportModalBody');

  const kpiRevenueTitle = document.getElementById('kpiRevenueTitle');
  const kpiOrdersTitle = document.getElementById('kpiOrdersTitle');
  const dispFleetDeliveriesLabel = document.getElementById('dispFleetDeliveriesLabel');
  const dispFleetDeliveriesSub = document.getElementById('dispFleetDeliveriesSub');
  const dispFleetSettledLabel = document.getElementById('dispFleetSettledLabel');

  let activeAnalyticsPeriod = {
    mode: 'this_month', // 'this_month' | 'last_month' | 'month' | 'today' | 'custom' | 'all_time'
    yearMonth: '', // 'YYYY-MM'
    startDate: '', // 'YYYY-MM-DD'
    endDate: '' // 'YYYY-MM-DD'
  };

  // KPI Elements
  const kpiTotalRevenue = document.getElementById('kpiTotalRevenue');
  const kpiTodayRevenue = document.getElementById('kpiTodayRevenue');
  const kpiCodVsOnlineSplit = document.getElementById('kpiCodVsOnlineSplit');
  const kpiTotalOrders = document.getElementById('kpiTotalOrders');
  const kpiTodayOrders = document.getElementById('kpiTodayOrders');
  const kpiDeliveredCount = document.getElementById('kpiDeliveredCount');
  const kpiAovValue = document.getElementById('kpiAovValue');
  const kpiActiveTitle = document.getElementById('kpiActiveTitle');
  const kpiActiveOrders = document.getElementById('kpiActiveOrders');
  const kpiActiveBreakdown = document.getElementById('kpiActiveBreakdown');
  const kpiActiveBadge = document.getElementById('kpiActiveBadge');
  const kpiMenuTotalDishes = document.getElementById('kpiMenuTotalDishes');
  const kpiInStockDishes = document.getElementById('kpiInStockDishes');
  const kpiSoldOutDishes = document.getElementById('kpiSoldOutDishes');

  // Tab Navigation Elements
  const tabBtnOrders = document.getElementById('tabBtnOrders');
  const tabBtnReservations = document.getElementById('tabBtnReservations');
  const tabBtnMenu = document.getElementById('tabBtnMenu');
  const tabBtnRiders = document.getElementById('tabBtnRiders');
  const tabBtnCustomers = document.getElementById('tabBtnCustomers');
  const tabBtnAnalytics = document.getElementById('tabBtnAnalytics');
  const tabOrdersContent = document.getElementById('tabOrdersContent');
  const tabReservationsContent = document.getElementById('tabReservationsContent');
  const tabMenuContent = document.getElementById('tabMenuContent');
  const tabRidersContent = document.getElementById('tabRidersContent');
  const tabCustomersContent = document.getElementById('tabCustomersContent');
  const tabAnalyticsContent = document.getElementById('tabAnalyticsContent');
  const badgeOrdersCount = document.getElementById('badgeOrdersCount');
  const badgeReservationsCount = document.getElementById('badgeReservationsCount');
  const badgeMenuSoldOut = document.getElementById('badgeMenuSoldOut');
  const badgeRidersCount = document.getElementById('badgeRidersCount');
  const badgeCustomersCount = document.getElementById('badgeCustomersCount');

  // Table Reservations Elements
  const dispResTodayCount = document.getElementById('dispResTodayCount');
  const dispResTodayDate = document.getElementById('dispResTodayDate');
  const dispResTodayGuests = document.getElementById('dispResTodayGuests');
  const dispResSeatedCount = document.getElementById('dispResSeatedCount');
  const dispResUpcomingCount = document.getElementById('dispResUpcomingCount');
  const resDateFilters = document.getElementById('resDateFilters');
  const resStatusFilters = document.getElementById('resStatusFilters');
  const resCustomDateRow = document.getElementById('resCustomDateRow');
  const resCustomStartDate = document.getElementById('resCustomStartDate');
  const resCustomEndDate = document.getElementById('resCustomEndDate');
  const btnApplyResCustomDate = document.getElementById('btnApplyResCustomDate');
  const resSearchInput = document.getElementById('resSearchInput');
  const resZoneFilterSelect = document.getElementById('resZoneFilterSelect');
  const btnRefreshReservations = document.getElementById('btnRefreshReservations');
  const reservationsGridContainer = document.getElementById('reservationsGridContainer');
  const reservationsEmptyState = document.getElementById('reservationsEmptyState');
  const btnEmptyAddReservation = document.getElementById('btnEmptyAddReservation');
  const btnOpenAddReservationModal = document.getElementById('btnOpenAddReservationModal');

  // Table Reservation Modals Elements
  const adminAddReservationModal = document.getElementById('adminAddReservationModal');
  const btnCloseAddReservationModal = document.getElementById('btnCloseAddReservationModal');
  const btnCancelAddReservationModal = document.getElementById('btnCancelAddReservationModal');
  const adminAddReservationForm = document.getElementById('adminAddReservationForm');
  const addResName = document.getElementById('addResName');
  const addResPhone = document.getElementById('addResPhone');
  const addResDate = document.getElementById('addResDate');
  const addResTime = document.getElementById('addResTime');
  const addResGuests = document.getElementById('addResGuests');
  const addResZone = document.getElementById('addResZone');
  const addResTable = document.getElementById('addResTable');
  const addResStatus = document.getElementById('addResStatus');
  const addResNotes = document.getElementById('addResNotes');

  const adminAssignTableModal = document.getElementById('adminAssignTableModal');
  const btnCloseAssignTableModal = document.getElementById('btnCloseAssignTableModal');
  const btnCancelAssignTableModal = document.getElementById('btnCancelAssignTableModal');
  const adminAssignTableForm = document.getElementById('adminAssignTableForm');
  const assignReservationId = document.getElementById('assignReservationId');
  const assignTableNumberInput = document.getElementById('assignTableNumberInput');
  const assignGuestName = document.getElementById('assignGuestName');
  const assignGuestCountBadge = document.getElementById('assignGuestCountBadge');
  const assignGuestDetails = document.getElementById('assignGuestDetails');
  const checkAutoMarkSeated = document.getElementById('checkAutoMarkSeated');
  const quickTablePresets = document.getElementById('quickTablePresets');
  const btnClearAssignTable = document.getElementById('btnClearAssignTable');

  // Orders Tab Elements
  const ordersGridContainer = document.getElementById('ordersGridContainer');
  const ordersEmptyState = document.getElementById('ordersEmptyState');
  const orderSearchInput = document.getElementById('orderSearchInput');
  const orderPaymentFilterSelect = document.getElementById('orderPaymentFilter');
  const orderStatusFilters = document.getElementById('orderStatusFilters');

  // Menu Tab Elements
  const menuTableBody = document.getElementById('menuTableBody');
  const menuSearchInput = document.getElementById('menuSearchInput');
  const menuCategoryFilterSelect = document.getElementById('menuCategoryFilter');
  const menuStockFilterSelect = document.getElementById('menuStockFilter');
  const menuDietaryFilterSelect = document.getElementById('menuDietaryFilter');
  let menuDietaryFilter = 'all';
  const btnOpenAddDishModal = document.getElementById('btnOpenAddDishModal');

  // Riders Tab Elements
  const ridersGridContainer = document.getElementById('ridersGridContainer');
  const fleetStatusSummary = document.getElementById('fleetStatusSummary');
  const btnOpenAddRiderModal = document.getElementById('btnOpenAddRiderModal');
  const dispFleetTotalRiders = document.getElementById('dispFleetTotalRiders');
  const dispFleetOnlineSub = document.getElementById('dispFleetOnlineSub');
  const dispFleetPendingCash = document.getElementById('dispFleetPendingCash');
  const dispFleetPendingOrdersSub = document.getElementById('dispFleetPendingOrdersSub');
  const dispFleetTotalDeliveries = document.getElementById('dispFleetTotalDeliveries');
  const dispFleetSettledCash = document.getElementById('dispFleetSettledCash');
  const dispFleetSettledCountSub = document.getElementById('dispFleetSettledCountSub');

  // Settle Rider Cash Modal Elements
  const settleRiderModal = document.getElementById('settleRiderModal');
  const btnCloseSettleRiderModal = document.getElementById('btnCloseSettleRiderModal');
  const btnCancelSettleModal = document.getElementById('btnCancelSettleModal');
  const btnConfirmSettleRider = document.getElementById('btnConfirmSettleRider');
  const settleModalRiderName = document.getElementById('settleModalRiderName');
  const settleModalRiderId = document.getElementById('settleModalRiderId');
  const settleModalDueAmount = document.getElementById('settleModalDueAmount');
  const settleModalOrdersCount = document.getElementById('settleModalOrdersCount');
  const settleModalOrdersList = document.getElementById('settleModalOrdersList');
  const inputSettleAmountReceived = document.getElementById('inputSettleAmountReceived');
  const inputSettleNotes = document.getElementById('inputSettleNotes');
  const btnSettleQuickFull = document.getElementById('btnSettleQuickFull');
  const settleQuickFullLabel = document.getElementById('settleQuickFullLabel');
  const settlePaymentModeBadge = document.getElementById('settlePaymentModeBadge');
  const settleDynamicHelper = document.getElementById('settleDynamicHelper');
  const settleHelperTitle = document.getElementById('settleHelperTitle');
  const settleHelperRemaining = document.getElementById('settleHelperRemaining');
  const settleHelperDesc = document.getElementById('settleHelperDesc');
  let activeSettleRider = null;
  let activeSettleOrders = [];
  let allSettlements = [];

  // Customers Tab Elements
  const customerDbSummary = document.getElementById('customerDbSummary');
  const btnExportCustomersCsv = document.getElementById('btnExportCustomersCsv');
  const dispTotalCustomersCount = document.getElementById('dispTotalCustomersCount');
  const dispVerifiedCustomersSub = document.getElementById('dispVerifiedCustomersSub');
  const dispRepeatCustomersCount = document.getElementById('dispRepeatCustomersCount');
  const dispRepeatRateSub = document.getElementById('dispRepeatRateSub');
  const dispAvgCustomerLtv = document.getElementById('dispAvgCustomerLtv');
  const dispTopCustomerSpend = document.getElementById('dispTopCustomerSpend');
  const dispTopCustomerName = document.getElementById('dispTopCustomerName');
  const customerSearchInput = document.getElementById('customerSearchInput');
  const customerSegmentFilter = document.getElementById('customerSegmentFilter');
  const customerSortFilter = document.getElementById('customerSortFilter');
  const customersTableBody = document.getElementById('customersTableBody');
  const customersEmptyState = document.getElementById('customersEmptyState');

  // Modal 11: Customer Detail Elements
  const customerDetailModal = document.getElementById('customerDetailModal');
  const btnCloseCustomerDetailModal = document.getElementById('btnCloseCustomerDetailModal');
  const btnCloseCustomerDetailDrawer = document.getElementById('btnCloseCustomerDetailDrawer');
  const customerModalAvatarContainer = document.getElementById('customerModalAvatarContainer');
  const customerModalName = document.getElementById('customerModalName');
  const customerModalTierBadge = document.getElementById('customerModalTierBadge');
  const customerModalJoined = document.getElementById('customerModalJoined');
  const customerModalWhatsappBtn = document.getElementById('customerModalWhatsappBtn');
  const customerModalCallBtn = document.getElementById('customerModalCallBtn');
  const customerModalTotalSpent = document.getElementById('customerModalTotalSpent');
  const customerModalOrdersCount = document.getElementById('customerModalOrdersCount');
  const customerModalAov = document.getElementById('customerModalAov');
  const customerModalLastOrderDate = document.getElementById('customerModalLastOrderDate');
  const customerModalPhone = document.getElementById('customerModalPhone');
  const customerModalEmail = document.getElementById('customerModalEmail');
  const customerModalDefaultAddress = document.getElementById('customerModalDefaultAddress');
  const customerModalSavedAddressesContainer = document.getElementById('customerModalSavedAddressesContainer');
  const customerModalActiveCartBox = document.getElementById('customerModalActiveCartBox');
  const customerModalActiveCartItems = document.getElementById('customerModalActiveCartItems');
  const customerModalOrdersSubtitle = document.getElementById('customerModalOrdersSubtitle');
  const customerModalOrdersTableBody = document.getElementById('customerModalOrdersTableBody');

  let allCustomers = [];
  let customersChannel = null;
  let customerSearchQuery = '';
  let customerSegment = 'all';
  let customerSort = 'spent_desc';
  let activeDetailCustomer = null;

  // Analytics Elements
  const btnExportOrdersCsv = document.getElementById('btnExportOrdersCsv');
  const analyticsPaymentBreakdown = document.getElementById('analyticsPaymentBreakdown');
  const analyticsTopDishes = document.getElementById('analyticsTopDishes');
  const analyticsStatusFunnel = document.getElementById('analyticsStatusFunnel');
  const analyticsRiderPerformance = document.getElementById('analyticsRiderPerformance');

  // Modals & Overlays
  const assignRiderModal = document.getElementById('assignRiderModal');
  const btnCloseAssignModal = document.getElementById('btnCloseAssignModal');
  const assignModalOrderId = document.getElementById('assignModalOrderId');
  const assignModalOrderTotal = document.getElementById('assignModalOrderTotal');
  const assignModalCustName = document.getElementById('assignModalCustName');
  const assignModalAddress = document.getElementById('assignModalAddress');
  const assignRiderListContainer = document.getElementById('assignRiderListContainer');

  const rejectOrderModal = document.getElementById('rejectOrderModal');
  const btnCloseRejectModal = document.getElementById('btnCloseRejectModal');
  const btnCancelRejectModal = document.getElementById('btnCancelRejectModal');
  const btnConfirmRejectOrder = document.getElementById('btnConfirmRejectOrder');
  const rejectCustomReasonGroup = document.getElementById('rejectCustomReasonGroup');
  const rejectCustomReasonInput = document.getElementById('rejectCustomReasonInput');
  const rejectOnlineRefundNotice = document.getElementById('rejectOnlineRefundNotice');
  const rejectOnlineAmount = document.getElementById('rejectOnlineAmount');
  const rejectCustomerName = document.getElementById('rejectCustomerName');
  const rejectCustomerPhone = document.getElementById('rejectCustomerPhone');
  const rejectCustomerPhoneLink = document.getElementById('rejectCustomerPhoneLink');
  const btnRejectDirectUpi = document.getElementById('btnRejectDirectUpi');
  const btnRejectWhatsAppRefund = document.getElementById('btnRejectWhatsAppRefund');
  const btnRejectRazorpayLink = document.getElementById('btnRejectRazorpayLink');

  const editDishModal = document.getElementById('editDishModal');
  const btnCloseEditDishModal = document.getElementById('btnCloseEditDishModal');
  const btnCancelEditDishModal = document.getElementById('btnCancelEditDishModal');
  const btnDeleteDishFromModal = document.getElementById('btnDeleteDishFromModal');
  const editDishForm = document.getElementById('editDishForm');
  const editDishId = document.getElementById('editDishId');
  const editDishName = document.getElementById('editDishName');
  const editDishPrice = document.getElementById('editDishPrice');
  const editDishCategory = document.getElementById('editDishCategory');
  const editDishPetpoojaCode = document.getElementById('editDishPetpoojaCode');
  const editDishImageUrl = document.getElementById('editDishImageUrl');

  const addDishModal = document.getElementById('addDishModal');
  const btnCloseAddDishModal = document.getElementById('btnCloseAddDishModal');
  const btnCancelAddDishModal = document.getElementById('btnCancelAddDishModal');
  const addDishForm = document.getElementById('addDishForm');
  const newDishName = document.getElementById('newDishName');
  const newDishPrice = document.getElementById('newDishPrice');
  const newDishCategory = document.getElementById('newDishCategory');
  const newDishPetpoojaCode = document.getElementById('newDishPetpoojaCode');
  const newDishImageUrl = document.getElementById('newDishImageUrl');
  const newDishInStock = document.getElementById('newDishInStock');

  const addRiderModal = document.getElementById('addRiderModal');
  const btnCloseAddRiderModal = document.getElementById('btnCloseAddRiderModal');
  const btnCancelAddRiderModal = document.getElementById('btnCancelAddRiderModal');
  const addRiderForm = document.getElementById('addRiderForm');
  const newRiderId = document.getElementById('newRiderId');
  const newRiderName = document.getElementById('newRiderName');
  const newRiderPhone = document.getElementById('newRiderPhone');
  const newRiderPasscode = document.getElementById('newRiderPasscode');
  const newRiderVehicleType = document.getElementById('newRiderVehicleType');
  const newRiderVehicleNum = document.getElementById('newRiderVehicleNum');
  const btnRegeneratePasscode = document.getElementById('btnRegeneratePasscode');
  const riderCreatedModal = document.getElementById('riderCreatedModal');
  const createdRiderDispName = document.getElementById('createdRiderDispName');
  const createdRiderDispId = document.getElementById('createdRiderDispId');
  const createdRiderDispPass = document.getElementById('createdRiderDispPass');
  const btnCopyCreatedRiderCreds = document.getElementById('btnCopyCreatedRiderCreds');
  const btnCloseRiderCreatedModal = document.getElementById('btnCloseRiderCreatedModal');

  const kotModal = document.getElementById('kotModal');
  const btnCloseKotModal = document.getElementById('btnCloseKotModal');
  const btnCancelKotModal = document.getElementById('btnCancelKotModal');
  const btnPrintKotBtn = document.getElementById('btnPrintKotBtn');
  const kotOrderId = document.getElementById('kotOrderId');
  const kotOrderType = document.getElementById('kotOrderType');
  const kotOrderDate = document.getElementById('kotOrderDate');
  const kotCustName = document.getElementById('kotCustName');
  const kotCustPhone = document.getElementById('kotCustPhone');
  const kotCustAddress = document.getElementById('kotCustAddress');
  const kotItemsBody = document.getElementById('kotItemsBody');
  const kotSubtotal = document.getElementById('kotSubtotal');
  const kotDeliveryFee = document.getElementById('kotDeliveryFee');
  const kotTotal = document.getElementById('kotTotal');
  const kotPaymentBadge = document.getElementById('kotPaymentBadge');

  // Emergency Store Operating Status Controls
  const btnToggleStoreStatus = document.getElementById('btnToggleStoreStatus');
  const dispStoreStatusText = document.getElementById('dispStoreStatusText');
  const adminStoreClosedBanner = document.getElementById('adminStoreClosedBanner');
  const dispAdminClosureReason = document.getElementById('dispAdminClosureReason');
  const btnQuickReopenStore = document.getElementById('btnQuickReopenStore');
  const storeStatusModal = document.getElementById('storeStatusModal');
  const btnCloseStoreStatusModal = document.getElementById('btnCloseStoreStatusModal');
  const btnCancelStoreStatusModal = document.getElementById('btnCancelStoreStatusModal');
  const radioStoreOpen = document.getElementById('radioStoreOpen');
  const radioStoreClosed = document.getElementById('radioStoreClosed');
  const selectClosurePreset = document.getElementById('selectClosurePreset');
  const inputCustomClosureReason = document.getElementById('inputCustomClosureReason');
  const btnSaveStoreStatus = document.getElementById('btnSaveStoreStatus');

  // Accept Order & Kitchen Prep Modal Elements
  let activeAcceptOrder = null;
  let activeAdjustOrder = null;
  let currentSelectedPrepMins = 20;
  let currentSelectedTransitMins = 15;
  let currentExtendMins = 5;

  const acceptOrderModal = document.getElementById('acceptOrderModal');
  const btnCloseAcceptModal = document.getElementById('btnCloseAcceptModal');
  const btnCancelAcceptModal = document.getElementById('btnCancelAcceptModal');
  const btnConfirmAcceptOrder = document.getElementById('btnConfirmAcceptOrder');
  const acceptModalOrderSubtitle = document.getElementById('acceptModalOrderSubtitle');
  const acceptModalCustName = document.getElementById('acceptModalCustName');
  const acceptModalItemsCount = document.getElementById('acceptModalItemsCount');
  const acceptModalOrderTotal = document.getElementById('acceptModalOrderTotal');
  const prepTimeChips = document.getElementById('prepTimeChips');
  const inputCustomPrepMins = document.getElementById('inputCustomPrepMins');
  const btnPrepMinus = document.getElementById('btnPrepMinus');
  const btnPrepPlus = document.getElementById('btnPrepPlus');
  const groupTransitBuffer = document.getElementById('groupTransitBuffer');
  const transitTimeChips = document.getElementById('transitTimeChips');
  const inputCustomTransitMins = document.getElementById('inputCustomTransitMins');
  const btnTransitMinus = document.getElementById('btnTransitMinus');
  const btnTransitPlus = document.getElementById('btnTransitPlus');
  const previewKitchenReadyTime = document.getElementById('previewKitchenReadyTime');
  const previewKitchenReadyMins = document.getElementById('previewKitchenReadyMins');
  const cardPreviewDelivery = document.getElementById('cardPreviewDelivery');
  const previewDeliveryTime = document.getElementById('previewDeliveryTime');
  const previewDeliveryMins = document.getElementById('previewDeliveryMins');

  // Adjust ETA Modal Elements
  const adjustEtaModal = document.getElementById('adjustEtaModal');
  const btnCloseAdjustEtaModal = document.getElementById('btnCloseAdjustEtaModal');
  const btnCancelAdjustEtaModal = document.getElementById('btnCancelAdjustEtaModal');
  const btnSaveAdjustEta = document.getElementById('btnSaveAdjustEta');
  const adjustModalOrderSubtitle = document.getElementById('adjustModalOrderSubtitle');
  const extendTimeChips = document.getElementById('extendTimeChips');
  const selectDelayReason = document.getElementById('selectDelayReason');
  const adjustNewPrepDisplay = document.getElementById('adjustNewPrepDisplay');
  const adjustNewDeliveryRow = document.getElementById('adjustNewDeliveryRow');
  const adjustNewDeliveryDisplay = document.getElementById('adjustNewDeliveryDisplay');

  // Toast
  const adminToast = document.getElementById('adminToast');
  const adminToastText = document.getElementById('adminToastText');

  function showAdminToast(msg, isSuccess = true) {
    if (!adminToast) return;
    adminToastText.textContent = msg;
    const icon = adminToast.querySelector('i');
    if (icon) {
      icon.className = isSuccess ? 'fas fa-check-circle' : 'fas fa-exclamation-triangle';
      icon.style.color = isSuccess ? '#22c55e' : '#f59e0b';
    }
    adminToast.style.display = 'flex';
    setTimeout(() => { adminToast.style.display = 'none'; }, 3500);
  }

  // --------------------------------------------------------------------------
  // AUDIO CHIME SYSTEM (Resilient Web Audio API Synthesizer)
  // --------------------------------------------------------------------------
  let sharedAudioCtx = null;
  function getAudioContext() {
    if (!sharedAudioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        sharedAudioCtx = new AudioCtxClass();
      }
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  }

  // Actively unlock audio context upon ANY first physical user gesture
  function unlockAudioEngine() {
    getAudioContext();
    document.removeEventListener('click', unlockAudioEngine);
    document.removeEventListener('keydown', unlockAudioEngine);
    document.removeEventListener('touchstart', unlockAudioEngine);
  }
  document.addEventListener('click', unlockAudioEngine, { passive: true });
  document.addEventListener('keydown', unlockAudioEngine, { passive: true });
  document.addEventListener('touchstart', unlockAudioEngine, { passive: true });

  function playNewOrderChime() {
    if (!isAudioEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const runOscillators = () => {
        try {
          const now = ctx.currentTime;
          // Note 1: 784 Hz (G5)
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(784, now);
          gain1.gain.setValueAtTime(0.4, now);
          gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
          osc1.connect(gain1);
          gain1.connect(ctx.destination);
          osc1.start(now);
          osc1.stop(now + 0.35);

          // Note 2: 1046.5 Hz (C6)
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(1046.5, now + 0.15);
          gain2.gain.setValueAtTime(0.5, now + 0.15);
          gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start(now + 0.15);
          osc2.stop(now + 0.65);

          // Note 3: 1318.5 Hz (E6)
          const osc3 = ctx.createOscillator();
          const gain3 = ctx.createGain();
          osc3.type = 'sine';
          osc3.frequency.setValueAtTime(1318.5, now + 0.3);
          gain3.gain.setValueAtTime(0.55, now + 0.3);
          gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
          osc3.connect(gain3);
          gain3.connect(ctx.destination);
          osc3.start(now + 0.3);
          osc3.stop(now + 0.9);

          if (navigator.vibrate) {
            navigator.vibrate([250, 100, 250]);
          }
        } catch (e) {
          console.warn('Oscillator run error:', e);
        }
      };

      if (ctx.state === 'suspended') {
        ctx.resume().then(runOscillators).catch(runOscillators);
      } else {
        runOscillators();
      }
    } catch (e) {
      console.warn('Audio chime notice:', e);
    }
  }

  // --------------------------------------------------------------------------
  // CONTINUOUS NEW ORDER RINGER ENGINE (ADMIN / KITCHEN COCKPIT)
  // Keeps ringing with alarm sound every 3.5s until accepted, rejected, or muted
  // --------------------------------------------------------------------------
  let adminRingerTimer = null;
  const pendingRingingOrderIds = new Set();

  function startAdminRinger(orderId, orderSummary = '') {
    if (orderId) pendingRingingOrderIds.add(orderId);
    if (!isAudioEnabled) return;

    updateAdminRingingBanner();
    playNewOrderChime();

    if (!adminRingerTimer) {
      adminRingerTimer = setInterval(() => {
        if (!isAudioEnabled || pendingRingingOrderIds.size === 0) {
          stopAdminRinger();
          return;
        }
        playNewOrderChime();
        updateAdminRingingBanner();
      }, 3500);
    }
  }

  function stopAdminRinger(orderId = null) {
    if (orderId) {
      pendingRingingOrderIds.delete(orderId);
    } else {
      pendingRingingOrderIds.clear();
    }

    if (pendingRingingOrderIds.size === 0) {
      if (adminRingerTimer) {
        clearInterval(adminRingerTimer);
        adminRingerTimer = null;
      }
      hideAdminRingingBanner();
    } else {
      updateAdminRingingBanner();
    }
  }

  function updateAdminRingingBanner() {
    let banner = document.getElementById('adminRingingBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'adminRingingBanner';
      banner.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;align-items:center;gap:12px;padding:10px 20px;border-radius:30px;background:#dc2626;color:#ffffff;font-size:0.88rem;font-weight:700;box-shadow:0 8px 24px rgba(220,38,38,0.45);animation:pulseRinger 1.2s infinite ease-in-out;cursor:pointer;';
      banner.innerHTML = `
        <i class="fas fa-bell fa-shake" style="font-size:1.15rem;"></i>
        <span id="adminRingingText">🔔 Incoming Order Ringing!</span>
        <button type="button" id="btnAdminSilenceRinger" style="background:#ffffff;color:#dc2626;border:none;border-radius:20px;padding:5px 14px;font-size:0.78rem;font-weight:800;cursor:pointer;margin-left:4px;box-shadow:0 2px 6px rgba(0,0,0,0.15);">Silence</button>
      `;
      document.body.appendChild(banner);
      const silenceBtn = banner.querySelector('#btnAdminSilenceRinger');
      if (silenceBtn) {
        silenceBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          stopAdminRinger();
          showAdminToast('🔕 Ringing alarm silenced.');
        });
      }
      banner.addEventListener('click', () => {
        stopAdminRinger();
        if (typeof switchTab === 'function') switchTab('orders');
      });
    }
    const txt = banner.querySelector('#adminRingingText');
    if (txt) {
      const count = pendingRingingOrderIds.size;
      txt.textContent = count > 1 ? `🔔 ${count} Incoming Orders Ringing!` : `🔔 New Incoming Order Ringing!`;
    }
    banner.style.display = 'flex';
  }

  function hideAdminRingingBanner() {
    const banner = document.getElementById('adminRingingBanner');
    if (banner) banner.style.display = 'none';
  }

  if (btnAudioToggle) {
    btnAudioToggle.addEventListener('click', () => {
      isAudioEnabled = !isAudioEnabled;
      localStorage.setItem(ADMIN_AUDIO_KEY, isAudioEnabled ? 'true' : 'false');
      btnAudioToggle.classList.toggle('active', isAudioEnabled);
      const icon = btnAudioToggle.querySelector('i');
      if (icon) icon.className = isAudioEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
      if (isAudioEnabled) {
        playNewOrderChime();
        showAdminToast('Audio alerts turned ON (Test chime played)');
      } else {
        stopAdminRinger();
        showAdminToast('Audio alerts muted');
      }
    });
  }

  // --------------------------------------------------------------------------
  // AUTHENTICATION LOGIC & PERSISTENCE
  // --------------------------------------------------------------------------
// Demo autofill removed for security hardening

  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = inputAdminId.value.trim();
      const p = inputAdminPassword.value.trim();

      if (!u || !p) {
        alert('Please enter both Admin ID and Password.');
        return;
      }

      const btnSubmit = document.getElementById('btnSubmitAdminLogin');
      const originalBtnHtml = btnSubmit ? btnSubmit.innerHTML : '';
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Authenticating...';
      }

      try {
        const res = await fetch('/api/auth?action=login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ type: 'admin', username: u, password: p })
        });
        const json = await res.json();

        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = originalBtnHtml;
        }

        if (res.ok && json.success && json.token) {
          currentAdmin = json.user;
          window.BREEZE_AUTH_TOKEN = json.token;
          sessionStorage.setItem(ADMIN_TOKEN_KEY, json.token);
          sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(currentAdmin));
          if (checkRememberAdmin && checkRememberAdmin.checked) {
            localStorage.setItem(ADMIN_TOKEN_KEY, json.token);
            localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(currentAdmin));
          } else {
            localStorage.removeItem(ADMIN_TOKEN_KEY);
            localStorage.removeItem(ADMIN_SESSION_KEY);
          }

          showAdminToast(`Welcome, ${currentAdmin.name}! 👋`);
          initAdminApp();
        } else {
          alert(json.error || 'Invalid Admin ID or Password. Please verify your credentials or contact the Master Admin.');
        }
      } catch (err) {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = originalBtnHtml;
        }
        console.error('[Admin Auth] Authentication network error:', err);
        alert('Connection error during authentication. Please verify your network and try again.');
      }
    });
  }

  if (btnAdminLogout) {
    btnAdminLogout.addEventListener('click', async () => {
      if (confirm('Are you sure you want to sign out of the Master Admin Portal?')) {
        try {
          await fetch('/api/auth?action=logout', { method: 'POST', credentials: 'include' });
        } catch(e){}
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        localStorage.removeItem(ADMIN_SESSION_KEY);
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        window.BREEZE_AUTH_TOKEN = null;
        currentAdmin = null;
        if (ordersChannel) ordersChannel.unsubscribe();
        if (ridersChannel) ridersChannel.unsubscribe();
        if (menuChannel) menuChannel.unsubscribe();
        if (reservationsChannel) reservationsChannel.unsubscribe();
        if (adminUsersChannel) adminUsersChannel.unsubscribe();
        location.reload();
      }
    });
  }

  // Cryptographically verified session restore on boot
  (async function restoreAdminSession() {
    const token = sessionStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(ADMIN_TOKEN_KEY);
    const savedSession = sessionStorage.getItem(ADMIN_SESSION_KEY) || localStorage.getItem(ADMIN_SESSION_KEY);

    if (token || savedSession) {
      try {
        const headers = {};
        if (token) {
          headers['Authorization'] = 'Bearer ' + token;
          window.BREEZE_AUTH_TOKEN = token;
        }
        const res = await fetch('/api/auth?action=me', {
          headers,
          credentials: 'include'
        });
        const json = await res.json();
        if (json && json.authenticated && json.user && json.user.type === 'admin') {
          currentAdmin = json.user;
          if (savedSession) {
            try {
              const parsed = JSON.parse(savedSession);
              currentAdmin = { ...parsed, ...json.user };
            } catch(e){}
          }
          initAdminApp();
          return;
        }
      } catch (e) {
        console.warn('[Admin Auth] Session verification network error:', e);
        // Fallback for temporary network glitch if token was cached
        if (token && savedSession) {
          try {
            currentAdmin = JSON.parse(savedSession);
            window.BREEZE_AUTH_TOKEN = token;
            initAdminApp();
            return;
          } catch(err){}
        }
      }

      // Invalid or expired token: clear credentials
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      localStorage.removeItem(ADMIN_SESSION_KEY);
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      window.BREEZE_AUTH_TOKEN = null;
      currentAdmin = null;
    }
  })();

  // --------------------------------------------------------------------------
  // COCKPIT APP CONTROLLER
  // --------------------------------------------------------------------------
  let heartbeatPollTimer = null;

  async function initAdminApp() {
    if (!currentAdmin) return;

    adminAuthView.style.display = 'none';
    adminAppView.style.display = 'block';
    adminHeaderActions.style.display = 'flex';
    
    // Update user identity & clean role subtitle display (strictly single Breeze Admin)
    if (dispAdminName) dispAdminName.textContent = 'Breeze Admin';
    if (dispAdminAvatar) dispAdminAvatar.textContent = 'BA';
    if (dispAdminRole) dispAdminRole.textContent = 'Admin Portal';

    // Role-based staff management button access
    if (btnStaffManagement) {
      if (currentAdmin.role === 'kitchen') {
        btnStaffManagement.style.display = 'none';
      } else {
        btnStaffManagement.style.display = 'inline-flex';
      }
    }

    // Fetch initial datasets
    await fetchAllData();

    // Start Supabase Realtime listeners
    setupSupabaseRealtimeChannels();

    // 15-second background heartbeat fallback in case WebSockets drop
    if (!heartbeatPollTimer) {
      heartbeatPollTimer = setInterval(async () => {
        if (!currentAdmin) return;
        await Promise.all([
          fetchOrders(),
          fetchCustomers(),
          fetchDeliveryPartners(),
          fetchRiderSettlements(),
          fetchTableReservations(),
          fetchAdminUsers()
        ]);
        updateKPISummaries();
        updateReservationKPISummaries();
        if (activeTab === 'orders' || activeTab === 'analytics' || activeTab === 'riders' || activeTab === 'reservations' || activeTab === 'customers') {
          renderCurrentTab();
        }
      }, 15000);
    }
  }

  let storeSettings = { is_store_open: true, closure_reason: '' };
  let storeSettingsChannel = null;

  async function fetchAllData() {
    if (refreshSpinner) refreshSpinner.classList.add('fa-spin');
    await Promise.all([
      fetchOrders(),
      fetchMenuItems(),
      fetchDeliveryPartners(),
      fetchStoreSettings(),
      fetchRiderSettlements(),
      fetchCustomers(),
      fetchTableReservations(),
      fetchAdminUsers()
    ]);
    if (refreshSpinner) refreshSpinner.classList.remove('fa-spin');
    populateAnalyticsPeriodDropdown();
    updateAnalyticsPillsUI();
    updateKPISummaries();
    updateReservationKPISummaries();
    renderCurrentTab();
  }

  if (btnRefreshAll) {
    btnRefreshAll.addEventListener('click', async () => {
      await fetchAllData();
      showAdminToast('Refreshed latest cloud data');
    });
  }

  // Analytics Toolbar Event Listeners
  if (analyticsPeriodSelect) {
    analyticsPeriodSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'all_time') {
        setAnalyticsPeriod('all_time');
      } else if (val === 'custom_range') {
        setAnalyticsPeriod('custom');
      } else if (val === getCurrentISTYearMonth()) {
        setAnalyticsPeriod('this_month');
      } else if (val === getLastMonthISTYearMonth()) {
        setAnalyticsPeriod('last_month');
      } else {
        setAnalyticsPeriod('month', val);
      }
    });
  }

  if (pillPeriodThisMonth) {
    pillPeriodThisMonth.addEventListener('click', () => {
      setAnalyticsPeriod('this_month');
    });
  }

  if (pillPeriodLastMonth) {
    pillPeriodLastMonth.addEventListener('click', () => {
      setAnalyticsPeriod('last_month');
    });
  }

  if (pillPeriodToday) {
    pillPeriodToday.addEventListener('click', () => {
      setAnalyticsPeriod('today');
    });
  }

  if (pillPeriodCustom) {
    pillPeriodCustom.addEventListener('click', () => {
      setAnalyticsPeriod('custom');
    });
  }

  if (pillPeriodAllTime) {
    pillPeriodAllTime.addEventListener('click', () => {
      setAnalyticsPeriod('all_time');
    });
  }

  if (btnApplyCustomRange) {
    btnApplyCustomRange.addEventListener('click', () => {
      const start = customStartDate ? customStartDate.value : '';
      const end = customEndDate ? customEndDate.value : '';
      if (!start || !end) {
        showAdminToast('⚠️ Please select both From and To dates');
        return;
      }
      if (start > end) {
        showAdminToast('⚠️ From date cannot be after To date');
        return;
      }
      setAnalyticsPeriod('custom', null, start, end);
      showAdminToast(`📅 Filter applied: ${start} to ${end}`);
    });
  }

  if (btnCancelCustomRange) {
    btnCancelCustomRange.addEventListener('click', () => {
      setAnalyticsPeriod('this_month');
    });
  }

  // Period Report Statement Modal Listeners
  if (btnOpenPeriodReportModal) {
    btnOpenPeriodReportModal.addEventListener('click', () => {
      openPeriodReportModal();
    });
  }

  const btnOpenPeriodReportModalAnalytics = document.getElementById('btnOpenPeriodReportModalAnalytics');
  if (btnOpenPeriodReportModalAnalytics) {
    btnOpenPeriodReportModalAnalytics.addEventListener('click', () => {
      openPeriodReportModal();
    });
  }

  document.querySelectorAll('.btn-period-report').forEach(btn => {
    btn.addEventListener('click', () => {
      openPeriodReportModal();
    });
  });

  if (btnClosePeriodReportModal) {
    btnClosePeriodReportModal.addEventListener('click', closePeriodReportModal);
  }

  if (btnPrintPeriodReport) {
    btnPrintPeriodReport.addEventListener('click', printPeriodReport);
  }

  if (btnExportPeriodCsv) {
    btnExportPeriodCsv.addEventListener('click', exportPeriodCsv);
  }

  if (periodReportModal) {
    periodReportModal.addEventListener('click', (e) => {
      if (e.target === periodReportModal) {
        closePeriodReportModal();
      }
    });
  }

  // --------------------------------------------------------------------------
  // DATA FETCHING (Supabase REST with resilient fallbacks)
  // --------------------------------------------------------------------------
  async function fetchOrders() {
    if (!supabaseClient) return;
    try {
      const { data, error } = await supabaseClient
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        if (allOrders.length > 0) {
          const freshNewOrders = data.filter(d => !allOrders.some(existing => existing.id === d.id));
          if (freshNewOrders.length > 0) {
            freshNewOrders.forEach(no => {
              const st = (no.status || 'placed').toLowerCase().trim();
              if (st === 'placed' || st === 'pending') {
                startAdminRinger(no.id, `₹${no.total_amount || 0}`);
              } else {
                playNewOrderChime();
              }
              showAdminToast(`🔔 New Order #${no.id} received! (₹${no.total_amount || 0})`);
            });
          }

          // Monotonic status reconciliation against local forward state:
          const existingMap = new Map(allOrders.map(o => [o.id, o]));
          const ranks = {
            'placed': 1, 'pending': 1,
            'accepted': 2, 'confirmed': 2, 'preparing': 2, 'cooking': 2,
            'food_ready': 3, 'ready': 3,
            'out_for_delivery': 4, 'dispatched': 4,
            'delivered': 5, 'completed': 5,
            'cancelled': 99, 'rejected': 99
          };
          data.forEach(incoming => {
            const existing = existingMap.get(incoming.id);
            if (existing && existing.status) {
              const curRank = ranks[String(existing.status).toLowerCase().trim()] || 0;
              const incRank = ranks[String(incoming.status).toLowerCase().trim()] || 0;
              if ((curRank === 99 && incRank < 99) || (curRank > incRank && incRank < 99 && curRank < 99)) {
                incoming.status = existing.status;
                if (existing.rider_id && !incoming.rider_id) incoming.rider_id = existing.rider_id;
                if (existing.rider_name && !incoming.rider_name) incoming.rider_name = existing.rider_name;
              }
            }
          });
        }
        allOrders = data;
      }
    } catch (err) {
      console.warn('fetchOrders error:', err);
    }
  }

  async function fetchMenuItems() {
    if (!supabaseClient) return;
    try {
      const { data, error } = await supabaseClient
        .from('menu_items')
        .select('*')
        .order('sort_order', { ascending: true });

      if (!error && Array.isArray(data)) {
        allMenuItems = data;
        try { localStorage.setItem('breeze_menu_items_cache', JSON.stringify(data)); } catch(e){}
      }
    } catch (err) {
      console.warn('fetchMenuItems error:', err);
    }
  }

  async function fetchDeliveryPartners() {
    if (!supabaseClient) return;
    try {
      const { data, error } = await supabaseClient
        .from('delivery_partners')
        .select('*')
        .order('id', { ascending: true });

      if (!error && Array.isArray(data)) {
        allRiders = data;
      }
    } catch (err) {
      console.warn('fetchDeliveryPartners error:', err);
    }
  }

  async function fetchRiderSettlements() {
    if (!supabaseClient) return;
    try {
      const { data, error } = await supabaseClient
        .from('rider_settlements')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        allSettlements = data;
      }
    } catch (err) {
      console.warn('fetchRiderSettlements error:', err);
    }
  }

  async function fetchCustomers() {
    // 1. Try Supabase Client
    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('customers')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          allCustomers = data;
          return;
        }
      } catch (err) {
        console.warn('fetchCustomers client error:', err);
      }
    }

    // 2. Direct high-speed REST fallback (bypasses SDK connection glitches)
    try {
      if (config.SUPABASE_URL && config.SUPABASE_ANON_KEY) {
        const res = await fetch(`${config.SUPABASE_URL}/rest/v1/customers?select=*&order=created_at.desc`, {
          headers: {
            'apikey': config.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${config.SUPABASE_ANON_KEY}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            allCustomers = data;
          }
        }
      }
    } catch (e) {
      console.warn('fetchCustomers REST error:', e);
    }
  }

  async function fetchTableReservations() {
    if (!supabaseClient) return;
    try {
      const { data, error } = await supabaseClient
        .from('table_reservations')
        .select('*')
        .order('reservation_date', { ascending: true })
        .order('time_slot', { ascending: true });

      if (error) {
        console.warn('fetchTableReservations error:', error.message);
        return;
      }
      allReservations = data || [];
      updateReservationKPISummaries();
      if (activeTab === 'reservations') {
        renderReservationsTab();
      }
    } catch (err) {
      console.warn('fetchTableReservations error:', err);
    }
  }

  async function fetchStoreSettings() {
    if (!supabaseClient) return;
    try {
      const { data, error } = await supabaseClient
        .from('store_settings')
        .select('*')
        .eq('id', 'breeze_main')
        .maybeSingle();

      if (!error && data) {
        storeSettings = data;
        updateStoreStatusUI();
      }
    } catch (err) {
      console.warn('fetchStoreSettings error:', err);
    }
  }

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

  function evaluateStoreOperatingStatus(settings) {
    const s = settings || storeSettings || {};
    const isManualOpen = s.is_store_open !== false;
    const autoSchedule = s.auto_schedule_enabled !== false;
    const openTimeStr = s.opening_time || '11:00';
    const closeTimeStr = s.closing_time || '23:00';
    const openMins = parseTimeToMinutes(openTimeStr, 11 * 60);
    const closeMins = parseTimeToMinutes(closeTimeStr, 23 * 60);

    const ist = getStoreISTTime();
    const curMins = ist.minutesFromMidnight;

    const openTime12 = formatMinutesTo12Hour(openMins);
    const closeTime12 = formatMinutesTo12Hour(closeMins);

    // 1. Manual Emergency Shutdown
    if (!isManualOpen) {
      return {
        isOpen: false,
        isEmergencyShutdown: true,
        isOffHours: false,
        reason: s.closure_reason || 'Store is temporarily closed for online ordering.',
        openTime12,
        closeTime12
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
          closeTime12
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
      closeTime12
    };
  }

  function updateStoreStatusUI() {
    if (!btnToggleStoreStatus) return;
    const status = evaluateStoreOperatingStatus(storeSettings);

    if (status.isEmergencyShutdown) {
      btnToggleStoreStatus.className = 'btn-store-status closed';
      if (dispStoreStatusText) dispStoreStatusText.textContent = 'Store: SHUT (Manual)';
      if (adminStoreClosedBanner) {
        adminStoreClosedBanner.className = 'admin-emergency-banner';
        adminStoreClosedBanner.style.display = 'flex';
        const strongEl = adminStoreClosedBanner.querySelector('strong');
        if (strongEl) strongEl.textContent = 'EMERGENCY STORE SHUTDOWN ACTIVE:';
      }
      if (dispAdminClosureReason) {
        dispAdminClosureReason.textContent = status.reason;
      }
      if (btnQuickReopenStore) {
        btnQuickReopenStore.style.display = 'inline-flex';
        btnQuickReopenStore.innerHTML = '<i class="fas fa-play"></i> Reopen Store Now';
      }
    } else if (status.isOffHours) {
      btnToggleStoreStatus.className = 'btn-store-status off-hours';
      if (dispStoreStatusText) dispStoreStatusText.textContent = 'Store: CLOSED (Off Hours)';
      if (adminStoreClosedBanner) {
        adminStoreClosedBanner.className = 'admin-emergency-banner off-hours';
        adminStoreClosedBanner.style.display = 'flex';
        const strongEl = adminStoreClosedBanner.querySelector('strong');
        if (strongEl) strongEl.textContent = '🌙 OFF-HOURS STORE CLOSURE:';
      }
      if (dispAdminClosureReason) {
        dispAdminClosureReason.textContent = `Online ordering is automatically paused until ${status.openTime12} (Operating hours: ${status.openTime12} – ${status.closeTime12} IST).`;
      }
      if (btnQuickReopenStore) {
        btnQuickReopenStore.style.display = 'inline-flex';
        btnQuickReopenStore.innerHTML = '<i class="fas fa-sliders-h"></i> Adjust Schedule / Override';
      }
    } else {
      btnToggleStoreStatus.className = 'btn-store-status open';
      if (dispStoreStatusText) {
        dispStoreStatusText.textContent = storeSettings.auto_schedule_enabled !== false ? 'Store: OPEN (Auto)' : 'Store: OPEN';
      }
      if (adminStoreClosedBanner) adminStoreClosedBanner.style.display = 'none';
    }
  }

  // --------------------------------------------------------------------------
  // SUPABASE REALTIME SUBSCRIPTIONS
  // --------------------------------------------------------------------------
  function setupSupabaseRealtimeChannels() {
    if (!supabaseClient || !supabaseClient.channel) return;

    try {
      // 1. ORDERS REALTIME
      ordersChannel = supabaseClient.channel('admin-orders-stream')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
          handleOrderRealtimeEvent(payload);
        })
        .subscribe();

      // 2. DELIVERY PARTNERS REALTIME
      ridersChannel = supabaseClient.channel('admin-riders-stream')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_partners' }, (payload) => {
          handleRiderRealtimeEvent(payload);
        })
        .subscribe();

      // 3. MENU ITEMS REALTIME
      menuChannel = supabaseClient.channel('admin-menu-stream')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, (payload) => {
          handleMenuRealtimeEvent(payload);
        })
        .subscribe();

      // 4. STORE SETTINGS REALTIME (EMERGENCY SHUTDOWN SYNC)
      storeSettingsChannel = supabaseClient.channel('admin-store-settings-stream')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'store_settings' }, (payload) => {
          if (payload && payload.new) {
            storeSettings = payload.new;
            updateStoreStatusUI();
          }
        })
        .subscribe();

      // 5. RIDER SETTLEMENTS REALTIME
      supabaseClient.channel('admin-settlements-stream')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_settlements' }, (payload) => {
          if (!payload) return;
          if (payload.eventType === 'INSERT' && payload.new) {
            allSettlements.unshift(payload.new);
            updateKPISummaries();
            if (activeTab === 'riders') renderRidersTab();
          } else if (payload.eventType === 'DELETE') {
            if (payload.old) {
              allSettlements = allSettlements.filter(s => s.id !== payload.old.id);
            } else {
              allSettlements = [];
            }
            updateKPISummaries();
            if (activeTab === 'riders') renderRidersTab();
          }
        })
        .subscribe();

      // 6. CUSTOMERS CRM REALTIME
      customersChannel = supabaseClient.channel('admin-customers-stream')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, (payload) => {
          handleCustomerRealtimeEvent(payload);
        })
        .subscribe();

      // 7. TABLE RESERVATIONS REALTIME
      reservationsChannel = supabaseClient.channel('admin-reservations-stream')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'table_reservations' }, (payload) => {
          handleReservationRealtimeEvent(payload);
        })
        .subscribe();

      // 8. ADMIN USERS REALTIME
      adminUsersChannel = supabaseClient.channel('admin-users-stream')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_users' }, (payload) => {
          handleAdminUserRealtimeEvent(payload);
        })
        .subscribe();

      console.log('✓ [Breeze Admin] Subscribed to orders, riders, menu, settlements, customers, reservations, store operating, and admin users channels.');
    } catch (err) {
      console.warn('Realtime subscription error:', err);
    }
  }

  function handleReservationRealtimeEvent(payload) {
    if (!payload) return;
    const { eventType, new: newRow, old: oldRow } = payload;

    if (eventType === 'INSERT' && newRow) {
      if (!allReservations.some(r => r.id === newRow.id)) {
        allReservations.unshift(newRow);
        playNewOrderChime();
        showAdminToast(`🛎️ New Table Reservation: ${newRow.guest_name} (${newRow.guest_count} guests)!`, true);
        updateReservationKPISummaries();
        if (activeTab === 'reservations') renderReservationsTab();
      }
    } else if (eventType === 'UPDATE' && newRow) {
      const idx = allReservations.findIndex(r => r.id === newRow.id);
      if (idx !== -1) {
        allReservations[idx] = Object.assign({}, allReservations[idx], newRow);
      } else {
        allReservations.unshift(newRow);
      }
      updateReservationKPISummaries();
      if (activeTab === 'reservations') renderReservationsTab();
    } else if (eventType === 'DELETE' && oldRow) {
      allReservations = allReservations.filter(r => r.id !== oldRow.id);
      updateReservationKPISummaries();
      if (activeTab === 'reservations') renderReservationsTab();
    }
  }

  function handleOrderRealtimeEvent(payload) {
    if (!payload) return;
    const { eventType, new: newRow, old: oldRow } = payload;

    const isNew = (eventType === 'INSERT' || eventType === 'UPSERT') || (eventType === 'UPDATE' && newRow && !allOrders.some(o => o.id === newRow.id));

    if (isNew && newRow) {
      if (!allOrders.some(o => o.id === newRow.id)) {
        allOrders.unshift(newRow);
        const st = (newRow.status || 'placed').toLowerCase().trim();
        if (st === 'placed' || st === 'pending') {
          startAdminRinger(newRow.id, `₹${newRow.total_amount || 0}`);
        } else {
          playNewOrderChime();
        }
        showAdminToast(`🔔 New Order #${newRow.id} received! (₹${newRow.total_amount || 0})`);
      }
    } else if (eventType === 'UPDATE' && newRow) {
      const idx = allOrders.findIndex(o => o.id === newRow.id);
      if (idx !== -1) {
        const existingStatus = allOrders[idx].status;
        const newStatus = newRow.status;
        const ranks = {
          'placed': 1, 'pending': 1,
          'accepted': 2, 'confirmed': 2, 'preparing': 2, 'cooking': 2,
          'food_ready': 3, 'ready': 3,
          'out_for_delivery': 4, 'dispatched': 4,
          'delivered': 5, 'completed': 5,
          'cancelled': 99, 'rejected': 99
        };
        const curRank = ranks[existingStatus] || 0;
        const incomingRank = ranks[newStatus] || 0;
        if ((curRank === 99 && incomingRank < 99) || (incomingRank > 0 && incomingRank < curRank && newStatus !== 'cancelled' && newStatus !== 'rejected')) {
          console.warn(`[Admin Realtime] Blocked status regression for #${newRow.id}: ${existingStatus} -> ${newStatus}`);
          newRow.status = existingStatus;
        }
        allOrders[idx] = Object.assign({}, allOrders[idx], newRow);
      } else {
        allOrders.unshift(newRow);
      }
      const st = (newRow.status || '').toLowerCase().trim();
      if (st && st !== 'placed' && st !== 'pending') {
        stopAdminRinger(newRow.id);
      }
    } else if (eventType === 'DELETE' && oldRow) {
      allOrders = allOrders.filter(o => o.id !== oldRow.id);
      stopAdminRinger(oldRow.id);
    }

    updateKPISummaries();
    if (activeTab === 'orders' || activeTab === 'analytics' || activeTab === 'riders' || activeTab === 'customers') {
      renderCurrentTab();
    }
  }

  function handleCustomerRealtimeEvent(payload) {
    if (!payload) return;
    const { eventType, new: newRow, old: oldRow } = payload;
    if (eventType === 'INSERT' && newRow) {
      if (!allCustomers.some(c => c.id === newRow.id)) {
        allCustomers.unshift(newRow);
      }
    } else if (eventType === 'UPDATE' && newRow) {
      const idx = allCustomers.findIndex(c => c.id === newRow.id);
      if (idx !== -1) {
        allCustomers[idx] = Object.assign({}, allCustomers[idx], newRow);
      } else {
        allCustomers.unshift(newRow);
      }
    } else if (eventType === 'DELETE' && oldRow) {
      allCustomers = allCustomers.filter(c => c.id !== oldRow.id);
    }
    if (activeTab === 'customers') {
      renderCustomersTab();
    }
  }

  function handleRiderRealtimeEvent(payload) {
    if (!payload) return;
    const { eventType, new: newRow, old: oldRow } = payload;
    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      const idx = allRiders.findIndex(r => r.id === newRow.id);
      if (idx !== -1) {
        allRiders[idx] = Object.assign({}, allRiders[idx], newRow);
      } else {
        allRiders.push(newRow);
      }
    } else if (eventType === 'DELETE' && oldRow) {
      allRiders = allRiders.filter(r => r.id !== oldRow.id);
    }
    updateKPISummaries();
    if (activeTab === 'riders' || activeAssignOrder) {
      renderRidersTab();
      if (activeAssignOrder) renderAssignRiderList();
    }
  }

  function handleMenuRealtimeEvent(payload) {
    if (!payload) return;
    const { eventType, new: newRow } = payload;
    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      const idx = allMenuItems.findIndex(m => m.id === newRow.id);
      if (idx !== -1) {
        allMenuItems[idx] = Object.assign({}, allMenuItems[idx], newRow);
      } else {
        allMenuItems.push(newRow);
      }
    }
    updateKPISummaries();
    if (activeTab === 'menu') {
      renderMenuTab();
    }
  }

  // --------------------------------------------------------------------------
  // UTILITIES: ORDER ITEMS PARSER & IST TIMEZONE
  // --------------------------------------------------------------------------
  function parseOrderItems(rawItems) {
    if (Array.isArray(rawItems)) return rawItems;
    if (typeof rawItems === 'string') {
      try {
        const parsed = JSON.parse(rawItems);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  function getTodayISTString() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  }

  function getOrderISTDateString(dateStr) {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    } catch (e) {
      return '';
    }
  }

  function getCurrentISTYearMonth() {
    return getTodayISTString().slice(0, 7); // 'YYYY-MM'
  }

  function getLastMonthISTYearMonth() {
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    nowIST.setDate(1);
    nowIST.setMonth(nowIST.getMonth() - 1);
    const y = nowIST.getFullYear();
    const m = String(nowIST.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  function getActivePeriodLabel() {
    if (activeAnalyticsPeriod.mode === 'today') {
      return `Today (${getTodayISTString()})`;
    }
    if (activeAnalyticsPeriod.mode === 'all_time') {
      return 'Lifetime (All-Time)';
    }
    if (activeAnalyticsPeriod.mode === 'last_month') {
      return `Last Month (${formatMonthName(getLastMonthISTYearMonth())})`;
    }
    if (activeAnalyticsPeriod.mode === 'custom') {
      if (activeAnalyticsPeriod.startDate && activeAnalyticsPeriod.endDate) {
        return `${activeAnalyticsPeriod.startDate} to ${activeAnalyticsPeriod.endDate}`;
      }
      return 'Custom Date Range';
    }
    const ym = activeAnalyticsPeriod.yearMonth || getCurrentISTYearMonth();
    return formatMonthName(ym);
  }

  function formatMonthName(yearMonth) {
    if (!yearMonth) return '';
    try {
      const parts = yearMonth.split('-');
      if (parts.length < 2) return yearMonth;
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const d = new Date(year, month - 1, 1);
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch (e) {
      return yearMonth;
    }
  }

  function isRecordInActivePeriod(createdAt) {
    if (!createdAt) return false;
    const dateIST = getOrderISTDateString(createdAt);
    if (!dateIST) return false;

    if (activeAnalyticsPeriod.mode === 'all_time') {
      return true;
    }
    if (activeAnalyticsPeriod.mode === 'today') {
      return dateIST === getTodayISTString();
    }
    if (activeAnalyticsPeriod.mode === 'last_month') {
      return dateIST.slice(0, 7) === getLastMonthISTYearMonth();
    }
    if (activeAnalyticsPeriod.mode === 'custom') {
      const { startDate, endDate } = activeAnalyticsPeriod;
      if (startDate && endDate) {
        return dateIST >= startDate && dateIST <= endDate;
      }
      if (startDate) return dateIST >= startDate;
      if (endDate) return dateIST <= endDate;
      return true;
    }
    // Monthly mode (either 'this_month' or specific 'YYYY-MM')
    const targetYm = activeAnalyticsPeriod.yearMonth || getCurrentISTYearMonth();
    return dateIST.slice(0, 7) === targetYm;
  }

  function populateAnalyticsPeriodDropdown() {
    if (!analyticsPeriodSelect) return;

    const currentYm = getCurrentISTYearMonth();
    const lastMonthYm = getLastMonthISTYearMonth();

    // Dynamically generate the past 12 calendar months in IST so admin can pick ANY month
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const calendarMonths = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(nowIST.getFullYear(), nowIST.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      calendarMonths.push(`${y}-${m}`);
    }

    const availableMonths = new Set(calendarMonths);

    // Also include any historical months found in existing DB orders or settlements
    allOrders.forEach(o => {
      const dt = getOrderISTDateString(o.created_at);
      if (dt) availableMonths.add(dt.slice(0, 7));
    });

    allSettlements.forEach(s => {
      const dt = getOrderISTDateString(s.created_at);
      if (dt) availableMonths.add(dt.slice(0, 7));
    });

    const sortedMonths = Array.from(availableMonths).sort().reverse();

    let optionsHtml = '';
    sortedMonths.forEach(ym => {
      const isCurrent = ym === currentYm;
      const isLast = ym === lastMonthYm;
      let label = formatMonthName(ym);
      if (isCurrent) {
        label = `This Month (${label})`;
      } else if (isLast) {
        label = `Last Month (${label})`;
      }
      optionsHtml += `<option value="${ym}">${label}</option>`;
    });

    optionsHtml += `<option value="custom_range">📅 Custom Date Range...</option>`;
    optionsHtml += `<option value="all_time">🌐 All-Time (Lifetime Totals)</option>`;

    analyticsPeriodSelect.innerHTML = optionsHtml;

    if (activeAnalyticsPeriod.mode === 'all_time') {
      analyticsPeriodSelect.value = 'all_time';
    } else if (activeAnalyticsPeriod.mode === 'custom') {
      analyticsPeriodSelect.value = 'custom_range';
    } else if (activeAnalyticsPeriod.mode === 'last_month') {
      analyticsPeriodSelect.value = lastMonthYm;
    } else {
      analyticsPeriodSelect.value = activeAnalyticsPeriod.yearMonth || currentYm;
    }
  }

  function updateAnalyticsPillsUI() {
    const mode = activeAnalyticsPeriod.mode;
    if (pillPeriodThisMonth) pillPeriodThisMonth.classList.toggle('active', mode === 'this_month');
    if (pillPeriodLastMonth) pillPeriodLastMonth.classList.toggle('active', mode === 'last_month');
    if (pillPeriodToday) pillPeriodToday.classList.toggle('active', mode === 'today');
    if (pillPeriodCustom) pillPeriodCustom.classList.toggle('active', mode === 'custom');
    if (pillPeriodAllTime) pillPeriodAllTime.classList.toggle('active', mode === 'all_time');

    if (customDateRangeWrap) {
      if (mode === 'custom') {
        customDateRangeWrap.style.display = 'block';
        if (customStartDate && !customStartDate.value) {
          const firstOfMonth = `${getCurrentISTYearMonth()}-01`;
          customStartDate.value = firstOfMonth;
        }
        if (customEndDate && !customEndDate.value) {
          customEndDate.value = getTodayISTString();
        }
        if (customRangeFeedback) {
          if (activeAnalyticsPeriod.startDate && activeAnalyticsPeriod.endDate) {
            customRangeFeedback.textContent = `Applied: ${activeAnalyticsPeriod.startDate} to ${activeAnalyticsPeriod.endDate}`;
          } else {
            customRangeFeedback.textContent = 'Select dates and click Apply';
          }
        }
      } else {
        customDateRangeWrap.style.display = 'none';
        if (customRangeFeedback) customRangeFeedback.textContent = '';
      }
    }
  }

  function setAnalyticsPeriod(newMode, customYm = null, customStart = null, customEnd = null) {
    activeAnalyticsPeriod.mode = newMode;
    const currentYm = getCurrentISTYearMonth();
    const lastMonthYm = getLastMonthISTYearMonth();

    if (newMode === 'this_month') {
      activeAnalyticsPeriod.yearMonth = currentYm;
      activeAnalyticsPeriod.startDate = '';
      activeAnalyticsPeriod.endDate = '';
    } else if (newMode === 'last_month') {
      activeAnalyticsPeriod.yearMonth = lastMonthYm;
      activeAnalyticsPeriod.startDate = '';
      activeAnalyticsPeriod.endDate = '';
    } else if (newMode === 'month') {
      activeAnalyticsPeriod.yearMonth = customYm || currentYm;
      activeAnalyticsPeriod.startDate = '';
      activeAnalyticsPeriod.endDate = '';
    } else if (newMode === 'today') {
      activeAnalyticsPeriod.yearMonth = currentYm;
      activeAnalyticsPeriod.startDate = '';
      activeAnalyticsPeriod.endDate = '';
    } else if (newMode === 'custom') {
      activeAnalyticsPeriod.yearMonth = '';
      activeAnalyticsPeriod.startDate = customStart || activeAnalyticsPeriod.startDate || `${currentYm}-01`;
      activeAnalyticsPeriod.endDate = customEnd || activeAnalyticsPeriod.endDate || getTodayISTString();
    } else if (newMode === 'all_time') {
      activeAnalyticsPeriod.yearMonth = '';
      activeAnalyticsPeriod.startDate = '';
      activeAnalyticsPeriod.endDate = '';
    }

    if (analyticsPeriodSelect) {
      if (newMode === 'all_time') {
        analyticsPeriodSelect.value = 'all_time';
      } else if (newMode === 'custom') {
        analyticsPeriodSelect.value = 'custom_range';
      } else if (newMode === 'last_month') {
        analyticsPeriodSelect.value = lastMonthYm;
      } else {
        analyticsPeriodSelect.value = activeAnalyticsPeriod.yearMonth || currentYm;
      }
    }

    updateAnalyticsPillsUI();
    updateKPISummaries();
    if (activeTab === 'orders') renderOrdersTab();
    if (activeTab === 'riders') renderRidersTab();
    if (activeTab === 'analytics') renderAnalyticsTab();
    if (periodReportModal && periodReportModal.style.display === 'flex') {
      renderPeriodReport();
    }
  }

  // --------------------------------------------------------------------------
  // KPI CALCULATIONS & RENDERING (MONTHLY & PERIOD SCOPED)
  // --------------------------------------------------------------------------
  function updateKPISummaries() {
    const todayIST = getTodayISTString();
    const currentYm = getCurrentISTYearMonth();
    if (!activeAnalyticsPeriod.yearMonth && activeAnalyticsPeriod.mode !== 'all_time') {
      activeAnalyticsPeriod.yearMonth = currentYm;
    }

    // Dynamic Title for KPI Cards
    const periodName = getActivePeriodLabel();
    if (kpiRevenueTitle) kpiRevenueTitle.textContent = `${periodName} Revenue`;
    if (kpiOrdersTitle) kpiOrdersTitle.textContent = `${periodName} Orders`;

    let periodRev = 0;
    let periodCodRev = 0;
    let periodOnlineRev = 0;
    let periodOrdersCount = 0;
    let periodDeliveredCount = 0;
    let periodCodCount = 0;
    let periodOnlineCount = 0;
    let periodActiveOrdersCount = 0;

    let todayRev = 0;
    let todayOrdersCount = 0;
    let activeKitchenCount = 0;
    let activeDeliveryCount = 0;

    allOrders.forEach(ord => {
      const amt = Number(ord.total_amount) || 0;
      const isDelivered = ord.status === 'delivered';
      const isCancelled = ord.status === 'cancelled';
      const orderDateIST = getOrderISTDateString(ord.created_at);
      const isToday = orderDateIST === todayIST;
      const inPeriod = isRecordInActivePeriod(ord.created_at);

      if (isToday) {
        todayOrdersCount++;
        if (!isCancelled) todayRev += amt;
      }

      if (['placed', 'accepted', 'preparing', 'cooking', 'confirmed', 'food_ready'].includes(ord.status)) {
        activeKitchenCount++;
      }
      if (['out_for_delivery', 'dispatched'].includes(ord.status)) {
        activeDeliveryCount++;
      }

      if (inPeriod) {
        periodOrdersCount++;
        if (['placed', 'accepted', 'preparing', 'cooking', 'confirmed', 'food_ready', 'out_for_delivery', 'dispatched'].includes(ord.status)) {
          periodActiveOrdersCount++;
        }
        if (!isCancelled) {
          periodRev += amt;
          if (ord.payment_method === 'cod') {
            periodCodRev += amt;
            periodCodCount++;
          } else {
            periodOnlineRev += amt;
            periodOnlineCount++;
          }
        }
        if (isDelivered) {
          periodDeliveredCount++;
        }
      }
    });

    const totalActiveOrders = activeKitchenCount + activeDeliveryCount;
    const aov = periodOrdersCount > 0 ? Math.round(periodRev / periodOrdersCount) : 0;
    const isCurrentPeriod = (activeAnalyticsPeriod.mode === 'today' || activeAnalyticsPeriod.mode === 'this_month' || activeAnalyticsPeriod.mode === 'all_time' || (activeAnalyticsPeriod.mode === 'month' && activeAnalyticsPeriod.yearMonth === getCurrentISTYearMonth()));

    // Menu stock calculations
    const totalDishes = allMenuItems.length;
    const soldOutDishes = allMenuItems.filter(i => i.is_available === false).length;
    const inStockDishes = totalDishes - soldOutDishes;

    // Update DOM
    if (kpiTotalRevenue) kpiTotalRevenue.textContent = '₹' + periodRev.toLocaleString('en-IN');
    if (kpiTodayRevenue) kpiTodayRevenue.textContent = `Today: ₹${todayRev.toLocaleString('en-IN')}`;
    if (kpiCodVsOnlineSplit) {
      const totalP = periodCodCount + periodOnlineCount;
      const codPct = totalP > 0 ? Math.round((periodCodCount / totalP) * 100) : 0;
      const onlinePct = totalP > 0 ? (100 - codPct) : 0;
      kpiCodVsOnlineSplit.textContent = totalP > 0 ? `COD: ${codPct}% • Online: ${onlinePct}%` : 'COD: 0% • Online: 0%';
    }

    if (kpiTotalOrders) kpiTotalOrders.textContent = periodOrdersCount;
    if (kpiTodayOrders) kpiTodayOrders.textContent = `Today: ${todayOrdersCount} orders`;
    if (kpiDeliveredCount) kpiDeliveredCount.textContent = `${periodDeliveredCount} Completed`;

    if (kpiAovValue) kpiAovValue.textContent = '₹' + aov.toLocaleString('en-IN');

    if (kpiActiveTitle) {
      kpiActiveTitle.textContent = isCurrentPeriod ? 'Active Orders' : 'Active (Period)';
    }

    if (kpiActiveOrders) {
      const activeVal = isCurrentPeriod ? totalActiveOrders : periodActiveOrdersCount;
      kpiActiveOrders.textContent = activeVal;
      kpiActiveOrders.style.color = activeVal > 0 ? '#dc2626' : '#16a34a';
    }

    if (kpiActiveBreakdown) {
      if (isCurrentPeriod) {
        kpiActiveBreakdown.textContent = `${activeKitchenCount} Kitchen • ${activeDeliveryCount} Delivery`;
      } else {
        kpiActiveBreakdown.textContent = periodActiveOrdersCount === 0 ? 'Period Closed • 0 Active' : `${periodActiveOrdersCount} Unfulfilled in Period`;
      }
    }

    if (kpiActiveBadge) {
      if (isCurrentPeriod) {
        kpiActiveBadge.className = 'kpi-badge green';
        kpiActiveBadge.textContent = 'Live Orders';
      } else {
        kpiActiveBadge.className = 'kpi-badge gold';
        kpiActiveBadge.textContent = 'Historical';
      }
    }

    if (kpiMenuTotalDishes) kpiMenuTotalDishes.textContent = totalDishes;
    if (kpiInStockDishes) kpiInStockDishes.textContent = `${inStockDishes} In Stock`;
    if (kpiSoldOutDishes) {
      kpiSoldOutDishes.textContent = `${soldOutDishes} Sold Out`;
      kpiSoldOutDishes.style.display = soldOutDishes > 0 ? 'inline-block' : 'none';
    }

    // Tab Badges
    if (badgeOrdersCount) badgeOrdersCount.textContent = totalActiveOrders;
    if (badgeMenuSoldOut) {
      badgeMenuSoldOut.textContent = soldOutDishes;
      badgeMenuSoldOut.style.background = soldOutDishes > 0 ? '#ef4444' : 'rgba(0,0,0,0.1)';
      badgeMenuSoldOut.style.color = soldOutDishes > 0 ? '#ffffff' : 'inherit';
    }
    if (badgeRidersCount) {
      const availCount = allRiders.filter(r => r.status === 'available').length;
      badgeRidersCount.textContent = availCount;
    }
    if (badgeCustomersCount) {
      badgeCustomersCount.textContent = allCustomers ? allCustomers.length : 0;
    }
  }

  // --------------------------------------------------------------------------
  // TAB NAVIGATION
  // --------------------------------------------------------------------------
  const tabButtons = [
    { btn: tabBtnOrders, pane: tabOrdersContent, id: 'orders' },
    { btn: tabBtnReservations, pane: tabReservationsContent, id: 'reservations' },
    { btn: tabBtnMenu, pane: tabMenuContent, id: 'menu' },
    { btn: tabBtnRiders, pane: tabRidersContent, id: 'riders' },
    { btn: tabBtnCustomers, pane: tabCustomersContent, id: 'customers' },
    { btn: tabBtnAnalytics, pane: tabAnalyticsContent, id: 'analytics' }
  ];

  tabButtons.forEach(t => {
    if (t.btn) {
      t.btn.addEventListener('click', () => {
        switchTab(t.id);
      });
    }
  });

  function switchTab(targetTabId) {
    activeTab = targetTabId;
    tabButtons.forEach(t => {
      const isTarget = t.id === targetTabId;
      if (t.btn) t.btn.classList.toggle('active', isTarget);
      if (t.pane) t.pane.style.display = isTarget ? 'block' : 'none';
    });
    renderCurrentTab();
  }

  function renderCurrentTab() {
    if (activeTab === 'orders') renderOrdersTab();
    else if (activeTab === 'reservations') renderReservationsTab();
    else if (activeTab === 'menu') renderMenuTab();
    else if (activeTab === 'riders') renderRidersTab();
    else if (activeTab === 'customers') renderCustomersTab();
    else if (activeTab === 'analytics') renderAnalyticsTab();
  }

  // --------------------------------------------------------------------------
  // TAB 1: LIVE ORDERS COCKPIT RENDERING & ACTIONS
  // --------------------------------------------------------------------------
  if (orderStatusFilters) {
    orderStatusFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('.pill-filter-btn');
      if (!btn) return;
      orderStatusFilters.querySelectorAll('.pill-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      orderStatusFilter = btn.dataset.status || 'all';
      renderOrdersTab();
    });
  }

  if (orderSearchInput) {
    orderSearchInput.addEventListener('input', () => {
      orderSearchQuery = orderSearchInput.value.trim().toLowerCase();
      renderOrdersTab();
    });
  }

  if (orderPaymentFilterSelect) {
    orderPaymentFilterSelect.addEventListener('change', () => {
      orderPaymentFilter = orderPaymentFilterSelect.value;
      renderOrdersTab();
    });
  }

  function renderOrdersTab() {
    if (!ordersGridContainer) return;

    // Filter orders
    const filtered = allOrders.filter(ord => {
      // 0. Active Analytics Period Filter (Synchronizes Orders Cockpit with global period toolbar)
      if (!isRecordInActivePeriod(ord.created_at)) return false;

      // 1. Status Filter
      if (orderStatusFilter !== 'all') {
        if (orderStatusFilter === 'in_kitchen') {
          if (!['accepted', 'preparing', 'cooking', 'confirmed'].includes(ord.status)) return false;
        } else if (orderStatusFilter === 'out_for_delivery') {
          if (!['out_for_delivery', 'dispatched'].includes(ord.status)) return false;
        } else if (ord.status !== orderStatusFilter) {
          return false;
        }
      }

      // 2. Payment Filter
      if (orderPaymentFilter !== 'all') {
        if (orderPaymentFilter === 'cod' && ord.payment_method !== 'cod') return false;
        if (orderPaymentFilter === 'online' && ord.payment_method === 'cod') return false;
      }

      // 3. Search Query
      if (orderSearchQuery) {
        const idMatch = (ord.id || '').toLowerCase().includes(orderSearchQuery);
        const nameMatch = (ord.customer_name || '').toLowerCase().includes(orderSearchQuery);
        const phoneMatch = (ord.customer_phone || '').toLowerCase().includes(orderSearchQuery);
        const riderMatch = (ord.rider_name || '').toLowerCase().includes(orderSearchQuery);
        if (!idMatch && !nameMatch && !phoneMatch && !riderMatch) return false;
      }

      return true;
    });

    if (filtered.length === 0) {
      ordersGridContainer.innerHTML = '';
      if (ordersEmptyState) ordersEmptyState.style.display = 'block';
      return;
    }

    if (ordersEmptyState) ordersEmptyState.style.display = 'none';

    let html = '';
    filtered.forEach(order => {
      html += buildOrderCardHtml(order);
    });
    ordersGridContainer.innerHTML = html;

    // Attach card event listeners
    attachOrderCardListeners();
  }

  function formatRelativeTime(dateStr) {
    if (!dateStr) return 'Recently';
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 min ago';
    if (diffMins < 60) return `${diffMins} mins ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    return new Date(dateStr).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function isDeliveryOrder(order) {
    if (!order) return true;
    const t = String(order.order_type || '').toLowerCase();
    if (t.includes('takeaway') || t.includes('pickup') || t.includes('counter') || t.includes('dine')) {
      return false;
    }
    return true;
  }

  function buildOrderCardHtml(order) {
    const status = order.status || 'placed';
    const isCod = order.payment_method === 'cod';
    const total = Number(order.total_amount) || 0;
    const items = parseOrderItems(order.items);
    const orderTypeStr = (order.order_type || '').toLowerCase();
    const isTakeaway = !isDeliveryOrder(order);

    // Status label formatting
    let statusLabel = 'New Placed';
    let statusClass = 'placed';
    if (['accepted', 'preparing', 'cooking', 'confirmed'].includes(status)) {
      statusLabel = 'In Kitchen';
      statusClass = 'accepted';
    } else if (status === 'food_ready') {
      statusLabel = isTakeaway ? 'Ready for Pickup' : (order.rider_id ? 'Rider Assigned' : 'Food Ready');
      statusClass = 'food_ready';
    } else if (['out_for_delivery', 'dispatched'].includes(status)) {
      statusLabel = 'On Delivery';
      statusClass = 'out_for_delivery';
    } else if (status === 'delivered') {
      statusLabel = 'Delivered';
      statusClass = 'delivered';
    } else if (status === 'cancelled') {
      statusLabel = 'Cancelled';
      statusClass = 'cancelled';
    }

    // Items list table
    let itemsHtml = '';
    items.forEach(it => {
      const itPrice = (Number(it.price) || 0) * (Number(it.qty) || 1);
      itemsHtml += `
        <tr>
          <td style="width: 32px;"><span class="item-qty-pill">${it.qty || 1}x</span></td>
          <td class="item-name-cell">${escapeHtml(it.name || 'Dish')}</td>
          <td class="item-amt-cell">₹${itPrice}</td>
        </tr>
      `;
    });

    // Rider strip if assigned
    let riderStrip = '';
    const isDelivered = ['delivered', 'completed'].includes(status);
    const isCancelled = status === 'cancelled' || status === 'rejected';

    if (isTakeaway) {
      riderStrip = `
        <div style="background: ${isDelivered ? '#f0fdf4' : '#fef3c7'}; border: 1px solid ${isDelivered ? '#bbf7d0' : '#fde68a'}; border-radius: 8px; padding: 7px 12px; font-size: 0.78rem; color: ${isDelivered ? '#166534' : '#92400e'}; display: flex; align-items: center; gap: 8px; margin-top: 8px;">
          <i class="fas ${isDelivered ? 'fa-check-circle' : 'fa-bag-shopping'}" style="color: ${isDelivered ? '#16a34a' : '#d97706'}; font-size: 0.95rem;"></i>
          <span><strong>${isDelivered ? 'Collected at Rooftop Counter' : 'Counter Pickup / Takeaway'}:</strong> ${isDelivered ? 'Customer collected their food from the 5th floor rooftop counter.' : 'Customer will collect directly at the 5th floor rooftop counter. No delivery rider needed.'}</span>
        </div>
      `;
    } else if (order.rider_id || order.rider_name) {
      const isDispatched = ['out_for_delivery', 'dispatched'].includes(status);
      
      if (isDelivered) {
        riderStrip = `
          <div class="rider-assigned-box" style="background: #f0fdf4; border-color: #bbf7d0;">
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <i class="fas fa-check-circle" style="color: #16a34a;"></i> 
              <span style="font-weight: 700; color: #166534;">Delivered by:</span> 
              <strong>${escapeHtml(order.rider_name || order.rider_id)}</strong>
              ${order.rider_phone ? `(<a href="tel:${order.rider_phone}" style="color: inherit; text-decoration: underline;">${order.rider_phone}</a>)` : ''}
              <span style="font-size: 0.7rem; font-weight: 700; padding: 1px 6px; border-radius: 4px; margin-left: 4px; background: #dcfce7; color: #15803d;">
                Delivered
              </span>
            </div>
          </div>
        `;
      } else {
        riderStrip = `
          <div class="rider-assigned-box" style="background: ${isDispatched ? '#f0f9ff' : '#fefce8'}; border-color: ${isDispatched ? '#bae6fd' : '#fde047'};">
            <div>
              <i class="fas fa-motorcycle" style="color: ${isDispatched ? '#0284c7' : '#ca8a04'};"></i> 
              <span style="font-weight: 700; color: ${isDispatched ? '#0369a1' : '#854d0e'};">${isDispatched ? 'Out with' : 'Assigned to'}:</span> 
              <strong>${escapeHtml(order.rider_name || order.rider_id)}</strong>
              ${order.rider_phone ? `(<a href="tel:${order.rider_phone}" style="color: inherit; text-decoration: underline;">${order.rider_phone}</a>)` : ''}
              <span style="font-size: 0.7rem; font-weight: 700; padding: 1px 6px; border-radius: 4px; margin-left: 4px; background: ${isDispatched ? '#e0f2fe' : '#fef08a'}; color: ${isDispatched ? '#0369a1' : '#713f12'};">
                ${isDispatched ? 'In Transit' : 'At Cafe Counter'}
              </span>
            </div>
            ${!isDispatched ? `
              <button type="button" class="btn-action-outline btn-reassign-rider" data-id="${order.id}" style="padding: 3px 8px; font-size: 0.74rem;">
                Change
              </button>
            ` : ''}
          </div>
        `;
      }
    }

    // Timing & Kitchen ETA Strip
    let timingStrip = '';
    const isLiveTiming = ['accepted', 'preparing', 'cooking', 'confirmed', 'food_ready', 'out_for_delivery'].includes(status);

    if (isDelivered) {
      // ORDER IS DELIVERED -> Show actual delivery completion timestamp and turnaround metrics!
      const delivDate = order.delivered_at ? new Date(order.delivered_at) : (order.updated_at ? new Date(order.updated_at) : null);
      const delivTimeFormatted = delivDate ? delivDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      
      let totalMins = 0;
      if (order.created_at && delivDate) {
        totalMins = Math.max(1, Math.round((delivDate.getTime() - new Date(order.created_at).getTime()) / 60000));
      } else if (order.accepted_at && delivDate) {
        totalMins = Math.max(1, Math.round((delivDate.getTime() - new Date(order.accepted_at).getTime()) / 60000));
      }

      let rideMins = 0;
      if (order.dispatched_at && delivDate) {
        rideMins = Math.max(1, Math.round((delivDate.getTime() - new Date(order.dispatched_at).getTime()) / 60000));
      } else if (order.picked_up_at && delivDate) {
        rideMins = Math.max(1, Math.round((delivDate.getTime() - new Date(order.picked_up_at).getTime()) / 60000));
      }

      let acceptedTimeFormatted = '';
      if (order.accepted_at) {
        acceptedTimeFormatted = new Date(order.accepted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      let dispatchedTimeFormatted = '';
      if (order.dispatched_at) {
        dispatchedTimeFormatted = new Date(order.dispatched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      timingStrip = `
        <div class="order-timing-strip" style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 8px 12px; margin-top: 8px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="font-weight: 800; color: #166534; font-size: 0.84rem; display: flex; align-items: center; gap: 4px;">
                <i class="fas fa-check-double" style="color: #16a34a;"></i> Delivered to Customer at: <strong>${delivTimeFormatted || 'Completed'}</strong>
              </span>
              ${totalMins > 0 ? `
                <span style="font-size: 0.72rem; color: #15803d; background: #dcfce7; padding: 2px 7px; border-radius: 9999px; font-weight: 700;">
                  <i class="fas fa-stopwatch" style="margin-right: 2px;"></i> Total: ${totalMins}m
                </span>
              ` : ''}
              ${rideMins > 0 ? `
                <span style="font-size: 0.72rem; color: #0369a1; background: #e0f2fe; padding: 2px 7px; border-radius: 9999px; font-weight: 700;">
                  <i class="fas fa-motorcycle" style="margin-right: 2px;"></i> Transit: ${rideMins}m
                </span>
              ` : ''}
            </div>
            <span style="font-size: 0.72rem; font-weight: 700; color: #166534; background: #dcfce7; padding: 2px 8px; border-radius: 4px;">
              ✓ Fulfilled
            </span>
          </div>
          ${(acceptedTimeFormatted || dispatchedTimeFormatted) ? `
            <div style="font-size: 0.72rem; color: #64748b; margin-top: 5px; display: flex; justify-content: space-between; border-top: 1px dashed #bbf7d0; padding-top: 4px;">
              <span>Accepted: <strong>${acceptedTimeFormatted || '--:--'}</strong></span>
              ${dispatchedTimeFormatted ? `<span>Dispatched: <strong>${dispatchedTimeFormatted}</strong></span>` : ''}
              <span>Delivered: <strong style="color: #166534;">${delivTimeFormatted}</strong></span>
            </div>
          ` : ''}
        </div>
      `;
    } else if (isLiveTiming || order.estimated_prep_time) {
      // ACTIVE ORDER -> Show real-time prep & delivery ETAs
      const isDeliv = isDeliveryOrder(order);
      const prepMins = order.estimated_prep_time || 20;
      const combinedDelivMins = order.estimated_delivery_time || (prepMins + (isDeliv ? 15 : 0));
      const transitMins = Math.max(0, combinedDelivMins - prepMins);

      let elapsedMins = 0;
      if (order.accepted_at) {
        elapsedMins = Math.max(0, Math.floor((Date.now() - new Date(order.accepted_at).getTime()) / 60000));
      } else if (order.created_at) {
        elapsedMins = Math.max(0, Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000));
      }

      const isCooking = ['accepted', 'preparing', 'cooking', 'confirmed'].includes(status);
      const isDelayed = isCooking && elapsedMins > prepMins;
      const delayDiff = elapsedMins - prepMins;

      let targetReadyFormatted = '';
      if (order.accepted_at) {
        const targetReadyDate = new Date(new Date(order.accepted_at).getTime() + prepMins * 60000);
        targetReadyFormatted = targetReadyDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (order.created_at) {
        const targetReadyDate = new Date(new Date(order.created_at).getTime() + prepMins * 60000);
        targetReadyFormatted = targetReadyDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      let targetDeliveryFormatted = '';
      if (order.estimated_delivery_by) {
        targetDeliveryFormatted = new Date(order.estimated_delivery_by).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (order.accepted_at && isDeliv) {
        const targetDelivDate = new Date(new Date(order.accepted_at).getTime() + combinedDelivMins * 60000);
        targetDeliveryFormatted = targetDelivDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      timingStrip = `
        <div class="order-timing-strip">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <span style="font-weight: 700; color: var(--admin-text-main);">
                <i class="fas fa-utensils" style="color: var(--admin-gold); margin-right: 3px;"></i> Prep: ${prepMins}m
              </span>
              ${isDeliv ? `
                <span style="color: var(--admin-text-muted);">+</span>
                <span style="font-weight: 700; color: #0284c7;">
                  <i class="fas fa-motorcycle" style="margin-right: 3px;"></i> Delivery: ${transitMins}m
                </span>
                <span style="color: var(--admin-text-muted); font-weight: 800;">=</span>
                <span style="font-weight: 800; color: #166534; background: #dcfce7; padding: 1px 6px; border-radius: 4px;">
                  <i class="fas fa-clock" style="margin-right: 2px;"></i> Est. Delivery: ~${combinedDelivMins}m
                </span>
              ` : `
                <span style="font-weight: 700; color: #166534; background: #dcfce7; padding: 1px 6px; border-radius: 4px;">
                  Counter Pickup (~${prepMins}m)
                </span>
              `}
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              ${isDelayed ? `
                <span class="badge-delay-pulse">
                  ⚠️ +${delayDiff}m Delay
                </span>
              ` : isCooking ? `
                <span style="font-size: 0.72rem; color: #166534; font-weight: 700; background: #f0fdf4; padding: 2px 6px; border-radius: 4px;">
                  ⏱️ Cooking: ${elapsedMins}m
                </span>
              ` : ''}
              ${isCooking ? `
                <button type="button" class="btn-action-outline btn-adjust-eta" data-id="${order.id}" style="padding: 2px 6px; font-size: 0.72rem;">
                  <i class="fas fa-clock"></i> Adjust
                </button>
              ` : ''}
            </div>
          </div>
          ${(targetReadyFormatted || targetDeliveryFormatted) ? `
            <div style="font-size: 0.72rem; color: var(--admin-text-muted); margin-top: 5px; display: flex; justify-content: space-between; border-top: 1px dashed var(--admin-border-light); padding-top: 4px;">
              <span>Food Ready: <strong>${targetReadyFormatted || '--:--'}</strong></span>
              ${(isDeliv && targetDeliveryFormatted) ? `
                <span>Est. Delivery: <strong style="color: #0284c7;">${targetDeliveryFormatted}</strong></span>
              ` : ''}
            </div>
          ` : ''}
          ${order.delay_reason ? `
            <div style="font-size: 0.71rem; color: #b45309; margin-top: 3px;">
              <i class="fas fa-info-circle"></i> Note: ${escapeHtml(order.delay_reason)}
            </div>
          ` : ''}
        </div>
      `;
    }
    // Cancellation reason strip & Online refund actions
    let cancelStrip = '';
    if (status === 'cancelled') {
      const isOnlinePaid = !isCod && total > 0;
      const cleanPhone = (order.customer_phone || '').replace(/\D/g, '').slice(-10);
      const rawReason = String(order.cancellation_reason || '').trim();
      const isCustomerCancelled = (order.cancelled_by === 'customer');

      let displayReason = rawReason
        .replace(/^cancelled by customer:\s*/i, '')
        .replace(/^cancelled by kitchen:\s*/i, '')
        .replace(/^cancelled by restaurant:\s*/i, '')
        .trim();

      if (isCustomerCancelled) {
        if (!displayReason || /grace window|customer requested cancellation/i.test(displayReason)) {
          displayReason = 'Within 60s online grace window';
        }
      } else {
        if (!displayReason) {
          displayReason = 'Kitchen operational constraints';
        }
      }

      const badgeLabel = isCustomerCancelled ? 'Cancelled by Customer' : 'Cancelled by Cafe';
      const badgeIcon = isCustomerCancelled ? 'fa-user-slash' : 'fa-store-slash';
      const badgeBg = isCustomerCancelled ? '#f1f5f9' : '#fef2f2';
      const badgeBorder = isCustomerCancelled ? '#cbd5e1' : '#fecaca';
      const badgeColor = isCustomerCancelled ? '#334155' : '#991b1b';
      const iconColor = isCustomerCancelled ? '#64748b' : '#dc2626';

      cancelStrip = `
        <div style="background: ${badgeBg}; border: 1px solid ${badgeBorder}; border-radius: 8px; padding: 8px 12px; font-size: 0.78rem; color: ${badgeColor}; display: flex; align-items: center; gap: 6px;">
          <i class="fas ${badgeIcon}" style="color: ${iconColor};"></i>
          <span>${badgeLabel}: <strong>${escapeHtml(displayReason)}</strong></span>
        </div>
        ${isOnlinePaid ? `
          <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 8px 12px; margin-top: 6px; font-size: 0.78rem; color: #92400e; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
            <div>
              <strong><i class="fas fa-credit-card" style="color: #d97706;"></i> Online Paid: ₹${total}</strong>
              ${cleanPhone ? ` • Customer: +91 ${cleanPhone}` : ''}
            </div>
            <div style="display: flex; gap: 6px;">
              ${cleanPhone ? `
                <a href="https://wa.me/91${cleanPhone}?text=${encodeURIComponent('Hi ' + (order.customer_name || 'Customer') + ', regarding your Breeze Cafe order #' + order.id + ' (₹' + total + '): We have initiated your 100% refund. We apologize for the inconvenience and look forward to serving you soon! 🙏')}" target="_blank" class="btn-action-outline" style="padding: 3px 8px; font-size: 0.72rem; color: #166534; border-color: #86efac; background: #f0fdf4; text-decoration: none;">
                  <i class="fab fa-whatsapp"></i> WhatsApp Refund Note
                </a>
              ` : ''}
            </div>
          </div>
        ` : ''}
      `;
    }

    // Action buttons depending on lifecycle (STRICT SEQUENTIAL ONE-BY-ONE BUTTON FLOW)
    let actionsHtml = '';
    if (status === 'placed') {
      actionsHtml = `
        <button type="button" class="btn-card-action btn-action-accept" data-id="${order.id}">
          <i class="fas fa-check"></i> Accept Order
        </button>
        <button type="button" class="btn-card-action btn-action-reject" data-id="${order.id}">
          <i class="fas fa-times"></i> Reject
        </button>
      `;
    } else if (['accepted', 'preparing', 'cooking', 'confirmed'].includes(status)) {
      // Stage 2: Cooking in kitchen -> ONLY "Food Ready" (or "Ready for Pickup" for takeaway)
      actionsHtml = `
        <button type="button" class="btn-card-action btn-action-ready" data-id="${order.id}">
          <i class="fas fa-bell-concierge"></i> ${isTakeaway ? 'Ready for Pickup' : 'Food Ready'}
        </button>
        <button type="button" class="btn-card-action btn-action-reject" data-id="${order.id}" title="Emergency Cancel" style="flex: 0 0 auto; min-width: auto; padding: 10px 12px;">
          <i class="fas fa-ban"></i>
        </button>
      `;
    } else if (status === 'food_ready') {
      if (isTakeaway) {
        // Takeaway at counter -> ONLY "Hand Over to Customer"
        actionsHtml = `
          <button type="button" class="btn-card-action btn-action-delivered" data-id="${order.id}">
            <i class="fas fa-hand-holding-heart"></i> Hand Over to Customer
          </button>
        `;
      } else if (order.rider_id) {
        // Delivery with rider assigned at counter -> Action to dispatch order
        actionsHtml = `
          <button type="button" class="btn-card-action btn-action-dispatch" data-id="${order.id}" style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; border-color: #0284c7;">
            <i class="fas fa-paper-plane"></i> Dispatch Order
          </button>
        `;
      } else {
        // Delivery awaiting rider assignment -> ONLY "Assign Rider"
        actionsHtml = `
          <button type="button" class="btn-card-action btn-action-assign" data-id="${order.id}">
            <i class="fas fa-motorcycle"></i> Assign Rider
          </button>
        `;
      }
    } else if (['out_for_delivery', 'dispatched'].includes(status)) {
      // In transit -> ONLY "Mark Delivered"
      actionsHtml = `
        <button type="button" class="btn-card-action btn-action-delivered" data-id="${order.id}">
          <i class="fas fa-check-circle"></i> Mark Delivered
        </button>
      `;
    }

    // Universal KOT Print Action
    const kotBtn = `
      <button type="button" class="btn-card-action btn-action-kot" data-id="${order.id}" title="Print Kitchen Order Ticket">
        <i class="fas fa-print"></i> KOT
      </button>
    `;

    return `
      <div class="order-card status-${statusClass}" id="order-card-${order.id}">
        <div class="order-card-header">
          <div>
            <div class="order-id-code" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <span>#${order.id}</span>
              <span style="font-size: 0.72rem; font-weight: 700; color: #b45309; background: #fef3c7; padding: 2px 6px; border-radius: 4px;">
                ${escapeHtml(order.order_type || 'Delivery')}
              </span>
            </div>
            <div class="order-time-ago">${formatRelativeTime(order.created_at)}</div>
          </div>
          <span class="status-badge ${statusClass}">${statusLabel}</span>
        </div>

        <div class="order-card-body">
          <!-- Customer Info -->
          <div class="customer-info-box">
            <div class="cust-top-line">
              <span class="cust-name">${escapeHtml(order.customer_name || 'Guest Customer')}</span>
              ${order.customer_phone ? `
                <a href="tel:${order.customer_phone}" class="cust-phone-link">
                  <i class="fas fa-phone"></i> ${order.customer_phone}
                </a>
              ` : ''}
            </div>
            <div class="cust-address-text">
              <i class="fas ${isTakeaway ? 'fa-bag-shopping' : 'fa-map-marker-alt'}" style="color: var(--admin-gold); margin-right: 4px;"></i>
              ${isTakeaway ? 'Counter Pickup (Takeaway) • 5th Floor Terrace, Kanchan Aura' : escapeHtml(order.customer_address || 'Palghar (West)')}
              ${(!isTakeaway && order.customer_address) ? `
                <a href="https://maps.google.com/?q=${encodeURIComponent(order.customer_address + ', Palghar')}" target="_blank" style="margin-left: 6px; color: #0284c7; text-decoration: none; font-weight: 700;">
                  <i class="fas fa-external-link-alt"></i> Map
                </a>
              ` : ''}
            </div>
          </div>

          <!-- Items Ordered Table -->
          <div style="background: #faf7f2; border: 1px solid var(--admin-border-light); border-radius: 12px; padding: 10px 14px;">
            <table class="order-items-table">
              <tbody>${itemsHtml}</tbody>
            </table>
          </div>

          <!-- Payment Strip -->
          <div class="payment-strip">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="payment-method-pill ${isCod ? 'cod' : 'online'}">
                <i class="fas ${isCod ? 'fa-money-bill-wave' : (order.payment_method === 'online_doorstep' ? 'fa-qrcode' : (order.payment_method === 'razorpay' ? 'fa-bolt' : 'fa-credit-card'))}"></i>
                ${isCod ? 'Cash on Delivery' : (order.payment_method === 'online_doorstep' ? 'Doorstep UPI (Paid)' : (order.payment_method === 'razorpay' ? (order.razorpay_payment_id ? 'Razorpay (' + order.razorpay_payment_id.slice(-6) + ')' : 'Razorpay Paid') : 'Online Paid'))}
              </span>
              <span style="font-size: 0.72rem; color: var(--admin-text-muted); font-weight: 600;">
                ${escapeHtml(order.payment_status || (isCod ? 'Pending' : 'Completed'))}
              </span>
            </div>
            <span class="order-total-amount">₹${total}</span>
          </div>

          ${riderStrip}
          ${timingStrip}
          ${cancelStrip}
        </div>

        <div class="order-card-actions">
          ${actionsHtml}
          ${kotBtn}
        </div>
      </div>
    `;
  }

  function attachOrderCardListeners() {
    // 1. Accept Order -> Opens Accept & Kitchen Prep Modal
    document.querySelectorAll('.btn-action-accept').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        openAcceptOrderModal(id);
      });
    });

    // 1b. Adjust Kitchen Prep / ETA
    document.querySelectorAll('.btn-adjust-eta').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        openAdjustEtaModal(id);
      });
    });

    // 2. Reject Order -> opens rejection modal
    document.querySelectorAll('.btn-action-reject').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        openRejectModal(id);
      });
    });

    // 3. Mark as Ready
    document.querySelectorAll('.btn-action-ready').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const target = allOrders.find(o => o.id === id);
        const orderTypeStr = (target?.order_type || '').toLowerCase();
        const isTakeaway = orderTypeStr.includes('takeaway') || orderTypeStr.includes('pickup') || orderTypeStr.includes('counter') || orderTypeStr.includes('dine');
        const now = new Date().toISOString();

        await updateOrderStatus(id, 'food_ready', {
          food_ready_at: now
        });
        showAdminToast(isTakeaway 
          ? `✓ Order #${id} is Ready for Counter Pickup!` 
          : `✓ Food Ready for Order #${id}! Please assign a rider.`);
      });
    });

    // 3b. Mark Dispatched (Handover to rider for delivery)
    document.querySelectorAll('.btn-action-dispatch').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const target = allOrders.find(o => o.id === id);
        const riderName = target?.rider_name || 'Rider';
        const now = new Date().toISOString();

        await updateOrderStatus(id, 'out_for_delivery', {
          picked_up_at: now,
          dispatched_at: now
        });

        if (target && target.rider_id && supabaseClient) {
          try {
            await supabaseClient.from('delivery_partners').update({
              status: 'on_delivery',
              active_order_id: id,
              updated_at: now
            }).eq('id', target.rider_id);
          } catch (rErr) {
            console.warn('Could not update rider status to on_delivery:', rErr);
          }
        }

        showAdminToast(`🚀 Order #${id} dispatched with ${riderName}! Out for delivery.`);
      });
    });

    // 4. Assign Rider / Reassign Rider
    document.querySelectorAll('.btn-action-assign, .btn-reassign-rider').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        openAssignRiderModal(id);
      });
    });

    // 5. Mark Delivered / Handover
    document.querySelectorAll('.btn-action-delivered').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const target = allOrders.find(o => o.id === id);
        const isCod = target && target.payment_method === 'cod';

        const confirmMsg = isCod
          ? `Mark Order #${id} as Delivered?\n\nPlease confirm ₹${target.total_amount} CASH was collected from customer.`
          : `Mark Order #${id} as Delivered / Completed?`;

        if (!confirm(confirmMsg)) return;

        await completeOrderDelivery(id);
      });
    });

    // 6. Print KOT
    document.querySelectorAll('.btn-action-kot').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        openKotModal(id);
      });
    });
  }

  // Order status update in Supabase
  async function updateOrderStatus(orderId, newStatus, extraFields = {}) {
    stopAdminRinger(orderId);
    if (!supabaseClient) return;
    const now = new Date().toISOString();

    const targetOrder = allOrders.find(o => o.id === orderId);
    if (targetOrder) {
      const ranks = {
        'placed': 1, 'pending': 1,
        'accepted': 2, 'confirmed': 2, 'preparing': 2, 'cooking': 2,
        'food_ready': 3, 'ready': 3,
        'out_for_delivery': 4, 'dispatched': 4,
        'delivered': 5, 'completed': 5,
        'cancelled': 99, 'rejected': 99
      };
      const curRank = ranks[targetOrder.status] || 0;
      const nextRank = ranks[newStatus] || 0;
      if ((curRank === 99 && nextRank < 99) || (nextRank > 0 && nextRank < curRank && newStatus !== 'cancelled' && newStatus !== 'rejected')) {
        console.warn(`[updateOrderStatus] Blocked status regression for #${orderId}: ${targetOrder.status} -> ${newStatus}`);
        return;
      }
    }

    const payload = Object.assign({
      status: newStatus,
      updated_at: now
    }, extraFields);

    try {
      const { error } = await supabaseClient
        .from('orders')
        .update(payload)
        .eq('id', orderId);

      if (error) {
        console.warn('updateOrderStatus error:', error.message);
        alert('Could not update order status: ' + error.message);
        return;
      }

      // Optimistic in-memory update
      const idx = allOrders.findIndex(o => o.id === orderId);
      if (idx !== -1) {
        allOrders[idx] = Object.assign({}, allOrders[idx], payload);
      }
      updateKPISummaries();
      renderOrdersTab();
    } catch (err) {
      console.warn('updateOrderStatus err:', err);
    }
  }

  // Complete Order & Free Rider
  async function completeOrderDelivery(orderId) {
    stopAdminRinger(orderId);
    if (!supabaseClient) return;
    const target = allOrders.find(o => o.id === orderId);
    const now = new Date().toISOString();

    const orderPayload = {
      status: 'delivered',
      payment_status: 'PAID',
      delivered_at: now,
      cash_collected: target && target.payment_method === 'cod' ? Number(target.total_amount || 0) : 0,
      updated_at: now
    };

    try {
      await supabaseClient.from('orders').update(orderPayload).eq('id', orderId);

      // If rider was assigned, free the rider
      if (target && target.rider_id) {
        const currentRider = allRiders.find(r => r.id === target.rider_id);
        const newTotal = (currentRider && currentRider.total_deliveries) ? (currentRider.total_deliveries + 1) : 1;

        await supabaseClient.from('delivery_partners').update({
          status: 'available',
          active_order_id: null,
          total_deliveries: newTotal,
          updated_at: now
        }).eq('id', target.rider_id);

        if (currentRider) {
          currentRider.status = 'available';
          currentRider.active_order_id = null;
          currentRider.total_deliveries = newTotal;
        }
      }

      // Update in-memory
      const idx = allOrders.findIndex(o => o.id === orderId);
      if (idx !== -1) {
        allOrders[idx] = Object.assign({}, allOrders[idx], orderPayload);
      }

      showAdminToast(`🎉 Order #${orderId} marked Delivered & Settled!`);
      updateKPISummaries();
      renderOrdersTab();
    } catch (err) {
      console.warn('completeOrderDelivery error:', err);
    }
  }

  // --------------------------------------------------------------------------
  // MODAL: ACCEPT ORDER & KITCHEN PREP TIME COCKPIT
  // --------------------------------------------------------------------------
  function openAcceptOrderModal(orderId) {
    activeAcceptOrder = allOrders.find(o => o.id === orderId);
    if (!activeAcceptOrder) return;

    const isDelivery = isDeliveryOrder(activeAcceptOrder);

    // Reset defaults: 20 mins preparation + 15 mins delivery transit
    currentSelectedPrepMins = 20;
    currentSelectedTransitMins = isDelivery ? 15 : 0;
    if (inputCustomPrepMins) inputCustomPrepMins.value = 20;
    if (inputCustomTransitMins) inputCustomTransitMins.value = currentSelectedTransitMins;

    // Prefill modal header & summary
    if (acceptModalOrderSubtitle) {
      acceptModalOrderSubtitle.textContent = `Order #${activeAcceptOrder.id} • ${activeAcceptOrder.order_type || 'Delivery'}`;
    }
    if (acceptModalCustName) {
      acceptModalCustName.textContent = activeAcceptOrder.customer_name || 'Guest Customer';
    }
    const items = parseOrderItems(activeAcceptOrder.items);
    if (acceptModalItemsCount) {
      acceptModalItemsCount.textContent = `(${items.length} item${items.length === 1 ? '' : 's'})`;
    }
    if (acceptModalOrderTotal) {
      acceptModalOrderTotal.textContent = `₹${activeAcceptOrder.total_amount || 0}`;
    }

    // Toggle transit buffer group based on delivery
    if (groupTransitBuffer) {
      groupTransitBuffer.style.display = isDelivery ? 'block' : 'none';
    }
    if (cardPreviewDelivery) {
      cardPreviewDelivery.style.display = isDelivery ? 'block' : 'none';
    }

    // Reset active chips
    if (prepTimeChips) {
      prepTimeChips.querySelectorAll('.eta-chip').forEach(c => {
        c.classList.toggle('active', parseInt(c.dataset.mins, 10) === 20);
      });
    }
    if (transitTimeChips) {
      transitTimeChips.querySelectorAll('.eta-chip').forEach(c => {
        c.classList.toggle('active', parseInt(c.dataset.mins, 10) === 15);
      });
    }

    updateAcceptModalCalculations();
    if (acceptOrderModal) acceptOrderModal.style.display = 'flex';
  }

  function updateAcceptModalCalculations() {
    const isDelivery = isDeliveryOrder(activeAcceptOrder);
    const prepMins = currentSelectedPrepMins || 20;
    const transitMins = isDelivery ? (currentSelectedTransitMins || 0) : 0;
    const totalCombinedMins = prepMins + transitMins;

    const now = new Date();
    const readyDate = new Date(now.getTime() + prepMins * 60000);
    const delivDate = new Date(now.getTime() + totalCombinedMins * 60000);

    const timeFmt = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const badgePrep = document.getElementById('badgeSelectedPrep');
    if (badgePrep) badgePrep.textContent = `${prepMins} Mins`;

    const badgeTransit = document.getElementById('badgeSelectedTransit');
    if (badgeTransit) badgeTransit.textContent = `${transitMins} Mins`;

    if (previewKitchenReadyTime) previewKitchenReadyTime.textContent = `Ready: ~${timeFmt(readyDate)}`;
    if (previewKitchenReadyMins) previewKitchenReadyMins.textContent = `${prepMins} Mins`;

    const previewTransitMinsEl = document.getElementById('previewTransitMins');
    if (previewTransitMinsEl) previewTransitMinsEl.textContent = `+ ${transitMins} Mins`;

    if (previewDeliveryTime) previewDeliveryTime.textContent = isDelivery ? `Est. Delivery: ~${timeFmt(delivDate)}` : `Ready: ~${timeFmt(readyDate)}`;
    if (previewDeliveryMins) previewDeliveryMins.textContent = `~${totalCombinedMins} Mins`;

    if (btnConfirmAcceptOrder) {
      if (isDelivery) {
        btnConfirmAcceptOrder.innerHTML = `<i class="fas fa-check-circle"></i> Accept Order • Combined ETA: ~${totalCombinedMins}m (${prepMins}m Prep + ${transitMins}m Delivery)`;
      } else {
        btnConfirmAcceptOrder.innerHTML = `<i class="fas fa-check-circle"></i> Accept & Cook (${prepMins}m Prep)`;
      }
    }
  }

  // Prep Time Chip Clicks
  if (prepTimeChips) {
    prepTimeChips.querySelectorAll('.eta-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        prepTimeChips.querySelectorAll('.eta-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentSelectedPrepMins = parseInt(chip.dataset.mins, 10) || 20;
        if (inputCustomPrepMins) inputCustomPrepMins.value = currentSelectedPrepMins;
        updateAcceptModalCalculations();
      });
    });
  }

  // Stepper handlers
  if (btnPrepMinus && inputCustomPrepMins) {
    btnPrepMinus.addEventListener('click', () => {
      let val = Math.max(5, (parseInt(inputCustomPrepMins.value, 10) || 20) - 5);
      inputCustomPrepMins.value = val;
      currentSelectedPrepMins = val;
      if (prepTimeChips) {
        prepTimeChips.querySelectorAll('.eta-chip').forEach(c => {
          c.classList.toggle('active', parseInt(c.dataset.mins, 10) === val);
        });
      }
      updateAcceptModalCalculations();
    });
  }

  if (btnPrepPlus && inputCustomPrepMins) {
    btnPrepPlus.addEventListener('click', () => {
      let val = Math.min(120, (parseInt(inputCustomPrepMins.value, 10) || 20) + 5);
      inputCustomPrepMins.value = val;
      currentSelectedPrepMins = val;
      if (prepTimeChips) {
        prepTimeChips.querySelectorAll('.eta-chip').forEach(c => {
          c.classList.toggle('active', parseInt(c.dataset.mins, 10) === val);
        });
      }
      updateAcceptModalCalculations();
    });
  }

  if (inputCustomPrepMins) {
    inputCustomPrepMins.addEventListener('input', () => {
      let val = Math.max(5, Math.min(120, parseInt(inputCustomPrepMins.value, 10) || 20));
      currentSelectedPrepMins = val;
      if (prepTimeChips) {
        prepTimeChips.querySelectorAll('.eta-chip').forEach(c => {
          c.classList.toggle('active', parseInt(c.dataset.mins, 10) === val);
        });
      }
      updateAcceptModalCalculations();
    });
  }

  // Transit Buffer Chip Clicks
  if (transitTimeChips) {
    transitTimeChips.querySelectorAll('.eta-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        transitTimeChips.querySelectorAll('.eta-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentSelectedTransitMins = parseInt(chip.dataset.mins, 10) || 15;
        if (inputCustomTransitMins) inputCustomTransitMins.value = currentSelectedTransitMins;
        updateAcceptModalCalculations();
      });
    });
  }

  // Transit Stepper Handlers
  if (btnTransitMinus && inputCustomTransitMins) {
    btnTransitMinus.addEventListener('click', () => {
      let val = Math.max(0, (parseInt(inputCustomTransitMins.value, 10) || 15) - 5);
      inputCustomTransitMins.value = val;
      currentSelectedTransitMins = val;
      if (transitTimeChips) {
        transitTimeChips.querySelectorAll('.eta-chip').forEach(c => {
          c.classList.toggle('active', parseInt(c.dataset.mins, 10) === val);
        });
      }
      updateAcceptModalCalculations();
    });
  }

  if (btnTransitPlus && inputCustomTransitMins) {
    btnTransitPlus.addEventListener('click', () => {
      let val = Math.min(90, (parseInt(inputCustomTransitMins.value, 10) || 15) + 5);
      inputCustomTransitMins.value = val;
      currentSelectedTransitMins = val;
      if (transitTimeChips) {
        transitTimeChips.querySelectorAll('.eta-chip').forEach(c => {
          c.classList.toggle('active', parseInt(c.dataset.mins, 10) === val);
        });
      }
      updateAcceptModalCalculations();
    });
  }

  if (inputCustomTransitMins) {
    inputCustomTransitMins.addEventListener('input', () => {
      let val = Math.max(0, Math.min(90, parseInt(inputCustomTransitMins.value, 10) || 0));
      currentSelectedTransitMins = val;
      if (transitTimeChips) {
        transitTimeChips.querySelectorAll('.eta-chip').forEach(c => {
          c.classList.toggle('active', parseInt(c.dataset.mins, 10) === val);
        });
      }
      updateAcceptModalCalculations();
    });
  }

  // Close / Cancel Accept Modal
  const closeAcceptModalFn = () => {
    if (acceptOrderModal) acceptOrderModal.style.display = 'none';
    activeAcceptOrder = null;
  };
  if (btnCloseAcceptModal) btnCloseAcceptModal.addEventListener('click', closeAcceptModalFn);
  if (btnCancelAcceptModal) btnCancelAcceptModal.addEventListener('click', closeAcceptModalFn);

  // Confirm Accept Order
  if (btnConfirmAcceptOrder) {
    btnConfirmAcceptOrder.addEventListener('click', async () => {
      if (!activeAcceptOrder) return;
      const orderId = activeAcceptOrder.id;
      const isDelivery = isDeliveryOrder(activeAcceptOrder);
      const prepMins = currentSelectedPrepMins || 20;
      const transitMins = isDelivery ? (currentSelectedTransitMins || 0) : 0;
      const totalDeliveryMins = prepMins + transitMins;

      const now = new Date();
      const targetDeliveryDate = new Date(now.getTime() + totalDeliveryMins * 60000);

      await updateOrderStatus(orderId, 'accepted', {
        accepted_at: now.toISOString(),
        estimated_prep_time: prepMins,
        estimated_delivery_time: totalDeliveryMins,
        estimated_delivery_by: targetDeliveryDate.toISOString()
      });

      closeAcceptModalFn();
      showAdminToast(`✓ Order #${orderId} accepted! Combined ETA: ~${totalDeliveryMins}m (${prepMins}m Prep + ${transitMins}m Delivery).`);
    });
  }

  // --------------------------------------------------------------------------
  // MODAL: ADJUST / EXTEND PREP TIME & DELIVERY ETA
  // --------------------------------------------------------------------------
  function openAdjustEtaModal(orderId) {
    activeAdjustOrder = allOrders.find(o => o.id === orderId);
    if (!activeAdjustOrder) return;

    currentExtendMins = 5;
    if (adjustModalOrderSubtitle) {
      adjustModalOrderSubtitle.textContent = `Order #${activeAdjustOrder.id} • Current Prep: ${activeAdjustOrder.estimated_prep_time || 20}m`;
    }

    if (extendTimeChips) {
      extendTimeChips.querySelectorAll('.eta-chip').forEach(c => {
        c.classList.toggle('active', parseInt(c.dataset.add, 10) === 5);
      });
    }

    updateAdjustModalCalculations();
    if (adjustEtaModal) adjustEtaModal.style.display = 'flex';
  }

  function updateAdjustModalCalculations() {
    if (!activeAdjustOrder) return;
    const currentPrep = activeAdjustOrder.estimated_prep_time || 20;
    const newPrep = currentPrep + currentExtendMins;

    if (adjustNewPrepDisplay) {
      adjustNewPrepDisplay.textContent = `${newPrep} Mins (+${currentExtendMins}m)`;
    }

    const isDelivery = isDeliveryOrder(activeAdjustOrder);
    if (adjustNewDeliveryRow) {
      adjustNewDeliveryRow.style.display = isDelivery ? 'flex' : 'none';
    }

    let baseDeliveryBy = activeAdjustOrder.estimated_delivery_by 
      ? new Date(activeAdjustOrder.estimated_delivery_by) 
      : new Date(Date.now() + (newPrep + 15) * 60000);
    const newDelivDate = new Date(baseDeliveryBy.getTime() + currentExtendMins * 60000);

    if (adjustNewDeliveryDisplay) {
      adjustNewDeliveryDisplay.textContent = newDelivDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }

  if (extendTimeChips) {
    extendTimeChips.querySelectorAll('.eta-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        extendTimeChips.querySelectorAll('.eta-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentExtendMins = parseInt(chip.dataset.add, 10) || 5;
        updateAdjustModalCalculations();
      });
    });
  }

  const closeAdjustEtaModalFn = () => {
    if (adjustEtaModal) adjustEtaModal.style.display = 'none';
    activeAdjustOrder = null;
  };
  if (btnCloseAdjustEtaModal) btnCloseAdjustEtaModal.addEventListener('click', closeAdjustEtaModalFn);
  if (btnCancelAdjustEtaModal) btnCancelAdjustEtaModal.addEventListener('click', closeAdjustEtaModalFn);

  if (btnSaveAdjustEta) {
    btnSaveAdjustEta.addEventListener('click', async () => {
      if (!activeAdjustOrder) return;
      const orderId = activeAdjustOrder.id;
      const currentPrep = activeAdjustOrder.estimated_prep_time || 20;
      const newPrep = currentPrep + currentExtendMins;
      const currentDelivery = activeAdjustOrder.estimated_delivery_time || (currentPrep + 15);
      const newDelivery = currentDelivery + currentExtendMins;

      let baseDeliveryBy = activeAdjustOrder.estimated_delivery_by 
        ? new Date(activeAdjustOrder.estimated_delivery_by) 
        : new Date(Date.now() + (newPrep + 15) * 60000);
      const newDelivDate = new Date(baseDeliveryBy.getTime() + currentExtendMins * 60000);

      const reason = selectDelayReason ? selectDelayReason.value : 'Kitchen rush';

      await updateOrderStatus(orderId, activeAdjustOrder.status, {
        estimated_prep_time: newPrep,
        estimated_delivery_time: newDelivery,
        estimated_delivery_by: newDelivDate.toISOString(),
        delay_reason: reason
      });

      closeAdjustEtaModalFn();
      showAdminToast(`⏱️ Order #${orderId} ETA extended by +${currentExtendMins}m (${reason})`);
    });
  }

  // --------------------------------------------------------------------------
  // MODAL: REJECT / CANCEL ORDER
  // --------------------------------------------------------------------------
  function openRejectModal(orderId) {
    activeRejectOrder = allOrders.find(o => o.id === orderId);
    if (!activeRejectOrder) return;

    if (rejectCustomReasonGroup) rejectCustomReasonGroup.style.display = 'none';
    if (rejectCustomReasonInput) rejectCustomReasonInput.value = '';

    // Check first radio
    const firstRadio = document.querySelector('input[name="rejectReasonRadio"][value="Kitchen currently at peak capacity"]');
    if (firstRadio) firstRadio.checked = true;

    // Check if order was paid online
    const isOnline = activeRejectOrder.payment_method === 'online' || activeRejectOrder.paymentMethod === 'online' || activeRejectOrder.payment_status === 'paid';
    const total = Number(activeRejectOrder.total_amount || activeRejectOrder.total) || 0;
    const rawPhone = (activeRejectOrder.customer_phone || '').replace(/\D/g, '');
    const phone = rawPhone.slice(-10);
    const name = activeRejectOrder.customer_name || 'Customer';
    const paymentId = activeRejectOrder.razorpay_payment_id || '';

    if (rejectOnlineRefundNotice) {
      if (isOnline) {
        rejectOnlineRefundNotice.style.display = 'block';
        if (rejectOnlineAmount) rejectOnlineAmount.textContent = '₹' + total;
        if (rejectCustomerName) rejectCustomerName.textContent = name;
        if (rejectCustomerPhone) rejectCustomerPhone.textContent = phone ? ('+91 ' + phone) : 'No phone recorded';
        if (rejectCustomerPhoneLink) rejectCustomerPhoneLink.href = phone ? ('tel:' + phone) : '#';

        // Pre-fill UPI Link
        if (btnRejectDirectUpi) {
          btnRejectDirectUpi.href = phone ? `upi://pay?pa=${phone}@upi&pn=${encodeURIComponent(name)}&am=${total}&cu=INR&tn=${encodeURIComponent('Breeze Refund #' + activeRejectOrder.id)}` : '#';
          btnRejectDirectUpi.onclick = (e) => {
            if (!phone) {
              e.preventDefault();
              alert('Customer phone number not available for UPI.');
            }
          };
        }

        // Pre-fill WhatsApp message
        const waText = encodeURIComponent(
          `Hi ${name},\n\nThis is Breeze The Roof-Top Café, Palghar. Regarding your online order #${activeRejectOrder.id} (₹${total}):\n\nUnfortunately, our kitchen is unable to prepare this order due to operational constraints/stock. We have initiated a direct 100% refund of ₹${total} to your UPI account/Google Pay (${phone ? '+91 ' + phone : ''}).\n\nWe sincerely apologize for the inconvenience and look forward to serving you soon! 🙏✨`
        );
        if (btnRejectWhatsAppRefund) {
          btnRejectWhatsAppRefund.href = phone ? `https://wa.me/91${phone}?text=${waText}` : '#';
        }

        // Razorpay link
        if (btnRejectRazorpayLink) {
          btnRejectRazorpayLink.href = paymentId ? `https://dashboard.razorpay.com/app/payments/${paymentId}` : 'https://dashboard.razorpay.com/app/payments';
        }
      } else {
        rejectOnlineRefundNotice.style.display = 'none';
      }
    }

    if (rejectOrderModal) rejectOrderModal.style.display = 'flex';
  }

  document.querySelectorAll('input[name="rejectReasonRadio"]').forEach(r => {
    r.addEventListener('change', () => {
      if (rejectCustomReasonGroup) {
        rejectCustomReasonGroup.style.display = r.value === 'custom' ? 'block' : 'none';
        if (r.value === 'custom' && rejectCustomReasonInput) rejectCustomReasonInput.focus();
      }
    });
  });

  if (btnCloseRejectModal) btnCloseRejectModal.addEventListener('click', closeRejectModal);
  if (btnCancelRejectModal) btnCancelRejectModal.addEventListener('click', closeRejectModal);

  function closeRejectModal() {
    if (rejectOrderModal) rejectOrderModal.style.display = 'none';
    activeRejectOrder = null;
  }

  if (btnConfirmRejectOrder) {
    btnConfirmRejectOrder.addEventListener('click', async () => {
      if (!activeRejectOrder) return;
      const selectedRadio = document.querySelector('input[name="rejectReasonRadio"]:checked');
      let reason = selectedRadio ? selectedRadio.value : 'Cancelled by restaurant';
      if (reason === 'custom') {
        reason = rejectCustomReasonInput.value.trim() || 'Kitchen operational constraints';
      }

      const id = activeRejectOrder.id;
      const prevRiderId = activeRejectOrder.rider_id;
      closeRejectModal();

      // Free assigned rider if one was dispatched
      if (prevRiderId && supabaseClient) {
        try {
          await supabaseClient.from('delivery_partners').update({
            status: 'available',
            active_order_id: null,
            updated_at: new Date().toISOString()
          }).eq('id', prevRiderId);

          const r = allRiders.find(x => x.id === prevRiderId);
          if (r) {
            r.status = 'available';
            r.active_order_id = null;
          }
        } catch (e) {
          console.warn('Failed to release rider on cancel:', e);
        }
      }

      await updateOrderStatus(id, 'cancelled', {
        cancellation_reason: reason,
        cancelled_by: 'admin'
      });
      showAdminToast(`Order #${id} rejected: ${reason}`, false);
    });
  }

  // --------------------------------------------------------------------------
  // MODAL: ASSIGN RIDER ENGINE
  // --------------------------------------------------------------------------
  function openAssignRiderModal(orderId) {
    activeAssignOrder = allOrders.find(o => o.id === orderId);
    if (!activeAssignOrder) return;

    const orderTypeStr = (activeAssignOrder.order_type || '').toLowerCase();
    const isTakeaway = orderTypeStr.includes('takeaway') || orderTypeStr.includes('pickup') || orderTypeStr.includes('counter') || orderTypeStr.includes('dine');
    if (isTakeaway) {
      showAdminToast('⚠️ Takeaway order: Customer self-collects directly at rooftop counter. Rider assignment disabled.');
      return;
    }

    if (assignModalOrderId) assignModalOrderId.textContent = '#' + activeAssignOrder.id;
    if (assignModalOrderTotal) assignModalOrderTotal.textContent = '₹' + activeAssignOrder.total_amount;
    if (assignModalCustName) assignModalCustName.textContent = activeAssignOrder.customer_name || 'Guest Customer';
    if (assignModalAddress) assignModalAddress.textContent = activeAssignOrder.customer_address || 'Palghar';

    renderAssignRiderList();
    if (assignRiderModal) assignRiderModal.style.display = 'flex';
  }

  if (btnCloseAssignModal) btnCloseAssignModal.addEventListener('click', () => {
    if (assignRiderModal) assignRiderModal.style.display = 'none';
    activeAssignOrder = null;
  });

  function renderAssignRiderList() {
    if (!assignRiderListContainer) return;

    if (allRiders.length === 0) {
      assignRiderListContainer.innerHTML = `
        <div style="text-align: center; padding: 24px; color: var(--admin-text-muted); font-size: 0.86rem;">
          No delivery riders registered. Please add a rider in the "Delivery Fleet" tab.
        </div>
      `;
      return;
    }

    let html = '';
    const currentAssignedId = activeAssignOrder ? activeAssignOrder.rider_id : null;

    allRiders.forEach(rider => {
      const status = rider.status || 'available';
      const isCurrentlyAssigned = currentAssignedId && currentAssignedId === rider.id;
      let statusBadge = '<span class="rider-status-tag available"><i class="fas fa-circle" style="font-size: 6px;"></i> Available</span>';

      if (status === 'on_delivery') {
        statusBadge = `<span class="rider-status-tag on_delivery"><i class="fas fa-motorcycle"></i> Delivering ${rider.active_order_id ? ('#' + rider.active_order_id) : ''}</span>`;
      } else if (status === 'offline') {
        statusBadge = '<span class="rider-status-tag offline"><i class="fas fa-moon"></i> Offline</span>';
      }

      if (isCurrentlyAssigned) {
        statusBadge += ` <span style="font-size: 0.72rem; font-weight: 700; color: #b45309; background: #fef3c7; padding: 2px 6px; border-radius: 4px; margin-left: 4px;">Assigned</span>`;
      }

      html += `
        <div class="rider-select-card ${isCurrentlyAssigned ? 'currently-assigned' : ''}" data-rider-id="${rider.id}">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="rider-avatar-bubble">${(rider.name || 'R').charAt(0).toUpperCase()}</div>
            <div>
              <strong style="color: var(--admin-text-main); font-size: 0.95rem; display: block;">${escapeHtml(rider.name || rider.id)}</strong>
              <small style="color: var(--admin-text-muted); font-size: 0.78rem;">
                ${escapeHtml(rider.vehicle_type || 'Motorcycle')} • ${escapeHtml(rider.vehicle_number || rider.id)}
              </small>
            </div>
          </div>
          <div style="text-align: right;">
            ${statusBadge}
            <button type="button" class="btn-gold-primary btn-do-assign" data-rider-id="${rider.id}" style="width: auto; padding: 6px 14px; font-size: 0.8rem; margin-top: 6px;">
              ${isCurrentlyAssigned ? 'Re-confirm' : 'Assign'}
            </button>
          </div>
        </div>
      `;
    });

    assignRiderListContainer.innerHTML = html;

    // Attach click handlers
    assignRiderListContainer.querySelectorAll('.btn-do-assign').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const rId = btn.dataset.riderId;
        const targetRider = allRiders.find(r => r.id === rId);
        if (!targetRider || !activeAssignOrder) return;

        // Warn if rider is currently offline
        if (targetRider.status === 'offline') {
          const proceed = confirm(`⚠️ ${targetRider.name} is currently marked OFFLINE.\n\nDo you want to assign this order to them anyway? Their status will update to 'On Delivery'.`);
          if (!proceed) return;
        } else if (targetRider.status === 'on_delivery' && targetRider.active_order_id !== activeAssignOrder.id) {
          // Warn if rider is currently on delivery for another order
          const proceed = confirm(`⚠️ ${targetRider.name} is already delivering Order #${targetRider.active_order_id || 'active'}.\n\nDo you want to assign this order as a second delivery to this rider?`);
          if (!proceed) return;
        }

        await executeRiderAssignment(activeAssignOrder.id, targetRider);
      });
    });
  }

  async function executeRiderAssignment(orderId, rider) {
    if (!supabaseClient) return;
    const now = new Date().toISOString();

    const targetOrder = allOrders.find(o => o.id === orderId);
    const prevRiderId = targetOrder ? targetOrder.rider_id : null;

    // Preserve forward status: never regress status if order was already out_for_delivery or delivered
    let nextStatus = targetOrder?.status || 'food_ready';
    if (['out_for_delivery', 'dispatched', 'delivered'].includes(nextStatus)) {
      // Keep forward status
    } else if (nextStatus === 'food_ready') {
      nextStatus = 'food_ready';
    } else if (['placed', 'pending'].includes(nextStatus)) {
      nextStatus = 'accepted';
    }

    const orderPayload = {
      rider_id: rider.id,
      rider_name: rider.name,
      rider_phone: rider.phone,
      rider_assigned_at: now,
      status: nextStatus,
      updated_at: now
    };

    const riderPayload = {
      status: 'on_delivery',
      active_order_id: orderId,
      updated_at: now
    };

    try {
      // 1. If another rider was previously assigned, free them back to available
      if (prevRiderId && prevRiderId !== rider.id) {
        await supabaseClient.from('delivery_partners').update({
          status: 'available',
          active_order_id: null,
          updated_at: now
        }).eq('id', prevRiderId);

        const prevRider = allRiders.find(r => r.id === prevRiderId);
        if (prevRider) {
          prevRider.status = 'available';
          prevRider.active_order_id = null;
        }
      }

      // 2. Update Order
      await supabaseClient.from('orders').update(orderPayload).eq('id', orderId);

      // 3. Update Rider
      await supabaseClient.from('delivery_partners').update(riderPayload).eq('id', rider.id);

      // Update in-memory
      const ordIdx = allOrders.findIndex(o => o.id === orderId);
      if (ordIdx !== -1) {
        allOrders[ordIdx] = Object.assign({}, allOrders[ordIdx], orderPayload);
      }

      const rIdx = allRiders.findIndex(r => r.id === rider.id);
      if (rIdx !== -1) {
        allRiders[rIdx] = Object.assign({}, allRiders[rIdx], riderPayload);
      }

      if (assignRiderModal) assignRiderModal.style.display = 'none';
      activeAssignOrder = null;

      showAdminToast(`✓ ${rider.name} assigned to Order #${orderId}! Click "Dispatched" when handed over.`);
      updateKPISummaries();
      renderOrdersTab();
    } catch (err) {
      console.warn('executeRiderAssignment error:', err);
    }
  }

  // --------------------------------------------------------------------------
  // TAB 1.5: TABLE RESERVATIONS & ROOFTOP SEATING MANAGEMENT
  // --------------------------------------------------------------------------

  // Helper: Get local date string YYYY-MM-DD
  function getLocalDateString(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Update 4 KPI Summary Cards & Tab Counter Badge
  function updateReservationKPISummaries() {
    const todayStr = getLocalDateString(new Date());
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = getLocalDateString(tomorrow);
    const next7Days = new Date();
    next7Days.setDate(next7Days.getDate() + 7);
    const next7DaysStr = getLocalDateString(next7Days);

    // Today's Bookings
    const todayRes = allReservations.filter(r => r.reservation_date === todayStr);
    const todayActive = todayRes.filter(r => r.status !== 'cancelled');

    // Expected Guests Today
    const totalGuestsToday = todayActive.reduce((sum, r) => sum + (parseInt(r.guest_count, 10) || 0), 0);

    // Currently Seated
    const currentlySeated = allReservations.filter(r => r.status === 'seated');

    // Upcoming Bookings (Next 7 days, confirmed)
    const upcoming = allReservations.filter(r => {
      const d = r.reservation_date;
      return d >= todayStr && d <= next7DaysStr && (r.status === 'confirmed');
    });

    if (dispResTodayCount) dispResTodayCount.textContent = todayRes.length;
    if (dispResTodayDate) {
      const todayFormatted = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      dispResTodayDate.textContent = `Today (${todayFormatted})`;
    }
    if (dispResTodayGuests) dispResTodayGuests.textContent = totalGuestsToday;
    if (dispResSeatedCount) dispResSeatedCount.textContent = currentlySeated.length;
    if (dispResUpcomingCount) dispResUpcomingCount.textContent = upcoming.length;

    // Tab Counter Badge
    if (badgeReservationsCount) {
      const activePendingCount = todayRes.filter(r => r.status === 'confirmed' || r.status === 'seated').length;
      badgeReservationsCount.textContent = activePendingCount;
      badgeReservationsCount.style.display = activePendingCount > 0 ? 'inline-flex' : 'none';
    }
  }

  // Render Table Reservations Grid
  function renderReservationsTab() {
    if (!reservationsGridContainer) return;
    const todayStr = getLocalDateString(new Date());
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = getLocalDateString(tomorrow);
    const next7Days = new Date();
    next7Days.setDate(next7Days.getDate() + 7);
    const next7DaysStr = getLocalDateString(next7Days);

    let filtered = [...allReservations];

    // 1. Date Presets Filter
    if (resDateFilter === 'today') {
      filtered = filtered.filter(r => r.reservation_date === todayStr);
    } else if (resDateFilter === 'tomorrow') {
      filtered = filtered.filter(r => r.reservation_date === tomorrowStr);
    } else if (resDateFilter === 'next7') {
      filtered = filtered.filter(r => r.reservation_date >= todayStr && r.reservation_date <= next7DaysStr);
    } else if (resDateFilter === 'custom') {
      if (resCustomStart && resCustomEnd) {
        filtered = filtered.filter(r => r.reservation_date >= resCustomStart && r.reservation_date <= resCustomEnd);
      }
    }

    // 2. Status Filter
    if (resStatusFilter !== 'all') {
      filtered = filtered.filter(r => (r.status || 'confirmed') === resStatusFilter);
    }

    // 3. Zone Filter
    if (resZoneFilter !== 'all') {
      filtered = filtered.filter(r => (r.seating_zone || '').toLowerCase().includes(resZoneFilter.toLowerCase()));
    }

    // 4. Realtime Search Filter
    if (resSearchQuery) {
      const q = resSearchQuery.toLowerCase();
      filtered = filtered.filter(r => {
        return (r.guest_name && r.guest_name.toLowerCase().includes(q)) ||
               (r.guest_phone && r.guest_phone.toLowerCase().includes(q)) ||
               (r.table_number && r.table_number.toLowerCase().includes(q)) ||
               (r.id && r.id.toLowerCase().includes(q));
      });
    }

    // Sort: Seated & Confirmed first, then date ascending, time ascending
    filtered.sort((a, b) => {
      const statusWeight = { seated: 1, confirmed: 2, completed: 3, cancelled: 4 };
      const wa = statusWeight[a.status] || 2;
      const wb = statusWeight[b.status] || 2;
      if (wa !== wb) return wa - wb;
      if (a.reservation_date !== b.reservation_date) {
        return (a.reservation_date || '').localeCompare(b.reservation_date || '');
      }
      return (a.time_slot || '').localeCompare(b.time_slot || '');
    });

    if (filtered.length === 0) {
      reservationsGridContainer.innerHTML = '';
      if (reservationsEmptyState) reservationsEmptyState.style.display = 'block';
      return;
    }

    if (reservationsEmptyState) reservationsEmptyState.style.display = 'none';

    reservationsGridContainer.innerHTML = filtered.map(r => {
      const status = r.status || 'confirmed';
      const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
      const isToday = r.reservation_date === todayStr;
      const isTomorrow = r.reservation_date === tomorrowStr;

      let dateBadge = r.reservation_date || 'Date TBD';
      if (isToday) dateBadge = 'Today';
      else if (isTomorrow) dateBadge = 'Tomorrow';
      else if (r.reservation_date) {
        try {
          const d = new Date(r.reservation_date + (r.reservation_date.includes('T') ? '' : 'T00:00:00'));
          if (!isNaN(d.getTime())) {
            dateBadge = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
          }
        } catch (e) {
          dateBadge = r.reservation_date;
        }
      }

      const tableTagHtml = r.table_number
        ? `<span class="res-table-badge assigned" title="Assigned Rooftop Table"><i class="fas fa-chair" style="color: #b45309;"></i> Table ${escapeHtml(r.table_number)}</span>`
        : `<span class="res-table-badge unassigned" title="No Table Allocated"><i class="fas fa-chair"></i> No Table Assigned</span>`;

      const notesHtml = r.special_notes
        ? `<div class="res-notes-callout"><i class="fas fa-info-circle"></i> <span>${escapeHtml(r.special_notes)}</span></div>`
        : '';

      const hasPhone = Boolean(r.guest_phone && r.guest_phone.replace(/\D/g, '').length >= 10);
      const telUrl = hasPhone ? `tel:${r.guest_phone.replace(/\D/g, '')}` : 'javascript:void(0)';
      const waUrl = hasPhone ? getReservationWhatsAppUrl(r) : 'javascript:void(0)';
      const commsDisabledAttr = hasPhone ? '' : 'style="opacity: 0.4; pointer-events: none; cursor: not-allowed;"';

      let actionButtonsHtml = '';
      if (status === 'confirmed') {
        actionButtonsHtml = `
          <button type="button" class="btn-res-act seat" data-action="seat" data-id="${r.id}">
            <i class="fas fa-user-check"></i> Seat Guest
          </button>
          <button type="button" class="btn-res-act assign" data-action="assign-table" data-id="${r.id}">
            <i class="fas fa-chair"></i> ${r.table_number ? 'Edit Table' : 'Assign Table'}
          </button>
          <button type="button" class="btn-res-act cancel-res" data-action="cancel" data-id="${r.id}" title="Cancel Reservation">
            <i class="fas fa-times"></i> Cancel
          </button>
        `;
      } else if (status === 'seated') {
        actionButtonsHtml = `
          <button type="button" class="btn-res-act complete" data-action="complete" data-id="${r.id}">
            <i class="fas fa-check-circle"></i> Complete Dining
          </button>
          <button type="button" class="btn-res-act assign" data-action="assign-table" data-id="${r.id}">
            <i class="fas fa-exchange-alt"></i> Change Table
          </button>
          <button type="button" class="btn-res-act cancel-res" data-action="cancel" data-id="${r.id}">
            <i class="fas fa-times"></i> Cancel
          </button>
        `;
      } else if (status === 'completed') {
        actionButtonsHtml = `
          <div style="font-size: 0.78rem; font-weight: 700; color: #16a34a; display: flex; align-items: center; gap: 6px; padding: 4px 0;">
            <i class="fas fa-check-double"></i> Dining Session Completed
          </div>
          <button type="button" class="btn-res-act assign" data-action="reopen" data-id="${r.id}" style="font-size: 0.72rem; padding: 4px 8px;" title="Reopen reservation">
            <i class="fas fa-undo"></i> Reopen
          </button>
        `;
      } else if (status === 'cancelled') {
        actionButtonsHtml = `
          <div style="font-size: 0.78rem; font-weight: 700; color: #dc2626; display: flex; align-items: center; gap: 6px; padding: 4px 0;">
            <i class="fas fa-ban"></i> Booking Cancelled
          </div>
          <button type="button" class="btn-res-act assign" data-action="reopen" data-id="${r.id}" style="font-size: 0.72rem; padding: 4px 8px;">
            <i class="fas fa-undo"></i> Re-confirm
          </button>
        `;
      }

      return `
        <article class="reservation-card res-status-${status}" data-reservation-id="${r.id}">
          <header class="res-card-header">
            <div class="res-guest-name-block">
              <h4 class="res-guest-name">${escapeHtml(r.guest_name || 'Guest')}</h4>
              <span class="res-time-badge">
                <i class="fas fa-clock" style="color: var(--admin-gold);"></i> ${escapeHtml(dateBadge)} • ${escapeHtml(r.time_slot || 'Evening')}
              </span>
            </div>
            <span class="res-status-pill ${status}">
              ${statusLabel}
            </span>
          </header>

          <div class="res-card-body">
            <div class="res-meta-chips">
              <span class="res-meta-chip guests">
                <i class="fas fa-users"></i> ${r.guest_count || 2} Guests
              </span>
              <span class="res-meta-chip zone">
                <i class="fas fa-map-marker-alt"></i> ${escapeHtml(r.seating_zone || 'Open-Sky Terrace')}
              </span>
              ${tableTagHtml}
            </div>

            ${notesHtml}

            <!-- 1-Click Communications -->
            <div class="res-comms-strip">
              <a href="${telUrl}" class="btn-res-comm call" ${commsDisabledAttr} title="${hasPhone ? 'Call Guest' : 'No phone number available'}">
                <i class="fas fa-phone-alt"></i> ${escapeHtml(r.guest_phone || 'No phone')}
              </a>
              <a href="${waUrl}" ${hasPhone ? 'target="_blank" rel="noopener noreferrer"' : ''} class="btn-res-comm whatsapp" ${commsDisabledAttr} title="${hasPhone ? 'Send WhatsApp Table Confirmation' : 'No phone number available'}">
                <i class="fab fa-whatsapp"></i> WhatsApp
              </a>
            </div>
          </div>

          <footer class="res-card-footer">
            ${actionButtonsHtml}
          </footer>
        </article>
      `;
    }).join('');
  }

  // WhatsApp Confirmation Generator
  function getReservationWhatsAppUrl(res) {
    if (!res || !res.guest_phone) return 'javascript:void(0)';
    let rawPhone = res.guest_phone.replace(/\D/g, '');
    if (rawPhone.startsWith('0') && rawPhone.length === 11) {
      rawPhone = '91' + rawPhone.slice(1);
    } else if (rawPhone.length === 10) {
      rawPhone = '91' + rawPhone;
    }

    let dateFormatted = 'Today';
    if (res.reservation_date) {
      try {
        const d = new Date(res.reservation_date + (res.reservation_date.includes('T') ? '' : 'T00:00:00'));
        if (!isNaN(d.getTime())) {
          dateFormatted = d.toLocaleDateString('en-IN', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          });
        }
      } catch (e) {
        dateFormatted = res.reservation_date;
      }
    }

    const statusUpper = (res.status || 'confirmed').toUpperCase();
    const tableText = res.table_number ? `*Table ${res.table_number}*` : 'Allocated upon arrival';

    const msg = `✨ *Breeze The Rooftop Café, Palghar* ✨\n\nDear *${res.guest_name || 'Guest'}*,\nYour rooftop table reservation is *${statusUpper}*! 🥂\n\n📅 *Date:* ${dateFormatted}\n⏰ *Time Slot:* ${res.time_slot || 'Evening'}\n👥 *Party Size:* ${res.guest_count || 2} Guests\n📍 *Zone:* ${res.seating_zone || 'Rooftop Lounge'}\n🪑 *Assigned Table:* ${tableText}\n\n📍 *Address:* 5th Floor Rooftop, Kanchan Aura, Palghar West\n📞 *Direct Desk:* +91 72492 75687\n🗺️ *Location:* https://maps.app.goo.gl/BreezePalghar\n\nWe look forward to giving you an exceptional starlit dining experience! ✨`;

    return `https://wa.me/${rawPhone}?text=${encodeURIComponent(msg)}`;
  }

  // Update Reservation Status
  async function updateReservationStatus(reservationId, newStatus) {
    if (!supabaseClient) {
      showAdminToast('Supabase client not initialized');
      return;
    }
    try {
      const { data, error } = await supabaseClient
        .from('table_reservations')
        .update({ status: newStatus })
        .eq('id', reservationId)
        .select();

      if (error) {
        showAdminToast(`Error updating status: ${error.message}`, false);
        return;
      }
      if (!data || data.length === 0) {
        showAdminToast('Failed to update reservation in cloud database', false);
        return;
      }

      // Optimistic local update
      const res = allReservations.find(r => r.id === reservationId);
      if (res) res.status = newStatus;

      updateReservationKPISummaries();
      renderReservationsTab();

      const label = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
      showAdminToast(`✓ Reservation updated: ${label}`);
    } catch (err) {
      console.warn('updateReservationStatus error:', err);
    }
  }

  // Assign Table Number
  async function assignTableNumber(reservationId, tableNum, andMarkSeated = false) {
    if (!supabaseClient) {
      showAdminToast('Supabase client not initialized');
      return;
    }
    try {
      const updatePayload = { table_number: tableNum || null };
      if (andMarkSeated) {
        updatePayload.status = 'seated';
      }

      const { data, error } = await supabaseClient
        .from('table_reservations')
        .update(updatePayload)
        .eq('id', reservationId)
        .select();

      if (error) {
        showAdminToast(`Error assigning table: ${error.message}`, false);
        return;
      }
      if (!data || data.length === 0) {
        showAdminToast('Failed to assign table in cloud database', false);
        return;
      }

      // Optimistic local update
      const res = allReservations.find(r => r.id === reservationId);
      if (res) {
        res.table_number = tableNum || null;
        if (andMarkSeated) res.status = 'seated';
      }

      updateReservationKPISummaries();
      renderReservationsTab();

      if (tableNum) {
        showAdminToast(`✓ Table ${tableNum} assigned${andMarkSeated ? ' & guest marked Seated' : ''}!`);
      } else {
        showAdminToast('✓ Table unassigned');
      }
    } catch (err) {
      console.warn('assignTableNumber error:', err);
    }
  }

  // Create Manual Admin Reservation
  async function createAdminReservation(payload) {
    if (!supabaseClient) {
      showAdminToast('Supabase client not initialized');
      return;
    }
    try {
      const { data, error } = await supabaseClient
        .from('table_reservations')
        .insert(payload)
        .select()
        .single();

      if (error) {
        showAdminToast(`Error creating reservation: ${error.message}`, false);
        return false;
      }

      if (data && !allReservations.some(r => r.id === data.id)) {
        allReservations.unshift(data);
      }

      updateReservationKPISummaries();
      renderReservationsTab();
      showAdminToast(`✓ Reservation saved for ${payload.guest_name}!`);
      return true;
    } catch (err) {
      console.warn('createAdminReservation error:', err);
      return false;
    }
  }

  // Modal Controllers
  function openAssignTableModal(res) {
    if (!adminAssignTableModal || !res) return;
    if (assignReservationId) assignReservationId.value = res.id;
    if (assignGuestName) assignGuestName.textContent = res.guest_name || 'Guest';
    if (assignGuestCountBadge) assignGuestCountBadge.textContent = `${res.guest_count || 2} Guests`;
    if (assignGuestDetails) {
      assignGuestDetails.textContent = `${res.reservation_date} • ${res.time_slot} • ${res.seating_zone || 'Open-Sky Terrace'}`;
    }
    if (assignTableNumberInput) assignTableNumberInput.value = res.table_number || '';
    if (checkAutoMarkSeated) checkAutoMarkSeated.checked = false;
    if (btnClearAssignTable) {
      btnClearAssignTable.style.display = res.table_number ? 'inline-flex' : 'none';
    }

    adminAssignTableModal.style.display = 'flex';
  }

  function closeAssignTableModal() {
    if (adminAssignTableModal) adminAssignTableModal.style.display = 'none';
  }

  function openAddReservationModal() {
    if (!adminAddReservationModal) return;
    if (adminAddReservationForm) adminAddReservationForm.reset();
    if (addResDate) {
      const today = getLocalDateString(new Date());
      addResDate.value = today;
      addResDate.min = today;
    }
    adminAddReservationModal.style.display = 'flex';
  }

  function closeAddReservationModal() {
    if (adminAddReservationModal) adminAddReservationModal.style.display = 'none';
  }

  // Event Listeners for Table Reservations
  if (resDateFilters) {
    resDateFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('.pill-filter-btn');
      if (!btn) return;
      resDateFilters.querySelectorAll('.pill-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      resDateFilter = btn.dataset.resDate || 'today';
      if (resCustomDateRow) {
        resCustomDateRow.style.display = (resDateFilter === 'custom') ? 'flex' : 'none';
      }
      renderReservationsTab();
    });
  }

  if (resStatusFilters) {
    resStatusFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('.pill-filter-btn');
      if (!btn) return;
      resStatusFilters.querySelectorAll('.pill-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      resStatusFilter = btn.dataset.resStatus || 'all';
      renderReservationsTab();
    });
  }

  if (resZoneFilterSelect) {
    resZoneFilterSelect.addEventListener('change', () => {
      resZoneFilter = resZoneFilterSelect.value;
      renderReservationsTab();
    });
  }

  if (resSearchInput) {
    resSearchInput.addEventListener('input', () => {
      resSearchQuery = resSearchInput.value.trim().toLowerCase();
      renderReservationsTab();
    });
  }

  if (btnRefreshReservations) {
    btnRefreshReservations.addEventListener('click', async () => {
      await fetchTableReservations();
      showAdminToast('Refreshed reservations from cloud');
    });
  }

  if (btnApplyResCustomDate) {
    btnApplyResCustomDate.addEventListener('click', () => {
      resCustomStart = resCustomStartDate ? resCustomStartDate.value : '';
      resCustomEnd = resCustomEndDate ? resCustomEndDate.value : '';
      if (!resCustomStart || !resCustomEnd) {
        showAdminToast('Please select both start and end dates', false);
        return;
      }
      if (resCustomStart > resCustomEnd) {
        showAdminToast('Start date cannot be after end date', false);
        return;
      }
      renderReservationsTab();
    });
  }

  if (btnOpenAddReservationModal) {
    btnOpenAddReservationModal.addEventListener('click', openAddReservationModal);
  }
  if (btnEmptyAddReservation) {
    btnEmptyAddReservation.addEventListener('click', openAddReservationModal);
  }
  if (btnCloseAddReservationModal) {
    btnCloseAddReservationModal.addEventListener('click', closeAddReservationModal);
  }
  if (btnCancelAddReservationModal) {
    btnCancelAddReservationModal.addEventListener('click', closeAddReservationModal);
  }

  if (adminAddReservationForm) {
    adminAddReservationForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      let cleanPhone = addResPhone.value.trim().replace(/\D/g, '');
      if (cleanPhone.length > 10 && cleanPhone.startsWith('91')) {
        cleanPhone = cleanPhone.slice(2);
      } else if (cleanPhone.length > 10 && cleanPhone.startsWith('0')) {
        cleanPhone = cleanPhone.slice(1);
      }

      if (cleanPhone.length < 10) {
        showAdminToast('Please enter a valid 10-digit mobile number', false);
        addResPhone.focus();
        return;
      }

      const payload = {
        guest_name: addResName.value.trim(),
        guest_phone: cleanPhone,
        reservation_date: addResDate.value,
        time_slot: addResTime.value,
        guest_count: parseInt(addResGuests.value, 10) || 2,
        seating_zone: addResZone.value,
        table_number: addResTable.value.trim() || null,
        status: addResStatus.value || 'confirmed',
        special_notes: addResNotes.value.trim() || null
      };

      const success = await createAdminReservation(payload);
      if (success) {
        closeAddReservationModal();
      }
    });
  }

  if (btnCloseAssignTableModal) {
    btnCloseAssignTableModal.addEventListener('click', closeAssignTableModal);
  }
  if (btnCancelAssignTableModal) {
    btnCancelAssignTableModal.addEventListener('click', closeAssignTableModal);
  }

  if (btnClearAssignTable) {
    btnClearAssignTable.addEventListener('click', async () => {
      const resId = assignReservationId.value;
      if (!resId) return;
      await assignTableNumber(resId, null, false);
      closeAssignTableModal();
    });
  }

  if (adminAddReservationModal) {
    adminAddReservationModal.addEventListener('click', (e) => {
      if (e.target === adminAddReservationModal) closeAddReservationModal();
    });
  }

  if (adminAssignTableModal) {
    adminAssignTableModal.addEventListener('click', (e) => {
      if (e.target === adminAssignTableModal) closeAssignTableModal();
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.admin-modal-overlay').forEach((modal) => {
        if (modal.style.display === 'flex' || modal.classList.contains('active') || (modal.style.display && modal.style.display !== 'none')) {
          modal.style.display = 'none';
          modal.classList.remove('active');
        }
      });
    }
  });

  if (quickTablePresets) {
    quickTablePresets.addEventListener('click', (e) => {
      const btn = e.target.closest('.table-preset-btn');
      if (!btn) return;
      if (assignTableNumberInput) {
        assignTableNumberInput.value = btn.dataset.table;
      }
    });
  }

  if (adminAssignTableForm) {
    adminAssignTableForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const resId = assignReservationId.value;
      const tableNum = assignTableNumberInput.value.trim();
      const andMarkSeated = checkAutoMarkSeated.checked;

      if (!resId || !tableNum) return;

      await assignTableNumber(resId, tableNum, andMarkSeated);
      closeAssignTableModal();
    });
  }

  if (reservationsGridContainer) {
    reservationsGridContainer.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const resId = btn.dataset.id;
      if (!resId) return;

      const res = allReservations.find(r => r.id === resId);
      if (!res) return;

      if (action === 'seat') {
        await updateReservationStatus(resId, 'seated');
      } else if (action === 'complete') {
        await updateReservationStatus(resId, 'completed');
      } else if (action === 'cancel') {
        if (confirm(`Cancel reservation for ${res.guest_name}?`)) {
          await updateReservationStatus(resId, 'cancelled');
        }
      } else if (action === 'reopen') {
        await updateReservationStatus(resId, 'confirmed');
      } else if (action === 'assign-table') {
        openAssignTableModal(res);
      }
    });
  }

  // --------------------------------------------------------------------------
  // TAB 2: MENU & INVENTORY MANAGEMENT RENDERING & EDITING
  // --------------------------------------------------------------------------
  if (menuSearchInput) {
    menuSearchInput.addEventListener('input', () => {
      menuSearchQuery = menuSearchInput.value.trim().toLowerCase();
      renderMenuTab();
    });
  }

  if (menuCategoryFilterSelect) {
    menuCategoryFilterSelect.addEventListener('change', () => {
      menuCategoryFilter = menuCategoryFilterSelect.value;
      renderMenuTab();
    });
  }

  if (menuStockFilterSelect) {
    menuStockFilterSelect.addEventListener('change', () => {
      menuStockFilter = menuStockFilterSelect.value;
      renderMenuTab();
    });
  }

  if (menuDietaryFilterSelect) {
    menuDietaryFilterSelect.addEventListener('change', () => {
      menuDietaryFilter = menuDietaryFilterSelect.value;
      renderMenuTab();
    });
  }

  function renderMenuTab() {
    if (!menuTableBody) return;

    const filtered = allMenuItems.filter(item => {
      // Category filter
      if (menuCategoryFilter !== 'all' && item.category !== menuCategoryFilter) {
        return false;
      }

      // Stock filter
      if (menuStockFilter === 'in_stock' && item.is_available === false) {
        return false;
      }
      if (menuStockFilter === 'sold_out' && item.is_available !== false) {
        return false;
      }

      // Dietary filter
      if (menuDietaryFilter === 'veg' && item.is_veg === false) {
        return false;
      }
      if (menuDietaryFilter === 'nonveg' && item.is_veg !== false) {
        return false;
      }

      // Search query
      if (menuSearchQuery) {
        const nameMatch = (item.name || '').toLowerCase().includes(menuSearchQuery);
        const codeMatch = (item.petpooja_item_code || '').toLowerCase().includes(menuSearchQuery);
        if (!nameMatch && !codeMatch) return false;
      }

      return true;
    });

    if (filtered.length === 0) {
      menuTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 40px; color: var(--admin-text-muted);">
            No dishes found matching your search and filter criteria.
          </td>
        </tr>
      `;
      return;
    }

    let html = '';
    filtered.forEach(dish => {
      const isAvailable = dish.is_available !== false;
      const imgPath = dish.image_url || 'assets/dishes/dish_1.jpeg';

      html += `
        <tr data-dish-id="${dish.id}">
          <td>
            <img src="${imgPath}" alt="${escapeHtml(dish.name)}" class="dish-thumb-img" onerror="this.src='assets/dishes/cheesy-burger.jpeg'">
          </td>
          <td class="dish-name-cell">
            <strong>${escapeHtml(dish.name)}</strong>
            <small style="color: #78716c; font-size: 0.75rem;">${dish.is_veg === false ? '🔴 Non-Veg' : '🟢 Pure Veg'} • ₹${dish.price || 0}</small>
          </td>
          <td>
            <span class="category-badge">${escapeHtml(dish.category || 'General')}</span>
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="font-weight: 700; color: var(--admin-gold);">₹</span>
              <input type="number" class="dish-price-input inline-price-input" value="${dish.price || 0}" data-id="${dish.id}" min="1">
            </div>
          </td>
          <td>
            <div class="stock-switch-wrap">
              <label class="toggle-switch">
                <input type="checkbox" class="stock-toggle-checkbox" data-id="${dish.id}" ${isAvailable ? 'checked' : ''}>
                <span class="slider-toggle"></span>
              </label>
              <span class="stock-status-label ${isAvailable ? 'in-stock' : 'sold-out'}">
                ${isAvailable ? '🟢 In Stock' : '🔴 Sold Out'}
              </span>
            </div>
          </td>
          <td style="text-align: right;">
            <div style="display: inline-flex; align-items: center; gap: 6px; justify-content: flex-end;">
              <button type="button" class="btn-action-outline btn-edit-dish" data-id="${dish.id}" title="Edit Dish Details" style="padding: 6px 10px; font-size: 0.78rem;">
                <i class="fas fa-edit"></i> Edit
              </button>
              <button type="button" class="btn-action-outline btn-delete-dish" data-id="${dish.id}" data-name="${escapeHtml(dish.name)}" title="Delete Dish from Menu" style="padding: 6px 10px; font-size: 0.78rem; color: #ef4444; border-color: rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.04);">
                <i class="fas fa-trash-alt"></i> Delete
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    menuTableBody.innerHTML = html;
    attachMenuTableListeners();
  }

  function attachMenuTableListeners() {
    // 1. Stock toggle switch
    document.querySelectorAll('.stock-toggle-checkbox').forEach(cb => {
      cb.addEventListener('change', async () => {
        const dishId = cb.dataset.id;
        const newStatus = cb.checked;
        await updateDishAvailability(dishId, newStatus);
      });
    });

    // 2. Inline price input edit
    document.querySelectorAll('.inline-price-input').forEach(inp => {
      inp.addEventListener('change', async () => {
        const dishId = inp.dataset.id;
        const newPrice = parseInt(inp.value, 10);
        if (isNaN(newPrice) || newPrice <= 0) {
          alert('Please enter a valid price amount');
          return;
        }
        await updateDishPrice(dishId, newPrice);
      });
    });

    // 3. Edit dish modal trigger
    document.querySelectorAll('.btn-edit-dish').forEach(btn => {
      btn.addEventListener('click', () => {
        const dishId = btn.dataset.id;
        openEditDishModal(dishId);
      });
    });

    // 4. Delete dish button
    document.querySelectorAll('.btn-delete-dish').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const dishId = btn.dataset.id;
        const dishName = btn.dataset.name || 'this dish';
        const confirmed = window.confirm(`Are you sure you want to permanently delete "${dishName}" from the menu?\n\nThis will remove it from both the Admin Portal and Customer Ordering.`);
        if (!confirmed) return;
        await deleteDish(dishId, dishName);
      });
    });
  }

  // Update dish availability in Supabase (Syncs to frontend!)
  async function updateDishAvailability(dishId, isAvailable) {
    if (!supabaseClient) return;
    try {
      const { error } = await supabaseClient
        .from('menu_items')
        .update({
          is_available: isAvailable,
          updated_at: new Date().toISOString()
        })
        .eq('id', dishId);

      if (error) {
        console.warn('updateDishAvailability error:', error.message);
        alert('Could not update dish availability: ' + error.message);
        return;
      }

      // Update in-memory
      const dish = allMenuItems.find(d => d.id === dishId);
      if (dish) dish.is_available = isAvailable;

      showAdminToast(isAvailable ? `🟢 "${dish ? dish.name : 'Dish'}" is now IN STOCK in kitchen` : `🔴 "${dish ? dish.name : 'Dish'}" marked SOLD OUT in kitchen`);
      updateKPISummaries();
      renderMenuTab();
    } catch (err) {
      console.warn('updateDishAvailability error:', err);
    }
  }

  // Update dish price in Supabase
  async function updateDishPrice(dishId, newPrice) {
    if (!supabaseClient) return;
    try {
      const { error } = await supabaseClient
        .from('menu_items')
        .update({
          price: newPrice,
          updated_at: new Date().toISOString()
        })
        .eq('id', dishId);

      if (error) {
        alert('Price update error: ' + error.message);
        return;
      }

      const dish = allMenuItems.find(d => d.id === dishId);
      if (dish) dish.price = newPrice;

      showAdminToast(`✓ Price for "${dish ? dish.name : 'Dish'}" updated to ₹${newPrice}`);
    } catch (err) {
      console.warn('updateDishPrice error:', err);
    }
  }

  // Delete dish from Supabase & in-memory cache
  async function deleteDish(dishId, dishName) {
    if (!dishId) return;
    try {
      if (supabaseClient) {
        const { error } = await supabaseClient
          .from('menu_items')
          .delete()
          .eq('id', dishId);

        if (error) {
          console.warn('deleteDish error:', error.message);
          alert('Could not delete dish from database: ' + error.message);
          return;
        }
      }

      // Remove from in-memory array
      allMenuItems = allMenuItems.filter(d => String(d.id) !== String(dishId));

      // Update cache
      try {
        localStorage.setItem('breeze_menu_items_cache', JSON.stringify(allMenuItems));
      } catch (e) {}

      showAdminToast(`🗑️ "${dishName || 'Dish'}" deleted successfully!`);
      updateKPISummaries();
      renderMenuTab();
    } catch (err) {
      console.warn('deleteDish error:', err);
      alert('An error occurred while deleting the dish: ' + (err.message || err));
    }
  }

  // --------------------------------------------------------------------------
  // DISH IMAGE DRAG-AND-DROP & INSTANT UPLOAD HELPER
  // --------------------------------------------------------------------------
  function compressImageIfNeeded(dataUrl, maxDimension = 1000, quality = 0.85) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width <= maxDimension && height <= maxDimension && dataUrl.length < 500000) {
          resolve(dataUrl);
          return;
        }
        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  function setupDishImageUpload(config) {
    const { dropzoneId, fileInputId, previewWrapperId, previewImgId, previewNameId, removeBtnId, urlInputId } = config;
    const dropzone = document.getElementById(dropzoneId);
    const fileInput = document.getElementById(fileInputId);
    const previewWrapper = document.getElementById(previewWrapperId);
    const previewImg = document.getElementById(previewImgId);
    const previewName = document.getElementById(previewNameId);
    const removeBtn = document.getElementById(removeBtnId);
    const urlInput = document.getElementById(urlInputId);

    if (!dropzone || !fileInput || !urlInput) return { updatePreview: () => {} };

    function updatePreview(url, name) {
      if (url && previewImg && previewWrapper) {
        previewImg.src = url;
        if (previewName) previewName.textContent = name || 'Dish image selected';
        previewWrapper.style.display = 'flex';
        urlInput.value = url;
      } else if (previewWrapper) {
        previewWrapper.style.display = 'none';
        if (previewImg) previewImg.src = '';
      }
    }

    async function handleFile(file) {
      if (!file || !file.type.startsWith('image/')) {
        alert('Please choose a valid image file (PNG, JPG, WebP).');
        return;
      }
      const reader = new FileReader();
      reader.onload = async (e) => {
        const rawUrl = e.target.result;
        const optimized = await compressImageIfNeeded(rawUrl);
        updatePreview(optimized, file.name);
      };
      reader.readAsDataURL(file);
    }

    dropzone.addEventListener('click', (e) => {
      if (e.target !== fileInput) {
        fileInput.click();
      }
    });
    fileInput.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'dragend'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
      const files = e.dataTransfer ? e.dataTransfer.files : null;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFile(e.target.files[0]);
      }
      fileInput.value = '';
    });

    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.value = '';
        urlInput.value = '';
        updatePreview('', '');
      });
    }

    urlInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (val) {
        updatePreview(val, 'Direct image URL');
      } else {
        updatePreview('', '');
      }
    });

    return { updatePreview };
  }

  const editDishUploader = setupDishImageUpload({
    dropzoneId: 'editDishDropzone',
    fileInputId: 'editDishFileInput',
    previewWrapperId: 'editDishPreviewWrapper',
    previewImgId: 'editDishPreviewImg',
    previewNameId: 'editDishPreviewName',
    removeBtnId: 'btnRemoveEditDishImage',
    urlInputId: 'editDishImageUrl'
  });

  const newDishUploader = setupDishImageUpload({
    dropzoneId: 'newDishDropzone',
    fileInputId: 'newDishFileInput',
    previewWrapperId: 'newDishPreviewWrapper',
    previewImgId: 'newDishPreviewImg',
    previewNameId: 'newDishPreviewName',
    removeBtnId: 'btnRemoveNewDishImage',
    urlInputId: 'newDishImageUrl'
  });

  // MODAL: EDIT DISH
  function openEditDishModal(dishId) {
    const dish = allMenuItems.find(d => d.id === dishId);
    if (!dish) return;

    editDishId.value = dish.id;
    editDishName.value = dish.name || '';
    editDishPrice.value = dish.price || 0;
    editDishCategory.value = dish.category || 'burgers';
    if (editDishPetpoojaCode) editDishPetpoojaCode.value = dish.petpooja_item_code || '';
    editDishImageUrl.value = dish.image_url || '';
    editDishUploader.updatePreview(dish.image_url || '', dish.name || 'Dish Photo');

    const isVeg = dish.is_veg !== false;
    const editVegRadio = document.querySelector('input[name="editDishIsVeg"][value="true"]');
    const editNonVegRadio = document.querySelector('input[name="editDishIsVeg"][value="false"]');
    if (isVeg && editVegRadio) editVegRadio.checked = true;
    else if (!isVeg && editNonVegRadio) editNonVegRadio.checked = true;

    if (editDishModal) {
      editDishModal.style.display = 'flex';
      document.body.classList.add('modal-open');
      document.documentElement.classList.add('modal-open');
    }
  }

  if (btnCloseEditDishModal) btnCloseEditDishModal.addEventListener('click', closeEditDishModal);
  if (btnCancelEditDishModal) btnCancelEditDishModal.addEventListener('click', closeEditDishModal);

  if (btnDeleteDishFromModal) {
    btnDeleteDishFromModal.addEventListener('click', async () => {
      const id = editDishId.value;
      const name = editDishName.value || 'this dish';
      if (!id) return;
      const confirmed = window.confirm(`Are you sure you want to permanently delete "${name}" from the menu?\n\nThis will remove it from both the Admin Portal and Customer Ordering.`);
      if (!confirmed) return;
      closeEditDishModal();
      await deleteDish(id, name);
    });
  }

  function closeEditDishModal() {
    if (editDishModal) {
      editDishModal.style.display = 'none';
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
    }
    editDishUploader.updatePreview('', '');
  }

  if (editDishForm) {
    editDishForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = editDishId.value;
      const targetDish = allMenuItems.find(d => d.id === id);
      const selectedEditVeg = document.querySelector('input[name="editDishIsVeg"]:checked');
      const isVeg = selectedEditVeg ? selectedEditVeg.value === 'true' : true;
      const payload = {
        name: editDishName.value.trim(),
        price: parseInt(editDishPrice.value, 10),
        category: editDishCategory.value,
        petpooja_item_code: (editDishPetpoojaCode ? editDishPetpoojaCode.value.trim() : null) || targetDish?.petpooja_item_code || null,
        image_url: editDishImageUrl.value.trim(),
        is_veg: isVeg,
        updated_at: new Date().toISOString()
      };

      if (!supabaseClient) return;
      try {
        const { error } = await supabaseClient
          .from('menu_items')
          .update(payload)
          .eq('id', id);

        if (error) {
          alert('Save error: ' + error.message);
          return;
        }

        const idx = allMenuItems.findIndex(d => d.id === id);
        if (idx !== -1) {
          allMenuItems[idx] = Object.assign({}, allMenuItems[idx], payload);
        }
        try { localStorage.setItem('breeze_menu_items_cache', JSON.stringify(allMenuItems)); } catch(e){}

        closeEditDishModal();
        showAdminToast(`✓ Dish "${payload.name}" updated successfully!`);
        renderMenuTab();
      } catch (err) {
        console.warn('editDishForm submit error:', err);
      }
    });
  }

  // MODAL: ADD DISH
  if (btnOpenAddDishModal) {
    btnOpenAddDishModal.addEventListener('click', () => {
      if (addDishModal) {
        addDishModal.style.display = 'flex';
        document.body.classList.add('modal-open');
        document.documentElement.classList.add('modal-open');
      }
      newDishUploader.updatePreview(newDishImageUrl ? newDishImageUrl.value : '', 'Default preview');
    });
  }

  if (btnCloseAddDishModal) btnCloseAddDishModal.addEventListener('click', closeAddDishModal);
  if (btnCancelAddDishModal) btnCancelAddDishModal.addEventListener('click', closeAddDishModal);

  function closeAddDishModal() {
    if (addDishModal) {
      addDishModal.style.display = 'none';
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
    }
    const defaultNewVeg = document.querySelector('input[name="newDishIsVeg"][value="true"]');
    if (defaultNewVeg) defaultNewVeg.checked = true;
    newDishUploader.updatePreview('', '');
  }

  if (addDishForm) {
    addDishForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const selectedNewVeg = document.querySelector('input[name="newDishIsVeg"]:checked');
      const isVeg = selectedNewVeg ? selectedNewVeg.value === 'true' : true;
      const payload = {
        name: newDishName.value.trim(),
        price: parseInt(newDishPrice.value, 10),
        category: newDishCategory.value,
        petpooja_item_code: (newDishPetpoojaCode ? newDishPetpoojaCode.value.trim() : null) || null,
        image_url: newDishImageUrl.value.trim() || 'assets/dishes/cheesy-burger.jpeg',
        is_veg: isVeg,
        is_available: newDishInStock.checked,
        sort_order: allMenuItems.length + 1
      };

      if (!supabaseClient) return;
      try {
        const { data, error } = await supabaseClient
          .from('menu_items')
          .insert(payload)
          .select()
          .single();

        if (error) {
          alert('Error adding dish: ' + error.message);
          return;
        }

        allMenuItems.push(data);
        closeAddDishModal();
        addDishForm.reset();
        const defaultNewVeg = document.querySelector('input[name="newDishIsVeg"][value="true"]');
        if (defaultNewVeg) defaultNewVeg.checked = true;
        newDishUploader.updatePreview('', '');

        showAdminToast(`✓ "${payload.name}" added to menu!`);
        updateKPISummaries();
        renderMenuTab();
      } catch (err) {
        console.warn('addDishForm submit error:', err);
      }
    });
  }

  // --------------------------------------------------------------------------
  // TAB 3: DELIVERY FLEET & RIDERS (ADD, DELETE, AUTO-GENERATE CREDENTIALS)
  // --------------------------------------------------------------------------
  function getNextRiderId() {
    let maxNum = 0;
    allRiders.forEach(r => {
      const match = (r.id || '').match(/RIDER-0*(\d+)/i);
      if (match) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
    });
    return 'RIDER-' + String(maxNum + 1).padStart(2, '0');
  }

  function generateRiderPassword() {
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    return 'brz' + randomDigits;
  }

  function copyRiderCredentialsToClipboard(name, id, pass) {
    const text = `🛵 Breeze The Rooftop Cafe — Delivery Partner Login\nName: ${name || 'Partner'}\nPortal: https://breezecafe.pages.dev/rider/\nPartner ID: ${id}\nPasscode: ${pass}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showAdminToast(`📋 Credentials for ${name || id} copied to clipboard!`);
      }).catch(() => {
        prompt('Copy Rider Credentials:', text);
      });
    } else {
      prompt('Copy Rider Credentials:', text);
    }
  }

  function renderRidersTab() {
    if (!ridersGridContainer) return;

    const totalRiders = allRiders.length;
    const onlineRiders = allRiders.filter(r => r.status !== 'offline').length;
    const activeDelivering = allRiders.filter(r => r.status === 'on_delivery').length;
    const availCount = allRiders.filter(r => r.status === 'available').length;

    // Compute fleet-wide pending cash & unsettled orders
    let fleetTotalPendingCash = 0;
    let fleetTotalPendingOrdersCount = 0;

    allRiders.forEach(r => {
      const rDeliveredCod = allOrders.filter(o => 
        String(o.rider_id || '').toUpperCase() === String(r.id || '').toUpperCase() && 
        o.status === 'delivered' && 
        (o.payment_method === 'cod' || Number(o.cash_collected) > 0) &&
        !o.settled_with_admin
      );
      const computed = rDeliveredCod.reduce((sum, o) => sum + (Number(o.cash_collected !== undefined && o.cash_collected !== null ? o.cash_collected : o.total_amount) || 0), 0);
      const rDue = computed > 0 ? computed : (Number(r.cash_in_hand) || 0);
      fleetTotalPendingCash += rDue;
      fleetTotalPendingOrdersCount += rDeliveredCod.length;
    });

    // Filter settlements and delivered orders by active analytics period
    const periodSettlements = allSettlements.filter(s => isRecordInActivePeriod(s.created_at));
    const fleetPeriodSettledCash = periodSettlements.reduce((sum, s) => sum + (Number(s.amount_settled) || 0), 0);

    const periodDeliveredOrders = allOrders.filter(o => o.status === 'delivered' && o.rider_id && isRecordInActivePeriod(o.delivered_at || o.created_at));
    const fleetPeriodCompletedDeliveries = periodDeliveredOrders.length;

    // Period label for fleet subtitle
    let fleetPeriodSubtitle = getActivePeriodLabel();

    if (badgeRidersCount) {
      badgeRidersCount.textContent = availCount;
    }

    if (fleetStatusSummary) {
      fleetStatusSummary.textContent = `(${totalRiders} Registered • ${availCount} Available • ${activeDelivering} On Delivery)`;
    }

    // Update Fleet KPI Cards
    if (dispFleetTotalRiders) dispFleetTotalRiders.textContent = totalRiders;
    if (dispFleetOnlineSub) dispFleetOnlineSub.textContent = `${onlineRiders} Active on Shift`;
    if (dispFleetPendingCash) dispFleetPendingCash.textContent = `₹${fleetTotalPendingCash.toFixed(2)}`;
    if (dispFleetPendingOrdersSub) dispFleetPendingOrdersSub.textContent = `${fleetTotalPendingOrdersCount} Unsettled Orders`;
    
    if (dispFleetDeliveriesLabel) dispFleetDeliveriesLabel.textContent = `Deliveries Completed`;
    if (dispFleetDeliveriesSub) dispFleetDeliveriesSub.textContent = fleetPeriodSubtitle;
    if (dispFleetTotalDeliveries) dispFleetTotalDeliveries.textContent = fleetPeriodCompletedDeliveries;

    if (dispFleetSettledLabel) dispFleetSettledLabel.textContent = `Counter Cash Cleared`;
    if (dispFleetSettledCash) dispFleetSettledCash.textContent = `₹${fleetPeriodSettledCash.toFixed(2)}`;
    if (dispFleetSettledCountSub) dispFleetSettledCountSub.textContent = `${periodSettlements.length} Remittance Settlement${periodSettlements.length !== 1 ? 's' : ''} (${fleetPeriodSubtitle})`;

    if (allRiders.length === 0) {
      ridersGridContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; background: var(--admin-surface); border: 1px solid var(--admin-border); border-radius: 18px;">
          <i class="fas fa-motorcycle" style="font-size: 2.5rem; color: var(--admin-gold); margin-bottom: 12px; display: block;"></i>
          <h4 style="font-size: 1.1rem; font-weight: 800; color: var(--admin-text-main);">No delivery partners registered yet</h4>
          <p style="font-size: 0.85rem; color: var(--admin-text-muted); margin-top: 4px;">Click "+ Add Delivery Partner" above to register a rider with auto-generated credentials.</p>
        </div>
      `;
      return;
    }

    let html = '';
    allRiders.forEach(rider => {
      const status = rider.status || 'available';
      const isOnline = status !== 'offline';
      const riderPass = rider.passcode || '••••••••';

      let statusBadge = '<span class="rider-status-tag available"><i class="fas fa-circle" style="font-size: 6px;"></i> Available</span>';
      if (status === 'on_delivery') {
        statusBadge = `<span class="rider-status-tag on_delivery"><i class="fas fa-motorcycle"></i> Delivering ${rider.active_order_id ? ('#' + rider.active_order_id) : ''}</span>`;
      } else if (status === 'offline') {
        statusBadge = '<span class="rider-status-tag offline"><i class="fas fa-moon"></i> Offline</span>';
      }

      // Unsettled Cash In Hand / Due calculation
      const riderDeliveredCod = allOrders.filter(o => 
        String(o.rider_id || '').toUpperCase() === String(rider.id || '').toUpperCase() &&
        o.status === 'delivered' &&
        (o.payment_method === 'cod' || Number(o.cash_collected) > 0)
      );
      const unsettledOrders = riderDeliveredCod.filter(o => !o.settled_with_admin);
      const computedDue = unsettledOrders.reduce((sum, o) => {
        return sum + (Number(o.cash_collected !== undefined && o.cash_collected !== null ? o.cash_collected : o.total_amount) || 0);
      }, 0);
      const riderDbCash = Number(rider.cash_in_hand) || 0;
      const due = computedDue > 0 ? computedDue : riderDbCash;
      const unsettledCount = unsettledOrders.length;
      const riderPeriodDeliveries = allOrders.filter(o => String(o.rider_id || '').toUpperCase() === String(rider.id || '').toUpperCase() && o.status === 'delivered' && isRecordInActivePeriod(o.delivered_at || o.created_at)).length;

      html += `
        <div class="rider-card" data-rider-id="${rider.id}">
          <div class="rider-card-top">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div class="rider-avatar-bubble">${(rider.name || 'R').charAt(0).toUpperCase()}</div>
              <div>
                <strong style="color: var(--admin-text-main); font-size: 1rem; display: block;">${escapeHtml(rider.name || rider.id)}</strong>
                <small style="color: var(--admin-text-muted); font-size: 0.78rem;">${escapeHtml(rider.id)}</small>
              </div>
            </div>
            ${statusBadge}
          </div>

          <div style="background: #faf7f2; border: 1px solid var(--admin-border-light); border-radius: 12px; padding: 12px; font-size: 0.82rem; line-height: 1.6;">
            <div><i class="fas fa-phone" style="color: var(--admin-gold); width: 16px;"></i> <strong>Phone:</strong> <a href="tel:${rider.phone}" style="color: inherit;">${rider.phone || 'N/A'}</a></div>
            <div><i class="fas fa-car" style="color: var(--admin-gold); width: 16px;"></i> <strong>Vehicle:</strong> ${escapeHtml(rider.vehicle_type || 'Vehicle')} • ${escapeHtml(rider.vehicle_number || 'MH-48')}</div>
            <div><i class="fas fa-check-circle" style="color: #16a34a; width: 16px;"></i> <strong>Deliveries (${fleetPeriodSubtitle}):</strong> ${riderPeriodDeliveries} <span style="color: var(--admin-text-muted); font-size: 0.76rem;">(${rider.total_deliveries || 0} lifetime)</span></div>
          </div>

          <!-- Rider Cash In Hand (Due / Settled) Card -->
          <div class="rider-cash-due-card ${due > 0 ? 'has-due' : 'is-clear'}">
            <div class="rider-cash-due-header">
              <span style="font-weight: 700; color: ${due > 0 ? '#92400e' : '#166534'}; display: inline-flex; align-items: center; gap: 6px;">
                <i class="fas fa-wallet"></i> Cash In Hand (Due):
              </span>
              <span class="rider-cash-due-amt">₹${due.toFixed(2)}</span>
            </div>
            ${due > 0 ? `
              <div class="rider-cash-due-actions">
                <span class="rider-due-count-pill">${unsettledCount} Unsettled Order${unsettledCount !== 1 ? 's' : ''}</span>
                <button type="button" class="btn-settle-rider-due" data-id="${rider.id}" data-name="${escapeHtml(rider.name || rider.id)}" data-due="${due}">
                  <i class="fas fa-hand-holding-usd"></i> Settle Due
                </button>
              </div>
            ` : `
              <div class="rider-cash-clear-badge">
                <i class="fas fa-check-circle" style="color: #16a34a;"></i>
                <span>All Counter Dues Cleared ${rider.last_settled_at ? `(${formatRelativeTime(rider.last_settled_at)})` : '✅'}</span>
              </div>
            `}
          </div>

          <!-- Rider Credentials Box (Click to copy) -->
          <div style="background: #ffffff; border: 1px dashed var(--admin-border); border-radius: 10px; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem;">
            <div>
              <span style="color: var(--admin-text-muted);">Login ID:</span> <strong style="font-family: var(--font-mono); color: var(--admin-text-main); margin-right: 8px;">${escapeHtml(rider.id)}</strong>
              <span style="color: var(--admin-text-muted);">Pass:</span> <code style="background: #faf7f2; padding: 2px 6px; border-radius: 4px; font-weight: 800; color: var(--admin-gold); font-family: var(--font-mono);">${escapeHtml(riderPass)}</code>
            </div>
            <button type="button" class="btn-copy-rider-card-creds" data-id="${rider.id}" data-name="${escapeHtml(rider.name || rider.id)}" data-pass="${escapeHtml(riderPass)}" title="Copy Credentials for WhatsApp" style="background: var(--admin-gold-light); border: 1px solid var(--admin-gold-border); color: var(--admin-gold); padding: 3px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
              <i class="fas fa-copy"></i> Copy
            </button>
          </div>

          <div style="display: flex; gap: 8px; margin-top: 4px;">
            <button type="button" class="btn-action-outline btn-toggle-rider-status" data-id="${rider.id}" data-current="${status}" style="flex: 1;">
              <i class="fas ${isOnline ? 'fa-moon' : 'fa-sun'}"></i> ${isOnline ? 'Mark Offline' : 'Mark Online'}
            </button>
            <a href="/rider" target="_blank" class="btn-action-outline" style="flex: 0 0 auto;" title="Open Rider Login Portal">
              <i class="fas fa-external-link-alt"></i> Rider App
            </a>
            <button type="button" class="btn-action-outline btn-delete-rider" data-id="${rider.id}" data-name="${escapeHtml(rider.name || rider.id)}" title="Delete Delivery Partner" style="flex: 0 0 auto; color: #dc2626; border-color: #fecaca; background: #ffffff;">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>
      `;
    });

    ridersGridContainer.innerHTML = html;

    // Attach Settle Due click handlers
    ridersGridContainer.querySelectorAll('.btn-settle-rider-due').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rId = btn.dataset.id;
        const rName = btn.dataset.name;
        const rDue = Number(btn.dataset.due) || 0;
        openSettleRiderModal(rId, rName, rDue);
      });
    });

    // Attach toggle status handlers
    ridersGridContainer.querySelectorAll('.btn-toggle-rider-status').forEach(btn => {
      btn.addEventListener('click', async () => {
        const riderId = btn.dataset.id;
        const current = btn.dataset.current;
        const newStatus = (current === 'offline') ? 'available' : 'offline';
        await updateRiderStatus(riderId, newStatus);
      });
    });

    // Attach Copy credentials handlers
    ridersGridContainer.querySelectorAll('.btn-copy-rider-card-creds').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const rId = btn.dataset.id;
        const rName = btn.dataset.name;
        const rPass = btn.dataset.pass;
        copyRiderCredentialsToClipboard(rName, rId, rPass);
      });
    });

    // Attach Delete rider handlers
    ridersGridContainer.querySelectorAll('.btn-delete-rider').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const rId = btn.dataset.id;
        const rName = btn.dataset.name;
        await executeRiderDelete(rId, rName);
      });
    });
  }

  async function executeRiderDelete(riderId, riderName) {
    const targetRider = allRiders.find(r => r.id === riderId);

    // 1. Safety Check: Is rider currently delivering an active order?
    if (targetRider && (targetRider.status === 'on_delivery' || targetRider.active_order_id)) {
      alert(`⚠️ Cannot delete "${riderName}" (${riderId})!\n\nThis rider is currently delivering active order #${targetRider.active_order_id || 'active'}.\n\nPlease reassign or complete that order in Live Orders before deleting this rider.`);
      return;
    }

    // 2. User Confirmation
    const confirmed = confirm(`🗑️ Delete Delivery Partner?\n\nAre you sure you want to permanently delete "${riderName}" (${riderId})?\n\nThey will be removed immediately from the database and will no longer be able to log in to the Rider Portal.`);
    if (!confirmed) return;

    if (!supabaseClient) return;
    try {
      const { error } = await supabaseClient
        .from('delivery_partners')
        .delete()
        .eq('id', riderId);

      if (error) {
        alert('Failed to delete rider: ' + error.message);
        return;
      }

      // Remove from memory
      allRiders = allRiders.filter(r => r.id !== riderId);

      showAdminToast(`✓ Partner "${riderName}" (${riderId}) deleted successfully.`);
      updateKPISummaries();
      renderRidersTab();
      if (activeAssignOrder) renderAssignRiderList();
    } catch (err) {
      console.warn('executeRiderDelete error:', err);
      alert('Delete failed: ' + err.message);
    }
  }

  async function updateRiderStatus(riderId, newStatus) {
    if (!supabaseClient) return;
    try {
      await supabaseClient
        .from('delivery_partners')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', riderId);

      const rider = allRiders.find(r => r.id === riderId);
      if (rider) rider.status = newStatus;

      showAdminToast(`Rider ${rider ? rider.name : riderId} is now ${newStatus}`);
      updateKPISummaries();
      renderRidersTab();
    } catch (err) {
      console.warn('updateRiderStatus error:', err);
    }
  }

  // MODAL: ADD RIDER (WITH AUTO-GENERATION)
  if (btnOpenAddRiderModal) {
    btnOpenAddRiderModal.addEventListener('click', () => {
      // Auto-generate next ID & clean passcode
      if (newRiderId) newRiderId.value = getNextRiderId();
      if (newRiderPasscode) newRiderPasscode.value = generateRiderPassword();
      if (newRiderName) newRiderName.value = '';
      if (newRiderPhone) newRiderPhone.value = '';
      if (newRiderVehicleNum) newRiderVehicleNum.value = '';
      if (newRiderVehicleType) newRiderVehicleType.value = 'Motorcycle';

      if (addRiderModal) addRiderModal.style.display = 'flex';
      if (newRiderName) setTimeout(() => newRiderName.focus(), 100);
    });
  }

  if (btnRegeneratePasscode) {
    btnRegeneratePasscode.addEventListener('click', () => {
      if (newRiderPasscode) newRiderPasscode.value = generateRiderPassword();
    });
  }

  if (btnCloseAddRiderModal) btnCloseAddRiderModal.addEventListener('click', closeAddRiderModal);
  if (btnCancelAddRiderModal) btnCancelAddRiderModal.addEventListener('click', closeAddRiderModal);

  function closeAddRiderModal() {
    if (addRiderModal) addRiderModal.style.display = 'none';
  }

  // MODAL 5B: RIDER CREATED CREDENTIALS CARD
  let latestCreatedRider = null;

  if (btnCloseRiderCreatedModal) {
    btnCloseRiderCreatedModal.addEventListener('click', () => {
      if (riderCreatedModal) riderCreatedModal.style.display = 'none';
      latestCreatedRider = null;
    });
  }

  if (btnCopyCreatedRiderCreds) {
    btnCopyCreatedRiderCreds.addEventListener('click', () => {
      if (!latestCreatedRider) return;
      copyRiderCredentialsToClipboard(latestCreatedRider.name, latestCreatedRider.id, latestCreatedRider.passcode);
    });
  }

  if (addRiderForm) {
    addRiderForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rId = newRiderId.value.trim().toUpperCase();
      const rName = newRiderName.value.trim();
      const rPhone = newRiderPhone.value.trim();
      const rPass = newRiderPasscode.value.trim() || generateRiderPassword();
      const vType = newRiderVehicleType.value;
      const vNum = newRiderVehicleNum.value.trim();

      if (!rName) {
        alert('Please enter the rider full name');
        return;
      }

      // Check if ID already exists
      if (allRiders.some(r => r.id === rId)) {
        alert(`Partner ID "${rId}" already exists. Please choose a unique ID.`);
        return;
      }

      const payload = {
        id: rId,
        name: rName,
        phone: rPhone,
        passcode: rPass,
        vehicle_type: vType,
        vehicle_number: vNum,
        status: 'available',
        total_deliveries: 0,
        is_active: true
      };

      if (!supabaseClient) return;
      try {
        const { data, error } = await supabaseClient
          .from('delivery_partners')
          .insert(payload);

        if (error) {
          const errMsg = error.message || String(error);
          if (errMsg.includes('UNIQUE constraint failed') || errMsg.includes('already exists')) {
            alert(`Partner ID "${rId}" already exists in database. Please click 'New' to generate a unique ID.`);
          } else {
            alert('Error registering rider: ' + errMsg);
          }
          return;
        }

        const registeredRider = { ...payload, ...(data || {}) };
        allRiders.push(registeredRider);
        closeAddRiderModal();
        addRiderForm.reset();

        // Open Success Credentials Modal
        latestCreatedRider = registeredRider;
        if (createdRiderDispName) createdRiderDispName.textContent = registeredRider.name;
        if (createdRiderDispId) createdRiderDispId.textContent = registeredRider.id;
        if (createdRiderDispPass) createdRiderDispPass.textContent = registeredRider.passcode || payload.passcode;
        if (riderCreatedModal) riderCreatedModal.style.display = 'flex';

        showAdminToast(`✓ Partner ${registeredRider.name} (${registeredRider.id}) registered successfully!`);
        updateKPISummaries();
        renderRidersTab();
      } catch (err) {
        console.warn('addRiderForm submit error:', err);
      }
    });
  }

  // --------------------------------------------------------------------------
  // MODAL 10: SETTLE RIDER CASH REMITTANCE (FULL & PARTIAL DUE CLEARANCE)
  // --------------------------------------------------------------------------
  function openSettleRiderModal(riderId, riderName, dueAmt) {
    if (!settleRiderModal) return;
    activeSettleRider = allRiders.find(r => r.id === riderId) || { id: riderId, name: riderName, cash_in_hand: dueAmt };

    activeSettleOrders = allOrders.filter(o => 
      String(o.rider_id || '').toUpperCase() === String(riderId || '').toUpperCase() &&
      o.status === 'delivered' &&
      (o.payment_method === 'cod' || Number(o.cash_collected) > 0) &&
      !o.settled_with_admin
    );
    // Sort oldest first so partial payments greedily clear oldest orders first
    activeSettleOrders.sort((a, b) => new Date(a.delivered_at || a.created_at) - new Date(b.delivered_at || b.created_at));

    const computedDue = activeSettleOrders.reduce((sum, o) => {
      return sum + (Number(o.cash_collected !== undefined && o.cash_collected !== null ? o.cash_collected : o.total_amount) || 0);
    }, 0);
    const effectiveDue = computedDue > 0 ? computedDue : (dueAmt > 0 ? dueAmt : (Number(activeSettleRider.cash_in_hand) || 0));

    if (settleModalRiderName) settleModalRiderName.textContent = riderName;
    if (settleModalRiderId) settleModalRiderId.textContent = riderId;
    if (settleModalDueAmount) settleModalDueAmount.textContent = `₹${effectiveDue.toFixed(2)}`;
    if (settleModalOrdersCount) settleModalOrdersCount.textContent = `${activeSettleOrders.length} Order${activeSettleOrders.length !== 1 ? 's' : ''}`;

    if (settleQuickFullLabel) settleQuickFullLabel.textContent = `₹${effectiveDue.toFixed(2)}`;

    if (settleModalOrdersList) {
      if (activeSettleOrders.length === 0) {
        settleModalOrdersList.innerHTML = `
          <div style="color: var(--admin-text-muted); text-align: center; padding: 12px;">
            Current wallet balance: <strong>₹${effectiveDue.toFixed(2)}</strong> (Recorded on rider shift balance)
          </div>
        `;
      } else {
        settleModalOrdersList.innerHTML = activeSettleOrders.map(o => {
          const oDue = Number(o.cash_collected !== undefined && o.cash_collected !== null ? o.cash_collected : o.total_amount) || 0;
          return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px dashed var(--admin-border-light);">
              <div>
                <strong style="color: var(--admin-text-main);">#${o.id}</strong>
                <span style="color: var(--admin-text-muted); margin-left: 6px;">${escapeHtml(o.customer_name || 'Customer')}</span>
                <small style="color: var(--admin-text-muted); display: block; font-size: 0.72rem;">${formatRelativeTime(o.delivered_at || o.created_at)}</small>
              </div>
              <div style="font-weight: 800; color: #b45309;">
                ₹${oDue.toFixed(2)}
              </div>
            </div>
          `;
        }).join('');
      }
    }

    if (inputSettleAmountReceived) {
      inputSettleAmountReceived.value = effectiveDue > 0 ? effectiveDue.toFixed(2) : '';
    }
    if (inputSettleNotes) inputSettleNotes.value = '';

    updateSettleCalculation();

    settleRiderModal.style.display = 'flex';
  }

  function updateSettleCalculation() {
    if (!activeSettleRider) return;
    const computedDue = (activeSettleOrders || []).reduce((sum, o) => {
      return sum + (Number(o.cash_collected !== undefined && o.cash_collected !== null ? o.cash_collected : o.total_amount) || 0);
    }, 0);
    const totalDue = computedDue > 0 ? computedDue : (Number(activeSettleRider.cash_in_hand) || 0);

    const amountVal = parseFloat(inputSettleAmountReceived ? inputSettleAmountReceived.value : '0') || 0;
    const isFull = amountVal >= (totalDue - 0.001) && totalDue > 0;
    const isPartial = amountVal > 0 && amountVal < (totalDue - 0.001);
    const remDue = Math.max(0, totalDue - amountVal);

    if (isFull) {
      if (settlePaymentModeBadge) {
        settlePaymentModeBadge.textContent = 'Full Payment';
        settlePaymentModeBadge.style.background = '#dcfce7';
        settlePaymentModeBadge.style.color = '#15803d';
      }
      if (settleDynamicHelper) {
        settleDynamicHelper.style.background = '#f0fdf4';
        settleDynamicHelper.style.borderColor = '#bbf7d0';
        settleDynamicHelper.style.color = '#166534';
      }
      if (settleHelperTitle) settleHelperTitle.textContent = 'Full Settlement';
      if (settleHelperRemaining) settleHelperRemaining.textContent = 'Remaining Due: ₹0.00';
      if (settleHelperDesc) {
        settleHelperDesc.textContent = `Clears all ${activeSettleOrders.length} order(s). Rider cash in hand will be reset to ₹0.00.`;
      }
      if (btnConfirmSettleRider) {
        btnConfirmSettleRider.innerHTML = `<i class="fas fa-check-circle"></i> Confirm Full Cash (₹${amountVal.toFixed(2)}) &amp; Clear Due`;
        btnConfirmSettleRider.style.background = 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)';
        btnConfirmSettleRider.style.borderColor = '#15803d';
      }
    } else if (isPartial) {
      let allocRem = amountVal;
      let clearedCount = 0;
      (activeSettleOrders || []).forEach(o => {
        const oDue = Number(o.cash_collected !== undefined && o.cash_collected !== null ? o.cash_collected : o.total_amount) || 0;
        if (allocRem >= oDue) {
          clearedCount++;
          allocRem -= oDue;
        }
      });

      if (settlePaymentModeBadge) {
        settlePaymentModeBadge.textContent = 'Partial Payment';
        settlePaymentModeBadge.style.background = '#fef3c7';
        settlePaymentModeBadge.style.color = '#b45309';
      }
      if (settleDynamicHelper) {
        settleDynamicHelper.style.background = '#fffbeb';
        settleDynamicHelper.style.borderColor = '#fde68a';
        settleDynamicHelper.style.color = '#92400e';
      }
      if (settleHelperTitle) settleHelperTitle.textContent = 'Partial Settlement';
      if (settleHelperRemaining) settleHelperRemaining.textContent = `Remaining Due: ₹${remDue.toFixed(2)}`;
      if (settleHelperDesc) {
        settleHelperDesc.textContent = `${clearedCount} of ${activeSettleOrders.length} order(s) will be fully settled. Remaining balance of ₹${remDue.toFixed(2)} stays recorded on rider's account.`;
      }
      if (btnConfirmSettleRider) {
        btnConfirmSettleRider.innerHTML = `<i class="fas fa-hand-holding-usd"></i> Confirm Partial Cash (₹${amountVal.toFixed(2)}) &amp; Keep ₹${remDue.toFixed(2)} Due`;
        btnConfirmSettleRider.style.background = 'linear-gradient(135deg, #d97706 0%, #b45309 100%)';
        btnConfirmSettleRider.style.borderColor = '#b45309';
      }
    } else {
      if (settlePaymentModeBadge) {
        settlePaymentModeBadge.textContent = 'Enter Amount';
        settlePaymentModeBadge.style.background = '#f1f5f9';
        settlePaymentModeBadge.style.color = '#64748b';
      }
      if (settleDynamicHelper) {
        settleDynamicHelper.style.background = '#fafaf9';
        settleDynamicHelper.style.borderColor = '#e7e5e4';
        settleDynamicHelper.style.color = '#78716c';
      }
      if (settleHelperTitle) settleHelperTitle.textContent = 'Awaiting Amount';
      if (settleHelperRemaining) settleHelperRemaining.textContent = `Total Due: ₹${totalDue.toFixed(2)}`;
      if (settleHelperDesc) {
        settleHelperDesc.textContent = 'Please enter the amount received from the rider at the register.';
      }
      if (btnConfirmSettleRider) {
        btnConfirmSettleRider.innerHTML = '<i class="fas fa-check-circle"></i> Confirm Cash Received';
        btnConfirmSettleRider.style.background = 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)';
        btnConfirmSettleRider.style.borderColor = '#15803d';
      }
    }
  }

  function closeSettleRiderModal() {
    if (settleRiderModal) settleRiderModal.style.display = 'none';
    activeSettleRider = null;
    activeSettleOrders = [];
  }

  if (btnCloseSettleRiderModal) btnCloseSettleRiderModal.addEventListener('click', closeSettleRiderModal);
  if (btnCancelSettleModal) btnCancelSettleModal.addEventListener('click', closeSettleRiderModal);

  if (inputSettleAmountReceived) {
    inputSettleAmountReceived.addEventListener('input', updateSettleCalculation);
    inputSettleAmountReceived.addEventListener('change', updateSettleCalculation);
  }

  if (btnSettleQuickFull) {
    btnSettleQuickFull.addEventListener('click', () => {
      if (!activeSettleRider) return;
      const computedDue = (activeSettleOrders || []).reduce((sum, o) => {
        return sum + (Number(o.cash_collected !== undefined && o.cash_collected !== null ? o.cash_collected : o.total_amount) || 0);
      }, 0);
      const totalDue = computedDue > 0 ? computedDue : (Number(activeSettleRider.cash_in_hand) || 0);
      if (inputSettleAmountReceived) {
        inputSettleAmountReceived.value = totalDue > 0 ? totalDue.toFixed(2) : '';
      }
      updateSettleCalculation();
    });
  }

  async function executeConfirmSettleRider() {
    if (!activeSettleRider) return;
    const targetRiderId = activeSettleRider.id;
    const targetRiderName = activeSettleRider.name || activeSettleRider.id;

    const amountVal = parseFloat(inputSettleAmountReceived ? inputSettleAmountReceived.value : '0');
    if (isNaN(amountVal) || amountVal <= 0) {
      alert('Please enter a valid amount received at the counter.');
      return;
    }

    const unsettled = (activeSettleOrders || []).slice();
    unsettled.sort((a, b) => new Date(a.delivered_at || a.created_at) - new Date(b.delivered_at || b.created_at));

    const totalDue = unsettled.length > 0 
      ? unsettled.reduce((s, o) => s + (Number(o.cash_collected !== undefined && o.cash_collected !== null ? o.cash_collected : o.total_amount) || 0), 0)
      : (Number(activeSettleRider.cash_in_hand) || 0);

    const isFullSettlement = amountVal >= (totalDue - 0.001);
    const remainingDue = Math.max(0, totalDue - amountVal);
    const notes = inputSettleNotes ? inputSettleNotes.value.trim() : '';
    const nowIso = new Date().toISOString();

    if (btnConfirmSettleRider) {
      btnConfirmSettleRider.disabled = true;
      btnConfirmSettleRider.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing Settlement...';
    }

    try {
      const fullySettledOrderIds = [];
      const partialOrderUpdates = []; // [{ id, cash_collected }]

      if (isFullSettlement) {
        unsettled.forEach(o => fullySettledOrderIds.push(o.id));
      } else {
        // Partial settlement allocation: greedy oldest-first
        let remAlloc = amountVal;
        for (const o of unsettled) {
          const oDue = Number(o.cash_collected !== undefined && o.cash_collected !== null ? o.cash_collected : o.total_amount) || 0;
          if (remAlloc >= oDue) {
            fullySettledOrderIds.push(o.id);
            remAlloc -= oDue;
          } else if (remAlloc > 0) {
            const newOrderDue = Math.max(0, oDue - remAlloc);
            partialOrderUpdates.push({ id: o.id, cash_collected: newOrderDue });
            remAlloc = 0;
          }
        }
      }

      // 1. Audit log in rider_settlements
      const settlementRecord = {
        id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('stl_' + Date.now()),
        rider_id: targetRiderId,
        rider_name: targetRiderName,
        amount_settled: amountVal,
        orders_count: fullySettledOrderIds.length,
        order_ids: fullySettledOrderIds,
        notes: notes 
          ? `${notes} (${isFullSettlement ? 'Full Settlement' : `Partial: ₹${remainingDue.toFixed(2)} due remaining`})`
          : (isFullSettlement 
              ? 'Full counter cash remittance cleared by admin' 
              : `Partial counter cash remittance: ₹${amountVal.toFixed(2)} received, ₹${remainingDue.toFixed(2)} remaining due`),
        settled_by: 'Breeze Admin',
        created_at: nowIso
      };

      if (supabaseClient) {
        // A. Insert settlement audit row
        const { error: logErr } = await supabaseClient
          .from('rider_settlements')
          .insert(settlementRecord);
        if (logErr) console.warn('rider_settlements insert error:', logErr);

        // B. Update rider cash_in_hand in delivery_partners
        const { error: rErr } = await supabaseClient
          .from('delivery_partners')
          .update({
            cash_in_hand: remainingDue,
            last_settled_at: nowIso,
            updated_at: nowIso
          })
          .eq('id', targetRiderId);
        if (rErr) console.warn('delivery_partners update cash error:', rErr);

        // C. Update fully settled orders
        if (fullySettledOrderIds.length > 0) {
          const { error: oErr } = await supabaseClient
            .from('orders')
            .update({
              settled_with_admin: true,
              settled_at: nowIso,
              updated_at: nowIso
            })
            .in('id', fullySettledOrderIds);
          if (oErr) console.warn('orders mark settled error:', oErr);
        }

        // D. Update partially settled orders
        for (const p of partialOrderUpdates) {
          const { error: pErr } = await supabaseClient
            .from('orders')
            .update({
              cash_collected: p.cash_collected,
              updated_at: nowIso
            })
            .eq('id', p.id);
          if (pErr) console.warn('orders update cash_collected error:', pErr);
        }
      }

      // 4. Update in-memory state
      const rIdx = allRiders.findIndex(r => r.id === targetRiderId);
      if (rIdx !== -1) {
        allRiders[rIdx].cash_in_hand = remainingDue;
        allRiders[rIdx].last_settled_at = nowIso;
      }

      fullySettledOrderIds.forEach(id => {
        const oIdx = allOrders.findIndex(o => o.id === id);
        if (oIdx !== -1) {
          allOrders[oIdx].settled_with_admin = true;
          allOrders[oIdx].settled_at = nowIso;
        }
      });

      partialOrderUpdates.forEach(p => {
        const oIdx = allOrders.findIndex(o => o.id === p.id);
        if (oIdx !== -1) {
          allOrders[oIdx].cash_collected = p.cash_collected;
        }
      });

      allSettlements.unshift(settlementRecord);

      closeSettleRiderModal();
      if (isFullSettlement) {
        showAdminToast(`✅ Full Cash Remittance of ₹${amountVal.toFixed(2)} for "${targetRiderName}" cleared!`);
      } else {
        showAdminToast(`💰 Partial Cash of ₹${amountVal.toFixed(2)} recorded for "${targetRiderName}". Remaining Due: ₹${remainingDue.toFixed(2)}`);
      }
      renderRidersTab();
    } catch (err) {
      console.warn('executeConfirmSettleRider error:', err);
      alert('Error settling cash: ' + err.message);
    } finally {
      if (btnConfirmSettleRider) {
        btnConfirmSettleRider.disabled = false;
        btnConfirmSettleRider.innerHTML = '<i class="fas fa-check-circle"></i> Confirm Cash Received &amp; Clear Due';
      }
    }
  }

  if (btnConfirmSettleRider) {
    btnConfirmSettleRider.addEventListener('click', executeConfirmSettleRider);
  }

  // --------------------------------------------------------------------------
  // TAB 4: CUSTOMERS CRM & CLIENT LIFETIME DATABASE
  // --------------------------------------------------------------------------

  // Merges registered Supabase 'customers' with guest orders in 'orders'
  function getEnrichedCustomersList() {
    const customerMap = new Map();

    // 1. Index registered customers
    (allCustomers || []).forEach(cust => {
      const emailKey = cust.email ? cust.email.trim().toLowerCase() : '';
      const rawPhone = cust.phone ? String(cust.phone).replace(/\D/g, '').slice(-10) : '';

      const enriched = {
        id: cust.id,
        name: cust.name || 'Registered Customer',
        phone: cust.phone || '',
        cleanPhone: rawPhone,
        email: cust.email || '',
        avatar: cust.avatar || '',
        default_address: cust.default_address || '',
        saved_addresses: Array.isArray(cust.saved_addresses) ? cust.saved_addresses : [],
        active_cart: cust.active_cart || null,
        is_registered: true,
        created_at: cust.created_at || new Date().toISOString(),
        orders: [],
        total_orders_count: Number(cust.total_orders_count) || 0,
        total_spent: Number(cust.total_spent) || 0,
        last_order_at: null,
        segment: 'prospect',
        aov: 0
      };

      // Store by primary customer ID
      customerMap.set(cust.id, enriched);
    });

    // Helper to find existing enriched profile by email or 10-digit phone
    function findProfileMatch(email, phone) {
      const cleanP = phone ? String(phone).replace(/\D/g, '').slice(-10) : '';
      const cleanE = email ? email.trim().toLowerCase() : '';

      // Priority 1: Match by account email first
      if (cleanE) {
        for (const profile of customerMap.values()) {
          if (profile.email && profile.email.trim().toLowerCase() === cleanE) {
            return profile;
          }
        }
      }

      // Priority 2: Match by phone number only if no email match exists
      if (cleanP) {
        for (const profile of customerMap.values()) {
          if (profile.cleanPhone && profile.cleanPhone === cleanP) {
            return profile;
          }
        }
      }

      return null;
    }

    // 2. Iterate orders and match or synthesize
    (allOrders || []).forEach(order => {
      const oEmail = order.customer_email ? order.customer_email.trim().toLowerCase() : '';
      const oPhone = order.customer_phone ? String(order.customer_phone).replace(/\D/g, '').slice(-10) : '';
      const oName = (order.customer_name || '').trim();
      const oAddress = (order.customer_address || '').trim();

      let profile = findProfileMatch(oEmail, oPhone);

      if (!profile) {
        // Synthesize guest customer profile
        const guestKey = oPhone ? `guest_ph_${oPhone}` : (oEmail ? `guest_em_${oEmail}` : `guest_ord_${order.id}`);
        profile = customerMap.get(guestKey);

        if (!profile) {
          profile = {
            id: guestKey,
            name: oName || 'Guest Diner',
            phone: order.customer_phone || '',
            cleanPhone: oPhone,
            email: order.customer_email || '',
            avatar: '',
            default_address: oAddress,
            saved_addresses: oAddress ? [{ label: 'Order Address', address: oAddress }] : [],
            active_cart: null,
            is_registered: false,
            created_at: order.created_at || new Date().toISOString(),
            orders: [],
            total_orders_count: 0,
            total_spent: 0,
            last_order_at: null,
            segment: 'prospect',
            aov: 0
          };
          customerMap.set(guestKey, profile);
        }
      }

      // Associate order with profile
      profile.orders.push(order);

      // Backfill missing contact info on registered profiles if order has it
      if (!profile.phone && order.customer_phone) {
        profile.phone = order.customer_phone;
        profile.cleanPhone = oPhone;
      }
      if (!profile.default_address && oAddress) {
        profile.default_address = oAddress;
      }
      if (profile.name === 'Registered Customer' && oName) {
        profile.name = oName;
      }
    });

    // 3. Compute Lifetime Metrics and Segments for each profile
    const list = Array.from(customerMap.values()).map(p => {
      // Sort orders descending by created_at
      p.orders.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

      // Calculate lifetime metrics from matched orders if available
      if (p.orders.length > 0) {
        p.total_orders_count = p.orders.length;
        p.last_order_at = p.orders[0].created_at || null;
        let spend = 0;
        p.orders.forEach(ord => {
          if (ord.status !== 'cancelled') {
            spend += Number(ord.total_amount) || 0;
          }
        });
        p.total_spent = spend;
      }

      return p;
    });

    return list;
  }

  function renderCustomersTab() {
    const allEnriched = getEnrichedCustomersList();

    // 1. Update KPI Summary Cards
    const totalCount = allEnriched.length;
    const registeredCount = allEnriched.filter(c => c.is_registered).length;
    const orderedCustomersCount = allEnriched.filter(c => c.total_orders_count > 0).length;
    const totalOrdersCount = allOrders ? allOrders.length : 0;

    let topCustomer = null;
    allEnriched.forEach(c => {
      if (!topCustomer || c.total_spent > topCustomer.total_spent) {
        if (c.total_spent > 0) {
          topCustomer = c;
        }
      }
    });

    if (dispTotalCustomersCount) dispTotalCustomersCount.textContent = totalCount;
    if (dispVerifiedCustomersSub) dispVerifiedCustomersSub.textContent = `${registeredCount} Registered Accounts`;
    if (dispRepeatCustomersCount) dispRepeatCustomersCount.textContent = orderedCustomersCount;
    if (dispRepeatRateSub) dispRepeatRateSub.textContent = `Placed 1+ orders`;
    if (dispAvgCustomerLtv) dispAvgCustomerLtv.textContent = totalOrdersCount;

    if (dispTopCustomerSpend) {
      dispTopCustomerSpend.textContent = topCustomer ? '₹' + topCustomer.total_spent.toLocaleString('en-IN') : '₹0';
    }
    if (dispTopCustomerName) {
      dispTopCustomerName.textContent = topCustomer ? `Top: ${topCustomer.name}` : 'No orders yet';
    }
    if (badgeCustomersCount) {
      badgeCustomersCount.textContent = totalCount;
    }

    // 2. Filter & Search
    let filtered = allEnriched.filter(c => {
      // Filter dropdown
      if (customerSegment === 'with_orders' && c.total_orders_count === 0) return false;
      if (customerSegment === 'registered' && !c.is_registered) return false;
      if (customerSegment === 'guest' && c.is_registered) return false;

      // Search query
      if (customerSearchQuery) {
        const q = customerSearchQuery.toLowerCase();
        const matchName = (c.name || '').toLowerCase().includes(q);
        const matchPhone = (c.phone || '').toLowerCase().includes(q);
        const matchEmail = (c.email || '').toLowerCase().includes(q);
        const matchAddress = (c.default_address || '').toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchEmail && !matchAddress) {
          return false;
        }
      }
      return true;
    });

    // 3. Sort
    filtered.sort((a, b) => {
      if (customerSort === 'spent_desc') {
        return b.total_spent - a.total_spent;
      } else if (customerSort === 'orders_desc') {
        return b.total_orders_count - a.total_orders_count;
      } else if (customerSort === 'recent') {
        const dateA = new Date(a.last_order_at || a.created_at || 0).getTime();
        const dateB = new Date(b.last_order_at || b.created_at || 0).getTime();
        return dateB - dateA;
      } else if (customerSort === 'name_asc') {
        return (a.name || '').localeCompare(b.name || '');
      }
      return 0;
    });

    // 4. Render Table
    if (!customersTableBody) return;

    if (filtered.length === 0) {
      customersTableBody.innerHTML = '';
      if (customersEmptyState) customersEmptyState.style.display = 'block';
      return;
    }

    if (customersEmptyState) customersEmptyState.style.display = 'none';

    customersTableBody.innerHTML = filtered.map(c => {
      // Initials or Avatar
      const initials = (c.name || 'G').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
      const avatarHtml = c.avatar
        ? `<img src="${c.avatar}" alt="${escapeHtml(c.name)}" class="customer-avatar-img" onerror="this.outerHTML='<div class=\\'customer-avatar-initials\\'>${initials}</div>'">`
        : `<div class="customer-avatar-initials">${initials}</div>`;

      // WhatsApp link
      const waPhone = c.cleanPhone || (c.phone ? String(c.phone).replace(/\D/g, '').slice(-10) : '');
      const waMsg = encodeURIComponent(`Hi ${c.name || 'there'}! Greetings from Breeze Cafe.`);
      const waLink = waPhone ? `https://wa.me/91${waPhone}?text=${waMsg}` : '#';

      // Member since & Last order dates
      const joinedDate = c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown';
      const lastOrderText = c.last_order_at ? new Date(c.last_order_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '<span style="color:#94a3b8; font-style:italic;">No orders yet</span>';

      const deliveryAddressText = c.default_address
        ? `<div style="max-width: 260px; font-size: 0.84rem; color: #334155; line-height: 1.3;" title="${escapeHtml(c.default_address)}">${escapeHtml(c.default_address)}</div>`
        : `<span style="color:#94a3b8; font-size:0.82rem; font-style:italic;">No address saved</span>`;

      return `
        <tr data-customer-id="${c.id}">
          <td>
            <div class="customer-identity-cell">
              ${avatarHtml}
              <div class="customer-info-meta">
                <div class="customer-name-row">
                  <span class="customer-display-name">${escapeHtml(c.name)}</span>
                  ${c.is_registered ? '<span class="customer-tag-verified" title="Signed in via Google OAuth"><i class="fab fa-google"></i> Verified</span>' : '<span class="customer-tag-guest" title="Guest orderer"><i class="fas fa-user"></i> Guest</span>'}
                </div>
                <div class="customer-joined-date">Joined ${joinedDate}</div>
              </div>
            </div>
          </td>
          <td>
            <div class="customer-contact-cell">
              <div class="customer-phone-val">
                <i class="fas fa-phone"></i> ${c.phone ? escapeHtml(c.phone) : '<span style="color:#94a3b8;">No phone</span>'}
              </div>
              <div class="customer-email-val">
                <i class="fas fa-envelope"></i> ${c.email ? escapeHtml(c.email) : '<span style="color:#94a3b8;">No email</span>'}
              </div>
            </div>
          </td>
          <td>
            ${deliveryAddressText}
          </td>
          <td style="text-align: center;">
            <strong style="color: #0f172a; font-size: 0.95rem;">${c.total_orders_count}</strong>
          </td>
          <td style="text-align: right;">
            <strong style="color: #0f172a; font-size: 0.95rem;">₹${c.total_spent.toLocaleString('en-IN')}</strong>
          </td>
          <td>
            <div class="customer-last-order-val">
              <span class="last-order-date-text">${lastOrderText}</span>
            </div>
          </td>
          <td style="text-align: right;">
            <div class="customer-action-btns" style="justify-content: flex-end;">
              ${waPhone ? `
                <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn-customer-whatsapp" title="Chat on WhatsApp">
                  <i class="fab fa-whatsapp"></i> Chat
                </a>
              ` : `
                <button type="button" class="btn-customer-whatsapp disabled" disabled title="No phone number available">
                  <i class="fab fa-whatsapp"></i> Chat
                </button>
              `}
              <button type="button" class="btn-view-customer-profile" data-customer-id="${c.id}" title="View Orders & Details">
                <i class="fas fa-external-link-alt"></i> View
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach profile click listeners
    customersTableBody.querySelectorAll('.btn-view-customer-profile').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const custId = e.currentTarget.dataset.customerId;
        openCustomerDetailModal(custId);
      });
    });
  }

  // Customer Search & Filter Event Listeners
  if (customerSearchInput) {
    customerSearchInput.addEventListener('input', (e) => {
      customerSearchQuery = e.target.value.trim();
      renderCustomersTab();
    });
  }

  if (customerSegmentFilter) {
    customerSegmentFilter.addEventListener('change', (e) => {
      customerSegment = e.target.value;
      renderCustomersTab();
    });
  }

  if (customerSortFilter) {
    customerSortFilter.addEventListener('change', (e) => {
      customerSort = e.target.value;
      renderCustomersTab();
    });
  }

  // --------------------------------------------------------------------------
  // MODAL 11: CUSTOMER PROFILE & ORDERS DOSSIER DRAWER
  // --------------------------------------------------------------------------
  function openCustomerDetailModal(customerId) {
    if (!customerDetailModal) return;

    const allEnriched = getEnrichedCustomersList();
    const customer = allEnriched.find(c => String(c.id) === String(customerId));
    if (!customer) {
      alert('Customer record not found.');
      return;
    }

    activeDetailCustomer = customer;

    // 1. Avatar & Identity
    if (customerModalAvatarContainer) {
      const initials = (customer.name || 'G').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
      customerModalAvatarContainer.innerHTML = customer.avatar
        ? `<img src="${customer.avatar}" alt="${escapeHtml(customer.name)}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 2px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.08);" onerror="this.outerHTML='<div style=\\'width:48px;height:48px;border-radius:50%;background:#e2e8f0;color:#334155;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:1.1rem;\\'>${initials}</div>'">`
        : `<div style="width: 48px; height: 48px; border-radius: 50%; background: #e2e8f0; color: #334155; font-weight: 800; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">${initials}</div>`;
    }

    if (customerModalName) {
      customerModalName.textContent = customer.name;
    }

    if (customerModalJoined) {
      const joinedDate = customer.created_at ? new Date(customer.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown';
      customerModalJoined.textContent = `Member since ${joinedDate} • ${customer.is_registered ? 'Google Verified Account' : 'Guest Account'}`;
    }

    // 2. WhatsApp & Phone Quick Action
    const waPhone = customer.cleanPhone || (customer.phone ? String(customer.phone).replace(/\D/g, '').slice(-10) : '');
    if (customerModalWhatsappBtn) {
      if (waPhone) {
        const waMsg = encodeURIComponent(`Hi ${customer.name || 'there'}! Greetings from Breeze Cafe.`);
        customerModalWhatsappBtn.href = `https://wa.me/91${waPhone}?text=${waMsg}`;
        customerModalWhatsappBtn.style.display = 'inline-flex';
      } else {
        customerModalWhatsappBtn.style.display = 'none';
      }
    }

    if (customerModalCallBtn) {
      if (customer.phone) {
        customerModalCallBtn.href = `tel:${customer.phone}`;
        customerModalCallBtn.style.display = 'inline-flex';
      } else {
        customerModalCallBtn.style.display = 'none';
      }
    }

    // 3. Metrics Cards (Clean Total Spent, Total Orders, Last Order)
    if (customerModalTotalSpent) {
      customerModalTotalSpent.textContent = '₹' + customer.total_spent.toLocaleString('en-IN');
    }
    if (customerModalOrdersCount) {
      customerModalOrdersCount.textContent = customer.total_orders_count;
    }
    if (customerModalAov) {
      customerModalAov.textContent = '₹' + (customer.aov || 0).toLocaleString('en-IN');
    }
    if (customerModalLastOrderDate) {
      customerModalLastOrderDate.textContent = customer.last_order_at
        ? new Date(customer.last_order_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'Never';
    }

    // 4. Contact & Addresses
    if (customerModalPhone) {
      customerModalPhone.textContent = customer.phone || 'Not provided';
    }
    if (customerModalEmail) {
      customerModalEmail.textContent = customer.email || 'Not provided';
    }
    if (customerModalDefaultAddress) {
      customerModalDefaultAddress.textContent = customer.default_address || 'No saved delivery address on file';
    }

    // Saved Addresses Chips (Only display distinct non-default addresses to prevent duplicates)
    if (customerModalSavedAddressesContainer) {
      const otherAddresses = (customer.saved_addresses || []).filter(addrObj => {
        const text = typeof addrObj === 'string' ? addrObj : (addrObj.address || '');
        return text.trim() && text.trim().toLowerCase() !== (customer.default_address || '').trim().toLowerCase();
      });

      if (otherAddresses.length > 0) {
        customerModalSavedAddressesContainer.innerHTML = otherAddresses.map((addrObj, i) => {
          const label = addrObj.label || `Address #${i+1}`;
          const text = addrObj.address || (typeof addrObj === 'string' ? addrObj : '');
          return `
            <div style="display: inline-flex; align-items: center; gap: 6px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 10px; font-size: 0.78rem; color: #475569;">
              <span style="font-weight: 700; color: #0f172a;"><i class="fas fa-map-pin" style="color:#64748b;"></i> ${escapeHtml(label)}:</span>
              <span>${escapeHtml(text)}</span>
            </div>
          `;
        }).join('');
        customerModalSavedAddressesContainer.style.display = 'flex';
      } else {
        customerModalSavedAddressesContainer.innerHTML = '';
        customerModalSavedAddressesContainer.style.display = 'none';
      }
    }

    // 5. Active Abandoned Cart Box
    if (customerModalActiveCartBox && customerModalActiveCartItems) {
      const cartItems = Array.isArray(customer.active_cart?.items)
        ? customer.active_cart.items
        : (Array.isArray(customer.active_cart) ? customer.active_cart : []);

      if (cartItems.length > 0) {
        customerModalActiveCartBox.style.display = 'block';
        let cartTotal = 0;
        customerModalActiveCartItems.innerHTML = cartItems.map(item => {
          const itemPrice = Number(item.price) || 0;
          const itemQty = Number(item.quantity) || 1;
          cartTotal += itemPrice * itemQty;
          return `
            <div class="active-cart-item-pill">
              <span class="active-cart-item-name">${escapeHtml(item.name || 'Dish')} <strong style="color:#0f172a;">x${itemQty}</strong></span>
              <span class="active-cart-item-price">₹${itemPrice * itemQty}</span>
            </div>
          `;
        }).join('') + `
          <div style="font-size:0.85rem; font-weight:800; color:#b45309; text-align:right; margin-top:8px;">
            Estimated Cart Value: ₹${cartTotal.toLocaleString('en-IN')}
          </div>
        `;
      } else {
        customerModalActiveCartBox.style.display = 'none';
      }
    }

    // 6. Chronological Itemized Order Ledger
    if (customerModalOrdersSubtitle) {
      customerModalOrdersSubtitle.textContent = `${customer.orders.length} ${customer.orders.length === 1 ? 'Order' : 'Orders'}`;
    }

    if (customerModalOrdersTableBody) {
      if (customer.orders.length === 0) {
        customerModalOrdersTableBody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 32px; color: #94a3b8; font-style: italic; font-size: 0.85rem;">
              No orders placed by this customer yet.
            </td>
          </tr>
        `;
      } else {
        customerModalOrdersTableBody.innerHTML = customer.orders.map(o => {
          const items = parseOrderItems(o.items);
          const itemsSummary = items.map(it => `${it.qty || it.quantity || 1}x ${it.name}`).join(', ') || 'No item details';
          const orderDate = o.created_at ? new Date(o.created_at).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }) : 'Unknown Date';

          let statusLabel = 'New Placed';
          let statusBg = '#fef3c7';
          let statusColor = '#92400e';
          let statusBorder = '#fde68a';
          if (['accepted', 'preparing', 'cooking', 'confirmed'].includes(o.status)) {
            statusLabel = 'In Kitchen';
            statusBg = '#e0f2fe';
            statusColor = '#0369a1';
            statusBorder = '#bae6fd';
          } else if (o.status === 'food_ready') {
            statusLabel = 'Food Ready';
            statusBg = '#dbeafe';
            statusColor = '#1d4ed8';
            statusBorder = '#bfdbfe';
          } else if (['out_for_delivery', 'dispatched'].includes(o.status)) {
            statusLabel = 'On Delivery';
            statusBg = '#f3e8ff';
            statusColor = '#7e22ce';
            statusBorder = '#e9d5ff';
          } else if (o.status === 'delivered') {
            statusLabel = 'Delivered';
            statusBg = '#dcfce7';
            statusColor = '#15803d';
            statusBorder = '#bbf7d0';
          } else if (o.status === 'cancelled') {
            statusLabel = 'Cancelled';
            statusBg = '#fee2e2';
            statusColor = '#b91c1c';
            statusBorder = '#fecaca';
          }

          const paymentMethodText = o.payment_method === 'cod' ? 'Cash on Delivery' : 'Online / UPI';
          const cleanOrderId = String(o.id).replace(/\s+/g, '');

          return `
            <tr style="border-bottom: 1px solid #f1f5f9; transition: background 0.15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
              <td style="padding: 10px 14px; white-space: nowrap;">
                <strong style="color: #0f172a; font-family: var(--font-mono, monospace); font-size: 0.84rem; letter-spacing: -0.01em;">#${escapeHtml(cleanOrderId)}</strong>
              </td>
              <td style="padding: 10px 14px; font-size: 0.8rem; color: #64748b; white-space: nowrap;">
                ${orderDate}
              </td>
              <td style="padding: 10px 14px;">
                <div style="max-width: 260px; font-size: 0.82rem; color: #334155; line-height: 1.35;" title="${escapeHtml(itemsSummary)}">
                  ${escapeHtml(itemsSummary)}
                </div>
              </td>
              <td style="padding: 10px 14px; text-align: right; white-space: nowrap;">
                <strong style="color: #0f172a; font-weight: 800; font-size: 0.86rem;">₹${Number(o.total_amount).toLocaleString('en-IN')}</strong>
              </td>
              <td style="padding: 10px 14px; font-size: 0.78rem; font-weight: 600; color: #475569; white-space: nowrap;">
                ${paymentMethodText}
              </td>
              <td style="padding: 10px 14px; text-align: center; white-space: nowrap;">
                <span style="background:${statusBg}; color:${statusColor}; border: 1px solid ${statusBorder}; font-size:0.73rem; font-weight:700; padding:3px 9px; border-radius:9999px; display:inline-block;">
                  ${statusLabel}
                </span>
              </td>
              <td style="padding: 10px 14px; text-align: right; white-space: nowrap;">
                <button type="button" class="btn-customer-order-kot" data-order-id="${o.id}" style="padding: 4px 10px; font-size: 0.76rem; font-weight: 700; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 6px; cursor: pointer; color: #0f172a; display: inline-flex; align-items: center; gap: 4px; transition: all 0.15s;">
                  <i class="fas fa-receipt" style="color: #64748b;"></i> KOT
                </button>
              </td>
            </tr>
          `;
        }).join('');

        // Attach KOT trigger to orders
        customerModalOrdersTableBody.querySelectorAll('.btn-customer-order-kot').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const ordId = e.currentTarget.dataset.orderId;
            openKotModal(ordId);
          });
        });
      }
    }

    customerDetailModal.style.display = 'flex';
  }

  function closeCustomerDetailModal() {
    if (customerDetailModal) customerDetailModal.style.display = 'none';
    activeDetailCustomer = null;
  }

  if (btnCloseCustomerDetailModal) {
    btnCloseCustomerDetailModal.addEventListener('click', closeCustomerDetailModal);
  }
  if (btnCloseCustomerDetailDrawer) {
    btnCloseCustomerDetailDrawer.addEventListener('click', closeCustomerDetailModal);
  }
  if (customerDetailModal) {
    customerDetailModal.addEventListener('click', (e) => {
      if (e.target === customerDetailModal) {
        closeCustomerDetailModal();
      }
    });
  }

  // --------------------------------------------------------------------------
  // CSV EXPORT FOR CUSTOMER DATABASE
  // --------------------------------------------------------------------------
  function exportCustomersToCsv() {
    const allEnriched = getEnrichedCustomersList();

    // Filter using active criteria
    let toExport = allEnriched.filter(c => {
      if (customerSegment === 'with_orders' && c.total_orders_count === 0) return false;
      if (customerSegment === 'registered' && !c.is_registered) return false;
      if (customerSegment === 'guest' && c.is_registered) return false;
      if (customerSearchQuery) {
        const q = customerSearchQuery.toLowerCase();
        const matchName = (c.name || '').toLowerCase().includes(q);
        const matchPhone = (c.phone || '').toLowerCase().includes(q);
        const matchEmail = (c.email || '').toLowerCase().includes(q);
        const matchAddress = (c.default_address || '').toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchEmail && !matchAddress) return false;
      }
      return true;
    });

    if (toExport.length === 0) {
      alert('No customers match the current filter criteria for export.');
      return;
    }

    const headers = [
      'Customer ID',
      'Name',
      'Phone',
      'Email',
      'Account Type',
      'Delivery Address',
      'Total Orders',
      'Total Spend (INR)',
      'Last Order Date',
      'Joined Date'
    ];

    const rows = toExport.map(c => [
      `"${c.id}"`,
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${(c.phone || '').replace(/"/g, '""')}"`,
      `"${(c.email || '').replace(/"/g, '""')}"`,
      `"${c.is_registered ? 'Google Verified' : 'Guest'}"`,
      `"${(c.default_address || '').replace(/"/g, '""')}"`,
      c.total_orders_count,
      c.total_spent,
      `"${c.last_order_at || 'Never'}"`,
      `"${c.created_at || ''}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `breeze_customers_crm_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showAdminToast(`Exported ${toExport.length} customers to CSV!`);
  }

  if (btnExportCustomersCsv) {
    btnExportCustomersCsv.addEventListener('click', exportCustomersToCsv);
  }

  // --------------------------------------------------------------------------
  // TAB 5: SALES & ANALYTICS RENDERING & CSV EXPORT
  // --------------------------------------------------------------------------
  function renderAnalyticsTab() {
    const periodLabel = getActivePeriodLabel();

    // 1. Payment Breakdown
    if (analyticsPaymentBreakdown) {
      let codAmt = 0;
      let onlineAmt = 0;
      let codCount = 0;
      let onlineCount = 0;

      allOrders.forEach(o => {
        const amt = Number(o.total_amount) || 0;
        if (o.status !== 'cancelled' && isRecordInActivePeriod(o.created_at)) {
          if (o.payment_method === 'cod') {
            codAmt += amt;
            codCount++;
          } else {
            onlineAmt += amt;
            onlineCount++;
          }
        }
      });

      const rawTotalRev = codAmt + onlineAmt;
      const codPct = rawTotalRev > 0 ? Math.round((codAmt / rawTotalRev) * 100) : 0;
      const onlinePct = rawTotalRev > 0 ? (100 - codPct) : 0;

      analyticsPaymentBreakdown.innerHTML = `
        <div style="margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; font-size: 0.9rem; font-weight: 700; margin-bottom: 6px;">
            <span>Cash on Delivery (COD)</span>
            <span>₹${codAmt.toLocaleString('en-IN')} (${codPct}%)</span>
          </div>
          <div style="height: 10px; background: #eee; border-radius: 999px; overflow: hidden;">
            <div style="height: 100%; width: ${codPct}%; background: #ea580c; border-radius: 999px;"></div>
          </div>
          <small style="color: var(--admin-text-muted); font-size: 0.76rem;">${codCount} orders placed via Cash on Delivery (${periodLabel})</small>
        </div>

        <div>
          <div style="display: flex; justify-content: space-between; font-size: 0.9rem; font-weight: 700; margin-bottom: 6px;">
            <span>Online / Razorpay UPI & Cards</span>
            <span>₹${onlineAmt.toLocaleString('en-IN')} (${onlinePct}%)</span>
          </div>
          <div style="height: 10px; background: #eee; border-radius: 999px; overflow: hidden;">
            <div style="height: 100%; width: ${onlinePct}%; background: #16a34a; border-radius: 999px;"></div>
          </div>
          <small style="color: var(--admin-text-muted); font-size: 0.76rem;">${onlineCount} orders paid instantly online (${periodLabel})</small>
        </div>
      `;
    }

    // 2. Top Selling Dishes (Scoped to Active Period)
    if (analyticsTopDishes) {
      const dishSalesMap = {};
      allOrders.forEach(o => {
        if (o.status !== 'cancelled' && isRecordInActivePeriod(o.created_at)) {
          const items = parseOrderItems(o.items);
          items.forEach(it => {
            const name = it.name || 'Dish';
            const qty = Number(it.qty) || 1;
            const price = Number(it.price) || 0;
            if (!dishSalesMap[name]) {
              dishSalesMap[name] = { qty: 0, revenue: 0 };
            }
            dishSalesMap[name].qty += qty;
            dishSalesMap[name].revenue += (price * qty);
          });
        }
      });

      const sorted = Object.entries(dishSalesMap)
        .sort((a, b) => b[1].qty - a[1].qty)
        .slice(0, 5);

      if (sorted.length === 0) {
        analyticsTopDishes.innerHTML = `<div style="color: var(--admin-text-muted); padding: 10px 0;">No sales data recorded for ${periodLabel}.</div>`;
      } else {
        let html = '';
        sorted.forEach(([name, data], idx) => {
          html += `
            <div class="leaderboard-row">
              <div>
                <strong style="color: var(--admin-gold); margin-right: 8px;">#${idx + 1}</strong>
                <strong>${escapeHtml(name)}</strong>
              </div>
              <div style="text-align: right;">
                <span style="font-weight: 700;">${data.qty} sold</span>
                <small style="display: block; color: var(--admin-text-muted);">₹${data.revenue.toLocaleString('en-IN')}</small>
              </div>
            </div>
          `;
        });
        analyticsTopDishes.innerHTML = html;
      }
    }

    // 3. Status Funnel (Scoped to Active Period)
    if (analyticsStatusFunnel) {
      const statusCounts = {};
      const periodOrders = allOrders.filter(o => isRecordInActivePeriod(o.created_at));
      periodOrders.forEach(o => {
        const s = o.status || 'placed';
        statusCounts[s] = (statusCounts[s] || 0) + 1;
      });

      const total = periodOrders.length || 1;
      const statuses = [
        { key: 'placed', label: 'Placed', color: '#ef4444' },
        { key: 'accepted', label: 'Accepted / Kitchen', color: '#f59e0b' },
        { key: 'food_ready', label: 'Food Ready', color: '#10b981' },
        { key: 'out_for_delivery', label: 'Out for Delivery', color: '#0284c7' },
        { key: 'delivered', label: 'Delivered', color: '#16a34a' },
        { key: 'cancelled', label: 'Cancelled', color: '#9ca3af' }
      ];

      let html = '';
      statuses.forEach(st => {
        const c = statusCounts[st.key] || 0;
        const pct = Math.round((c / total) * 100);
        html += `
          <div class="leaderboard-row">
            <div>
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${st.color}; margin-right: 8px;"></span>
              <span>${st.label}</span>
            </div>
            <span style="font-weight: 700;">${c} (${pct}%)</span>
          </div>
        `;
      });
      analyticsStatusFunnel.innerHTML = html;
    }

    // 4. Rider Deliveries (Scoped to Active Period)
    if (analyticsRiderPerformance) {
      if (allRiders.length === 0) {
        analyticsRiderPerformance.innerHTML = '<div style="color: var(--admin-text-muted); padding: 10px 0;">No riders registered.</div>';
      } else {
        let html = '';
        allRiders.forEach(r => {
          const riderPeriodDelivs = allOrders.filter(o => String(o.rider_id || '').toUpperCase() === String(r.id || '').toUpperCase() && o.status === 'delivered' && isRecordInActivePeriod(o.delivered_at || o.created_at)).length;
          html += `
            <div class="leaderboard-row">
              <div>
                <strong>${escapeHtml(r.name || r.id)}</strong>
                <small style="display: block; color: var(--admin-text-muted);">${escapeHtml(r.vehicle_type || 'Motorcycle')} • ${escapeHtml(r.id)}</small>
              </div>
              <div style="text-align: right;">
                <span class="kpi-badge green">${riderPeriodDelivs} deliveries</span>
                <small style="display: block; color: var(--admin-text-muted); font-size: 0.72rem;">${periodLabel}</small>
              </div>
            </div>
          `;
        });
        analyticsRiderPerformance.innerHTML = html;
      }
    }
  }

  // EXPORT ORDERS TO CSV (PERIOD FILTERED)
  if (btnExportOrdersCsv) {
    btnExportOrdersCsv.addEventListener('click', () => {
      exportOrdersToCSV();
    });
  }

  function exportOrdersToCSV() {
    const periodOrders = allOrders.filter(o => isRecordInActivePeriod(o.created_at));
    const periodLabel = getActivePeriodLabel();

    if (periodOrders.length === 0) {
      alert(`No orders found in selected period (${periodLabel}) to export.`);
      return;
    }

    const headers = [
      'Order ID',
      'Created At (IST)',
      'Customer Name',
      'Customer Phone',
      'Address',
      'Order Type',
      'Items Summary',
      'Subtotal (INR)',
      'Delivery Fee (INR)',
      'Total Amount (INR)',
      'Payment Method',
      'Payment Status',
      'Order Status',
      'Rider Name',
      'Rider Phone',
      'Cancellation Reason'
    ];

    const rows = periodOrders.map(o => {
      const items = parseOrderItems(o.items);
      const itemsStr = items.map(it => `${it.qty || 1}x ${it.name}`).join(' | ');

      return [
        `"${o.id || ''}"`,
        `"${o.created_at || ''}"`,
        `"${(o.customer_name || '').replace(/"/g, '""')}"`,
        `"${o.customer_phone || ''}"`,
        `"${(o.customer_address || '').replace(/"/g, '""')}"`,
        `"${o.order_type || 'Delivery'}"`,
        `"${itemsStr.replace(/"/g, '""')}"`,
        o.subtotal || 0,
        o.delivery_fee || 0,
        o.total_amount || 0,
        `"${o.payment_method || 'cod'}"`,
        `"${o.payment_status || 'pending'}"`,
        `"${o.status || 'placed'}"`,
        `"${(o.rider_name || '').replace(/"/g, '""')}"`,
        `"${o.rider_phone || ''}"`,
        `"${(o.cancellation_reason || '').replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filenameSafe = periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
    link.setAttribute('href', url);
    link.setAttribute('download', `breeze_orders_${filenameSafe}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showAdminToast(`✓ Exported ${periodOrders.length} orders (${periodLabel}) to CSV!`);
  }

  // --------------------------------------------------------------------------
  // MODAL 12: PERIOD & MONTHLY FINANCIAL STATEMENT REPORT
  // --------------------------------------------------------------------------
  function openPeriodReportModal() {
    if (!periodReportModal) return;
    renderPeriodReport();
    periodReportModal.style.display = 'flex';
  }

  function closePeriodReportModal() {
    if (periodReportModal) periodReportModal.style.display = 'none';
  }

  function printPeriodReport() {
    document.body.classList.add('printing-period-report');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-period-report');
    }, 1000);
  }

  function renderPeriodReport() {
    if (!periodReportModalBody) return;
    const periodLabel = getActivePeriodLabel();
    if (reportPeriodSubtitleText) reportPeriodSubtitleText.textContent = periodLabel;

    if (periodReportModalTitle) {
      if (activeAnalyticsPeriod.mode === 'today') {
        periodReportModalTitle.textContent = "Today's Operational & Financial Statement";
      } else if (activeAnalyticsPeriod.mode === 'custom') {
        periodReportModalTitle.textContent = "Custom Period Financial Statement";
      } else if (activeAnalyticsPeriod.mode === 'all_time') {
        periodReportModalTitle.textContent = "Lifetime Historical Statement";
      } else {
        periodReportModalTitle.textContent = `${periodLabel} Performance Report`;
      }
    }

    // Filter orders and settlements in this period
    const periodOrders = allOrders.filter(o => isRecordInActivePeriod(o.created_at));
    const periodSettlements = allSettlements.filter(s => isRecordInActivePeriod(s.created_at));

    let grossRev = 0;
    let deliveredRev = 0;
    let codRev = 0;
    let onlineRev = 0;
    let deliveredCount = 0;
    let cancelledCount = 0;
    let codCount = 0;
    let onlineCount = 0;
    let codDeliveredRev = 0;
    let codDeliveredCount = 0;

    const dailyMap = {};
    const dishSalesMap = {};

    periodOrders.forEach(ord => {
      const amt = Number(ord.total_amount) || 0;
      const isDelivered = ord.status === 'delivered';
      const isCancelled = ord.status === 'cancelled';
      const isCod = ord.payment_method === 'cod';
      const dateIST = getOrderISTDateString(ord.created_at) || 'Unknown Date';

      if (!dailyMap[dateIST]) {
        dailyMap[dateIST] = { orders: 0, delivered: 0, cod: 0, online: 0, total: 0 };
      }
      dailyMap[dateIST].orders++;

      if (isCancelled) {
        cancelledCount++;
      } else {
        grossRev += amt;
        dailyMap[dateIST].total += amt;
        if (isCod) {
          codRev += amt;
          codCount++;
          dailyMap[dateIST].cod += amt;
        } else {
          onlineRev += amt;
          onlineCount++;
          dailyMap[dateIST].online += amt;
        }

        // Dish breakdown
        const items = parseOrderItems(ord.items);
        items.forEach(it => {
          const name = it.name || 'Dish';
          const qty = Number(it.qty) || 1;
          const price = Number(it.price) || 0;
          if (!dishSalesMap[name]) dishSalesMap[name] = { qty: 0, rev: 0 };
          dishSalesMap[name].qty += qty;
          dishSalesMap[name].rev += (qty * price);
        });
      }

      if (isDelivered) {
        deliveredCount++;
        deliveredRev += amt;
        dailyMap[dateIST].delivered++;
        if (isCod) {
          codDeliveredRev += amt;
          codDeliveredCount++;
        }
      }
    });

    const totalOrdersCount = periodOrders.length;
    const aov = deliveredCount > 0 ? Math.round(deliveredRev / deliveredCount) : (totalOrdersCount > 0 ? Math.round(grossRev / totalOrdersCount) : 0);
    const totalPaymentOrders = codCount + onlineCount;
    const codPct = totalPaymentOrders > 0 ? Math.round((codCount / totalPaymentOrders) * 100) : 0;
    const onlinePct = totalPaymentOrders > 0 ? (100 - codPct) : 0;

    // Settlements total
    const totalSettledCash = periodSettlements.reduce((sum, s) => sum + (Number(s.amount_settled) || 0), 0);
    const netFloatCash = Math.max(0, codDeliveredRev - totalSettledCash);

    // Sort days descending
    const sortedDays = Object.entries(dailyMap).sort((a, b) => b[0].localeCompare(a[0]));

    // Top 5 dishes
    const topDishes = Object.entries(dishSalesMap).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5);

    // Generated IST timestamp
    const nowISTStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

    let bodyHtml = `
      <!-- Executive Summary 4-Tile Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 22px;">
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px;">
          <span style="font-size: 0.74rem; font-weight: 700; color: #64748b; text-transform: uppercase;">Gross Sales</span>
          <div style="font-size: 1.4rem; font-weight: 800; color: #0f172a; margin: 4px 0;">₹${grossRev.toLocaleString('en-IN')}</div>
          <span style="font-size: 0.74rem; color: #475569;">${totalOrdersCount} orders placed</span>
        </div>

        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 14px; padding: 14px;">
          <span style="font-size: 0.74rem; font-weight: 700; color: #166534; text-transform: uppercase;">Delivered Revenue</span>
          <div style="font-size: 1.4rem; font-weight: 800; color: #15803d; margin: 4px 0;">₹${deliveredRev.toLocaleString('en-IN')}</div>
          <span style="font-size: 0.74rem; color: #166534;">${deliveredCount} delivered • ${cancelledCount} cancelled</span>
        </div>

        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 14px; padding: 14px;">
          <span style="font-size: 0.74rem; font-weight: 700; color: #1e40af; text-transform: uppercase;">Average Order Value (AOV)</span>
          <div style="font-size: 1.4rem; font-weight: 800; color: #1d4ed8; margin: 4px 0;">₹${aov.toLocaleString('en-IN')}</div>
          <span style="font-size: 0.74rem; color: #1e40af;">Per completed transaction</span>
        </div>

        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 14px; padding: 14px;">
          <span style="font-size: 0.74rem; font-weight: 700; color: #92400e; text-transform: uppercase;">Payment Channel Split</span>
          <div style="font-size: 0.96rem; font-weight: 800; color: #78350f; margin: 4px 0;">
            COD: ${codPct}% | Online: ${onlinePct}%
          </div>
          <span style="font-size: 0.74rem; color: #92400e;">COD ₹${codRev.toLocaleString('en-IN')} • Online ₹${onlineRev.toLocaleString('en-IN')}</span>
        </div>
      </div>

      <!-- Fleet Cash & Reconciliation Box -->
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px; margin-bottom: 22px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
          <strong style="font-size: 0.92rem; color: #0f172a; display: inline-flex; align-items: center; gap: 6px;">
            <i class="fas fa-hand-holding-usd" style="color: #b5883d;"></i> Fleet Cash & Settlement Reconciliation
          </strong>
          <span style="font-size: 0.76rem; color: #64748b;">Period Scope: <strong>${periodLabel}</strong></span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
          <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px;">
            <span style="font-size: 0.72rem; color: #64748b; font-weight: 700;">COD Cash Collected by Fleet</span>
            <div style="font-size: 1.15rem; font-weight: 800; color: #ea580c; margin-top: 2px;">₹${codDeliveredRev.toLocaleString('en-IN')}</div>
            <span style="font-size: 0.72rem; color: #94a3b8;">From ${codDeliveredCount} delivered COD orders</span>
          </div>
          <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px;">
            <span style="font-size: 0.72rem; color: #64748b; font-weight: 700;">Cash Settled with Admin</span>
            <div style="font-size: 1.15rem; font-weight: 800; color: #16a34a; margin-top: 2px;">₹${totalSettledCash.toLocaleString('en-IN')}</div>
            <span style="font-size: 0.72rem; color: #94a3b8;">${periodSettlements.length} reconciliation deposits</span>
          </div>
          <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px;">
            <span style="font-size: 0.72rem; color: #64748b; font-weight: 700;">Net Period Floating Cash</span>
            <div style="font-size: 1.15rem; font-weight: 800; color: #0284c7; margin-top: 2px;">₹${netFloatCash.toLocaleString('en-IN')}</div>
            <span style="font-size: 0.72rem; color: #94a3b8;">Pending counter handover</span>
          </div>
        </div>
      </div>

      <!-- Two Column Section: Top Dishes & Rider Performance -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 18px; margin-bottom: 22px;">
        <!-- Top Dishes -->
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px;">
          <h4 style="margin: 0 0 12px; font-size: 0.92rem; font-weight: 800; color: #0f172a; display: inline-flex; align-items: center; gap: 6px;">
            <i class="fas fa-crown" style="color: #eab308;"></i> Top Selling Dishes in Period
          </h4>
          ${topDishes.length === 0 ? '<p style="color: #94a3b8; font-size: 0.8rem; margin: 0;">No sales recorded in this period.</p>' : `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem;">
              <thead>
                <tr style="border-bottom: 1px solid #e2e8f0; color: #64748b; text-align: left;">
                  <th style="padding: 6px 0;">Item</th>
                  <th style="padding: 6px 8px; text-align: right;">Qty</th>
                  <th style="padding: 6px 0; text-align: right;">Sales</th>
                </tr>
              </thead>
              <tbody>
                ${topDishes.map(([name, data], idx) => `
                  <tr style="border-bottom: 1px dashed #f1f5f9;">
                    <td style="padding: 8px 0; font-weight: 600; color: #1e293b;">
                      <span style="color: #b5883d; font-weight: 800; margin-right: 4px;">#${idx + 1}</span> ${escapeHtml(name)}
                    </td>
                    <td style="padding: 8px; text-align: right; font-weight: 700; color: #475569;">${data.qty}</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: 800; color: #0f172a;">₹${data.rev.toLocaleString('en-IN')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>

        <!-- Rider Activity -->
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px;">
          <h4 style="margin: 0 0 12px; font-size: 0.92rem; font-weight: 800; color: #0f172a; display: inline-flex; align-items: center; gap: 6px;">
            <i class="fas fa-motorcycle" style="color: #0284c7;"></i> Fleet Dispatch Activity
          </h4>
          ${allRiders.length === 0 ? '<p style="color: #94a3b8; font-size: 0.8rem; margin: 0;">No riders registered.</p>' : `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem;">
              <thead>
                <tr style="border-bottom: 1px solid #e2e8f0; color: #64748b; text-align: left;">
                  <th style="padding: 6px 0;">Rider</th>
                  <th style="padding: 6px 8px; text-align: center;">Deliveries</th>
                  <th style="padding: 6px 0; text-align: right;">Current Due</th>
                </tr>
              </thead>
              <tbody>
                ${allRiders.map(r => {
                  const rDelivs = periodOrders.filter(o => o.rider_id === r.id && o.status === 'delivered').length;
                  const rDue = Number(r.cash_in_hand) || 0;
                  return `
                    <tr style="border-bottom: 1px dashed #f1f5f9;">
                      <td style="padding: 8px 0; font-weight: 600; color: #1e293b;">${escapeHtml(r.name || r.id)}</td>
                      <td style="padding: 8px; text-align: center; font-weight: 700; color: #15803d;">${rDelivs}</td>
                      <td style="padding: 8px 0; text-align: right; font-weight: 800; color: ${rDue > 0 ? '#ea580c' : '#64748b'};">₹${rDue.toLocaleString('en-IN')}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>

      <!-- Daily Breakdown Table -->
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px; margin-bottom: 16px;">
        <h4 style="margin: 0 0 12px; font-size: 0.92rem; font-weight: 800; color: #0f172a; display: inline-flex; align-items: center; gap: 6px;">
          <i class="fas fa-calendar-day" style="color: #10b981;"></i> Daily Performance Ledger (${sortedDays.length} active days)
        </h4>
        ${sortedDays.length === 0 ? '<p style="color: #94a3b8; font-size: 0.8rem; margin: 0;">No daily transactions to display for this period.</p>' : `
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.82rem;">
              <thead>
                <tr style="border-bottom: 1.5px solid #cbd5e1; color: #475569; text-align: left; background: #f8fafc;">
                  <th style="padding: 8px 10px;">Date (IST)</th>
                  <th style="padding: 8px 10px; text-align: center;">Orders</th>
                  <th style="padding: 8px 10px; text-align: center;">Delivered</th>
                  <th style="padding: 8px 10px; text-align: right;">COD Sales</th>
                  <th style="padding: 8px 10px; text-align: right;">Online Sales</th>
                  <th style="padding: 8px 10px; text-align: right;">Total Gross</th>
                </tr>
              </thead>
              <tbody>
                ${sortedDays.map(([day, d]) => `
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 8px 10px; font-weight: 700; color: #1e293b;">${day}</td>
                    <td style="padding: 8px 10px; text-align: center; font-weight: 600; color: #475569;">${d.orders}</td>
                    <td style="padding: 8px 10px; text-align: center; font-weight: 700; color: #15803d;">${d.delivered}</td>
                    <td style="padding: 8px 10px; text-align: right; color: #ea580c; font-weight: 600;">₹${d.cod.toLocaleString('en-IN')}</td>
                    <td style="padding: 8px 10px; text-align: right; color: #16a34a; font-weight: 600;">₹${d.online.toLocaleString('en-IN')}</td>
                    <td style="padding: 8px 10px; text-align: right; font-weight: 800; color: #0f172a;">₹${d.total.toLocaleString('en-IN')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>

      <!-- Report Certification Footer -->
      <div style="border-top: 1px solid #e2e8f0; padding-top: 14px; display: flex; justify-content: space-between; align-items: center; font-size: 0.74rem; color: #94a3b8; flex-wrap: wrap; gap: 8px;">
        <span>Certified Statement • Breeze The Roof-Top Café, Palghar</span>
        <span>Generated on: <strong>${nowISTStr} IST</strong></span>
      </div>
    `;

    periodReportModalBody.innerHTML = bodyHtml;
  }

  function exportPeriodCsv() {
    const periodOrders = allOrders.filter(o => isRecordInActivePeriod(o.created_at));
    const periodSettlements = allSettlements.filter(s => isRecordInActivePeriod(s.created_at));
    const periodLabel = getActivePeriodLabel();

    let csv = `Breeze The Roof-Top Cafe - Financial & Operational Statement\r\n`;
    csv += `Period,"${periodLabel}"\r\n`;
    csv += `Generated At (IST),"${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}"\r\n\r\n`;

    csv += `ORDERS BREAKDOWN IN PERIOD\r\n`;
    csv += `"Order ID","Date (IST)","Time (IST)","Customer Name","Phone","Payment Method","Amount (INR)","Status","Rider Assigned","Items Summary"\r\n`;

    if (periodOrders.length === 0) {
      csv += `"No orders in this period"\r\n`;
    } else {
      periodOrders.forEach(o => {
        const dateIST = getOrderISTDateString(o.created_at) || '';
        let timeIST = '';
        try {
          timeIST = new Date(o.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
        } catch (e) {}
        const custName = (o.customer_name || 'Guest').replace(/"/g, '""');
        const custPhone = (o.customer_phone || '').replace(/"/g, '""');
        const rider = allRiders.find(r => r.id === o.rider_id);
        const riderName = rider ? (rider.name || rider.id).replace(/"/g, '""') : (o.rider_id || 'Unassigned');
        const items = parseOrderItems(o.items);
        const itemsSummary = items.map(it => `${it.qty || 1}x ${it.name}`).join(' | ').replace(/"/g, '""');

        csv += `"OD-${o.id}","${dateIST}","${timeIST}","${custName}","${custPhone}","${(o.payment_method || 'cod').toUpperCase()}",${o.total_amount || 0},"${o.status || 'placed'}","${riderName}","${itemsSummary}"\r\n`;
      });
    }

    csv += `\r\nFLEET RECONCILIATION & CASH SETTLEMENTS\r\n`;
    csv += `"Settlement ID","Date (IST)","Rider ID","Rider Name","Amount Settled (INR)","Notes"\r\n`;

    if (periodSettlements.length === 0) {
      csv += `"No settlements recorded in this period"\r\n`;
    } else {
      periodSettlements.forEach(s => {
        const sDateIST = getOrderISTDateString(s.created_at) || '';
        const rider = allRiders.find(r => r.id === s.rider_id);
        const riderName = rider ? (rider.name || rider.id).replace(/"/g, '""') : (s.rider_id || 'Rider');
        const notes = (s.notes || '').replace(/"/g, '""');
        csv += `"SET-${s.id}","${sDateIST}","${s.rider_id}","${riderName}",${s.amount_settled || 0},"${notes}"\r\n`;
      });
    }

    const csvContent = '\uFEFF' + csv;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filenameSafePeriod = periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
    link.setAttribute('href', url);
    link.setAttribute('download', `breeze_statement_${filenameSafePeriod}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showAdminToast('✓ Period statement CSV downloaded!');
  }

  // --------------------------------------------------------------------------
  // MODAL: KITCHEN ORDER TICKET (KOT) PRINTING
  // --------------------------------------------------------------------------
  function openKotModal(orderId) {
    activeKotOrder = allOrders.find(o => o.id === orderId);
    if (!activeKotOrder) return;
    if (kotOrderId) kotOrderId.textContent = '#' + activeKotOrder.id;
    if (kotOrderType) kotOrderType.textContent = activeKotOrder.order_type || 'Home Delivery';
    if (kotOrderDate) {
      kotOrderDate.textContent = 'Time: ' + new Date(activeKotOrder.created_at || Date.now()).toLocaleString('en-IN');
    }
    if (kotCustName) kotCustName.textContent = activeKotOrder.customer_name || 'Guest Customer';
    if (kotCustPhone) kotCustPhone.textContent = activeKotOrder.customer_phone || 'N/A';
    if (kotCustAddress) kotCustAddress.textContent = activeKotOrder.customer_address || 'Palghar West';

    // Populate items
    if (kotItemsBody) {
      let html = '';
      const items = parseOrderItems(activeKotOrder.items);
      items.forEach(it => {
        const amt = (Number(it.price) || 0) * (Number(it.qty) || 1);
        html += `
          <tr>
            <td style="padding: 3px 0;">${it.qty || 1}x</td>
            <td style="padding: 3px 0;">${escapeHtml(it.name || 'Dish')}</td>
            <td style="text-align: right; padding: 3px 0;">₹${amt}</td>
          </tr>
        `;
      });
      kotItemsBody.innerHTML = html;
    }

    const sub = Number(activeKotOrder.subtotal) || Number(activeKotOrder.total_amount) || 0;
    const fee = Number(activeKotOrder.delivery_fee) || 0;
    const tot = Number(activeKotOrder.total_amount) || 0;

    if (kotSubtotal) kotSubtotal.textContent = '₹' + sub;
    if (kotDeliveryFee) kotDeliveryFee.textContent = '₹' + fee;
    if (kotTotal) kotTotal.textContent = '₹' + tot;
    if (kotPaymentBadge) {
      kotPaymentBadge.textContent = 'PAYMENT: ' + (activeKotOrder.payment_method === 'cod' ? 'CASH ON DELIVERY' : (activeKotOrder.payment_method === 'online_doorstep' ? 'DOORSTEP UPI PAID' : 'ONLINE PAID (RAZORPAY)'));
    }

    if (kotModal) kotModal.style.display = 'flex';
  }

  if (btnCloseKotModal) btnCloseKotModal.addEventListener('click', closeKotModal);
  if (btnCancelKotModal) btnCancelKotModal.addEventListener('click', closeKotModal);

  function closeKotModal() {
    if (kotModal) kotModal.style.display = 'none';
    activeKotOrder = null;
  }

  if (btnPrintKotBtn) {
    btnPrintKotBtn.addEventListener('click', printKotSlip);
  }

  function printKotSlip() {
    const printSection = document.getElementById('kotPrintSection');
    if (!printSection) {
      document.body.classList.add('printing-kot');
      window.print();
      setTimeout(() => document.body.classList.remove('printing-kot'), 1000);
      return;
    }

    try {
      const printFrame = document.createElement('iframe');
      printFrame.setAttribute('title', 'KOT Receipt Print');
      printFrame.style.position = 'fixed';
      printFrame.style.top = '-9999px';
      printFrame.style.left = '-9999px';
      printFrame.style.width = '80mm';
      printFrame.style.height = '100px';
      printFrame.style.border = 'none';
      document.body.appendChild(printFrame);

      const frameDoc = printFrame.contentWindow.document;
      frameDoc.open();
      frameDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Kitchen Order Ticket</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 0;
            }
            html, body {
              margin: 0;
              padding: 4mm;
              background: #ffffff !important;
              color: #000000 !important;
              font-family: 'Courier New', Courier, monospace;
              font-size: 13px;
              line-height: 1.35;
              width: 72mm;
              max-width: 72mm;
            }
            * {
              box-sizing: border-box;
              color: #000000 !important;
              background: transparent !important;
            }
            .kot-slip-title {
              text-align: center;
              font-weight: 800;
              font-size: 13px;
              margin-bottom: 8px;
              line-height: 1.3;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
              margin: 6px 0;
            }
            th, td {
              padding: 3px 0;
            }
          </style>
        </head>
        <body>
          ${printSection.innerHTML}
        </body>
        </html>
      `);
      frameDoc.close();

      setTimeout(() => {
        try {
          printFrame.contentWindow.focus();
          printFrame.contentWindow.print();
        } catch (err) {
          document.body.classList.add('printing-kot');
          window.print();
          setTimeout(() => document.body.classList.remove('printing-kot'), 1000);
        }
        setTimeout(() => {
          if (document.body.contains(printFrame)) {
            document.body.removeChild(printFrame);
          }
        }, 2000);
      }, 300);
    } catch (e) {
      document.body.classList.add('printing-kot');
      window.print();
      setTimeout(() => document.body.classList.remove('printing-kot'), 1000);
    }
  }

  // --------------------------------------------------------------------------
  // STORE OPERATING HOURS SCHEDULE & EMERGENCY SHUTDOWN CONTROLLER
  // --------------------------------------------------------------------------
  const checkAutoSchedule = document.getElementById('checkAutoSchedule');
  const inputStoreOpeningTime = document.getElementById('inputStoreOpeningTime');
  const inputStoreClosingTime = document.getElementById('inputStoreClosingTime');
  const inputOffHoursNotice = document.getElementById('inputOffHoursNotice');
  const modalStoreCurrentStatusBadge = document.getElementById('modalStoreCurrentStatusBadge');
  const modalStoreStatusDot = document.getElementById('modalStoreStatusDot');
  const modalStoreStatusLiveText = document.getElementById('modalStoreStatusLiveText');
  const groupClosureReason = document.getElementById('groupClosureReason');

  if (btnToggleStoreStatus) {
    btnToggleStoreStatus.addEventListener('click', () => {
      openStoreStatusModal();
    });
  }

  if (btnQuickReopenStore) {
    btnQuickReopenStore.addEventListener('click', async () => {
      const status = evaluateStoreOperatingStatus(storeSettings);
      if (status.isEmergencyShutdown) {
        await saveStoreStatus({ is_store_open: true });
      } else {
        openStoreStatusModal();
      }
    });
  }

  function openStoreStatusModal() {
    if (!storeStatusModal) return;

    const isOpen = storeSettings.is_store_open !== false;
    if (radioStoreOpen) radioStoreOpen.checked = isOpen;
    if (radioStoreClosed) radioStoreClosed.checked = !isOpen;

    if (checkAutoSchedule) {
      checkAutoSchedule.checked = storeSettings.auto_schedule_enabled !== false;
    }
    if (inputStoreOpeningTime) {
      inputStoreOpeningTime.value = storeSettings.opening_time || '11:00';
    }
    if (inputStoreClosingTime) {
      inputStoreClosingTime.value = storeSettings.closing_time || '23:00';
    }
    if (inputOffHoursNotice) {
      inputOffHoursNotice.value = storeSettings.off_hours_notice || 'Kitchen is closed for the night. Online ordering is available daily from 11:00 AM to 11:00 PM.';
    }

    if (groupClosureReason) {
      groupClosureReason.style.display = isOpen ? 'none' : 'block';
    }

    const curReason = storeSettings.closure_reason || '';
    if (selectClosurePreset) {
      let found = false;
      for (let opt of selectClosurePreset.options) {
        if (opt.value === curReason) {
          selectClosurePreset.value = curReason;
          found = true;
          break;
        }
      }
      if (!found && curReason) {
        selectClosurePreset.value = 'custom';
        if (inputCustomClosureReason) {
          inputCustomClosureReason.style.display = 'block';
          inputCustomClosureReason.value = curReason;
        }
      } else {
        if (inputCustomClosureReason) inputCustomClosureReason.style.display = 'none';
      }
    }

    // Refresh realtime status pill inside modal
    const liveStatus = evaluateStoreOperatingStatus(storeSettings);
    if (modalStoreCurrentStatusBadge && modalStoreStatusLiveText) {
      if (liveStatus.isEmergencyShutdown) {
        modalStoreCurrentStatusBadge.style.background = '#fef2f2';
        modalStoreCurrentStatusBadge.style.borderColor = '#fca5a5';
        modalStoreCurrentStatusBadge.style.color = '#dc2626';
        if (modalStoreStatusDot) modalStoreStatusDot.style.background = '#ef4444';
        modalStoreStatusLiveText.innerHTML = '<strong>EMERGENCY SHUTDOWN ACTIVE:</strong> Online ordering blocked manually.';
      } else if (liveStatus.isOffHours) {
        modalStoreCurrentStatusBadge.style.background = '#fffbeb';
        modalStoreCurrentStatusBadge.style.borderColor = '#fde68a';
        modalStoreCurrentStatusBadge.style.color = '#b45309';
        if (modalStoreStatusDot) modalStoreStatusDot.style.background = '#f59e0b';
        modalStoreStatusLiveText.innerHTML = `<strong>🌙 AUTOMATICALLY CLOSED (Off Hours):</strong> Reopens at ${liveStatus.openTime12} IST.`;
      } else {
        modalStoreCurrentStatusBadge.style.background = '#f0fdf4';
        modalStoreCurrentStatusBadge.style.borderColor = '#bbf7d0';
        modalStoreCurrentStatusBadge.style.color = '#166534';
        if (modalStoreStatusDot) modalStoreStatusDot.style.background = '#22c55e';
        modalStoreStatusLiveText.innerHTML = `<strong>🟢 CURRENTLY OPEN:</strong> Accepting orders until ${liveStatus.closeTime12} IST.`;
      }
    }

    storeStatusModal.style.display = 'flex';
  }

  if (btnCloseStoreStatusModal) {
    btnCloseStoreStatusModal.addEventListener('click', () => {
      if (storeStatusModal) storeStatusModal.style.display = 'none';
    });
  }

  if (btnCancelStoreStatusModal) {
    btnCancelStoreStatusModal.addEventListener('click', () => {
      if (storeStatusModal) storeStatusModal.style.display = 'none';
    });
  }

  if (radioStoreOpen) {
    radioStoreOpen.addEventListener('change', () => {
      if (groupClosureReason) groupClosureReason.style.display = 'none';
    });
  }

  if (radioStoreClosed) {
    radioStoreClosed.addEventListener('change', () => {
      if (groupClosureReason) groupClosureReason.style.display = 'block';
    });
  }

  if (selectClosurePreset) {
    selectClosurePreset.addEventListener('change', () => {
      if (selectClosurePreset.value === 'custom') {
        if (inputCustomClosureReason) {
          inputCustomClosureReason.style.display = 'block';
          inputCustomClosureReason.focus();
        }
      } else {
        if (inputCustomClosureReason) inputCustomClosureReason.style.display = 'none';
      }
    });
  }

  function updateAdminSuggestedNotice() {
    if (!inputStoreOpeningTime || !inputStoreClosingTime || !inputOffHoursNotice) return;
    const op = formatMinutesTo12Hour(parseTimeToMinutes(inputStoreOpeningTime.value, 11 * 60));
    const cl = formatMinutesTo12Hour(parseTimeToMinutes(inputStoreClosingTime.value, 23 * 60));
    if (!inputOffHoursNotice.value || inputOffHoursNotice.value.includes('Online ordering is available daily from') || inputOffHoursNotice.value.includes('Kitchen is closed for the night')) {
      inputOffHoursNotice.value = `Kitchen is closed for the night. Online ordering is available daily from ${op} to ${cl}.`;
    }
  }

  if (inputStoreOpeningTime) inputStoreOpeningTime.addEventListener('input', updateAdminSuggestedNotice);
  if (inputStoreClosingTime) inputStoreClosingTime.addEventListener('input', updateAdminSuggestedNotice);

  if (btnSaveStoreStatus) {
    btnSaveStoreStatus.addEventListener('click', async () => {
      await saveStoreStatus();
      if (storeStatusModal) storeStatusModal.style.display = 'none';
    });
  }

  async function saveStoreStatus(customPatch) {
    if (!supabaseClient) return;
    try {
      let payload;
      if (customPatch) {
        payload = Object.assign({ id: 'breeze_main', updated_at: new Date().toISOString() }, storeSettings, customPatch);
      } else {
        const willBeOpen = radioStoreOpen ? radioStoreOpen.checked : true;
        let reason = '';
        if (!willBeOpen) {
          reason = selectClosurePreset.value === 'custom'
            ? (inputCustomClosureReason ? inputCustomClosureReason.value.trim() : '')
            : selectClosurePreset.value;
          if (!reason) reason = 'Kitchen is temporarily closed for online ordering.';
        }

        payload = {
          id: 'breeze_main',
          is_store_open: willBeOpen,
          auto_schedule_enabled: checkAutoSchedule ? checkAutoSchedule.checked : true,
          opening_time: inputStoreOpeningTime ? inputStoreOpeningTime.value : '11:00',
          closing_time: inputStoreClosingTime ? inputStoreClosingTime.value : '23:00',
          off_hours_notice: inputOffHoursNotice ? inputOffHoursNotice.value.trim() : 'Kitchen is closed for the night. Online ordering is available daily from 11:00 AM to 11:00 PM.',
          closure_reason: reason || storeSettings.closure_reason || 'Store is temporarily closed for online ordering.',
          updated_at: new Date().toISOString()
        };
      }

      const { data, error } = await supabaseClient
        .from('store_settings')
        .upsert(payload)
        .select()
        .single();

      if (error) {
        alert('Failed to update store operating settings: ' + error.message);
        return;
      }

      storeSettings = data;
      try { localStorage.setItem('breeze_store_settings', JSON.stringify(data)); } catch(e){}
      updateStoreStatusUI();

      const newStatus = evaluateStoreOperatingStatus(data);
      if (newStatus.isOpen) {
        showAdminToast('🟢 Store is now OPEN! Online ordering active.');
      } else if (newStatus.isOffHours) {
        showAdminToast('🌙 Operating hours schedule saved. Off-hours auto shutdown active.');
      } else {
        showAdminToast('🔴 Emergency Store Shutdown ACTIVE! Orders paused.', false);
      }
    } catch (err) {
      console.warn('saveStoreStatus error:', err);
    }
  }

  // Periodic heartbeat every 30s to update store header badge automatically
  setInterval(updateStoreStatusUI, 30000);



  // --------------------------------------------------------------------------
  // PAYMENT GATEWAY & MILITARY-GRADE SECURITY HANDLERS
  // --------------------------------------------------------------------------
  const btnGatewaySettings = document.getElementById('btnGatewaySettings');
  const gatewaySecurityModal = document.getElementById('gatewaySecurityModal');
  const btnCloseGatewaySecurityModal = document.getElementById('btnCloseGatewaySecurityModal');
  const inputRazorpayKeyId = document.getElementById('inputRazorpayKeyId');
  const btnSaveGatewayKey = document.getElementById('btnSaveGatewayKey');
  const btnClearGatewayKey = document.getElementById('btnClearGatewayKey');

  if (btnGatewaySettings && gatewaySecurityModal) {
    btnGatewaySettings.addEventListener('click', () => {
      const current = localStorage.getItem('breeze_rzp_key_id') || '';
      if (inputRazorpayKeyId) inputRazorpayKeyId.value = current;
      gatewaySecurityModal.style.display = 'flex';
    });

    if (btnCloseGatewaySecurityModal) {
      btnCloseGatewaySecurityModal.addEventListener('click', () => {
        gatewaySecurityModal.style.display = 'none';
      });
    }

    if (btnSaveGatewayKey) {
      btnSaveGatewayKey.addEventListener('click', async () => {
        const val = inputRazorpayKeyId ? inputRazorpayKeyId.value.trim() : '';
        btnSaveGatewayKey.disabled = true;
        btnSaveGatewayKey.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        if (val) {
          localStorage.setItem('breeze_rzp_key_id', val);
          if (window.BREEZE_CONFIG) window.BREEZE_CONFIG.RAZORPAY_KEY_ID = val;
          if (supabaseClient) {
            try {
              await supabaseClient.from('store_settings').update({ razorpay_key_id: val }).eq('id', 'breeze_main');
            } catch(e){}
          }
          showAdminToast('✓ Razorpay Key ID saved & synced to all rider portals!');
        } else {
          localStorage.removeItem('breeze_rzp_key_id');
          if (window.BREEZE_CONFIG) window.BREEZE_CONFIG.RAZORPAY_KEY_ID = '';
          if (supabaseClient) {
            try {
              await supabaseClient.from('store_settings').update({ razorpay_key_id: null }).eq('id', 'breeze_main');
            } catch(e){}
          }
          showAdminToast('Razorpay Key cleared.');
        }
        btnSaveGatewayKey.disabled = false;
        btnSaveGatewayKey.innerHTML = '<i class="fas fa-save"></i> Save Key';
        gatewaySecurityModal.style.display = 'none';
      });
    }

    if (btnClearGatewayKey) {
      btnClearGatewayKey.addEventListener('click', async () => {
        localStorage.removeItem('breeze_rzp_key_id');
        if (inputRazorpayKeyId) inputRazorpayKeyId.value = '';
        if (window.BREEZE_CONFIG) window.BREEZE_CONFIG.RAZORPAY_KEY_ID = '';
        if (supabaseClient) {
          try {
            await supabaseClient.from('store_settings').update({ razorpay_key_id: null }).eq('id', 'breeze_main');
          } catch(e){}
        }
        showAdminToast('Razorpay Gateway Key removed.');
        gatewaySecurityModal.style.display = 'none';
      });
    }
  }

  // ==========================================================================
  // STAFF & ADMIN ACCOUNTS MANAGEMENT (SUPABASE DATABASE)
  // ==========================================================================

  function handleAdminUserRealtimeEvent(payload) {
    if (!payload) return;
    if (payload.eventType === 'INSERT' && payload.new) {
      const exists = allAdminUsers.some(u => u.id === payload.new.id);
      if (!exists) allAdminUsers.push(payload.new);
    } else if (payload.eventType === 'UPDATE' && payload.new) {
      const idx = allAdminUsers.findIndex(u => u.id === payload.new.id);
      if (idx !== -1) {
        allAdminUsers[idx] = payload.new;
      } else {
        allAdminUsers.push(payload.new);
      }
      // If the modified account is currentAdmin, update currentAdmin session in place
      if (currentAdmin && currentAdmin.id === payload.new.id) {
        currentAdmin.name = payload.new.name;
        currentAdmin.role = payload.new.role;
        currentAdmin.phone = payload.new.phone;
        sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(currentAdmin));
        if (dispAdminName) dispAdminName.textContent = currentAdmin.name;
        if (dispAdminRole) {
          const roleMap = {
            owner: 'Master Admin (Owner)',
            manager: 'General Manager',
            kitchen: 'Head Chef / Kitchen',
            billing: 'Cashier / Billing'
          };
          dispAdminRole.textContent = roleMap[currentAdmin.role] || (currentAdmin.role || 'Admin').toUpperCase();
        }
      }
    } else if (payload.eventType === 'DELETE' && payload.old) {
      allAdminUsers = allAdminUsers.filter(u => u.id !== payload.old.id);
    }
    renderAdminStaffList();
  }

  async function fetchAdminUsers() {
    if (!supabaseClient) return;
    try {
      const { data, error } = await supabaseClient
        .from('admin_users')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        console.warn('[Admin Staff] Error fetching admin users:', error);
        return;
      }
      if (Array.isArray(data)) {
        allAdminUsers = data;
        renderAdminStaffList();
      }
    } catch (err) {
      console.warn('[Admin Staff] Network error fetching admin users:', err);
    }
  }

  function renderAdminStaffList() {
    if (!adminStaffTableBody) return;

    // Update KPI strip
    if (dispTotalStaffCount) dispTotalStaffCount.textContent = allAdminUsers.length;
    if (dispActiveStaffCount) {
      const activeCount = allAdminUsers.filter(u => u.is_active).length;
      dispActiveStaffCount.textContent = activeCount;
    }

    if (allAdminUsers.length === 0) {
      adminStaffTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="padding: 24px; text-align: center; color: #94a3b8;">
            No admin staff records found in database.
          </td>
        </tr>
      `;
      return;
    }

    const roleBadges = {
      owner: '<span class="staff-role-badge owner"><i class="fas fa-crown"></i> Owner</span>',
      manager: '<span class="staff-role-badge manager"><i class="fas fa-user-tie"></i> Manager</span>',
      kitchen: '<span class="staff-role-badge kitchen"><i class="fas fa-fire-burner"></i> Kitchen</span>',
      billing: '<span class="staff-role-badge billing"><i class="fas fa-cash-register"></i> Cashier</span>'
    };

    adminStaffTableBody.innerHTML = allAdminUsers.map(user => {
      const roleHtml = roleBadges[user.role] || `<span class="staff-role-badge manager">${escapeHtml(user.role)}</span>`;
      
      const lastLoginText = user.last_login_at 
        ? new Date(user.last_login_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        : '<span style="color: #94a3b8; font-style: italic;">Never</span>';

      const statusHtml = user.is_active
        ? '<span class="live-sync-pill" style="font-size: 0.72rem; padding: 2px 8px;"><span class="pulse-dot" style="width: 5px; height: 5px;"></span> Active</span>'
        : '<span style="font-size: 0.72rem; padding: 2px 8px; border-radius: 999px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; font-weight: 700;">Disabled</span>';

      const isCurrent = currentAdmin && currentAdmin.id === user.id;
      const isRoot = user.id === 'ADMIN-01' || user.username === 'admin';

      return `
        <tr data-staff-id="${escapeHtml(user.id)}">
          <td style="padding: 12px 16px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 34px; height: 34px; border-radius: 50%; background: var(--admin-gold-light); border: 1.5px solid var(--admin-gold-border); color: var(--admin-gold-dark); font-weight: 800; font-size: 0.75rem; display: flex; align-items: center; justify-content: center;">
                ${escapeHtml((user.name || user.username || 'A').slice(0, 2).toUpperCase())}
              </div>
              <div>
                <div style="font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 6px;">
                  ${escapeHtml(user.name)}
                  ${isCurrent ? '<span style="font-size: 0.65rem; background: #fef3c7; color: #92400e; padding: 1px 6px; border-radius: 4px; font-weight: 800;">YOU</span>' : ''}
                </div>
                ${user.phone ? `<div style="font-size: 0.75rem; color: #64748b;"><i class="fas fa-phone" style="font-size: 0.7rem;"></i> ${escapeHtml(user.phone)}</div>` : ''}
              </div>
            </div>
          </td>
          <td style="padding: 12px 16px;">
            <code style="font-family: var(--font-mono); font-weight: 700; background: #f1f5f9; padding: 3px 8px; border-radius: 6px; color: #1e293b; font-size: 0.82rem;">
              @${escapeHtml(user.username)}
            </code>
          </td>
          <td style="padding: 12px 16px;">
            ${roleHtml}
          </td>
          <td style="padding: 12px 16px;">
            <div class="staff-pwd-container">
              <span class="staff-pwd-text" data-password="${escapeHtml(user.password_hash)}" data-hidden="true">••••••••</span>
              <button type="button" class="staff-btn-icon btn-toggle-staff-pwd" title="Show / Hide Password">
                <i class="fas fa-eye"></i>
              </button>
              <button type="button" class="staff-btn-icon btn-copy-staff-creds" data-username="${escapeHtml(user.username)}" data-password="${escapeHtml(user.password_hash)}" title="Copy Login Credentials">
                <i class="fas fa-copy"></i>
              </button>
            </div>
          </td>
          <td style="padding: 12px 16px; font-size: 0.8rem; color: #64748b;">
            ${lastLoginText}
          </td>
          <td style="padding: 12px 16px;">
            ${statusHtml}
          </td>
          <td style="padding: 12px 16px; text-align: right;">
            <div style="display: inline-flex; align-items: center; gap: 6px;">
              <button type="button" class="btn-staff-action edit btn-edit-staff-row" data-id="${escapeHtml(user.id)}" title="Edit Name, Role or Reset Password">
                <i class="fas fa-edit"></i> Edit
              </button>
              ${!isRoot ? `
                <button type="button" class="btn-staff-action ${user.is_active ? 'toggle-inactive' : 'toggle-active'} btn-toggle-staff-row" data-id="${escapeHtml(user.id)}" data-active="${user.is_active}" title="${user.is_active ? 'Deactivate Login' : 'Activate Login'}">
                  <i class="fas ${user.is_active ? 'fa-ban' : 'fa-check'}"></i> ${user.is_active ? 'Disable' : 'Enable'}
                </button>
                ${!isCurrent ? `
                  <button type="button" class="btn-staff-action delete btn-delete-staff-row" data-id="${escapeHtml(user.id)}" data-name="${escapeHtml(user.name)}" title="Delete Admin Account Permanently">
                    <i class="fas fa-trash-alt"></i>
                  </button>
                ` : ''}
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach Event Listeners to rows
    // 1. Password Eye Toggle
    adminStaffTableBody.querySelectorAll('.btn-toggle-staff-pwd').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const wrap = e.currentTarget.closest('.staff-pwd-container');
        const textSpan = wrap.querySelector('.staff-pwd-text');
        const isHidden = textSpan.getAttribute('data-hidden') === 'true';
        if (isHidden) {
          textSpan.textContent = textSpan.getAttribute('data-password');
          textSpan.setAttribute('data-hidden', 'false');
          btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
        } else {
          textSpan.textContent = '••••••••';
          textSpan.setAttribute('data-hidden', 'true');
          btn.innerHTML = '<i class="fas fa-eye"></i>';
        }
      });
    });

    // 2. Copy Credentials
    adminStaffTableBody.querySelectorAll('.btn-copy-staff-creds').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const username = e.currentTarget.getAttribute('data-username');
        const password = e.currentTarget.getAttribute('data-password');
        const textToCopy = `Breeze Admin Login\nID: ${username}\nPassword: ${password}\nURL: ${location.origin}/admin`;
        navigator.clipboard.writeText(textToCopy).then(() => {
          showAdminToast(`Copied credentials for @${username}! 📋`);
        }).catch(() => {
          prompt('Copy credentials:', textToCopy);
        });
      });
    });

    // 3. Edit Staff Account
    adminStaffTableBody.querySelectorAll('.btn-edit-staff-row').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const userId = e.currentTarget.getAttribute('data-id');
        openEditStaffModal(userId);
      });
    });

    // 4. Toggle Active Status
    adminStaffTableBody.querySelectorAll('.btn-toggle-staff-row').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const userId = e.currentTarget.getAttribute('data-id');
        const currentActive = e.currentTarget.getAttribute('data-active') === 'true';
        await toggleStaffStatus(userId, !currentActive);
      });
    });

    // 5. Delete Staff Account
    adminStaffTableBody.querySelectorAll('.btn-delete-staff-row').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const userId = e.currentTarget.getAttribute('data-id');
        const userName = e.currentTarget.getAttribute('data-name');
        if (confirm(`Are you sure you want to permanently delete admin account "${userName}"? This cannot be undone.`)) {
          await deleteStaffAccount(userId);
        }
      });
    });
  }

  function openEditStaffModal(userId) {
    const user = allAdminUsers.find(u => u.id === userId);
    if (!user || !adminEditStaffModal) return;

    if (editStaffId) editStaffId.value = user.id;
    if (editStaffUsername) editStaffUsername.value = user.username;
    if (editStaffName) editStaffName.value = user.name;
    if (editStaffPassword) editStaffPassword.value = user.password_hash;
    if (editStaffRole) editStaffRole.value = user.role || 'manager';
    if (editStaffPhone) editStaffPhone.value = user.phone || '';
    if (editStaffIsActive) editStaffIsActive.checked = !!user.is_active;

    adminEditStaffModal.style.display = 'flex';
  }

  function closeEditStaffModal() {
    if (adminEditStaffModal) adminEditStaffModal.style.display = 'none';
  }

  async function toggleStaffStatus(userId, newStatus) {
    if (!supabaseClient) return;
    try {
      const { error } = await supabaseClient
        .from('admin_users')
        .update({ is_active: newStatus, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) {
        alert('Failed to update account status: ' + error.message);
        return;
      }

      const user = allAdminUsers.find(u => u.id === userId);
      if (user) user.is_active = newStatus;
      renderAdminStaffList();
      showAdminToast(`Account ${newStatus ? 'activated' : 'deactivated'} successfully.`);
    } catch (err) {
      alert('Error updating status: ' + err.message);
    }
  }

  async function deleteStaffAccount(userId) {
    if (!supabaseClient) return;
    try {
      const { error } = await supabaseClient
        .from('admin_users')
        .delete()
        .eq('id', userId);

      if (error) {
        alert('Failed to delete account: ' + error.message);
        return;
      }

      allAdminUsers = allAdminUsers.filter(u => u.id !== userId);
      renderAdminStaffList();
      showAdminToast('Admin account removed from database.');
    } catch (err) {
      alert('Error deleting account: ' + err.message);
    }
  }

  function generateRandomPassword() {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789@#%';
    let pwd = 'breeze@';
    for (let i = 0; i < 4; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  }

  // Staff Modal Event Listeners
  if (btnStaffManagement && adminStaffModal) {
    btnStaffManagement.addEventListener('click', () => {
      adminStaffModal.style.display = 'flex';
      fetchAdminUsers();
    });
  }

  if (btnCloseStaffModal && adminStaffModal) {
    btnCloseStaffModal.addEventListener('click', () => {
      adminStaffModal.style.display = 'none';
    });
  }

  if (btnOpenAddStaffDrawer && adminAddStaffContainer) {
    btnOpenAddStaffDrawer.addEventListener('click', () => {
      const isVisible = adminAddStaffContainer.style.display === 'block';
      adminAddStaffContainer.style.display = isVisible ? 'none' : 'block';
      if (!isVisible && newStaffPassword && !newStaffPassword.value) {
        newStaffPassword.value = generateRandomPassword();
      }
      if (!isVisible && newStaffName) {
        setTimeout(() => newStaffName.focus(), 100);
      }
    });
  }

  if (btnCancelAddStaff && adminAddStaffContainer) {
    btnCancelAddStaff.addEventListener('click', () => {
      adminAddStaffContainer.style.display = 'none';
    });
  }

  if (btnResetStaffForm && adminAddStaffForm) {
    btnResetStaffForm.addEventListener('click', () => {
      adminAddStaffForm.reset();
      if (newStaffPassword) newStaffPassword.value = generateRandomPassword();
    });
  }

  // Create Staff Form Submit
  if (adminAddStaffForm) {
    adminAddStaffForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = newStaffName.value.trim();
      const username = newStaffUsername.value.trim().toLowerCase().replace(/\s+/g, '_');
      const password = newStaffPassword.value.trim();
      const role = newStaffRole.value;
      const phone = newStaffPhone ? newStaffPhone.value.trim() : '';

      if (!name || !username || !password) {
        alert('Please fill in Name, Username, and Password.');
        return;
      }

      // Check unique username
      if (allAdminUsers.some(u => u.username.toLowerCase() === username)) {
        alert(`An admin account with username "${username}" already exists! Please choose another.`);
        return;
      }

      const btnSubmit = document.getElementById('btnSubmitAddStaff');
      const origHtml = btnSubmit ? btnSubmit.innerHTML : '';
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving to Database...';
      }

      // Generate unique ID
      const prefix = role === 'owner' ? 'ADMIN' : (role === 'manager' ? 'MGR' : (role === 'kitchen' ? 'CHEF' : 'STAFF'));
      const count = allAdminUsers.filter(u => u.id && u.id.startsWith(prefix)).length + 1;
      let newId = `${prefix}-${String(count).padStart(2, '0')}`;
      while (allAdminUsers.some(u => u.id === newId)) {
        newId = `${prefix}-${Math.floor(10 + Math.random() * 90)}`;
      }

      const newRecord = {
        id: newId,
        username: username,
        password_hash: password,
        name: name,
        role: role,
        phone: phone || null,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      try {
        if (supabaseClient) {
          const { data, error } = await supabaseClient
            .from('admin_users')
            .insert([newRecord])
            .select()
            .single();

          if (error) {
            alert('Failed to create admin in database: ' + error.message);
            if (btnSubmit) {
              btnSubmit.disabled = false;
              btnSubmit.innerHTML = origHtml;
            }
            return;
          }
          if (data) allAdminUsers.push(data);
          else allAdminUsers.push(newRecord);
        } else {
          allAdminUsers.push(newRecord);
        }

        renderAdminStaffList();
        adminAddStaffForm.reset();
        if (adminAddStaffContainer) adminAddStaffContainer.style.display = 'none';
        showAdminToast(`Account for ${name} (@${username}) created successfully! 🎉`);
      } catch (err) {
        alert('Error saving staff account: ' + err.message);
      } finally {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = origHtml;
        }
      }
    });
  }

  // Edit Staff Form Submit
  if (adminEditStaffForm) {
    adminEditStaffForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = editStaffId.value;
      const name = editStaffName.value.trim();
      const password = editStaffPassword.value.trim();
      const role = editStaffRole.value;
      const phone = editStaffPhone ? editStaffPhone.value.trim() : '';
      const isActive = editStaffIsActive.checked;

      if (!name || !password) {
        alert('Name and Password cannot be empty.');
        return;
      }

      const btnSubmit = document.getElementById('btnSubmitEditStaff');
      const origHtml = btnSubmit ? btnSubmit.innerHTML : '';
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
      }

      try {
        if (supabaseClient) {
          const { error } = await supabaseClient
            .from('admin_users')
            .update({
              name: name,
              password_hash: password,
              role: role,
              phone: phone || null,
              is_active: isActive,
              updated_at: new Date().toISOString()
            })
            .eq('id', id);

          if (error) {
            alert('Failed to update account: ' + error.message);
            if (btnSubmit) {
              btnSubmit.disabled = false;
              btnSubmit.innerHTML = origHtml;
            }
            return;
          }
        }

        const user = allAdminUsers.find(u => u.id === id);
        if (user) {
          user.name = name;
          user.password_hash = password;
          user.role = role;
          user.phone = phone;
          user.is_active = isActive;
        }

        // If current admin updated their own profile
        if (currentAdmin && currentAdmin.id === id) {
          currentAdmin.name = name;
          currentAdmin.role = role;
          currentAdmin.phone = phone;
          sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(currentAdmin));
          if (dispAdminName) dispAdminName.textContent = name;
          if (dispAdminRole) {
            const roleMap = {
              owner: 'Master Admin (Owner)',
              manager: 'General Manager',
              kitchen: 'Head Chef / Kitchen',
              billing: 'Cashier / Billing'
            };
            dispAdminRole.textContent = roleMap[role] || role.toUpperCase();
          }
        }

        renderAdminStaffList();
        closeEditStaffModal();
        showAdminToast(`Account for ${name} updated successfully! ✓`);
      } catch (err) {
        alert('Error updating staff: ' + err.message);
      } finally {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = origHtml;
        }
      }
    });
  }

  if (btnCloseEditStaffModal) btnCloseEditStaffModal.addEventListener('click', closeEditStaffModal);
  if (btnCancelEditStaffModal) btnCancelEditStaffModal.addEventListener('click', closeEditStaffModal);
  if (btnGenEditPassword && editStaffPassword) {
    btnGenEditPassword.addEventListener('click', () => {
      editStaffPassword.value = generateRandomPassword();
    });
  }

  // --------------------------------------------------------------------------
  // UTILITY: HTML ESCAPING
  // --------------------------------------------------------------------------
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

});
