/* CloudTMS modal modernisation — does not replace showModal. */
(() => {
  'use strict';

  const moneyName = /^(?:paye_|umb_|charge_)(?:day|night|sat|sun|bh)$|^mileage_(?:pay|charge)_rate$|^extra_(?:pay|charge)_\d+$/;

  const safeText = (value) => String(value == null ? '' : value).trim();

  const visibleCopyRules = [
    [/^Right click a Job Title in Edit mode to select a Primary Job Role\.$/i, 'Right-click a job title to make it primary.'],
    [/^Enter the candidate[’']s band \(e\.g\. 5, 6, 7\)\.$/i, null],
    [/^Links this candidate to the rota identity \(GCK\)\. You can correct or clear this if it was mapped incorrectly\.$/i, 'Rota identity key. Change only if incorrectly matched.'],
    [/^When enabled, the options? below override Global Settings for this candidate\.$/i, null],
    [/^When enabled, the options? below override Global Settings for this umbrella\.$/i, null],
    [/^Detailed remittances \(include schedule rows for segment timesheets\)$/i, 'Include schedule details in remittances'],
    [/^Candidate receives umbrella copy remittance \(umbrella-paid items\)$/i, 'Send the candidate a copy of umbrella remittances'],
    [/^Note: Umbrella remittances are always sent to the umbrella remittance email when configured\.$/i, 'Umbrella remittances are also sent to the umbrella’s remittance email.'],
    [/^View the full read-only Candidate Finance Report for Payment Advances, Overpayments, Underpayments, Manual Adjustments, and Snoozed \/ Deferred items, including mixed-case, unresolved taxable, and stale-state detail\.$/i, 'View payment advances, adjustments and unresolved finance items.'],
    [/^Clearing all times means this client will inherit the global shift pattern\.$/i, 'Clear all times to use the default shift pattern.'],
    [/^Rule: you can either set all shift times, or leave all blank\.$/i, 'Set every shift time, or leave all times blank.'],
    [/^Weekly timesheets are managed manually \(no external weekly import source\)\. Candidates will submit timesheets electronically or using a QR Timesheet\.$/i, 'Weekly timesheets are entered manually. Candidates can submit electronically or by QR timesheet.'],
    [/^References & flags$/i, 'Invoice and reference rules'],
    [/^Not available for this client\. These controls are shown only when the client is import-authoritative\.$/i, 'Import correction dates are not available for this client.'],
    [/^Add\s*\/\s*Upsert Client Default Window$/i, 'Add rate window'],
    [/^Tick this box if shifts are ad hoc\..*hours\/days are not fixed$/i, 'Use for shifts without fixed days or hours. Timesheets will not be pre-filled.'],
    [/^Pay method snapshot$/i, 'Pay method'],
    [/^Umbrella pay \(visible if Umbrella\)$/i, 'Umbrella pay'],
    [/^PAYE pay \(visible if PAYE\)$/i, 'PAYE pay'],
    [/^Up to 5 optional additional pay buckets, billed by units \(e\.g\. patient visits\)\.?$/i, 'Add up to five optional rates for work charged per unit, such as patient visits.'],
    [/^Margins are per-unit and follow the PAYE\/Umbrella logic used on the Rates tab\.?$/i, 'Pay and charge margins are calculated automatically from the selected rate type.'],
    [/^Day\/night boundary time settings remain client-level and are not shown here\.$/i, 'Change shift times in Client settings.'],
    [/^This override is independent of invoice routing\..*$/i, 'Use a different address for this contract’s timesheet queries.'],
    [/^Send this contract[’']s missing shifts, wrong hours and reference queries to a different address$/i, 'Use a different email for timesheet queries'],
    [/^Discard this staged import\?$/i, 'Discard this import?'],
    [/^Retry contract check$/i, 'Try again'],
    [/^No staged import is open\.$/i, 'No import is open.'],
    [/^(\d+) parsed rows\. Coverage becomes immutable when the review is created\.$/i, (match) => `${match[1]} rows found. The date range is fixed when the review is created.`],
    [/^Imported evidence$/i, 'Imported shift'],
    [/^Current CloudTMS evidence$/i, 'Current shift'],
    [/^The server will revalidate the saved review before committing\. The browser is not supplying financial values, validation rows or email recipients\.$/i, 'CloudTMS will check the review again before applying it.'],
    [/^Verified source .*parser .*preview generation .*$/i, null],
    [/^Server evidence: source .*parser .*preview .*$/i, null],
    [/^The staged import will remain in history, but this review cannot be resumed\. You can reimport the source file to start again\.$/i, 'This import will remain in history, but you will not be able to continue it. You can import the file again to start over.'],
    [/^The stored global values or their concurrency version are missing\. Nothing has been defaulted and saving is disabled\.$/i, 'Import settings are unavailable. Refresh and try again.'],
    [/^Tick = exclude from pay \(staged\)$/i, 'Tick to exclude from pay.'],
    [/^Changes to pay exclusion and invoice delay are staged until you click Save\.$/i, 'These changes will be saved with the timesheet.'],
    [/^Changes to [‘']Exclude from pay[’'] and [‘']Invoice week \/ Pause[’'] are staged only\. They are applied when you click Save on the Timesheet modal\.$/i, 'These changes will be saved with the timesheet.'],
    [/^Read-only import\/TSFIN segment truth\.$/i, 'Imported shift details.'],
    [/^Authorised at server$/i, 'Authorised'],
    [/^Daily timesheets do not rely on contracts; values are sourced from the best available timesheet context\.$/i, 'Rates come from the available timesheet details.'],
    [/^Evidence file actions do not unlock hours, rates, pay, charge, mileage, travel, accommodation, or other financial values\.$/i, 'Adding or removing evidence does not unlock financial fields.'],
    [/^Start\/End and break times are shown read-only\.$/i, 'Times and breaks cannot be edited here.'],
    [/^Authoritative readiness for the current workbench session\/version is unavailable\. Refresh Banking Pay before creating a draft\.$/i, 'Payment readiness could not be confirmed. Refresh Banking Pay before creating a draft.'],
    [/^The current canonical preview page is still loading for (?:this|the current) (?:workbench )?session\/version\.$/i, 'The payment preview is still loading.'],
    [/^No bucket detail is available in the current preview payload for this case\.$/i, 'No payment breakdown is available for this case.'],
    [/^No external bank payment evidence is required for this authorised explicit-zero route\.$/i, 'No bank evidence is needed because this payment is £0.00.'],
    [/^Active payment operation$/i, 'Payment progress'],
    [/^Payment details are not loaded for the current batch version\.$/i, 'Payment details are still loading.'],
    [/^The previous bootstrap snapshot is no longer treated as authoritative\. CloudTMS is fetching the latest batch overview, payment status and remittance summary\.$/i, 'Refreshing the latest payment and remittance details.'],
    [/^Read-only view of remittance(?: email outbox rows\. Remittances are triggered automatically from the pay batch child modal| and payout-notice rows for this pay batch\. Double-click a row to open the exact rendered communication where available)\.$/i, null],
    [/^No overrides staged\.$/i, 'No overrides added.'],
    [/^Manual values are sent to the backend suggestion endpoint\..*The effective pay date is locked to the backend correction plan\.$/i, 'The fixed component total cannot be reduced. The payment date cannot be changed for this adjustment.'],
    [/^Manual values are sent to the backend suggestion endpoint\..*$/i, 'The fixed component total cannot be reduced.'],
    [/^CloudTMS is retaining the exact original reminder batch while it checks the durable result\. No new reminder batch can be started from this workspace\.$/i, 'CloudTMS is checking the earlier reminder batch. Wait for the result before starting another.'],
    [/^CloudTMS is checking this batch without changing its identity or selection\.$/i, 'CloudTMS is checking the existing batch.'],
    [/^(?:1 retained batch|Protected recovery state)$/i, null],
    [/^\+ Add timesheet$/i, 'Add existing timesheets'],
    [/^Refs and Ward$/i, 'References and ward'],
    [/^QR reissue \(optional\)$/i, 'Reissue QR code (optional)'],
    [/^Create Manual Daily Timesheet$/i, 'Create daily timesheet'],
    [/^(?:Rate Presets|Preset Rates)$/i, 'Rate presets'],
    [/^Create preset$/i, 'Create rate preset'],
    [/^Rate preset$/i, 'Edit rate preset'],
    [/^Retry Outbox item$/i, 'Retry outbox item'],
    [/^Reschedule Outbox item$/i, 'Reschedule outbox item'],
    [/^Outbox detail$/i, 'Outbox details'],
    [/^Skip Weeks$/i, 'Skip weeks']
  ];

  const titleCopyRules = [
    [/^Resolve grade to role \(daily\)$/i, 'Match grade to role'],
    [/^Select matching timesheet \(HR Rota Daily\)$/i, 'Select matching timesheet'],
    [/^Suggested Rates Review$/i, 'Review suggested rates'],
    [/^Refs and Ward$/i, 'References and ward'],
    [/^QR reissue \(optional\)$/i, 'Reissue QR code (optional)'],
    [/^Manual Week(?:\s*[—-].*)?$/i, 'Edit weekly hours'],
    [/^Create Manual Daily Timesheet$/i, 'Create daily timesheet'],
    [/^(?:Rate Presets|Preset Rates)$/i, 'Rate presets'],
    [/^Create preset$/i, 'Create rate preset'],
    [/^Rate preset$/i, 'Edit rate preset'],
    [/^Retry Outbox item$/i, 'Retry outbox item'],
    [/^Reschedule Outbox item$/i, 'Reschedule outbox item'],
    [/^Outbox detail$/i, 'Outbox details'],
    [/^Skip Weeks$/i, 'Skip weeks']
  ];

  const replacementFor = (rules, value) => {
    for (const [pattern, replacement] of rules) {
      const match = value.match(pattern);
      if (!match) continue;
      return typeof replacement === 'function' ? replacement(match, value) : replacement;
    }
    return undefined;
  };

  const elementFor = (root, selector) => {
    try { return root.querySelector(selector); } catch { return null; }
  };

  const directChildFor = (root, node) => {
    if (!root || !node || !root.contains(node)) return null;
    let current = node;
    while (current && current.parentElement !== root) current = current.parentElement;
    return current && current.parentElement === root ? current : null;
  };

  const directChildForSelector = (root, selector) => directChildFor(root, elementFor(root, selector));

  const header = (title, copy, eyebrow = 'CloudTMS record') => {
    const wrap = document.createElement('div');
    wrap.className = 'ctms-section-head';
    const block = document.createElement('div');
    const eye = document.createElement('span');
    eye.className = 'ctms-section-eyebrow';
    eye.textContent = eyebrow;
    const heading = document.createElement('h3');
    heading.className = 'ctms-section-title';
    heading.textContent = title;
    block.append(eye, heading);
    if (copy) {
      const p = document.createElement('p');
      p.className = 'ctms-section-copy';
      p.textContent = copy;
      block.appendChild(p);
    }
    wrap.appendChild(block);
    return wrap;
  };

  const intro = (body, key, title, copy) => {
    if (!body || body.querySelector(`:scope > .ctms-tab-intro[data-ctms-intro="${key}"]`)) return;
    const wrap = document.createElement('div');
    wrap.className = 'ctms-tab-intro';
    wrap.dataset.ctmsIntro = key;
    const block = document.createElement('div');
    const h = document.createElement('h2');
    h.textContent = title;
    block.appendChild(h);
    if (copy) {
      const p = document.createElement('p');
      p.textContent = copy;
      block.appendChild(p);
    }
    wrap.appendChild(block);
    body.prepend(wrap);
  };

  const section = (form, options) => {
    const opts = options || {};
    const selectors = Array.isArray(opts.selectors) ? opts.selectors : [];
    const explicitNodes = Array.isArray(opts.nodes) ? opts.nodes : [];
    const nodes = [];
    const seen = new Set();

    for (const selector of selectors) {
      const child = directChildForSelector(form, selector);
      if (child && !seen.has(child)) {
        nodes.push(child);
        seen.add(child);
      }
    }
    for (const node of explicitNodes) {
      const child = directChildFor(form, node) || node;
      if (child && child.parentElement === form && !seen.has(child)) {
        nodes.push(child);
        seen.add(child);
      }
    }
    if (!nodes.length) return null;

    const wrap = document.createElement('section');
    wrap.className = `ctms-section${opts.wide ? ' ctms-section-wide' : ''}`;
    wrap.dataset.ctmsSection = safeText(opts.key || opts.title).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    wrap.appendChild(header(opts.title || 'Details', opts.copy || '', opts.eyebrow || 'CloudTMS record'));
    const grid = document.createElement('div');
    grid.className = `ctms-section-grid${opts.columns === 3 ? ' ctms-grid-3' : ''}`;
    nodes.forEach((node) => grid.appendChild(node));
    wrap.appendChild(grid);
    form.appendChild(wrap);
    return { wrap, grid, nodes };
  };

  const spanForSelector = (form, selector, className = 'ctms-span-2') => {
    const target = elementFor(form, selector);
    if (!target) return;
    const grid = target.closest('.ctms-section-grid');
    if (grid) {
      let node = target;
      while (node && node.parentElement !== grid) node = node.parentElement;
      if (node && node.parentElement === grid) node.classList.add(className);
      return;
    }
    const node = directChildFor(form, target);
    if (node) node.classList.add(className);
  };

  const unclaimedVisibleChildren = (form) => Array.from(form.children).filter((child) => {
    if (child.classList.contains('ctms-section')) return false;
    if (child.id === 'searchHeaderRow') return false;
    if (child.matches('input[type="hidden"]')) return false;
    return true;
  });

  const finishRemaining = (form, title = 'Additional details', copy = '') => {
    const nodes = unclaimedVisibleChildren(form);
    if (!nodes.length) return;
    section(form, { key: 'additional', title, copy, nodes, wide: true });
  };

  const formatMoneyInput = (input, dispatch) => {
    if (!input || !moneyName.test(safeText(input.name))) return false;
    const raw = safeText(input.value).replace(/,/g, '');
    if (!raw) return false;
    const value = Number(raw);
    if (!Number.isFinite(value)) return false;
    const fixed = value.toFixed(2);
    if (input.value === fixed) return false;
    input.value = fixed;
    if (dispatch) {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  };

  const decorateMoney = (root) => {
    root.querySelectorAll('input[name]').forEach((input) => {
      if (!moneyName.test(safeText(input.name))) return;
      formatMoneyInput(input, false);
      if (input.dataset.ctmsMoney === '1') return;
      input.dataset.ctmsMoney = '1';
      const parent = input.parentElement;
      if (!parent) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'ctms-money-field';
      const prefix = document.createElement('span');
      prefix.className = 'ctms-money-prefix';
      prefix.setAttribute('aria-hidden', 'true');
      prefix.textContent = '£';
      parent.insertBefore(wrapper, input);
      wrapper.append(prefix, input);
    });
  };

  const enhanceCandidateMain = (body, form) => {
    intro(body, 'candidate-main', 'Candidate profile', '');
    form.classList.add('ctms-proposal-form');
    section(form, {
      key: 'identity', title: 'Identity', eyebrow: 'Candidate', columns: 3,
      copy: '',
      selectors: ['[name="title"]','[name="first_name"]','[name="last_name"]','[name="display_name"]','[name="date_of_birth"]','[name="gender"]']
    });
    section(form, {
      key: 'contact', title: 'Contact & communication', eyebrow: 'Candidate',
      copy: '',
      selectors: ['[name="email"]','[name="phone"]','[name="opt_in_email"]']
    });
    section(form, {
      key: 'work', title: 'Work & compliance', eyebrow: 'Candidate', wide: true,
      copy: '',
      selectors: ['[name="pay_method"]','[name="ni_number"]','[name="band"]','[name="prof_reg_number"]','[name="key_norm"]','#cand-alias-empty','#tms_ref_display']
    });
    section(form, {
      key: 'address', title: 'Address & notes', eyebrow: 'Candidate', wide: true,
      copy: '',
      selectors: ['[name="address_line1"]','[name="notes"]']
    });
    spanForSelector(form, '[name="opt_in_email"]');
    spanForSelector(form, '[name="band"]');
    spanForSelector(form, '[name="address_line1"]');
    spanForSelector(form, '[name="notes"]');
    finishRemaining(form);
  };

  const enhanceCandidatePay = (body, form) => {
    intro(body, 'candidate-pay', 'Payment details', '');
    form.classList.add('ctms-proposal-form');
    section(form, {
      key: 'bank', title: 'Payment destination', eyebrow: 'Candidate payment', wide: true,
      copy: 'PAYE bank details can be edited. Umbrella bank details come from the selected umbrella.',
      selectors: ['[name="account_holder"]','[name="bank_name"]','[name="sort_code"]','[name="account_number"]','#umbRow']
    });
    section(form, {
      key: 'remittance', title: 'Remittance preferences', eyebrow: 'Candidate payment',
      copy: '',
      selectors: ['[name="remittance_overrides_enabled"]']
    });
    section(form, {
      key: 'finance', title: 'Candidate finance', eyebrow: 'Read-only summary',
      copy: '',
      selectors: ['#candidateAdvancesSummary']
    });
    spanForSelector(form, '#umbRow');
    unclaimedVisibleChildren(form).forEach((node) => {
      if (/PAYE bank fields are editable/i.test(safeText(node.textContent))) node.remove();
    });
    finishRemaining(form, 'Additional payment details');
  };

  const enhanceClientMain = (body, form) => {
    intro(body, 'client-main', 'Client profile', '');
    form.classList.add('ctms-proposal-form');
    section(form, {
      key: 'organisation', title: 'Organisation', eyebrow: 'Client', wide: true,
      copy: '',
      selectors: ['[name="name"]','#cli_ref_display','[name="invoice_address"]','[name="client_address"]']
    });
    section(form, {
      key: 'contact', title: 'Primary site contact', eyebrow: 'Client', wide: true,
      copy: '',
      selectors: ['[name="contact_forename"]']
    });
    section(form, {
      key: 'billing', title: 'Billing & accounts payable', eyebrow: 'Client',
      copy: '',
      selectors: ['[name="primary_invoice_email"]','[name="ap_phone"]','[name="vat_chargeable"]','[name="payment_terms_days"]']
    });
    section(form, {
      key: 'notes', title: 'Internal notes', eyebrow: 'Client',
      copy: '',
      selectors: ['[name="notes"]']
    });
    spanForSelector(form, '[name="contact_forename"]');
    spanForSelector(form, '[name="notes"]');
    finishRemaining(form);
  };

  const enhanceUmbrella = (body, form) => {
    intro(body, 'umbrella-main', 'Umbrella company', '');
    form.classList.add('ctms-proposal-form');
    section(form, {
      key: 'company', title: 'Company details', eyebrow: 'Umbrella',
      copy: '',
      selectors: ['[name="name"]','[name="remittance_email"]','[name="company_number"]','[name="vat_chargeable"]','[name="enabled"]']
    });
    section(form, {
      key: 'bank', title: 'Bank account', eyebrow: 'Umbrella',
      copy: '',
      selectors: ['[name="bank_name"]','[name="sort_code"]','[name="account_number"]']
    });
    section(form, {
      key: 'remittance', title: 'Remittance preferences', eyebrow: 'Umbrella',
      copy: '',
      selectors: ['[name="remittance_overrides_enabled"]']
    });
    section(form, {
      key: 'address', title: 'Registered address', eyebrow: 'Umbrella',
      copy: '',
      selectors: ['[name="address_line1"]']
    });
    spanForSelector(form, '[name="remittance_overrides_enabled"]');
    spanForSelector(form, '[name="address_line1"]');
    finishRemaining(form);
  };

  const enhanceAdvancedSearch = (body, form) => {
    intro(body, 'advanced-search', 'Find candidates', 'Use one or more filters. Empty fields are ignored.');
    form.classList.add('ctms-proposal-form');
    const headerRow = form.querySelector('#searchHeaderRow');
    if (headerRow) form.prepend(headerRow);
    section(form, {
      key: 'identity-contact', title: 'Identity & contact', eyebrow: 'Candidate search', wide: true,
      copy: '',
      selectors: ['[name="first_name"]','[name="last_name"]','[name="email"]','[name="phone"]','[name="dob"]','[name="gender"]','[name="town_city"]','[name="postcode"]','[name="notes"]']
    });
    section(form, {
      key: 'work', title: 'Work & compliance', eyebrow: 'Candidate search',
      copy: '',
      selectors: ['[name="pay_method"]','[name="roles_any"]','[name="job_title_include_node_ids"]','[name="prof_reg_number"]','[name="prof_reg_type"]','[name="active"]']
    });
    section(form, {
      key: 'dates-payment', title: 'Dates & payment references', eyebrow: 'Candidate search',
      copy: '',
      selectors: ['[name="created_from"]','[name="updated_from"]','[name="sort_code"]','[name="account_number"]','[name="umbrella_name"]','[name="tms_ref"]']
    });
    spanForSelector(form, '[name="job_title_include_node_ids"]');
    finishRemaining(form, 'Additional filters');
  };

  const enhanceContractMain = (body, form) => {
    intro(body, 'contract-main', 'Contract overview', '');
    form.classList.add('ctms-proposal-form');
    section(form, {
      key: 'placement', title: 'Placement', eyebrow: 'Contract', wide: true,
      copy: '',
      selectors: ['#candidate_name_display','#client_name_display','[name="display_site"]','[name="role"]']
    });
    section(form, {
      key: 'rules', title: 'Dates & contract rules', eyebrow: 'Contract', wide: true,
      copy: '',
      selectors: ['#contractRouteLabel','[name="start_date"]','[name="pay_method_snapshot"]']
    });
    const sched = form.querySelector('.sched-grid');
    const scheduleLabel = Array.from(form.children).find((node) => safeText(node.textContent).startsWith('Proposed schedule'));
    section(form, {
      key: 'schedule', title: 'Proposed weekly schedule', eyebrow: 'Contract', wide: true,
      copy: '',
      nodes: [scheduleLabel, sched].filter(Boolean)
    });
    finishRemaining(form, 'Additional contract details');
  };

  const enhanceContractRates = (body, root) => {
    intro(body, 'contract-rates', 'Rates & margins', '');
    if (root.dataset.ctmsEnhanced === '1') return;
    root.dataset.ctmsEnhanced = '1';
    const hero = document.createElement('div');
    hero.className = 'ctms-rate-hero';
    const title = document.createElement('div');
    title.className = 'ctms-section-title';
    title.textContent = 'Current contract rate card';
    const copy = document.createElement('div');
    copy.className = 'ctms-section-copy';
    copy.textContent = 'Rates are shown in pounds per hour. Margins update automatically.';
    hero.append(title, copy);
    const first = root.firstElementChild;
    if (first) first.after(hero); else root.prepend(hero);
  };

  const enhanceClientSettings = (body, settings) => {
    intro(body, 'client-settings', 'Client settings', '');
    if (settings.dataset.ctmsEnhanced === '1') return;
    settings.dataset.ctmsEnhanced = '1';
    const grid = settings.firstElementChild;
    if (!grid) return;
    grid.classList.add('ctms-settings-grid');
    const panels = Array.from(grid.children);
    panels.forEach((panel, index) => {
      panel.classList.add('ctms-settings-panel');
      const head = header(
        index === 0 ? 'Shift pattern & submission' : 'Timesheets & invoicing',
        '',
        'Client settings'
      );
      panel.prepend(head);
    });
    settings.closest('#tab-settings')?.classList.add('ctms-settings-host');
  };

  const enhanceContractSettings = (body, form) => {
    body.classList.add('ctms-contract-settings-body');
    intro(body, 'contract-settings', 'Contract settings', '');
    form.querySelectorAll('.mini, .alert, span, p').forEach((node) => {
      const value = safeText(node.textContent);
      if (/^\(Staged only until you Save the contract\)$/i.test(value)) node.remove();
      else if (/^Override is OFF\./i.test(value)) node.textContent = 'Using client defaults.';
      else if (/^Override is ON\./i.test(value)) node.textContent = 'Contract-specific settings are enabled.';
      else if (/^View-only\. You cannot change contract settings here\.$/i.test(value)) node.textContent = 'View only.';
      else if (/^Client settings snapshot is not available\./i.test(value)) node.textContent = 'Client settings are unavailable. Reopen the contract or select a client.';
      else if (/^Day\/night boundary time settings remain client-level/i.test(value)) node.textContent = 'Shift boundaries are managed in Client settings.';
      else if (/^This override is independent of invoice routing\./i.test(value)) node.textContent = 'Use a different email for this contract’s timesheet queries.';
      else if (/^Send this contract’s missing shifts, wrong hours and reference queries to a different address$/i.test(value)) node.textContent = 'Use a different email for timesheet queries';
    });
    form.querySelectorAll('.controls').forEach((controls) => controls.classList.add('ctms-choice-stack'));
  };

  const enhanceGenericRecordTab = (body, entity, tab) => {
    const form = body.querySelector(':scope > .form');
    if (!form || form.dataset.ctmsEnhanced === '1') return;
    form.dataset.ctmsEnhanced = '1';
    form.classList.add('ctms-proposal-form');
    const rows = unclaimedVisibleChildren(form);
    if (!rows.length) return;
    const entityName = entity === 'candidates' ? 'Candidate' : entity === 'clients' ? 'Client' : entity === 'contracts' ? 'Contract' : 'Record';
    intro(body, `generic-${entity}-${tab}`, `${entityName} ${safeText(tab).replace(/_/g, ' ')}`, '');
    section(form, { key: 'details', title: `${entityName} details`, eyebrow: entityName, nodes: rows, wide: true });
  };

  const cleanVisibleCopy = (body, modal) => {
    const copyRoot = modal || body;
    const selectors = '.mini,.hint,.alert,p,span,button,h1,h2,h3,h4,h5,h6,label,li,th,td,[role="alert"]';
    copyRoot.querySelectorAll(selectors).forEach((node) => {
      if (!node.isConnected) return;
      const value = safeText(node.textContent).replace(/\s+/g, ' ');
      if (!value) return;
      const replacement = replacementFor(visibleCopyRules, value);
      if (replacement === undefined) return;
      const containsControl = !!node.querySelector('input,select,textarea,button,a');
      if (replacement === null) {
        if (!containsControl) node.remove();
        return;
      }
      if ((!containsControl || node.matches('button')) && node.textContent !== replacement) {
        node.textContent = replacement;
      }
    });

    const embeddedCopy = [
      ['Discard this staged import?', 'Discard this import?'],
      ['The approved database and Worker contract could not be verified. Upload and review controls are disabled.', 'Import review is unavailable. Try again or contact support.'],
      ['Financial values remain server-owned and are recalculated only by the approved database functions.', ''],
      ['Only the selected, server-approved CloudTMS actions shown above will be committed.', 'Only the selected actions shown above will be applied.'],
      ['The previous pack remains immutable history but is no longer valid.', 'The previous pack remains in the audit history but cannot be used.'],
      ['Changes are staged. Click “Save” in the main dialog to persist.', 'Click Save to keep these changes.'],
      ['Changes are staged. Click "Save" in the main dialog to persist.', 'Click Save to keep these changes.'],
      ['Up to 5 optional additional pay buckets, billed by units (e.g. patient visits).', 'Add up to five optional rates for work charged per unit, such as patient visits.'],
      ['Margins are per-unit and follow the PAYE/Umbrella logic used on the Rates tab.', 'Pay and charge margins are calculated automatically from the selected rate type.']
    ];
    const walker = document.createTreeWalker(copyRoot, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach((node) => {
      const original = node.nodeValue || '';
      let value = original;
      embeddedCopy.forEach(([current, replacement]) => { value = value.split(current).join(replacement); });
      if (value !== original) node.nodeValue = value;
    });

    copyRoot.querySelectorAll('.banking-pay-active-operation-summary .mono').forEach((node) => node.remove());
    copyRoot.querySelectorAll('.banking-pay-active-operation-summary .pill').forEach((node) => {
      if (/^Runner:/i.test(safeText(node.textContent))) node.remove();
    });

    const title = modal?.querySelector('#modalTitle') || document.getElementById('modalTitle');
    if (title) {
      const value = safeText(title.textContent).replace(/\s+/g, ' ');
      const replacement = replacementFor(titleCopyRules, value);
      if (replacement !== undefined && replacement !== null && title.textContent !== replacement) {
        title.textContent = replacement;
      }
    }

    copyRoot.querySelectorAll('.mini:empty,.hint:empty,p:empty,span:empty').forEach((node) => {
      if (!node.querySelector('input,select,textarea,button,a')) node.remove();
    });
  };

  const apply = () => {
    const modal = document.getElementById('modal');
    const backdrop = document.getElementById('modalBack');
    const body = document.getElementById('modalBody');
    if (!modal || !backdrop || !body) return;
    const visible = getComputedStyle(backdrop).display !== 'none';
    if (!visible) return;

    const frame = typeof window.__getModalFrame === 'function' ? window.__getModalFrame() : null;
    const entity = safeText(frame?.entity || window.modalCtx?.entity).toLowerCase();
    const tab = safeText(frame?.currentTabKey || '').toLowerCase();
    const activeTabLabel = safeText(modal.querySelector('#modalTabs button.active')?.textContent).toLowerCase();
    const kind = safeText(frame?.kind || '').toLowerCase();
    cleanVisibleCopy(body, modal);
    const targeted = ['candidates','clients','contracts','umbrellas'].includes(entity) ||
      kind === 'advanced-search' || kind === 'contracts' || !!body.querySelector('.irv1-shell');
    if (!targeted) {
      if (modal.classList.contains('ctms-modern-modal')) modal.classList.remove('ctms-modern-modal');
      if (backdrop.classList.contains('ctms-modern-backdrop')) backdrop.classList.remove('ctms-modern-backdrop');
      return;
    }

    if (!modal.classList.contains('ctms-modern-modal')) modal.classList.add('ctms-modern-modal');
    if (!backdrop.classList.contains('ctms-modern-backdrop')) backdrop.classList.add('ctms-modern-backdrop');

    const form = body.querySelector('#tab-main, #tab-pay, #searchForm, #contractForm');
    if (entity === 'candidates' && tab === 'main' && form && form.dataset.ctmsEnhanced !== '1') {
      form.dataset.ctmsEnhanced = '1';
      enhanceCandidateMain(body, form);
    } else if (entity === 'candidates' && tab === 'pay' && form && form.dataset.ctmsEnhanced !== '1') {
      form.dataset.ctmsEnhanced = '1';
      enhanceCandidatePay(body, form);
    } else if (entity === 'clients' && tab === 'main' && form && form.dataset.ctmsEnhanced !== '1') {
      form.dataset.ctmsEnhanced = '1';
      enhanceClientMain(body, form);
    } else if (entity === 'umbrellas' && tab === 'main' && form && form.dataset.ctmsEnhanced !== '1') {
      form.dataset.ctmsEnhanced = '1';
      enhanceUmbrella(body, form);
    } else if (kind === 'advanced-search' && form && form.dataset.ctmsEnhanced !== '1') {
      form.dataset.ctmsEnhanced = '1';
      enhanceAdvancedSearch(body, form);
    } else if (entity === 'contracts' && tab === 'main' && body.querySelector('#contractForm')?.dataset.ctmsEnhanced !== '1') {
      const contractForm = body.querySelector('#contractForm');
      contractForm.dataset.ctmsEnhanced = '1';
      enhanceContractMain(body, contractForm);
    } else if (
      ['candidates','clients','contracts'].includes(entity) &&
      !(entity === 'clients' && tab === 'settings') &&
      !(entity === 'contracts' && ['rates', 'settings'].includes(tab)) &&
      !body.querySelector('#contractRatesTab, #clientSettingsForm, #contractSettingsForm')
    ) {
      enhanceGenericRecordTab(body, entity, activeTabLabel || tab || 'details');
    }

    const rates = body.querySelector('#contractRatesTab');
    if (rates) enhanceContractRates(body, rates);
    const clientSettings = body.querySelector('#clientSettingsForm');
    if (clientSettings) enhanceClientSettings(body, clientSettings);
    const contractSettings = body.querySelector('#contractSettingsForm');
    if (contractSettings) enhanceContractSettings(body, contractSettings);

    cleanVisibleCopy(body, modal);
    decorateMoney(body);
  };

  document.addEventListener('blur', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.closest('#modal.ctms-modern-modal')) return;
    formatMoneyInput(target, true);
  }, true);

  const observer = new MutationObserver(() => queueMicrotask(apply));
  const start = () => {
    const modal = document.getElementById('modal');
    const backdrop = document.getElementById('modalBack');
    if (modal) observer.observe(modal, { childList: true, subtree: true });
    if (backdrop) observer.observe(backdrop, { attributes: true, attributeFilter: ['style', 'class'] });
    apply();
  };

  window.__applyCloudTmsModalModernisation = apply;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
