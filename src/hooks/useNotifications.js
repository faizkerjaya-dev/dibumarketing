import { useMemo } from 'react';
import { collection, query, where, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useQuery } from './useFirestore';

export function useNotifications() {
  const { profile } = useAuth();
  const q = useMemo(() => (profile?.uid ? query(collection(db, 'notifications'), where('toUid', '==', profile.uid)) : null), [profile?.uid]);
  const { data, loading, error } = useQuery(q, [q]);
  const items = useMemo(() => [...data].sort((a, b) => (b.createdAtIso || '').localeCompare(a.createdAtIso || '')), [data]);
  const unread = items.filter((n) => !n.read).length;
  const markRead = (id) => updateDoc(doc(db, 'notifications', id), { read: true });
  const markAllRead = async () => {
    const batch = writeBatch(db);
    items.filter((n) => !n.read).forEach((n) => batch.update(doc(db, 'notifications', n.id), { read: true }));
    await batch.commit();
  };
  return { items, unread, loading, error, markRead, markAllRead };
}
