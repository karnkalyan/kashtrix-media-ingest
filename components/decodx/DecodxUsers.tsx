import React, { useEffect, useState } from 'react';
import { FiUsers, FiPlus, FiTrash2, FiEdit3, FiCheck, FiX, FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';
import Card from '../ui/Card';
import Button from '../ui/Button';
import SearchInput from '../ui/SearchInput';
import StatusBadge from '../ui/StatusBadge';
import Modal from '../ui/Modal';
import ConfirmDialog from '../ui/ConfirmDialog';

interface DecodxUser {
  id: number;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  subscription: string;
  maxDevicesAllowed: number;
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
  _count?: { devices: number };
}

const DecodxUsers: React.FC = () => {
  const [users, setUsers] = useState<DecodxUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [createModal, setCreateModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<DecodxUser | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'USER',
    subscription: 'FREE',
    maxDevicesAllowed: 5,
  });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/v1/admin/users', {
        headers: { 'x-api-key': 'DecoDxPremiumDecoder@Alf@Key123' },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) return toast.error('Email and password required');
    setActionLoading(true);
    try {
      const res = await fetch('/v1/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'DecoDxPremiumDecoder@Alf@Key123',
        },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success('User created successfully');
        setCreateModal(false);
        setForm({ email: '', password: '', firstName: '', lastName: '', role: 'USER', subscription: 'FREE', maxDevicesAllowed: 5 });
        fetchUsers();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to create user');
      }
    } catch (e) {
      toast.error('Server error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteConfirm) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/v1/admin/users/${deleteConfirm.id}`, {
        method: 'DELETE',
        headers: { 'x-api-key': 'DecoDxPremiumDecoder@Alf@Key123' },
      });
      if (res.ok) {
        toast.success('User deleted');
        setDeleteConfirm(null);
        fetchUsers();
      } else {
        toast.error('Failed to delete user');
      }
    } catch (e) {
      toast.error('Server error');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.firstName && u.firstName.toLowerCase().includes(search.toLowerCase())) ||
    (u.lastName && u.lastName.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by email or name..."
          className="w-full sm:w-80"
        />
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={fetchUsers} loading={loading}>
            <FiRefreshCw size={14} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateModal(true)}>
            <FiPlus size={16} /> Add New User
          </Button>
        </div>
      </div>

      {/* Users Table */}
      <Card padding="none">
        <div className="table-responsive">
          <table className="w-full text-left text-sm text-[var(--text-primary)]">
            <thead className="bg-[var(--surface-muted)] border-b border-[var(--border)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Subscription</th>
                <th className="px-6 py-4">Device Limit</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-bold text-[var(--text-primary)]">{user.firstName || ''} {user.lastName || ''}</div>
                    <div className="text-xs text-[var(--text-muted)] font-mono">{user.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[var(--primary-50)] text-[var(--primary)] border border-[var(--primary-200)]">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={user.subscription} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold">
                    {user._count?.devices || 0} / {user.maxDevicesAllowed} devices
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={user.isActive ? 'Active' : 'Inactive'} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                    <button
                      disabled={user.role === 'SUPER_ADMIN'}
                      onClick={() => setDeleteConfirm(user)}
                      className="p-2 text-[var(--text-secondary)] hover:text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 rounded-[var(--radius-sm)] transition-colors"
                      title={user.role === 'SUPER_ADMIN' ? 'Superadmin is CLI-managed' : 'Delete User'}
                    >
                      <FiTrash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-[var(--text-muted)]">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add User Modal */}
      <Modal
        isOpen={createModal}
        onClose={() => setCreateModal(false)}
        title="Add New User Account"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1">Email Address *</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] p-2.5 text-sm outline-none focus:border-[var(--primary)]"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1">Password *</label>
            <input
              type="password"
              required
              value={form.password}
              onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border)] p-2.5 text-sm outline-none focus:border-[var(--primary)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1">First Name</label>
              <input
                type="text"
                value={form.firstName}
                onChange={e => setForm(prev => ({ ...prev, firstName: e.target.value }))}
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] p-2.5 text-sm outline-none focus:border-[var(--primary)]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1">Last Name</label>
              <input
                type="text"
                value={form.lastName}
                onChange={e => setForm(prev => ({ ...prev, lastName: e.target.value }))}
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] p-2.5 text-sm outline-none focus:border-[var(--primary)]"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1">Role</label>
              <select
                value={form.role}
                onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))}
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] p-2.5 text-sm outline-none focus:border-[var(--primary)]"
              >
                <option value="USER">User</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1">Subscription</label>
              <select
                value={form.subscription}
                onChange={e => setForm(prev => ({ ...prev, subscription: e.target.value }))}
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] p-2.5 text-sm outline-none focus:border-[var(--primary)]"
              >
                <option value="FREE">Free</option>
                <option value="BASIC">Basic</option>
                <option value="PRO">Pro</option>
                <option value="ENTERPRISE">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1">Max Devices</label>
              <input
                type="number"
                min={1}
                max={50}
                value={form.maxDevicesAllowed}
                onChange={e => setForm(prev => ({ ...prev, maxDevicesAllowed: Number(e.target.value) || 5 }))}
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] p-2.5 text-sm outline-none focus:border-[var(--primary)]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" type="button" onClick={() => setCreateModal(false)}>Cancel</Button>
            <Button type="submit" loading={actionLoading}>Create User</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        title="Delete User"
        message={`Are you sure you want to delete user ${deleteConfirm?.email}?`}
        onConfirm={handleDeleteUser}
        onCancel={() => setDeleteConfirm(null)}
        loading={actionLoading}
      />
    </div>
  );
};

export default DecodxUsers;
