const DASHBOARD_EXPORT_COLUMNS = [
  {
    key: 'id',
    labelKey: 'id'
  },
  {
    key: 'createdAt',
    labelKey: 'createdAt'
  },
  {
    key: 'destination',
    labelKey: 'destination'
  },
  {
    key: 'hub',
    labelKey: 'hub'
  },
  {
    key: 'unit',
    labelKey: 'unit'
  },
  {
    key: 'crew',
    labelKey: 'crew'
  },
  {
    key: 'method',
    labelKey: 'method'
  },
  {
    key: 'sentAt',
    labelKey: 'sentAt'
  },
  {
    key: 'status',
    labelKey: 'status'
  },
  {
    key: 'comment',
    labelKey: 'comment'
  },
  {
    key: 'weightKg',
    labelKey: 'weightKg'
  },
  {
    key: 'name',
    labelKey: 'createdByName'
  },
  {
    key: 'updatedBy',
    labelKey: 'updatedByName'
  }
];

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

function getDashboardExportFileName() {

  const from = formatDashboardExportDate(dashboardFrom.value);
  const to = formatDashboardExportDate(dashboardTo.value);

  return `delivery_export_${from}_${to}.xlsx`;
}

function getDashboardExportShipments() {

  const fromDate = new Date(`${dashboardFrom.value}T00:00:00`);
  const toDate = new Date(`${dashboardTo.value}T23:59:59`);

  if (
    isNaN(fromDate.getTime()) ||
    isNaN(toDate.getTime()) ||
    fromDate > toDate
  ) {
    showToast(uiLabels.dashboardPeriodInvalid);
    return null;
  }

  return allShipments
    .filter(item => {
      return isShipmentInDashboardPeriod(
        item,
        fromDate,
        toDate
      );
    })
    .sort((a, b) => {
      return new Date(b.createdAtRaw) -
             new Date(a.createdAtRaw);
    });
}

function getDashboardExportCellValue(item, key) {

  if (key === 'weightKg') {
    const value = Number(
      String(item.weightKg || '').trim()
    );

    return Number.isFinite(value)
      ? value
      : '';
  }

  if (key === 'sentAt') {
    return item.sentAt || '';
  }

  return item[key] || '';
}

function buildDashboardExportRows(items) {

  return [
    DASHBOARD_EXPORT_COLUMNS.map(column => {
      return uiLabels[column.labelKey] || column.key;
    }),
    ...items.map(item => {
      return DASHBOARD_EXPORT_COLUMNS.map(column => {
        return getDashboardExportCellValue(
          item,
          column.key
        );
      });
    })
  ];
}

function applyDashboardExportStyles(
  worksheet,
  rowCount
) {

  const columnCount = DASHBOARD_EXPORT_COLUMNS.length;
  const rangeRef = XLSX.utils.encode_range({
    s: {
      r: 0,
      c: 0
    },
    e: {
      r: Math.max(0, rowCount - 1),
      c: columnCount - 1
    }
  });
  const border = {
    top: {
      style: 'thin',
      color: {
        rgb: 'D9D9D9'
      }
    },
    right: {
      style: 'thin',
      color: {
        rgb: 'D9D9D9'
      }
    },
    bottom: {
      style: 'thin',
      color: {
        rgb: 'D9D9D9'
      }
    },
    left: {
      style: 'thin',
      color: {
        rgb: 'D9D9D9'
      }
    }
  };
  const headerStyle = {
    font: {
      bold: true
    },
    fill: {
      patternType: 'solid',
      fgColor: {
        rgb: 'EDEDED'
      }
    },
    border
  };

  worksheet['!autofilter'] = {
    ref: rangeRef
  };

  for (let column = 0; column < columnCount; column++) {
    const address = XLSX.utils.encode_cell({
      r: 0,
      c: column
    });

    worksheet[address].s = headerStyle;
  }

  for (let row = 1; row < rowCount; row++) {
    for (let column = 0; column < columnCount; column++) {
      const address = XLSX.utils.encode_cell({
        r: row,
        c: column
      });

      if (!worksheet[address]) {
        continue;
      }

      worksheet[address].s = {
        border,
        alignment: {
          vertical: 'top',
          wrapText: true
        }
      };
    }
  }
}

function exportDashboardToExcel() {

  if (typeof XLSX === 'undefined') {
    showToast(uiLabels.exportLoadError);
    return;
  }

  const items = getDashboardExportShipments();

  if (!items) {
    return;
  }

  const rows = buildDashboardExportRows(items);
  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  applyDashboardExportStyles(
    worksheet,
    rows.length
  );

  worksheet['!cols'] = [
    {
      wch: 18
    },
    {
      wch: 18
    },
    {
      wch: 28
    },
    {
      wch: 16
    },
    {
      wch: 18
    },
    {
      wch: 16
    },
    {
      wch: 20
    },
    {
      wch: 18
    },
    {
      wch: 18
    },
    {
      wch: 42
    },
    {
      wch: 18
    },
    {
      wch: 22
    },
    {
      wch: 22
    }
  ];

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    uiLabels.shipmentsTitle || 'data'
  );

  XLSX.writeFile(
    workbook,
    getDashboardExportFileName()
  );
}
