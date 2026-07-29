import { reorderOtpAccounts } from './totp.js';

export const PENDING_MUTATIONS_VERSION = 1;
export const MAX_PENDING_MUTATIONS = 5000;

export function coalescePendingMutations(existing, incoming) {
  let operations = [...existing];
  for (const operation of incoming) {
    if (operation.kind === 'replace-vault') {
      operations = [{ kind: 'replace-vault' }];
      continue;
    }
    if (operations.some(item => item.kind === 'replace-vault')) continue;
    if (['credential-upsert', 'credential-delete', 'otp-upsert', 'otp-delete'].includes(operation.kind)) {
      const entity = operation.kind.startsWith('credential-') ? 'credential-' : 'otp-';
      operations = operations.filter(item => !(
        item.id === operation.id
        && item.kind.startsWith(entity)
      ));
    } else if (operation.kind === 'otp-reorder') {
      operations = operations.filter(item => item.kind !== 'otp-reorder');
    }
    operations.push(operation);
  }
  return operations.length > MAX_PENDING_MUTATIONS
    ? [{ kind: 'replace-vault' }]
    : operations;
}

export function replayPendingMutations(driveVault, localVault, operations) {
  if (operations.some(operation => operation.kind === 'replace-vault')) {
    return structuredClone(localVault);
  }

  const merged = structuredClone(driveVault);
  merged.credentials = Array.isArray(merged.credentials) ? merged.credentials : [];
  merged.otpAccounts = Array.isArray(merged.otpAccounts) ? merged.otpAccounts : [];
  const localCredentials = new Map(
    (Array.isArray(localVault.credentials) ? localVault.credentials : [])
      .map(item => [item.id, item])
  );
  const localOtpAccounts = new Map(
    (Array.isArray(localVault.otpAccounts) ? localVault.otpAccounts : [])
      .map(item => [item.id, item])
  );

  for (const operation of operations) {
    if (operation.kind === 'credential-upsert') {
      const source = localCredentials.get(operation.id);
      if (!source) continue;
      const index = merged.credentials.findIndex(item => item.id === operation.id);
      if (index >= 0) merged.credentials[index] = structuredClone(source);
      else merged.credentials.push(structuredClone(source));
    } else if (operation.kind === 'credential-delete') {
      merged.credentials = merged.credentials.filter(item => item.id !== operation.id);
    } else if (operation.kind === 'otp-upsert') {
      const source = localOtpAccounts.get(operation.id);
      if (!source) continue;
      const index = merged.otpAccounts.findIndex(item => item.id === operation.id);
      if (index >= 0) merged.otpAccounts[index] = structuredClone(source);
      else merged.otpAccounts.push(structuredClone(source));
    } else if (operation.kind === 'otp-delete') {
      merged.otpAccounts = merged.otpAccounts.filter(item => item.id !== operation.id);
    } else if (operation.kind === 'otp-reorder' && Array.isArray(operation.ids)) {
      merged.otpAccounts = reorderOtpAccounts(merged.otpAccounts, operation.ids);
    }
  }
  return merged;
}
