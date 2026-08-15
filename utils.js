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

function sanitizeShipmentWeightInput(value) {
  let hasDot = false;

  return String(value || '')
    .split('')
    .filter(char => {
      if (/\d/.test(char)) {
        return true;
      }

      if (
        char === '.' &&
        !hasDot
      ) {
        hasDot = true;
        return true;
      }

      return false;
    })
    .join('');
}

function getRequestErrorMessage(defaultMessage) {

  if (!navigator.onLine) {
    return 'Немає з’єднання з інтернетом';
  }

  return defaultMessage;
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

function normalizeShipmentSearchValue(value) {

  return String(value || '')
    .trim()
    .toLocaleLowerCase('uk-UA');
}
