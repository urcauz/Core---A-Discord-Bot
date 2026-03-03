async function fetchJson(url) {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

function renderCards(containerId, entries) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = entries
    .map(
      ([label, value]) =>
        `<article class="card"><h4>${label}</h4><div class="value">${value}</div></article>`
    )
    .join('');
}

function renderTable(containerId, columns, rows) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const header = columns.map((col) => `<th>${col}</th>`).join('');
  const body = rows.length
    ? rows
        .map(
          (row) =>
            `<tr>${row
              .map((cell) => `<td>${cell ?? ''}</td>`)
              .join('')}</tr>`
        )
        .join('')
    : `<tr><td colspan="${columns.length}">No data found</td></tr>`;

  container.innerHTML = `<table class="table"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

function initSocketRefresh() {
  if (!window.io) return;
  const socket = window.io();
  socket.on('dashboard:update', () => {
    setTimeout(() => {
      window.location.reload();
    }, 600);
  });
}

async function loadOverview() {
  const result = await fetchJson('/api/analytics/overview');
  const data = result.data;

  renderCards('overview-cards', [
    ['Tasks This Week', data.tasksCreated],
    ['Tasks Completed', data.tasksCompleted],
    ['Bugs This Week', data.bugsReported],
    ['Bugs Fixed', data.bugsFixed],
    ['Deploy Success', `${data.deploymentSuccessRate.toFixed(2)}%`],
    ['Standup Consistency', `${data.standupSubmissionRate.toFixed(2)}%`]
  ]);
}

async function loadTasks() {
  const status = document.getElementById('task-status')?.value || '';
  const project = document.getElementById('task-project')?.value || '';
  const search = document.getElementById('task-search')?.value || '';

  const query = new URLSearchParams({ status, project, search });
  const result = await fetchJson(`/api/tasks?${query.toString()}`);
  const rows = result.data.tasks.map((item) => [
    `#${item.taskId}`,
    item.title,
    item.status,
    item.project,
    item.assignedTo || 'Unassigned',
    item.deadline ? new Date(item.deadline).toLocaleDateString() : 'Not set'
  ]);

  renderTable('tasks-table', ['ID', 'Title', 'Status', 'Project', 'Assigned', 'Deadline'], rows);
}

async function loadBugs() {
  const severity = document.getElementById('bug-severity')?.value || '';
  const status = document.getElementById('bug-status')?.value || '';
  const project = document.getElementById('bug-project')?.value || '';

  const query = new URLSearchParams({ severity, status, project });
  const result = await fetchJson(`/api/bugs?${query.toString()}`);
  const rows = result.data.bugs.map((item) => [
    `#${item.bugId}`,
    item.title,
    item.project,
    item.status,
    item.severity === 'Critical' ? `<span class="badge critical">${item.severity}</span>` : item.severity,
    item.assignedTo || 'Unassigned'
  ]);

  renderTable('bugs-table', ['ID', 'Title', 'Project', 'Status', 'Severity', 'Assigned'], rows);
}

async function loadDeployments() {
  const service = document.getElementById('deploy-service')?.value || '';
  const status = document.getElementById('deploy-status')?.value || '';
  const project = document.getElementById('deploy-project')?.value || '';

  const query = new URLSearchParams({ service, status, project });
  const result = await fetchJson(`/api/deployments?${query.toString()}`);

  const rows = result.data.deployments.map((item) => [
    item.service,
    item.status === 'Success'
      ? '<span class="badge success">Success</span>'
      : '<span class="badge error">Failure</span>',
    item.project,
    item.branch,
    new Date(item.timestamp).toLocaleString()
  ]);

  renderTable('deployments-table', ['Service', 'Status', 'Project', 'Branch', 'Timestamp'], rows);
}

async function loadStandups() {
  const [analytics, standups] = await Promise.all([
    fetchJson('/api/analytics/standups'),
    fetchJson('/api/standups')
  ]);

  const summary = analytics.data;
  renderCards('standup-summary', [
    ['Submission Rate', `${summary.submissionRate.toFixed(2)}%`],
    ['Blockers Reported', summary.blockersReported],
    ['Missed Standups', summary.missedStandups]
  ]);

  const rows = standups.data.submissions.map((item) => [
    item.date,
    item.userId,
    item.submittedAt ? new Date(item.submittedAt).toLocaleString() : 'Missed',
    item.blockers || '-'
  ]);

  renderTable('standups-table', ['Date', 'User', 'Submitted At', 'Blockers'], rows);
}

function attachFilters() {
  document.getElementById('task-filter-btn')?.addEventListener('click', loadTasks);
  document.getElementById('bug-filter-btn')?.addEventListener('click', loadBugs);
  document.getElementById('deploy-filter-btn')?.addEventListener('click', loadDeployments);
}

async function initPage() {
  const page = document.body.dataset.page;

  try {
    if (page === 'dashboard') await loadOverview();
    if (page === 'tasks') await loadTasks();
    if (page === 'bugs') await loadBugs();
    if (page === 'deployments') await loadDeployments();
    if (page === 'standups') await loadStandups();
  } catch (error) {
    console.error('[dashboard] Failed to load data:', error);
  }
}

attachFilters();
initSocketRefresh();
initPage();
