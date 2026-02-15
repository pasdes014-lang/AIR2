import React, { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';

interface ItemMasterRecord {
  id: string;
  itemName: string;
  itemCode: string;
}

const ITEM_MASTER_FIELDS = [
  { key: 'itemName', label: 'Item Name', type: 'text' },
  { key: 'itemCode', label: 'Item Code', type: 'text' },
];

const ItemMasterModule: React.FC = () => {
  const [records, setRecords] = useState<ItemMasterRecord[]>([]);
  const [userUid, setUserUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ itemName: '', itemCode: '' });
  const [editId, setEditId] = useState<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Auth + Firestore subscription
  useEffect(() => {
    const authUnsubscribe = onAuthStateChanged(auth, (user) => {
      const uid = user?.uid || null;
      setUserUid(uid);

      // Cleanup previous listener
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      if (!uid) {
        setRecords([]);
        return;
      }

      setLoading(true);

      const colRef = collection(db, 'userData', uid, 'itemMasterData');
      const q = query(colRef, orderBy('createdAt', 'desc'));

      unsubscribeRef.current = onSnapshot(
        q,
        (snap) => {
          const docs = snap.docs.map((d) => ({
            id: d.id,
            itemName: d.data().itemName || '',
            itemCode: d.data().itemCode || '',
          }));

          setRecords(docs);
          setLoading(false);
        },
        (err) => {
          console.error('Firestore subscription error:', err);
          setLoading(false);
        }
      );
    });

    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
      authUnsubscribe();
    };
  }, []);

  // Input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userUid) return alert('Login required');
    if (!form.itemName.trim() || !form.itemCode.trim()) {
      return alert('All fields required');
    }

    setLoading(true);

    try {
      if (editId) {
        const docRef = doc(db, 'userData', userUid, 'itemMasterData', editId);
        await updateDoc(docRef, {
          itemName: form.itemName.trim(),
          itemCode: form.itemCode.trim(),
          updatedAt: serverTimestamp(),
        });
        setEditId(null);
      } else {
        const colRef = collection(db, 'userData', userUid, 'itemMasterData');
        await addDoc(colRef, {
          itemName: form.itemName.trim(),
          itemCode: form.itemCode.trim(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setForm({ itemName: '', itemCode: '' });
    } catch (err) {
      console.error('Save failed:', err);
      alert('Save failed');
    }

    setLoading(false);
  };

  // Edit
  const handleEdit = (rec: ItemMasterRecord) => {
    setForm({ itemName: rec.itemName, itemCode: rec.itemCode });
    setEditId(rec.id);
  };

  // Delete
  const handleDelete = async (id: string) => {
    if (!userUid) return alert('Login required');
    if (!window.confirm('Delete record?')) return;

    setLoading(true);

    try {
      const docRef = doc(db, 'userData', userUid, 'itemMasterData', id);
      await deleteDoc(docRef);
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Delete failed');
    }

    setLoading(false);
  };

  return (
    <div>
      <h2>Item Master Module</h2>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}
      >
        {ITEM_MASTER_FIELDS.map((field) => (
          <div key={field.key} style={{ flex: '1 1 200px' }}>
            <label>{field.label}</label>
            <input
              type={field.type}
              name={field.key}
              value={(form as any)[field.key]}
              onChange={handleChange}
              style={{ width: '100%', padding: 6 }}
            />
          </div>
        ))}

        <button type="submit" disabled={loading}>
          {loading ? 'Saving...' : editId ? 'Update' : 'Add'}
        </button>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {ITEM_MASTER_FIELDS.map((f) => (
              <th key={f.key}>{f.label}</th>
            ))}
            <th>Edit</th>
            <th>Delete</th>
          </tr>
        </thead>

        <tbody>
          {records.map((rec) => (
            <tr key={rec.id}>
              <td>{rec.itemName}</td>
              <td>{rec.itemCode}</td>
              <td>
                <button onClick={() => handleEdit(rec)}>Edit</button>
              </td>
              <td>
                <button onClick={() => handleDelete(rec.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ItemMasterModule;
