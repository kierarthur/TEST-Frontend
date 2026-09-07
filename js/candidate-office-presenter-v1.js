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
  const APPROVED_CANDIDATE_SUBMISSION_STATUS = Object.freeze({
    AWAITING_CANDIDATE_SUBMISSION: ['Awaiting Candidate Submission', 'neutral'],
    CANDIDATE_SUBMITTED: ['Candidate Submitted', 'info'],
    AWAITING_MANAGER_APPROVAL: ['Awaiting Manager Approval', 'warning'],
    MANAGER_APPROVED: ['Manager Approved', 'success'],
    QR_AWAITING_SIGNED_RETURN: ['QR Awaiting Signed Return', 'warning'],
    QR_PACK_PREPARING: ['QR Pack Preparing', 'info'],
    FINALISING_SUBMISSION: ['Finalising Submission', 'info'],
    FINALISATION_NEEDS_ATTENTION: ['Finalisation Needs Attention', 'danger'],
    QR_PACK_NEEDS_ATTENTION: ['QR Pack Needs Attention', 'danger'],
    QR_PACK_OUT_OF_DATE: ['QR Pack Out of Date', 'warning'],
    REFUSED_BY_CLIENT: ['Refused by Client', 'danger'],
    REJECTED_BY_AGENCY: ['Rejected by Agency', 'danger'],
    CANDIDATE_SUBMISSION_CANCELLED: ['Candidate Submission Cancelled', 'neutral'],
    CANDIDATE_SUBMISSION_COMPLETE: ['Candidate Submission Complete', 'success'],
    STATUS_UNAVAILABLE: ['Status unavailable', 'neutral']
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
  const QR_ATTENTION_REASON_BY_CODE = Object.freeze({
    CANDIDATE_PAPER_PACK_RENDER_FAILED: 'CloudTMS could not create the QR Pack document.',
    CANDIDATE_PAPER_OUTBOX_CONFLICT: 'CloudTMS found conflicting QR Pack delivery records, so it stopped before sending another copy.'
  });
  const QR_ATTENTION_REASON_BY_STATE = Object.freeze({
    FAILED_RETRYABLE: 'CloudTMS could not prepare this QR Pack.',
    FAILED_TERMINAL: 'CloudTMS cannot safely continue this QR Pack automatically.',
    RETIRED: 'This QR Pack was retired and its code is no longer valid.',
    STALE: 'This QR Pack no longer matches the current Timesheet.'
  });
  const QR_NEXT_ACTION_BY_STATE = Object.freeze({
    FAILED_RETRYABLE: 'RETRY_PAPER_PREPARATION',
    FAILED_TERMINAL: 'ISSUE_REPLACEMENT_PAPER_PACK',
    RETIRED: 'ISSUE_REPLACEMENT_PAPER_PACK',
    STALE: 'ISSUE_REPLACEMENT_PAPER_PACK'
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
  const EXPENSE_CATEGORY_LABELS = Object.freeze({
    MILEAGE: 'Mileage',
    TRAVEL: 'Travel',
    ACCOMMODATION: 'Accommodation',
    OTHER: 'Other'
  });
  const EXPENSE_STATUS = Object.freeze({
    DRAFT: ['Draft', 'neutral'],
    SUBMITTED: ['Submitted', 'info'],
    MANAGER_APPROVAL_REQUIRED: ['Awaiting Manager Approval', 'warning'],
    MANAGER_APPROVED: ['Manager Approved', 'success'],
    AGENCY_AUTHORISED: ['Agency Authorised', 'success'],
    INVOICED: ['Invoiced', 'success'],
    PAID: ['Paid', 'success'],
    MANAGER_REFUSED: ['Manager Refused', 'danger'],
    AGENCY_REJECTED: ['Rejected by Agency', 'danger'],
    WITHDRAWN: ['Withdrawn', 'neutral'],
    CANCELLED: ['Cancelled', 'neutral'],
    SUPERSEDED: ['Superseded', 'neutral'],
    MIXED: ['See individual expense statuses', 'info']
  });
  const EXPENSE_MANAGER_STATUS = Object.freeze({
    NOT_REQUESTED: 'Not requested',
    PENDING: 'Awaiting Manager Approval',
    APPROVED: 'Manager Approved',
    REFUSED: 'Manager Refused'
  });
  const EXPENSE_AGENCY_STATUS = Object.freeze({
    NOT_AUTHORISED: 'Not yet authorised',
    AUTHORISED: 'Agency Authorised',
    INVOICED: 'Invoiced',
    PAID: 'Paid'
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
  const formatMoney = value => `£${Number(value || 0).toFixed(2)}`;
  const sourceStatusView = projection => {
    const server = projection.candidate_status || {};
    const code = String(server.code || '').toUpperCase();
    const known = STATUS[code];
    if (!known) return Object.freeze({ code: 'UNAVAILABLE', label: 'Candidate status unavailable', tone: 'neutral', unavailable: true });
    return Object.freeze({ code, label: known[0], tone: tone(known[1]), unavailable: false });
  };
  const approvedStatusView = code => {
    const normalized = String(code || 'STATUS_UNAVAILABLE').toUpperCase();
    const selected = APPROVED_CANDIDATE_SUBMISSION_STATUS[normalized]
      || APPROVED_CANDIDATE_SUBMISSION_STATUS.STATUS_UNAVAILABLE;
    return Object.freeze({
      code: APPROVED_CANDIDATE_SUBMISSION_STATUS[normalized] ? normalized : 'STATUS_UNAVAILABLE',
      label: selected[0],
      tone: selected[1],
      unavailable: !APPROVED_CANDIDATE_SUBMISSION_STATUS[normalized] || normalized === 'STATUS_UNAVAILABLE'
    });
  };
  const candidateSubmissionApplies = projection => {
    const routeFamily = String(projection?.current_identity?.route_family || '').toUpperCase();
    const recordRole = String(projection?.current_identity?.record_role || '').toUpperCase();
    const workflowRoute = String(projection?.workflow?.route || '').toUpperCase();
    const workflowState = String(projection?.workflow?.state || '').toUpperCase();
    const workflowKind = String(projection?.workflow?.workflow_kind || '').toUpperCase();
    const historicalWorkflow = projection?.workflow?.historical === true
      && projection?.workflow?.is_current_action_workflow !== true;
    // Imported hours have no Candidate submission lifecycle and remain blank.
    // A separate expense-only carrier or active/retained printed submission
    // can own a real Candidate workflow even when the stored Timesheet route
    // is manual or belongs to an import-authoritative week.
    // Superseded/cancelled historical attempts belong in audit history, not in
    // the current Candidate Submission cell. A finalised workflow remains the
    // durable completion proof for its exact Timesheet or expense carrier.
    if (historicalWorkflow && workflowState !== 'FINALISED') return false;
    if (workflowKind === 'CONTRACT_EXPENSE' && recordRole !== 'EXPENSE_ONLY') return false;
    return ['ELECTRONIC', 'QR'].includes(routeFamily)
      || (!!workflowState && (
        recordRole === 'EXPENSE_ONLY' ||
        workflowRoute === 'PAPER' ||
        workflowKind === 'CONTRACT_EXPENSE'
      ));
  };
  const isReceivedDailySubmission = projection => {
    const workflow = projection.workflow;
    const manager = projection.manager_approval;
    // A current Daily PHONE receipt is written only after the signed document
    // is attached. RECEIVED on PAPER still means a return awaiting processing.
    // This is Candidate completion, not Office financial authorisation.
    return String(projection.current_identity?.route_family || '').toUpperCase() === 'ELECTRONIC'
      && String(workflow?.workflow_kind || '').toUpperCase() === 'DAILY'
      && String(workflow?.state || '').toUpperCase() === 'RECEIVED'
      && String(workflow?.route || '').toUpperCase() === 'PHONE'
      && workflow?.is_current_action_workflow === true
      && workflow?.historical === false
      && String(manager?.method || '').toUpperCase() === 'PHONE'
      && String(manager?.state || '').toUpperCase() === 'APPROVED'
      && String(projection.paper_pack?.state || '').toUpperCase() === 'NOT_APPLICABLE';
  };
  function presentApprovedCandidateSubmissionStatus(projection) {
    // Candidate lifecycle presentation is route-owned, not finance-owned. A
    // terminal financial status on Manual (non-QR), HealthRoster, NHSP or any
    // other import-authoritative row must never manufacture Candidate truth.
    if (!candidateSubmissionApplies(projection)) return null;
    const source = sourceStatusView(projection);
    const sourceCode = String(source?.code || '').toUpperCase();
    const workflowState = String(projection.workflow?.state || '').toUpperCase();
    const routeFamily = String(projection.current_identity?.route_family || '').toUpperCase();
    const paperState = String(projection.paper_pack?.state || 'NOT_APPLICABLE').toUpperCase();
    const lifecycleCode = workflowState || sourceCode;
    const enabledActionCodes = new Set((projection.available_actions || [])
      .filter(action => action?.enabled === true)
      .map(action => String(action.code || '').toUpperCase()));

    // One closed precedence catalogue owns every Office Candidate surface. The
    // furthest confirmed QR lifecycle state wins, so mutually exclusive stages
    // can never be displayed together.
    if (source.unavailable && !workflowState) return approvedStatusView('STATUS_UNAVAILABLE');
    if (lifecycleCode === 'REJECTED') return approvedStatusView('REJECTED_BY_AGENCY');
    if (lifecycleCode === 'REFUSED') return approvedStatusView('REFUSED_BY_CLIENT');
    if (['CANCELLED', 'SUPERSEDED', 'EXPIRED'].includes(lifecycleCode)) return approvedStatusView('CANDIDATE_SUBMISSION_CANCELLED');
    if (workflowState === 'FINALISED') return approvedStatusView('CANDIDATE_SUBMISSION_COMPLETE');
    if (isReceivedDailySubmission(projection)) return approvedStatusView('CANDIDATE_SUBMISSION_COMPLETE');
    // Authorised/invoiced/paid is Office financial truth, not proof that the
    // Candidate used or completed the Candidate submission workflow. Historic
    // pre-app records with no durable workflow therefore remain blank.
    if (!workflowState && ['FINALISED', 'AUTHORISED', 'INVOICED_NOT_PAID', 'PAID'].includes(sourceCode)) return null;
    if (enabledActionCodes.has('RETRY_FINALISATION')) return approvedStatusView('FINALISATION_NEEDS_ATTENTION');
    if (paperState === 'STALE') return approvedStatusView('QR_PACK_OUT_OF_DATE');
    if (['FAILED_RETRYABLE', 'FAILED_TERMINAL', 'RETIRED'].includes(paperState)) return approvedStatusView('QR_PACK_NEEDS_ATTENTION');
    if (paperState === 'RETURN_RECEIVED' || ['RECEIVED', 'MANAGER_APPROVED_PENDING_FINAL_DOCUMENT', 'READY_TO_FINALISE'].includes(lifecycleCode)) return approvedStatusView('FINALISING_SUBMISSION');
    if (paperState === 'READY' && lifecycleCode === 'AWAITING_PAPER_RETURN') return approvedStatusView('QR_AWAITING_SIGNED_RETURN');
    if (['PREPARING', 'BACKOFF'].includes(paperState)) return approvedStatusView('QR_PACK_PREPARING');
    if (['CREATED', 'WORKER_DRAFT'].includes(lifecycleCode)) return approvedStatusView('AWAITING_CANDIDATE_SUBMISSION');
    if (['WORKER_SUBMITTED', 'WORKER_SUBMITTED_PENDING_REVIEW_DOCUMENT', 'READY_FOR_MANAGER_APPROVAL'].includes(lifecycleCode)) return approvedStatusView('CANDIDATE_SUBMITTED');
    if (lifecycleCode === 'AWAITING_MANAGER_APPROVAL') return approvedStatusView('AWAITING_MANAGER_APPROVAL');
    if (lifecycleCode === 'MANAGER_APPROVED' || projection.manager_approval?.state === 'APPROVED') return approvedStatusView('MANAGER_APPROVED');
    if (!projection.workflow && ['QR', 'ELECTRONIC'].includes(routeFamily)) return approvedStatusView('AWAITING_CANDIDATE_SUBMISSION');
    if (projection.workflow || ['QR', 'ELECTRONIC'].includes(routeFamily)) return approvedStatusView('STATUS_UNAVAILABLE');
    return null;
  }
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
  const submissionScopeLabel = (workflowKind, scope) => {
    const kind = String(workflowKind || '').toUpperCase();
    const normalizedScope = String(scope || '').toUpperCase();
    if (kind === 'CONTRACT_EXPENSE' || normalizedScope === 'EXPENSE') return 'Expense claim';
    if (kind === 'CONTRACT_COMBINED' || normalizedScope === 'COMBINED') return 'Timesheet and expenses';
    return 'Timesheet hours';
  };
  const scopedStatusView = (status, workflowKind, scope) => {
    if (!status) return null;
    return Object.freeze({
      ...status,
      label: `${submissionScopeLabel(workflowKind, scope)} — ${status.label}`
    });
  };
  const approvalRouteLabel = value => {
    const route = String(value || '').trim().toUpperCase();
    if (route === 'PHONE') return 'Phone';
    if (route === 'EMAIL') return 'Email';
    if (route === 'PAPER') return 'QR';
    return route ? route.charAt(0) + route.slice(1).toLowerCase() : 'Not chosen yet';
  };
  function presentCurrentSubmission(projection, status) {
    if (!status || !projection?.workflow) return null;
    const workflow = projection.workflow;
    const manager = projection.manager_approval || {};
    const state = String(workflow.state || '').trim().toUpperCase();
    const managerState = String(manager.state || '').trim().toUpperCase();
    const approved = managerState === 'APPROVED' || [
      'MANAGER_APPROVED', 'MANAGER_APPROVED_PENDING_FINAL_DOCUMENT',
      'READY_TO_FINALISE', 'FINALISED'
    ].includes(state);
    const fields = [
      ['Status', status.label.replace(/^.*? — /, '')],
      ['Approved', approved
        ? (manager.approved_at_utc ? `Yes — ${formatDateTime(manager.approved_at_utc)}` : 'Yes')
        : 'Not approved yet'],
      ['Approval route', approvalRouteLabel(manager.method || workflow.route)]
    ];
    if (manager.manager_name) fields.push(['Approver name', manager.manager_name]);
    if (manager.manager_position) fields.push(['Approver job title', manager.manager_position]);
    if (manager.manager_email) fields.push(['Approver email', manager.manager_email]);
    return Object.freeze({
      scope_label: submissionScopeLabel(workflow.workflow_kind, null),
      status,
      approved,
      fields: Object.freeze(fields.map(Object.freeze))
    });
  }
  function presentRetainedManagerApproval(retained) {
    if (!retained) return null;
    const scopeLabel = submissionScopeLabel(retained.workflow_kind, retained.scope);
    return Object.freeze({
      ...retained,
      scope_label: scopeLabel,
      status: scopedStatusView(approvedStatusView('MANAGER_APPROVED'), retained.workflow_kind, retained.scope),
      fields: Object.freeze([
        ['Submission', scopeLabel],
        ['Status', 'Manager Approved'],
        ['Approved', formatDateTime(retained.approved_at_utc)],
        ['Approval method', approvalRouteLabel(retained.method || retained.route)],
        ...(retained.manager_name ? [['Approver name', retained.manager_name]] : []),
        ...(retained.manager_position ? [['Approver job title', retained.manager_position]] : []),
        ...(retained.manager_email ? [['Approver email', retained.manager_email]] : [])
      ].map(Object.freeze))
    });
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
    const paperActions = actions.filter(action => action.group === 'PAPER').map(actionView);
    const attentionReason = QR_ATTENTION_REASON_BY_STATE[state]
      ? (QR_ATTENTION_REASON_BY_CODE[String(paper.reason_code || '').toUpperCase()] || QR_ATTENTION_REASON_BY_STATE[state])
      : null;
    const expectedActionCode = QR_NEXT_ACTION_BY_STATE[state] || null;
    const enabledNextAction = expectedActionCode
      ? paperActions.find(action => action.enabled === true && String(action.code || '').toUpperCase() === expectedActionCode)
      : null;
    const expectedActionLabel = expectedActionCode ? OFFICE_ACTION_LABELS[expectedActionCode] : null;
    const nextStep = attentionReason && expectedActionLabel
      ? (enabledNextAction
          ? `Use “${enabledNextAction.label}” below.`
          : `Refresh this Timesheet to check for the “${expectedActionLabel}” action.`)
      : null;
    return Object.freeze({
      ...paper,
      state,
      label: display[0],
      tone: display[1],
      explanation: QR_STATE_EXPLANATIONS[state] || null,
      attention_reason: attentionReason,
      next_step: nextStep,
      fields: Object.freeze([
        ['QR generation', paper.delivery_generation ?? '—'], ['Pages', paper.page_count ?? '—'],
        ['Issued', formatDateTime(paper.issued_at_utc)], ['Returned', formatDateTime(paper.returned_at_utc)],
        ['Attempts', paper.attempt_count ?? 0], ['Next retry', formatDateTime(paper.next_retry_at_utc)]
      ].map(Object.freeze)),
      actions: Object.freeze(paperActions)
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
  function presentOfficeExpenseClaims(projection) {
    const currentTimesheetId = String(projection?.current_identity?.timesheet_id || '').trim();
    if (!currentTimesheetId) return Object.freeze([]);
    const claims = Array.isArray(projection?.expense_claims) ? projection.expense_claims : [];
    return Object.freeze(claims.map((claim) => {
      const categories = (Array.isArray(claim.categories) ? claim.categories : [])
        .filter(category => String(category?.owning_timesheet_id || '').trim() === currentTimesheetId)
        .map(category => {
          const status = EXPENSE_STATUS[String(category.status_code || '').toUpperCase()] || ['Status unavailable', 'neutral'];
          const evidenceCount = Number(category.supporting_evidence_count || 0);
          const fields = [
            ['Manager', EXPENSE_MANAGER_STATUS[String(category.manager_approval_state || '').toUpperCase()] || 'Status unavailable'],
            ['Agency', EXPENSE_AGENCY_STATUS[String(category.agency_authorisation_state || '').toUpperCase()] || 'Status unavailable'],
            ['Supporting evidence', `${evidenceCount} ${evidenceCount === 1 ? 'file' : 'files'}`]
          ];
          if (String(category.expense_category || '').toUpperCase() === 'MILEAGE') fields.splice(1, 0, ['Mileage', `${Number(category.mileage_units || 0)} miles`]);
          if (category.refusal) {
            fields.push(['Reason', category.refusal.reason]);
            fields.push(['Decision date', formatDateTime(category.refusal.at_utc)]);
          }
          return Object.freeze({
            expense_component_id: String(category.expense_component_id || ''),
            component_generation: Number(category.component_generation || 0),
            category: String(category.expense_category || '').toUpperCase(),
            label: EXPENSE_CATEGORY_LABELS[String(category.expense_category || '').toUpperCase()] || 'Expense',
            amount: formatMoney(category.amount),
            supporting_evidence_count: evidenceCount,
            status: Object.freeze({ code: String(category.status_code || '').toUpperCase(), label: status[0], tone: status[1] }),
            fields: Object.freeze(fields.map(Object.freeze)),
            rejection_action: category.rejection_action ? actionView(category.rejection_action) : null,
            rejection_confirmation: category.rejection_confirmation ? Object.freeze({ ...category.rejection_confirmation }) : null
          });
        });
      if (!categories.length) return null;
      const claimStatus = EXPENSE_STATUS[String(claim.status_code || '').toUpperCase()] || ['Status unavailable', 'neutral'];
      const ownedTotal = (Array.isArray(claim.categories) ? claim.categories : [])
        .filter(category => category?.included_in_total === true && String(category?.owning_timesheet_id || '').trim() === currentTimesheetId)
        .reduce((sum, category) => sum + Number(category?.amount || 0), 0);
      return Object.freeze({
        workflow_id: String(claim.workflow_id || ''),
        generation: Number(claim.generation || 0),
        status: Object.freeze({ code: String(claim.status_code || '').toUpperCase(), label: claimStatus[0], tone: claimStatus[1] }),
        total: formatMoney(ownedTotal),
        updating: String(claim.update_state || '').toUpperCase() === 'UPDATING',
        needs_attention: String(claim.attention_code || '').toUpperCase() === 'MULTIPLE_PENDING_EXPENSE_CLAIMS',
        categories: Object.freeze(categories)
      });
    }).filter(Boolean));
  }
  function presentCandidateOfficeDetail(projection, { surface = 'SIMPLE_TIMESHEET' } = {}) {
    const sourceStatus = sourceStatusView(projection);
    const status = presentApprovedCandidateSubmissionStatus(projection);
    const retainedManager = presentRetainedManagerApproval(projection.retained_manager_approval);
    const activeDisplayStatus = status;
    const statuses = Object.freeze(activeDisplayStatus ? [activeDisplayStatus] : []);
    const phoneWorkflow = String(projection.manager_approval?.method || '').toUpperCase() === 'PHONE';
    const receivedDaily = isReceivedDailySubmission(projection);
    const actions = projection.available_actions
      .filter(action => !OFFICE_FRONTEND_FORBIDDEN_ACTIONS.has(String(action?.code || '').toUpperCase()))
      .filter(action => !(receivedDaily && String(action?.code || '').toUpperCase() === 'RETRY_FINALISATION'))
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
      surface, identity: projection.current_identity, status, statuses,
      candidate_submission_applicable: candidateSubmissionApplies(projection),
      source_status_code: sourceStatus.code,
      workflow: projection.workflow,
      current_submission: presentCurrentSubmission(projection, activeDisplayStatus),
      manager: presentCandidateManagerApproval(projection.manager_approval, actions),
      retained_manager: retainedManager,
      expense_claims: ['SIMPLE_TIMESHEET', 'BULK_AUTHORISE'].includes(String(surface || '').toUpperCase())
        ? presentOfficeExpenseClaims(projection)
        : Object.freeze([]),
      paper: presentCandidatePaperPack(projection.paper_pack, actions),
      rejections: presentCandidateRejections(projection.rejections),
      diagnostics: Object.freeze(projection.diagnostics.map(item => Object.freeze({ ...item, label: item.code === 'EXPENSE_EMAIL_MISSING' ? 'Expense Email missing' : item.message, tone: item.severity === 'INFO' ? 'info' : item.severity === 'ERROR' ? 'danger' : 'warning' }))),
      evidence_actions: Object.freeze(evidenceActions),
      primary_action: projection.primary_action && !OFFICE_FRONTEND_FORBIDDEN_ACTIONS.has(String(projection.primary_action.code || '').toUpperCase())
        && !(receivedDaily && String(projection.primary_action.code || '').toUpperCase() === 'RETRY_FINALISATION')
        ? actionView(projection.primary_action)
        : null,
      actions: Object.freeze(actions),
      observed_at: formatDateTime(projection.observed_at_utc),
      projection
    });
  }
  function presentCandidateOfficeSummary(projection) {
    const detail = presentCandidateOfficeDetail(projection, { surface: 'TIMESHEET_SUMMARY' });
    const statuses = Object.freeze(detail.status ? [detail.status] : []);
    return Object.freeze({ identity: detail.identity, status: detail.status, statuses, source_status_code: detail.source_status_code, manager: detail.manager, retained_manager: detail.retained_manager, primary_action: detail.primary_action, diagnostics: detail.diagnostics, projection });
  }
  Object.assign(window, { CloudTMSCandidateOfficePresenter: Object.freeze({ STATUS, APPROVED_CANDIDATE_SUBMISSION_STATUS, PAPER, OFFICE_FRONTEND_FORBIDDEN_ACTIONS, formatDateTime, managerStatusLabel, candidateSubmissionApplies, presentApprovedCandidateSubmissionStatus, presentCandidateOfficeSummary, presentCandidateOfficeDetail, presentCandidateManagerApproval, presentRetainedManagerApproval, presentCandidatePaperPack, presentCandidateRejections, presentOfficeExpenseClaims }) });
})();
