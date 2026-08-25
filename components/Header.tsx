import React from 'react';
import { FaBroadcastTower } from 'react-icons/fa';
import { FiCheckCircle } from 'react-icons/fi';
import { LicenseInfo } from '../types';

type SaveStatus = 'idle' | 'saving' | 'saved';

interface Props {
  saveStatus: SaveStatus;
  license: LicenseInfo;
  username?: string;
  onLogout: () => void;
}

const SaveIndicator: React.FC<{ status: SaveStatus }> = ({ status }) => {
  if (status === 'idle') return null;
  return (
    <span className="hidden items-center text-xs text-slate-500 md:inline-flex">
      {status === 'saving' ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-sky-500" /> : <FiCheckCircle className="h-4 w-4 text-emerald-600" />}
      <span className="ml-2">{status === 'saving' ? 'Saving' : 'Saved'}</span>
    </span>
  );
};

const Header: React.FC<Props> = ({ saveStatus, license, username, onLogout }) => {
  const active = license.status === 'activated';
  const expired = license.status === 'expired';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xl shadow-sm">
      <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--primary)] text-white">
            <FaBroadcastTower className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-slate-950 md:text-base">Kasvian Media Server</h1>
            <p className="hidden truncate text-xs text-slate-500 md:block">Kasvian Media Console</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <SaveIndicator status={saveStatus} />
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${active ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : expired ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-100' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'}`}>
            {active ? 'Activated' : expired ? 'License Expired' : 'Unlicensed Version'}
          </span>
          {license.expiresAt && <span className="hidden text-xs text-slate-500 xl:block">Expires {new Date(license.expiresAt).toLocaleDateString()}</span>}
          <span className="hidden text-xs font-medium text-slate-600 md:inline">{username}</span>
          <button onClick={onLogout} className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--primary-hover)]">Logout</button>
        </div>
      </div>
    </header>
  );
};

export default Header;
