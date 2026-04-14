const { getStateValue, upsertStateValue, listPeopleRecords, listExpenseRecords, listUserRecords } = require('./pocketbase');

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
 * Builds a database context snapshot for the AI system prompt.
 * Only includes aggregate/schema-level data. All PII and sensitive
 * fields (passwords, tokens, emails, full names) are excluded.
 */
async function buildDatabaseSnapshot(appConfig) {
  try {
    const [people, expenses, users, settings] = await Promise.all([
      listPeopleRecords(appConfig).catch(() => []),
      listExpenseRecords(appConfig).catch(() => []),
      listUserRecords(appConfig).catch(() => []),
      getStateValue(appConfig, 'settings', {}).catch(() => ({}))
    ]);

    // Aggregate member statistics without any personal identifiers
    const membersByStatus = {};
    let totalPaidAcrossMembers = 0;
    for (const p of people) {
      const status = p.status || 'unknown';
      membersByStatus[status] = (membersByStatus[status] || 0) + 1;
      totalPaidAcrossMembers += parseFloat(p.totalPaid || 0);
    }

    // Expense totals only (no issuers or descriptions)
    let totalExpenses = 0;
    for (const e of expenses) {
      totalExpenses += parseFloat(e.amount || 0);
    }

    const snapshot = {
      schema: {
        collections: [
          {
            name: 'people',
            description: 'Church members',
            fields: ['personKey', 'status', 'memberSince', 'originalMemberSince', 'totalPaid', 'data']
          },
          {
            name: 'payments',
            description: 'Member contribution payments',
            fields: ['paymentKey', 'personKey', 'amount', 'date', 'description', 'data']
          },
          {
            name: 'expenses',
            description: 'Church expenses / outgoings',
            fields: ['expenseKey', 'amount', 'date', 'issuer', 'description', 'receipt', 'data']
          },
          {
            name: 'status_history',
            description: 'History of member status changes',
            fields: ['historyKey', 'personKey', 'status', 'startDate', 'endDate', 'data']
          },
          {
            name: 'requests',
            description: 'Member-submitted requests (payment, status change, expense)',
            fields: ['requestKey', 'userId', 'personId', 'type', 'status', 'timestamp', 'data']
          },
          {
            name: 'app_state',
            description: 'Key/value application settings (settings, system, ai_config, …)',
            fields: ['key', 'value']
          }
        ]
      },
      summary: {
        totalMembers: people.length,
        membersByStatus,
        totalMemberPaymentsEur: Math.round(totalPaidAcrossMembers * 100) / 100,
        totalExpensesEur: Math.round(totalExpenses * 100) / 100,
        estimatedBalanceEur: Math.round((totalPaidAcrossMembers - totalExpenses) * 100) / 100,
        totalUsers: users.length,
        adminCount: users.filter((u) => u.admin === true).length
      },
      contributionRates: {
        vollverdiener: settings.vollverdiener ?? null,
        geringverdiener: settings.geringverdiener ?? null,
        keinverdiener: settings.keinverdiener ?? null,
        pausiert: settings.pausiert ?? null
      }
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
 */
function buildSystemPrompt(appName, dbSnapshot) {
  return `You are a helpful support assistant for the ${appName || 'Nova'} church management application. Answer admin questions about the application data, members, finances, and settings. Be concise and helpful.\n\nCurrent database context:\n${dbSnapshot}`;
}

module.exports = { getAiSettings, setAiSettings, buildDatabaseSnapshot, buildSystemPrompt };
