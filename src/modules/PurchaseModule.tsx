import React, { useEffect, useState, useMemo } from "react";
import bus from '../utils/eventBus';
import { subscribeFirestoreDocs, replaceFirestoreCollection } from '../utils/firestoreSync';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PurchaseEntry {
  orderPlaceDate: string;
  poNo: string;
  supplierName: string;
  itemName: string;
  itemCode: string;
  indentNo: string;
  indentDate?: string;
  indentBy: string;
  oaNo: string;
  originalIndentQty: number;
  purchaseQty: number;
  currentStock: number;
  indentStatus: string;
  receivedQty: number;
  okQty: number;
  rejectedQty: number;
  grnNo: string;
  debitNoteOrQtyReturned: string;
  remarks: string;
}

interface PurchaseModuleProps {
  user?: any;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INDENT_STATUS_OPTIONS = ["Open", "Closed", "Partial"];

const EMPTY_ENTRY: PurchaseEntry = {
  orderPlaceDate: "", poNo: "", supplierName: "", itemName: "", itemCode: "",
  indentNo: "", indentBy: "", oaNo: "", originalIndentQty: 0, purchaseQty: 0,
  currentStock: 0, indentStatus: "Open", receivedQty: 0, okQty: 0,
  rejectedQty: 0, grnNo: "", debitNoteOrQtyReturned: "", remarks: "",
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page:       { fontFamily: "'DM Sans', sans-serif", color: '#1a1a2e', background: '#f7f8fc', minHeight: '100vh', padding: '24px' } as React.CSSProperties,
  card:       { background: '#fff', borderRadius: 12, border: '1px solid #e8eaf0', padding: '20px 24px', marginBottom: 20 } as React.CSSProperties,
  header:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 } as React.CSSProperties,
  h1:         { fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.3px' } as React.CSSProperties,
  h2:         { fontSize: 16, fontWeight: 600, margin: '0 0 16px', color: '#374151' } as React.CSSProperties,
  stat:       { display: 'flex', gap: 20, flexWrap: 'wrap' as const },
  statItem:   { background: '#f7f8fc', borderRadius: 8, padding: '10px 18px', minWidth: 100 } as React.CSSProperties,
  statVal:    { fontSize: 22, fontWeight: 700, lineHeight: 1 } as React.CSSProperties,
  statLabel:  { fontSize: 11, color: '#6b7280', marginTop: 2, textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  grid:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 } as React.CSSProperties,
  label:      { display: 'block', fontSize: 12, fontWeight: 500, color: '#6b7280', marginBottom: 4 } as React.CSSProperties,
  input:      { width: '100%', boxSizing: 'border-box' as const, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fff', transition: 'border-color 0.15s' } as React.CSSProperties,
  inputErr:   { borderColor: '#ef4444' } as React.CSSProperties,
  select:     { width: '100%', boxSizing: 'border-box' as const, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, background: '#fff', outline: 'none' } as React.CSSProperties,
  btnPrimary: { padding: '9px 18px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13, cursor: 'pointer', letterSpacing: '-0.1px' } as React.CSSProperties,
  btnSecond:  { padding: '9px 18px', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 7, fontWeight: 500, fontSize: 13, cursor: 'pointer' } as React.CSSProperties,
  btnDanger:  { padding: '5px 10px', background: 'transparent', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 5, fontSize: 12, cursor: 'pointer' } as React.CSSProperties,
  btnEdit:    { padding: '5px 10px', background: 'transparent', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 5, fontSize: 12, cursor: 'pointer' } as React.CSSProperties,
  table:      { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th:         { padding: '10px 12px', textAlign: 'left' as const, fontWeight: 600, fontSize: 11, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.5px', borderBottom: '2px solid #e8eaf0', background: '#f9fafb' } as React.CSSProperties,
  td:         { padding: '11px 12px', borderBottom: '1px solid #f1f3f7', verticalAlign: 'middle' as const } as React.CSSProperties,
  badge:      (color: string, bg: string) => ({ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, color, background: bg } as React.CSSProperties),
  stockBadge: (isShort: boolean) => ({ display: 'inline-block', padding: '4px 10px', borderRadius: 6, fontWeight: 700, fontSize: 13, color: '#fff', background: isShort ? '#ef4444' : '#16a34a', minWidth: 36, textAlign: 'center' as const } as React.CSSProperties),
  emptyState: { padding: '48px 0', textAlign: 'center' as const, color: '#9ca3af' } as React.CSSProperties,
  notice:     (type: 'success' | 'warn' | 'error') => {
    const map = { success: { bg: '#f0fdf4', border: '#bbf7d0', color: '#16a34a' }, warn: { bg: '#fffbeb', border: '#fde68a', color: '#b45309' }, error: { bg: '#fef2f2', border: '#fecaca', color: '#dc2626' } };
    const c = map[type];
    return { padding: '10px 14px', borderRadius: 8, border: `1px solid ${c.border}`, background: c.bg, color: c.color, fontSize: 13, fontWeight: 500, marginBottom: 16 } as React.CSSProperties;
  },
  divider:    { height: 1, background: '#e8eaf0', margin: '20px 0' } as React.CSSProperties,
  rowHover:   { cursor: 'pointer' } as React.CSSProperties,
};

// ─── Component ────────────────────────────────────────────────────────────────

const PurchaseModule: React.FC<PurchaseModuleProps> = ({ user }) => {
  const [uid] = useState<string>(user?.uid || 'default-user');

  // Data from Firestore
  const [entries,          setEntries]          = useState<PurchaseEntry[]>([]);
  const [openIndentItems,  setOpenIndentItems]  = useState<any[]>([]);
  const [closedIndentItems,setClosedIndentItems]= useState<any[]>([]);
  const [stockRecords,     setStockRecords]     = useState<any[]>([]);
  const [indentData,       setIndentData]       = useState<any[]>([]);
  const [itemMasterData,   setItemMasterData]   = useState<any[]>([]);
  const [psirData,         setPsirData]         = useState<any[]>([]);
  const [itemNames,        setItemNames]        = useState<string[]>([]);

  // UI state
  const [newEntry,    setNewEntry]    = useState<PurchaseEntry>(EMPTY_ENTRY);
  const [editIndex,   setEditIndex]   = useState<number | null>(null);
  const [editEntry,   setEditEntry]   = useState<PurchaseEntry | null>(null);
  const [notice,      setNotice]      = useState<{ type: 'success'|'warn'|'error'; msg: string } | null>(null);
  const [importing,   setImporting]   = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Auto-dismiss notice
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // ─── Firestore subscriptions ──────────────────────────────────────────────
  useEffect(() => {
    const unsubs = [
      subscribeFirestoreDocs(uid, 'openIndentItems',  (d) => setOpenIndentItems(d)),
      subscribeFirestoreDocs(uid, 'closedIndentItems',(d) => setClosedIndentItems(d)),
      subscribeFirestoreDocs(uid, 'stockRecords',     (d) => setStockRecords(d)),
      subscribeFirestoreDocs(uid, 'indentData',       (d) => setIndentData(d)),
      subscribeFirestoreDocs(uid, 'itemMaster',       (d) => setItemMasterData(d)),
      subscribeFirestoreDocs(uid, 'psirData',         (d) => setPsirData(d)),
      subscribeFirestoreDocs(uid, 'purchaseData',     (docs) => {
        if (!docs?.length) { setEntries([]); return; }
        try {
          const migrated = docs.map((e: any) => ({
            ...e,
            originalIndentQty: e.originalIndentQty ?? e.qty ?? 0,
            purchaseQty:       e.purchaseQty       ?? e.poQty ?? e.qty ?? 0,
            currentStock:      e.currentStock      ?? e.inStock ?? 0,
            okQty:             e.okQty             ?? 0,
            receivedQty:       e.receivedQty       ?? 0,
            rejectedQty:       e.rejectedQty       ?? 0,
          }));
          setEntries(deduplicateEntries(migrated));
        } catch { setEntries([]); }
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [uid]);

  useEffect(() => {
    if (Array.isArray(itemMasterData))
      setItemNames(itemMasterData.map((i: any) => i.itemName).filter(Boolean));
  }, [itemMasterData]);

  // ─── Pure helpers ─────────────────────────────────────────────────────────
  const norm = (v: any): string => {
    if (v == null) return '';
    try { return String(v).trim().toUpperCase(); } catch { return ''; }
  };

  const makeKey = (indentNo: any, itemCode: any) => `${norm(indentNo)}|${norm(itemCode)}`;

  const tryParse = (v: any): number => {
    if (v == null || v === '') return 0;
    if (typeof v === 'number' && !isNaN(v)) return v;
    const m = String(v).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) || 0 : 0;
  };

  const getStockFromIndent = (item: any): number => {
    if (!item) return 0;
    for (const f of ['stock','Stock','currentStock','Current Stock','availableStock','Available','available','instock','inStock','balance','Balance','qty1']) {
      if (f in item) { const p = tryParse(item[f]); if (p !== 0) return p; }
    }
    for (const f of ['quantity','Quantity','qty','Qty']) {
      if (f in item) { const p = tryParse(item[f]); if (p !== 0) return p; }
    }
    if ('qty' in item && 'issued' in item) { const b = tryParse(item.qty) - tryParse(item.issued); if (b >= 0) return b; }
    return 0;
  };

  const getIndentQty = (item: any): number => {
    for (const f of ['qty','indentQty','quantity','Quantity','requestedQty','requiredQty','Qty','qty1']) {
      if (item[f] != null && item[f] !== '') { const n = Number(item[f]); if (!isNaN(n)) return n; }
    }
    return 0;
  };

  const getStatusFromIndent = (item: any): string => {
    if (openIndentItems.some((o: any)   => o.indentNo === item.indentNo && (o.itemCode === item.itemCode || o.Code === item.itemCode))) return "Open";
    if (closedIndentItems.some((c: any) => c.indentNo === item.indentNo && (c.itemCode === item.itemCode || c.Code === item.itemCode))) return "Closed";
    return "Open";
  };

  // ─── Core stock computation (single implementation, shared via useMemo) ───
  //
  // WHY useMemo:
  //   Previously two near-identical 150-line functions (getLiveStockInfo,
  //   getLiveStockForEntry) ran for every table row on every render.
  //   When openIndentItems/closedIndentItems first arrive from Firestore the
  //   arrays are [], so the search returns 0 → badge shows wrong color →
  //   data arrives → correct value renders. Visible flash.
  //
  //   useMemo computes the map ONCE per data-change. Render is a O(1) map
  //   lookup. Map is ready before the first paint that shows real data.
  //
  const liveStockMap = useMemo(() => {
    const map = new Map<string, { display: number; isShort: boolean; status: string }>();

    const computeDisplay = (
      indentItem: any, normCode: string, itemIndentNo: string
    ): { display: number; isShort: boolean } => {
      // Priority 1: explicit "available for this indent" field
      for (const f of ['availableForThisIndent','allocatedAvailable','qty1','available']) {
        if (indentItem[f] != null) { const av = Number(indentItem[f]); if (!isNaN(av)) return { display: av, isShort: false }; }
      }
      // Priority 2: cumulative qty through indentData
      let targetI = -1, targetJ = -1;
      loop:
      for (let i = 0; i < indentData.length; i++) {
        const ind = indentData[i];
        if (!ind?.items || norm(ind.indentNo) !== itemIndentNo) continue;
        for (let j = 0; j < ind.items.length; j++) {
          const it = ind.items[j];
          if (!it) continue;
          if (norm(it.itemCode) === normCode || norm(it.Code || it.Item || '') === normCode) { targetI = i; targetJ = j; break loop; }
        }
      }
      let cumQty = 0;
      if (targetI >= 0) {
        for (let i = 0; i <= targetI; i++) {
          const ind = indentData[i];
          if (!ind?.items) continue;
          const limit = i === targetI ? targetJ + 1 : ind.items.length;
          for (let j = 0; j < limit; j++) {
            const it = ind.items[j];
            if (!it) continue;
            if (norm(it.itemCode) === normCode || norm(it.Code || it.Item || '') === normCode) cumQty += Number(it.qty) || 0;
          }
        }
      }
      if (!cumQty) { const fb = getIndentQty(indentItem) || Number(indentItem.qty) || 0; if (fb) cumQty = fb; }

      const sr = stockRecords.find((s: any) => norm(s.itemCode) === normCode);
      const closing = sr && !isNaN(Number(sr.closingStock)) ? Number(sr.closingStock) : 0;
      const display = cumQty > 0 ? (cumQty > closing ? cumQty - closing : cumQty) : closing;
      return { display, isShort: cumQty > closing };
    };

    for (const item of [...openIndentItems, ...closedIndentItems]) {
      if (!item?.indentNo) continue;
      const itemIndentNo = norm(item.indentNo);
      const status       = openIndentItems.includes(item) ? 'Open' : 'Closed';
      const codes        = [norm(item.itemCode), norm(item.Code)].filter(Boolean);
      for (const code of (codes.length ? codes : [''])) {
        const key = `${itemIndentNo}|${code}`;
        if (map.has(key)) continue;
        try { map.set(key, { ...computeDisplay(item, code, itemIndentNo), status }); }
        catch  { map.set(key, { display: getStockFromIndent(item), isShort: false, status }); }
      }
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openIndentItems, closedIndentItems, indentData, stockRecords]);

  // O(1) render-time lookups
  const getLiveInfo = (e: Pick<PurchaseEntry, 'indentNo'|'itemCode'|'currentStock'>): { display: number; isShort: boolean } => {
    const hit = liveStockMap.get(makeKey(e.indentNo, e.itemCode)) ?? liveStockMap.get(`${norm(e.indentNo)}|`);
    return hit ? { display: hit.display, isShort: hit.isShort } : { display: e.currentStock || 0, isShort: false };
  };

  const getLiveStock = (e: Pick<PurchaseEntry,'indentNo'|'itemCode'|'currentStock'>) => getLiveInfo(e).display;

  // ─── Deduplication ────────────────────────────────────────────────────────
  const deduplicateEntries = (list: PurchaseEntry[]): PurchaseEntry[] => {
    if (!Array.isArray(list)) return [];
    const seen = new Set<string>();
    return list.filter(e => { const k = makeKey(e.indentNo, e.itemCode); if (seen.has(k)) return false; seen.add(k); return true; });
  };

  // ─── Persist ──────────────────────────────────────────────────────────────
  const persistEntries = (data: PurchaseEntry[]): PurchaseEntry[] => {
    const deduped = deduplicateEntries(data);
    replaceFirestoreCollection(uid, 'purchaseData',   deduped).catch(console.error);
    replaceFirestoreCollection(uid, 'purchaseOrders', deduped).catch(console.error);
    try { bus.dispatchEvent(new CustomEvent('purchaseOrders.updated', { detail: deduped })); } catch {}
    return deduped;
  };

  // ─── Import from indent data ──────────────────────────────────────────────
  //
  // WHY MANUAL (not auto):
  //   Auto-import would fire on every Firestore change, overwriting the PO No,
  //   Supplier, and Order Date that users fill in manually AFTER importing.
  //   It also creates race conditions when both indent and purchase data are
  //   loading simultaneously. Manual import gives users control: import once
  //   when indent data is ready, then edit the generated rows safely.
  //
  const handleImportIndents = async () => {
    const allItems = [...openIndentItems, ...closedIndentItems];
    if (!allItems.length) { setNotice({ type: 'warn', msg: 'No indent items found. Make sure indent data is loaded.' }); return; }

    setImporting(true);
    try {
      let created = 0, updated = 0;
      const existingMap = new Map(entries.map(e => [makeKey(e.indentNo, e.itemCode), e]));
      const result = [...entries];

      for (const item of allItems) {
        if (!item.indentNo) continue;
        const key          = makeKey(item.indentNo, item.itemCode || '');
        const stock        = getStockFromIndent(item);
        const indentQty    = getIndentQty(item);
        const indentStatus = getStatusFromIndent(item);
        const liveHit      = liveStockMap.get(key) ?? liveStockMap.get(`${norm(item.indentNo)}|`);
        const liveStock    = liveHit?.display ?? stock;

        if (existingMap.has(key)) {
          // Update only non-user-entered fields (preserve PO No, Supplier, Order Date)
          const idx = result.findIndex(e => makeKey(e.indentNo, e.itemCode) === key);
          if (idx >= 0) {
            result[idx] = {
              ...result[idx],
              originalIndentQty: indentQty,
              currentStock:      stock,
              indentStatus,
              oaNo:              item.oaNo || item.OA || result[idx].oaNo,
              // purchaseQty rule: Open → use live stock as needed qty; Closed → 0
              purchaseQty:       indentStatus === 'Open' ? stock : 0,
            };
            updated++;
          }
        } else {
          result.push({
            ...EMPTY_ENTRY,
            itemName:         item.model || item.itemName || item.Item || item.description || '',
            itemCode:         item.itemCode || item.Code || '',
            indentNo:         item.indentNo || '',
            indentDate:       item.date || item.indentDate || '',
            indentBy:         item.indentBy || '',
            oaNo:             item.oaNo || item.OA || '',
            originalIndentQty: indentQty,
            currentStock:     stock,
            indentStatus,
            purchaseQty:      indentStatus === 'Open' ? liveStock : 0,
          });
          created++;
        }
      }

      const saved = persistEntries(result);
      setEntries(saved);
      setNotice({ type: 'success', msg: `Imported: ${created} new, ${updated} updated.` });
    } catch (err) {
      console.error('[PurchaseModule] Import error:', err);
      setNotice({ type: 'error', msg: 'Import failed. Check console for details.' });
    } finally {
      setImporting(false);
    }
  };

  // ─── PSIR sync ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!entries.length || !psirData.length) return;
    let changed = false;
    const updated = entries.map(e => {
      const psir = psirData.find((p: any) => p.poNo === e.poNo && Array.isArray(p.items));
      if (!psir) return e;
      const it = psir.items.find((i: any) => i.itemCode === e.itemCode);
      if (!it) return e;
      const r = it.qtyReceived || 0, ok = it.okQty || 0, rej = it.rejectQty || 0;
      if (r !== e.receivedQty || ok !== e.okQty || rej !== e.rejectedQty) { changed = true; return { ...e, receivedQty: r, okQty: ok, rejectedQty: rej }; }
      return e;
    });
    if (changed) { setEntries(updated); persistEntries(updated); }
  }, [psirData]);

  // PSIR new-entry auto-fill
  useEffect(() => {
    if (!newEntry.poNo || !newEntry.itemCode) return;
    const psir = psirData.find((p: any) => p.poNo === newEntry.poNo && Array.isArray(p.items) && p.items.some((i: any) => i.itemCode === newEntry.itemCode));
    if (!psir) return;
    const it = psir.items.find((i: any) => i.itemCode === newEntry.itemCode);
    if (it) setNewEntry(prev => ({ ...prev, receivedQty: it.qtyReceived || 0, okQty: it.okQty || 0, rejectedQty: it.rejectQty || 0 }));
  }, [newEntry.poNo, newEntry.itemCode]);

  // Indent events
  useEffect(() => {
    const handler = (e: any) => {
      const openItems: any[]   = e?.detail?.openItems   || [];
      const closedItems: any[] = e?.detail?.closedItems || [];
      const sMap = new Map<string, string>(), stMap = new Map<string, number>();

      const process = (item: any, status: string) => {
        if (!item?.indentNo) return;
        [makeKey(item.indentNo, item.itemCode||''), makeKey(item.indentNo, item.Code||'')].forEach(k => {
          sMap.set(k, status); stMap.set(k, getStockFromIndent(item));
        });
      };
      openItems.forEach((i: any)   => process(i, 'Open'));
      closedItems.forEach((i: any) => process(i, 'Closed'));

      setEntries(prev => {
        let dirty = false;
        const updated = prev.map(e => {
          const k = makeKey(e.indentNo, e.itemCode);
          const ns = sMap.get(k), nst = stMap.get(k);
          if (!ns && nst === undefined) return e;
          const u = { ...e };
          if (ns && ns !== e.indentStatus) { u.indentStatus = ns; dirty = true; }
          if (nst !== undefined && nst !== e.currentStock) { u.currentStock = nst; dirty = true; }
          const desired = (ns ?? u.indentStatus) === 'Open' ? (nst ?? u.currentStock) : 0;
          if (u.purchaseQty !== desired) { u.purchaseQty = desired; dirty = true; }
          return dirty ? u : e;
        });
        if (!dirty) return prev;
        persistEntries(updated);
        return updated;
      });
    };
    bus.addEventListener('indents.updated', handler as EventListener);
    return () => bus.removeEventListener('indents.updated', handler as EventListener);
  }, []);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const isQtyField = (name: string) => name.includes('Qty') || name === 'originalIndentQty' || name === 'currentStock';

  const applyChange = (prev: PurchaseEntry, name: string, value: string): PurchaseEntry => ({
    ...prev,
    [name]: isQtyField(name) ? Math.max(0, Number(value)) : value,
  });

  const handleNewChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setNewEntry(prev => applyChange(prev, e.target.name, e.target.value));

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setEditEntry(prev => prev ? applyChange(prev, e.target.name, e.target.value) : prev);

  const handleAddEntry = () => {
    if (!newEntry.poNo || !newEntry.supplierName) { setNotice({ type: 'warn', msg: 'PO No and Supplier Name are required.' }); return; }
    const live = getLiveStock(newEntry);
    const saved = persistEntries([...entries, { ...newEntry, purchaseQty: newEntry.indentStatus === 'Open' ? live : 0 }]);
    setEntries(saved);
    setNewEntry(EMPTY_ENTRY);
    setShowAddForm(false);
    setNotice({ type: 'success', msg: 'Entry added.' });
  };

  const handleEdit = (i: number) => { setEditIndex(i); setEditEntry({ ...entries[i] }); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); };

  const handleSaveEdit = () => {
    if (!editEntry || editIndex === null) return;
    if (!editEntry.poNo || !editEntry.supplierName) { setNotice({ type: 'warn', msg: 'PO No and Supplier Name are required.' }); return; }
    const live = getLiveStock(editEntry);
    const updated = [...entries];
    updated[editIndex] = { ...editEntry, purchaseQty: editEntry.indentStatus === 'Open' ? live : 0 };
    setEntries(persistEntries(updated));
    setEditIndex(null); setEditEntry(null);
    setNotice({ type: 'success', msg: 'Entry updated.' });
  };

  const handleDelete = (i: number) => {
    if (!window.confirm('Delete this purchase order entry?')) return;
    const updated = entries.filter((_, j) => j !== i);
    setEntries(updated); persistEntries(updated);
    setNotice({ type: 'success', msg: 'Entry deleted.' });
  };

  const handleCancelEdit = () => { setEditIndex(null); setEditEntry(null); };

  // ─── Sub-components ───────────────────────────────────────────────────────

  const Field = ({ label, name, value, onChange, type = 'text', required = false }: {
    label: string; name: string; value: any; onChange: any; type?: string; required?: boolean;
  }) => (
    <div>
      <label style={S.label}>{label}{required && <span style={{ color:'#ef4444', marginLeft:2 }}>*</span>}</label>
      <input
        type={type}
        name={name}
        value={value ?? ''}
        onChange={onChange}
        style={{ ...S.input, ...(required && !value ? S.inputErr : {}) }}
      />
    </div>
  );

  const SelectField = ({ label, name, value, onChange, options, required = false }: {
    label: string; name: string; value: any; onChange: any; options: string[]; required?: boolean;
  }) => (
    <div>
      <label style={S.label}>{label}{required && <span style={{ color:'#ef4444', marginLeft:2 }}>*</span>}</label>
      <select name={name} value={value ?? ''} onChange={onChange} style={S.select}>
        <option value="">Select…</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  const StatusBadge = ({ status }: { status: string }) => {
    const map: Record<string, [string,string]> = {
      Open:    ['#b45309', '#fffbeb'],
      Closed:  ['#16a34a', '#f0fdf4'],
      Partial: ['#2563eb', '#eff6ff'],
    };
    const [color, bg] = map[status] || ['#6b7280','#f3f4f6'];
    return <span style={S.badge(color, bg)}>{status}</span>;
  };

  // ─── Summary stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:   entries.length,
    open:    entries.filter(e => e.indentStatus === 'Open').length,
    closed:  entries.filter(e => e.indentStatus === 'Closed').length,
    noPoNo:  entries.filter(e => !e.poNo).length,
  }), [entries]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <h1 style={S.h1}>Purchase Orders</h1>
        <div style={{ display:'flex', gap:8 }}>
          <button
            onClick={handleImportIndents}
            disabled={importing}
            style={{ ...S.btnSecond, ...(importing ? { opacity:0.6, cursor:'not-allowed' } : {}) }}
          >
            {importing ? 'Importing…' : '↓ Sync from Indents'}
          </button>
          <button onClick={() => setShowAddForm(p => !p)} style={S.btnPrimary}>
            {showAddForm ? '✕ Cancel' : '+ Add Entry'}
          </button>
        </div>
      </div>

      {/* Notice */}
      {notice && <div style={S.notice(notice.type)}>{notice.msg}</div>}

      {/* Stats */}
      <div style={{ ...S.card, padding: '16px 24px' }}>
        <div style={S.stat}>
          <div style={S.statItem}>
            <div style={S.statVal}>{stats.total}</div>
            <div style={S.statLabel}>Total</div>
          </div>
          <div style={S.statItem}>
            <div style={{ ...S.statVal, color:'#b45309' }}>{stats.open}</div>
            <div style={S.statLabel}>Open</div>
          </div>
          <div style={S.statItem}>
            <div style={{ ...S.statVal, color:'#16a34a' }}>{stats.closed}</div>
            <div style={S.statLabel}>Closed</div>
          </div>
          {stats.noPoNo > 0 && (
            <div style={S.statItem}>
              <div style={{ ...S.statVal, color:'#ef4444' }}>{stats.noPoNo}</div>
              <div style={S.statLabel}>No PO No</div>
            </div>
          )}
          <div style={{ ...S.statItem, marginLeft:'auto' }}>
            <div style={{ ...S.statVal, fontSize:14, color:'#6b7280' }}>{openIndentItems.length + closedIndentItems.length}</div>
            <div style={S.statLabel}>Indent Items</div>
          </div>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div style={S.card}>
          <h2 style={S.h2}>New Purchase Entry</h2>
          <div style={S.grid}>
            <Field label="Order Date"      name="orderPlaceDate" value={newEntry.orderPlaceDate} onChange={handleNewChange} type="date" />
            <Field label="PO No"           name="poNo"           value={newEntry.poNo}           onChange={handleNewChange} required />
            <Field label="Supplier"        name="supplierName"   value={newEntry.supplierName}   onChange={handleNewChange} required />
            <div>
              <label style={S.label}>Item Name</label>
              <select name="itemName" value={newEntry.itemName} onChange={handleNewChange} style={S.select}>
                <option value="">Select…</option>
                {itemNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <Field label="Item Code"       name="itemCode"           value={newEntry.itemCode}           onChange={handleNewChange} />
            <Field label="Indent No"       name="indentNo"           value={newEntry.indentNo}           onChange={handleNewChange} />
            <Field label="Original Qty"    name="originalIndentQty"  value={newEntry.originalIndentQty || ''} onChange={handleNewChange} type="number" />
            <Field label="PO Qty"          name="purchaseQty"        value={newEntry.purchaseQty       || ''} onChange={handleNewChange} type="number" />
            <Field label="Stock"           name="currentStock"       value={newEntry.currentStock      || ''} onChange={handleNewChange} type="number" />
            <SelectField label="Status"   name="indentStatus"  value={newEntry.indentStatus}  onChange={handleNewChange} options={INDENT_STATUS_OPTIONS} />
            <Field label="OA No"           name="oaNo"          value={newEntry.oaNo}          onChange={handleNewChange} />
            <Field label="GRN No"          name="grnNo"         value={newEntry.grnNo}         onChange={handleNewChange} />
            <Field label="Remarks"         name="remarks"       value={newEntry.remarks}       onChange={handleNewChange} />
          </div>
          <div style={{ marginTop:16, display:'flex', gap:8 }}>
            <button onClick={handleAddEntry} style={S.btnPrimary}>Add Entry</button>
            <button onClick={() => { setShowAddForm(false); setNewEntry(EMPTY_ENTRY); }} style={S.btnSecond}>Cancel</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={S.card}>
        {entries.length === 0 ? (
          <div style={S.emptyState}>
            <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
            <div style={{ fontWeight:600, marginBottom:4 }}>No purchase orders yet</div>
            <div style={{ fontSize:13 }}>Click "Sync from Indents" to import from indent data, or add entries manually.</div>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  {['#','Item','Code','Indent No','OA No','Order Date','PO No','Supplier','Orig. Qty','PO Qty','Stock','Status','Received','OK','Rejected','GRN No','Remarks','Actions'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => {
                  const { display: liveStock, isShort } = getLiveInfo(e);
                  const isEditing = i === editIndex;
                  return (
                    <tr key={i} style={{ background: isEditing ? '#eff6ff' : i % 2 === 0 ? '#fff' : '#fafafa', transition: 'background 0.15s' }}>
                      <td style={{ ...S.td, color:'#9ca3af', fontSize:11 }}>{i+1}</td>
                      <td style={{ ...S.td, fontWeight:500 }}>{e.itemName || '—'}</td>
                      <td style={{ ...S.td, fontFamily:'monospace', fontSize:12, color:'#6b7280' }}>{e.itemCode || '—'}</td>
                      <td style={{ ...S.td, fontFamily:'monospace', fontSize:12 }}>{e.indentNo || '—'}</td>
                      <td style={S.td}>{e.oaNo || '—'}</td>
                      <td style={{ ...S.td, color: e.orderPlaceDate ? '#374151':'#d1d5db' }}>{e.orderPlaceDate || 'Not set'}</td>
                      <td style={{ ...S.td, fontWeight: e.poNo ? 600 : 400, color: e.poNo ? '#374151':'#ef4444' }}>{e.poNo || 'Not set'}</td>
                      <td style={{ ...S.td, color: e.supplierName ? '#374151':'#d1d5db' }}>{e.supplierName || 'Not set'}</td>
                      <td style={{ ...S.td, textAlign:'right' }}>{e.originalIndentQty}</td>
                      <td style={{ ...S.td, textAlign:'right' }}>{e.indentStatus === 'Open' ? Math.abs(liveStock) : 0}</td>
                      <td style={{ ...S.td, textAlign:'center' }}>
                        <span style={S.stockBadge(isShort || liveStock <= 0)}>
                          {liveStock === 0 ? '—' : liveStock}
                        </span>
                      </td>
                      <td style={S.td}><StatusBadge status={e.indentStatus} /></td>
                      <td style={{ ...S.td, textAlign:'right' }}>{e.receivedQty}</td>
                      <td style={{ ...S.td, textAlign:'right' }}>{e.okQty}</td>
                      <td style={{ ...S.td, textAlign:'right' }}>{e.rejectedQty}</td>
                      <td style={{ ...S.td, fontFamily:'monospace', fontSize:12 }}>{e.grnNo || '—'}</td>
                      <td style={{ ...S.td, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:12, color:'#6b7280' }} title={e.remarks}>{e.remarks || '—'}</td>
                      <td style={{ ...S.td, whiteSpace:'nowrap' }}>
                        <button onClick={() => handleEdit(i)}   style={{ ...S.btnEdit,   marginRight:4 }}>Edit</button>
                        <button onClick={() => handleDelete(i)} style={S.btnDanger}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Panel */}
      {editEntry && (
        <div style={{ ...S.card, border:'2px solid #3b82f6' }}>
          <h2 style={{ ...S.h2, color:'#2563eb' }}>Edit Entry — {editEntry.itemName || `Row ${(editIndex ?? 0) + 1}`}</h2>
          <div style={S.grid}>
            <Field label="Order Date"    name="orderPlaceDate" value={editEntry.orderPlaceDate}    onChange={handleEditChange} type="date" />
            <Field label="PO No"         name="poNo"           value={editEntry.poNo}              onChange={handleEditChange} required />
            <Field label="Supplier"      name="supplierName"   value={editEntry.supplierName}      onChange={handleEditChange} required />
            <div>
              <label style={S.label}>Item Name</label>
              <select name="itemName" value={editEntry.itemName} onChange={handleEditChange} style={S.select}>
                <option value="">Select…</option>
                {itemNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <Field label="Original Qty"   name="originalIndentQty" value={editEntry.originalIndentQty || ''} onChange={handleEditChange} type="number" />
            <Field label="PO Qty"         name="purchaseQty"       value={editEntry.purchaseQty       || ''} onChange={handleEditChange} type="number" />
            <Field label="Stock"          name="currentStock"      value={editEntry.currentStock      || ''} onChange={handleEditChange} type="number" />
            <SelectField label="Status"  name="indentStatus"  value={editEntry.indentStatus}  onChange={handleEditChange} options={INDENT_STATUS_OPTIONS} />
            <Field label="OA No"         name="oaNo"          value={editEntry.oaNo}          onChange={handleEditChange} />
            <Field label="GRN No"        name="grnNo"         value={editEntry.grnNo}         onChange={handleEditChange} />
            <Field label="Remarks"       name="remarks"       value={editEntry.remarks}       onChange={handleEditChange} />
          </div>
          <div style={{ ...S.divider }} />
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={handleSaveEdit} style={S.btnPrimary} disabled={!editEntry.poNo || !editEntry.supplierName}>Save Changes</button>
            <button onClick={handleCancelEdit} style={S.btnSecond}>Cancel</button>
          </div>
          {(!editEntry.poNo || !editEntry.supplierName) && <p style={{ color:'#ef4444', fontSize:12, marginTop:8 }}>PO No and Supplier Name are required.</p>}
        </div>
      )}
    </div>
  );
};

export default PurchaseModule;