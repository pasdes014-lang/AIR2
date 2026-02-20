import React, { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import {
  subscribeVSIRRecords,
  deleteVSIRRecord,
  subscribePurchaseData,
} from '../utils/firestoreServices';
// import bus from '../utils/eventBus';

const VSRI_MODULE_FIELDS = [
  { key: 'receivedDate', label: 'Received Date', type: 'date' },
  { key: 'indentNo', label: 'Indent No', type: 'text' },
  { key: 'poNo', label: 'PO No', type: 'text' },
  { key: 'oaNo', label: 'OA No', type: 'text' },
  { key: 'purchaseBatchNo', label: 'Purchase Batch No', type: 'text' },
  { key: 'vendorBatchNo', label: 'Vendor Batch No', type: 'text' },
  { key: 'dcNo', label: 'DC No', type: 'text' },
  { key: 'invoiceDcNo', label: 'Invoice / DC No', type: 'text' },
  { key: 'vendorName', label: 'Vendor Name', type: 'text' },
  { key: 'itemName', label: 'Item Name', type: 'text' },
  { key: 'itemCode', label: 'Item Code', type: 'text' },
  { key: 'qtyReceived', label: 'Qty Received', type: 'number' },
  { key: 'okQty', label: 'OK Qty', type: 'number' },
  { key: 'reworkQty', label: 'Rework Qty', type: 'number' },
  { key: 'rejectQty', label: 'Reject Qty', type: 'number' },
  { key: 'grnNo', label: 'GRN No', type: 'text' },
  { key: 'remarks', label: 'Remarks', type: 'text' },
];

interface VSRIRecord {
  id: string;
  receivedDate: string;
  indentNo: string;
  poNo: string;
  oaNo: string;
  purchaseBatchNo: string;
    // Removed unused state variables and refs
  rejectQty: number;
  grnNo: string;
  remarks: string;
}

const VSIRModule: React.FC = () => {
  const [records, setRecords] = useState<VSRIRecord[]>([]);
  const [userUid, setUserUid] = useState<string | null>(null);


  const [purchaseData, setPurchaseData] = useState<any[]>([]);
  const [autoDeleteEnabled, setAutoDeleteEnabled] = useState(false);
  const deletingIdsRef = useRef<Set<string>>(new Set());


  // If deduplication is needed, use only available fields
  const makeKey = (poNo: string) => `${poNo?.trim().toLowerCase()}`;
  const deduplicateVSIRRecords = (arr: VSRIRecord[]) => {
    const map = new Map<string, VSRIRecord>();
    arr.forEach(r => map.set(makeKey(r.poNo), r));
    return Array.from(map.values());
  };

  /* ================= AUTH + SUBSCRIPTIONS ================= */

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      const uid = u?.uid || null;
      setUserUid(uid);
      if (!uid) return;

      const unsubVSIR = subscribeVSIRRecords(uid, (docs) => {
        const safeDocs = (docs || []).filter(
          (d: any) => !deletingIdsRef.current.has(String(d.id))
        );

        const deduped = deduplicateVSIRRecords(
          safeDocs.map(d => ({ ...d })) as VSRIRecord[]
        );

        setRecords(deduped);
      });

      const unsubPurchaseData = subscribePurchaseData(uid, setPurchaseData);
      return () => {
        unsubVSIR?.();
        unsubPurchaseData?.();
      };
    });

    return () => unsubAuth();
  }, []);

  /* ================= DELETE (PRODUCTION SAFE) ================= */

  const handleDelete = async (rec: VSRIRecord) => {
    if (!userUid || !rec?.id) return;
    if (!window.confirm('Delete this VSIR record permanently?')) return;

    try {
      deletingIdsRef.current.add(rec.id);
      await deleteVSIRRecord(userUid, rec.id);
      console.log('[VSIR] Deleted:', rec.id);
      // DO NOT setRecords – Firestore snapshot will update UI
    } catch (e) {
      deletingIdsRef.current.delete(rec.id);
      alert('Delete failed. Please retry.');
      console.error(e);
    }
  };

  /* ================= AUTO DELETE SAFE GUARD ================= */

  useEffect(() => {
    if (!autoDeleteEnabled) return;
    if (deletingIdsRef.current.size > 0) return;
    if (!userUid) return;

    if (purchaseData.length === 0 && records.length > 0) {
      if (!window.confirm('Auto-delete ALL VSIR records?')) return;

      records.forEach(async (r) => {
        if (deletingIdsRef.current.has(r.id)) return;
        deletingIdsRef.current.add(r.id);
        await deleteVSIRRecord(userUid, r.id);
      });
    }
  }, [purchaseData, autoDeleteEnabled]);

  /* ================= RENDER ================= */

  return (
    <div>
      <h2>VSRI Module</h2>

      <label>
        <input
          type="checkbox"
          checked={autoDeleteEnabled}
          onChange={e => setAutoDeleteEnabled(e.target.checked)}
        /> Auto Delete
      </label>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {VSRI_MODULE_FIELDS.map(f => (
                <th key={f.key}>{f.label}</th>
              ))}
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id}>
                {VSRI_MODULE_FIELDS.map(f => (
                  <td key={f.key}>{(r as any)[f.key]}</td>
                ))}
                <td>
                  <button
                    style={{ background: 'red', color: '#fff' }}
                    onClick={() => handleDelete(r)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default VSIRModule;