(() => {
  'use strict';

  const CATALOGUE = Object.freeze({
    INVOICE_CORRECTION_CONTRACT_MISMATCH: ['Contract mismatch', 'The correction data no longer matches the invoice contract. Refresh the invoice before continuing.', 'red', 'ACTION'],
    INVOICE_CORRECTION_STREAM_MISMATCH: ['Invoice stream mismatch', 'The correction belongs to a different invoice stream. Review the source record.', 'red', 'ACTION'],
    INVOICE_REFERENCE_REQUIRED: ['Missing refs', 'Add the required invoice reference before continuing.', 'red', 'ACTION'],
    MISSING_REFERENCES: ['Missing refs', 'Add the required invoice references before continuing.', 'red', 'ACTION'],
    REFERENCE_REQUIRED: ['Missing refs', 'Add the required invoice reference before continuing.', 'red', 'ACTION'],
    VAT_REGISTRATION_NUMBER_REQUIRED: ['Missing VAT', 'Add the required VAT registration details before continuing.', 'red', 'ACTION'],
    MISSING_VAT_REGISTRATION: ['Missing VAT', 'Add the required VAT registration details before continuing.', 'red', 'ACTION'],
    MISSING_IMPORT_SOURCE_EVIDENCE: ['Source evidence missing', 'The authoritative NHSP or HealthRoster source evidence is missing. Restore the import lineage before issuing.', 'red', 'ACTION'],
    NOT_READY_FOR_INVOICE: ['Not ready', 'The source record is not ready for invoicing.', 'red', 'ACTION'],
    SEGMENT_ALREADY_LOCKED: ['Already locked', 'This item is already reserved by another active operation.', 'amber', 'ACTION'],
    STALE: ['Stale', 'The source changed after this document was prepared. Regenerate it before issue.', 'amber', 'DOCUMENT'],
    DOCUMENT_STALE: ['Stale', 'The document no longer matches the current source revision.', 'amber', 'DOCUMENT'],
    BATCH_SOURCE_CHANGED: ['Stale', 'The source changed since this list was loaded. Refresh and review the selection.', 'amber', 'DOCUMENT'],
    BATCH_SNAPSHOT_CHANGED: ['List changed', 'The candidate list changed. Refresh it before continuing.', 'amber', 'DOCUMENT'],
    BATCH_SNAPSHOT_EXPIRED: ['List expired', 'This list is too old to use safely. Refresh it before continuing.', 'amber', 'DOCUMENT'],
    DOCUMENT_NOT_READY: ['Not generated', 'A verified document has not been generated yet.', 'neutral', 'DOCUMENT'],
    NOT_GENERATED: ['Not generated', 'Generate the document before trying to issue it.', 'neutral', 'DOCUMENT'],
    RENDER_FAILED: ['Failed render', 'The document could not be rendered. Open details to review or retry.', 'red', 'DOCUMENT'],
    DOCUMENT_RENDER_FAILED: ['Failed render', 'The document could not be rendered. Open details to review or retry.', 'red', 'DOCUMENT'],
    VERIFICATION_FAILED: ['Verification failed', 'The generated document did not pass final verification.', 'red', 'DOCUMENT'],
    DOCUMENT_VERIFICATION_FAILED: ['Verification failed', 'The generated document did not pass final verification.', 'red', 'DOCUMENT'],
    ON_HOLD: ['On hold', 'This invoice is on hold and cannot be included in this action.', 'red', 'ACTION'],
    INVOICE_ON_HOLD: ['On hold', 'This invoice is on hold and cannot be included in this action.', 'red', 'ACTION'],
    BLOCKED_FOR_SENDING: ['Blocked for sending', 'The invoice may still be issued, but delivery will be suppressed.', 'amber', 'DELIVERY'],
    DELIVERY_BLOCKED: ['Blocked for sending', 'The invoice may still be issued, but delivery will be suppressed.', 'amber', 'DELIVERY'],
    DELIVERY_SUPPRESSED: ['Delivery suppressed', 'The invoice was issued without delivery because its delivery route was blocked.', 'amber', 'DELIVERY'],
    ISSUED_SEND_BLOCKED: ['Issued; send blocked', 'The invoice was legally issued, but delivery was suppressed.', 'amber', 'DELIVERY'],
    DELIVERY_FAILED: ['Delivery failed', 'The invoice was issued but could not be delivered.', 'red', 'DELIVERY'],
    GENERATION_FAILED: ['Generation failed', 'The invoice document could not be generated.', 'red', 'DOCUMENT'],
    ISSUE_FAILED: ['Issue failed', 'The invoice could not be legally issued.', 'red', 'ACTION'],
    IN_PROGRESS: ['In progress', 'Another operation is already working on this item.', 'blue', 'OPERATION'],
    ALREADY_ACTIVE: ['Already active', 'An equivalent operation is already active.', 'blue', 'OPERATION'],
    EARLY: ['Early', 'This item is earlier than the normal batch window.', 'neutral', 'INFORMATION'],
    CHANGED: ['Changed', 'The source changed before the operation could complete.', 'amber', 'ACTION'],
    MISSING: ['Missing', 'The selected source item could no longer be found.', 'red', 'ACTION'],
    FAILED: ['Needs attention', 'The operation failed. Open details for the available corrective action.', 'red', 'OPERATION']
  });

  function invoiceDiagnosticForCode(value) {
    const code = String(value == null ? '' : value).trim().toUpperCase();
    const entry = CATALOGUE[code];
    if (!entry) {
      return Object.freeze({
        code,
        short_label: 'Needs attention',
        long_explanation: 'Review this item before continuing.',
        tone: 'red',
        family: 'UNKNOWN'
      });
    }
    return Object.freeze({
      code,
      short_label: entry[0],
      long_explanation: entry[1],
      tone: entry[2],
      family: entry[3]
    });
  }

  Object.assign(window, {
    invoiceDiagnosticForCode,
    INVOICE_DIAGNOSTIC_CATALOGUE_V8: CATALOGUE
  });
})();
