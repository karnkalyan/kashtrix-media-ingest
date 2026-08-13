import React, { useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  Edit3,
  Trash2,
  RefreshCw,
  Shield,
  Key,
  Check,
  X,
  Search
} from 'lucide-react';
import toast from 'react-hot-toast';
import DetailDrawer from './ui/DetailDrawer';

export interface UserItem {
  id: number;
  username: string;
  role: string;
  created_at?: string;
}

export const UserManagementView: React.FC<{ currentUser?: string }> = ({ currentUser }) => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);

  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('admin');
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch('/api/users', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to fetch users');
      const userList = Array.isArray(data.users) ? data.users : (Array.isArray(data) ? data : []);
      setUsers(userList);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openCreateModal = () => {
    setEditingUser(null);
    setFormUsername('');
    setFormPassword('');
    setFormRole('admin');
    setDrawerOpen(true);
  };

  const openEditModal = (user: UserItem) => {
    setEditingUser(user);
    setFormUsername(user.username);
    setFormPassword('');
    setFormRole(user.role || 'admin');
    setDrawerOpen(true);
  };

  const saveUser = async () => {
    if (!formUsername.trim()) return toast.error('Username is required');
    if (!editingUser && !formPassword) return toast.error('Password is required for new users');

    setSubmitting(true);
    try {
      const token = localStorage.getItem('kte-auth-token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      if (editingUser) {
        const res = await fetch(`/api/users/${editingUser.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            username: formUsername.trim(),
            password: formPassword || undefined,
            role: formRole,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update user');
        toast.success('User updated successfully');
      } else {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            username: formUsername.trim(),
            password: formPassword,
            role: formRole,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create user');
        toast.success('User created successfully');
      }

      setDrawerOpen(false);
      fetchUsers();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteUser = async (user: UserItem) => {
    if (user.username === currentUser) return toast.error('You cannot delete your own logged-in account');
    if (!window.confirm(`Delete user ${user.username}? This cannot be undone.`)) return;

    try {
      const token = localStorage.getItem('kte-auth-token');
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete user');
      toast.success('User deleted');
      fetchUsers();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const filtered = users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="users-workspace page-stack space-y-4">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] bg-white px-4 py-3 rounded-xl shadow-xs">
        <div>
          <h1 className="font-display text-[18px] font-bold text-[#1B1024]">User Management</h1>
          <p className="mt-0.5 text-[12px] text-[#6F6078]">
            Create, update and manage system operators and administrator credentials
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchUsers}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-[#E8DFF0] bg-white px-3 text-[12px] font-semibold text-[#351147] hover:bg-[#F4EEFF]"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-[#351147] px-3.5 text-[12px] font-semibold text-white hover:bg-[#2B0D3A]"
          >
            <UserPlus size={14} /> Create User
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-xl border border-[#E8DFF0] bg-white shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#E8DFF0] px-4 py-2.5">
          <span className="text-[12px] font-semibold text-[#1B1024]">
            System Accounts ({filtered.length})
          </span>
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search users..."
              className="h-8 w-48 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] pl-8 pr-3 text-[12px] text-[#1B1024] outline-none focus:border-[#4A1B7A]"
            />
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6F6078]" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead>
              <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[10px] font-semibold uppercase tracking-wider text-[#6F6078]">
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Created Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8DFF0]">
              {filtered.map(user => {
                const isCurrent = user.username === currentUser;

                return (
                  <tr key={user.id} className="transition-colors hover:bg-[#F4EEFF]/50">
                    <td className="px-4 py-3 font-semibold text-[#1B1024]">
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#F4EEFF] text-[11px] font-bold text-[#4A1B7A]">
                          {user.username.charAt(0).toUpperCase()}
                        </span>
                        <span>{user.username}</span>
                        {isCurrent && (
                          <span className="rounded bg-[#F0FDF4] border border-[#BBF7D0] px-1.5 py-0.2 text-[9px] font-bold text-[#16A36A]">
                            YOU
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold ${
                        user.role === 'superadmin' || user.role === 'admin'
                          ? 'border-[#D8C6E8] bg-[#F4EEFF] text-[#4A1B7A]'
                          : 'border-[#E8DFF0] bg-[#F8F7FA] text-[#6F6078]'
                      }`}>
                        <Shield size={12} />
                        {(user.role || 'ADMIN').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[#6F6078]">
                      {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'System Default'}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => openEditModal(user)}
                        className="inline-flex items-center gap-1 rounded-md border border-[#E8DFF0] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#351147] hover:bg-[#F4EEFF]"
                      >
                        <Edit3 size={12} /> Edit
                      </button>
                      <button
                        type="button"
                        disabled={isCurrent}
                        onClick={() => deleteUser(user)}
                        className="inline-flex items-center justify-center rounded-md border border-[#E8DFF0] bg-white p-1 text-[#6F6078] hover:bg-[#FEF2F2] hover:text-[#DC3545] disabled:opacity-40"
                        title={isCurrent ? 'Cannot delete current account' : 'Delete user'}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-[#6F6078]">
                    No user accounts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Create / Edit Drawer */}
      <DetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editingUser ? `Edit User — ${editingUser.username}` : 'Create New User Account'}
        subtitle="Manage administrator access credentials and permissions"
        width="max-w-[440px]"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="h-8 rounded-md border border-[#E8DFF0] bg-white px-3 text-[12px] font-semibold text-[#6F6078]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveUser}
              disabled={submitting}
              className="flex h-8 items-center gap-1.5 rounded-md bg-[#351147] px-4 text-[12px] font-semibold text-white hover:bg-[#2B0D3A]"
            >
              <Check size={14} />
              {submitting ? 'Saving...' : editingUser ? 'Update User' : 'Create User'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-[#1B1024]">
              Username <span className="text-[#E11D72]">*</span>
            </label>
            <input
              type="text"
              value={formUsername}
              onChange={e => setFormUsername(e.target.value)}
              placeholder="e.g. operator"
              className="h-9 w-full rounded-md border border-[#E8DFF0] bg-white px-3 font-sans text-[12px] text-[#1B1024] outline-none focus:border-[#4A1B7A]"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-semibold text-[#1B1024]">
              Password {editingUser ? '(leave blank to keep unchanged)' : '*'}
            </label>
            <input
              type="password"
              value={formPassword}
              onChange={e => setFormPassword(e.target.value)}
              placeholder={editingUser ? '••••••••' : 'Enter account password'}
              className="h-9 w-full rounded-md border border-[#E8DFF0] bg-white px-3 font-sans text-[12px] text-[#1B1024] outline-none focus:border-[#4A1B7A]"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-semibold text-[#1B1024]">
              Role / Permission Level
            </label>
            <select
              value={formRole}
              onChange={e => setFormRole(e.target.value)}
              className="h-9 w-full rounded-md border border-[#E8DFF0] bg-white px-3 text-[12px] font-semibold text-[#1B1024] outline-none"
            >
              <option value="admin">Administrator (Full Access)</option>
              <option value="user">Operator (Standard Access)</option>
            </select>
          </div>
        </div>
      </DetailDrawer>
    </div>
  );
};

export default UserManagementView;
