(() => {
  'use strict';
  const STATUS = Object.freeze({
    CREATED: ['Candidate submission created', 'neutral'],
    WORKER_DRAFT: ['Candidate draft in progress', 'neutral'],
    WORKER_SUBMITTED: ['Candidate submission received', 'info'],
    WORKER_SUBMITTED_PENDING_REVIEW_DOCUMENT: ['Preparing review documents', 'info'],
    READY_FOR_MANAGER_APPROVAL: ['Ready for manager approval', 'info'],
    AWAITING_MANAGER_APPROVAL: ['Awaiting Manager Approval', 'danger'],
    MANAGER_APPROVED_PENDING_FINAL_DOCUMENT: ['Manager approved — preparing final document', 'success'],
    MANAGER_APPROVED: ['Manager Approved', 'success'],
    READY_TO_FINALISE: ['Ready to finalise', 'success'],
    AWAITING_PAPER_RETURN: ['QR Pack issued — awaiting signed return', 'warning'],
    RECEIVED: ['Signed return received', 'warning'],
    FINALISED: ['Candidate submission finalised', 'success'],
    REFUSED: ['Refused by Client', 'danger'],
    REJECTED: ['Rejected — resubmission required', 'danger'],
    CANCELLED: ['Cancelled', 'neutral'], SUPERSEDED: ['Superseded', 'neutral'], EXPIRED: ['Expired', 'warning'],
    INVOICED_NOT_PAID: ['Invoiced (Not paid)', 'warning'], AUTHORISED: ['Authorised', 'success'], PAID: ['Paid', 'success'],
    MANUAL: ['Manual', 'neutral'],
    UNASSIGNED: ['Candidate not assigned', 'danger'], CLIENT_UNRESOLVED: ['Client unresolved', 'danger'],
    RATE_MISSING: ['Rate missing', 'danger'], PAY_CHANNEL_MISSING: ['Pay channel missing', 'danger'],
    READY_FOR_HR: ['Ready for HR review', 'info'], READY_FOR_INVOICE: ['Ready for invoice', 'success'],
    PENDING_AUTH: ['Pending authorisation', 'warning'], AWAITING_MANUAL_SIGNATURE: ['Awaiting manual signature', 'warning'],
    UNPROCESSED: ['Unprocessed', 'neutral'], PLANNED: ['Planned', 'neutral'], OPEN: ['Open', 'neutral'],
    SUBMITTED: ['Submitted', 'info'], INVOICED: ['Invoiced', 'warning'], AVAILABLE: ['Available', 'neutral'],
    DRAFT: ['Draft', 'neutral']
  });
  const PAPER = Object.freeze({
    PREPARING: ['QR Status — Preparing', 'info'], BACKOFF: ['QR Pack preparation waiting to retry', 'warning'],
    READY: ['QR Pack ready', 'success'], RETURN_RECEIVED: ['Signed QR Pack received', 'success'],
    FAILED_RETRYABLE: ['QR Pack preparation failed', 'danger'], FAILED_TERMINAL: ['QR Pack preparation failed', 'danger'],
    RETIRED: ['QR Pack retired', 'neutral'], STALE: ['QR Pack is out of date', 'warning']
  });
  const QR_STATE_EXPLANATIONS = Object.freeze({
    BACKOFF: 'CloudTMS is waiting until the server-owned retry time.',
    FAILED_RETRYABLE: 'CloudTMS can retry this failed QR Pack preparation.',
    FAILED_TERMINAL: 'This QR Pack needs Office review before another action.',
    RETIRED: 'This QR Pack and its code are no longer valid.',
    STALE: 'This QR Pack no longer matches the current timesheet.'
  });
  const OFFICE_ACTION_LABELS = Object.freeze({
    SEND_MANAGER_REMINDER: 'Send Manager Reminder',
    RENEW_MANAGER_REQUEST: 'Request Manager Approval Again',
    CANCEL_MANAGER_REQUEST: 'Cancel Manager Approval Request',
    REJECT_CANDIDATE_SUBMISSION: 'Reject Candidate Submission',
    RETRY_FINALISATION: 'Retry Finalisation',
    VIEW_PAPER_PACK: 'View QR Pack',
    REVIEW_PAPER_RETURN: 'View returned QR documents',
    RETRY_PAPER_PREPARATION: 'Retry QR Pack Preparation',
    RESEND_QR_PACK: 'Resend QR Pack',
    ISSUE_REPLACEMENT_PAPER_PACK: 'Create Replacement QR Pack and Notify Worker'
  });
  const tone = value => ['success', 'danger', 'warning', 'info', 'neutral'].includes(String(value || '').toLowerCase()) ? String(value).toLowerCase() : 'neutral';
  const OFFICE_FRONTEND_FORBIDDEN_ACTIONS = new Set([
    ...(window.CloudTMSCandidateOfficeUiPolicy?.MANAGER_JOURNEY_ACTIONS || []),
    ...(window.CloudTMSCandidateOfficeUiPolicy?.CANDIDATE_APP_ACTIONS || []),
    ...(window.CloudTMSCandidateOfficeUiPolicy?.EVIDENCE_TAB_ACTIONS || []),
    ...(window.CloudTMSCandidateOfficeUiPolicy?.OFFICE_HIDDEN_ACTIONS || [])
  ]);
  const formatDateTime = value => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(date);
    const read = type => parts.find(part => part.type === type)?.value || '';
    return `${read('day')}/${read('month')}/${read('year')} ${read('hour')}:${read('minute')}:${read('second')}`;
  };
  const statusView = projection => {
    const server = projection.candidate_status || {};
    const code = String(server.code || '').toUpperCase();
    const known = STATUS[code];
    if (!known) return Object.freeze({ code: 'UNAVAILABLE', label: 'Candidate status unavailable', tone: 'neutral', unavailable: true });
    return Object.freeze({ code, label: known[0], tone: tone(known[1]), unavailable: false });
  };
  const actionView = action => Object.freeze({
    ...action,
    label: OFFICE_ACTION_LABELS[String(action?.code || '').toUpperCase()] || action.label,
    disabled_text: action.enabled ? '' : (action.disabled_reason || 'This action is not currently available.')
  });
  function managerStatusLabel(state) {
    const normalized = String(state || '').trim().toUpperCase();
    if (normalized === 'APPROVED') return 'Manager Approved';
    if (normalized === 'REFUSED') return 'Refused by Client';
    return 'Awaiting Manager Approval';
  }
  function presentCandidateManagerApproval(manager, actions = []) {
    if (!manager) return null;
    const method = String(manager.method || '').toUpperCase();
    const managerActions = actions
      .filter(action => action.group === 'MANAGER_APPROVAL')
      .filter(action => window.CloudTMSCandidateOfficeUiPolicy?.ownerOf(action.code) === 'OFFICE')
      .map(actionView);
    const availability = manager.state === 'EXPIRED' ? 'Expired' : manager.state === 'APPROVED' ? 'Completed' : manager.reminder_eligible ? 'Eligible' : manager.provider_handoff_in_progress ? 'Blocked while provider handoff is in progress' : 'Not yet eligible';
    const displayStatus = managerStatusLabel(manager.state);
    const emailFields = [
      ['Status', displayStatus],
      ['Reminder availability', availability],
      ['Resends used', manager.resend_count ?? '—'],
      ['Resends remaining', manager.resends_remaining ?? '—'],
      ['Last provider-accepted send', formatDateTime(manager.provider_accepted_at_utc)],
      ['Next reminder eligibility', formatDateTime(manager.next_reminder_at_utc)],
      ['Request expiry', formatDateTime(manager.expires_at_utc)],
      ['Request generation', manager.request_generation ?? '—'],
      ['Delivery status', manager.delivery_state || '—'],
      ['Provider status', manager.provider_status || '—'],
      ['Provider handoff / lease', manager.provider_handoff_in_progress ? 'In progress' : 'Not in progress']
    ];
    const phoneFields = [['Status', displayStatus]];
    return Object.freeze({
      ...manager,
      title: 'Manager approval',
      availability,
      status_label: displayStatus,
      fields: Object.freeze((method === 'PHONE' ? phoneFields : emailFields).map(Object.freeze)),
      actions: Object.freeze(managerActions)
    });
  }
  function presentCandidatePaperPack(paper, actions = []) {
    if (!paper || String(paper.state).toUpperCase() === 'NOT_APPLICABLE') return null;
    const state = String(paper.state || '').toUpperCase();
    const display = PAPER[state] || ['QR Pack status unavailable', 'neutral'];
    return Object.freeze({
      ...paper, state, label: display[0], tone: display[1], explanation: QR_STATE_EXPLANATIONS[state] || null,
      fields: Object.freeze([
        ['QR generation', paper.delivery_generation ?? '—'], ['Pages', paper.page_count ?? '—'],
        ['Issued', formatDateTime(paper.issued_at_utc)], ['Returned', formatDateTime(paper.returned_at_utc)],
        ['Attempts', paper.attempt_count ?? 0], ['Next retry', formatDateTime(paper.next_retry_at_utc)]
      ].map(Object.freeze)),
      actions: Object.freeze(actions.filter(action => action.group === 'PAPER').map(actionView))
    });
  }
  function presentCandidateRejections(rejections = []) {
    return Object.freeze(rejections.map(item => Object.freeze({
      ...item,
      label: item.state === 'REFUSED' ? 'Refused by Client' : 'Rejected by Agency',
      historical: item.rejection_actionable !== true,
      action: item.recovery_action && window.CloudTMSCandidateOfficeUiPolicy?.ownerOf(item.recovery_action.code) === 'OFFICE'
        ? actionView(item.recovery_action)
        : null
    })));
  }
  function presentCandidateOfficeDetail(projection, { surface = 'SIMPLE_TIMESHEET' } = {}) {
    const status = statusView(projection);
    const phoneWorkflow = String(projection.manager_approval?.method || '').toUpperCase() === 'PHONE';
    const actions = projection.available_actions
      .filter(action => !OFFICE_FRONTEND_FORBIDDEN_ACTIONS.has(String(action?.code || '').toUpperCase()))
      .filter(action => !(phoneWorkflow && ['SEND_MANAGER_REMINDER', 'RENEW_MANAGER_REQUEST', 'CANCEL_MANAGER_REQUEST'].includes(String(action?.code || '').toUpperCase())))
      .map(actionView);
    const resendSupported = projection.available_actions.some(action => String(action?.code || '').toUpperCase() === 'RESEND_QR_PACK');
    const resendPlaceholderEligible = !resendSupported
      && String(projection.workflow?.state || '').toUpperCase() === 'AWAITING_PAPER_RETURN'
      && String(projection.paper_pack?.state || '').toUpperCase() === 'READY'
      && !!projection.paper_pack?.issued_at_utc;
    if (resendPlaceholderEligible) {
      actions.push(Object.freeze({
        code: 'RESEND_QR_PACK',
        label: OFFICE_ACTION_LABELS.RESEND_QR_PACK,
        group: 'PAPER',
        enabled: false,
        prominent: false,
        placeholder: true,
        disabled_reason: 'Backend support for safely resending this unchanged QR Pack is pending.',
        disabled_text: 'Backend support for safely resending this unchanged QR Pack is pending.'
      }));
    }
    const evidenceActions = projection.available_actions
      .filter(action => window.CloudTMSCandidateOfficeUiPolicy?.ownerOf(action.code) === 'OFFICE_EVIDENCE')
      .map(actionView);
    return Object.freeze({
      surface, identity: projection.current_identity, status,
      workflow: projection.workflow,
      manager: presentCandidateManagerApproval(projection.manager_approval, actions),
      paper: presentCandidatePaperPack(projection.paper_pack, actions),
      rejections: presentCandidateRejections(projection.rejections),
      diagnostics: Object.freeze(projection.diagnostics.map(item => Object.freeze({ ...item, label: item.code === 'EXPENSE_EMAIL_MISSING' ? 'Expense Email missing' : item.message, tone: item.severity === 'INFO' ? 'info' : item.severity === 'ERROR' ? 'danger' : 'warning' }))),
      evidence_actions: Object.freeze(evidenceActions),
      primary_action: projection.primary_action && !OFFICE_FRONTEND_FORBIDDEN_ACTIONS.has(String(projection.primary_action.code || '').toUpperCase())
        ? actionView(projection.primary_action)
        : null,
      actions: Object.freeze(actions),
      observed_at: formatDateTime(projection.observed_at_utc),
      projection
    });
  }
  function presentCandidateOfficeSummary(projection) {
    const detail = presentCandidateOfficeDetail(projection, { surface: 'TIMESHEET_SUMMARY' });
    const status = code => {
      const catalogue = {
        AWAITING_CANDIDATE_SUBMISSION: ['Awaiting Candidate Submission', 'neutral'],
        CANDIDATE_SUBMITTED: ['Candidate Submitted', 'info'],
        AWAITING_MANAGER_APPROVAL: ['Awaiting Manager Approval', 'warning'],
        MANAGER_APPROVED: ['Manager Approved', 'success'],
        QR_AWAITING_SIGNED_RETURN: ['QR Awaiting Signed Return', 'warning'],
        QR_PACK_PREPARING: ['QR Pack Preparing', 'info'],
        FINALISING_SUBMISSION: ['Finalising Submission', 'info'],
        FINALISATION_NEEDS_ATTENTION: ['Finalisation Needs Attention', 'danger'],
        QR_PACK_NEEDS_ATTENTION: ['QR Pack Needs Attention', 'danger'],
        REFUSED_BY_CLIENT: ['Refused by Client', 'danger'],
        REJECTED_BY_AGENCY: ['Rejected by Agency', 'danger'],
        CANDIDATE_SUBMISSION_CANCELLED: ['Candidate Submission Cancelled', 'neutral'],
        CANDIDATE_SUBMISSION_COMPLETE: ['Candidate Submission Complete', 'success'],
        STATUS_UNAVAILABLE: ['Status unavailable', 'neutral']
      };
      const selected = catalogue[code] || catalogue.STATUS_UNAVAILABLE;
      return Object.freeze({ code, label: selected[0], tone: selected[1], unavailable: code === 'STATUS_UNAVAILABLE' });
    };
    const sourceCode = String(detail.status?.code || '').toUpperCase();
    const workflowState = String(projection.workflow?.state || '').toUpperCase();
    const routeFamily = String(projection.current_identity?.route_family || '').toUpperCase();
    const paperState = String(projection.paper_pack?.state || 'NOT_APPLICABLE').toUpperCase();
    const enabledActionCodes = new Set((projection.available_actions || [])
      .filter(action => action?.enabled === true)
      .map(action => String(action.code || '').toUpperCase()));
    let summaryStatus = null;

    if (detail.status?.unavailable) summaryStatus = status('STATUS_UNAVAILABLE');
    else if (sourceCode === 'REJECTED') summaryStatus = status('REJECTED_BY_AGENCY');
    else if (sourceCode === 'REFUSED' || workflowState === 'REFUSED') summaryStatus = status('REFUSED_BY_CLIENT');
    else if (enabledActionCodes.has('RETRY_FINALISATION')) summaryStatus = status('FINALISATION_NEEDS_ATTENTION');
    else if (['FAILED_RETRYABLE', 'FAILED_TERMINAL', 'RETIRED', 'STALE'].includes(paperState)) summaryStatus = status('QR_PACK_NEEDS_ATTENTION');
    else if (['PREPARING', 'BACKOFF'].includes(paperState)) summaryStatus = status('QR_PACK_PREPARING');
    else if (paperState === 'READY' && (sourceCode === 'AWAITING_PAPER_RETURN' || workflowState === 'AWAITING_PAPER_RETURN')) summaryStatus = status('QR_AWAITING_SIGNED_RETURN');
    else if (paperState === 'RETURN_RECEIVED' || ['RECEIVED', 'MANAGER_APPROVED_PENDING_FINAL_DOCUMENT', 'READY_TO_FINALISE'].includes(sourceCode)) summaryStatus = status('FINALISING_SUBMISSION');
    else if (['CREATED', 'WORKER_DRAFT'].includes(sourceCode)) summaryStatus = status('AWAITING_CANDIDATE_SUBMISSION');
    else if (['WORKER_SUBMITTED', 'WORKER_SUBMITTED_PENDING_REVIEW_DOCUMENT', 'READY_FOR_MANAGER_APPROVAL'].includes(sourceCode)) summaryStatus = status('CANDIDATE_SUBMITTED');
    else if (sourceCode === 'AWAITING_MANAGER_APPROVAL') summaryStatus = status('AWAITING_MANAGER_APPROVAL');
    else if (sourceCode === 'MANAGER_APPROVED' || detail.manager?.state === 'APPROVED') summaryStatus = status('MANAGER_APPROVED');
    else if (['CANCELLED', 'SUPERSEDED', 'EXPIRED'].includes(sourceCode)) summaryStatus = status('CANDIDATE_SUBMISSION_CANCELLED');
    else if (['FINALISED', 'AUTHORISED', 'INVOICED_NOT_PAID', 'PAID'].includes(sourceCode)) summaryStatus = status('CANDIDATE_SUBMISSION_COMPLETE');
    else if (workflowState === 'FINALISED' && projection.workflow?.historical === true) summaryStatus = status('CANDIDATE_SUBMISSION_COMPLETE');
    else if (['CANCELLED', 'SUPERSEDED', 'EXPIRED'].includes(workflowState) && projection.workflow?.historical === true) summaryStatus = status('CANDIDATE_SUBMISSION_CANCELLED');
    else if (!projection.workflow && ['QR', 'ELECTRONIC'].includes(routeFamily)) summaryStatus = status('AWAITING_CANDIDATE_SUBMISSION');
    else if (projection.workflow || ['QR', 'ELECTRONIC'].includes(routeFamily)) summaryStatus = status('STATUS_UNAVAILABLE');

    return Object.freeze({ identity: detail.identity, status: summaryStatus, manager: detail.manager, primary_action: detail.primary_action, diagnostics: detail.diagnostics, projection });
  }
  Object.assign(window, { CloudTMSCandidateOfficePresenter: Object.freeze({ STATUS, PAPER, OFFICE_FRONTEND_FORBIDDEN_ACTIONS, formatDateTime, managerStatusLabel, presentCandidateOfficeSummary, presentCandidateOfficeDetail, presentCandidateManagerApproval, presentCandidatePaperPack, presentCandidateRejections }) });
})();
