import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-hot-toast';
import {
  FiFolder,
  FiFile,
  FiFilm,
  FiMusic,
  FiImage,
  FiDownload,
  FiTrash2,
  FiRefreshCw,
  FiUpload,
  FiPlus,
  FiSearch,
  FiPlay,
  FiCopy,
  FiGrid,
  FiList,
  FiChevronRight,
  FiHardDrive,
  FiEdit2,
  FiCheck,
  FiX,
  FiArrowLeft,
  FiExternalLink,
  FiVideo,
} from 'react-icons/fi';
import Button from './ui/Button';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';
import { KashtrixMediaPlayer } from './ui/KashtrixMediaPlayer';
import UploadProgressBar, { UploadProgressState } from './ui/UploadProgressBar';
import { uploadWithProgress } from '../utils/uploadHelper';

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  sizeFormatted: string;
  modified: string;
  type: 'folder' | 'video' | 'broadcast-video' | 'hls' | 'audio' | 'image' | 'document' | 'other';
  ext: string;
  url: string;
  canPlay?: boolean;
}

interface Breadcrumb {
  name: string;
  path: string;
}

interface FileManagerStats {
  totalFiles: number;
  totalFolders: number;
  totalSize: number;
  totalSizeFormatted: string;
}

interface FileManagerViewProps {
  token?: string | null;
  onNavigateToTranscode?: (file: { name: string; path: string }) => void;
}

const QUICK_SHORTCUTS = [
  { label: 'All Media Root', path: '', icon: FiHardDrive, color: 'text-[#7C3AED]' },
  { label: 'Recordings', path: 'recordings', icon: FiFilm, color: 'text-rose-500' },
  { label: 'VOD Library', path: 'vod', icon: FiVideo, color: 'text-purple-500' },
  { label: 'HLS Streams', path: 'hls', icon: FiFolder, color: 'text-amber-500' },
  { label: 'Raw Ingest', path: 'recorded', icon: FiFolder, color: 'text-emerald-500' },
];

export const FileManagerView: React.FC<FileManagerViewProps> = ({ token, onNavigateToTranscode }) => {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ name: 'Media Storage', path: '' }]);
  const [items, setItems] = useState<FileItem[]>([]);
  const [stats, setStats] = useState<FileManagerStats>({ totalFiles: 0, totalFolders: 0, totalSize: 0, totalSizeFormatted: '0 B' });
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterType, setFilterType] = useState<string>('all');

  // Modals & Active Actions
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<FileItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);
  const [isMkdirOpen, setIsMkdirOpen] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [renamingItem, setRenamingItem] = useState<FileItem | null>(null);
  const [newItemName, setNewItemName] = useState<string>('');
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(null);
  const uploadAbortRef = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getHeaders = useCallback((): HeadersInit => {
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    const savedToken = token || localStorage.getItem('token') || localStorage.getItem('jwt');
    if (savedToken) {
      headers['Authorization'] = `Bearer ${savedToken}`;
    }
    return headers;
  }, [token]);

  const loadDirectory = useCallback(async (pathQuery: string = currentPath) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/file-manager/list?path=${encodeURIComponent(pathQuery)}&search=${encodeURIComponent(searchQuery)}`, {
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setItems(data.items || []);
        setBreadcrumbs(data.breadcrumbs || [{ name: 'Media Storage', path: '' }]);
        setCurrentPath(data.currentPath || '');
        if (data.stats) setStats(data.stats);
      } else {
        toast.error(data.error || 'Failed to load directory');
      }
    } catch (err: any) {
      toast.error('Network error connecting to file manager: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [currentPath, searchQuery, getHeaders]);

  useEffect(() => {
    loadDirectory(currentPath);
  }, [currentPath]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadDirectory(currentPath);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch('/api/file-manager/mkdir', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ path: currentPath, name: newFolderName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || 'Folder created');
        setIsMkdirOpen(false);
        setNewFolderName('');
        loadDirectory(currentPath);
      } else {
        toast.error(data.error || 'Failed to create folder');
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const confirmDelete = async () => {
    if (!deletingItem) return;
    setDeleteLoading(true);
    try {
      const res = await fetch('/api/file-manager/delete', {
        method: 'DELETE',
        headers: getHeaders(),
        body: JSON.stringify({ path: deletingItem.path }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`"${deletingItem.name}" deleted successfully`);
        setDeletingItem(null);
        loadDirectory(currentPath);
      } else {
        toast.error(data.error || 'Failed to delete');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingItem || !newItemName.trim()) return;
    try {
      const res = await fetch('/api/file-manager/rename', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ oldPath: renamingItem.path, newName: newItemName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Renamed successfully');
        setRenamingItem(null);
        setNewItemName('');
        loadDirectory(currentPath);
      } else {
        toast.error(data.error || 'Failed to rename');
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const savedToken = token || localStorage.getItem('token') || localStorage.getItem('jwt');
    const authHeaders: Record<string, string> = {};
    if (savedToken) authHeaders['Authorization'] = `Bearer ${savedToken}`;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('files', file);

        const prefix = files.length > 1 ? `[${i + 1}/${files.length}] ` : '';
        const { promise, abort } = uploadWithProgress({
          url: `/api/file-manager/upload?path=${encodeURIComponent(currentPath)}`,
          formData,
          fileName: `${prefix}${file.name}`,
          headers: authHeaders,
          onProgress: (state) => setUploadProgress(state),
        });

        uploadAbortRef.current = abort;
        await promise;
      }

      toast.success(files.length === 1 ? `Uploaded "${files[0].name}"` : `Successfully uploaded ${files.length} files`);
      loadDirectory(currentPath);
      setTimeout(() => setUploadProgress(null), 3000);
    } catch (err: any) {
      toast.error('Upload error: ' + err.message);
    } finally {
      setUploading(false);
      uploadAbortRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const filteredItems = items.filter((item) => {
    if (filterType === 'all') return true;
    if (filterType === 'folder') return item.isDirectory;
    if (filterType === 'video') return item.type === 'video' || item.type === 'broadcast-video';
    if (filterType === 'audio') return item.type === 'audio';
    if (filterType === 'image') return item.type === 'image';
    if (filterType === 'hls') return item.type === 'hls';
    return true;
  });

  const getItemIcon = (item: FileItem) => {
    if (item.isDirectory) return <FiFolder className="text-purple-500 shrink-0" size={24} />;
    if (item.type === 'video' || item.type === 'broadcast-video') return <FiFilm className="text-emerald-500 shrink-0" size={24} />;
    if (item.type === 'audio') return <FiMusic className="text-pink-500 shrink-0" size={24} />;
    if (item.type === 'image') return <FiImage className="text-sky-500 shrink-0" size={24} />;
    if (item.type === 'hls') return <FiVideo className="text-amber-500 shrink-0" size={24} />;
    return <FiFile className="text-slate-400 shrink-0" size={24} />;
  };

  return (
    <div className="space-y-4 font-sans text-[#1B1024] dark:text-[#F1EAFA]">
      {/* Top Banner & Header */}
      <div className="rounded-2xl border border-[#E8DFF0] bg-white p-4 shadow-sm dark:border-[#311B4E] dark:bg-[#190E28]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-[#7C3AED] dark:bg-[#311754] dark:text-[#C4B5FD] shadow-xs">
                <FiFolder size={20} />
              </div>
              <div>
                <h1 className="text-lg font-extrabold text-[#1B1024] dark:text-white">
                  Media Storage &amp; File Manager
                </h1>
                <p className="text-xs text-[#6F6078] dark:text-[#B9A5CD]">
                  Universal in-app media explorer: browse, preview, stream, upload and manage local media assets
                </p>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => loadDirectory(currentPath)}
              disabled={loading}
            >
              <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </Button>

            <Button
              variant="secondary"
              onClick={() => setIsMkdirOpen(true)}
            >
              <FiPlus size={14} />
              <span>New Folder</span>
            </Button>

            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <FiUpload size={14} />
              <span>{uploading ? 'Uploading...' : 'Upload Files'}</span>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* Quick Shortcut Buttons */}
        <div className="mt-4 pt-3 border-t border-[#E8DFF0] dark:border-[#311B4E] flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mr-1">
            Quick Locations:
          </span>
          {QUICK_SHORTCUTS.map((sc) => {
            const Icon = sc.icon;
            const isCurrent = currentPath === sc.path;
            return (
              <button
                key={sc.path}
                type="button"
                onClick={() => setCurrentPath(sc.path)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  isCurrent
                    ? 'bg-[#7C3AED] text-white shadow-xs'
                    : 'bg-[#F8F7FA] text-slate-700 hover:bg-purple-50 dark:bg-[#211335] dark:text-slate-200 dark:hover:bg-[#2E1849]'
                }`}
              >
                <Icon size={13} className={isCurrent ? 'text-white' : sc.color} />
                <span>{sc.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Breadcrumb Navigation & Controls Bar */}
      <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-xs dark:border-[#311B4E] dark:bg-[#190E28] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Breadcrumb trail */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide text-xs">
          {currentPath && (
            <button
              type="button"
              onClick={() => {
                const parent = currentPath.split('/').slice(0, -1).join('/');
                setCurrentPath(parent);
              }}
              className="p-1 rounded bg-[#F8F7FA] hover:bg-purple-100 dark:bg-[#211335] dark:hover:bg-[#2E1849] transition-colors text-[#7C3AED] mr-1"
              title="Go back one folder"
            >
              <FiArrowLeft size={14} />
            </button>
          )}

          {breadcrumbs.map((b, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={b.path + idx}>
                {idx > 0 && <FiChevronRight size={12} className="text-slate-400 shrink-0" />}
                <button
                  type="button"
                  onClick={() => setCurrentPath(b.path)}
                  className={`px-2 py-0.5 rounded transition-colors truncate max-w-[160px] font-bold ${
                    isLast
                      ? 'bg-purple-100 text-[#7C3AED] dark:bg-[#311754] dark:text-[#C4B5FD]'
                      : 'text-slate-600 hover:text-[#7C3AED] hover:bg-purple-50 dark:text-slate-300 dark:hover:bg-[#211335]'
                  }`}
                >
                  {b.name}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Filter & View Mode */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Search form */}
          <form onSubmit={handleSearchSubmit} className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="h-8 w-36 sm:w-44 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] pl-7 pr-2.5 text-xs text-[#1B1024] outline-none focus:border-[#7C3AED] focus:bg-white dark:border-[#371F59] dark:bg-[#211335] dark:text-white"
            />
            <FiSearch size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
          </form>

          {/* Type Filter Select */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="h-8 rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] px-2 text-xs font-semibold text-[#1B1024] outline-none focus:border-[#7C3AED] dark:border-[#371F59] dark:bg-[#211335] dark:text-white"
          >
            <option value="all">All Items</option>
            <option value="folder">Folders</option>
            <option value="video">Videos</option>
            <option value="audio">Audio</option>
            <option value="image">Images</option>
            <option value="hls">HLS Playlists</option>
          </select>

          {/* Grid / List Toggle */}
          <div className="flex rounded-lg border border-[#E8DFF0] p-0.5 dark:border-[#371F59] bg-[#F8F7FA] dark:bg-[#211335]">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white dark:bg-[#190E28] text-[#7C3AED] shadow-2xs font-bold' : 'text-slate-400 hover:text-slate-600'}`}
              title="Grid View"
            >
              <FiGrid size={14} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white dark:bg-[#190E28] text-[#7C3AED] shadow-2xs font-bold' : 'text-slate-400 hover:text-slate-600'}`}
              title="List View"
            >
              <FiList size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Directory Content Area */}
      {loading ? (
        <div className="grid h-64 place-items-center rounded-2xl border border-[#E8DFF0] bg-white dark:border-[#311B4E] dark:bg-[#190E28]">
          <div className="flex flex-col items-center gap-2">
            <FiRefreshCw className="animate-spin text-[#7C3AED]" size={24} />
            <span className="text-xs font-semibold text-slate-500">Reading directory contents...</span>
          </div>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-dashed border-[#E8DFF0] bg-white dark:border-[#311B4E] dark:bg-[#190E28] space-y-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-50 text-[#7C3AED] dark:bg-[#311754]">
            <FiFolder size={28} />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">This folder is empty</h3>
            <p className="text-xs text-slate-400 max-w-sm">
              Upload recordings, broadcast masters, or media files to start managing and streaming.
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={() => fileInputRef.current?.click()}>
              <FiUpload size={14} />
              <span>Upload Files</span>
            </Button>
            <Button variant="secondary" onClick={() => setIsMkdirOpen(true)}>
              <FiPlus size={14} />
              <span>New Folder</span>
            </Button>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredItems.map((item) => (
            <div
              key={item.path}
              className="group relative rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-2xs hover:border-[#7C3AED] hover:shadow-md transition-all dark:border-[#311B4E] dark:bg-[#190E28] flex flex-col justify-between"
            >
              <div>
                {/* Header & Icon */}
                <div className="flex items-start justify-between gap-2">
                  <div
                    onClick={() => {
                      if (item.isDirectory) setCurrentPath(item.path);
                      else if (item.canPlay) setPreviewFile(item);
                    }}
                    className="flex items-center gap-2.5 cursor-pointer overflow-hidden flex-1"
                  >
                    <div className="p-2 rounded-lg bg-[#F8F7FA] dark:bg-[#211335] shrink-0 group-hover:scale-105 transition-transform">
                      {getItemIcon(item)}
                    </div>
                    <div className="overflow-hidden">
                      <span
                        className="block font-bold text-xs text-slate-900 dark:text-white truncate group-hover:text-[#7C3AED] transition-colors"
                        title={item.name}
                      >
                        {item.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 block">
                        {item.sizeFormatted}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-[10px] text-slate-400 flex items-center justify-between border-t border-[#F8F7FA] dark:border-[#211335] pt-2">
                  <span>{new Date(item.modified).toLocaleDateString()}</span>
                  <span className="uppercase font-bold tracking-wider text-[9px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">
                    {item.ext ? item.ext.replace('.', '') : 'DIR'}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-3 pt-2 flex items-center justify-between border-t border-[#F8F7FA] dark:border-[#211335]">
                <div className="flex items-center gap-1">
                  {item.canPlay && (
                    <button
                      type="button"
                      onClick={() => setPreviewFile(item)}
                      className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 transition-colors"
                      title="Play / Preview Media"
                    >
                      <FiPlay size={13} />
                    </button>
                  )}
                  {!item.isDirectory && (
                    <a
                      href={`${item.url}?download=1`}
                      download={item.name}
                      className="p-1.5 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/60 dark:text-sky-300 transition-colors"
                      title="Download File"
                    >
                      <FiDownload size={13} />
                    </a>
                  )}
                  {onNavigateToTranscode && !item.isDirectory && (
                    <button
                      type="button"
                      onClick={() => onNavigateToTranscode({ name: item.name, path: item.path })}
                      className="p-1.5 rounded-lg bg-purple-50 text-[#7C3AED] hover:bg-purple-100 dark:bg-[#311754] dark:text-[#C4B5FD] transition-colors"
                      title="Send to Transcode Studio"
                    >
                      <FiVideo size={13} />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingItem(item);
                      setNewItemName(item.name);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Rename"
                  >
                    <FiEdit2 size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingItem(item)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                    title="Delete"
                  >
                    <FiTrash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="rounded-xl border border-[#E8DFF0] bg-white overflow-hidden shadow-2xs dark:border-[#311B4E] dark:bg-[#190E28]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[11px] font-bold text-[#6F6078] dark:border-[#311B4E] dark:bg-[#211335] dark:text-[#B9A5CD]">
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">File Size</th>
                  <th className="py-2.5 px-3">Date Modified</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFF0] dark:divide-[#311B4E]">
                {filteredItems.map((item) => (
                  <tr
                    key={item.path}
                    className="hover:bg-[#F8F7FA] dark:hover:bg-[#211335]/50 transition-colors"
                  >
                    <td className="py-2.5 px-3">
                      <div
                        onClick={() => {
                          if (item.isDirectory) setCurrentPath(item.path);
                          else if (item.canPlay) setPreviewFile(item);
                        }}
                        className="flex items-center gap-2.5 cursor-pointer max-w-md truncate"
                      >
                        {getItemIcon(item)}
                        <span className="font-bold text-slate-900 dark:text-white hover:text-[#7C3AED] truncate">
                          {item.name}
                        </span>
                      </div>
                    </td>

                    <td className="py-2.5 px-3">
                      <span className="uppercase font-bold text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded">
                        {item.isDirectory ? 'FOLDER' : item.type}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {item.sizeFormatted}
                    </td>

                    <td className="py-2.5 px-3 text-[11px] text-slate-500 dark:text-slate-400">
                      {new Date(item.modified).toLocaleString()}
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {item.canPlay && (
                          <button
                            type="button"
                            onClick={() => setPreviewFile(item)}
                            className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                            title="Preview"
                          >
                            <FiPlay size={13} />
                          </button>
                        )}
                        {!item.isDirectory && (
                          <a
                            href={`${item.url}?download=1`}
                            download={item.name}
                            className="p-1 rounded text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950"
                            title="Download"
                          >
                            <FiDownload size={13} />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingItem(item);
                            setNewItemName(item.name);
                          }}
                          className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
                          title="Rename"
                        >
                          <FiEdit2 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingItem(item)}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"
                          title="Delete"
                        >
                          <FiTrash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer Storage Statistics Bar */}
      <div className="rounded-xl border border-[#E8DFF0] bg-white p-3 shadow-2xs dark:border-[#311B4E] dark:bg-[#190E28] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4 text-[#6F6078] dark:text-[#B9A5CD]">
          <span>
            <strong className="text-slate-900 dark:text-white font-bold">{stats.totalFolders}</strong> Folders
          </span>
          <span>•</span>
          <span>
            <strong className="text-slate-900 dark:text-white font-bold">{stats.totalFiles}</strong> Files
          </span>
          <span>•</span>
          <span>
            Total Media Size: <strong className="text-[#7C3AED] dark:text-[#C4B5FD] font-mono font-bold">{stats.totalSizeFormatted}</strong>
          </span>
        </div>

        <div className="text-[11px] font-mono text-slate-400">
          Folder: <span className="font-semibold text-slate-600 dark:text-slate-300">/media/{currentPath}</span>
        </div>
      </div>

      {/* Media Player / Preview Modal */}
      {previewFile && (
        <Modal
          isOpen={!!previewFile}
          onClose={() => setPreviewFile(null)}
          title={`Media Player & Preview — ${previewFile.name}`}
        >
          <div className="space-y-4">
            <div className="rounded-xl overflow-hidden bg-black flex items-center justify-center relative min-h-[240px]">
              {previewFile.type === 'image' ? (
                <img
                  src={previewFile.url}
                  alt={previewFile.name}
                  className="max-h-[60vh] max-w-full object-contain"
                />
              ) : previewFile.type === 'audio' ? (
                <div className="p-8 w-full flex flex-col items-center justify-center gap-4">
                  <FiMusic size={48} className="text-pink-500 animate-pulse" />
                  <audio controls autoPlay src={previewFile.url} className="w-full max-w-md" />
                </div>
              ) : (
                <KashtrixMediaPlayer
                  src={previewFile.url}
                  title={previewFile.name}
                  isLive={false}
                  autoPlay={true}
                  showAudioMeter={true}
                  maxHeight="60vh"
                />
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2 rounded-lg bg-[#F8F7FA] dark:bg-[#211335]">
                <span className="block text-[10px] text-slate-400 font-bold uppercase">File Size</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{previewFile.sizeFormatted}</span>
              </div>
              <div className="p-2 rounded-lg bg-[#F8F7FA] dark:bg-[#211335]">
                <span className="block text-[10px] text-slate-400 font-bold uppercase">Format</span>
                <span className="font-bold uppercase text-purple-600 dark:text-purple-400">{previewFile.ext.replace('.', '')}</span>
              </div>
              <div className="p-2 rounded-lg bg-[#F8F7FA] dark:bg-[#211335] col-span-2">
                <span className="block text-[10px] text-slate-400 font-bold uppercase">Server Path</span>
                <span className="font-mono text-[11px] truncate block text-slate-700 dark:text-slate-300" title={previewFile.path}>
                  /media/{previewFile.path}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E8DFF0] dark:border-[#311B4E]">
              <a
                href={`${previewFile.url}?download=1`}
                download={previewFile.name}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition-colors"
              >
                <FiDownload size={13} />
                <span>Download Media</span>
              </a>
              <Button variant="secondary" onClick={() => setPreviewFile(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* New Folder Modal */}
      {isMkdirOpen && (
        <Modal
          isOpen={isMkdirOpen}
          onClose={() => setIsMkdirOpen(false)}
          title="Create New Directory"
        >
          <form onSubmit={handleCreateFolder} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold mb-1">Folder Name</label>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="e.g. 4K_Masters or Playout_Feeds"
                className="h-9 w-full rounded-lg border border-[#E8DFF0] bg-white px-3 text-xs outline-none focus:border-[#7C3AED] dark:border-[#371F59] dark:bg-[#211335] dark:text-white"
                autoFocus
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Target: <code className="font-mono">/media/{currentPath ? `${currentPath}/` : ''}{newFolderName || '...'}</code>
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E8DFF0] dark:border-[#311B4E]">
              <Button variant="secondary" onClick={() => setIsMkdirOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!newFolderName.trim()}>
                Create Folder
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Rename Modal */}
      {renamingItem && (
        <Modal
          isOpen={!!renamingItem}
          onClose={() => setRenamingItem(null)}
          title={`Rename ${renamingItem.isDirectory ? 'Folder' : 'File'}`}
        >
          <form onSubmit={handleRename} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold mb-1">New Name</label>
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#E8DFF0] bg-white px-3 text-xs outline-none focus:border-[#7C3AED] dark:border-[#371F59] dark:bg-[#211335] dark:text-white"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E8DFF0] dark:border-[#311B4E]">
              <Button variant="secondary" onClick={() => setRenamingItem(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!newItemName.trim() || newItemName === renamingItem.name}>
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Real-time File Upload Progress Bar Card */}
      <UploadProgressBar
        upload={uploadProgress}
        onCancel={() => {
          if (uploadAbortRef.current) {
            uploadAbortRef.current();
            uploadAbortRef.current = null;
            toast('Upload cancelled');
          }
        }}
        onDismiss={() => setUploadProgress(null)}
      />

      {/* Custom Confirmation Dialog for Deletions */}
      <ConfirmDialog
        open={!!deletingItem}
        title={deletingItem?.isDirectory ? 'Delete Folder' : 'Delete Media File'}
        message={
          deletingItem?.isDirectory
            ? `Are you sure you want to permanently delete the folder "${deletingItem?.name}" and all of its contents from storage? This cannot be undone.`
            : `Are you sure you want to permanently delete "${deletingItem?.name}" from media storage?`
        }
        confirmLabel="Delete Permanently"
        variant="danger"
        loading={deleteLoading}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingItem(null)}
      />
    </div>
  );
};

export default FileManagerView;
