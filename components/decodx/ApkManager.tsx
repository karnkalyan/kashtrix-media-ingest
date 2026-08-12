import React, { useEffect, useState } from 'react';
import { FiPackage, FiUploadCloud, FiZap, FiCheckCircle, FiRefreshCw, FiFileText } from 'react-icons/fi';
import toast from 'react-hot-toast';
import Card from '../ui/Card';
import Button from '../ui/Button';
import StatusBadge from '../ui/StatusBadge';

interface ApkInfo {
  version: string;
  downloadUrl: string;
  files: { name: string; size: number; url: string }[];
}

const ApkManager: React.FC = () => {
  const [apkInfo, setApkInfo] = useState<ApkInfo>({ version: '1.0.0', downloadUrl: '', files: [] });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [versionInput, setVersionInput] = useState('');
  const [forceUpdate, setForceUpdate] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchApkInfo = async () => {
    setLoading(true);
    try {
      const res = await fetch('/v1/admin/apk/info', {
        headers: { 'x-api-key': 'DecoDxPremiumDecoder@Alf@Key123' },
      });
      if (res.ok) {
        const data = await res.json();
        setApkInfo(data);
        setVersionInput(data.version || '1.0.0');
      }
    } catch (e) {
      console.error('Failed to load APK info:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApkInfo();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return toast.error('Select an APK file to upload');
    setUploading(true);
    const formData = new FormData();
    formData.append('apk', selectedFile);
    formData.append('version', versionInput);
    formData.append('forceUpdate', String(forceUpdate));

    try {
      const res = await fetch('/v1/admin/apk/upload', {
        method: 'POST',
        headers: { 'x-api-key': 'DecoDxPremiumDecoder@Alf@Key123' },
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`APK v${data.version} uploaded! Notified ${data.notifiedDevices} device(s).`);
        setSelectedFile(null);
        fetchApkInfo();
      } else {
        toast.error('APK upload failed');
      }
    } catch (e) {
      toast.error('Upload request error');
    } finally {
      setUploading(false);
    }
  };

  const handleForcePush = async () => {
    setLoading(true);
    try {
      const res = await fetch('/v1/admin/apk/force-push', {
        method: 'POST',
        headers: { 'x-api-key': 'DecoDxPremiumDecoder@Alf@Key123' },
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Force push sent to ${data.notifiedDevices} online devices`);
      }
    } catch (e) {
      toast.error('Force push failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">DecodX APK Manager</h2>
          <p className="text-xs text-[var(--text-secondary)]">Manage Android STB client releases, OTA updates, and force pushes</p>
        </div>
        <Button variant="secondary" size="sm" onClick={fetchApkInfo} loading={loading}>
          <FiRefreshCw size={14} /> Refresh Status
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Upload Form */}
        <Card>
          <h3 className="text-base font-bold text-[var(--text-primary)] mb-4">Upload New APK Release</h3>
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1">Target Version</label>
              <input
                type="text"
                value={versionInput}
                onChange={e => setVersionInput(e.target.value)}
                placeholder="1.0.1"
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] p-2.5 text-sm outline-none focus:border-[var(--primary)]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--text-primary)] mb-1">APK File (.apk)</label>
              <div className="relative border-2 border-dashed border-[var(--border)] rounded-[var(--radius-md)] p-6 text-center hover:border-[var(--primary)] transition-colors">
                <input
                  type="file"
                  accept=".apk"
                  onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <span className="mx-auto text-[var(--primary)] mb-2 block"><FiUploadCloud size={32} /></span>
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {selectedFile ? selectedFile.name : 'Click or drag APK file here'}
                </p>
                {selectedFile && (
                  <p className="text-xs text-[var(--text-muted)] mt-1">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="forceUpdate"
                checked={forceUpdate}
                onChange={e => setForceUpdate(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
              />
              <label htmlFor="forceUpdate" className="text-xs font-semibold text-[var(--text-secondary)]">
                Broadcast Force Update signal via WebSocket to connected devices
              </label>
            </div>

            <Button type="submit" className="w-full" loading={uploading} disabled={!selectedFile}>
              <FiUploadCloud size={16} /> {uploading ? 'Uploading APK...' : 'Upload & Deploy Release'}
            </Button>
          </form>
        </Card>

        {/* Current Config & Push Action */}
        <div className="space-y-6">
          <Card>
            <h3 className="text-base font-bold text-[var(--text-primary)] mb-4">Current Active Build</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <span className="text-sm text-[var(--text-muted)] font-medium">Configured Version</span>
                <span className="text-base font-extrabold text-[var(--primary)]">v{apkInfo.version || '1.0.0'}</span>
              </div>

              <div>
                <span className="text-xs font-semibold text-[var(--text-muted)] block mb-1">Download URL</span>
                <code className="text-xs font-mono text-[var(--text-secondary)] bg-[var(--surface-muted)] p-2 rounded-[var(--radius-sm)] block break-all">
                  {apkInfo.downloadUrl || 'No URL configured yet'}
                </code>
              </div>

              <div className="pt-2">
                <Button variant="danger" className="w-full" onClick={handleForcePush} loading={loading}>
                  <FiZap size={16} /> Broadcast Force Update to All Connected STBs
                </Button>
              </div>
            </div>
          </Card>

          {/* Stored Builds */}
          <Card>
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">Stored APK Releases</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {apkInfo.files?.map((file, i) => (
                <div key={i} className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-muted)] p-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--primary)]"><FiFileText size={16} /></span>
                    <span className="font-mono text-[var(--text-primary)]">{file.name}</span>
                  </div>
                  <span className="text-[var(--text-muted)] font-semibold">{(file.size / (1024 * 1024)).toFixed(1)} MB</span>
                </div>
              ))}
              {(!apkInfo.files || apkInfo.files.length === 0) && (
                <p className="text-xs text-[var(--text-muted)]">No stored APK files found in `/apk` folder.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ApkManager;
