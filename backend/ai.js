const { getStateValue, upsertStateValue, listPeopleRecords, listExpenseRecords, listUserRecords, listRequestRecords } = require('./pocketbase');
const { toDateStr } = require('./utils/date');

const AI_STATE_KEY = 'ai_config';

const AI_CONFIG_DEFAULTS = {
  enabled: false,
  baseUrl: '',
  apiKey: '',
  model: 'gpt-4o-mini'
};

async function getAiSettings(appConfig) {
  return getStateValue(appConfig, AI_STATE_KEY, AI_CONFIG_DEFAULTS);
}

/**
 * Persists AI settings to the app_state collection.
 * Pass `apiKey: '***'` as a sentinel to keep the existing key unchanged.
 */
async function setAiSettings(appConfig, patch) {
  const current = await getAiSettings(appConfig);
  const next = {
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
    baseUrl: typeof patch.baseUrl === 'string' ? patch.baseUrl.trim() : current.baseUrl,
    // A sentinel value of '***' means "keep the existing key"
    apiKey: typeof patch.apiKey === 'string' && patch.apiKey !== '***'
      ? patch.apiKey
      : current.apiKey,
    model: typeof patch.model === 'string' ? patch.model.trim() : current.model
  };
  await upsertStateValue(appConfig, AI_STATE_KEY, next);
  return next;
}

/**
 * Builds a full database context snapshot for the AI system prompt.
 * Includes all member, expense, request, and user records.
 */
async function buildDatabaseSnapshot(appConfig) {
  try {
    const [people, expenses, users, settings, requests, donations] = await Promise.all([
      listPeopleRecords(appConfig).catch(() => []),
      listExpenseRecords(appConfig).catch(() => []),
      listUserRecords(appConfig).catch(() => []),
      getStateValue(appConfig, 'settings', {}).catch(() => ({})),
      listRequestRecords(appConfig).catch(() => []),
      getStateValue(appConfig, 'donations', {}).catch(() => ({}))
    ]);

    const today = new Date();
    const todayY = today.getFullYear();
    const todayM = String(today.getMonth() + 1).padStart(2, '0');
    const todayD = String(today.getDate()).padStart(2, '0');
    const todayStr = `${todayY}-${todayM}-${todayD}`;

    // Aggregate summary statistics
    const membersByStatus = {};
    let totalPaidAcrossMembers = 0;
    for (const p of people) {
      const status = p.status || 'unknown';
      membersByStatus[status] = (membersByStatus[status] || 0) + 1;

      const payments = Array.isArray(p.data?.payments) ? p.data.payments : [];
      for (const pay of payments) {
        const payDateStr = toDateStr(pay.date);
        if (payDateStr <= todayStr) {
          totalPaidAcrossMembers += Number(String(pay.amount || 0).replace(',', '.'));
        }
      }
    }

    let totalExpenses = 0;
    for (const e of expenses) {
      const eDateStr = toDateStr(e.date);
      if (eDateStr <= todayStr) {
        totalExpenses += Number(String(e.amount || 0).replace(',', '.'));
      }
    }

    let totalDonations = 0;
    for (const d of Object.values(donations || {})) {
      const dDateStr = toDateStr(d.date);
      if (dDateStr <= todayStr) {
        totalDonations += Number(String(d.amount || 0).replace(',', '.'));
      }
    }

    // Build full member records (no uid, no raw data blob)
    const memberRecords = people.map((p) => {
      const payments = Array.isArray(p.data?.payments) ? p.data.payments : [];
      return {
        id: p.personKey,
        name: p.name || '',
        status: p.status || '',
        memberSince: p.memberSince || '',
        originalMemberSince: p.originalMemberSince || p.memberSince || '',
        totalPaid: Math.round(Number(String(p.totalPaid || 0).replace(',', '.')) * 100) / 100,
        payments: payments.map((pay) => ({
          amount: Math.round(Number(String(pay.amount || 0).replace(',', '.')) * 100) / 100,
          date: pay.date || '',
          description: pay.description || ''
        })),
        standingOrders: (Array.isArray(p.data?.standingOrders) ? p.data.standingOrders : []).map((so) => ({
          id: so.id || '',
          amount: Math.round(Number(String(so.amount || 0).replace(',', '.')) * 100) / 100,
          startDate: so.startDate || '',
          endDate: so.endDate || '',
          note: so.note || '',
          lastAutoPayment: so.lastAutoPayment || ''
        })),
        statusHistory: (Array.isArray(p.data?.statusHistory) ? p.data.statusHistory : []).map(h => ({
          status: h.status || '',
          startDate: h.startDate || '',
          endDate: h.endDate || ''
        }))
      };
    });

    // Build expense records (no receipt field)
    const expenseRecords = expenses.map((e) => ({
      id: e.expenseKey,
      amount: Math.round(Number(String(e.amount || 0).replace(',', '.')) * 100) / 100,
      date: e.date || '',
      issuer: e.issuer || '',
      description: e.description || ''
    }));

    // Include all requests (no userId)
    const requestRecords = requests.map((r) => ({
        id: r.requestKey,
        type: r.type || '',
        personName: r.personName || '',
        status: r.status || '',
        timestamp: r.timestamp || null,
        data: r.data || {}
    }));

    // Include user records (strip password, token, etc)
    const userRecords = users.map((u) => ({
        id: u.id,
        name: u.name || '',
        firstName: u.firstName || '',
        lastName: u.lastName || '',
        email: u.email || '',
        admin: u.admin,
        superAdmin: u.superAdmin
    }));

    const snapshot = {
      summary: {
        totalMembers: people.length,
        membersByStatus,
        totalMemberPaymentsEur: Math.round(totalPaidAcrossMembers * 100) / 100,
        totalExpensesEur: Math.round(totalExpenses * 100) / 100,
        estimatedBalanceEur: Math.round((totalPaidAcrossMembers + totalDonations - totalExpenses) * 100) / 100,
        totalUsers: users.length,
        adminCount: users.filter((u) => u.admin === true).length
      },
      contributionRates: {
        vollverdiener: settings.vollverdiener ?? null,
        geringverdiener: settings.geringverdiener ?? null,
        keinverdiener: settings.keinverdiener ?? null,
        pausiert: settings.pausiert ?? null
      },
      members: memberRecords,
      expenses: expenseRecords,
      donations: donations,
      requests: requestRecords,
      users: userRecords
    };

    return JSON.stringify(snapshot, null, 2);
  } catch (err) {
    console.error('ai.js: buildDatabaseSnapshot error:', err);
    return '{"error":"Could not build database snapshot"}';
  }
}

/**
 * Builds the system prompt injected at the start of every chat request.
 * @param {string} appName - The configured application name.
 * @param {string} dbSnapshot - JSON string from buildDatabaseSnapshot.
 * @param {string} cssContent - Raw CSS content of the application.
 */
function buildSystemPrompt(appName, dbSnapshot, cssContent = '') {
  return `You are a helpful support assistant for the ${appName || 'Nova'} church management application. Answer admin questions about the application data, members, finances, and settings. Be concise and helpful.

---
### NOVA DEEP-DIVE MANUAL & EDGE CASES

#### 1. Roles & Permissions
- **Super-Admins**: Can manage admin promotions, edit past payments, change app config/SMTP, and update the application logo.
- **Admins**: Can read/write all data: members, payments, requests, expenses, donations, and settings.
- **Users**: Standard members. Can view their own linked member record, view shared settings/rates, and submit requests.

#### 2. Financial & Aggregation Edge Cases
- **Future Exclusion**: All financial aggregations, statistics, estimated balances, and total paid amounts strictly exclude payments, donations, or expenses with dates in the future (relative to the current local server date).
- **Report Start Date**: If 'reportStartDate' is configured in settings, statistics and graph data will exclude income/expenses dated before that boundary, though estimated balance will still account for them to preserve absolute totals.

#### 3. Payment Status & Arrears Calculations
- **Expected Contribution**: Iterates month-by-month from the member's registration month ('memberSince' or 'originalMemberSince') to the current month.
- **Rate Determination**: For each month, the system checks 'statusHistory' entries. If a month falls within an entry's start/end total, that entry's status is used; otherwise, it falls back to the current 'status' field. The rate is retrieved from settings.
- **Anticipated Standing Order Buffer**: If a member has an active standing order and is behind by exactly one month, the system calculates whether the upcoming execution amount covers their overdue balance. If so, they are treated as 'Alles in Ordnung' (soon due, with active standing order flag) rather than 'Zahlung überfällig'.

#### 4. Standing Orders Automation
- **Execution Mechanism**: Runs daily. Execution generates a payment in 'payments' with ID 'auto_{soId}_{date}'.
- **Catch-up Mechanism**: If a standing order's execution was missed (e.g., server offline, or created with a past start date), the scheduler will generate all missing payments up to the current day (capped at a 1200-month safety limit).
- **Day Capping**: For monthly recurrences on days like the 31st, executions automatically cap to the maximum days of the target month (e.g., February 28/29, April 30).
- **Expiration**: If 'endDate' is reached and past, the standing order is flagged as expired and excluded from future executions.

#### 5. Data Sync & Deletion Rules
- **People Deletion (Soft Deletion)**: When a member is deleted:
  - Associated auth user and status history records are deleted.
  - Profile is flagged with 'isDeleted: true', 'status' is set to '""', and 'standingOrders' is cleared.
  - Name, totalPaid, and past payments are preserved to keep financial history consistent.
- **SHA256 Child Keys**: Child objects ('payments', 'status_history', 'expenses') use deterministic SHA256 hashes for sync validation.

#### 6. System Setup Mode
- If no configuration file exists at startup, the app boots in **Setup Mode**, locking the '/api/stream' endpoint and serving 'setup.html' instead of 'index.html'.
- The first user to register after setup is automatically promoted to 'admin' and 'superAdmin'.

#### 7. Frontend Navigation & UI Map
The client-side SPA (Single Page Application) is controlled by 'assets/app.js' and 'index.html'.
- **Role-based views**: On login, the user's role is checked. If 'admin' is true, the admin navigation buttons are displayed and 'overview' is loaded. If 'admin' is false, the user portal navigation buttons are displayed and 'user-overview' is loaded.
- **Admin Navigation Tabs**:
  - 'overview': Displays aggregated metrics cards, status counters, and a 90-day balance trend chart.
  - 'people-view': Displays the member list table. Clicking a member opens the member detail modal which houses sections for: personal info, payments list (with a manual payment registration form), status history (with a history entry form), and standing orders (with a standing order configuration form).
  - 'payment-history': Contains sub-tabs switching between list tables for completed Payments (Rechnungen), Donations (Spenden), Expenses (Ausgaben), and Requests (Anfragen). Clicking "Ausgabe hinzufügen" or "Spende hinzufügen" triggers their respective creation modals.
  - 'settings': Contains settings sections (App config forms, SMTP configuration form, AI configuration form, custom logo SVG upload field, and the User Manager table where admins toggle admin/superAdmin flags on registered users).
- **User Portal Navigation Tabs**:
  - 'user-overview': Personal card view showing profile picture, current membership status, rate, paid-until date, balance status (Arrears/Credit), and active standing orders.
  - 'user-history': Tables listing the user's personal payment history and status history.
  - 'user-requests': Form to submit new request tickets (Zahlung einreichen, Statusänderung, Ausgabe einreichen, Dauerauftrag einrichten) and a list showing their status (Pending, Approved, Rejected).
  - 'user-settings': Forms to upload profile pictures, update password, toggle email notifications, or link their user account to a member profile via invite code.
---

Current database context:
${dbSnapshot}${cssContent ? `\n\n---\n### APPLICATION STYLING & CSS RULES\nThe application CSS defines the visual identity, styles, colors, and layout classes. Here is the active stylesheet:\n\`\`\`css\n${cssContent}\n\`\`\`\n---` : ''}`;
}

module.exports = { getAiSettings, setAiSettings, buildDatabaseSnapshot, buildSystemPrompt };
