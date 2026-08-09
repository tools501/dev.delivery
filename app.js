const API_URL = 'https://script.google.com/macros/s/AKfycbwI9PjMLd8zEZ671MHvRwUuYuH93Zzzoe0SAeMWQ7hjlDnzIFHTc7zhfetFYiVwoG6GWw/exec';
const HUB_API_URL = 'https://script.google.com/macros/s/AKfycbyAHpUfM1RrPJbamCVcc5rGhUgRKoLRKSULBGnCNGLyCSaFU5lp7SX2Ge1Wwv9YEV5-Sg/exec';
const SHARED_AUTH_TOKEN_KEY = 'tools501_google_id_token';
const HUB_URL = '/hub/';

let authToken = null;
let currentUser = null;
let sessionTimer = null;
let sessionExpireTimer = null;
let sessionCountdownTimer = null;
let sessionExpiresAt = 0;
let sessionExpired = false;
let pendingTwoFactorAuth = null;
let editingShipmentId = null;
let versionTimer = null;
let shipmentSyncInProgress = false;
let lastKnownShipmentsVersion = '';
let allShipments = [];
let activeListFilter = null;
let shipmentSearchQuery = '';
let shipmentSearchOpened = false;
let shipmentPendingDelete = null;
let shipmentOptions = {
  units: [],
  crews: [],
  methods: [],
  destinations: []
};

const REQUIRED_UI_LABEL_KEYS = [
  'unit',
  'destination',
  'method',
  'crew',
  'deliveryPriority',
  'weightKg',
  'comment',
  'createRequest',
  'shipmentsTitle',
  'chooseUnit',
  'chooseDestination',
  'chooseMethod',
  'unitRequired',
  'unitLength',
  'destinationRequired',
  'destinationLength',
  'methodLength',
  'crewLength',
  'deliveryPriorityInvalid',
  'weightKgRequired',
  'weightKgInvalid',
  'commentRequired',
  'commentLength'
];

let uiLabels = null;

const SHIPMENT_STATUSES = [
  'Нова',
  'Доставлено',
  'Недоставлено',
  'Отримано',
  'Частково отримано',
  'Неотримано'
];

const DEFAULT_SHIPMENT_STATUS = 'Нова';
const DEFAULT_DELIVERY_PRIORITY = 'Стандартний';
const DELIVERY_PRIORITIES = [
  DEFAULT_DELIVERY_PRIORITY,
  'Терміновий'
];
const DASHBOARD_ALL_VALUE = 'Всі';
const API_TIMEOUT_MS = 30 * 1000;

const DASHBOARD_FILTERS = [
  {
    key: 'status'
  },
  {
    key: 'unit'
  },
  {
    key: 'crew'
  },
  {
    key: 'method'
  },
  {
    key: 'destination'
  }
];

const toggleFormBtn =
  document.getElementById('toggleFormBtn');

const shipmentForm =
  document.getElementById('shipmentForm');

const toggleFormText =
  document.getElementById('toggleFormText');

const toggleFormIcon =
  document.getElementById('toggleFormIcon');

const loadBtn =
  document.getElementById('loadBtn');

const shipmentSearchToggle =
  document.getElementById('shipmentSearchToggle');

const shipmentSearchPanel =
  document.getElementById('shipmentSearchPanel');

const shipmentSearchInput =
  document.getElementById('shipmentSearchInput');

const shipmentSearchCount =
  document.getElementById('shipmentSearchCount');

const adminDashboard =
  document.getElementById('adminDashboard');

const dashboardFrom =
  document.getElementById('dashboardFrom');

const dashboardTo =
  document.getElementById('dashboardTo');

const dashboardFilters =
  document.getElementById('dashboardFilters');

const dashboardResult =
  document.getElementById('dashboardResult');

const dashboardGroupBy =
  document.getElementById('dashboardGroupBy');

const dashboardShowZeroValues =
  document.getElementById('dashboardShowZeroValues');

const dashboardSecondaryActions =
  document.createElement('div');

const dashboardZeroToggle =
  dashboardShowZeroValues.closest('.dashboard-zero-toggle');

dashboardSecondaryActions.className =
  'dashboard-secondary-actions';

dashboardZeroToggle.parentNode.insertBefore(
  dashboardSecondaryActions,
  dashboardZeroToggle
);

dashboardSecondaryActions.appendChild(
  dashboardZeroToggle
);

const exportDashboardBtn =
  document.createElement('button');

exportDashboardBtn.id = 'exportDashboardBtn';
exportDashboardBtn.className = 'dashboard-export-btn';
exportDashboardBtn.type = 'button';
exportDashboardBtn.innerHTML = `
  <span class="dashboard-export-icon" aria-hidden="true">
    XLS
  </span>
  <span>Excel</span>
`;

dashboardSecondaryActions.appendChild(
  exportDashboardBtn
);

const addDashboardFilterBtn =
  document.getElementById('addDashboardFilterBtn');

const resetDashboardBtn =
  document.getElementById('resetDashboardBtn');

const listFilterNotice =
  document.getElementById('listFilterNotice');

const listFilterText =
  document.getElementById('listFilterText');

const clearListFilterBtn =
  document.getElementById('clearListFilterBtn');

const deleteShipmentModal =
  document.getElementById('deleteShipmentModal');

const deleteModalConfirmStep =
  document.getElementById('deleteModalConfirmStep');

const deleteModalReasonStep =
  document.getElementById('deleteModalReasonStep');

const deleteModalSummary =
  document.getElementById('deleteModalSummary');

const deleteReasonInput =
  document.getElementById('deleteReasonInput');

const deleteReasonCounter =
  document.getElementById('deleteReasonCounter');

const deleteModalCancelBtn =
  document.getElementById('deleteModalCancelBtn');

const deleteModalNextBtn =
  document.getElementById('deleteModalNextBtn');

const deleteModalBackBtn =
  document.getElementById('deleteModalBackBtn');

const deleteModalSubmitBtn =
  document.getElementById('deleteModalSubmitBtn');

let formOpened = false;

toggleFormBtn.addEventListener('click', () => {

  formOpened = !formOpened;

  if (formOpened) {

    shipmentForm.classList.add('form-open');

    toggleFormText.innerText =
      'Закрити форму';

    toggleFormIcon.style.transform =
      'rotate(45deg)';

  } else {

    shipmentForm.classList.remove('form-open');

    toggleFormText.innerText =
      uiLabels
        ? uiLabels.createRequest
        : 'Create';

    toggleFormIcon.style.transform =
      'rotate(0deg)';
  }
});

function getTokenExpirationMs(token) {

  try {
    const payload = JSON.parse(
      atob(
        String(token || '')
          .split('.')[1]
          .replace(/-/g, '+')
          .replace(/_/g, '/')
      )
    );

    return Number(payload.exp) * 1000;

  } catch (e) {
    return 0;
  }
}

function expireSession() {

  sessionExpired = true;
  clearInterval(sessionCountdownTimer);
  stopVersionTimer();

  document
    .getElementById('sessionExpired')
    .classList.remove('hidden');
}

function renewSession() {

  authToken = null;
  sessionExpired = true;

  clearTimeout(sessionTimer);
  clearTimeout(sessionExpireTimer);
  clearInterval(sessionCountdownTimer);
  stopVersionTimer();
  clearSharedAuthToken();

  window.location.href = HUB_URL;
}

function startSessionTimer(token) {

  clearTimeout(sessionTimer);
  clearTimeout(sessionExpireTimer);
  clearInterval(sessionCountdownTimer);

  sessionExpired = false;
  sessionExpiresAt =
    getTokenExpirationMs(token) ||
    Date.now() + 55 * 60 * 1000;

  document
    .getElementById('sessionWarning')
    .classList.add('hidden');

  updateSessionWarningText();

  const remainingMs =
    sessionExpiresAt - Date.now();

  if (remainingMs <= 0) {
    expireSession();
    return;
  }

  sessionTimer = setTimeout(() => {

    updateSessionWarningText();

    document
      .getElementById('sessionWarning')
      .classList.remove('hidden');

    sessionCountdownTimer = setInterval(
      updateSessionWarningText,
      1000
    );

  }, Math.max(0, remainingMs - 5 * 60 * 1000));

  sessionExpireTimer = setTimeout(
    expireSession,
    remainingMs
  );
}

function formatSessionCountdown(ms) {

  const totalSeconds = Math.max(
    0,
    Math.ceil(ms / 1000)
  );
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function updateSessionWarningText() {

  const remaining =
    sessionExpiresAt - Date.now();

  document
    .getElementById('sessionWarningText')
    .innerText =
      `Сесія завершиться через ${formatSessionCountdown(remaining)}`;
}

async function handleCredentialResponse(response) {

  await authenticateWithToken(
    response.credential,
    {
      persist: true
    }
  );
}

function getSharedAuthToken() {

  try {
    return sessionStorage.getItem(SHARED_AUTH_TOKEN_KEY);
  } catch (e) {
    return null;
  }
}

function setSharedAuthToken(token) {

  try {
    sessionStorage.setItem(SHARED_AUTH_TOKEN_KEY, token);
  } catch (e) {
    console.error(e);
  }
}

function clearSharedAuthToken() {

  try {
    sessionStorage.removeItem(SHARED_AUTH_TOKEN_KEY);
  } catch (e) {
    console.error(e);
  }
}

async function hubApi(
  action,
  data = {},
  token = authToken
) {

  const formData = new URLSearchParams();

  formData.append(
    'payload',
    JSON.stringify({
      token,
      action,
      data
    })
  );

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    API_TIMEOUT_MS
  );
  let response;

  try {
    response = await fetch(HUB_API_URL, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  return response.json();
}

function showTwoFactorScreen(token, options) {

  pendingTwoFactorAuth = {
    token,
    options
  };

  document.getElementById('loader')
    .classList.add('hidden');

  document.getElementById('loginBlock')
    .classList.add('hidden');

  document.getElementById('deniedScreen')
    .classList.add('hidden');

  document.getElementById('twoFactorCode').value = '';

  document.getElementById('twoFactorBlock')
    .classList.remove('hidden');

  document.getElementById('twoFactorCode')
    .focus();
}

function hideTwoFactorScreen() {

  document.getElementById('twoFactorBlock')
    .classList.add('hidden');
}

async function ensureTwoFactorAccess(token, options) {

  const result = await hubApi(
    'check2fa',
    {},
    token
  );

  if (!result.success) {
    throw new Error(result.error || 'TWO_FACTOR_CHECK_FAILED');
  }

  const twoFactor =
    result.data && result.data.twoFactor;

  if (
    !twoFactor ||
    !twoFactor.required
  ) {
    return true;
  }

  if (twoFactor.setupRequired) {
    if (options.persist) {
      setSharedAuthToken(token);
    }

    window.location.href = HUB_URL;
    return false;
  }

  showTwoFactorScreen(token, options);
  return false;
}

async function submitTwoFactorCode() {

  const pending = pendingTwoFactorAuth;
  const code =
    document.getElementById('twoFactorCode').value.trim();

  if (!pending) {
    return;
  }

  if (!/^\d{6}$/.test(code)) {
    showToast('Введіть 6 цифр');
    return;
  }

  document.getElementById('twoFactorSubmitBtn')
    .classList.add('loading');

  try {
    const result = await hubApi(
      'verify2faGate',
      {
        code
      },
      pending.token
    );

    if (!result.success) {
      showToast(
        result.error === 'TWO_FACTOR_INVALID'
          ? 'Невірний код'
          : 'Не вдалося перевірити 2FA'
      );
      return;
    }

    const resume = pendingTwoFactorAuth;

    pendingTwoFactorAuth = null;
    hideTwoFactorScreen();

    await authenticateWithToken(
      resume.token,
      {
        ...resume.options,
        skipTwoFactor: true
      }
    );

  } catch (e) {
    console.error(e);
    showToast(
      getRequestErrorMessage('Не вдалося перевірити 2FA')
    );
  } finally {
    document.getElementById('twoFactorSubmitBtn')
      .classList.remove('loading');
  }
}

function cancelTwoFactor() {

  pendingTwoFactorAuth = null;
  authToken = null;
  clearSharedAuthToken();
  hideTwoFactorScreen();
  showLoginScreen();
}

async function authenticateWithToken(
  token,
  options = {}
) {

  authToken = token;

  document.getElementById('loginBlock')
    .classList.add('hidden');

  document.getElementById('loader')
    .classList.remove('hidden');

  document.getElementById('sessionExpired')
    .classList.add('hidden');

  hideTwoFactorScreen();

  try {
    if (!options.skipTwoFactor) {
      const canContinue = await ensureTwoFactorAccess(
        token,
        options
      );

      if (!canContinue) {
        return;
      }
    }
  } catch (e) {
    console.error(e);

    authToken = null;
    clearSharedAuthToken();

    document.getElementById('loader')
      .classList.add('hidden');

    showLoginScreen();
    showToast(
      getRequestErrorMessage('Не вдалося перевірити 2FA')
    );

    return;
  }

  let result;

  try {
    result = await api('bootstrap');
  } catch (e) {
    console.error(e);

    authToken = null;
    clearSharedAuthToken();

    document.getElementById('loader')
      .classList.add('hidden');

    showLoginScreen();

    return;
  }

  if (!result.success) {

    authToken = null;
    clearSharedAuthToken();

    document.getElementById('loader')
      .classList.add('hidden');

    document.getElementById('deniedScreen')
      .classList.remove('hidden');

    return;
  }

  if (options.persist) {
    setSharedAuthToken(token);
  }

  currentUser = result.data.user;

  startSessionTimer(authToken);

  document.getElementById('userInfo')
    .innerText = currentUser.name;

  try {
    applyShipmentOptions(result.data.options);
    setupAdminDashboard();
    applyShipments(result.data.shipments);
    startVersionTimer();
  } catch (e) {
    console.error(e);

    showToast(
      getRequestErrorMessage(
        'Не вдалося завантажити дані. Натисніть Оновити'
      )
    );
  }

  document.getElementById('loader')
    .classList.add('hidden');

  document.getElementById('app')
    .classList.remove('hidden');
}

async function trySharedSession() {

  const token = getSharedAuthToken();

  if (!token) {
    return;
  }

  await authenticateWithToken(token);
}

async function api(
  action,
  data = {}
) {

  const formData = new URLSearchParams();

  formData.append(
    'payload',
    JSON.stringify({
      token: authToken,
      action,
      data
    })
  );

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    API_TIMEOUT_MS
  );
  let response;

  try {
    response = await fetch(API_URL, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  const result = await response.json();

  if (
    !result.success &&
    result.error === 'AUTH_REQUIRED'
  ) {

    document
      .getElementById('sessionExpired')
      .classList.remove('hidden');
  
    throw new Error('AUTH_REQUIRED');
  }

  return result;
}

let toastTimeout = null;

function showLoginScreen() {

  document.getElementById('app')
    .classList.add('hidden');

  hideTwoFactorScreen();

  document.getElementById('loader')
    .classList.add('hidden');

  document.getElementById('deniedScreen')
    .classList.add('hidden');

  document.getElementById('sessionExpired')
    .classList.add('hidden');

  document.getElementById('loginBlock')
    .classList.remove('hidden');
}

function showToast(message, type = 'error') {

  const toast = document.getElementById('toast');

  toast.innerText = message;

  toast.classList.remove('success');

  if (type === 'success') {
    toast.classList.add('success');
  }

  toast.classList.add('show');

  clearTimeout(toastTimeout);

  toastTimeout = setTimeout(() => {

    toast.classList.remove('show');

  }, 2500);
}

function getShipmentsVersion(items) {

  return items.reduce((version, item) => {

    const itemVersion = Number(
      item.updatedAtVersion || 0
    );

    return itemVersion > version
      ? itemVersion
      : version;

  }, 0).toString();
}

function setUpdateNotice(hasUpdates) {

  if (hasUpdates) {
    loadBtn.innerText = 'Є оновлення';
    loadBtn.classList.add('has-updates');
    return;
  }

  loadBtn.innerText = 'Оновити';
  loadBtn.classList.remove('has-updates');
}

function startVersionTimer() {

  clearInterval(versionTimer);

  versionTimer = setInterval(
    syncShipmentChanges,
    60 * 1000
  );
}

function stopVersionTimer() {

  clearInterval(versionTimer);
  versionTimer = null;
}

async function syncShipmentChanges() {

  if (
    sessionExpired ||
    shipmentSyncInProgress ||
    !lastKnownShipmentsVersion
  ) {
    return;
  }

  shipmentSyncInProgress = true;

  try {
    const result = await api(
      'getShipmentChanges',
      {
        sinceVersion: lastKnownShipmentsVersion,
        knownIdsAtVersion: allShipments
          .filter(item => {
            return String(item.updatedAtVersion) ===
              String(lastKnownShipmentsVersion);
          })
          .map(item => String(item.id))
      }
    );

    if (!result.success) {
      return;
    }

    const version = result.data.version || '';
    const changes = result.data.changes || [];
    const deletedIds = result.data.deletedIds || [];

    if (
      changes.length ||
      deletedIds.length
    ) {
      applyIncrementalShipmentChanges(
        changes,
        deletedIds
      );
    }

    if (version) {
      lastKnownShipmentsVersion = version;
    }

  } catch (e) {
    console.error(e);
  } finally {
    shipmentSyncInProgress = false;
  }
}

function validateLength(value, min, max) {

  return value.length >= min &&
         value.length <= max;
}

function isValidShipmentWeight(value) {
  if (!/^\d+(\.\d+)?$/.test(value)) {
    return false;
  }

  const number = Number(value);

  return Number.isFinite(number) &&
         number > 0 &&
         number <= 1000000;
}

function getRequestErrorMessage(defaultMessage) {

  if (!navigator.onLine) {
    return 'Немає з’єднання з інтернетом';
  }

  return defaultMessage;
}

function getShipmentValidationErrorMessage(error) {
  const messages = {
    'deliveryPriority is invalid': uiLabels.deliveryPriorityInvalid,
    FORBIDDEN_PRIORITY: 'Тільки admin може змінювати пріоритет доставки',
    'weightKg is required': uiLabels.weightKgRequired,
    'weightKg is invalid': uiLabels.weightKgInvalid
  };

  return messages[error] || error;
}

function escapeHtml(value) {

  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTimeInput(value) {

  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (isNaN(date.getTime())) {
    return '';
  }

  date.setMinutes(
    date.getMinutes() - date.getTimezoneOffset()
  );

  return date.toISOString().slice(0, 16);
}

function formatDatePartInput(value) {

  return formatDateTimeInput(value).slice(0, 10);
}

function formatTimePartInput(value) {

  return formatDateTimeInput(value).slice(11, 16);
}

function combineDateTimeInput(dateValue, timeValue) {

  if (
    !dateValue ||
    !timeValue
  ) {
    return '';
  }

  return `${dateValue}T${timeValue}`;
}

function formatDateInput(date) {

  const value = new Date(date);

  value.setMinutes(
    value.getMinutes() - value.getTimezoneOffset()
  );

  return value.toISOString().slice(0, 10);
}

function getCurrentUserRole() {

  return String((currentUser && currentUser.role) || '')
    .toLowerCase()
    .trim();
}

function isAdmin() {

  const role = getCurrentUserRole();

  return role === 'manager' ||
         role === 'admin';
}

function canEditDeliveryPriority() {

  const role = getCurrentUserRole();

  return role === 'admin';
}

function canDeleteShipment(item) {

  return getCurrentUserRole() === 'admin' &&
         item &&
         item.status === DEFAULT_SHIPMENT_STATUS;
}

function canEditShipment(item) {

  return Boolean(currentUser);
}

function buildOptions(options, selectedValue) {

  const values = [...options];

  if (
    selectedValue &&
    !values.includes(selectedValue)
  ) {
    values.unshift(selectedValue);
  }

  return values
    .map(option => `
      <option
        value="${escapeHtml(option)}"
        ${option === selectedValue ? 'selected' : ''}
      >
        ${escapeHtml(option)}
      </option>
    `)
    .join('');
}

function buildOptionalOptions(options, selectedValue, emptyLabel) {

  return `
    <option value="" ${selectedValue ? '' : 'selected'}>
      ${escapeHtml(emptyLabel)}
    </option>
    ${buildOptions(options, selectedValue)}
  `;
}

function populateSelect(select, options, placeholder) {

  select.innerHTML = `
    <option value="" disabled selected>
      ${escapeHtml(placeholder)}
    </option>
  `;

  options.forEach(option => {
    const item = document.createElement('option');

    item.value = option;
    item.innerText = option;

    select.appendChild(item);
  });
}

function validateUiLabels(labels) {

  return Boolean(labels) &&
    REQUIRED_UI_LABEL_KEYS.every(key => {
      return typeof labels[key] === 'string' &&
             labels[key].trim();
    });
}

function applyUiLabels() {

  document.getElementById('comment').placeholder =
    uiLabels.comment;

  document.getElementById('weightKg').placeholder =
    uiLabels.weightKg;

  document.getElementById('createBtn').innerText =
    uiLabels.createRequest;

  document.querySelector('.shipments-title').innerText =
    uiLabels.shipmentsTitle;

  if (!formOpened) {
    toggleFormText.innerText = uiLabels.createRequest;
  }

  const dashboardUnitOption =
    dashboardGroupBy.querySelector('option[value="unit"]');

  const dashboardCrewOption =
    dashboardGroupBy.querySelector('option[value="crew"]');

  const dashboardMethodOption =
    dashboardGroupBy.querySelector('option[value="method"]');

  const dashboardDestinationOption =
    dashboardGroupBy.querySelector('option[value="destination"]');

  if (dashboardUnitOption) {
    dashboardUnitOption.innerText = uiLabels.unit;
  }

  if (dashboardCrewOption) {
    dashboardCrewOption.innerText = uiLabels.crew;
  }

  if (dashboardMethodOption) {
    dashboardMethodOption.innerText = uiLabels.method;
  }

  if (dashboardDestinationOption) {
    dashboardDestinationOption.innerText = uiLabels.destination;
  }
}

function populateCreateOptions() {

  populateSelect(
    document.getElementById('unit'),
    shipmentOptions.units,
    uiLabels.chooseUnit
  );

  populateSelect(
    document.getElementById('destination'),
    shipmentOptions.destinations,
    uiLabels.chooseDestination
  );

}

async function loadShipmentOptions() {

  const result = await api('getShipmentOptions');

  if (!result.success) {
    throw new Error(result.error);
  }

  applyShipmentOptions(result.data);
}

function applyShipmentOptions(data) {

  shipmentOptions = {
    units: data.units || [],
    crews: data.crews || [],
    methods: data.methods || [],
    destinations: data.destinations || []
  };

  if (!validateUiLabels(data.labels)) {
    throw new Error('UI labels config is missing');
  }

  uiLabels = data.labels;

  applyUiLabels();
  populateCreateOptions();
}

async function loadAppData(initializeDashboard = false) {

  await loadShipmentOptions();

  if (initializeDashboard) {
    setupAdminDashboard();
  }

  await loadShipments();
  startVersionTimer();
}

async function reloadAppData() {

  const shipments =
    document.getElementById('shipments');

  const shipmentsLoader =
    document.getElementById('shipmentsLoader');

  shipments.style.opacity = '0';
  shipmentsLoader.classList.remove('hidden');

  shipmentsLoader.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });

  try {
    const shouldInitializeDashboard =
      isAdmin() &&
      !dashboardFilters.children.length;

    await loadAppData(shouldInitializeDashboard);
  } catch (e) {
    console.error(e);

    showToast(
      getRequestErrorMessage(
        'Не вдалося оновити дані'
      )
    );
  } finally {
    shipmentsLoader.classList.add('hidden');
    shipments.style.opacity = '1';
  }
}

async function createShipment() {

  const unit = document.getElementById('unit').value.trim();
  const destination = document.getElementById('destination').value.trim();
  const weightKg = document.getElementById('weightKg').value.trim();
  const comment = document.getElementById('comment').value.trim();

  if (!unit) {
    showToast(uiLabels.unitRequired);
    return;
  }

  if (!validateLength(unit, 2, 30)) {
    showToast(uiLabels.unitLength);

    return;
  }

  if (!destination) {
    showToast(uiLabels.destinationRequired);
    return;
  }

  if (!validateLength(destination, 2, 180)) {
    showToast(uiLabels.destinationLength);

    return;
  }

  if (!weightKg) {
    showToast(uiLabels.weightKgRequired);
    return;
  }

  if (!isValidShipmentWeight(weightKg)) {
    showToast(uiLabels.weightKgInvalid);
    return;
  }

  if (!comment) {
    showToast(uiLabels.commentRequired);
    return;
  }

  if (!validateLength(comment, 3, 1000)) {
    showToast(uiLabels.commentLength);

    return;
  }

  const createBtn = document.getElementById('createBtn');

  createBtn.classList.add('loading');

  try {
    const result = await api(
      'createShipment',
      {
        name: currentUser.name,
        unit,
        destination,
        weightKg,
        comment
      }
    );

    if (!result.success) {
      showToast(getShipmentValidationErrorMessage(result.error));
      return;
    }

    document.getElementById('unit').value = '';
    document.getElementById('destination').value = '';
    document.getElementById('weightKg').value = '';
    document.getElementById('comment').value = '';

    shipmentForm.classList.remove('form-open');

    toggleFormText.innerText =
      uiLabels.createRequest;

    toggleFormIcon.style.transform =
      'rotate(0deg)';

    formOpened = false;

    await loadShipments();

  } catch (e) {
    console.error(e);

    showToast(
      getRequestErrorMessage(
        'Помилка створення замовлення'
      )
    );

  } finally {
    createBtn.classList.remove('loading');
  }
}

async function loadShipments() {

  const shipments = document.getElementById('shipments');

  const shipmentsLoader = document.getElementById('shipmentsLoader');

  shipments.style.opacity = '0';

  await new Promise(resolve =>
    setTimeout(resolve, 200)
  );

  shipmentsLoader.classList.remove('hidden');

  try {
    const result = await api('getShipments');

    if (!result.success) {
      throw new Error(result.error);
    }

    applyShipments(result.data);

  } finally {
    shipmentsLoader.classList.add('hidden');
    shipments.style.opacity = '1';
  }
}

function applyShipments(items) {

  allShipments = items || [];

  lastKnownShipmentsVersion =
    getShipmentsVersion(allShipments);

  setUpdateNotice(false);

  renderVisibleShipments();
  renderDashboard();
}

function applyIncrementalShipmentChanges(
  changes,
  deletedIds = []
) {

  const itemsById = new Map(
    allShipments.map(item => [
      String(item.id),
      item
    ])
  );
  const appliedIds = new Set();
  let hasDeletions = false;

  deletedIds.forEach(id => {
    if (itemsById.delete(String(id))) {
      hasDeletions = true;
    }

    if (String(editingShipmentId) === String(id)) {
      editingShipmentId = null;
    }
  });

  changes.forEach(item => {
    const id = String(item.id);
    const current = itemsById.get(id);
    const currentVersion = Number(
      current && current.updatedAtVersion || 0
    );
    const nextVersion = Number(
      item.updatedAtVersion || 0
    );

    if (
      current &&
      nextVersion <= currentVersion
    ) {
      return;
    }

    itemsById.set(id, item);
    appliedIds.add(id);
  });

  if (!appliedIds.size) {
    if (hasDeletions) {
      allShipments = Array.from(itemsById.values())
        .sort((a, b) => {
          return new Date(b.createdAtRaw) -
                 new Date(a.createdAtRaw);
        });

      renderIncrementalShipmentDeletions(deletedIds);
      renderDashboard();
      setUpdateNotice(false);
    }

    return;
  }

  allShipments = Array.from(itemsById.values())
    .sort((a, b) => {
      return new Date(b.createdAtRaw) -
             new Date(a.createdAtRaw);
    });

  if (hasDeletions) {
    renderIncrementalShipmentDeletions(deletedIds);
  }

  renderIncrementalShipmentChanges(appliedIds);
  renderDashboard();
  setUpdateNotice(false);
}

function applyLocalShipmentDelete(id, version) {

  applyIncrementalShipmentChanges(
    [],
    [id]
  );

  const nextVersion = Number(version || 0);
  const currentVersion = Number(
    lastKnownShipmentsVersion || 0
  );

  if (nextVersion > currentVersion) {
    lastKnownShipmentsVersion = String(nextVersion);
  } else {
    lastKnownShipmentsVersion =
      getShipmentsVersion(allShipments);
  }
}

function getLatestShipmentById(id) {
  return allShipments.find(item => {
    return String(item.id) === String(id);
  });
}

function getDashboardValues(key) {

  if (key === 'status') {
    return SHIPMENT_STATUSES;
  }

  if (key === 'unit') {
    return shipmentOptions.units;
  }

  if (key === 'crew') {
    return shipmentOptions.crews;
  }

  if (key === 'method') {
    return shipmentOptions.methods;
  }

  if (key === 'destination') {
    return shipmentOptions.destinations;
  }

  return [];
}

function getDashboardFilterValues(key) {

  return [
    DASHBOARD_ALL_VALUE,
    ...getDashboardValues(key)
  ];
}

function getDashboardFilterLabel(key) {

  if (key === 'unit') {
    return uiLabels.unit;
  }

  if (key === 'destination') {
    return uiLabels.destination;
  }

  if (key === 'crew') {
    return uiLabels.crew;
  }

  if (key === 'method') {
    return uiLabels.method;
  }

  if (key === 'status') {
    return 'Статус';
  }

  return key;
}

function getDashboardFilterRows() {

  return Array.from(
    dashboardFilters.querySelectorAll('.dashboard-filter-row')
  );
}

function buildFilterTypeOptions(selectedKey) {

  return DASHBOARD_FILTERS
    .map(filter => `
      <option
        value="${escapeHtml(filter.key)}"
        ${filter.key === selectedKey ? 'selected' : ''}
      >
        ${escapeHtml(getDashboardFilterLabel(filter.key))}
      </option>
    `)
    .join('');
}

function buildFilterValueOptions(key, selectedValue) {

  const values = getDashboardFilterValues(key);

  return values
    .map(value => `
      <option
        value="${escapeHtml(value)}"
        ${value === selectedValue ? 'selected' : ''}
      >
        ${escapeHtml(value)}
      </option>
    `)
    .join('');
}

function syncDashboardRemoveButtons() {

  const rows = getDashboardFilterRows();

  rows.forEach(row => {
    const removeBtn = row.querySelector('.dashboard-remove-filter');
    const isSingleRow = rows.length === 1;

    removeBtn.disabled = isSingleRow;
    removeBtn.classList.toggle('hidden', isSingleRow);
    row.classList.toggle('single-filter', isSingleRow);
  });
}

function getDashboardDefaultState() {

  const today = new Date();
  const monthStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    1
  );

  return {
    from: formatDateInput(monthStart),
    to: formatDateInput(today),
    groupBy: 'status',
    showZeroValues: false,
    filters: [
      {
        key: 'status',
        value: DASHBOARD_ALL_VALUE
      }
    ]
  };
}

function getDashboardRawFilters() {

  return getDashboardFilterRows()
    .map(row => ({
      key: row.querySelector('.dashboard-filter-type').value,
      value: row.querySelector('.dashboard-filter-value').value
    }));
}

function isDashboardDefaultState() {

  const defaultState = getDashboardDefaultState();
  const filters = getDashboardRawFilters();

  return dashboardFrom.value === defaultState.from &&
         dashboardTo.value === defaultState.to &&
         dashboardGroupBy.value === defaultState.groupBy &&
         dashboardShowZeroValues.checked ===
           defaultState.showZeroValues &&
         filters.length === defaultState.filters.length &&
         filters.every((filter, index) => {
           const defaultFilter = defaultState.filters[index];

           return filter.key === defaultFilter.key &&
                  filter.value === defaultFilter.value;
         });
}

function syncDashboardResetButton() {

  resetDashboardBtn.disabled = isDashboardDefaultState();
}

function canShowDashboardZeroValues() {

  const filters = getDashboardRawFilters();

  return filters.length > 0 &&
         filters.every(filter => {
           return filter.value === DASHBOARD_ALL_VALUE;
         });
}

function syncDashboardZeroToggle() {

  const canShowZeroValues =
    canShowDashboardZeroValues();

  dashboardShowZeroValues.disabled = !canShowZeroValues;

  if (!canShowZeroValues) {
    dashboardShowZeroValues.checked = false;
  }
}

function syncDashboardControls() {

  syncDashboardZeroToggle();
  syncDashboardResetButton();
}

function applyDashboardDefaults() {

  const defaultState = getDashboardDefaultState();

  dashboardFrom.value = defaultState.from;
  dashboardTo.value = defaultState.to;
  dashboardGroupBy.value = defaultState.groupBy;
  dashboardShowZeroValues.checked =
    defaultState.showZeroValues;

  dashboardFilters.innerHTML = '';

  defaultState.filters.forEach(filter => {
    addDashboardFilter(filter.key, filter.value);
  });

  syncDashboardControls();
}

function addDashboardFilter(
  key = 'status',
  value = DEFAULT_SHIPMENT_STATUS
) {

  const values = getDashboardFilterValues(key);
  const selectedValue = values.includes(value)
    ? value
    : values[0] || '';

  const row = document.createElement('div');

  row.className = 'dashboard-filter-row';

  row.innerHTML = `
    <div class="select-wrap">
      <select class="dashboard-filter-type">
        ${buildFilterTypeOptions(key)}
      </select>
    </div>

    <div class="select-wrap">
      <select class="dashboard-filter-value">
        ${buildFilterValueOptions(key, selectedValue)}
      </select>
    </div>

    <button
      type="button"
      class="dashboard-remove-filter"
      aria-label="Прибрати параметр"
    >
      ×
    </button>
  `;

  const typeSelect =
    row.querySelector('.dashboard-filter-type');

  const valueSelect =
    row.querySelector('.dashboard-filter-value');

  typeSelect.addEventListener('change', () => {
    const valuesForType =
      getDashboardFilterValues(typeSelect.value);

    valueSelect.innerHTML = buildFilterValueOptions(
      typeSelect.value,
      valuesForType[0] || ''
    );

    syncDashboardControls();
    renderDashboard();
  });

  valueSelect.addEventListener('change', () => {
    syncDashboardControls();
    renderDashboard();
  });

  row
    .querySelector('.dashboard-remove-filter')
    .addEventListener('click', () => {
      if (getDashboardFilterRows().length === 1) {
        return;
      }

      row.remove();
      syncDashboardRemoveButtons();
      syncDashboardControls();
      renderDashboard();
    });

  dashboardFilters.appendChild(row);
  syncDashboardRemoveButtons();
  syncDashboardControls();
}

function getDashboardFilters() {

  const filters = getDashboardFilterRows()
    .map(row => ({
      key: row.querySelector('.dashboard-filter-type').value,
      value: row.querySelector('.dashboard-filter-value').value
    }))
    .filter(filter => {
      return filter.key &&
             filter.value &&
             filter.value !== DASHBOARD_ALL_VALUE;
    });

  return filters.reduce((groups, filter) => {
    if (!groups[filter.key]) {
      groups[filter.key] = [];
    }

    if (!groups[filter.key].includes(filter.value)) {
      groups[filter.key].push(filter.value);
    }

    return groups;
  }, {});
}

function getShipmentDate(item) {

  const date = new Date(item.createdAtRaw);

  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function isShipmentInDashboardPeriod(item, fromDate, toDate) {

  const date = getShipmentDate(item);

  if (!date) {
    return false;
  }

  return date >= fromDate &&
         date <= toDate;
}

function filterDashboardShipments() {

  const fromDate = new Date(`${dashboardFrom.value}T00:00:00`);
  const toDate = new Date(`${dashboardTo.value}T23:59:59`);
  const filterGroups = getDashboardFilters();

  if (
    isNaN(fromDate.getTime()) ||
    isNaN(toDate.getTime()) ||
    fromDate > toDate
  ) {
    showToast('Перевірте період статистики');
    return null;
  }

  return allShipments.filter(item => {
    if (!isShipmentInDashboardPeriod(item, fromDate, toDate)) {
      return false;
    }

    return Object.keys(filterGroups).every(key => {
      return filterGroups[key].includes(
        String(item[key] || '')
      );
    });
  });
}

function getDashboardGroupItems(groupKey, groupValue) {

  const filteredItems = filterDashboardShipments();

  if (!filteredItems) {
    return [];
  }

  return filteredItems.filter(item => {
    return String(item[groupKey] || 'Не вказано') === groupValue;
  });
}

function updateListFilterNotice() {

  if (!activeListFilter) {
    listFilterNotice.classList.add('hidden');
    listFilterText.innerText = '';
    return;
  }

  listFilterText.innerText =
    `Показано за статистикою: ${activeListFilter.label}`;

  listFilterNotice.classList.remove('hidden');
}

function getVisibleShipments() {

  if (!activeListFilter) {
    return allShipments;
  }

  if (activeListFilter.type === 'dashboardTotal') {
    return filterDashboardShipments() || [];
  }

  return getDashboardGroupItems(
    activeListFilter.groupKey,
    activeListFilter.groupValue
  );
}

function normalizeShipmentSearchValue(value) {

  return String(value || '')
    .trim()
    .toLocaleLowerCase('uk-UA');
}

function getSearchFilteredShipments(items) {

  const query =
    normalizeShipmentSearchValue(shipmentSearchQuery);

  if (!query) {
    return items;
  }

  return items.filter(item => {
    return normalizeShipmentSearchValue(
      item.destination
    ).includes(query);
  });
}

function updateShipmentSearchCount(
  visibleCount,
  totalCount
) {

  if (!shipmentSearchCount) {
    return;
  }

  const query =
    normalizeShipmentSearchValue(shipmentSearchQuery);

  if (query) {
    shipmentSearchCount.innerText =
      `Знайдено: ${visibleCount} з ${totalCount}`;
    return;
  }

  shipmentSearchCount.innerText =
    `Всього: ${totalCount}`;
}

function renderVisibleShipments() {

  const visibleItems = getVisibleShipments();
  const searchFilteredItems =
    getSearchFilteredShipments(visibleItems);

  updateListFilterNotice();
  updateShipmentSearchCount(
    searchFilteredItems.length,
    visibleItems.length
  );
  renderShipments(searchFilteredItems);
}

function setShipmentSearchOpened(opened) {

  shipmentSearchOpened = opened;

  shipmentSearchPanel.classList.toggle(
    'is-open',
    shipmentSearchOpened
  );

  shipmentSearchPanel.setAttribute(
    'aria-hidden',
    shipmentSearchOpened ? 'false' : 'true'
  );

  shipmentSearchToggle.classList.toggle(
    'is-active',
    shipmentSearchOpened
  );

  shipmentSearchToggle.setAttribute(
    'aria-expanded',
    shipmentSearchOpened ? 'true' : 'false'
  );

  if (shipmentSearchOpened) {
    window.setTimeout(() => {
      shipmentSearchInput.focus();
    }, 120);
    return;
  }

  shipmentSearchQuery = '';
  shipmentSearchInput.value = '';
  renderVisibleShipments();
}

function toggleShipmentSearch() {

  setShipmentSearchOpened(!shipmentSearchOpened);
}

function applyDashboardListFilter(groupKey, groupValue) {

  activeListFilter = {
    type: 'dashboardGroup',
    groupKey,
    groupValue,
    label: `${getDashboardFilterLabel(groupKey)}: ${groupValue}`
  };

  renderVisibleShipments();

  document
    .querySelector('.shipments-header')
    .scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
}

function applyDashboardTotalListFilter() {

  activeListFilter = {
    type: 'dashboardTotal',
    label: 'увесь результат дашборду'
  };

  renderVisibleShipments();

  document
    .querySelector('.shipments-header')
    .scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
}

function clearDashboardListFilter() {

  activeListFilter = null;
  renderVisibleShipments();
}

function formatDashboardExportDate(value) {

  if (!value) {
    return '';
  }

  const date = new Date(`${value}T00:00:00`);

  if (isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

function buildDashboardExportRows(items, breakdown) {

  const groupLabel =
    getDashboardFilterLabel(dashboardGroupBy.value);
  const period =
    `${formatDashboardExportDate(dashboardFrom.value)} - ${formatDashboardExportDate(dashboardTo.value)}`;

  return [
    ['Період', period],
    [],
    [groupLabel, 'Кількість'],
    ...breakdown.map(item => [
      item.label,
      item.count
    ]),
    [],
    ['Всього', items.length]
  ];
}

function applyDashboardExportStyles(
  worksheet,
  breakdownLength
) {

  const border = {
    top: {
      style: 'thin',
      color: {
        rgb: '000000'
      }
    },
    right: {
      style: 'thin',
      color: {
        rgb: '000000'
      }
    },
    bottom: {
      style: 'thin',
      color: {
        rgb: '000000'
      }
    },
    left: {
      style: 'thin',
      color: {
        rgb: '000000'
      }
    }
  };
  const headerFill = {
    patternType: 'solid',
    fgColor: {
      rgb: 'D9D9D9'
    }
  };
  const headerFont = {
    bold: true
  };
  const tableHeaderRow = 3;
  const tableLastRow =
    tableHeaderRow + breakdownLength;
  const totalRow =
    tableLastRow + 2;

  function styleCell(
    row,
    column,
    style
  ) {

    const address = XLSX.utils.encode_cell({
      r: row - 1,
      c: column - 1
    });

    if (!worksheet[address]) {
      worksheet[address] = {
        t: 's',
        v: ''
      };
    }

    worksheet[address].s = {
      ...(worksheet[address].s || {}),
      ...style
    };
  }

  function styleRange(
    startRow,
    endRow,
    style
  ) {

    for (let row = startRow; row <= endRow; row++) {
      styleCell(row, 1, style);
      styleCell(row, 2, style);
    }
  }

  styleRange(1, 1, {
    border
  });

  styleRange(tableHeaderRow, tableLastRow, {
    border
  });

  styleRange(totalRow, totalRow, {
    border,
    fill: headerFill,
    font: headerFont
  });

  styleRange(tableHeaderRow, tableHeaderRow, {
    border,
    fill: headerFill,
    font: headerFont
  });

  for (let row = tableHeaderRow + 1; row <= tableLastRow; row++) {
    styleCell(row, 2, {
      alignment: {
        horizontal: 'right'
      }
    });
  }

  styleCell(totalRow, 2, {
    alignment: {
      horizontal: 'right'
    },
    border,
    fill: headerFill,
    font: headerFont
  });
}

function getDashboardExportFileName() {

  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0')
  ].join('');

  return `delivery-${stamp}.xlsx`;
}

function exportDashboardToExcel() {

  if (typeof XLSX === 'undefined') {
    showToast('Не вдалося завантажити Excel');
    return;
  }

  const items = filterDashboardShipments();

  if (!items) {
    return;
  }

  const breakdown = getDashboardBreakdown(items);
  const rows = buildDashboardExportRows(
    items,
    breakdown
  );
  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  applyDashboardExportStyles(
    worksheet,
    breakdown.length
  );

  worksheet['!cols'] = [
    {
      wch: 28
    },
    {
      wch: 22
    }
  ];

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    'Статистика'
  );

  XLSX.writeFile(
    workbook,
    getDashboardExportFileName()
  );
}

function getDashboardBreakdown(items) {

  const groupKey = dashboardGroupBy.value;
  const knownValues = getDashboardValues(groupKey);
  const counts = {};
  const shouldShowZeroValues =
    dashboardShowZeroValues.checked;

  items.forEach(item => {
    const value = String(item[groupKey] || 'Не вказано');

    counts[value] = (counts[value] || 0) + 1;
  });

  const orderedValues = [
    ...knownValues,
    ...Object.keys(counts).filter(value => {
      return !knownValues.includes(value);
    })
  ];

  return orderedValues
    .map(value => ({
      label: value,
      count: counts[value] || 0
    }))
    .filter(item => {
      return shouldShowZeroValues ||
             item.count > 0;
    });
}

function renderDashboardChart(items) {

  const breakdown = getDashboardBreakdown(items);
  const groupKey = dashboardGroupBy.value;
  const total = items.length;
  const shouldShowZeroValues =
    dashboardShowZeroValues.checked;
  const shouldScrollBars =
    shouldShowZeroValues &&
    breakdown.length > 12;
  const maxCount = Math.max(
    ...breakdown.map(item => item.count),
    1
  );

  if (
    !total &&
    !shouldShowZeroValues
  ) {
    return `
      <div class="dashboard-empty">
        За вибраними параметрами заявок немає
      </div>
    `;
  }

  return `
    <div
      class="dashboard-total"
      tabindex="0"
      role="button"
      aria-label="Показати всі замовлення з дашборду"
    >
      <span>${total}</span>
      <small>
        заявок, групування: ${escapeHtml(
          getDashboardFilterLabel(groupKey).toLowerCase()
        )}
      </small>
    </div>

    <div class="dashboard-bars ${shouldScrollBars ? 'is-scrollable' : ''}">
      ${breakdown
        .map(item => `
          <div
            class="dashboard-bar-row"
            data-group-key="${escapeHtml(groupKey)}"
            data-group-value="${escapeHtml(item.label)}"
            tabindex="0"
            role="button"
            aria-label="Показати замовлення: ${escapeHtml(item.label)}"
          >
            <div class="dashboard-bar-label">
              ${escapeHtml(item.label)}
            </div>

            <div class="dashboard-bar-track">
              <div
                class="dashboard-bar-fill ${
                  groupKey === 'status'
                    ? getStatusClass(item.label)
                    : ''
                } ${item.count ? '' : 'is-zero'}"
                style="width: ${(item.count / maxCount) * 100}%"
              ></div>
            </div>

            <div class="dashboard-bar-count">
              ${item.count}
            </div>
          </div>
        `)
        .join('')
      }
    </div>
  `;
}

function renderDashboard() {

  if (!isAdmin()) {
    return;
  }

  const filteredItems = filterDashboardShipments();

  if (!filteredItems) {
    return;
  }

  dashboardResult.innerHTML =
    renderDashboardChart(filteredItems);

  const totalButton =
    dashboardResult.querySelector('.dashboard-total');

  if (totalButton) {
    totalButton.addEventListener(
      'click',
      applyDashboardTotalListFilter
    );

    totalButton.addEventListener('keydown', event => {
      if (
        event.key === 'Enter' ||
        event.key === ' '
      ) {
        event.preventDefault();
        applyDashboardTotalListFilter();
      }
    });
  }

  dashboardResult
    .querySelectorAll('.dashboard-bar-row')
    .forEach(row => {
      const applyFilter = () => {
        applyDashboardListFilter(
          row.dataset.groupKey,
          row.dataset.groupValue
        );
      };

      row.addEventListener('click', applyFilter);

      row.addEventListener('keydown', event => {
        if (
          event.key === 'Enter' ||
          event.key === ' '
        ) {
          event.preventDefault();
          applyFilter();
        }
      });
    });
}

function setupAdminDashboard() {

  if (!isAdmin()) {
    adminDashboard.classList.add('hidden');
    return;
  }

  adminDashboard.classList.remove('hidden');

  applyDashboardDefaults();
}

function getStatusClass(status) {

  switch (status) {

    case 'Доставлено':
    case 'Отримано':
      return 'status-success';

    case 'Нова':
    case 'Частково отримано':
      return 'status-warning';

    case 'Недоставлено':
    case 'Неотримано':
      return 'status-danger';

    default:
      return '';
  }
}

function getCardStatusClass(status) {

  switch (status) {

    case 'Доставлено':
    case 'Отримано':
      return 'card-status-done';

    case 'Недоставлено':
    case 'Неотримано':
      return 'card-status-failed';

    default:
      return '';
  }
}

function getCardStatusBadgeClass(status) {

  if (status === 'Нова') {
    return 'card-status-badge-new';
  }

  if (
    status === 'Доставлено' ||
    status === 'Отримано'
  ) {
    return 'card-status-badge-done';
  }

  if (
    status === 'Недоставлено' ||
    status === 'Неотримано'
  ) {
    return 'card-status-badge-failed';
  }

  if (status === 'Частково отримано') {
    return 'card-status-badge-partial';
  }

  return '';
}

function renderDetailsView(item) {

  const editButton = canEditShipment(item)
    ? `
      <button
        type="button"
        class="details-action edit-shipment-btn"
      >
        Змінити
      </button>
    `
    : '';
  const deleteButton = canDeleteShipment(item)
    ? `
      <button
        type="button"
        class="details-action danger delete-shipment-btn"
      >
        Видалити
      </button>
    `
    : '';

  return `
    <div>
      <b>${escapeHtml(uiLabels.destination)}:</b> ${escapeHtml(item.destination)}
    </div>

    <div>
      <b>${escapeHtml(uiLabels.unit)}:</b> ${escapeHtml(item.unit || 'Не вказано')}
    </div>

    <div>
      <b>Створення:</b> ${escapeHtml(item.createdAt)}
    </div>
  
    <div>
      <b>${escapeHtml(uiLabels.crew)}:</b> ${escapeHtml(item.crew || 'Не вказано')}
    </div>

    <div>
      <b>${escapeHtml(uiLabels.method)}:</b> ${escapeHtml(item.method || 'Не вказано')}
    </div>

    <div>
      <b>Дата доставки:</b> ${escapeHtml(item.sentAt || 'Не вказано')}
    </div>

    <div>
      <b>${escapeHtml(uiLabels.deliveryPriority)}:</b> ${escapeHtml(item.deliveryPriority || DEFAULT_DELIVERY_PRIORITY)}
    </div>
  
    <div>
      <b>Створив замовлення:</b> ${escapeHtml(item.name)}
    </div>

    <div>
      <b>Змінив замовлення:</b> ${escapeHtml(item.updatedBy || 'Не вказано')}
    </div>
  
    <div>
      <b>Статус:</b>
    
      <span>
        ${escapeHtml(item.status)}
      </span>
    </div>
  
    <div>
      <b>ID:</b> ${escapeHtml(item.id)}
    </div>
  
    <div class="details-comment">
      <b>${escapeHtml(uiLabels.comment)}:</b>

      <div class="details-comment-text">${escapeHtml(item.comment || 'Не вказано')}</div>
    </div>

    <div>
      <b>${escapeHtml(uiLabels.weightKg)}:</b> ${escapeHtml(item.weightKg || 'Не вказано')}
    </div>

    <div class="details-actions">
      ${editButton}
      ${deleteButton}
    </div>
  `;
}

function renderEditForm(item) {

  return `
    <div class="details-edit-form">

      <div class="edit-stale-warning hidden">
        <span>Заявку змінили в іншому вікні</span>

        <button
          type="button"
          class="reload-stale-edit-btn"
        >
          Завантажити актуальні дані
        </button>
      </div>

      <div class="select-wrap">
        <select class="edit-unit">
          ${buildOptions(shipmentOptions.units, item.unit)}
        </select>
      </div>

      <div class="select-wrap">
        <select class="edit-destination">
          ${buildOptions(
            shipmentOptions.destinations,
            item.destination
          )}
        </select>
      </div>

      <label class="edit-select-field">
        <span>${escapeHtml(uiLabels.crew)}</span>

        <div class="select-wrap">
          <select class="edit-crew">
            ${buildOptionalOptions(
              shipmentOptions.crews,
              item.crew,
              'Не вказано'
            )}
          </select>
        </div>
      </label>

      <label class="edit-select-field">
        <span>${escapeHtml(uiLabels.method)}</span>

        <div class="select-wrap">
          <select class="edit-method">
            ${buildOptionalOptions(
              shipmentOptions.methods,
              item.method,
              'Не вказано'
            )}
          </select>
        </div>
      </label>

      <div class="edit-date-time-row">
        <label class="edit-date-time-field">
          <span>Дата доставки</span>

          <input
            type="date"
            class="edit-sent-date"
            value="${formatDatePartInput(item.sentAtRaw)}"
            aria-label="Дата доставки"
          >
        </label>

        <label class="edit-date-time-field">
          <span>Час</span>

          <input
            type="time"
            class="edit-sent-time"
            value="${formatTimePartInput(item.sentAtRaw)}"
            aria-label="Час доставки"
          >
        </label>
      </div>

      <label class="edit-select-field">
        <span>${escapeHtml(uiLabels.deliveryPriority)}</span>

        <div class="select-wrap">
          <select
            class="edit-delivery-priority"
            ${canEditDeliveryPriority() ? '' : 'disabled'}
          >
            ${buildOptions(
              DELIVERY_PRIORITIES,
              item.deliveryPriority || DEFAULT_DELIVERY_PRIORITY
            )}
          </select>
        </div>
      </label>

      <div class="select-wrap">
        <select class="edit-status">
          ${buildOptions(SHIPMENT_STATUSES, item.status)}
        </select>
      </div>

      <textarea
        class="edit-comment"
        placeholder="${escapeHtml(uiLabels.comment)}"
      >${escapeHtml(item.comment)}</textarea>

      <label class="edit-select-field">
        <span>${escapeHtml(uiLabels.weightKg)}</span>

        <input
          type="text"
          inputmode="decimal"
          class="edit-weight-kg"
          value="${escapeHtml(item.weightKg || '')}"
        >
      </label>

      <div class="details-actions">
        <button
          type="button"
          class="details-action save-shipment-btn"
          disabled
        >
          Зберегти
        </button>

        <button
          type="button"
          class="details-action secondary cancel-edit-btn"
        >
          Скасувати
        </button>
      </div>

    </div>
  `;
}

function getEditData(details) {

  const sentDate =
    details.querySelector('.edit-sent-date').value.trim();

  const sentTime =
    details.querySelector('.edit-sent-time').value.trim();

  return {
    unit: details.querySelector('.edit-unit').value.trim(),
    destination: details.querySelector('.edit-destination').value.trim(),
    method: details.querySelector('.edit-method').value.trim(),
    sentDate,
    sentTime,
    sentAt: combineDateTimeInput(sentDate, sentTime),
    crew: details.querySelector('.edit-crew').value.trim(),
    deliveryPriority:
      details.querySelector('.edit-delivery-priority').value,
    weightKg: details.querySelector('.edit-weight-kg').value.trim(),
    status: details.querySelector('.edit-status').value,
    comment: details.querySelector('.edit-comment').value.trim()
  };
}

function getItemEditData(item) {

  return {
    unit: String(item.unit || '').trim(),
    destination: String(item.destination || '').trim(),
    method: String(item.method || '').trim(),
    sentDate: formatDatePartInput(item.sentAtRaw),
    sentTime: formatTimePartInput(item.sentAtRaw),
    sentAt: combineDateTimeInput(
      formatDatePartInput(item.sentAtRaw),
      formatTimePartInput(item.sentAtRaw)
    ),
    crew: String(item.crew || '').trim(),
    deliveryPriority:
      String(
        item.deliveryPriority ||
        DEFAULT_DELIVERY_PRIORITY
      ),
    weightKg: String(item.weightKg || '').trim(),
    status: String(item.status || ''),
    comment: String(item.comment || '').trim()
  };
}

function setupEditChangeTracking(item, details) {

  const initialData = JSON.stringify(
    getItemEditData(item)
  );
  const saveBtn =
    details.querySelector('.save-shipment-btn');

  const updateSaveState = () => {
    const currentData = JSON.stringify(
      getEditData(details)
    );

    saveBtn.disabled =
      details.dataset.stale === 'true' ||
      currentData === initialData;
  };

  details
    .querySelectorAll('input, select, textarea')
    .forEach(input => {
      input.addEventListener('input', updateSaveState);
      input.addEventListener('change', updateSaveState);
    });

  updateSaveState();
}

function validateEditData(data) {

  if (!data.unit) {
    showToast(uiLabels.unitRequired);
    return false;
  }

  if (!validateLength(data.unit, 2, 30)) {
    showToast(uiLabels.unitLength);

    return false;
  }

  if (
    data.method &&
    !validateLength(data.method, 2, 40)
  ) {
    showToast(uiLabels.methodLength);

    return false;
  }

  if (
    data.crew &&
    !validateLength(data.crew, 2, 40)
  ) {
    showToast(uiLabels.crewLength);

    return false;
  }

  if (!data.weightKg) {
    showToast(uiLabels.weightKgRequired);
    return false;
  }

  if (!isValidShipmentWeight(data.weightKg)) {
    showToast(uiLabels.weightKgInvalid);
    return false;
  }

  if (
    data.sentDate &&
    !data.sentTime
  ) {
    showToast('Вкажіть час доставки');
    return false;
  }

  if (
    data.sentTime &&
    !data.sentDate
  ) {
    showToast('Вкажіть дату доставки або очистіть час');
    return false;
  }

  if (!DELIVERY_PRIORITIES.includes(data.deliveryPriority)) {
    showToast(uiLabels.deliveryPriorityInvalid);
    return false;
  }

  if (!data.destination) {
    showToast(uiLabels.destinationRequired);
    return false;
  }

  if (!validateLength(data.destination, 2, 180)) {
    showToast(uiLabels.destinationLength);

    return false;
  }

  if (!data.comment) {
    showToast(uiLabels.commentRequired);
    return false;
  }

  if (!validateLength(data.comment, 3, 1000)) {
    showToast(uiLabels.commentLength);

    return false;
  }

  return true;
}

async function saveShipmentEdit(item, details) {

  const data = getEditData(details);
  const saveBtn = details.querySelector('.save-shipment-btn');

  if (saveBtn.disabled) {
    return;
  }

  if (!validateEditData(data)) {
    return;
  }

  saveBtn.classList.add('loading');

  try {
    const result = await api(
      'updateShipment',
      {
        id: item.id,
        expectedUpdatedAt: item.updatedAtVersion,
        ...data
      }
    );

    if (!result.success) {
      if (result.error === 'CONFLICT') {
        showToast(
          'Заявку вже змінили. Оновлюю список'
        );

        editingShipmentId = null;
        await loadShipments();
        return;
      }

      if (result.error === 'NOT_FOUND') {
        showToast('Замовлення вже видалено');
        editingShipmentId = null;
        applyLocalShipmentDelete(item.id);
        return;
      }

      if (
        result.error === 'FORBIDDEN' ||
        result.error === 'FORBIDDEN_STATUS'
      ) {
        showToast('Недостатньо прав для редагування');
        editingShipmentId = null;
        await loadShipments();
        return;
      }

      showToast(getShipmentValidationErrorMessage(result.error));
      return;
    }

    editingShipmentId = null;
    showToast('Зміни збережено', 'success');

    if (result.data.shipment) {
      applyIncrementalShipmentChanges([
        result.data.shipment
      ]);
    } else {
      await loadShipments();
    }

  } catch (e) {
    console.error(e);

    showToast(
      getRequestErrorMessage(
        'Помилка збереження замовлення'
      )
    );

  } finally {
    saveBtn.classList.remove('loading');
  }
}

function updateDeleteReasonCounter() {

  deleteReasonCounter.innerText =
    `${deleteReasonInput.value.length} / 500`;
}

function closeDeleteShipmentModal() {

  shipmentPendingDelete = null;

  deleteShipmentModal.classList.add('hidden');
  deleteModalConfirmStep.classList.remove('hidden');
  deleteModalReasonStep.classList.add('hidden');
  deleteModalSubmitBtn.classList.remove('loading');
  deleteReasonInput.value = '';
  updateDeleteReasonCounter();
}

function openDeleteShipmentModal(item) {

  if (!canDeleteShipment(item)) {
    showToast('Недостатньо прав для видалення');
    return;
  }

  shipmentPendingDelete = item;

  deleteModalSummary.innerHTML = `
    <div><b>ID:</b> ${escapeHtml(item.id)}</div>
    <div><b>${escapeHtml(uiLabels.destination)}:</b> ${escapeHtml(item.destination || 'Не вказано')}</div>
  `;

  deleteModalConfirmStep.classList.remove('hidden');
  deleteModalReasonStep.classList.add('hidden');
  deleteShipmentModal.classList.remove('hidden');
}

function showDeleteReasonStep() {

  deleteModalConfirmStep.classList.add('hidden');
  deleteModalReasonStep.classList.remove('hidden');
  deleteReasonInput.focus();
}

async function submitDeleteShipment() {

  if (!shipmentPendingDelete) {
    closeDeleteShipmentModal();
    return;
  }

  const reason = deleteReasonInput.value.trim();

  if (
    reason.length < 5 ||
    reason.length > 500
  ) {
    showToast('Причина видалення повинна містити від 5 до 500 символів');
    return;
  }

  deleteModalSubmitBtn.classList.add('loading');

  try {
    const result = await api(
      'deleteShipment',
      {
        id: shipmentPendingDelete.id,
        reason
      }
    );

    if (!result.success) {
      if (result.error === 'ADMIN_REQUIRED') {
        showToast('Недостатньо прав для видалення');
        return;
      }

      if (result.error === 'deleteReason length is invalid') {
        showToast('Причина видалення повинна містити від 5 до 500 символів');
        return;
      }

      if (result.error === 'NOT_FOUND') {
        showToast('Замовлення вже не знайдено. Оновлюю список');
        closeDeleteShipmentModal();
        await loadShipments();
        return;
      }

      if (result.error === 'deleted shipments sheet is missing') {
        showToast('Не знайдено таблицю deleted_shipments');
        return;
      }

      if (result.error === 'DELETE_ONLY_NEW') {
        showToast('Видаляти можна тільки замовлення зі статусом Нова');
        return;
      }

      showToast(result.error);
      return;
    }

    closeDeleteShipmentModal();
    editingShipmentId = null;
    showToast('Замовлення видалено', 'success');
    applyLocalShipmentDelete(
      result.data.id,
      result.data.version
    );

  } catch (e) {
    console.error(e);

    showToast(
      getRequestErrorMessage(
        'Помилка видалення замовлення'
      )
    );

  } finally {
    deleteModalSubmitBtn.classList.remove('loading');
  }
}

function renderShipments(items) {

  const container =
    document.getElementById('shipments');

  container.innerHTML = '';

  if (!items.length) {

    container.innerHTML = `
      <div class="empty-state">

        <div class="empty-icon">
          ⊹
        </div>

        <div class="empty-title">
          Список порожній
        </div>

        <div class="empty-text">
          ${
            activeListFilter
              ? 'За вибраним результатом заявок немає'
              : 'У вас ще немає відправок'
          }
        </div>

      </div>
    `;

    return;
  }

  items.forEach((item, index) => {
    container.appendChild(
      createShipmentCard(item, index)
    );
  });
}

function createShipmentCard(
  item,
  index,
  options = {}
) {
  const div = document.createElement('div');
  const deleteButton = canDeleteShipment(item)
    ? `
      <button
        type="button"
        class="card-delete-btn"
        aria-label="Видалити замовлення"
        title="Видалити замовлення"
      >
        🗑
      </button>
    `
    : '';

  div.className = [
    'card',
    item.deliveryPriority === 'Терміновий'
      ? 'card-priority-urgent'
      : '',
    options.highlight ? 'card-updated' : ''
  ]
    .filter(Boolean)
    .join(' ');

  div.dataset.shipmentId = String(item.id);
  div.style.animationDelay =
    options.highlight
      ? '0ms'
      : `${index * 70}ms`;

  div.innerHTML = `

      <div class="card-main">

        <div class="card-summary">

          <div class="card-summary-top">

            <div class="summary-item card-id">
              <span class="item-icon id-icon" aria-hidden="true">
                <svg viewBox="0 0 64 64" focusable="false">
                  <path d="M12 14v30"></path>
                  <path d="M20 14v30"></path>
                  <path d="M30 14v30"></path>
                  <path d="M42 14v30"></path>
                  <path d="M52 14v30"></path>
                  <path d="M12 52h8"></path>
                  <path d="M30 52h12"></path>
                  <path d="M52 52h4"></path>
                </svg>
              </span>
              ${escapeHtml(item.id)}
            </div>
      
            <div class="summary-item card-status-text ${getCardStatusBadgeClass(item.status)}">
              ${escapeHtml(item.status)}
            </div>

          </div>
      
          <div class="summary-item card-destination">
            <span class="item-icon" aria-hidden="true">
              <svg viewBox="0 0 64 64" focusable="false">
                <rect x="12" y="12" width="40" height="40" rx="10"></rect>
                <path d="M24 25h16"></path>
                <path d="M24 32h16"></path>
                <path d="M24 39h10"></path>
              </svg>
            </span>
            ${escapeHtml(item.destination)}
          </div>
      
        </div>
      
        <div class="card-date">
          ${escapeHtml(item.createdAt)}
        </div>
      
      </div>

      <div class="card-details-toggle">
        Деталі ⌄
      </div>

      <div class="card-details"></div>

      ${deleteButton}
    `;

    const toggle =
      div.querySelector('.card-details-toggle');

    const details =
      div.querySelector('.card-details');

    const deleteBtn =
      div.querySelector('.card-delete-btn');

    let opened = Boolean(options.opened);

    details.innerHTML = renderDetailsView(item);

    if (opened) {
      div.classList.add('card-details-expanded');
      details.classList.add('details-open');
      toggle.innerText = 'Сховати ⌃';
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', event => {
        event.stopPropagation();
        openDeleteShipmentModal(item);
      });
    }

    toggle.addEventListener('click', () => {

      opened = !opened;

      if (opened) {

        div.classList.add('card-details-expanded');
        details.classList.add('details-open');

        toggle.innerText =
          'Сховати ⌃';

      } else {

        if (
          String(editingShipmentId) ===
          String(item.id)
        ) {
          editingShipmentId = null;
          details.dataset.stale = 'false';
          details.innerHTML = renderDetailsView(
            getLatestShipmentById(item.id) || item
          );
        }

        div.classList.remove('card-details-expanded');
        details.classList.remove('details-open');

        toggle.innerText =
          'Деталі ⌄';
      }
    });

    details.addEventListener('click', async event => {

      if (event.target.classList.contains('edit-shipment-btn')) {
        editingShipmentId = item.id;
        details.innerHTML = renderEditForm(item);
        setupEditChangeTracking(item, details);
        return;
      }

      if (event.target.classList.contains('delete-shipment-btn')) {
        openDeleteShipmentModal(item);
        return;
      }

      if (event.target.classList.contains('cancel-edit-btn')) {
        editingShipmentId = null;
        details.dataset.stale = 'false';
        details.innerHTML = renderDetailsView(
          getLatestShipmentById(item.id) || item
        );
        return;
      }

      if (event.target.classList.contains('reload-stale-edit-btn')) {
        const latestItem =
          getLatestShipmentById(item.id);

        editingShipmentId = null;
        details.dataset.stale = 'false';
        details.innerHTML = renderDetailsView(
          latestItem || item
        );
        return;
      }

      if (event.target.classList.contains('save-shipment-btn')) {
        await saveShipmentEdit(item, details);
      }
    });

  return div;
}

function markEditingShipmentStale(card) {

  if (!card) {
    return;
  }

  const details = card.querySelector('.card-details');
  const warning = details &&
    details.querySelector('.edit-stale-warning');
  const saveBtn = details &&
    details.querySelector('.save-shipment-btn');

  if (!details || !warning) {
    return;
  }

  details.dataset.stale = 'true';
  warning.classList.remove('hidden');

  if (saveBtn) {
    saveBtn.disabled = true;
  }

  card.classList.add('card-stale');
}

function renderIncrementalShipmentChanges(changedIds) {

  const container =
    document.getElementById('shipments');
  const baseVisibleItems = getVisibleShipments();
  const visibleItems =
    getSearchFilteredShipments(baseVisibleItems);
  const visibleIds = new Set(
    visibleItems.map(item => String(item.id))
  );
  const cards = new Map(
    Array.from(
      container.querySelectorAll('.card[data-shipment-id]')
    ).map(card => [
      card.dataset.shipmentId,
      card
    ])
  );

  container.querySelector('.empty-state')?.remove();

  cards.forEach((card, id) => {
    if (
      !visibleIds.has(id) &&
      id !== String(editingShipmentId)
    ) {
      card.remove();
      cards.delete(id);
    }
  });

  visibleItems.forEach((item, index) => {
    const id = String(item.id);
    let card = cards.get(id);

    if (
      changedIds.has(id) &&
      id === String(editingShipmentId)
    ) {
      markEditingShipmentStale(card);
    } else if (changedIds.has(id)) {
      const opened = Boolean(
        card &&
        card.querySelector('.card-details.details-open')
      );
      const updatedCard = createShipmentCard(
        item,
        index,
        {
          highlight: true,
          opened
        }
      );

      if (card) {
        card.replaceWith(updatedCard);
      }

      card = updatedCard;
      cards.set(id, card);
    } else if (!card) {
      card = createShipmentCard(
        item,
        index,
        {
          highlight: true
        }
      );
      cards.set(id, card);
    }

    const cardAtIndex =
      container.children[index] || null;

    if (
      card &&
      cardAtIndex !== card
    ) {
      container.insertBefore(
        card,
        cardAtIndex
      );
    }
  });

  if (
    !visibleItems.length &&
    editingShipmentId === null
  ) {
    renderShipments([]);
  }

  updateShipmentSearchCount(
    visibleItems.length,
    baseVisibleItems.length
  );
}

function renderIncrementalShipmentDeletions(deletedIds) {

  const container =
    document.getElementById('shipments');
  const deletedIdSet = new Set(
    deletedIds.map(id => String(id))
  );

  deletedIdSet.forEach(id => {
    const card = Array.from(
      container.querySelectorAll('.card[data-shipment-id]')
    ).find(item => {
      return item.dataset.shipmentId === id;
    });

    if (card) {
      card.remove();
    }
  });

  const baseVisibleItems = getVisibleShipments();
  const visibleItems =
    getSearchFilteredShipments(baseVisibleItems);

  updateListFilterNotice();
  updateShipmentSearchCount(
    visibleItems.length,
    baseVisibleItems.length
  );

  if (
    !visibleItems.length &&
    !container.querySelector('.empty-state')
  ) {
    renderShipments([]);
  }
}

document.getElementById('createBtn')
  .addEventListener('click', createShipment);

document
  .getElementById('twoFactorSubmitBtn')
  .addEventListener('click', submitTwoFactorCode);

document
  .getElementById('twoFactorCancelBtn')
  .addEventListener('click', cancelTwoFactor);

document
  .getElementById('twoFactorCode')
  .addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      submitTwoFactorCode();
    }
  });

document
  .getElementById('hubBtn')
  .addEventListener('click', () => {
    window.location.href = HUB_URL;
  });

loadBtn.addEventListener('click', reloadAppData);

shipmentSearchToggle.addEventListener(
  'click',
  toggleShipmentSearch
);

shipmentSearchInput.addEventListener('input', () => {
  shipmentSearchQuery = shipmentSearchInput.value;
  renderVisibleShipments();
});

shipmentSearchInput.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    setShipmentSearchOpened(false);
  }
});

addDashboardFilterBtn.addEventListener('click', () => {
  addDashboardFilter('status', DEFAULT_SHIPMENT_STATUS);
  renderDashboard();
});

resetDashboardBtn.addEventListener('click', () => {
  if (resetDashboardBtn.disabled) {
    return;
  }

  applyDashboardDefaults();
  renderDashboard();
});

dashboardFrom.addEventListener('change', () => {
  syncDashboardControls();
  renderDashboard();
});

dashboardTo.addEventListener('change', () => {
  syncDashboardControls();
  renderDashboard();
});

dashboardGroupBy.addEventListener('change', () => {
  syncDashboardControls();
  renderDashboard();
});

dashboardShowZeroValues.addEventListener('change', () => {
  syncDashboardControls();
  renderDashboard();
});

exportDashboardBtn.addEventListener(
  'click',
  exportDashboardToExcel
);

clearListFilterBtn.addEventListener('click', clearDashboardListFilter);

deleteModalCancelBtn.addEventListener(
  'click',
  closeDeleteShipmentModal
);

deleteModalNextBtn.addEventListener(
  'click',
  showDeleteReasonStep
);

deleteModalBackBtn.addEventListener('click', () => {
  deleteModalConfirmStep.classList.remove('hidden');
  deleteModalReasonStep.classList.add('hidden');
});

deleteModalSubmitBtn.addEventListener(
  'click',
  submitDeleteShipment
);

deleteReasonInput.addEventListener(
  'input',
  updateDeleteReasonCounter
);

deleteShipmentModal.addEventListener('click', event => {
  if (event.target === deleteShipmentModal) {
    closeDeleteShipmentModal();
  }
});

document.addEventListener('keydown', event => {
  if (
    event.key === 'Escape' &&
    !deleteShipmentModal.classList.contains('hidden')
  ) {
    closeDeleteShipmentModal();
  }
});

const scrollTopBtn = document.getElementById('scrollTopBtn');

window.addEventListener('scroll', () => {

  if (window.scrollY > 300) {

    scrollTopBtn.classList.add('show');
    scrollTopBtn.classList.remove('hidden');

  } else {

    scrollTopBtn.classList.remove('show');

    setTimeout(() => {

      if (window.scrollY <= 300) {
        scrollTopBtn.classList.add('hidden');
      }

    }, 250);
  }
});

scrollTopBtn.addEventListener('click', () => {

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });

});

document
  .getElementById('reloadSessionBtn')
  .addEventListener('click', () => {

    renewSession();
  });

document
  .getElementById('reloadWarningBtn')
  .addEventListener('click', () => {

    renewSession();
  });

trySharedSession();
