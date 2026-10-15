(function initialisePushTimingSettings(global) {
  'use strict';
  const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const clone = value => JSON.parse(JSON.stringify(value));
  const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
  const revision = value => typeof value === 'string' && /^[1-9][0-9]*$/.test(value)
    && (value.length < 19 || (value.length === 19 && value <= '9223372036854775807'));
  const time = value => typeof value === 'string' && /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(value);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  function validatePolicy(policy) {
    if (!exact(policy, ['version','enabled','timezone','normal_quiet_start','normal_quiet_end','day_rules','bank_holiday_rule'])
      || policy.version !== 'PUSH_TIMING_POLICY_V1' || typeof policy.enabled !== 'boolean'
      || policy.timezone !== 'Europe/London' || !time(policy.normal_quiet_start) || !time(policy.normal_quiet_end)
      || (policy.enabled && policy.normal_quiet_start === policy.normal_quiet_end) || !exact(policy.day_rules, DAYS)) {
      throw new Error('Check the push timing settings.');
    }
    let possible = false;
    for (const key of [...DAYS, 'bank_holiday_rule']) {
      const rule = key === 'bank_holiday_rule' ? policy[key] : policy.day_rules[key];
      const valid = ['INHERIT','NO_PUSH_DAY'].includes(rule?.mode) ? exact(rule, ['mode'])
        : rule?.mode === 'ALLOW_WINDOW' && exact(rule, ['mode','start','end'])
          && time(rule.start) && time(rule.end) && rule.start < rule.end;
      if (!valid) throw new Error('Check the hours for each day.');
      if (key !== 'bank_holiday_rule' && rule.mode !== 'NO_PUSH_DAY') possible = true;
    }
    if (!possible) throw new Error('Allow pushes on at least one day.');
    return policy;
  }
  function decodeReply(value, saved, requestId) {
    const keys = saved ? ['ok','version','request_id','revision','policy','policy_sha256','updated_at_utc']
      : ['ok','version','revision','policy','policy_sha256','updated_at_utc','can_edit'];
    if (!exact(value, keys) || value.ok !== true || !revision(value.revision)
      || value.version !== (saved ? 'PUSH_TIMING_SAVED_V1' : 'PUSH_TIMING_STATE_V1')
      || typeof value.policy_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.policy_sha256)
      || typeof value.updated_at_utc !== 'string' || !Number.isFinite(Date.parse(value.updated_at_utc))
      || (saved ? value.request_id !== requestId : value.can_edit !== true)) {
      throw new Error('Push timing settings could not be verified.');
    }
    validatePolicy(value.policy);
    return value;
  }
  function createController({ request, requestId }) {
    let current = null, draft = null, pending = null, saving = false, refreshRequired = false;
    return Object.freeze({
      snapshot: () => ({ current: current && clone(current), draft: draft && clone(draft), pending: !!pending, saving, refreshRequired }),
      async load() {
        if (pending) throw new Error('Retry the original save before making another change.');
        const value = decodeReply(await request({ method: 'GET' }), false);
        current = value; draft = clone(value.policy); refreshRequired = false;
        return clone(value);
      },
      edit(policy) {
        if (!current || pending || saving || refreshRequired) throw new Error('Refresh push timing settings before editing.');
        // Retain an unfinished local form across tab navigation. Validation
        // still precedes request-ID allocation and every new save.
        draft = clone(policy);
      },
      async save() {
        if (saving) return { ok: false };
        if (!current || refreshRequired) throw new Error('Refresh push timing settings before saving.');
        if (!pending) {
          validatePolicy(draft);
          const id = requestId();
          if (typeof id !== 'string' || !UUID.test(id)) throw new Error('Push timing save is unavailable.');
          pending = JSON.stringify({ version: 'PUSH_TIMING_SAVE_V1', request_id: id,
            expected_revision: current.revision, policy: draft });
        }
        saving = true;
        try {
          const original = JSON.parse(pending);
          const value = decodeReply(await request({ method: 'PUT', body: pending }), true, original.request_id);
          current = { ...value, version: 'PUSH_TIMING_STATE_V1', can_edit: true };
          delete current.request_id;
          draft = clone(value.policy); pending = null;
          return { ok: true };
        } catch (error) {
          if (['PUSH_TIMING_REVISION_CONFLICT','PUSH_TIMING_IDEMPOTENCY_CONFLICT'].includes(error.code)) {
            pending = null; refreshRequired = true;
          }
          throw error;
        } finally { saving = false; }
      }
    });
  }
  let controller;
  const getController = () => controller || (controller = createController({
    requestId: () => {
      if (!global.crypto?.randomUUID) throw new Error('Push timing save is unavailable.');
      return global.crypto.randomUUID();
    },
    request: async options => {
      if (typeof global.authFetch !== 'function' || typeof global.API !== 'function') throw new Error('Push timing settings are unavailable.');
      const result = await global.authFetch(global.API('/api/mytms/push-timing'), {
        ...options, cache: 'no-store', ...(options.body ? { headers: { 'content-type': 'application/json' } } : {})
      });
      const value = await result.json();
      if (!result.ok) {
        const error = new Error(options.method === 'GET' ? 'Push timing settings are unavailable.'
          : value.error_code === 'PUSH_TIMING_REVISION_CONFLICT' ? 'Refresh settings before saving again.'
          : value.error_code === 'PUSH_TIMING_REQUEST_INVALID' ? 'Check the push timing settings.'
          : 'The save could not be confirmed. Retry the original save before making another change.');
        error.code = value.error_code; error.status = result.status; throw error;
      }
      return value;
    }
  }));
  let loading = null;
  let message = '';
  function render() {
    const state = getController().snapshot();
    if (!state.draft) return `<section class="card" data-push-timing><h3>Push timing</h3><p>${esc(message || 'Loading push timing settings…')}</p><button class="btn" type="button" data-push-refresh>Refresh settings</button></section>`;
    const p = state.draft;
    const disabled = state.pending || state.saving || state.refreshRequired ? 'disabled' : '';
    const row = (key, label) => {
      const rule = key === 'bank_holiday_rule' ? p[key] : p.day_rules[key];
      const options = [['INHERIT', key === 'bank_holiday_rule' ? 'Use weekday rule' : 'Use normal times'], ['NO_PUSH_DAY','No pushes this day'], ['ALLOW_WINDOW','Allow pushes between']];
      return `<div class="row" data-push-rule="${key}"><label>${label}</label><div class="controls">
        <label><span class="mini">${label} rule</span><select class="input" data-push-mode="${key}" ${disabled}>${options.map(([value, name]) => `<option value="${value}" ${rule.mode === value ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
        <span data-push-window="${key}" ${rule.mode === 'ALLOW_WINDOW' ? '' : 'hidden'}>
          <label>${label} from <input class="input" type="time" data-push-from="${key}" value="${esc(rule.start || '')}" ${disabled}></label>
          <label>${label} until <input class="input" type="time" data-push-until="${key}" value="${esc(rule.end || '')}" ${disabled}></label>
        </span></div></div>`;
    };
    return `<section class="card" data-push-timing><h3>Push timing</h3>
      <p>Applies to all workers and clients in this agency. UK time (Europe/London). Uses the bank holidays already configured in CloudTMS. These hours apply to push notifications only.</p>
      <p class="mini">Email, in-app access and worker reply times are unchanged.</p>
      <label><input type="checkbox" data-push-enabled ${p.enabled ? 'checked' : ''} ${disabled}> Apply push timing restrictions</label>
      <div class="row"><label>Normal quiet time starts</label><div class="controls"><input class="input" type="time" data-push-start value="${esc(p.normal_quiet_start)}" ${disabled}></div></div>
      <div class="row"><label>Normal quiet time ends</label><div class="controls"><input class="input" type="time" data-push-end value="${esc(p.normal_quiet_end)}" ${disabled}></div></div>
      <details><summary>Different hours for particular days</summary><p class="mini">Bank-holiday rules take priority. “Use weekday rule” keeps the rule for that day of the week.</p>
      ${DAYS.map(day => row(day, day[0].toUpperCase() + day.slice(1))).join('')}${row('bank_holiday_rule','Bank holidays')}</details>
      <p role="status" data-push-status>${esc(message)}</p>
      <button type="button" class="btn primary" data-push-save ${state.saving || state.refreshRequired ? 'disabled' : ''}>${state.pending ? 'Retry save' : 'Save push timing'}</button>
      <button type="button" class="btn" data-push-refresh ${state.pending || state.saving ? 'disabled' : ''}>Refresh settings</button>
    </section>`;
  }
  function repaint() {
    const host = global.document?.querySelector('[data-push-timing]');
    if (host?.isConnected) { host.outerHTML = render(); wire(); }
  }
  function collect(host) {
    const p = getController().snapshot().draft;
    if (!p) throw new Error('Load push timing settings first.');
    p.enabled = host.querySelector('[data-push-enabled]').checked;
    p.normal_quiet_start = host.querySelector('[data-push-start]').value;
    p.normal_quiet_end = host.querySelector('[data-push-end]').value;
    for (const key of [...DAYS, 'bank_holiday_rule']) {
      const mode = host.querySelector(`[data-push-mode="${key}"]`).value;
      const rule = mode === 'ALLOW_WINDOW' ? { mode, start: host.querySelector(`[data-push-from="${key}"]`).value,
        end: host.querySelector(`[data-push-until="${key}"]`).value } : { mode };
      if (key === 'bank_holiday_rule') p[key] = rule; else p.day_rules[key] = rule;
    }
    return p;
  }
  async function save() {
    const c = getController();
    try {
      const host = global.document?.querySelector('[data-push-timing]');
      if (host && !c.snapshot().pending) c.edit(collect(host));
      const result = await c.save(); message = result.ok ? 'Push timing saved.' : message;
      repaint(); return result;
    } catch (error) { message = error.message; repaint(); return { ok: false }; }
  }
  function wire() {
    const host = global.document?.querySelector('[data-push-timing]');
    if (!host || host.__pushTimingWired) return;
    host.__pushTimingWired = true;
    const refresh = async () => {
      if (loading) return;
      loading = getController().load();
      try { await loading; message = ''; } catch (error) { message = error.message; }
      finally { loading = null; repaint(); }
    };
    host.querySelector('[data-push-save]')?.addEventListener('click', save);
    host.querySelector('[data-push-refresh]')?.addEventListener('click', refresh);
    host.querySelectorAll('[data-push-mode]').forEach(input => input.addEventListener('change', () => {
      const field = host.querySelector(`[data-push-window="${input.dataset.pushMode}"]`);
      if (field) field.hidden = input.value !== 'ALLOW_WINDOW';
    }));
    host.querySelectorAll('input,select').forEach(input => {
      const changed = () => {
        try { getController().edit(collect(host)); global.dispatchEvent(new Event('modal-dirty')); }
        catch (error) { message = error.message; }
      };
      input.addEventListener('input', changed); input.addEventListener('change', changed);
    });
    if (!getController().snapshot().current && !message) void refresh();
  }
  const api = Object.freeze({ render, wire, save, createController, validatePolicy });
  global.CloudTMSPushTimingSettings = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
