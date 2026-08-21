(function initialiseMyTmsOffice(global) {
  'use strict';

  const state = {
    settings: null,
    openToken: null,
    previewByKind: Object.create(null)
  };

  const text = (value) => String(value == null ? '' : value).trim();
  const upper = (value) => text(value).toUpperCase();
  const escapeHtml = (value) => String(value == null ? '' : value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );
  const uuid = () => global.crypto?.randomUUID?.()
    || `00000000-0000-4000-8000-${Date.now().toString().padStart(12, '0').slice(-12)}`;

  const apiUrl = (path) => {
    if (typeof API === 'function') return API(path);
    if (typeof global.API === 'function') return global.API(path);
    throw new Error('MYTMS_OFFICE_API_UNAVAILABLE');
  };

  const authenticatedFetch = (...args) => {
    if (typeof authFetch === 'function') return authFetch(...args);
    if (typeof global.authFetch === 'function') return global.authFetch(...args);
    throw new Error('MYTMS_OFFICE_API_UNAVAILABLE');
  };

  async function api(path, init = {}) {
    const response = await authenticatedFetch(apiUrl(path), init);
    if (!response || typeof response.ok !== 'boolean') {
      throw new Error('MYTMS_OFFICE_RESPONSE_INVALID');
    }
    let body = null;
    try { body = await response.json(); } catch {}
    if (!response.ok) {
      const error = new Error(text(body?.error_code || body?.error) || 'MYTMS_OFFICE_REQUEST_FAILED');
      error.status = response.status;
      throw error;
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('MYTMS_OFFICE_RESPONSE_INVALID');
    }
    return body;
  }

  const settingsGet = () => api('/api/mytms/settings');
  const settingsPreview = (html) => api('/api/mytms/settings/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ html: String(html || '') })
  });
  const candidateStatus = (candidateId) => api(
    `/api/mytms/candidates/${encodeURIComponent(text(candidateId))}/status`
  );

  function settingsPayload(source) {
    const keys = [
      'invitation_email_enabled', 'access_reminder_enabled', 'provisioning_enabled',
      'membership_admin_enabled', 'google_target_switch_enabled', 'push_delivery_enabled',
      'invitation_subject', 'invitation_html_sanitized', 'invitation_text',
      'access_reminder_subject', 'access_reminder_html_sanitized', 'access_reminder_text',
      'invitation_expiry_seconds', 'resend_minimum_seconds', 'maximum_resends',
      'planned_test_web_origin', 'planned_future_web_origin', 'web_host_state',
      'support_url', 'android_store_url', 'ios_store_url', 'logo_asset_key'
    ];
    const output = {};
    for (const key of keys) output[key] = source[key] ?? null;
    output.test_recipient_allowlist = Array.isArray(source.test_recipient_allowlist)
      ? source.test_recipient_allowlist.map(text).filter(Boolean) : [];
    return output;
  }

  async function settingsSave() {
    if (!state.settings) return { ok: false };
    const result = await api('/api/mytms/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        expected_version: Number(state.settings.version),
        idempotency_key: uuid(),
        correlation_id: uuid(),
        settings: settingsPayload(state.settings)
      })
    });
    state.settings = { ...result };
    try { global.showModalHint?.(`MyTMS App Settings version ${result.version} saved.`, 'ok'); } catch {}
    return { ok: true };
  }

  function settingsField(label, name, value, type = 'text', extra = '') {
    return `
      <div class="row">
        <label for="mytms-${escapeHtml(name)}">${escapeHtml(label)}</label>
        <div class="controls">
          <input class="input" id="mytms-${escapeHtml(name)}" data-mytms-setting="${escapeHtml(name)}"
                 type="${escapeHtml(type)}" value="${escapeHtml(value ?? '')}" ${extra} />
        </div>
      </div>`;
  }

  function activationPanel() {
    const fields = [
      ['invitation_email_enabled', 'Invitation email'],
      ['access_reminder_enabled', 'Access reminder'],
      ['provisioning_enabled', 'Google provisioning'],
      ['membership_admin_enabled', 'Membership administration'],
      ['google_target_switch_enabled', 'Google target switching'],
      ['push_delivery_enabled', 'Push delivery']
    ];
    return `
      <div class="card">
        <h3 style="margin-top:0;">Activation state</h3>
        <p class="mini">These controls report the authoritative state. Activation remains externally gated and cannot be enabled from this local Office implementation.</p>
        ${fields.map(([name, label]) => `
          <label style="display:flex;gap:8px;align-items:center;margin:8px 0;">
            <input type="checkbox" data-mytms-setting="${name}" data-mytms-activation-readonly="1"
                   ${state.settings?.[name] === true ? 'checked' : ''} disabled />
            <span>${escapeHtml(label)}</span>
            <span class="mini">${state.settings?.[name] === true ? 'Enabled by controlled authority' : 'Disabled'}</span>
          </label>`).join('')}
      </div>`;
  }

  function editorPanel(kind) {
    const invitation = kind === 'invitation';
    const title = invitation ? 'Invitation email' : 'Access reminder';
    const subjectKey = invitation ? 'invitation_subject' : 'access_reminder_subject';
    const htmlKey = invitation ? 'invitation_html_sanitized' : 'access_reminder_html_sanitized';
    const textKey = invitation ? 'invitation_text' : 'access_reminder_text';
    return `
      <div class="card">
        <h3 style="margin-top:0;">${title}</h3>
        ${settingsField('Subject', subjectKey, state.settings?.[subjectKey] || '')}
        <div class="row">
          <label>HTML template</label>
          <div class="controls" style="min-width:0;">
            <div data-mytms-toolbar="${kind}" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
              <button type="button" class="btn mini" data-command="bold">Bold</button>
              <button type="button" class="btn mini" data-command="italic">Italic</button>
              <button type="button" class="btn mini" data-command="insertUnorderedList">List</button>
              <button type="button" class="btn mini" data-token="{{candidate_name}}">Candidate name</button>
              <button type="button" class="btn mini" data-token="{{agency_name}}">Agency name</button>
              <button type="button" class="btn mini" data-token="{{mytms_invitation_url}}">Secure link</button>
            </div>
            <div class="input" contenteditable="true" role="textbox" aria-multiline="true"
                 data-mytms-html-editor="${kind}" data-setting-key="${htmlKey}"
                 style="min-height:180px;overflow:auto;background:#fff;color:#111;"></div>
            <div class="mini" style="margin-top:5px;">Saved HTML is sanitized by the server. Preview uses the exact sanitized output.</div>
          </div>
        </div>
        <div class="row">
          <label for="mytms-${textKey}">Plain-text fallback</label>
          <div class="controls">
            <textarea class="input" id="mytms-${textKey}" data-mytms-setting="${textKey}" rows="6">${escapeHtml(state.settings?.[textKey] || '')}</textarea>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin:10px 0;">
          <button type="button" class="btn" data-mytms-preview="${kind}">Preview sanitized email</button>
          <span class="mini">Policy ${escapeHtml(state.settings?.sanitizer_policy_version || 'not installed')}</span>
        </div>
        <iframe data-mytms-preview-frame="${kind}" title="${title} sanitized preview" sandbox=""
                style="display:none;width:100%;height:260px;border:1px solid var(--line);background:#fff;"></iframe>
      </div>`;
  }

  function renderSettingsTab(tabKey) {
    if (!state.settings) return '<div class="card">MyTMS settings are unavailable.</div>';
    if (tabKey === 'activation') return activationPanel();
    if (tabKey === 'invitation') return editorPanel('invitation');
    if (tabKey === 'reminder') return editorPanel('reminder');
    return `
      <div class="card">
        <h3 style="margin-top:0;">Agency and delivery configuration</h3>
        <p class="mini">Version ${escapeHtml(state.settings.version)}. TEST sends remain allowlist-only and require a separate friendly confirmation.</p>
        <div class="row"><label for="mytms-test-allowlist">TEST recipient allowlist</label><div class="controls">
          <textarea class="input" id="mytms-test-allowlist" data-mytms-allowlist rows="4">${escapeHtml((state.settings.test_recipient_allowlist || []).join('\n'))}</textarea>
          <div class="mini">One email address per line. This is configuration, never hard-coded application logic.</div>
        </div></div>
        ${settingsField('TEST web origin', 'planned_test_web_origin', state.settings.planned_test_web_origin || '', 'url')}
        ${settingsField('Future web origin', 'planned_future_web_origin', state.settings.planned_future_web_origin || '', 'url')}
        ${settingsField('Web host state', 'web_host_state', state.settings.web_host_state || '')}
        ${settingsField('Support URL', 'support_url', state.settings.support_url || '', 'url')}
        ${settingsField('Android store URL', 'android_store_url', state.settings.android_store_url || '', 'url')}
        ${settingsField('iOS store URL', 'ios_store_url', state.settings.ios_store_url || '', 'url')}
        ${settingsField('Logo asset key', 'logo_asset_key', state.settings.logo_asset_key || '')}
        ${settingsField('Invitation expiry (seconds)', 'invitation_expiry_seconds', state.settings.invitation_expiry_seconds || '', 'number', 'min="300" step="1"')}
        ${settingsField('Minimum resend interval (seconds)', 'resend_minimum_seconds', state.settings.resend_minimum_seconds || '', 'number', 'min="60" step="1"')}
        ${settingsField('Maximum sends', 'maximum_resends', state.settings.maximum_resends || '', 'number', 'min="0" step="1"')}
      </div>`;
  }

  function setSetting(name, value) {
    if (!state.settings || !name) return;
    if (['invitation_expiry_seconds', 'resend_minimum_seconds', 'maximum_resends'].includes(name)) {
      const number = Number(value);
      state.settings[name] = Number.isSafeInteger(number) ? number : value;
    } else {
      state.settings[name] = value;
    }
    try { global.dispatchEvent(new Event('modal-dirty')); } catch {}
  }

  function insertEditorText(editor, value) {
    editor.focus();
    try {
      if (global.document.queryCommandSupported?.('insertText')) {
        global.document.execCommand('insertText', false, value);
      } else {
        const selection = global.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        if (range) {
          range.deleteContents();
          range.insertNode(global.document.createTextNode(value));
          range.collapse(false);
        } else editor.append(global.document.createTextNode(value));
      }
    } catch { editor.append(global.document.createTextNode(value)); }
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function preview(kind) {
    const editor = global.document.querySelector(`[data-mytms-html-editor="${kind}"]`);
    const frame = global.document.querySelector(`[data-mytms-preview-frame="${kind}"]`);
    if (!editor || !frame) return;
    const result = await settingsPreview(editor.innerHTML);
    state.previewByKind[kind] = result;
    frame.srcdoc = String(result.sanitized_html || '');
    frame.style.display = '';
    try { global.showModalHint?.('Sanitized preview refreshed.', 'ok'); } catch {}
  }

  function wireSettings() {
    const token = state.openToken;
    if (!token) return;
    global.document.querySelectorAll('[data-mytms-setting]').forEach((element) => {
      if (element.dataset.mytmsActivationReadonly === '1') {
        element.disabled = true;
        return;
      }
      if (element.__myTmsWired) return;
      element.__myTmsWired = true;
      const eventName = element.type === 'checkbox' ? 'change' : 'input';
      element.addEventListener(eventName, () => {
        setSetting(element.dataset.mytmsSetting, element.type === 'checkbox' ? element.checked : element.value);
      });
    });
    const allowlist = global.document.querySelector('[data-mytms-allowlist]');
    if (allowlist && !allowlist.__myTmsWired) {
      allowlist.__myTmsWired = true;
      allowlist.addEventListener('input', () => {
        state.settings.test_recipient_allowlist = String(allowlist.value || '')
          .split(/\r?\n|,/).map((value) => text(value).toLowerCase()).filter(Boolean);
        try { global.dispatchEvent(new Event('modal-dirty')); } catch {}
      });
    }
    global.document.querySelectorAll('[data-mytms-html-editor]').forEach((editor) => {
      if (editor.__myTmsWired) return;
      editor.__myTmsWired = true;
      editor.innerHTML = String(state.settings?.[editor.dataset.settingKey] || '');
      editor.addEventListener('input', () => setSetting(editor.dataset.settingKey, editor.innerHTML));
    });
    global.document.querySelectorAll('[data-mytms-toolbar]').forEach((toolbar) => {
      if (toolbar.__myTmsWired) return;
      toolbar.__myTmsWired = true;
      toolbar.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        const editor = global.document.querySelector(
          `[data-mytms-html-editor="${toolbar.dataset.mytmsToolbar}"]`
        );
        if (!editor) return;
        if (button.dataset.token) insertEditorText(editor, button.dataset.token);
        else if (button.dataset.command) {
          editor.focus();
          try { global.document.execCommand(button.dataset.command, false, null); } catch {}
          editor.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    });
    global.document.querySelectorAll('[data-mytms-preview]').forEach((button) => {
      if (button.__myTmsWired) return;
      button.__myTmsWired = true;
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await preview(button.dataset.mytmsPreview); }
        catch (error) { global.showModalHint?.(`Preview failed: ${text(error.message)}`, 'err'); }
        finally { button.disabled = false; }
      });
    });
  }

  async function openSettings() {
    if (typeof global.confirmDiscardChangesIfDirty === 'function'
        && !global.confirmDiscardChangesIfDirty()) return;
    try {
      state.settings = await settingsGet();
    } catch (error) {
      await global.openUiConfirmModal?.({
        title: 'MyTMS App Settings unavailable',
        message: `The disabled App Readiness configuration could not be loaded (${text(error.message)}).`,
        confirm_label: 'OK', hide_cancel: true, kind: 'mytms-settings-unavailable'
      });
      return;
    }
    state.openToken = `mytms-settings:${Date.now()}:${uuid()}`;
    global.showModal(
      'MyTMS App Settings',
      [
        { key: 'general', label: 'General' },
        { key: 'invitation', label: 'Invitation email' },
        { key: 'reminder', label: 'Access reminder' },
        { key: 'activation', label: 'Activation state' }
      ],
      (tabKey) => {
        const output = renderSettingsTab(tabKey);
        Promise.resolve().then(wireSettings);
        return output;
      },
      async () => {
        try { return await settingsSave(); }
        catch (error) {
          global.showModalHint?.(`MyTMS settings were not saved: ${text(error.message)}`, 'err');
          return { ok: false };
        }
      },
      false,
      () => { try { wireSettings(); } catch {} },
      {
        kind: 'mytms-app-settings', noParentGate: true, forceEdit: true,
        showSave: true, showApply: false, stayOpenOnSave: true,
        primaryLabel: 'Save', dirtyClosePolicy: 'confirm-discard-close',
        onDismiss: () => { state.openToken = null; state.previewByKind = Object.create(null); }
      }
    );
    setTimeout(wireSettings, 0);
  }

  function actionIntent(actionCode) {
    return ({
      INVITE_TO_MYTMS: 'INVITE',
      RESEND_INVITATION: 'RESEND',
      SEND_ACCESS_REMINDER: 'ACCESS_REMINDER'
    })[upper(actionCode)] || null;
  }

  async function confirmAndSend(status, contextLabel = '') {
    const intent = actionIntent(status?.action?.code);
    if (!intent || status?.action?.enabled !== true) return { sent: false, reason: 'DISABLED' };
    const confirmation = await global.openUiConfirmModal({
      title: status.action.label,
      message: [
        contextLabel,
        `Agency: ${text(status.agency_display_name)}`,
        `Candidate: ${text(status.candidate_display_name)}`,
        `Email: ${text(status.candidate_email)}`,
        `Action: ${text(status.action.label)}`,
        `Current delivery state: ${text(status.delivery_state) || 'Not yet invited'}`,
        'This TEST action is idempotent. A retry checks the recorded generation and will not create a broad mail action.'
      ].filter(Boolean).join('\n'),
      confirm_label: status.action.label,
      cancel_label: 'Not now',
      kind: 'mytms-candidate-invitation-confirm'
    });
    if (!confirmation?.confirmed) return { sent: false, reason: 'DECLINED' };
    const result = await api(
      `/api/mytms/candidates/${encodeURIComponent(status.candidate_id)}/invitations`,
      {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          intent,
          expected_settings_version: Number(status.settings_version),
          idempotency_key: uuid()
        })
      }
    );
    const uncertain = upper(result.status) === 'DELIVERY_UNCERTAIN';
    await global.openUiConfirmModal({
      title: uncertain ? 'Delivery status uncertain' : 'MyTMS action accepted',
      message: uncertain
        ? 'The contract or Candidate record is unchanged. Check MyTMS status before retrying.'
        : `The server recorded ${text(result.status) || 'the action'} for this Candidate.`,
      confirm_label: 'OK', hide_cancel: true,
      kind: uncertain ? 'mytms-delivery-uncertain' : 'mytms-delivery-accepted'
    });
    return { sent: true, result };
  }

  function renderCandidateStatus(host, status) {
    const action = status.action || {};
    host.innerHTML = `
      <div class="card" data-mytms-candidate-card style="margin-top:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:700;">MyTMS</div>
            <div class="mini">${escapeHtml(status.state || 'Unavailable')}${status.delivery_state ? ` · ${escapeHtml(status.delivery_state)}` : ''}</div>
          </div>
          ${action.code && action.code !== 'NONE' ? `
            <button type="button" class="btn" data-mytms-candidate-action
                    ${action.enabled === true ? '' : 'disabled'}
                    title="${escapeHtml(action.disabled_reason_code || '')}">${escapeHtml(action.label || 'MyTMS')}</button>` : ''}
        </div>
        ${action.enabled === true ? '' : `<div class="mini" style="margin-top:6px;">${escapeHtml(action.disabled_reason_code || status.reason_code || 'No action available')}</div>`}
      </div>`;
    const button = host.querySelector('[data-mytms-candidate-action]');
    if (button && action.enabled === true) {
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await confirmAndSend(status);
          const refreshed = await candidateStatus(status.candidate_id);
          renderCandidateStatus(host, refreshed);
        } catch (error) {
          global.showModalHint?.(`MyTMS action failed: ${text(error.message)}`, 'err');
          button.disabled = false;
        }
      });
    }
  }

  async function mountCandidateAction(candidate) {
    const candidateId = text(candidate?.id);
    const main = global.document.getElementById('tab-main');
    if (!candidateId || !main) return;
    let host = main.querySelector('[data-mytms-candidate-host]');
    if (!host) {
      host = global.document.createElement('div');
      host.dataset.mytmsCandidateHost = '1';
      host.innerHTML = '<div class="card mini" style="margin-top:12px;">Loading MyTMS status…</div>';
      main.appendChild(host);
    }
    try {
      const status = await candidateStatus(candidateId);
      if (!host.isConnected || text(global.modalCtx?.data?.id) !== candidateId) return;
      renderCandidateStatus(host, status);
    } catch (error) {
      if (host.isConnected) {
        host.innerHTML = `<div class="card mini" style="margin-top:12px;">MyTMS status unavailable (${escapeHtml(text(error.message))}).</div>`;
      }
    }
  }

  async function offerAfterContractSuccess(payload) {
    try {
      const contract = payload?.contract && typeof payload.contract === 'object'
        ? payload.contract : payload;
      const candidateId = text(contract?.candidate_id);
      if (!candidateId) return { offered: false, reason: 'CANDIDATE_ID_MISSING' };
      const status = await candidateStatus(candidateId);
      if (upper(status.state) !== 'NOT_INVITED'
          || upper(status.action?.code) !== 'INVITE_TO_MYTMS'
          || status.action?.enabled !== true) {
        return { offered: false, reason: 'NOT_ELIGIBLE' };
      }
      const result = await confirmAndSend(
        status,
        'The contract was saved successfully. Sending a MyTMS invitation is a separate action.'
      );
      return { offered: true, ...result };
    } catch (error) {
      try { global.showModalHint?.(`Contract saved. MyTMS invitation was not sent (${text(error.message)}).`, 'warn'); } catch {}
      return { offered: false, reason: 'FAILED' };
    }
  }

  global.CloudTMSMyTmsOffice = Object.freeze({
    openSettings,
    mountCandidateAction,
    offerAfterContractSuccess,
    candidateStatus,
    settingsGet
  });
})(window);
