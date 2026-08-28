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
