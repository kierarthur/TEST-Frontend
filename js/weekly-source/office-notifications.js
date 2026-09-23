(function weeklySourceOfficeNotifications(root) {
  'use strict';

  const LIST_PATH = '/api/weekly-source/v1/notifications?limit=100&open_only=false';
  const COMMAND_PATH = '/api/weekly-source/v1/commands';
  const EVENT_LABELS = Object.freeze({
    WEEKLY_CANDIDATE_SOURCE_DISPUTED: 'Candidate reports incorrect system hours',
    WEEKLY_MANAGER_SYSTEM_CONFIRMED: 'Manager says system hours are correct',
    WEEKLY_MANAGER_SOURCE_CORRECTED: 'Manager says the hours have been corrected'
  });

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const asObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const text = (value) => String(value ?? '').trim();
  const endpoint = (path) => typeof root.API === 'function' ? root.API(path) : path;
  const MONTHS = Object.freeze(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']);

  function formatDate(value) {
    const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return text(value);
    return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
  }

  function formatManagerHours(payload) {
    const start = text(payload.manager_intended_start);
    const end = text(payload.manager_intended_end);
    if (!start || !end) return '';
    const startMatch = start.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    const endMatch = end.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    if (!startMatch || !endMatch) return `${start}–${end}`;
    const datePart = startMatch[1] === endMatch[1]
      ? formatDate(startMatch[1])
      : `${formatDate(startMatch[1])}–${formatDate(endMatch[1])}`;
    return `${datePart} · ${startMatch[2]}-${endMatch[2]}`;
  }

  async function request(path, options) {
    const fetcher = typeof root.authFetch === 'function' ? root.authFetch : root.fetch;
    if (typeof fetcher !== 'function') throw new Error('Weekly source queries are unavailable.');
    const response = await fetcher(endpoint(path), options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(text(payload.message) || 'Weekly source queries could not be loaded.');
    return payload;
  }

  function issueInstruction(notification, payload) {
    const summary = text(payload.issue_summary).toLowerCase();
    if (notification.event_kind === 'WEEKLY_MANAGER_SYSTEM_CONFIRMED') {
      return { text: 'The query was resolved automatically.', tone: 'positive' };
    }
    if (notification.event_kind === 'WEEKLY_MANAGER_SOURCE_CORRECTED') {
      return { text: 'Waiting for a later source upload to show the corrected hours.', tone: 'warning' };
    }
    if (summary.includes('missing') || summary.includes('not yet authorised')) {
      return { text: 'Ask the manager to add and/or authorise this shift.', tone: 'warning' };
    }
    return { text: 'Query this shift in the client system.', tone: 'warning' };
  }

  function noticeStatus(notification) {
    const resolved = text(notification.operational_state).toUpperCase() === 'RESOLVED';
    const unread = !notification.read_at_utc;
    if (notification.event_kind === 'WEEKLY_MANAGER_SOURCE_CORRECTED') return 'Awaiting new source';
    if (resolved && unread) return 'Resolved · unread';
    if (resolved) return 'Resolved';
    return unread ? 'New' : 'Open';
  }

  function renderNotice(notification) {
    const payload = asObject(notification.payload_json);
    const heading = EVENT_LABELS[notification.event_kind] || 'Weekly source query update';
    const instruction = issueInstruction(notification, payload);
    const identity = [text(payload.candidate_name), text(payload.client_name), formatDate(payload.work_date)].filter(Boolean).join(' · ');
    const issue = text(payload.issue_summary);
    const intended = formatManagerHours(payload);
    const detail = intended ? `${issue}${issue ? ' · ' : ''}Manager hours ${intended}${payload.manager_intended_break_minutes != null ? ` (${payload.manager_intended_break_minutes} min break)` : ''}` : issue;
    const isUnread = !notification.read_at_utc;
    return `<article class="ws-office-notice" data-ws-office-notice="${escapeHtml(notification.id)}">
      <div class="ws-office-notice__heading"><strong>${escapeHtml(heading)}</strong><span>${escapeHtml(noticeStatus(notification))}</span></div>
      ${identity ? `<p>${escapeHtml(identity)}</p>` : ''}
      ${detail ? `<p>${escapeHtml(detail)}</p>` : ''}
      <p class="ws-office-notice__instruction ws-office-notice__instruction--${escapeHtml(instruction.tone)}">${escapeHtml(instruction.text)}</p>
      <div class="ws-office-notice__actions"><button type="button" class="btn btn-outline" data-ws-office-open>${notification.operational_state === 'OPEN' ? 'Open query' : 'View query'}</button>${isUnread ? '<button type="button" class="btn btn-outline" data-ws-office-clear>Mark read</button>' : ''}</div>
    </article>`;
  }

  const state = { notifications: [], loading: false, open: false, error: '' };
  let shell = null;

  function repaint() {
    if (!shell) return;
    const unread = state.notifications.filter((item) => !item.read_at_utc).length;
    const button = shell.querySelector('[data-ws-office-toggle]');
    const badge = shell.querySelector('[data-ws-office-count]');
    const panel = shell.querySelector('[data-ws-office-panel]');
    if (button) button.setAttribute('aria-expanded', state.open ? 'true' : 'false');
    if (badge) {
      badge.textContent = String(unread);
      badge.hidden = unread === 0;
    }
    if (!panel) return;
    panel.hidden = !state.open;
    if (!state.open) return;
    const body = state.loading
      ? '<div class="ws-office-notifications__empty" role="status">Loading weekly source queries…</div>'
      : state.error
        ? `<div class="ws-office-notifications__empty" role="alert">${escapeHtml(state.error)}</div>`
        : state.notifications.length
          ? state.notifications.map(renderNotice).join('')
          : '<div class="ws-office-notifications__empty">No weekly source query updates.</div>';
    panel.innerHTML = `<div class="ws-office-notifications__title"><strong>Weekly source queries</strong>${unread ? `<span>${unread} unread</span>` : ''}</div><div class="ws-office-notifications__list">${body}</div>`;
    panel.querySelectorAll('[data-ws-office-open]').forEach((control) => control.addEventListener('click', () => {
      state.open = false;
      repaint();
      root.CloudTMSWeeklySourceImportWorkspaceV1?.open?.('queries');
    }));
    panel.querySelectorAll('[data-ws-office-clear]').forEach((control) => control.addEventListener('click', async () => {
      const article = control.closest('[data-ws-office-notice]');
      const notificationId = article?.dataset.wsOfficeNotice;
      if (!notificationId) return;
      control.disabled = true;
      try {
        await request(COMMAND_PATH, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'ACKNOWLEDGE_NOTICE', payload: { notification_id: notificationId } })
        });
        await load();
      } catch (error) {
        state.error = text(error?.message);
        repaint();
      }
    }));
  }

  async function load() {
    state.loading = true;
    state.error = '';
    repaint();
    try {
      const payload = await request(LIST_PATH);
      state.notifications = Array.isArray(payload.notifications) ? payload.notifications : [];
    } catch (error) {
      state.error = text(error?.message);
    } finally {
      state.loading = false;
      repaint();
    }
  }

  function mount() {
    if (shell || !root.document) return;
    const userbox = document.querySelector('.topbar .userbox');
    if (!userbox) return;
    shell = document.createElement('div');
    shell.className = 'ws-office-notifications';
    shell.innerHTML = '<button type="button" class="ws-office-notifications__toggle" data-ws-office-toggle aria-haspopup="dialog" aria-expanded="false">Weekly source queries <span data-ws-office-count hidden></span></button><section class="ws-office-notifications__panel" data-ws-office-panel aria-label="Weekly source queries" hidden></section>';
    userbox.parentNode.insertBefore(shell, userbox);
    shell.querySelector('[data-ws-office-toggle]').addEventListener('click', async () => {
      state.open = !state.open;
      repaint();
      if (state.open) await load();
    });
    document.addEventListener('click', (event) => {
      if (!state.open || shell.contains(event.target)) return;
      state.open = false;
      repaint();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  root.WeeklySourceOfficeNotifications = Object.freeze({ mount, load, _state: state });
})(window);
