'use strict';

const DELIVERY_CALENDAR_DAYS = 7;
const DELIVERY_CALENDAR_LABELS = [
  'calendarTitle', 'calendarEndDate', 'calendarPreviousPeriod',
  'calendarNextPeriod', 'calendarEmpty'
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

function createDeliveryCalendar({ isAllowed, getShipments, getDestinations, getStatusClass, allowedStatuses, renderStatistics }) {
  const element = id => document.getElementById(id);
  const switcher = element('dashboardModeSwitch');
  const statsButton = element('dashboardStatisticsButton');
  const calendarButton = element('deliveryCalendarButton');
  const statsPanel = element('dashboardStatistics');
  const statsHeader = statsPanel.querySelector('.dashboard-header');
  const calendarPanel = element('deliveryCalendar');
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

  function make(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function updateMode() {
    const available = Boolean(formatter) && isAllowed();
    if (!available) selected = false;

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

  function refresh() {
    if (!selected || !formatter || !isAllowed()) return false;

    const today = getDeliveryCalendarToday(formatter);
    const endDay = end && end < today ? end : today;
    const calendar = buildDeliveryCalendar(endDay, getDestinations(), getShipments(), allowedStatuses);
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
      const destination = make('th', row.destination);
      destination.scope = 'row';
      tr.append(destination);
      for (const cell of row.cells) {
        const td = make('td');
        for (const shipment of cell) {
          const entry = make('div', undefined, 'delivery-calendar-entry');
          const statusClass = getStatusClass(shipment.status);
          if (statusClass) entry.classList.add(statusClass);
          entry.append(make('strong', shipment.status));
          const categories = String(shipment.categories || '').split(',').map(value => value.trim()).filter(Boolean);
          const list = make('ul');
          for (const category of categories.length ? categories : [labels.notSpecified]) {
            list.append(make('li', category));
          }
          entry.append(list);
          td.append(entry);
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
    selected = false;
    updateMode();
    renderStatistics();
  });
  calendarButton.addEventListener('click', () => {
    if (selected || !formatter || !isAllowed()) return;
    selected = true;
    updateMode();
    refresh();
    if (!end) scroller.scrollLeft = scroller.scrollWidth;
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
        element('deliveryCalendarEndLabel').textContent = labels.calendarEndDate;
        previousButton.setAttribute('aria-label', labels.calendarPreviousPeriod);
        nextButton.setAttribute('aria-label', labels.calendarNextPeriod);
        empty.textContent = labels.calendarEmpty;
      }
      updateMode();
    },
    reset() {
      selected = false;
      end = '';
      scroller.scrollTop = 0;
      updateMode();
    },
    refresh
  };
}
