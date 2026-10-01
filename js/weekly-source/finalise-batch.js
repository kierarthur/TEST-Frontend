(function initialise(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window === 'object' && root === window) {
    Object.defineProperty(root, 'CloudTMSWeeklySourceFinaliseBatchV1', { value: api });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildBatch() {
  'use strict';
  const uuid = value => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(value || ''));
  const hash = value => /^[0-9a-f]{64}$/.test(String(value || ''));
  const payloadKeys = new Set(['source_cycle_id', 'authority_scope_kind', 'report_scope_id',
    'upload_id', 'projection_publication_id', 'expected_authority_scope_version',
    'expected_row_manifest_hash', 'expected_comparison_manifest_hash', 'expected_issue_set_hash']);
  const terminal = new Set(['COMPLETE', 'SOURCE_COMPLETE_PAY_PENDING']);
  const confirmedStatuses = new Set(['FINALISED', 'FINALISED_PAY_ACTION_REQUIRED',
    'FINALISED_PAY_RECOVERY_REQUIRED', 'FINALISED_PAY_PREPARATION_REQUIRED',
    'FINALISED_PAY_CHECKPOINT_REQUIRED']);

  // This is an execution journal of the user's exact review, not a new
  // finalisation authority. Each request goes through the existing server owner.
  function create(scopes, selectedKeys, acknowledgedExclusions = []) {
    if (!Array.isArray(scopes) || !Array.isArray(selectedKeys) || !selectedKeys.length
        || new Set(selectedKeys).size !== selectedKeys.length) throw new Error('Choose the reports to finalise.');
    const seen = new Set(), identities = new Set(), selected = new Set(selectedKeys);
    const acknowledgements = new Set(acknowledgedExclusions);
    const items = [];
    for (const scope of scopes) {
      if (!scope || typeof scope.key !== 'string' || seen.has(scope.key)) throw new Error('Recheck the report list.');
      seen.add(scope.key);
      if (!selected.has(scope.key)) continue;
      const payload = scope.finalise_payload;
      if (scope.finalise_enabled !== true || scope.blocked_count !== 0 || scope.stale === true
          || !payload || typeof payload !== 'object' || Array.isArray(payload)
          || Object.keys(payload).some(key => !payloadKeys.has(key))
          || !['source_cycle_id', 'upload_id', 'projection_publication_id'].every(key => uuid(payload[key]))
          || !['expected_row_manifest_hash', 'expected_comparison_manifest_hash', 'expected_issue_set_hash'].every(key => hash(payload[key]))
          || !/^[1-9]\d*$/.test(String(payload.expected_authority_scope_version))
          || !['CYCLE', 'NHSP_REPORT_SCOPE'].includes(payload.authority_scope_kind)
          || (payload.authority_scope_kind === 'NHSP_REPORT_SCOPE' ? !uuid(payload.report_scope_id) : payload.report_scope_id != null)) {
        throw new Error('A selected report is no longer ready. Recheck before finalising.');
      }
      const identity = `${payload.source_cycle_id}:${payload.report_scope_id || 'CYCLE'}`;
      if (identities.has(identity)) throw new Error('The same report scope appears more than once. Recheck first.');
      identities.add(identity);
      if (scope.exclusion_confirmation && !acknowledgements.has(scope.key)) {
        throw new Error('Confirm the non-finalised shifts to exclude for each selected report.');
      }
      const request = Object.freeze({ ...payload,
        ...(scope.exclusion_confirmation ? { exclude_unfinalised_acknowledged: true } : {}) });
      items.push({ key: scope.key, client: String(scope.client || ''), period: String(scope.period || ''),
        request, state: 'READY', result: null, error: '' });
    }
    if (items.length !== selectedKeys.length) throw new Error('A selected report is no longer in this review.');
    return { items, running: false };
  }

  async function run(batch, command, onProgress = () => {}) {
    if (!batch || batch.running || typeof command !== 'function') throw new Error('A finalisation is already running or unavailable.');
    batch.running = true;
    try {
      for (const item of batch.items) {
        if (terminal.has(item.state)) continue;
        item.state = 'RUNNING'; item.error = '';
        await onProgress(batch);
        try {
          // Serial calls preserve pool capacity. An unknown result is retried
          // only on a later explicit run, with the identical reviewed payload.
          const result = await command('FINALISE_WEEK', item.request);
          if (result?.ok !== true || result.source_finalised !== true
              || result.invoice_authority_committed !== true
              || !uuid(result.source_finalisation?.final_revision_id)
              || result.source_finalisation.source_cycle_id !== item.request.source_cycle_id
              || !confirmedStatuses.has(result.status)) {
            throw new Error('The result is not confirmed. Check this saved request before trying a new finalisation.');
          }
          item.result = result;
          item.state = result.status === 'FINALISED' ? 'COMPLETE' : 'SOURCE_COMPLETE_PAY_PENDING';
        } catch (error) {
          item.state = 'CHECK_REQUIRED';
          item.error = String(error?.message || 'The result is not confirmed. Check the saved request.');
          if ([401, 403].includes(Number(error?.status))) {
            await onProgress(batch);
            break; // Do not continue an expired or revoked Office session.
          }
        }
        await onProgress(batch);
      }
    } finally { batch.running = false; }
    return batch;
  }
  return Object.freeze({ create, run });
});
