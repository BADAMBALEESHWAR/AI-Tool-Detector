import { useState } from 'react';
import toast from 'react-hot-toast';
import { UserPlus } from 'lucide-react';
import { api } from '../lib/api';

/** Superadmin-only form for creating further administrator accounts. */
export default function AddAdminCard() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

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
          Public admin sign-up is disabled. Create accounts for other staff here. They can sign in immediately with the password you set.
        </p>
      </div>
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
