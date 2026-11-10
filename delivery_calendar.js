'use strict';

const DELIVERY_CALENDAR_DAYS = 7;
const DELIVERY_CALENDAR_LABELS = [
  'calendarTitle', 'calendarEndDate', 'calendarPreviousPeriod',
  'calendarNextPeriod', 'calendarEmpty', 'calendarExpand', 'calendarClose',
  'calendarAllCategories', 'calendarListFilterPrefix'
];

function isDeliveryCalendarDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;

  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
}

function shiftDeliveryCalendarDay(day, offset) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function getDeliveryCalendarToday(formatter, now = new Date()) {
  const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getShipmentCalendarDay(shipment) {
  // GAS has already formatted this date in the same zone used for the calendar's today.
  const match = /^(\d{2})\.(\d{2})\.(\d{4})(?:\s|$)/.exec(String(shipment.sentAt || ''));
  if (!shipment.sentAtRaw || !match) return '';

  const day = `${match[3]}-${match[2]}-${match[1]}`;
  return isDeliveryCalendarDay(day) ? day : '';
}

function getDeliveryCalendarCategories(value) {
  const categories = Array.isArray(value) ? value : String(value || '').split(',');
  return categories.map(category => String(category || '').trim()).filter(Boolean);
}

function matchesDeliveryCalendarCategories(shipment, selection) {
  return !selection.size || getDeliveryCalendarCategories(shipment.categories).some(category => selection.has(category));
}

function buildDeliveryCalendar(end, destinations, shipments, allowedStatuses) {
  const days = Array.from({ length: DELIVERY_CALENDAR_DAYS }, (_, index) =>
    shiftDeliveryCalendarDay(end, index - DELIVERY_CALENDAR_DAYS + 1)
  );
  const dayIndexes = new Map(days.map((day, index) => [day, index]));
  const byDestination = new Map();
  const addRow = destination => {
    const row = { destination, cells: days.map(() => []), hasDeliveries: false };
    byDestination.set(destination, row);
    return row;
  };

  for (const value of destinations) {
    const destination = String(value || '').trim();
    if (destination && !byDestination.has(destination)) addRow(destination);
  }
  const configuredRows = Array.from(byDestination.values());
  const historicalRows = [];

  for (const shipment of shipments) {
    if (!allowedStatuses.has(shipment.status)) continue;
    const dayIndex = dayIndexes.get(getShipmentCalendarDay(shipment));
    const destination = String(shipment.destination || '').trim();
    if (dayIndex === undefined || !destination) continue;

    let row = byDestination.get(destination);
    if (!row) {
      row = addRow(destination);
      historicalRows.push(row);
    }
    row.cells[dayIndex].push(shipment);
    row.hasDeliveries = true;
  }

  historicalRows.sort((a, b) => a.destination.localeCompare(b.destination, 'uk'));
  const activeRows = configuredRows.filter(row => row.hasDeliveries).concat(historicalRows);
  for (const row of activeRows) {
    for (const cell of row.cells) {
      cell.sort((a, b) => String(a.sentAt).localeCompare(String(b.sentAt)) || String(a.id).localeCompare(String(b.id)));
    }
  }
  return {
    days,
    rows: activeRows.concat(configuredRows.filter(row => !row.hasDeliveries)),
    hasDeliveries: activeRows.length > 0
  };
}

function createDeliveryCalendar({ isAllowed, getShipments, getDestinations, getCategoryOptions, getStatusClass,
  allowedStatuses, renderStatistics, showCellShipments, onCategoryChange }) {
  const element = id => document.getElementById(id);
  const expandedDialog = element('deliveryCalendarExpanded');
  const categoryFilter = element('deliveryCalendarCategoryFilter');
  if (!expandedDialog?.showModal || !categoryFilter) return null;

  const switcher = element('dashboardModeSwitch');
  const statsButton = element('dashboardStatisticsButton');
  const calendarButton = element('deliveryCalendarButton');
  const statsPanel = element('dashboardStatistics');
  const statsHeader = statsPanel.querySelector('.dashboard-header');
  const calendarPanel = element('deliveryCalendar');
  const calendarHome = element('deliveryCalendarHome');
  const expandButton = element('deliveryCalendarExpand');
  const collapseButton = element('deliveryCalendarCollapse');
  const categorySummary = element('deliveryCalendarCategorySummary');
  const categoryOptions = element('deliveryCalendarCategoryOptions');
  const allCategoriesButton = element('deliveryCalendarAllCategories');
  const endInput = element('deliveryCalendarEnd');
  const previousButton = element('deliveryCalendarPrevious');
  const nextButton = element('deliveryCalendarNext');
  const range = element('deliveryCalendarRange');
  const empty = element('deliveryCalendarEmpty');
  const scroller = element('deliveryCalendarScroll');
  const head = element('deliveryCalendarHead');
  const body = element('deliveryCalendarBody');
  let labels;
  let formatter;
  let selected = false;
  let end = '';
  const selectedCategories = new Set();
  let previewScrollTop = 0;

  function make(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function updateMode() {
    const available = Boolean(formatter) && isAllowed();
    if (!available) {
      closeOverlays();
      selected = false;
    }

    switcher.classList.toggle('hidden', !available);
    statsHeader.classList.toggle('hidden', available);
    statsPanel.classList.toggle('hidden', selected);
    calendarPanel.classList.toggle('hidden', !selected);
    statsButton.setAttribute('aria-pressed', String(!selected));
    calendarButton.setAttribute('aria-pressed', String(selected));
  }

  function formatDay(day, full = false) {
    const [year, month, date] = day.split('-');
    return full ? `${date}.${month}.${year}` : `${date}.${month}`;
  }

  function getFilteredShipments() {
    const shipments = getShipments();
    return selectedCategories.size
      ? shipments.filter(shipment => matchesDeliveryCalendarCategories(shipment, selectedCategories))
      : shipments;
  }

  function getCellShipments(destination, day) {
    if (!isAllowed()) return [];
    return getFilteredShipments().filter(shipment =>
      allowedStatuses.has(shipment.status) && String(shipment.destination || '').trim() === destination &&
      getShipmentCalendarDay(shipment) === day
    );
  }

  function updateCategorySummary() {
    const count = selectedCategories.size;
    categorySummary.textContent = count ? `${labels.categories}: ${count}` : labels.calendarAllCategories;
    categoryFilter.classList.toggle('is-filtered', count > 0);
    allCategoriesButton.disabled = !count;
    for (const input of categoryOptions.querySelectorAll('input')) {
      input.checked = selectedCategories.has(input.value);
    }
  }

  function renderCategoryOptions() {
    const values = new Set(getDeliveryCalendarCategories(getCategoryOptions()));
    for (const category of selectedCategories) {
      if (!values.has(category)) selectedCategories.delete(category);
    }
    categoryOptions.replaceChildren(...Array.from(values, category => {
      const option = make('label', undefined, 'delivery-calendar-category-option');
      const input = make('input');
      input.type = 'checkbox';
      input.value = category;
      option.append(input, make('span', category));
      return option;
    }));
    categoryFilter.classList.toggle('hidden', !values.size);
    updateCategorySummary();
  }

  function refreshCategoryFilter() {
    updateCategorySummary();
    previewScrollTop = 0;
    scroller.scrollTop = 0;
    refresh();
    onCategoryChange();
  }

  function makeEntry(shipment) {
    const entry = make('span', undefined, 'delivery-calendar-entry');
    const statusClass = getStatusClass(shipment.status);
    if (statusClass) entry.classList.add(statusClass);
    entry.append(make('strong', shipment.status));
    const categories = getDeliveryCalendarCategories(shipment.categories);
    for (const category of categories.length ? categories : [labels.notSpecified]) {
      entry.append(make('span', category, 'delivery-calendar-category'));
    }
    return entry;
  }

  function syncScrollLock() {
    document.body.classList.toggle('delivery-calendar-modal-open', expandedDialog.open);
  }

  function closeExpanded(restoreFocus = true) {
    if (!expandedDialog.open) return;
    expandedDialog.close();
    calendarHome.append(calendarPanel);
    scroller.scrollTop = previewScrollTop;
    syncScrollLock();
    if (restoreFocus) expandButton.focus({ preventScroll: true });
  }

  function closeOverlays() {
    closeExpanded(false);
  }

  function makeCellButton(destination, day, shipments) {
    const button = make('button', undefined, 'delivery-calendar-cell-button');
    button.type = 'button';
    button.setAttribute('aria-controls', 'shipments');
    const statuses = [...new Set(shipments.map(item => item.status))];
    const categories = [...new Set(shipments.flatMap(item => getDeliveryCalendarCategories(item.categories)))];
    const description = `${destination} · ${formatDay(day, true)} · ${shipments.length} · ${statuses.join(', ')}`;
    button.setAttribute('aria-label', description);
    button.title = categories.length ? `${description}\n${categories.join(', ')}` : description;

    const preview = make('span', undefined, 'delivery-calendar-preview');
    preview.setAttribute('aria-hidden', 'true');
    const markers = make('span', undefined, 'delivery-calendar-markers');
    const colors = new Set(statuses.map(getStatusClass).filter(Boolean));
    for (const color of colors) markers.append(make('span', undefined, `delivery-calendar-dot ${color}`));
    if (shipments.length > 1) markers.append(make('span', shipments.length > 99 ? '99+' : String(shipments.length)));
    preview.append(markers);
    if (categories.length) {
      const summary = categories.length > 1 ? `${categories[0]} +${categories.length - 1}` : categories[0];
      preview.append(make('span', summary, 'delivery-calendar-category-summary'));
    }
    const entries = make('span', undefined, 'delivery-calendar-cell-entries');
    entries.setAttribute('aria-hidden', 'true');
    entries.append(...shipments.map(makeEntry));
    button.append(preview, entries);
    button.addEventListener('click', () => {
      if (!selected || !isAllowed()) return;
      categoryFilter.open = false;
      closeExpanded(false);
      showCellShipments(destination, day, formatDay(day, true));
    });
    return button;
  }

  function refresh() {
    if (!selected || !formatter || !isAllowed()) return false;

    const today = getDeliveryCalendarToday(formatter);
    const endDay = end && end < today ? end : today;
    const calendar = buildDeliveryCalendar(endDay, getDestinations(), getFilteredShipments(), allowedStatuses);
    endInput.max = today;
    endInput.value = endDay;
    nextButton.disabled = endDay === today;
    const period = `${formatDay(calendar.days[0], true)} – ${formatDay(endDay, true)}`;
    if (range.textContent !== period) range.textContent = period;
    empty.classList.toggle('hidden', calendar.hasDeliveries);

    const headings = make('tr');
    const destinationHeader = make('th', labels.destination);
    destinationHeader.scope = 'col';
    headings.append(destinationHeader);
    for (const day of calendar.days) {
      const header = make('th');
      const date = make('time', formatDay(day));
      date.dateTime = day;
      date.setAttribute('aria-label', formatDay(day, true));
      header.title = formatDay(day, true);
      header.scope = 'col';
      if (day === today) {
        header.classList.add('is-today');
        date.setAttribute('aria-current', 'date');
      }
      header.append(date);
      headings.append(header);
    }

    const rows = document.createDocumentFragment();
    for (const row of calendar.rows) {
      const tr = make('tr');
      const destination = make('th');
      destination.scope = 'row';
      destination.title = row.destination;
      destination.append(make('span', row.destination, 'delivery-calendar-destination-name'));
      tr.append(destination);
      for (const [index, cell] of row.cells.entries()) {
        const td = make('td');
        if (cell.length) {
          const day = calendar.days[index];
          td.append(makeCellButton(row.destination, day, cell));
        }
        tr.append(td);
      }
      rows.append(tr);
    }
    head.replaceChildren(headings);
    body.replaceChildren(rows);
    return true;
  }

  function setEnd(value) {
    if (!formatter || !selected || !isAllowed()) return;
    const today = getDeliveryCalendarToday(formatter);
    end = isDeliveryCalendarDay(value) && value < today ? value : '';
    previewScrollTop = 0;
    scroller.scrollTop = 0;
    refresh();
  }

  function movePeriod(offset) {
    if (!formatter || !selected || !isAllowed()) return;
    const today = getDeliveryCalendarToday(formatter);
    setEnd(shiftDeliveryCalendarDay(end && end < today ? end : today, offset));
  }

  statsButton.addEventListener('click', () => {
    if (!selected) return;
    closeOverlays();
    selected = false;
    updateMode();
    renderStatistics();
  });
  calendarButton.addEventListener('click', () => {
    if (selected || !formatter || !isAllowed()) return;
    selected = true;
    updateMode();
    refresh();
  });
  expandButton.addEventListener('click', () => {
    if (!selected || !isAllowed() || expandedDialog.open) return;
    previewScrollTop = scroller.scrollTop;
    expandedDialog.append(calendarPanel);
    expandedDialog.showModal();
    scroller.scrollTop = previewScrollTop;
    syncScrollLock();
    collapseButton.focus();
  });
  collapseButton.addEventListener('click', () => closeExpanded());
  expandedDialog.addEventListener('cancel', event => {
    event.preventDefault();
    closeExpanded();
  });
  categoryOptions.addEventListener('change', event => {
    if (!selected || !isAllowed() || !event.target.matches('input[type="checkbox"]')) return;
    const { value, checked } = event.target;
    if (checked) selectedCategories.add(value);
    else selectedCategories.delete(value);
    refreshCategoryFilter();
  });
  allCategoriesButton.addEventListener('click', () => {
    if (!selected || !isAllowed()) return;
    selectedCategories.clear();
    refreshCategoryFilter();
  });
  previousButton.addEventListener('click', () => movePeriod(-DELIVERY_CALENDAR_DAYS));
  nextButton.addEventListener('click', () => movePeriod(DELIVERY_CALENDAR_DAYS));
  endInput.addEventListener('change', () => setEnd(endInput.value));

  return {
    configure(newLabels, timeZone) {
      labels = newLabels;
      formatter = null;
      if (typeof timeZone === 'string' && timeZone && DELIVERY_CALENDAR_LABELS.every(key =>
        typeof labels[key] === 'string' && labels[key].trim()
      )) {
        try {
          formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
          });
        } catch (error) {
          if (!(error instanceof RangeError)) throw error;
        }
      }
      if (formatter) {
        statsButton.textContent = labels.dashboardTitle;
        calendarButton.textContent = labels.calendarTitle;
        element('deliveryCalendarExpandedTitle').textContent = labels.calendarTitle;
        expandButton.textContent = labels.calendarExpand;
        collapseButton.textContent = labels.calendarClose;
        allCategoriesButton.textContent = labels.calendarAllCategories;
        element('deliveryCalendarEndLabel').textContent = labels.calendarEndDate;
        previousButton.setAttribute('aria-label', labels.calendarPreviousPeriod);
        nextButton.setAttribute('aria-label', labels.calendarNextPeriod);
        empty.textContent = labels.calendarEmpty;
        renderCategoryOptions();
      }
      updateMode();
    },
    reset() {
      closeOverlays();
      selected = false;
      end = '';
      selectedCategories.clear();
      categoryFilter.open = false;
      if (formatter) updateCategorySummary();
      scroller.scrollTop = 0;
      updateMode();
    },
    refresh,
    getCellShipments,
    closeOverlays
  };
}
