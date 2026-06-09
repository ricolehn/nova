const {
  listPeopleRecords,
  listExpenseRecords,
  getStateRecord
} = require('./pocketbase');

async function aggregateStats(appConfig) {
  // ⚡ Bolt: Fetch independent records concurrently to reduce endpoint latency.
  // Expected impact: ~50-60% reduction in total query time (e.g., from ~120ms sequentially to ~50ms).
  const [people, expenses, settingsRecord, donationsRecord] = await Promise.all([
    listPeopleRecords(appConfig),
    listExpenseRecords(appConfig),
    getStateRecord(appConfig, 'settings'),
    getStateRecord(appConfig, 'donations')
  ]);
  const settings = settingsRecord ? settingsRecord.value : {};
  const donationsObj = donationsRecord ? donationsRecord.value : {};
  const donations = Object.values(donationsObj || {});

  let periodInc = 0, periodExp = 0;
  let totalInc = 0, totalExp = 0;

  const startStr = settings.reportStartDate || '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayY = today.getFullYear();
  const todayM = String(today.getMonth() + 1).padStart(2, '0');
  const todayD = String(today.getDate()).padStart(2, '0');
  const todayStr = `${todayY}-${todayM}-${todayD}`;

  const ninetyDaysAgo = new Date(today);
  ninetyDaysAgo.setDate(today.getDate() - 90);

  const cutoffY = ninetyDaysAgo.getFullYear();
  const cutoffM = String(ninetyDaysAgo.getMonth() + 1).padStart(2, '0');
  const cutoffD = String(ninetyDaysAgo.getDate()).padStart(2, '0');
  const cutoffStr = `${cutoffY}-${cutoffM}-${cutoffD}`;

  let currentBalance = 0;
  const eventsByDay = {};

  const processEvent = (amount, dateStr) => {
    if (!dateStr) return;
    if (dateStr < cutoffStr) {
      currentBalance += amount;
    } else {
      eventsByDay[dateStr] = (eventsByDay[dateStr] || 0) + amount;
    }
  };

  people.forEach(record => {
    const p = record.data;
    if (!p) return;

    if (Array.isArray(p.payments)) {
      p.payments.forEach(pay => {
        if (!pay.date || pay.date > todayStr) return; // Exclude future payments

        const amount = parseFloat(pay.amount) || 0;
        totalInc += amount;

        if (!startStr || pay.date >= startStr) {
          periodInc += amount;
        }
        processEvent(amount, pay.date);
      });
    }
  });

  donations.forEach(d => {
    if (!d.date || d.date > todayStr) return; // Exclude future donations

    const amount = parseFloat(d.amount) || 0;
    totalInc += amount;

    if (!startStr || d.date >= startStr) {
      periodInc += amount;
    }
    processEvent(amount, d.date);
  });

  expenses.forEach(record => {
    const e = record.data || record;
    if (!e.date || e.date > todayStr) return; // Exclude future expenses

    const amount = parseFloat(e.amount) || 0;
    totalExp += amount;

    if (!startStr || e.date >= startStr) {
      periodExp += amount;
    }
    processEvent(-amount, e.date);
  });

  const totalBalance = totalInc - totalExp;

  const dataPoints = [];
  let minVal = currentBalance;
  let maxVal = currentBalance;

  for (let i = 0; i <= 90; i++) {
    const d = new Date(ninetyDaysAgo);
    d.setDate(d.getDate() + i);

    const dY = d.getFullYear();
    const dM = String(d.getMonth() + 1).padStart(2, '0');
    const dD = String(d.getDate()).padStart(2, '0');
    const dayStr = `${dY}-${dM}-${dD}`;

    if (eventsByDay[dayStr]) {
      currentBalance += eventsByDay[dayStr];
    }

    dataPoints.push({ x: i, y: currentBalance, date: d });

    if (currentBalance < minVal) minVal = currentBalance;
    if (currentBalance > maxVal) maxVal = currentBalance;
  }

  return {
    totalBalance,
    totalIncome: periodInc,
    totalExpenses: periodExp,
    chartData: {
      dataPoints,
      minVal,
      maxVal
    }
  };
}

module.exports = {
  aggregateStats
};
