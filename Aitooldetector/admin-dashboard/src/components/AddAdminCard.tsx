import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, UserPlus, X } from 'lucide-react';
import { api } from '../lib/api';

/** Superadmin-only form for creating further administrator accounts. */
export default function AddAdminCard() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [requests, setRequests] = useState<{ id: string; name: string; email: string; createdAt: string }[]>([]);

  const loadRequests = () =>
    api.get('/admin/admin-requests').then(r => setRequests(r.data.requests || [])).catch(() => {});
  useEffect(() => { loadRequests(); }, []);

  const decide = async (id: string, approve: boolean) => {
    try {
      if (approve) await api.patch(`/admin/admin-requests/${id}/approve`);
      else await api.delete(`/admin/admin-requests/${id}`);
      toast.success(approve ? 'Access approved' : 'Request rejected');
      loadRequests();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Action failed');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast.error('Name and email are required.');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters long.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/admin/signup', { name: name.trim(), email: email.trim(), password });
      toast.success(`Administrator account created for ${email.trim()}`);
      setName('');
      setEmail('');
      setPassword('');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create administrator account.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-card p-6 space-y-4">
      <div>
        <h2 className="section-header">
          <UserPlus size={16} className="text-violet-400" />
          Administrators
        </h2>
        <p className="text-xs text-zinc-500 mt-1">
          People can request access from the sign-in page; approve them here. You can also create accounts directly, which can sign in immediately with the password you set.
        </p>
      </div>
      {requests.length > 0 && (
        <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg divide-y divide-amber-500/20">
          <p className="px-4 py-2 text-xs font-bold text-amber-300 uppercase tracking-wide">Pending access requests ({requests.length})</p>
          {requests.map(r => (
            <div key={r.id} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{r.name}</p>
                <p className="text-xs text-zinc-500 truncate">{r.email} · {new Date(r.createdAt).toLocaleDateString()}</p>
              </div>
              <button onClick={() => decide(r.id, true)} className="btn-success flex items-center gap-1"><Check size={14} />Approve</button>
              <button onClick={() => decide(r.id, false)} className="btn-danger flex items-center gap-1"><X size={14} />Reject</button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-3">
        <input className="input-admin" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
        <input className="input-admin" type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} />
        <input className="input-admin" type="password" placeholder="Temporary password (min. 8)" value={password} onChange={e => setPassword(e.target.value)} />
        <div className="sm:col-span-3 flex justify-end">
          <button type="submit" disabled={saving} className="btn-primary-admin flex items-center gap-2">
            <UserPlus size={14} />
            {saving ? 'Creating…' : 'Create Administrator'}
          </button>
        </div>
      </form>
    </div>
  );
}
