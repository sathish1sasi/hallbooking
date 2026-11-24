// Standard working steps per task category. Offered as a one-click checklist on
// any task and as the default for recurring task templates.
export const STANDARD_STEPS: Record<string, string[]> = {
  GST: ['Collect sales & purchase data', 'Reconcile with GSTR-2B', 'Prepare return', 'Partner review', 'Client approval of tax payable', 'File return & save ARN', 'Send acknowledgement to client'],
  TDS: ['Collect payment & deduction details', 'Verify PAN of deductees', 'Prepare challan / return', 'Review', 'File & download FVU/acknowledgement', 'Issue TDS certificates'],
  'Income Tax': ['Collect Form 16 / AIS / 26AS', 'Collect investment & deduction proofs', 'Compute income', 'Partner review', 'Client approval', 'File ITR & e-verify', 'Send ITR-V to client'],
  Audit: ['Engagement letter', 'Collect trial balance & ledgers', 'Vouching & verification', 'Prepare audit report', 'Partner review', 'Sign & upload (UDIN)', 'Send report to client'],
  ROC: ['Collect board resolutions & financials', 'Prepare form', 'Director DSC signatures', 'Professional certification', 'File on MCA & pay fees', 'Save SRN challan'],
  Accounting: ['Collect bank statements & bills', 'Post entries', 'Bank reconciliation', 'Review ledgers', 'Share MIS with client'],
  Advisory: ['Understand requirement', 'Research', 'Draft opinion', 'Partner review', 'Send to client'],
  other: ['Collect information', 'Prepare', 'Review', 'Complete & inform client'],
};
export const stepsFor = (category: string) => STANDARD_STEPS[category] ?? STANDARD_STEPS.other;
