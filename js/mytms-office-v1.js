(function initialiseMyTmsOffice(global) {
  'use strict';

  const state = {
    settings: null,
    managerSettings: null,
    managerSettingsError: null,
    managerSubmissionType: 'TIMESHEET',
    managerMailKind: 'INITIAL',
    activeSettingsTab: 'general',
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
  const managerSettingsGet = () => api('/api/mytms/manager-email-settings');
  const managerSettingsPreview = (kind, template) => api('/api/mytms/manager-email-settings/preview', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, template })
  });
  const candidateStatus = (candidateId) => api(
    `/api/mytms/candidates/${encodeURIComponent(text(candidateId))}/status`
  );

  function settingsPayload(source) {
    const keys = [
      'invitation_subject', 'invitation_html_sanitized', 'invitation_text',
      'access_reminder_subject', 'access_reminder_html_sanitized', 'access_reminder_text',
      'invitation_expiry_seconds', 'resend_minimum_seconds', 'maximum_resends'
    ];
    const output = {};
    for (const key of keys) output[key] = source[key] ?? null;
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

  async function managerTemplatesSave() {
    if (!state.managerSettings) return { ok: false };
    const result = await api('/api/mytms/manager-email-settings/templates', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        expected_version: Number(state.managerSettings.agency_template_version),
        idempotency_key: uuid(), templates: state.managerSettings.agency_templates
      })
    });
    state.managerSettings.agency_templates = result.templates;
    state.managerSettings.agency_template_version = Number(result.version);
    state.managerSettings.agency_template_semantic_sha256_hex = result.semantic_sha256_hex;
    state.managerSettings.agency_template_updated_at_utc = result.updated_at_utc;
    global.showModalHint?.(`Manager email templates version ${result.version} saved.`, 'ok');
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

  function readOnlySetting(label, value, note = 'Platform-owned') {
    const id = `mytms-readonly-${text(label).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    return `<div class="row"><label for="${escapeHtml(id)}">${escapeHtml(label)}</label><div class="controls">
      <input class="input" id="${escapeHtml(id)}" value="${escapeHtml(value ?? '')}" data-mytms-platform-readonly="1" readonly disabled />
      <div class="mini">${escapeHtml(note)}</div></div></div>`;
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
    state.activeSettingsTab = tabKey;
    if (!state.settings) return '<div class="card">MyTMS settings are unavailable.</div>';
    if (tabKey === 'activation') return activationPanel();
    if (tabKey === 'invitation') return editorPanel('invitation');
    if (tabKey === 'reminder') return editorPanel('reminder');
    if (tabKey === 'manager-email') return managerEmailPanel();
    return `
      <div class="card">
        <h3 style="margin-top:0;">Agency invitation policy</h3>
        <p class="mini">Agency-editable within platform safety limits. Manager approval links always use their separate seven-day policy.</p>
        ${settingsField('Invitation expiry (seconds)', 'invitation_expiry_seconds', state.settings.invitation_expiry_seconds || '', 'number', 'min="86400" max="604800" step="1"')}
        ${settingsField('Minimum resend interval (seconds)', 'resend_minimum_seconds', state.settings.resend_minimum_seconds || '', 'number', 'min="900" max="86400" step="1"')}
        ${settingsField('Maximum resends (0–5; total sends 1–6)', 'maximum_resends', state.settings.maximum_resends || '', 'number', 'min="0" max="5" step="1"')}
      </div>
      <div class="card">
        <h3 style="margin-top:0;">Platform configuration</h3>
        <p class="mini">Shown for clarity. Agency customers cannot change app hosting, app stores, TEST safety recipients or activation authority.</p>
        ${readOnlySetting('TEST recipient allowlist', (state.settings.test_recipient_allowlist || []).join(', '))}
        ${readOnlySetting('TEST web origin', state.settings.planned_test_web_origin)}
        ${readOnlySetting('Future web origin', state.settings.planned_future_web_origin)}
        ${readOnlySetting('Web host state', state.settings.web_host_state)}
        ${readOnlySetting('Support URL', state.settings.support_url)}
        ${readOnlySetting('Android store URL', state.settings.android_store_url)}
        ${readOnlySetting('iOS store URL', state.settings.ios_store_url)}
        ${readOnlySetting('Logo asset key', state.settings.logo_asset_key)}
      </div>`;
  }

  function currentManagerTemplate() {
    return state.managerSettings?.agency_templates?.[state.managerSubmissionType]?.[state.managerMailKind] || null;
  }

  function managerEmailPanel() {
    if (!state.managerSettings) {
      return `<div class="card"><h3 style="margin-top:0;">Manager approval by email</h3>
        <p>${escapeHtml(state.managerSettingsError || 'Manager email settings are unavailable.')}</p>
        <p class="mini">Other MyTMS settings remain available; no defaults have been substituted.</p></div>`;
    }
    const template = currentManagerTemplate();
    const origin = state.managerSettings.manager_origin || {};
    const linkMail = template?.include_link === true;
    return `<div class="card" data-mytms-manager-panel>
      <h3 style="margin-top:0;">Manager approval by email</h3>
      <p class="mini">Email wording is owned by this agency. The secure review address is platform-owned and read-only here.</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">
        <div><label for="mytms-manager-submission">Submission type</label><select class="input" id="mytms-manager-submission" data-manager-selector="submission">
          ${[['TIMESHEET','Timesheet'],['EXPENSE_CLAIM','Expense claim']].map(([v,l]) => `<option value="${v}" ${state.managerSubmissionType === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></div>
        <div><label for="mytms-manager-kind">Message</label><select class="input" id="mytms-manager-kind" data-manager-selector="kind">
          ${['INITIAL','REMINDER','RENEWAL','WITHDRAWAL','CANCELLATION'].map(v => `<option value="${v}" ${state.managerMailKind === v ? 'selected' : ''}>${v[0]}${v.slice(1).toLowerCase()}</option>`).join('')}
        </select></div>
      </div>
      <div class="row"><label for="mytms-manager-subject">Subject</label><div class="controls"><input class="input" id="mytms-manager-subject" data-manager-field="subject" maxlength="240" value="${escapeHtml(template?.subject || '')}" /></div></div>
      <div class="row"><label>HTML template</label><div class="controls" style="min-width:0;">
        <div data-manager-toolbar style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
          <button type="button" class="btn mini" data-command="bold">Bold</button><button type="button" class="btn mini" data-command="italic">Italic</button><button type="button" class="btn mini" data-command="insertUnorderedList">List</button>
        </div>
        <div class="input" contenteditable="true" role="textbox" aria-multiline="true" data-manager-html style="min-height:180px;overflow:auto;background:#fff;color:#111;">${template?.body_html || ''}</div>
        <div class="mini">Links, images, scripts and unknown variables are blocked. The secure button and seven-day expiry wording are added by the server.</div>
      </div></div>
      <div class="row"><label for="mytms-manager-text">Plain-text fallback</label><div class="controls"><textarea class="input" id="mytms-manager-text" data-manager-field="body_text" rows="6" maxlength="20000">${escapeHtml(template?.body_text || '')}</textarea></div></div>
      <div class="row"><label for="mytms-manager-button">Button text</label><div class="controls"><input class="input" id="mytms-manager-button" data-manager-field="button_text" maxlength="80" value="${escapeHtml(template?.button_text || '')}" ${linkMail ? '' : 'disabled'} /><div class="mini">${linkMail ? 'The server attaches the secure link after sanitizing the template.' : 'Terminal messages contain no link or button.'}</div></div></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0;">
        <button type="button" class="btn" data-manager-preview>Preview sanitized email</button>
        <button type="button" class="btn" data-manager-reset>Reset all manager templates</button>
        <span class="mini">Agency version ${escapeHtml(state.managerSettings.agency_template_version)} · policy ${escapeHtml(state.managerSettings.agency_template_sanitizer_policy_version)}</span>
      </div>
      <iframe data-manager-preview-frame title="Manager email sanitized preview" sandbox="" style="display:none;width:100%;height:260px;border:1px solid var(--line);background:#fff;"></iframe>
      <hr style="border:0;border-top:1px solid var(--line);margin:18px 0;" />
      ${readOnlySetting('Secure manager review address', origin.public_origin || 'Not configured', `Platform-owned · ${origin.state || 'UNCONFIGURED'} · settings version ${origin.settings_version || '—'}`)}
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

  function replaceManagerPanel() {
    const panel = global.document.querySelector('[data-mytms-manager-panel]');
    if (!panel) return;
    panel.outerHTML = managerEmailPanel();
    Promise.resolve().then(wireSettings);
  }

  function setManagerTemplateField(field, value) {
    const template = currentManagerTemplate();
    if (!template || !['subject', 'body_text', 'body_html', 'button_text'].includes(field)) return;
    template[field] = field === 'button_text' && template.include_link !== true ? null : value;
    try { global.dispatchEvent(new Event('modal-dirty')); } catch {}
  }

  async function previewManagerTemplate() {
    const template = currentManagerTemplate();
    const frame = global.document.querySelector('[data-manager-preview-frame]');
    if (!template || !frame) return;
    const result = await managerSettingsPreview(state.managerMailKind, template);
    frame.srcdoc = String(result.preview_html || '');
    frame.style.display = '';
    global.showModalHint?.('Sanitized manager email preview refreshed.', 'ok');
  }

  async function resetManagerTemplates() {
    if (!state.managerSettings) return;
    const confirmation = await global.openUiConfirmModal?.({
      title: 'Reset manager email templates?',
      message: 'All ten agency manager-email messages will be restored to the approved safe defaults. This does not send an email.',
      confirm_label: 'Reset templates', cancel_label: 'Keep current templates',
      kind: 'mytms-manager-template-reset'
    });
    if (confirmation !== true && confirmation?.confirmed !== true && confirmation?.ok !== true) return;
    const result = await api('/api/mytms/manager-email-settings/templates/reset', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        expected_version: Number(state.managerSettings.agency_template_version),
        idempotency_key: uuid()
      })
    });
    state.managerSettings.agency_templates = result.templates;
    state.managerSettings.agency_template_version = Number(result.version);
    state.managerSettings.agency_template_semantic_sha256_hex = result.semantic_sha256_hex;
    replaceManagerPanel();
    global.showModalHint?.('Manager email templates reset to the approved defaults.', 'ok');
  }

  function wireSettings() {
    const token = state.openToken;
    if (!token) return;
    global.document.querySelectorAll('[data-mytms-platform-readonly="1"]').forEach((element) => {
      element.readOnly = true;
      element.disabled = true;
    });
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
    global.document.querySelectorAll('[data-manager-selector]').forEach((selector) => {
      if (selector.__myTmsWired) return;
      selector.__myTmsWired = true;
      selector.addEventListener('change', () => {
        if (selector.dataset.managerSelector === 'submission') state.managerSubmissionType = upper(selector.value);
        if (selector.dataset.managerSelector === 'kind') state.managerMailKind = upper(selector.value);
        replaceManagerPanel();
      });
    });
    global.document.querySelectorAll('[data-manager-field]').forEach((element) => {
      if (element.__myTmsWired) return;
      element.__myTmsWired = true;
      element.addEventListener('input', () => setManagerTemplateField(element.dataset.managerField, element.value));
    });
    const managerHtml = global.document.querySelector('[data-manager-html]');
    if (managerHtml && !managerHtml.__myTmsWired) {
      managerHtml.__myTmsWired = true;
      managerHtml.addEventListener('input', () => setManagerTemplateField('body_html', managerHtml.innerHTML));
    }
    const managerToolbar = global.document.querySelector('[data-manager-toolbar]');
    if (managerToolbar && !managerToolbar.__myTmsWired) {
      managerToolbar.__myTmsWired = true;
      managerToolbar.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button?.dataset.command || !managerHtml) return;
        managerHtml.focus();
        try { global.document.execCommand(button.dataset.command, false, null); } catch {}
        managerHtml.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    const managerPreview = global.document.querySelector('[data-manager-preview]');
    if (managerPreview && !managerPreview.__myTmsWired) {
      managerPreview.__myTmsWired = true;
      managerPreview.addEventListener('click', async () => {
        managerPreview.disabled = true;
        try { await previewManagerTemplate(); }
        catch (error) { global.showModalHint?.(`Preview failed: ${text(error.message)}`, 'err'); }
        finally { managerPreview.disabled = false; }
      });
    }
    const managerReset = global.document.querySelector('[data-manager-reset]');
    if (managerReset && !managerReset.__myTmsWired) {
      managerReset.__myTmsWired = true;
      managerReset.addEventListener('click', async () => {
        managerReset.disabled = true;
        try { await resetManagerTemplates(); }
        catch (error) { global.showModalHint?.(`Reset failed: ${text(error.message)}`, 'err'); }
        finally { managerReset.disabled = false; }
      });
    }
  }

  async function openSettings() {
    if (typeof global.confirmDiscardChangesIfDirty === 'function'
        && !global.confirmDiscardChangesIfDirty()) return;
    try {
      const [settingsResult, managerResult] = await Promise.allSettled([
        settingsGet(), managerSettingsGet()
      ]);
      if (settingsResult.status !== 'fulfilled') throw settingsResult.reason;
      state.settings = settingsResult.value;
      state.managerSettings = managerResult.status === 'fulfilled' ? managerResult.value : null;
      state.managerSettingsError = managerResult.status === 'rejected'
        ? `Manager email settings could not be loaded (${text(managerResult.reason?.message)}).` : null;
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
        { key: 'manager-email', label: 'Manager approval by email' },
        { key: 'activation', label: 'Activation state' }
      ],
      (tabKey) => {
        const output = renderSettingsTab(tabKey);
        Promise.resolve().then(wireSettings);
        return output;
      },
      async () => {
        try {
          return state.activeSettingsTab === 'manager-email'
            ? await managerTemplatesSave() : await settingsSave();
        }
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
        onDismiss: () => {
          state.openToken = null; state.previewByKind = Object.create(null);
          state.managerSettings = null; state.managerSettingsError = null;
        }
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
