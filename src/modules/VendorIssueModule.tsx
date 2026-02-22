
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import bus from '../utils/eventBus';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import {
  subscribeVendorIssues, addVendorIssue, updateVendorIssue, deleteVendorIssue,
  subscribeVendorDepts, getItemMaster, subscribeVSIRRecords, subscribePurchaseOrders,
} from '../utils/firestoreServices';
import { subscribePsirs } from '../utils/psirService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VendorIssueItem {
  itemName: string; itemCode: string; qty: number;
  indentBy: string; inStock: number; indentClosed: boolean;
}

interface VendorIssue {
  id?: string; date: string; materialPurchasePoNo: string; oaNo: string;
  batchNo: string; vendorBatchNo: string; dcNo: string; issueNo: string;
  vendorName: string; items: VendorIssueItem[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INDENT_BY_OPTIONS = ['HKG', 'NGR', 'MDD'];

const BLANK_ITEM: VendorIssueItem = { itemName: '', itemCode: '', qty: 0, indentBy: '', inStock: 0, indentClosed: false };

const BLANK_ISSUE = (issues: VendorIssue[]): VendorIssue => ({
  date: '', materialPurchasePoNo: '', oaNo: '', batchNo: '', vendorBatchNo: '',
  dcNo: '', issueNo: getNextIssueNo(issues), vendorName: '', items: [],
});

// ─── Serial generators ────────────────────────────────────────────────────────

function getNextIssueNo(issues: VendorIssue[]): string {
  if (!issues.length) return 'ISS-01';
  const max = Math.max(...issues.map(i => { const m = i.issueNo?.match(/ISS-(\d+)/); return m ? parseInt(m[1], 10) : 0; }));
  return `ISS-${String(max + 1).padStart(2, '0')}`;
}

function getNextDCNo(issues: VendorIssue[]): string {
  const prefix = 'Vendor/';
  const max = Math.max(0, ...issues.map(i => { if (!i.dcNo?.startsWith(prefix)) return 0; const n = parseInt(i.dcNo.replace(prefix, '')); return isNaN(n) ? 0 : n; }));
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function deduplicate(arr: VendorIssue[]): VendorIssue[] {
  const seen = new Set<string>();
  return arr.filter(issue => {
    const firstItem = issue.items?.[0];
    const key = `${String(issue.materialPurchasePoNo || '').trim().toLowerCase()}|${issue.date}|${firstItem?.itemCode || firstItem?.itemName || ''}`;
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

// ─── Global CSS ───────────────────────────────────────────────────────────────

const GLOBAL_STYLES = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=JetBrains+Mono:wght@400;500&display=swap');

.vim { font-family:'DM Sans',system-ui,sans-serif; color:#111827; background:#f4f5f9; }
.vim * { box-sizing:border-box; font-family:inherit; }
.vim-inner { max-width:1480px; margin:0 auto; padding:24px 28px; }

.vim-input {
  padding:8px 12px; border-radius:8px; border:1.5px solid #e2e4ea;
  font-size:13.5px; width:100%; transition:border-color 0.15s,box-shadow 0.15s;
  background:#fff; color:#111; line-height:1.5;
}
.vim-input:focus { outline:none; border-color:#1a237e; box-shadow:0 0 0 3px rgba(26,35,126,0.1); }
.vim-input-ro { background:#f7f8fb !important; color:#8b95a1 !important; cursor:default; }
.vim-input-accent { border-color:#1a237e !important; font-weight:500; }
.vim-select {
  -webkit-appearance:none; appearance:none;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%238b95a1' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-position:right 10px center; padding-right:34px;
}
.vim-checkbox { display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; font-weight:500; color:#374151; user-select:none; }
.vim-checkbox input[type=checkbox] { width:16px; height:16px; accent-color:#1a237e; cursor:pointer; }

.vim-btn {
  display:inline-flex; align-items:center; justify-content:center; gap:6px;
  padding:9px 18px; border-radius:8px; border:none; cursor:pointer;
  font-size:13px; font-weight:600; transition:all 0.15s; white-space:nowrap;
}
.vim-btn:active { transform:scale(0.97); }
.vim-btn-sm  { padding:7px 14px; font-size:12.5px; border-radius:7px; }
.vim-btn-xs  { padding:4px 9px; font-size:11.5px; border-radius:6px; }
.vim-btn-primary { background:#1a237e; color:#fff; }
.vim-btn-primary:hover { background:#283593; }
.vim-btn-success { background:#16a34a; color:#fff; }
.vim-btn-success:hover { background:#15803d; }
.vim-btn-danger  { background:#ef4444; color:#fff; }
.vim-btn-danger:hover  { background:#dc2626; }
.vim-btn-warning { background:#d97706; color:#fff; }
.vim-btn-warning:hover { background:#b45309; }
.vim-btn-ghost { background:#fff; color:#374151; border:1.5px solid #e2e4ea; }
.vim-btn-ghost:hover { background:#f7f8fb; border-color:#c9cdd8; }
.vim-btn-indigo { background:#4f46e5; color:#fff; }
.vim-btn-indigo:hover { background:#4338ca; }

.vim-card { background:#fff; border-radius:12px; border:1px solid #e2e4ea; box-shadow:0 1px 4px rgba(0,0,0,0.05); overflow:hidden; }
.vim-card-edit { border:2px solid #1a237e !important; box-shadow:0 0 0 4px rgba(26,35,126,0.07),0 4px 20px rgba(0,0,0,0.08) !important; }

.vim-lbl { font-size:11px; font-weight:700; color:#8b95a1; text-transform:uppercase; letter-spacing:0.07em; margin-bottom:5px; display:block; }
.vim-sec { font-size:10.5px; font-weight:800; color:#a5b0be; text-transform:uppercase; letter-spacing:0.1em; display:flex; align-items:center; gap:10px; padding:4px 0 12px; }
.vim-sec::after { content:''; flex:1; height:1px; background:#edf0f5; }

.vim-stats { display:flex; align-items:center; }
.vim-stat { text-align:center; padding:4px 28px; }
.vim-stat:first-child { padding-left:6px; }
.vim-stat-val { font-size:30px; font-weight:700; line-height:1; letter-spacing:-0.02em; }
.vim-stat-lbl { font-size:10.5px; font-weight:600; color:#9ca3af; text-transform:uppercase; letter-spacing:0.07em; margin-top:5px; }
.vim-divider-v { width:1px; background:#e2e4ea; height:46px; flex-shrink:0; }
.vim-divider-sm { width:1px; height:26px; background:#e2e4ea; }

.vim-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.vim-rowcount { background:#eef2ff; color:#3730a3; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600; }

.vim-fpanel {
  background:#eef2ff; border:1px solid #c7d2fe; border-radius:10px;
  padding:16px 20px; display:flex; align-items:flex-end; gap:14px; flex-wrap:wrap;
  animation:vimFadeDown 0.18s cubic-bezier(.34,1.56,.64,1);
}
@keyframes vimFadeDown { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }

.vim-chip { display:inline-flex; align-items:center; gap:4px; background:#e0e7ff; color:#3730a3; border-radius:20px; padding:4px 11px; font-size:11.5px; font-weight:600; }
.vim-chip-x { cursor:pointer; opacity:0.5; font-size:14px; line-height:1; margin-left:1px; }
.vim-chip-x:hover { opacity:1; }

.vim-pobar { display:flex; align-items:center; gap:12px; flex-wrap:wrap; background:#eef2ff; border:1px solid #c7d2fe; border-radius:10px; padding:14px 18px; margin-bottom:18px; }
.vim-pobar-meta { font-size:12px; color:#6b7280; display:flex; align-items:center; gap:4px; }
.vim-pobar-meta strong { color:#111; font-weight:600; }

.vim-itable { width:100%; border-collapse:collapse; font-size:12.5px; }
.vim-itable th { padding:8px 10px; background:#f4f5f9; color:#5b6474; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; border-bottom:1px solid #e2e4ea; text-align:left; }
.vim-itable th.r { text-align:right; }
.vim-itable td { padding:9px 10px; border-bottom:1px solid #f0f1f5; vertical-align:middle; }
.vim-itable td.r { text-align:right; font-variant-numeric:tabular-nums; }
.vim-itable tr:last-child td { border-bottom:none; }
.vim-itable tr:hover td { background:#f9faff; }

.vim-table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:12.5px; }
.vim-table th { padding:11px 10px; font-size:10.5px; font-weight:700; color:#1a237e; text-transform:uppercase; letter-spacing:0.05em; background:#eef2ff; border-bottom:2px solid #c7d2fe; text-align:left; white-space:nowrap; }
.vim-table th.r { text-align:right; }
.vim-table th.div-l { border-left:2px solid #c7d2fe; }
.vim-table td { padding:10px 10px; border-bottom:1px solid #f0f1f5; vertical-align:middle; }
.vim-table td.r { text-align:right; font-variant-numeric:tabular-nums; }
.vim-table td.div-l { border-left:2px solid #eef2ff; }
.vim-table tr:nth-child(even) td { background:#fafbff; }
.vim-table tr:hover td { background:#f5f7ff !important; transition:background 0.1s; }

.ellipsis { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:block; }
.mono { font-family:'JetBrains Mono',monospace; font-size:11.5px; }

.badge { display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; white-space:nowrap; }
.badge-closed { background:#dcfce7; color:#16a34a; }
.badge-open   { background:#fee2e2; color:#ef4444; }
.badge-hkg    { background:#e0e7ff; color:#3730a3; }
.badge-ngr    { background:#fef3c7; color:#b45309; }
.badge-mdd    { background:#f0fdf4; color:#15803d; }
.badge-other  { background:#f3f4f6; color:#6b7280; }

.vim-empty { padding:52px; text-align:center; color:#9ca3af; }
.vim-empty-icon { font-size:36px; margin-bottom:12px; opacity:0.45; }

.vim-toasts { position:fixed; top:22px; right:22px; z-index:9999; display:flex; flex-direction:column; gap:8px; pointer-events:none; }
.vim-toast { padding:12px 18px; border-radius:10px; font-size:13px; font-weight:500; max-width:360px; box-shadow:0 4px 20px rgba(0,0,0,0.12); pointer-events:all; animation:toastPop 0.24s cubic-bezier(0.34,1.56,0.64,1) both; }
@keyframes toastPop { from{opacity:0;transform:translateX(18px)} to{opacity:1;transform:translateX(0)} }
.toast-s { background:#dcfce7; color:#16a34a; border:1px solid #bbf7d0; }
.toast-e { background:#fee2e2; color:#ef4444; border:1px solid #fecaca; }
.toast-i { background:#eef2ff; color:#3730a3; border:1px solid #c7d2fe; }

input[type=number]::-webkit-inner-spin-button,
input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
input[type=number] { -moz-appearance:textfield; }
::-webkit-scrollbar { width:5px; height:5px; }
::-webkit-scrollbar-track { background:#f0f1f5; }
::-webkit-scrollbar-thumb { background:#c7d2fe; border-radius:3px; }
`;

// ─── Toast hook ───────────────────────────────────────────────────────────────

let _tid = 0;
interface Toast { id: number; msg: string; type: 's' | 'e' | 'i' }
const useToast = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((msg: string, type: Toast['type'] = 'i') => {
    const id = ++_tid;
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200);
  }, []);
  return { toasts, show };
};

// ─── CSV export ───────────────────────────────────────────────────────────────

const exportCSV = (rows: Array<VendorIssue & { _item: VendorIssueItem }>) => {
  const H = ['#','Date','Issue No','DC No','PO No','OA No','Batch No','Vendor Batch No',
    'Vendor Name','Item Name','Item Code','Qty','Indent By','In Stock','Indent Closed'];
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [H.map(esc).join(',')];
  rows.forEach((r, i) => lines.push([
    i + 1, r.date, r.issueNo, r.dcNo, r.materialPurchasePoNo, r.oaNo,
    r.batchNo, r.vendorBatchNo, r.vendorName,
    r._item.itemName, r._item.itemCode, r._item.qty,
    r._item.indentBy, r._item.inStock, r._item.indentClosed ? 'Yes' : 'No',
  ].map(esc).join(',')));
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `vendor-issues-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(url);
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const Field: React.FC<{ label: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ label, children, style }) => (
  <div style={style}>
    <span className="vim-lbl">{label}</span>
    {children}
  </div>
);

const IndentByBadge: React.FC<{ val: string }> = ({ val }) => {
  const cls = val === 'HKG' ? 'badge-hkg' : val === 'NGR' ? 'badge-ngr' : val === 'MDD' ? 'badge-mdd' : 'badge-other';
  return <span className={`badge ${cls}`}>{val || '—'}</span>;
};

const ClosedBadge: React.FC<{ closed: boolean }> = ({ closed }) => (
  <span className={`badge ${closed ? 'badge-closed' : 'badge-open'}`}>{closed ? 'Closed' : 'Open'}</span>
);

const NumInput: React.FC<{ value: number; onChange: (n: number) => void; placeholder?: string; style?: React.CSSProperties }> = ({ value, onChange, placeholder, style }) => (
  <input type="number" className="vim-input" min={0}
    style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right', ...style }}
    value={value || ''} placeholder={placeholder || '0'}
    onChange={e => onChange(Math.max(0, Number(e.target.value)))} />
);

// ─── Main component ───────────────────────────────────────────────────────────

const VendorIssueModule: React.FC = () => {
  const { toasts, show: toast } = useToast();

  // Inject styles once
  useEffect(() => {
    if (document.getElementById('vim-css')) return;
    const el = document.createElement('style'); el.id = 'vim-css'; el.textContent = GLOBAL_STYLES;
    document.head.appendChild(el);
  }, []);

  // ── State ──────────────────────────────────────────────────────────────────
  const [userUid, setUserUid] = useState<string | null>(null);
  const [issues, setIssues] = useState<VendorIssue[]>([]);
  const [psirData, setPsirData] = useState<any[]>([]);
  const [vendorDeptOrders, setVendorDeptOrders] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [vsirRecords, setVsirRecords] = useState<any[]>([]);
  const [itemNames, setItemNames] = useState<string[]>([]);
  const [itemMaster, setItemMaster] = useState<{ itemName: string; itemCode: string }[]>([]);

  const [newIssue, setNewIssue] = useState<VendorIssue>(() => BLANK_ISSUE([]));
  const [itemInput, setItemInput] = useState<VendorIssueItem>({ ...BLANK_ITEM });
  const [editIssueIdx, setEditIssueIdx] = useState<number | null>(null);
  const [editItemIdx, setEditItemIdx] = useState<number | null>(null);

  // Filter state
  const [filterOpen, setFilterOpen] = useState(false);
  const [fSearch, setFSearch] = useState('');
  const [fIndentBy, setFIndentBy] = useState('');
  const [fClosed, setFClosed] = useState('');
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');

  const editRef = useRef<HTMLDivElement>(null);

  // ── Auth ────────────────────────────────────────────────────────────────
  useEffect(() => onAuthStateChanged(auth, u => setUserUid(u?.uid ?? null)), []);

  // ── Subscriptions ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userUid) return;
    const unsubs: (() => void)[] = [];
    try { unsubs.push(subscribeVendorIssues(userUid, docs => setIssues(deduplicate(docs.map(d => ({ ...d, items: Array.isArray(d.items) ? d.items : [] })) as VendorIssue[])))); } catch {}
    try { unsubs.push(subscribeVendorDepts(userUid, docs => setVendorDeptOrders(docs))); } catch {}
    try { unsubs.push(subscribeVSIRRecords(userUid, docs => setVsirRecords(docs))); } catch {}
    try { unsubs.push(subscribePurchaseOrders(userUid, docs => setPurchaseOrders(docs || []))); } catch {}
    try { unsubs.push(subscribePsirs(userUid, docs => setPsirData(docs || []))); } catch {}
    getItemMaster(userUid).then((im: any) => {
      if (Array.isArray(im) && im.length) {
        setItemMaster(im); setItemNames(im.map((it: any) => it.itemName).filter(Boolean));
      }
    }).catch(() => {});
    return () => unsubs.forEach(u => { try { u(); } catch {} });
  }, [userUid]);

  // ── Listen for vendorDept updates ────────────────────────────────────────
  useEffect(() => {
    const fn = () => {};
    bus.addEventListener('vendorDept.updated', fn as EventListener);
    return () => bus.removeEventListener('vendorDept.updated', fn as EventListener);
  }, []);

  // ── Pure lookup helpers ──────────────────────────────────────────────────
  const getVendorBatchFromVSIR = useCallback((poNo: string): string => {
    if (!poNo) return '';
    const t = String(poNo).trim();
    return vsirRecords.find((r: any) => String(r.poNo || '').trim() === t && r.vendorBatchNo?.trim())?.vendorBatchNo || '';
  }, [vsirRecords]);

  const getBatchFromPSIR = useCallback((poNo: string): string => {
    if (!poNo) return '';
    return psirData.find((p: any) => String(p.poNo || '').trim() === String(poNo).trim())?.batchNo || '';
  }, [psirData]);

  const getOaFromPSIR = useCallback((poNo: string): string => {
    if (!poNo) return '';
    return psirData.find((p: any) => String(p.poNo || '').trim() === String(poNo).trim())?.oaNo || '';
  }, [psirData]);

  const getDeptOrder = useCallback((poNo: string) =>
    vendorDeptOrders.find(o => o.materialPurchasePoNo === poNo) || null,
  [vendorDeptOrders]);

  const resolveIssueFields = useCallback((poNo: string, existing?: Partial<VendorIssue>) => {
    const dept = getDeptOrder(poNo);
    const oaNo = existing?.oaNo || dept?.oaNo || getOaFromPSIR(poNo);
    const batchNo = existing?.batchNo || dept?.batchNo || getBatchFromPSIR(poNo);
    const vendorBatchNo = existing?.vendorBatchNo || dept?.vendorBatchNo || getVendorBatchFromVSIR(poNo);
    const vendorName = existing?.vendorName || dept?.vendorName || '';
    const dcNo = existing?.dcNo || (dept?.dcNo?.trim() ? dept.dcNo : '');
    return { oaNo, batchNo, vendorBatchNo, vendorName, dcNo };
  }, [getDeptOrder, getOaFromPSIR, getBatchFromPSIR, getVendorBatchFromVSIR]);

  // ── Auto-fill newIssue fields when PO changes ────────────────────────────
  // NOTE: This only fills header fields (OA, Batch, Vendor etc.) — it does NOT
  // create or save any issue. Issue is only created when user clicks "+ Add Issue".
  useEffect(() => {
    const poNo = newIssue.materialPurchasePoNo;
    if (!poNo) return;
    const fields = resolveIssueFields(poNo, newIssue);
    setNewIssue(prev => ({
      ...prev,
      oaNo: fields.oaNo || prev.oaNo,
      batchNo: fields.batchNo || prev.batchNo,
      vendorBatchNo: fields.vendorBatchNo || prev.vendorBatchNo,
      vendorName: fields.vendorName || prev.vendorName,
      dcNo: fields.dcNo || prev.dcNo,
    }));
  }, [newIssue.materialPurchasePoNo, vendorDeptOrders, psirData, vsirRecords]); // eslint-disable-line

  // ── Auto-populate items from vendorDeptOrders when PO first selected ─────
  // NOTE: Only populates the item list in the form. No issue is created/saved.
  useEffect(() => {
    const poNo = newIssue.materialPurchasePoNo;
    if (!poNo || newIssue.items.length > 0) return;
    const dept = getDeptOrder(poNo);
    if (!dept?.items?.length) return;
    const items = dept.items.map((it: any) => ({
      itemName: it.itemName || '', itemCode: it.itemCode || '',
      qty: typeof it.plannedQty === 'number' ? it.plannedQty : (it.qty || 0),
      indentBy: it.indentBy || '', inStock: 0, indentClosed: false,
    }));
    setNewIssue(prev => ({ ...prev, items, date: prev.date || new Date().toISOString().slice(0, 10) }));
  }, [newIssue.materialPurchasePoNo, newIssue.items.length, getDeptOrder]);

  // ── Sync empty fields into EXISTING issues (patch only, never creates) ────
  // This runs when lookup data loads and fills in missing batchNo, oaNo,
  // vendorName, vendorBatchNo, and zero-qty items on records already in Firestore.
  useEffect(() => {
    if (!issues.length || (!vendorDeptOrders.length && !psirData.length)) return;
    let changed = false;
    const updated = issues.map(issue => {
      const dept = getDeptOrder(issue.materialPurchasePoNo);
      const fields = resolveIssueFields(issue.materialPurchasePoNo, issue);
      const newItems = issue.items.map(item => {
        if (item.qty > 0) return item;
        let qty = 0;
        if (dept?.items) {
          const di = dept.items.find((d: any) =>
            String(d.itemCode || '').trim() === String(item.itemCode || '').trim() ||
            String(d.itemName || '').trim() === String(item.itemName || '').trim()
          );
          if (di) qty = (typeof di.plannedQty === 'number' && di.plannedQty > 0) ? di.plannedQty : Number(di.qty || 0);
        }
        if (!qty) {
          const po = purchaseOrders.find((p: any) =>
            String(p.poNo || '').trim() === String(issue.materialPurchasePoNo || '').trim() &&
            (String(p.itemCode || '').trim() === String(item.itemCode || '').trim() ||
             String(p.itemName || p.model || '').trim() === String(item.itemName || '').trim())
          );
          if (po) qty = Number(po.plannedQty || po.purchaseQty || po.originalIndentQty || po.poQty || po.qty || 0);
        }
        if (qty > 0) { changed = true; return { ...item, qty }; }
        return item;
      });

      const needsUpdate =
        (!issue.vendorName && fields.vendorName) ||
        (!issue.batchNo && fields.batchNo) ||
        (!issue.oaNo && fields.oaNo) ||
        (!issue.vendorBatchNo && fields.vendorBatchNo) ||
        newItems !== issue.items;

      if (needsUpdate) { changed = true; return { ...issue, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v)), items: newItems }; }
      return issue;
    });

    if (!changed) return;
    const deduped = deduplicate(updated);
    setIssues(deduped);
    if (userUid) {
      Promise.all(deduped.map(iss => iss.id ? updateVendorIssue(userUid, iss.id, iss) : addVendorIssue(userUid, iss))).catch(() => {});
    }
  }, [vendorDeptOrders, psirData, vsirRecords, purchaseOrders]); // eslint-disable-line

  // ── Memos ────────────────────────────────────────────────────────────────
  const availablePOs = useMemo(() =>
    [...new Set(vendorDeptOrders.map(o => o.materialPurchasePoNo).filter(Boolean))],
  [vendorDeptOrders]);

  type FlatRow = VendorIssue & { _item: VendorIssueItem; _issueIdx: number; _itemIdx: number };

  const flatRows = useMemo((): FlatRow[] => {
    const rows: FlatRow[] = [];
    issues.forEach((issue, ii) => {
      if (!issue.items?.length) {
        rows.push({ ...issue, _item: { ...BLANK_ITEM }, _issueIdx: ii, _itemIdx: -1 });
      } else {
        issue.items.forEach((item, ji) => rows.push({ ...issue, _item: item, _issueIdx: ii, _itemIdx: ji }));
      }
    });
    return rows;
  }, [issues]);

  const filtered = useMemo(() => {
    let rows = flatRows;
    if (fSearch.trim()) {
      const t = fSearch.trim().toUpperCase();
      rows = rows.filter(r => [r.materialPurchasePoNo, r.vendorName, r._item.itemName, r._item.itemCode, r.issueNo, r.dcNo, r.oaNo].some(v => String(v || '').toUpperCase().includes(t)));
    }
    if (fIndentBy) rows = rows.filter(r => r._item.indentBy === fIndentBy);
    if (fClosed === 'closed') rows = rows.filter(r => r._item.indentClosed);
    if (fClosed === 'open') rows = rows.filter(r => !r._item.indentClosed);
    if (fFrom) rows = rows.filter(r => r.date >= fFrom);
    if (fTo) rows = rows.filter(r => r.date <= fTo);
    return rows;
  }, [flatRows, fSearch, fIndentBy, fClosed, fFrom, fTo]);

  const activeFilters = [fSearch, fIndentBy, fClosed, fFrom, fTo].filter(Boolean).length;

  const stats = useMemo(() => ({
    total: issues.length,
    items: issues.reduce((s, i) => s + i.items.length, 0),
    closed: flatRows.filter(r => r._item.indentClosed).length,
    open: flatRows.filter(r => !r._item.indentClosed && r._itemIdx !== -1).length,
    totalQty: flatRows.reduce((s, r) => s + (r._item.qty || 0), 0),
  }), [issues, flatRows]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const clearForm = useCallback(() => {
    setNewIssue(BLANK_ISSUE(issues)); setItemInput({ ...BLANK_ITEM });
    setEditIssueIdx(null); setEditItemIdx(null);
  }, [issues]);

  const handleSaveItem = useCallback(() => {
    if (!itemInput.itemName || !itemInput.itemCode || !itemInput.indentBy || itemInput.qty <= 0) {
      toast('Fill Item Name, Code, Indent By and Qty (> 0)', 'e'); return;
    }
    if (editItemIdx !== null) {
      setNewIssue(p => ({ ...p, items: p.items.map((it, i) => i === editItemIdx ? { ...itemInput } : it) }));
      setEditItemIdx(null);
    } else {
      setNewIssue(p => ({ ...p, items: [...p.items, { ...itemInput }] }));
    }
    setItemInput({ ...BLANK_ITEM });
  }, [itemInput, editItemIdx, toast]);

  // ── MANUAL SAVE ONLY ─────────────────────────────────────────────────────
  // Issues are ONLY written to Firestore here, when the user explicitly clicks
  // "+ Add Issue". No useEffect auto-creates issues anymore.
  const handleAddIssue = useCallback(async () => {
    if (!newIssue.date || !newIssue.materialPurchasePoNo || !newIssue.items.length) {
      toast('Fill Date, PO No and add at least one item', 'e'); return;
    }
    const dept = getDeptOrder(newIssue.materialPurchasePoNo);
    const dcNo = dept?.dcNo?.trim() ? dept.dcNo : getNextDCNo(issues);
    const toSave = { ...newIssue, dcNo, issueNo: getNextIssueNo(issues) };
    const combined = deduplicate([...issues, toSave]);
    setIssues(combined);
    const last = combined[combined.length - 1];
    if (userUid && last && !last.id) {
      try { await addVendorIssue(userUid, last); }
      catch { toast('Saved locally — cloud sync failed', 'i'); }
    }
    toast('Issue saved ✓', 's');
    clearForm();
  }, [newIssue, issues, getDeptOrder, userUid, clearForm, toast]);

  const handleUpdateIssue = useCallback(async () => {
    if (editIssueIdx === null || !userUid || !issues[editIssueIdx]?.id) { toast('Cannot update: missing data', 'e'); return; }
    const dept = getDeptOrder(newIssue.materialPurchasePoNo);
    const dcNo = dept?.dcNo?.trim() ? dept.dcNo : issues[editIssueIdx].dcNo;
    const toSave = { ...newIssue, dcNo };
    const updated = deduplicate(issues.map((iss, i) => i === editIssueIdx ? toSave : iss));
    setIssues(updated);
    try { await updateVendorIssue(userUid, issues[editIssueIdx].id!, toSave); toast('Issue updated ✓', 's'); }
    catch { toast('Update failed — please retry', 'e'); }
    clearForm();
  }, [editIssueIdx, userUid, issues, newIssue, getDeptOrder, clearForm, toast]);

  const handleDeleteIssue = useCallback(async (idx: number) => {
    if (!window.confirm('Delete this issue?')) return;
    const issue = issues[idx];
    try {
      if (userUid && issue.id) await deleteVendorIssue(userUid, issue.id);
      setIssues(prev => prev.filter((_, i) => i !== idx));
      toast('Issue deleted', 's');
    } catch { toast('Delete failed', 'e'); }
  }, [issues, userUid, toast]);

  const handleDeleteItem = useCallback(async (issueIdx: number, itemIdx: number) => {
    if (!window.confirm('Delete this item?')) return;
    const updated = issues.map((iss, i) => i === issueIdx
      ? { ...iss, items: iss.items.filter((_, j) => j !== itemIdx) } : iss
    ).filter(iss => iss.items.length > 0 || !iss.id);
    setIssues(updated);
    const issue = issues[issueIdx];
    if (userUid && issue.id) {
      try {
        const upd = { ...issue, items: issue.items.filter((_, j) => j !== itemIdx) };
        if (!upd.items.length) await deleteVendorIssue(userUid, issue.id);
        else await updateVendorIssue(userUid, issue.id, upd);
        toast('Item deleted', 's');
      } catch { toast('Delete failed', 'e'); }
    }
  }, [issues, userUid, toast]);

  const handleEditIssue = useCallback((idx: number) => {
    setNewIssue({ ...issues[idx] }); setItemInput({ ...BLANK_ITEM });
    setEditIssueIdx(idx); setEditItemIdx(null);
    setTimeout(() => editRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, [issues]);

  const clearFilters = () => { setFSearch(''); setFIndentBy(''); setFClosed(''); setFFrom(''); setFTo(''); };
  const isEditing = editIssueIdx !== null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="vim">
      {/* Toasts */}
      <div className="vim-toasts">
        {toasts.map(t => <div key={t.id} className={`vim-toast toast-${t.type}`}>{t.msg}</div>)}
      </div>

      <div className="vim-inner">

        {/* ── Page header + unified toolbar ──────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, color: '#1a237e', letterSpacing: '-0.02em' }}>Vendor Issues</h1>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#9ca3af', fontWeight: 500 }}>Material issue tracking &amp; indent management</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <div className="vim-toolbar">
              <button
                className={`vim-btn vim-btn-sm ${activeFilters > 0 ? 'vim-btn-indigo' : 'vim-btn-ghost'}`}
                style={{ position: 'relative' }}
                onClick={() => setFilterOpen(p => !p)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></svg>
                {activeFilters > 0 ? `Filters (${activeFilters})` : 'Filters'}
                {activeFilters > 0 && (
                  <span style={{ position: 'absolute', top: -7, right: -7, background: '#ef4444', color: '#fff', borderRadius: '50%', width: 17, height: 17, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{activeFilters}</span>
                )}
              </button>

              <div className="vim-divider-sm" />
              <span className="vim-rowcount">{filtered.length === flatRows.length ? `${flatRows.length} rows` : `${filtered.length} / ${flatRows.length} rows`}</span>
              <div className="vim-divider-sm" />

              <button className="vim-btn vim-btn-sm vim-btn-success" onClick={() => exportCSV(filtered as any)} title={`Export ${filtered.length} rows as CSV`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                Export CSV
              </button>
            </div>

            {activeFilters > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                {fSearch && <span className="vim-chip">🔍 "{fSearch}" <span className="vim-chip-x" onClick={() => setFSearch('')}>×</span></span>}
                {fIndentBy && <span className="vim-chip">By: {fIndentBy} <span className="vim-chip-x" onClick={() => setFIndentBy('')}>×</span></span>}
                {fClosed && <span className="vim-chip">{fClosed === 'closed' ? 'Closed' : 'Open'} <span className="vim-chip-x" onClick={() => setFClosed('')}>×</span></span>}
                {fFrom && <span className="vim-chip">From: {fFrom} <span className="vim-chip-x" onClick={() => setFFrom('')}>×</span></span>}
                {fTo && <span className="vim-chip">To: {fTo} <span className="vim-chip-x" onClick={() => setFTo('')}>×</span></span>}
                <button className="vim-btn vim-btn-xs vim-btn-ghost" onClick={clearFilters}>Clear all</button>
              </div>
            )}
          </div>
        </div>

        {/* ── Filter panel ──────────────────────────────────────────── */}
        {filterOpen && (
          <div className="vim-fpanel" style={{ marginBottom: 16 }}>
            <Field label="Search">
              <input className="vim-input" style={{ minWidth: 210 }} autoFocus
                placeholder="PO, vendor, item, issue no…"
                value={fSearch} onChange={e => setFSearch(e.target.value)} />
            </Field>
            <Field label="Indent By">
              <select className="vim-input vim-select" style={{ minWidth: 120 }} value={fIndentBy} onChange={e => setFIndentBy(e.target.value)}>
                <option value="">All</option>
                {INDENT_BY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Indent Status">
              <select className="vim-input vim-select" style={{ minWidth: 120 }} value={fClosed} onChange={e => setFClosed(e.target.value)}>
                <option value="">All</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </Field>
            <Field label="Date From">
              <input type="date" className="vim-input" value={fFrom} onChange={e => setFFrom(e.target.value)} />
            </Field>
            <Field label="Date To">
              <input type="date" className="vim-input" value={fTo} onChange={e => setFTo(e.target.value)} />
            </Field>
            <div style={{ alignSelf: 'flex-end', display: 'flex', gap: 8 }}>
              {activeFilters > 0 && <button className="vim-btn vim-btn-sm vim-btn-ghost" onClick={clearFilters}>Clear all</button>}
              <button className="vim-btn vim-btn-sm vim-btn-ghost" onClick={() => setFilterOpen(false)}>Close</button>
            </div>
          </div>
        )}

        {/* ── Stats bar ────────────────────────────────────────────── */}
        <div className="vim-card" style={{ marginBottom: 18, padding: '16px 24px' }}>
          <div className="vim-stats">
            {[
              { val: stats.total, lbl: 'Issues', color: '#1a237e' },
              { val: stats.items, lbl: 'Line Items', color: '#1a237e' },
              { val: stats.totalQty, lbl: 'Total Qty', color: '#4f46e5' },
              { val: stats.open, lbl: 'Open', color: '#ef4444' },
              { val: stats.closed, lbl: 'Closed', color: '#16a34a' },
            ].map((s, i) => (
              <React.Fragment key={s.lbl}>
                {i > 0 && <div className="vim-divider-v" />}
                <div className="vim-stat">
                  <div className="vim-stat-val" style={{ color: s.color }}>{s.val}</div>
                  <div className="vim-stat-lbl">{s.lbl}</div>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ── Add / Edit panel ──────────────────────────────────────── */}
        <div ref={editRef} className={`vim-card ${isEditing ? 'vim-card-edit' : ''}`} style={{ marginBottom: 20 }}>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 22px', borderBottom: '1px solid #f0f1f5',
            background: isEditing ? '#eef2ff' : '#fafbff',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 17 }}>{isEditing ? '✏️' : '＋'}</span>
              <span style={{ fontWeight: 700, fontSize: 14.5, color: isEditing ? '#1a237e' : '#374151' }}>
                {isEditing ? `Edit Issue — ${newIssue.issueNo}` : 'New Issue'}
              </span>
              {isEditing && <span style={{ background: '#c7d2fe', color: '#3730a3', padding: '2px 10px', borderRadius: 20, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em' }}>EDIT MODE</span>}
            </div>
            {isEditing && <button className="vim-btn vim-btn-sm vim-btn-ghost" onClick={clearForm}>✕ Discard</button>}
          </div>

          <div style={{ padding: '20px 22px' }}>

            {/* PO + date bar */}
            <div className="vim-pobar">
              <span style={{ fontSize: 10.5, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>PO No</span>
              <select className="vim-input vim-select" style={{ maxWidth: 200, flex: '0 0 auto' }}
                value={newIssue.materialPurchasePoNo}
                onChange={e => setNewIssue(p => ({ ...p, materialPurchasePoNo: e.target.value, items: [] }))}>
                <option value="">— Select PO No —</option>
                {availablePOs.map(po => <option key={po} value={po}>{po}</option>)}
              </select>

              <Field label="Date ✱" style={{ flex: '0 0 auto' }}>
                <input type="date" className="vim-input" style={{ width: 160 }}
                  value={newIssue.date} onChange={e => setNewIssue(p => ({ ...p, date: e.target.value }))} />
              </Field>

              {newIssue.oaNo && <span className="vim-pobar-meta">OA: <strong>{newIssue.oaNo}</strong></span>}
              {newIssue.batchNo && <span className="vim-pobar-meta">Batch: <strong>{newIssue.batchNo}</strong></span>}
              {newIssue.issueNo && <span className="vim-pobar-meta">Issue: <strong style={{ color: '#4f46e5' }}>{newIssue.issueNo}</strong></span>}
            </div>

            {/* Header fields */}
            <div className="vim-sec">Issue Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
              <Field label="Vendor Name">
                <input className="vim-input vim-input-ro" readOnly value={newIssue.vendorName} placeholder="Auto-filled" />
              </Field>
              <Field label="DC No">
                <input className="vim-input vim-input-ro" readOnly value={newIssue.dcNo} placeholder="Auto-filled" />
              </Field>
              <Field label="Vendor Batch No">
                <input className="vim-input vim-input-ro" readOnly value={newIssue.vendorBatchNo} placeholder="Auto-filled from VSIR" />
              </Field>
            </div>

            {/* Item entry */}
            <div style={{ background: '#f8f9fc', borderRadius: 10, border: '1px solid #e2e4ea', padding: '16px 18px', marginBottom: 16 }}>
              <div className="vim-sec" style={{ paddingTop: 0 }}>
                {editItemIdx !== null ? '✏ Edit Item' : '+ Add Item'}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <Field label="Item Name">
                  {itemNames.length > 0 ? (
                    <select className="vim-input vim-select" value={itemInput.itemName}
                      onChange={e => {
                        const v = e.target.value;
                        const found = itemMaster.find(it => it.itemName === v);
                        const dept = getDeptOrder(newIssue.materialPurchasePoNo);
                        let qty = 0;
                        if (dept?.items && found) {
                          const di = dept.items.find((d: any) => d.itemName === v && d.itemCode === found.itemCode);
                          if (di && typeof di.plannedQty === 'number') qty = di.plannedQty;
                        }
                        setItemInput(p => ({ ...p, itemName: v, itemCode: found?.itemCode || '', qty }));
                      }}>
                      <option value="">— Select Item —</option>
                      {itemNames.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  ) : (
                    <input className="vim-input" placeholder="e.g. Jaw Carrier 02"
                      value={itemInput.itemName} onChange={e => setItemInput(p => ({ ...p, itemName: e.target.value }))} />
                  )}
                </Field>
                <Field label="Item Code">
                  <input className="vim-input" placeholder="e.g. JW-02" readOnly={itemNames.length > 0}
                    value={itemInput.itemCode} onChange={e => setItemInput(p => ({ ...p, itemCode: e.target.value }))} />
                </Field>
                <Field label="Indent By ✱">
                  <select className="vim-input vim-select" value={itemInput.indentBy}
                    onChange={e => setItemInput(p => ({ ...p, indentBy: e.target.value }))}>
                    <option value="">— Select —</option>
                    {INDENT_BY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Field>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
                <Field label="Qty ✱">
                  <NumInput value={itemInput.qty} onChange={n => setItemInput(p => ({ ...p, qty: n }))} />
                </Field>
                <Field label="In Stock">
                  <NumInput value={itemInput.inStock} onChange={n => setItemInput(p => ({ ...p, inStock: n }))} />
                </Field>
                <Field label="Indent Closed">
                  <div style={{ paddingTop: 9 }}>
                    <label className="vim-checkbox">
                      <input type="checkbox" checked={itemInput.indentClosed}
                        onChange={e => setItemInput(p => ({ ...p, indentClosed: e.target.checked }))} />
                      <span>{itemInput.indentClosed ? 'Yes — closed' : 'No — open'}</span>
                    </label>
                  </div>
                </Field>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="vim-btn vim-btn-primary" onClick={handleSaveItem}>
                  {editItemIdx !== null ? '✓ Update Item' : '+ Add Item'}
                </button>
                {editItemIdx !== null && (
                  <button className="vim-btn vim-btn-ghost" onClick={() => { setEditItemIdx(null); setItemInput({ ...BLANK_ITEM }); }}>Cancel</button>
                )}
              </div>
            </div>

            {/* Items preview */}
            {newIssue.items.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#8b95a1', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                  Items in this issue ({newIssue.items.length})
                </div>
                <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e2e4ea' }}>
                  <table className="vim-itable">
                    <thead>
                      <tr>
                        <th>Item Name</th><th>Code</th><th className="r">Qty</th>
                        <th>Indent By</th><th className="r">In Stock</th><th>Closed</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {newIssue.items.map((it, ii) => (
                        <tr key={ii}>
                          <td><span className="ellipsis" style={{ maxWidth: 160 }} title={it.itemName}>{it.itemName}</span></td>
                          <td><span className="mono" style={{ color: '#6366f1' }}>{it.itemCode}</span></td>
                          <td className="r" style={{ fontWeight: 600 }}>{it.qty}</td>
                          <td><IndentByBadge val={it.indentBy} /></td>
                          <td className="r">{it.inStock}</td>
                          <td><ClosedBadge closed={it.indentClosed} /></td>
                          <td>
                            <div style={{ display: 'flex', gap: 5 }}>
                              <button className="vim-btn vim-btn-xs vim-btn-warning" onClick={() => { setItemInput(it); setEditItemIdx(ii); }}>Edit</button>
                              <button className="vim-btn vim-btn-xs vim-btn-danger" onClick={() => setNewIssue(p => ({ ...p, items: p.items.filter((_, xi) => xi !== ii) }))}>✕</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Save issue — only user action creates a record */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className={`vim-btn ${isEditing ? 'vim-btn-primary' : 'vim-btn-success'}`} style={{ minWidth: 160 }}
                onClick={isEditing ? handleUpdateIssue : handleAddIssue}>
                {isEditing ? '✓ Save Changes' : '+ Add Issue'}
              </button>
              {isEditing && <button className="vim-btn vim-btn-ghost" onClick={clearForm}>Discard</button>}
            </div>
          </div>
        </div>

        {/* ── Issues table ──────────────────────────────────────────── */}
        <div className="vim-card">
          <div style={{ padding: '13px 20px', borderBottom: '1px solid #f0f1f5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#1a237e' }}>Issues</span>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>
              {activeFilters > 0 ? `Filtered: ${filtered.length} of ${flatRows.length}` : `${flatRows.length} total rows`}
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="vim-table">
              <colgroup>
                <col style={{ width: 34 }} /><col style={{ width: 88 }} /><col style={{ width: 80 }} />
                <col style={{ width: 90 }} /><col style={{ width: 75 }} /><col style={{ width: 90 }} />
                <col style={{ width: 100 }} /><col style={{ width: 80 }} /><col style={{ width: 130 }} />
                <col style={{ width: 88 }} /><col style={{ width: 55 }} /><col style={{ width: 70 }} />
                <col style={{ width: 55 }} /><col style={{ width: 75 }} /><col style={{ width: 88 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="r">#</th>
                  <th>Date</th><th>Issue No</th><th>DC No</th>
                  <th>PO No</th><th>OA No</th><th>Vendor</th>
                  <th>Batch No</th>
                  <th className="div-l">Item</th>
                  <th>Code</th>
                  <th className="r div-l">Qty</th><th className="r">In Stock</th>
                  <th>Indent By</th><th>Closed</th>
                  <th className="r">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={15}>
                      <div className="vim-empty">
                        <div className="vim-empty-icon">📋</div>
                        <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4, fontSize: 14 }}>
                          {activeFilters > 0 ? 'No rows match your filters' : 'No issues yet'}
                        </div>
                        <div style={{ fontSize: 12.5 }}>
                          {activeFilters > 0
                            ? <span>Try <span style={{ color: '#4f46e5', cursor: 'pointer', fontWeight: 600 }} onClick={clearFilters}>clearing filters</span></span>
                            : 'Add your first issue using the form above'}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : filtered.map((row, ri) => (
                  <tr key={`${row._issueIdx}-${row._itemIdx}`}>
                    <td className="r" style={{ color: '#c4c9d4', fontWeight: 700, fontSize: 11 }}>{ri + 1}</td>
                    <td style={{ color: '#6b7280', fontSize: 12 }}>{row.date || '—'}</td>
                    <td><span className="mono" style={{ color: '#4f46e5', fontWeight: 600 }}>{row.issueNo}</span></td>
                    <td><span className="mono" style={{ color: '#6b7280', fontSize: 11 }}>{row.dcNo || '—'}</span></td>
                    <td><span style={{ fontWeight: 600, fontSize: 12.5, color: '#1a237e' }}>{row.materialPurchasePoNo}</span></td>
                    <td style={{ color: '#6b7280', fontSize: 12 }}>{row.oaNo || '—'}</td>
                    <td><span className="ellipsis" style={{ maxWidth: 90 }} title={row.vendorName}>{row.vendorName || <span style={{ color: '#d1d5db' }}>—</span>}</span></td>
                    <td><span className="mono" style={{ color: '#6b7280', fontSize: 11 }}>{row.batchNo || '—'}</span></td>
                    <td className="div-l">
                      <span className="ellipsis" style={{ maxWidth: 118, fontWeight: 500 }} title={row._item.itemName}>
                        {row._item.itemName || <span style={{ color: '#d1d5db' }}>—</span>}
                      </span>
                    </td>
                    <td><span className="mono" style={{ color: '#6366f1' }}>{row._item.itemCode || '—'}</span></td>
                    <td className="r div-l" style={{ fontWeight: 600 }}>{row._item.qty || '—'}</td>
                    <td className="r" style={{ color: '#6b7280' }}>{row._item.inStock ?? '—'}</td>
                    <td><IndentByBadge val={row._item.indentBy} /></td>
                    <td><ClosedBadge closed={row._item.indentClosed} /></td>
                    <td className="r">
                      <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                        <button className="vim-btn vim-btn-xs vim-btn-primary" onClick={() => handleEditIssue(row._issueIdx)}>Edit</button>
                        <button className="vim-btn vim-btn-xs vim-btn-danger"
                          onClick={() => row._itemIdx === -1
                            ? handleDeleteIssue(row._issueIdx)
                            : handleDeleteItem(row._issueIdx, row._itemIdx)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default VendorIssueModule; 