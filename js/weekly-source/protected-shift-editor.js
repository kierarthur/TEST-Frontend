(function initialise(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window === 'object' && root === window) {
    Object.defineProperty(root, 'CloudTMSProtectedShiftEditorV1', { value: api });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildEditor() {
  'use strict';
  const text = (value) => String(value ?? '').trim();
  const escape = (value) => text(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const uuid = (value) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(text(value));
  const ukToday = () => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const value = (type) => parts.find((part) => part.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  };
  const ACTIONS = Object.freeze({
    approve: 'APPROVE_PROTECTED_HOURS', amend: 'AMEND_PROTECTED_HOURS',
    wait: 'WAIT_FOR_SOURCE', reconcile: 'ACCEPT_SOURCE_AND_RECONCILE'
  });

  function schedule(values) {
    const workDate = text(values.work_date);
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(workDate) ? new Date(`${workDate}T00:00:00Z`) : null;
    if (!parsed || !Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== workDate) {
      throw new Error('Choose a valid work date.');
    }
    const start = text(values.start), end = text(values.end), breakText = text(values.break_minutes);
    if (![start, end].every((time) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))) {
      throw new Error('Enter the shift start and finish.');
    }
    if (!/^\d+$/.test(breakText) || !Number.isSafeInteger(Number(breakText))) {
      throw new Error('Enter break minutes, including 0 if there was no break.');
    }
    const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    const elapsed = (minutes(end) - minutes(start) + 1440) % 1440;
    const breakMinutes = Number(breakText);
    if (!elapsed || breakMinutes >= elapsed) throw new Error('The shift must leave positive worked time after the break.');
    return { work_date: workDate, start, end, break_minutes: breakMinutes, net_minutes: elapsed - breakMinutes };
  }

  function contractChoice(contracts, selected) {
    const eligible = Array.isArray(contracts) ? contracts.filter((contract) => uuid(contract.id)) : [];
    if (eligible.some((contract) => contract.id === selected)) return selected;
    return eligible.length === 1 ? eligible[0].id : '';
  }

  function overlappingEvents(context, values) {
    const start = text(values.start), end = text(values.end);
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start)
        || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(end) || start === end) return [];
    const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    const proposedStart = minutes(start), proposedEnd = minutes(end) + (end <= start ? 1440 : 0);
    return (Array.isArray(context?.events) ? context.events : []).flatMap((event) => {
      if (event.work_event_id === values.shift_choice) return [];
      const intervals = [
        ['Protected hours', event.protected_start, event.protected_end],
        ['Imported source', event.source_start, event.source_end],
        ['Candidate hours', event.candidate_start, event.candidate_end],
        ['Recorded shift', event.start, event.end]
      ];
      const match = intervals.find(([, rawStart, rawEnd]) => {
        const existingStart = text(rawStart), existingEnd = text(rawEnd);
        if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(existingStart)
            || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(existingEnd) || existingStart === existingEnd) return false;
        const first = minutes(existingStart), last = minutes(existingEnd) + (existingEnd <= existingStart ? 1440 : 0);
        return first < proposedEnd && proposedStart < last;
      });
      return match ? [{ ...event, overlap_kind: match[0], overlap_start: match[1], overlap_end: match[2] }] : [];
    });
  }

  // Only factual schedule/identity intent crosses this boundary. Rates, money,
  // signature claims and imported facts are never copied from form state.
  function request(context, values, idempotencyKey, mode = 'approve') {
    if (!ACTIONS[mode] || context?.allowed !== true) throw new Error('This action is not currently permitted. Recheck first.');
    const reason = text(values.reason);
    if (!reason || reason.length > 1000) throw new Error('Enter a reason of up to 1,000 characters.');
    if (text(idempotencyKey).length < 16 || text(idempotencyKey).length > 200) throw new Error('The action reference is unavailable.');
    if (!uuid(context.source_cycle_id)) throw new Error('Recheck the source period before continuing.');
    const payload = { source_cycle_id: context.source_cycle_id, work_event_id: context.work_event_id || null,
      reason, idempotency_key: idempotencyKey };
    if (mode === 'approve' || mode === 'amend') {
      const checked = schedule(values);
      if (checked.work_date > ukToday()) throw new Error('Choose today or an earlier work date. Future shifts cannot be protected.');
      const { net_minutes, ...factual } = checked;
      Object.assign(payload, factual);
    }
    if (mode === 'approve') {
      if (!context.work_event_id && overlappingEvents(context, values).length) {
        throw new Error('These hours overlap an existing shift. Open that shift or change the times.');
      }
      if (context.work_event_id && values.shift_choice !== context.work_event_id) throw new Error('The selected shift changed. Recheck before continuing.');
      if (values.shift_choice && values.shift_choice !== 'NEW' && values.shift_choice !== context.work_event_id) throw new Error('The selected shift changed. Recheck before continuing.');
      if (context.family_id && context.protected_state === 'WAIT') throw new Error('This shift already has protected pay. Use Change protected shift.');
      const contractId = contractChoice(context.contracts, values.contract_id);
      const contract = context.contracts?.find((item) => item.id === contractId);
      if (!contract) throw new Error('Choose an eligible contract.');
      if (context.shift_contract_id && context.work_event_id && context.shift_contract_id !== contract.id) throw new Error('Choose the contract already linked to this shift.');
      if (![context.client_id, context.candidate_id].every(uuid)
          || context.work_date !== payload.work_date || !text(contract.week_ending_date)) {
        throw new Error('The candidate, client or date changed. Recheck the contracts.');
      }
      Object.assign(payload, { client_id: context.client_id, candidate_id: context.candidate_id,
        contract_id: contract.id, week_ending_date: contract.week_ending_date,
        evidence_timesheet_id: context.evidence_timesheet_id || null });
    } else {
      if (!uuid(context.family_id) || !uuid(context.work_event_id)
          || !/^[1-9]\d*$/.test(text(context.expected_family_bound_version))) {
        throw new Error('Recheck the current protected shift before continuing.');
      }
      if (mode === 'amend' && context.work_date !== payload.work_date) throw new Error('An amendment must retain this shift’s work date.');
      if (mode === 'reconcile' && context.can_reconcile !== true) throw new Error('Confirm the current source match before reconciling.');
      if (mode === 'reconcile') {
        const proposal = context.final_source_proposal;
        if (!/^[0-9a-f]{64}$/.test(proposal?.source_hash || '') || !uuid(proposal?.source_revision)) {
          throw new Error('Recheck the final source before reconciling.');
        }
        payload.expected_source_hash = proposal.source_hash;
        payload.expected_source_revision = proposal.source_revision;
      }
      Object.assign(payload, { family_id: context.family_id,
        expected_family_bound_version: context.expected_family_bound_version });
    }
    return { action: ACTIONS[mode], payload };
  }

  function render(context = {}, values = {}, state = {}) {
    let net = 'Enter the shift times and break.';
    try { const result = schedule(values); net = `${Math.floor(result.net_minutes / 60)} hours ${result.net_minutes % 60} minutes`; } catch (_) {}
    const selected = contractChoice(context.contracts, values.contract_id);
    const contracts = (context.contracts || []).map((item) => `<option value="${escape(item.id)}"${selected === item.id ? ' selected' : ''}>${escape(item.label)}</option>`).join('');
    const chosenExistingShift = !state.lockedIdentity && values.shift_choice && values.shift_choice !== 'NEW'
      ? (context.events || []).find((item) => item.work_event_id === values.shift_choice) : null;
    const shiftChoices = chosenExistingShift
      ? `<p><strong>Existing shift:</strong> ${escape(chosenExistingShift.source_hours || chosenExistingShift.candidate_hours || `${chosenExistingShift.start || ''}–${chosenExistingShift.end || ''} · ${chosenExistingShift.break_minutes ?? ''} min break`)}</p>` : '';
    const input = (label, name, type, extra = '') => `<label>${label}<input data-protected-field="${name}" type="${type}" value="${escape(values[name])}" ${extra}${state.busy ? ' disabled' : ''}></label>`;
    return `<div class="ws-child" data-protected-editor><div class="ws-child-context"><div><span>Client</span><strong>${escape(context.client || 'Choose client')}</strong>${state.lockedIdentity?'':`<button type="button" class="btn btn-outline" data-protected-choose="client"${state.busy || state.mode === 'amend' ? ' disabled' : ''}>Choose client</button>`}</div><div><span>Candidate</span><strong>${escape(context.candidate || 'Choose candidate')}</strong>${state.lockedIdentity?'':`<button type="button" class="btn btn-outline" data-protected-choose="candidate"${state.busy || state.mode === 'amend' ? ' disabled' : ''}>Choose candidate</button>`}</div></div>
      <div class="ws-child-fields">${input('Work date', 'work_date', 'date', `max="${ukToday()}" ${state.mode === 'amend' || state.lockedIdentity ? 'readonly data-ctms-intentional-lock="1" ' : ''}`)}<label>Contract<select data-protected-field="contract_id"${state.busy || state.mode === 'amend' || state.lockedIdentity ? ' disabled' : ''}${state.mode === 'amend' || state.lockedIdentity ? ' data-ctms-intentional-lock="1"' : ''}><option value="">Choose contract</option>${contracts}</select></label>${input('Start', 'start', 'time')}${input('Finish', 'end', 'time')}${input('Break (minutes)', 'break_minutes', 'number', 'min="0" step="1" required ')}<label>Reason<textarea data-protected-field="reason" maxlength="1000" required${state.busy ? ' disabled' : ''}>${escape(values.reason)}</textarea></label></div>
      ${shiftChoices}${state.lockedIdentity?`<p><strong>Imported ${escape(context.source_family === 'NHSP' ? 'NHSP' : 'Roster')} Shift:</strong> ${escape(context.source_hours || 'Current imported shift')}</p>`:''}<p><strong>Hours approved for pay: <output data-protected-net>${escape(net)}</output></strong></p>
      <div class="ws-child-context"><div><span>Candidate submission</span><strong>${escape(context.candidate_hours || 'Choose the client, candidate and date to check')}</strong></div><div><span>Imported hours</span><strong>${escape(context.source_hours || 'Choose the client, candidate and date to check')}</strong></div></div>
      <p>This changes the candidate’s pay position. It does not change the client source or invoice.</p>
      ${state.error ? `<div class="ws-notice ws-notice--danger" role="alert">${escape(state.error)}</div>` : ''}
      <div class="ws-child-actions"><button type="button" class="btn btn-outline" data-protected-cancel${state.busy ? ' disabled' : ''}>Cancel</button><button type="button" class="btn primary" data-protected-submit${state.busy || context.allowed !== true ? ' disabled' : ''}>${state.busy ? 'Saving…' : state.mode === 'amend' ? 'Change protected shift' : 'Protect pay'}</button></div></div>`;
  }
  function renderReview(context = {}, values = {}, state = {}) {
    const proposal = context.final_source_proposal;
    const source = (proposal?.source_segments || []).filter(item => item.work_event_id === context.work_event_id);
    const sourceText = context.can_reconcile ? proposal?.source_present
      ? source.map(item => `${item.start}–${item.end} · ${item.break_mins} min break`).join('; ')
      : 'The final source records no worked hours for this shift.' : 'No final source is available for reconciliation yet.';
    const current = context.current_schedule || {};
    let hours = '';
    try { hours = `${schedule({ ...current, work_date: context.work_date }).net_minutes} minutes after breaks`; } catch (_) {}
    const disabled = state.busy || state.pending || context.allowed !== true;
    const showSchedule = value => value ? `${text(value.start)}–${text(value.end)} · ${text(value.break_minutes)} min break` : 'No earlier protected hours';
    const history = (Array.isArray(context.history) ? context.history : []).map(entry => {
      const when = new Date(entry.at);
      const at = Number.isFinite(when.valueOf()) ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        timeZone: 'Europe/London'
      }).format(when) : 'Date unavailable';
      const status = { WAIT: 'Protected hours retained', ACCEPTED_SOURCE: 'System hours accepted', NOT_WORKED: 'Recorded as not worked' }[entry.state] || 'Protected hours recorded';
      return `<li><strong>${escape(at)} · ${escape(entry.by)}</strong><p>${escape(status)} — ${escape(entry.reason)}</p><p>Before: ${escape(showSchedule(entry.before))}<br>After: ${escape(showSchedule(entry.after))}</p></li>`;
    }).join('');
    return `<div class="ws-child" data-protected-review><div class="ws-child-context"><div><span>Candidate</span><strong>${escape(context.candidate)}</strong></div><div><span>Client</span><strong>${escape(context.client)}</strong></div><div><span>Work date</span><strong>${escape(context.work_date)}</strong></div></div>
      <h3>Protected hours</h3><p>${escape(current.start)}–${escape(current.end)} · ${escape(current.break_minutes)} min break · ${escape(hours)}</p>
      <h3>Final source hours</h3><p>${escape(sourceText)}</p>${context.can_reconcile ? `<p>${escape(proposal.source_minutes)} minutes after breaks</p>` : ''}
      ${history ? `<details><summary>Protected shift history</summary><ol>${history}</ol></details>` : ''}
      <label>Reason<textarea data-protected-review-reason maxlength="1000"${disabled ? ' disabled' : ''}>${escape(values.reason)}</textarea></label>
      ${state.error ? `<div class="ws-notice ws-notice--danger" role="alert">${escape(state.error)}</div>` : ''}
      <div class="ws-child-actions"><button type="button" class="btn btn-outline" data-protected-review-close${state.busy ? ' disabled' : ''}>Close</button><button type="button" class="btn btn-outline" data-protected-review-action="wait"${disabled ? ' disabled' : ''}>Wait</button><button type="button" class="btn primary" data-protected-review-action="reconcile"${disabled || !context.can_reconcile ? ' disabled' : ''}>Accept system hours and reconcile</button>${state.pending && !state.busy ? '<button type="button" class="btn btn-outline" data-protected-review-recover>Check saved result</button>' : ''}</div></div>`;
  }
  return Object.freeze({ schedule, contractChoice, overlappingEvents, request, render, renderReview });
});
