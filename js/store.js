/* Session state + every Supabase read/write. Views never call `sb` directly,
   so the query surface stays in one auditable place. */

import { sb } from './supabaseClient.js';
import { todayISO } from './util.js';
import { buildLedger } from './ledger.js';

export const state = {
  user: null,        // Supabase auth user
  profile: null,     // { id, role, display_name }
  activeTab: null,
  asOf: todayISO(),  // dashboard "show totals as of" date
  editing: { bill: null, payment: null, pocket: null },
  filters: { search: '', from: '', to: '', uploader: '', status: '' },
  names: {},         // uuid -> display name
  cache: null,       // last built ledger, so tabs can render without refetching
};

export const isPayer = () => state.profile?.role === 'payer';

/* -------------------------------------------------------------- profile --- */

export async function loadProfile(userId) {
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}

export async function loadNames() {
  const { data } = await sb.from('profiles').select('id, display_name');
  state.names = Object.fromEntries((data || []).map(p => [p.id, p.display_name]));
  return state.names;
}

export function nameOf(id) {
  return state.names[id] || 'Someone';
}

/** The other person's first name - used in copy like "Paid to Rahul". */
export function counterpartName() {
  const other = Object.entries(state.names).find(([id]) => id !== state.user?.id);
  return other ? other[1] : (isPayer() ? 'your brother' : 'the payer');
}

/* ---------------------------------------------------------------- reads --- */

/**
 * One round-trip for everything the ledger needs. RLS already scopes each
 * table: the payer sees all bills, the uploader sees only their own, and both
 * can read payments and pocket money - so the same call is correct for both
 * roles without any role branching here.
 */
export async function fetchLedger({ asOf = state.asOf } = {}) {
  const [bills, settlements, pocketMoney] = await Promise.all([
    sb.from('reimbursements').select('*'),
    sb.from('settlements').select('*'),
    sb.from('pocket_money').select('*'),
  ]);

  const failure = [bills, settlements, pocketMoney].find(r => r.error);
  if (failure) throw failure.error;

  state.cache = buildLedger({
    bills: bills.data || [],
    settlements: settlements.data || [],
    pocketMoney: pocketMoney.data || [],
    asOf,
  });
  return state.cache;
}

export async function fetchAuditLog(limit = 200) {
  const { data, error } = await sb.from('audit_log').select('*')
    .order('changed_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

/** Short-lived signed URLs for receipt photos, keyed by storage path. */
export async function signReceipts(paths) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  const entries = await Promise.all(unique.map(async (path) => {
    const { data } = await sb.storage.from('receipts').createSignedUrl(path, 3600);
    return [path, data ? data.signedUrl : null];
  }));
  return Object.fromEntries(entries.filter(([, url]) => url));
}

/* --------------------------------------------------------------- writes --- */

export async function uploadReceipt(file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${state.user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from('receipts').upload(path, file);
  if (error) throw error;
  return path;
}

export async function addBill({ amount, description, date, imagePath }) {
  const { error } = await sb.from('reimbursements').insert({
    amount, description, date, image_path: imagePath, uploaded_by: state.user.id,
  });
  if (error) throw error;
}

export const updateBill = (id, patch) => mutate('reimbursements', 'update', id, patch);
export const deleteBill = (id) => mutate('reimbursements', 'delete', id);

export async function addPayment({ amount, date, note }) {
  const { error } = await sb.from('settlements')
    .insert({ amount, date, note, created_by: state.user.id });
  if (error) throw error;
}

export const updatePayment = (id, patch) => mutate('settlements', 'update', id, patch);
export const deletePayment = (id) => mutate('settlements', 'delete', id);

export async function addPocketMoney({ amount, date, note }) {
  const { error } = await sb.from('pocket_money')
    .insert({ amount, date, note, created_by: state.user.id });
  if (error) throw error;
}

export const updatePocketMoney = (id, patch) => mutate('pocket_money', 'update', id, patch);
export const deletePocketMoney = (id) => mutate('pocket_money', 'delete', id);

async function mutate(table, op, id, patch) {
  const query = op === 'delete'
    ? sb.from(table).delete().eq('id', id)
    : sb.from(table).update(patch).eq('id', id);
  const { error } = await query;
  if (error) throw error;
}
