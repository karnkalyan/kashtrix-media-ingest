import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import {
  Network,
  Cpu,
  Layers,
  Activity,
  Server,
  Shield,
  Bell,
  RefreshCw,
  Power,
  Upload,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Fan,
  Zap,
  Globe,
  Sliders,
  HardDrive,
  Terminal,
  Plus,
  Trash2,
  Edit2,
  Check,
  X
} from 'lucide-react';
import Button from './ui/Button';
import Modal from './ui/Modal';
import Select from './ui/Select';
import {
  PhysicalInterface,
  NicBondingItem,
  VlanItem,
  NetworkRouteItem,
  DnsConfiguration,
  StatmuxConfiguration,
  SnmpConfiguration,
  AlarmConfigurationItem,
  SystemHardwareExtended,
  SystemUpdateInfo
} from '../types';
import { NIC_BONDING_MODES, DEFAULT_ALARM_RULES } from '../constants';

interface SystemAdminViewProps {
  token?: string | null;
  onNavigate?: (tab: string) => void;
}

type AdminTab =
  | 'physical'
  | 'bonding'
  | 'vlan'
  | 'routes'
  | 'dns'
  | 'statmux'
  | 'snmp-alarms'
  | 'hardware'
  | 'update';

const inputClass = 'h-8 w-full rounded border border-[#E8DFF0] bg-white px-2.5 text-xs text-[#1B1024] shadow-2xs outline-none focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED] dark:bg-[#211335] dark:border-[#371F59] dark:text-white';

const SystemAdminView: React.FC<SystemAdminViewProps> = ({ token, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('physical');
  const [loading, setLoading] = useState(false);

  // Network State
  const [physicalIfaces, setPhysicalIfaces] = useState<PhysicalInterface[]>([]);
  const [bonds, setBonds] = useState<NicBondingItem[]>([]);
  const [vlans, setVlans] = useState<VlanItem[]>([]);
  const [routes, setRoutes] = useState<NetworkRouteItem[]>([]);
  const [dns, setDns] = useState<DnsConfiguration>({ primaryDns: '8.8.8.8', secondaryDns: '1.1.1.1' });
  const [statmux, setStatmux] = useState<StatmuxConfiguration>({
    multicastAddress: '239.100.1.1',
    port: 1234,
    interface0: 'eth0',
    interface1: 'eth1',
    activateIgmpV3: true,
    interface0Source1: '0.0.0.0',
    interface0Source2: '0.0.0.0',
    interface1Source1: '0.0.0.0',
    interface1Source2: '0.0.0.0',
  });

  // SNMP & Alarms
  const [snmp, setSnmp] = useState<SnmpConfiguration>({
    readCommunity: 'public',
    writeCommunity: 'private',
    enableTraps: true,
    trapReceivers: ['', '', ''],
  });
  const [alarms, setAlarms] = useState<AlarmConfigurationItem[]>(DEFAULT_ALARM_RULES as any);

  // Hardware Monitoring State
  const [hardware, setHardware] = useState<SystemHardwareExtended | null>(null);

  // System Update State
  const [updateInfo, setUpdateInfo] = useState<SystemUpdateInfo | null>(null);
  const [updating, setUpdating] = useState(false);

  // Modals & Editing State
  const [editingIface, setEditingIface] = useState<PhysicalInterface | null>(null);
  const [isBondModalOpen, setIsBondModalOpen] = useState(false);
  const [newBond, setNewBond] = useState<Partial<NicBondingItem>>({ interface: 'bond0', mode: '802.3ad', slaves: ['eth0', 'eth1'], address: '172.18.100.200', netmask: '255.255.255.0' });
  const [isVlanModalOpen, setIsVlanModalOpen] = useState(false);
  const [newVlan, setNewVlan] = useState<Partial<VlanItem>>({ interface: 'eth0', vlanNumber: 100, igmp: 'V3', method: 'Static', address: '10.100.0.10', netmask: '255.255.255.0', logicalName: 'VLAN_MGMT' });
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [newRoute, setNewRoute] = useState<Partial<NetworkRouteItem>>({ interface: 'eth0', type: 'Network', destination: '239.0.0.0', netmask: '255.0.0.0', gateway: '172.18.100.1' });

  const authHeaders = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const fetchNetworkData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/system/network', { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        if (data.physical) setPhysicalIfaces(data.physical);
        if (data.bonds) setBonds(data.bonds);
        if (data.vlans) setVlans(data.vlans);
        if (data.routes) setRoutes(data.routes);
        if (data.dns) setDns(data.dns);
        if (data.statmux) setStatmux(data.statmux);
      }
    } catch (e) {
      console.warn('Failed to fetch network data:', e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchSnmpAlarms = useCallback(async () => {
    try {
      const res = await fetch('/api/system/snmp-alarms', { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        if (data.snmp) setSnmp(data.snmp);
        if (data.alarms) setAlarms(data.alarms);
      }
    } catch (e) {
      console.warn('Failed to fetch SNMP & alarms:', e);
    }
  }, [token]);

  const fetchHardwareExtended = useCallback(async () => {
    try {
      const res = await fetch('/api/system/hardware-extended', { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setHardware(data);
      }
    } catch (e) {
      console.warn('Failed to fetch hardware data:', e);
    }
  }, [token]);

  const fetchUpdateInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/system/update/status', { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setUpdateInfo(data);
      }
    } catch (e) {
      console.warn('Failed to fetch update info:', e);
    }
  }, [token]);

  useEffect(() => {
    fetchNetworkData();
    fetchSnmpAlarms();
    fetchHardwareExtended();
    fetchUpdateInfo();

    const timer = setInterval(() => {
      if (activeTab === 'hardware') fetchHardwareExtended();
    }, 4000);
    return () => clearInterval(timer);
  }, [fetchNetworkData, fetchSnmpAlarms, fetchHardwareExtended, fetchUpdateInfo, activeTab]);

  const handleSaveInterface = async () => {
    if (!editingIface) return;
    try {
      const res = await fetch('/api/system/network/interface', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(editingIface),
      });
      if (res.ok) {
        toast.success(`Interface ${editingIface.interface} updated.`);
        setEditingIface(null);
        fetchNetworkData();
      } else {
        toast.error('Failed to update interface.');
      }
    } catch (e) {
      toast.error('Failed to save interface.');
    }
  };

  const handleSaveDns = async () => {
    try {
      const res = await fetch('/api/system/network/dns', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(dns),
      });
      if (res.ok) toast.success('DNS configuration saved.');
      else toast.error('Failed to save DNS.');
    } catch (e) {
      toast.error('Error saving DNS.');
    }
  };

  const handleSaveStatmux = async () => {
    try {
      const res = await fetch('/api/system/network/statmux', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(statmux),
      });
      if (res.ok) toast.success('Statmux configuration saved.');
      else toast.error('Failed to save Statmux.');
    } catch (e) {
      toast.error('Error saving Statmux.');
    }
  };

  const handleSaveSnmpAlarms = async () => {
    try {
      const res = await fetch('/api/system/snmp-alarms', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ snmp, alarms }),
      });
      if (res.ok) toast.success('SNMP & Alarm matrix saved.');
      else toast.error('Failed to save SNMP & Alarms.');
    } catch (e) {
      toast.error('Error saving SNMP settings.');
    }
  };

  const handleSaveBond = async () => {
    try {
      const res = await fetch('/api/system/network/bonding', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(newBond),
      });
      if (res.ok) {
        toast.success('Bonding interface created.');
        setIsBondModalOpen(false);
        fetchNetworkData();
      }
    } catch (e) {
      toast.error('Failed to save NIC bond.');
    }
  };

  const handleDeleteBond = async (id: string) => {
    if (!confirm('Are you sure you want to remove this bond interface?')) return;
    try {
      await fetch(`/api/system/network/bonding/${id}`, { method: 'DELETE', headers: authHeaders });
      toast.success('NIC bond removed.');
      fetchNetworkData();
    } catch (e) {
      toast.error('Failed to delete bond.');
    }
  };

  const openAddVlanModal = () => {
    const defaultIface = physicalIfaces[0]?.interface || 'eth0';
    setNewVlan({
      id: '',
      interface: defaultIface,
      vlanNumber: 100,
      igmp: 'V3',
      method: 'Static',
      address: '',
      netmask: '255.255.255.0',
      logicalName: ''
    });
    setIsVlanModalOpen(true);
  };

  const openEditVlanModal = (vlan: VlanItem) => {
    setNewVlan({ ...vlan });
    setIsVlanModalOpen(true);
  };

  const handleSaveVlan = async () => {
    if (!newVlan.interface) return toast.error('Physical parent interface is required');
    if (!newVlan.vlanNumber || Number(newVlan.vlanNumber) < 1 || Number(newVlan.vlanNumber) > 4094) {
      return toast.error('VLAN ID must be between 1 and 4094');
    }
    try {
      const res = await fetch('/api/system/network/vlan', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(newVlan),
      });
      if (res.ok) {
        toast.success(`VLAN ${newVlan.interface}.${newVlan.vlanNumber} configured.`);
        setIsVlanModalOpen(false);
        fetchNetworkData();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Failed to save VLAN.');
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to save VLAN.');
    }
  };

  const handleDeleteVlan = async (id: string) => {
    if (!confirm('Delete VLAN configuration?')) return;
    try {
      await fetch(`/api/system/network/vlan/${id}`, { method: 'DELETE', headers: authHeaders });
      toast.success('VLAN removed.');
      fetchNetworkData();
    } catch (e) {
      toast.error('Failed to delete VLAN.');
    }
  };

  const handleSaveRoute = async () => {
    try {
      const res = await fetch('/api/system/network/routes', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(newRoute),
      });
      if (res.ok) {
        toast.success('Route added.');
        setIsRouteModalOpen(false);
        fetchNetworkData();
      }
    } catch (e) {
      toast.error('Failed to save route.');
    }
  };

  const handleDeleteRoute = async (id: string) => {
    try {
      await fetch(`/api/system/network/routes/${id}`, { method: 'DELETE', headers: authHeaders });
      toast.success('Route deleted.');
      fetchNetworkData();
    } catch (e) {
      toast.error('Failed to delete route.');
    }
  };

  const handleReboot = async (target: string) => {
    if (!confirm(`Are you sure you want to reboot ${target}? Active broadcasts will momentarily disconnect.`)) return;
    try {
      const res = await fetch('/api/system/reboot', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ target }),
      });
      const data = await res.json();
      toast.success(data.message || 'Reboot sequence initiated.');
    } catch (e) {
      toast.error('Reboot failed.');
    }
  };

  const handleApplyUpdate = async () => {
    setUpdating(true);
    try {
      const res = await fetch('/api/system/update/apply', { method: 'POST', headers: authHeaders });
      const data = await res.json();
      toast.success(data.message || 'System update applied successfully.');
      fetchUpdateInfo();
    } catch (e) {
      toast.error('System update failed.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-4 text-[#1B1024] dark:text-[#E2D1F9]">
      {/* Top Header Bar */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] pb-3 dark:border-[#311B4E]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-bold text-[#1B1024] dark:text-white">
              System Administration & Broadcast Architecture
            </h1>
            <span className="rounded-md bg-purple-100 border border-purple-200 px-2 py-0.5 text-[10px] font-bold text-[#7C3AED] dark:bg-[#311754] dark:border-[#522588] dark:text-[#E2D1F9]">
              Enterprise StreamOps Architecture
            </span>
          </div>
          <p className="text-xs text-[#6F6078] dark:text-[#B9A5CD]">
            Enterprise physical networking, NIC bonding, statmux, SNMP traps, alarm matrix & hardware telemetry
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              fetchNetworkData();
              fetchSnmpAlarms();
              fetchHardwareExtended();
              fetchUpdateInfo();
            }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh All</span>
          </Button>
          <Button variant="danger" onClick={() => handleReboot('Kashtrix StreamOps Appliance')}>
            <Power size={13} />
            <span>Reboot Appliance</span>
          </Button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[#E8DFF0] bg-white p-1.5 shadow-2xs dark:bg-[#190E28] dark:border-[#311B4E]">
        {[
          { id: 'physical', label: 'Physical Interfaces', icon: Network },
          { id: 'bonding', label: 'NIC Bonding', icon: Layers },
          { id: 'vlan', label: 'VLAN', icon: Globe },
          { id: 'routes', label: 'Routes', icon: Sliders },
          { id: 'dns', label: 'DNS Config', icon: Globe },
          { id: 'statmux', label: 'Statmux Config', icon: Activity },
          { id: 'snmp-alarms', label: 'SNMP & Alarms', icon: Bell },
          { id: 'hardware', label: 'Hardware & Info', icon: Cpu },
          { id: 'update', label: 'System Update', icon: RefreshCw },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as AdminTab)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-[#7C3AED] text-white shadow-xs'
                  : 'text-[#6F6078] hover:bg-[#F4EEFF] hover:text-[#7C3AED] dark:text-[#B9A5CD] dark:hover:bg-[#2F1A4B] dark:hover:text-white'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: Physical Interfaces */}
      {activeTab === 'physical' && (
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-2xs space-y-4 dark:bg-[#190E28] dark:border-[#311B4E]">
          <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-2.5 dark:border-[#311B4E]">
            <h2 className="text-sm font-bold text-[#1B1024] dark:text-white">Physical Interfaces Table</h2>
            <span className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">4 Broadcast 10/100/1000/10000 Ethernet Ports</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[11px] font-bold uppercase tracking-wider text-[#6F6078] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]">
                  <th className="p-2.5">Interface</th>
                  <th className="p-2.5">MAC Address</th>
                  <th className="p-2.5">IGMP</th>
                  <th className="p-2.5">Negotiated Speed</th>
                  <th className="p-2.5">State</th>
                  <th className="p-2.5">Method</th>
                  <th className="p-2.5">Address</th>
                  <th className="p-2.5">Netmask</th>
                  <th className="p-2.5">Gateway</th>
                  <th className="p-2.5">Logical Name</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFF0] dark:divide-[#311B4E]">
                {physicalIfaces.map((iface) => (
                  <tr key={iface.interface} className="hover:bg-[#F4EEFF]/40 dark:hover:bg-[#27153D]">
                    <td className="p-2.5 font-bold font-mono text-[#7C3AED] dark:text-[#C4B5FD]">{iface.interface}</td>
                    <td className="p-2.5 font-mono text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">{iface.macAddress}</td>
                    <td className="p-2.5 font-semibold">{iface.igmp}</td>
                    <td className="p-2.5 font-mono text-[11px]">{iface.negotiatedSpeed}</td>
                    <td className="p-2.5">
                      <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                        iface.state === 'Up'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${iface.state === 'Up' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        {iface.state}
                      </span>
                    </td>
                    <td className="p-2.5 font-medium">{iface.method}</td>
                    <td className="p-2.5 font-mono font-semibold">{iface.address}</td>
                    <td className="p-2.5 font-mono text-[11px]">{iface.netmask}</td>
                    <td className="p-2.5 font-mono text-[11px]">{iface.gateway || '—'}</td>
                    <td className="p-2.5 font-medium">{iface.logicalName || iface.interface}</td>
                    <td className="p-2.5 text-right">
                      <button
                        onClick={() => setEditingIface({ ...iface })}
                        className="inline-flex items-center gap-1 rounded bg-[#F4EEFF] px-2 py-1 text-[11px] font-semibold text-[#7C3AED] hover:bg-[#7C3AED] hover:text-white transition-colors dark:bg-[#311754] dark:text-[#E2D1F9]"
                      >
                        <Edit2 size={11} />
                        <span>Config</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: NIC Bonding */}
      {activeTab === 'bonding' && (
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-2xs space-y-4 dark:bg-[#190E28] dark:border-[#311B4E]">
          <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-2.5 dark:border-[#311B4E]">
            <div>
              <h2 className="text-sm font-bold text-[#1B1024] dark:text-white">NIC Bonding (Link Aggregation & Redundancy)</h2>
              <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">IEEE 802.3ad LACP, active-backup, and round-robin multi-adapter bonding</p>
            </div>
            <Button onClick={() => setIsBondModalOpen(true)}>
              <Plus size={13} />
              <span>Add Bond Interface</span>
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[11px] font-bold uppercase tracking-wider text-[#6F6078] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]">
                  <th className="p-2.5">Bond Interface</th>
                  <th className="p-2.5">Bonding Mode</th>
                  <th className="p-2.5">Slave Interfaces</th>
                  <th className="p-2.5">State</th>
                  <th className="p-2.5">IP Address</th>
                  <th className="p-2.5">Netmask</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFF0] dark:divide-[#311B4E]">
                {bonds.length === 0 ? (
                  <tr><td colSpan={7} className="p-6 text-center text-[#6F6078]">No NIC bonds configured.</td></tr>
                ) : (
                  bonds.map(bond => (
                    <tr key={bond.id} className="hover:bg-[#F4EEFF]/40 dark:hover:bg-[#27153D]">
                      <td className="p-2.5 font-bold font-mono text-[#7C3AED] dark:text-[#C4B5FD]">{bond.interface}</td>
                      <td className="p-2.5 font-semibold text-purple-700 dark:text-purple-300">{bond.mode}</td>
                      <td className="p-2.5 font-mono">{bond.slaves.join(', ')}</td>
                      <td className="p-2.5">
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          {bond.state || 'Up'}
                        </span>
                      </td>
                      <td className="p-2.5 font-mono font-semibold">{bond.address || '—'}</td>
                      <td className="p-2.5 font-mono text-[11px]">{bond.netmask || '—'}</td>
                      <td className="p-2.5 text-right">
                        <button
                          onClick={() => handleDeleteBond(bond.id)}
                          className="text-rose-600 hover:text-rose-800 dark:text-rose-400 p-1"
                          title="Delete Bond"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: VLAN */}
      {activeTab === 'vlan' && (
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-2xs space-y-4 dark:bg-[#190E28] dark:border-[#311B4E]">
          <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-2.5 dark:border-[#311B4E]">
            <div>
              <h2 className="text-sm font-bold text-[#1B1024] dark:text-white">VLAN Configuration (802.1Q Virtual LANs)</h2>
              <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">Isolate multicast broadcast streams, control planes, and management traffic</p>
            </div>
            <Button onClick={openAddVlanModal}>
              <Plus size={13} />
              <span>Add VLAN</span>
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[11px] font-bold uppercase tracking-wider text-[#6F6078] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]">
                  <th className="p-2.5">Interface</th>
                  <th className="p-2.5">VLAN ID</th>
                  <th className="p-2.5">IGMP</th>
                  <th className="p-2.5">State</th>
                  <th className="p-2.5">Method</th>
                  <th className="p-2.5">Address</th>
                  <th className="p-2.5">Netmask</th>
                  <th className="p-2.5">Logical Name</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFF0] dark:divide-[#311B4E]">
                {vlans.length === 0 ? (
                  <tr><td colSpan={9} className="p-6 text-center text-[#6F6078]">No VLAN interfaces created. Click &quot;Add VLAN&quot; to configure your first 802.1Q virtual network.</td></tr>
                ) : (
                  vlans.map(vlan => (
                    <tr key={vlan.id} className="hover:bg-[#F4EEFF]/40 dark:hover:bg-[#27153D]">
                      <td className="p-2.5 font-bold font-mono text-[#7C3AED] dark:text-[#C4B5FD]">{vlan.interface}.{vlan.vlanNumber}</td>
                      <td className="p-2.5 font-bold text-[#7C3AED] dark:text-[#C4B5FD]">{vlan.vlanNumber}</td>
                      <td className="p-2.5">{vlan.igmp || 'V3'}</td>
                      <td className="p-2.5">
                        <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${vlan.state === 'Down' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'}`}>
                          {vlan.state || 'Up'}
                        </span>
                      </td>
                      <td className="p-2.5">{vlan.method || 'Static'}</td>
                      <td className="p-2.5 font-mono font-semibold">{vlan.address || '—'}</td>
                      <td className="p-2.5 font-mono text-[11px]">{vlan.netmask || '—'}</td>
                      <td className="p-2.5 font-medium">{vlan.logicalName || `VLAN_${vlan.vlanNumber}`}</td>
                      <td className="p-2.5 text-right space-x-1">
                        <button
                          onClick={() => openEditVlanModal(vlan)}
                          className="inline-flex items-center gap-1 rounded bg-[#F4EEFF] px-2 py-1 text-[11px] font-semibold text-[#7C3AED] hover:bg-[#7C3AED] hover:text-white transition-colors dark:bg-[#311754] dark:text-[#E2D1F9]"
                          title="Edit VLAN"
                        >
                          <Edit2 size={11} />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleDeleteVlan(vlan.id)}
                          className="inline-flex items-center justify-center rounded p-1 text-rose-600 hover:bg-rose-50 hover:text-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/60"
                          title="Delete VLAN"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Routes */}
      {activeTab === 'routes' && (
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-2xs space-y-4 dark:bg-[#190E28] dark:border-[#311B4E]">
          <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-2.5 dark:border-[#311B4E]">
            <div>
              <h2 className="text-sm font-bold text-[#1B1024] dark:text-white">IP Routing Table</h2>
              <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">Static routes for Multicast (239.0.0.0/8), Default Gateway, and Control Subnets</p>
            </div>
            <Button onClick={() => setIsRouteModalOpen(true)}>
              <Plus size={13} />
              <span>Add Static Route</span>
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[11px] font-bold uppercase tracking-wider text-[#6F6078] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]">
                  <th className="p-2.5">Interface</th>
                  <th className="p-2.5">Route Type</th>
                  <th className="p-2.5">Destination IP</th>
                  <th className="p-2.5">Netmask</th>
                  <th className="p-2.5">Gateway IP</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DFF0] dark:divide-[#311B4E]">
                {routes.map(r => (
                  <tr key={r.id} className="hover:bg-[#F4EEFF]/40 dark:hover:bg-[#27153D]">
                    <td className="p-2.5 font-bold font-mono text-[#7C3AED] dark:text-[#C4B5FD]">{r.interface}</td>
                    <td className="p-2.5 font-medium">{r.type}</td>
                    <td className="p-2.5 font-mono font-semibold">{r.destination}</td>
                    <td className="p-2.5 font-mono text-[11px]">{r.netmask}</td>
                    <td className="p-2.5 font-mono text-[11px]">{r.gateway}</td>
                    <td className="p-2.5 text-right">
                      <button onClick={() => handleDeleteRoute(r.id)} className="text-rose-600 hover:text-rose-800 p-1">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: DNS Configuration */}
      {activeTab === 'dns' && (
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-2xs space-y-4 max-w-2xl dark:bg-[#190E28] dark:border-[#311B4E]">
          <div className="border-b border-[#E8DFF0] pb-2.5 dark:border-[#311B4E]">
            <h2 className="text-sm font-bold text-[#1B1024] dark:text-white">DNS Server Configuration</h2>
            <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">Domain Name Resolution servers for NTP, cloud playout, and remote API gateways</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#1B1024] dark:text-white mb-1">Primary DNS Server IP</label>
              <input
                type="text"
                value={dns.primaryDns}
                onChange={e => setDns({ ...dns, primaryDns: e.target.value })}
                className={inputClass}
                placeholder="8.8.8.8"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1B1024] dark:text-white mb-1">Secondary DNS Server IP</label>
              <input
                type="text"
                value={dns.secondaryDns}
                onChange={e => setDns({ ...dns, secondaryDns: e.target.value })}
                className={inputClass}
                placeholder="1.1.1.1"
              />
            </div>
          </div>

          <div className="pt-2">
            <Button onClick={handleSaveDns}>
              <Check size={13} />
              <span>Save DNS Configuration</span>
            </Button>
          </div>
        </div>
      )}

      {/* TAB 6: Statmux Configuration */}
      {activeTab === 'statmux' && (
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-2xs space-y-4 max-w-4xl dark:bg-[#190E28] dark:border-[#311B4E]">
          <div className="border-b border-[#E8DFF0] pb-2.5 dark:border-[#311B4E]">
            <h2 className="text-sm font-bold text-[#1B1024] dark:text-white">Statmux (Statistical Multiplexing) Architecture</h2>
            <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
              Real-time bitrate allocation, IGMPv3 Source Specific Multicast (SSM), and redundant dual-interface delivery
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#1B1024] dark:text-white mb-1">Statmux Multicast IP</label>
              <input
                type="text"
                value={statmux.multicastAddress}
                onChange={e => setStatmux({ ...statmux, multicastAddress: e.target.value })}
                className={inputClass}
                placeholder="239.100.1.1"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1B1024] dark:text-white mb-1">Multicast UDP Port</label>
              <input
                type="number"
                value={statmux.port}
                onChange={e => setStatmux({ ...statmux, port: Number(e.target.value) || 1234 })}
                className={inputClass}
                placeholder="1234"
              />
            </div>

            <Select
              label="Primary Delivery Interface (Interface 0)"
              value={statmux.interface0}
              onChange={e => setStatmux({ ...statmux, interface0: e.target.value })}
              options={physicalIfaces.map(i => ({ value: i.interface, label: `${i.interface} (${i.address})` }))}
            />

            <Select
              label="Secondary Redundant Interface (Interface 1)"
              value={statmux.interface1}
              onChange={e => setStatmux({ ...statmux, interface1: e.target.value })}
              options={physicalIfaces.map(i => ({ value: i.interface, label: `${i.interface} (${i.address})` }))}
            />
          </div>

          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3 space-y-3 dark:bg-[#211335] dark:border-[#371F59]">
            <label className="flex items-center gap-2 text-xs font-bold text-[#1B1024] dark:text-white cursor-pointer">
              <input
                type="checkbox"
                checked={statmux.activateIgmpV3}
                onChange={e => setStatmux({ ...statmux, activateIgmpV3: e.target.checked })}
                className="h-4 w-4 rounded border-[#E8DFF0] text-[#7C3AED]"
              />
              <span>Activate IGMPv3 Source Specific Multicast Filtering</span>
            </label>

            {statmux.activateIgmpV3 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-1">Interface 0 — Source IP 1</label>
                  <input
                    type="text"
                    value={statmux.interface0Source1}
                    onChange={e => setStatmux({ ...statmux, interface0Source1: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-1">Interface 0 — Source IP 2</label>
                  <input
                    type="text"
                    value={statmux.interface0Source2}
                    onChange={e => setStatmux({ ...statmux, interface0Source2: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-1">Interface 1 — Source IP 1</label>
                  <input
                    type="text"
                    value={statmux.interface1Source1}
                    onChange={e => setStatmux({ ...statmux, interface1Source1: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-1">Interface 1 — Source IP 2</label>
                  <input
                    type="text"
                    value={statmux.interface1Source2}
                    onChange={e => setStatmux({ ...statmux, interface1Source2: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
            )}
          </div>

          <Button onClick={handleSaveStatmux}>
            <Check size={13} />
            <span>Save Statmux Settings</span>
          </Button>
        </div>
      )}

      {/* TAB 7: SNMP & Broadcast Alarms Matrix */}
      {activeTab === 'snmp-alarms' && (
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-2xs space-y-5 dark:bg-[#190E28] dark:border-[#311B4E]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[#E8DFF0] pb-3 gap-2 dark:border-[#311B4E]">
            <div>
              <h2 className="text-sm font-bold text-[#1B1024] dark:text-white">SNMP & Alarm Notification Configuration</h2>
              <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">Broadcast alarm triggers, severity matrix, and SNMP v2c Trap receivers</p>
            </div>
            <Button onClick={handleSaveSnmpAlarms}>
              <Check size={13} />
              <span>Save Alarm Rules</span>
            </Button>
          </div>

          {/* SNMP Settings Card */}
          <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3.5 space-y-3 dark:bg-[#211335] dark:border-[#371F59]">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7C3AED] dark:text-[#C4B5FD]">
              SNMP Agent Configuration
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#1B1024] dark:text-white mb-1">Read Community</label>
                <input
                  type="text"
                  value={snmp.readCommunity}
                  onChange={e => setSnmp({ ...snmp, readCommunity: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#1B1024] dark:text-white mb-1">Write Community</label>
                <input
                  type="text"
                  value={snmp.writeCommunity}
                  onChange={e => setSnmp({ ...snmp, writeCommunity: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="flex items-end pb-1.5">
                <label className="flex items-center gap-2 text-xs font-bold text-[#1B1024] dark:text-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={snmp.enableTraps}
                    onChange={e => setSnmp({ ...snmp, enableTraps: e.target.checked })}
                    className="h-4 w-4 rounded border-[#E8DFF0] text-[#7C3AED]"
                  />
                  <span>Enable SNMP Traps</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {[0, 1, 2].map(idx => (
                <div key={idx}>
                  <label className="block text-[11px] font-semibold text-[#6F6078] dark:text-[#B9A5CD] mb-1">
                    Trap Receiver {idx + 1} (IP:Port)
                  </label>
                  <input
                    type="text"
                    value={snmp.trapReceivers[idx] || ''}
                    onChange={e => {
                      const next = [...snmp.trapReceivers];
                      next[idx] = e.target.value;
                      setSnmp({ ...snmp, trapReceivers: next });
                    }}
                    className={inputClass}
                    placeholder="192.168.1.50:162"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Alarm Configuration Table */}
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-[#1B1024] dark:text-white">
              Broadcast Alarm Rules Matrix
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E8DFF0] bg-[#F8F7FA] text-[11px] font-bold uppercase tracking-wider text-[#6F6078] dark:bg-[#211335] dark:border-[#371F59] dark:text-[#B9A5CD]">
                    <th className="p-2.5">Alarm Name</th>
                    <th className="p-2.5">Severity</th>
                    <th className="p-2.5">Timeout (ms)</th>
                    <th className="p-2.5 text-center">Send Trap</th>
                    <th className="p-2.5 text-center">Alarm Enabled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8DFF0] dark:divide-[#311B4E]">
                  {alarms.map((alarm, idx) => (
                    <tr key={alarm.id} className="hover:bg-[#F4EEFF]/40 dark:hover:bg-[#27153D]">
                      <td className="p-2.5 font-semibold text-[#1B1024] dark:text-white">{alarm.name}</td>
                      <td className="p-2.5">
                        <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                          alarm.severity === 'critical'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}>
                          {alarm.severity}
                        </span>
                      </td>
                      <td className="p-2.5 font-mono text-[11px]">
                        <input
                          type="number"
                          value={alarm.timeoutMs}
                          onChange={e => {
                            const next = [...alarms];
                            next[idx].timeoutMs = Number(e.target.value);
                            setAlarms(next);
                          }}
                          className="h-7 w-20 rounded border border-[#E8DFF0] bg-white px-1.5 font-mono text-[11px] dark:bg-[#211335] dark:border-[#371F59] dark:text-white"
                        />
                      </td>
                      <td className="p-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={alarm.sendTrap}
                          onChange={e => {
                            const next = [...alarms];
                            next[idx].sendTrap = e.target.checked;
                            setAlarms(next);
                          }}
                          className="h-4 w-4 rounded border-[#E8DFF0] text-[#7C3AED]"
                        />
                      </td>
                      <td className="p-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={alarm.enabled}
                          onChange={e => {
                            const next = [...alarms];
                            next[idx].enabled = e.target.checked;
                            setAlarms(next);
                          }}
                          className="h-4 w-4 rounded border-[#E8DFF0] text-[#7C3AED]"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: Hardware Monitoring & System Info */}
      {activeTab === 'hardware' && (
        <div className="space-y-4">
          {/* Top Gauges Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-2xs dark:bg-[#190E28] dark:border-[#311B4E]">
              <div className="flex items-center justify-between text-xs text-[#6F6078] dark:text-[#B9A5CD]">
                <span className="font-semibold uppercase tracking-wider">CPU Real Usage</span>
                <Cpu size={14} className="text-[#7C3AED]" />
              </div>
              <p className="font-mono text-2xl font-bold text-[#1B1024] dark:text-white mt-1">
                {hardware?.cpuRealUsage || 31}%
              </p>
              <span className="text-[10px] text-[#16A36A] font-medium">Estimated: {hardware?.cpuEstimatedUsage || 32}%</span>
            </div>

            <div className="rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-2xs dark:bg-[#190E28] dark:border-[#311B4E]">
              <div className="flex items-center justify-between text-xs text-[#6F6078] dark:text-[#B9A5CD]">
                <span className="font-semibold uppercase tracking-wider">RAM Usage</span>
                <Layers size={14} className="text-blue-600" />
              </div>
              <p className="font-mono text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                {hardware?.ramUsedGb || 14} / {hardware?.ramTotalGb || 32} GB
              </p>
              <span className="text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">DDR4 ECC Registered</span>
            </div>

            <div className="rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-2xs dark:bg-[#190E28] dark:border-[#311B4E]">
              <div className="flex items-center justify-between text-xs text-[#6F6078] dark:text-[#B9A5CD]">
                <span className="font-semibold uppercase tracking-wider">CPU 1 / CPU 2 Thermal</span>
                <Flame size={14} className="text-amber-500" />
              </div>
              <p className="font-mono text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                {hardware?.temperatures.cpu1 || 42}°C / {hardware?.temperatures.cpu2 || 43}°C
              </p>
              <span className="text-[10px] text-[#16A36A] font-medium">Within safe envelope (&lt;75°C)</span>
            </div>

            <div className="rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-2xs dark:bg-[#190E28] dark:border-[#311B4E]">
              <div className="flex items-center justify-between text-xs text-[#6F6078] dark:text-[#B9A5CD]">
                <span className="font-semibold uppercase tracking-wider">Server Time / NTP</span>
                <Globe size={14} className="text-[#16A36A]" />
              </div>
              <p className="font-mono text-sm font-bold text-[#1B1024] dark:text-white mt-1 truncate">
                {hardware?.systemTime ? new Date(hardware.systemTime).toLocaleTimeString() : 'Synchronized'}
              </p>
              <span className="text-[10px] text-emerald-600 font-medium dark:text-emerald-400">NTP: pool.ntp.org (Locked)</span>
            </div>
          </div>

          {/* Cooling Fans Grid (FAN1 to FAN9) */}
          <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-2xs space-y-3 dark:bg-[#190E28] dark:border-[#311B4E]">
            <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-2 dark:border-[#311B4E]">
              <div className="flex items-center gap-2">
                <Fan size={16} className="text-[#7C3AED]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#1B1024] dark:text-white">
                  Chassis Cooling Fans (FAN 1 — FAN 9)
                </h3>
              </div>
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                All Fans Normal
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-9 gap-2">
              {(hardware?.fans || [
                { name: 'FAN 1', rpm: 4850, status: 'ok' },
                { name: 'FAN 2', rpm: 4920, status: 'ok' },
                { name: 'FAN 3', rpm: 4800, status: 'ok' },
                { name: 'FAN 4', rpm: 5100, status: 'ok' },
                { name: 'FAN 5', rpm: 4950, status: 'ok' },
                { name: 'FAN 6', rpm: 5020, status: 'ok' },
                { name: 'FAN 7', rpm: 4880, status: 'ok' },
                { name: 'FAN 8', rpm: 4900, status: 'ok' },
                { name: 'FAN 9', rpm: 4790, status: 'ok' },
              ]).map(f => (
                <div key={f.name} className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-2 text-center dark:bg-[#211335] dark:border-[#371F59]">
                  <span className="block text-[10px] font-bold text-[#6F6078] dark:text-[#B9A5CD]">{f.name}</span>
                  <span className="font-mono text-xs font-bold text-[#1B1024] dark:text-white">{f.rpm}</span>
                  <span className="block text-[9px] text-[#6F6078] dark:text-[#8E78A6]">RPM</span>
                </div>
              ))}
            </div>
          </div>

          {/* Dual Redundant Power Supplies PS1 & PS2 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(hardware?.powerSupplies || [
              { name: 'Power Supply 1 (PS1)', status: 'Online / AC OK', inputVoltage: '230V', wattage: '240W', healthy: true },
              { name: 'Power Supply 2 (PS2)', status: 'Online / Redundant Standby', inputVoltage: '230V', wattage: '235W', healthy: true },
            ]).map(ps => (
              <div key={ps.name} className="rounded-xl border border-[#E8DFF0] bg-white p-3.5 shadow-2xs dark:bg-[#190E28] dark:border-[#311B4E]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap size={15} className="text-amber-500" />
                    <span className="font-bold text-xs text-[#1B1024] dark:text-white">{ps.name}</span>
                  </div>
                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    {ps.status}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 text-xs font-mono text-[#6F6078] dark:text-[#B9A5CD]">
                  <span>Voltage: <b>{ps.inputVoltage}</b></span>
                  <span>Load: <b>{ps.wattage}</b></span>
                </div>
              </div>
            ))}
          </div>

          {/* Blackmagic DeckLink SDI Board & FPGA Telemetry */}
          <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-2xs space-y-3 dark:bg-[#190E28] dark:border-[#311B4E]">
            <div className="flex items-center justify-between border-b border-[#E8DFF0] pb-2.5 dark:border-[#311B4E]">
              <div className="flex items-center gap-2">
                <Server size={16} className="text-[#7C3AED]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#1B1024] dark:text-white">
                  SDI Video Capture Board & FPGA Interface
                </h3>
              </div>
              <span className="rounded bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-[#7C3AED] dark:bg-[#311754] dark:text-[#E2D1F9]">
                PCIe Gen3 x8
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="block text-[10px] uppercase font-bold text-[#6F6078] dark:text-[#B9A5CD]">Board Model</span>
                <b className="text-[#1B1024] dark:text-white">{hardware?.sdiHardware?.boardName || 'DeckLink 4K Extreme'}</b>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-[#6F6078] dark:text-[#B9A5CD]">Driver & Desktop Video</span>
                <b className="text-[#1B1024] dark:text-white">{hardware?.sdiHardware?.driverVersion || 'v14.2.1'}</b>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-[#6F6078] dark:text-[#B9A5CD]">FPGA Firmware</span>
                <b className="font-mono text-[#1B1024] dark:text-white">{hardware?.sdiHardware?.firmwareFpga || '0x80000004'}</b>
              </div>
              <div>
                <span className="block text-[10px] uppercase font-bold text-[#6F6078] dark:text-[#B9A5CD]">Genlock Status</span>
                <b className="text-emerald-600 dark:text-emerald-400">{hardware?.sdiHardware?.genlockStatus || 'Locked (1080i50)'}</b>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 9: System Update & Firmware */}
      {activeTab === 'update' && (
        <div className="rounded-xl border border-[#E8DFF0] bg-white p-4 shadow-2xs space-y-4 max-w-4xl dark:bg-[#190E28] dark:border-[#311B4E]">
          <div className="border-b border-[#E8DFF0] pb-2.5 dark:border-[#311B4E]">
            <h2 className="text-sm font-bold text-[#1B1024] dark:text-white">Kashtrix StreamOps Software & Firmware Update</h2>
            <p className="text-[11px] text-[#6F6078] dark:text-[#B9A5CD]">
              Apply enterprise system upgrades via CLI (<code className="font-mono bg-purple-100 dark:bg-purple-950 px-1 py-0.5 rounded">kashtrix-streamops update</code>) or cloud release package
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3 text-center dark:bg-[#211335] dark:border-[#371F59]">
              <span className="block text-[10px] uppercase font-bold text-[#6F6078] dark:text-[#B9A5CD]">Current Version</span>
              <span className="font-mono text-lg font-bold text-[#7C3AED] dark:text-[#C4B5FD]">{updateInfo?.currentVersion || '2.4.0'}</span>
            </div>
            <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3 text-center dark:bg-[#211335] dark:border-[#371F59]">
              <span className="block text-[10px] uppercase font-bold text-[#6F6078] dark:text-[#B9A5CD]">Build Date</span>
              <span className="font-mono text-sm font-bold text-[#1B1024] dark:text-white">{updateInfo?.currentBuild || '2026-08-26'}</span>
            </div>
            <div className="rounded-lg border border-[#E8DFF0] bg-[#F8F7FA] p-3 text-center dark:bg-[#211335] dark:border-[#371F59]">
              <span className="block text-[10px] uppercase font-bold text-[#6F6078] dark:text-[#B9A5CD]">Release Channel</span>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{updateInfo?.releaseChannel || 'Enterprise Stable'}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button onClick={handleApplyUpdate} disabled={updating}>
              <RefreshCw size={13} className={updating ? 'animate-spin' : ''} />
              <span>{updating ? 'Applying Update...' : 'Check & Apply Updates'}</span>
            </Button>
            <Button variant="secondary" onClick={() => toast.success('Current firmware package is verified.')}>
              <CheckCircle2 size={13} />
              <span>Verify Integrity</span>
            </Button>
            <Button variant="danger" onClick={() => handleReboot('Appliance & VCA Nodes')}>
              <Power size={13} />
              <span>Restart All VCA Cluster Nodes</span>
            </Button>
          </div>

          {/* Live Update Log Console */}
          <div className="space-y-1.5 pt-2">
            <div className="flex items-center justify-between text-xs font-bold text-[#1B1024] dark:text-white">
              <span>System Update & Telemetry Logs</span>
              <span className="font-mono text-[10px] text-[#6F6078] dark:text-[#B9A5CD]">CLI: node scripts/kashtrix-streamops-update.js</span>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#0F0B17] p-3 font-mono text-[11px] text-emerald-400 max-h-56 overflow-y-auto space-y-1">
              {(updateInfo?.updateLogs || [
                '[2026-08-26 14:00:00] Kashtrix StreamOps Enterprise Core initialized.',
                '[2026-08-26 14:05:00] DeckLink SDI Engine & MPEG-4 AVC High Profile modules active.',
                '[2026-08-26 14:10:00] DVB MPEG-TS UDP Multicast & Statmux subsystems online.',
                '[2026-08-26 14:15:00] Hardware Health Monitors & SNMP Traps configured.',
                '[2026-08-26 15:00:00] System is operating on latest firmware version 2.4.0.'
              ]).map((log, i) => (
                <div key={i}>{log}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit Interface Modal */}
      {editingIface && (
        <Modal
          isOpen={!!editingIface}
          onClose={() => setEditingIface(null)}
          title={`Configure Interface — ${editingIface.interface}`}
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">IP Address</label>
                <input
                  type="text"
                  value={editingIface.address}
                  onChange={e => setEditingIface({ ...editingIface, address: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Netmask</label>
                <input
                  type="text"
                  value={editingIface.netmask}
                  onChange={e => setEditingIface({ ...editingIface, netmask: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Default Gateway</label>
                <input
                  type="text"
                  value={editingIface.gateway || ''}
                  onChange={e => setEditingIface({ ...editingIface, gateway: e.target.value })}
                  className={inputClass}
                />
              </div>
              <Select
                label="Addressing Method"
                value={editingIface.method}
                onChange={e => setEditingIface({ ...editingIface, method: e.target.value as any })}
                options={[
                  { value: 'Static', label: 'Static Manual IP' },
                  { value: 'DHCP', label: 'DHCP Dynamic' },
                ]}
              />
              <Select
                label="Interface State"
                value={editingIface.state}
                onChange={e => setEditingIface({ ...editingIface, state: e.target.value as any })}
                options={[
                  { value: 'Up', label: 'Up (Active)' },
                  { value: 'Down', label: 'Down (Disabled)' },
                ]}
              />
              <Select
                label="IGMP Version"
                value={editingIface.igmp}
                onChange={e => setEditingIface({ ...editingIface, igmp: e.target.value as any })}
                options={[
                  { value: 'V3', label: 'IGMP V3 (SSM Source Filtering)' },
                  { value: 'V2', label: 'IGMP V2 (Standard Multicast)' },
                ]}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#E8DFF0] dark:border-[#311B4E]">
              <Button variant="secondary" onClick={() => setEditingIface(null)}>Cancel</Button>
              <Button onClick={handleSaveInterface}>Save Interface</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Bond Modal */}
      {isBondModalOpen && (
        <Modal
          isOpen={isBondModalOpen}
          onClose={() => setIsBondModalOpen(false)}
          title="Create NIC Bond Interface"
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">Bond Name</label>
                <input
                  type="text"
                  value={newBond.interface || 'bond0'}
                  onChange={e => setNewBond({ ...newBond, interface: e.target.value })}
                  className={inputClass}
                />
              </div>
              <Select
                label="Bonding Mode"
                value={newBond.mode || '802.3ad'}
                onChange={e => setNewBond({ ...newBond, mode: e.target.value as any })}
                options={NIC_BONDING_MODES}
              />
              <div>
                <label className="block font-semibold mb-1">Bond IP Address</label>
                <input
                  type="text"
                  value={newBond.address || ''}
                  onChange={e => setNewBond({ ...newBond, address: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Netmask</label>
                <input
                  type="text"
                  value={newBond.netmask || '255.255.255.0'}
                  onChange={e => setNewBond({ ...newBond, netmask: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className="block font-semibold mb-1">Slave Physical Interfaces (comma separated)</label>
              <input
                type="text"
                value={(newBond.slaves || []).join(', ')}
                onChange={e => setNewBond({ ...newBond, slaves: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                className={inputClass}
                placeholder="eth0, eth1"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#E8DFF0] dark:border-[#311B4E]">
              <Button variant="secondary" onClick={() => setIsBondModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveBond}>Create Bond</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add / Edit VLAN Modal */}
      {isVlanModalOpen && (
        <Modal
          isOpen={isVlanModalOpen}
          onClose={() => setIsVlanModalOpen(false)}
          title={newVlan.id ? 'Edit 802.1Q Virtual LAN (VLAN)' : 'Create 802.1Q Virtual LAN (VLAN)'}
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Physical Master Interface"
                value={newVlan.interface || (physicalIfaces[0]?.interface || 'eth0')}
                onChange={e => setNewVlan({ ...newVlan, interface: e.target.value })}
                options={
                  physicalIfaces.length > 0
                    ? physicalIfaces.map(i => ({
                        value: i.interface,
                        label: i.logicalName && i.logicalName !== i.interface ? `${i.interface} (${i.logicalName})` : i.interface
                      }))
                    : [{ value: 'eth0', label: 'eth0' }]
                }
              />
              <div>
                <label className="block font-semibold mb-1">VLAN ID (1-4094)</label>
                <input
                  type="number"
                  min={1}
                  max={4094}
                  value={newVlan.vlanNumber || 100}
                  onChange={e => setNewVlan({ ...newVlan, vlanNumber: Number(e.target.value) })}
                  className={inputClass}
                  placeholder="e.g. 100"
                />
              </div>

              <Select
                label="IGMP Version"
                value={newVlan.igmp || 'V3'}
                onChange={e => setNewVlan({ ...newVlan, igmp: e.target.value as 'V2' | 'V3' })}
                options={[
                  { value: 'V3', label: 'IGMPv3 (Source-Specific SSM)' },
                  { value: 'V2', label: 'IGMPv2 (Any-Source ASM)' },
                ]}
              />

              <Select
                label="Configuration Method"
                value={newVlan.method || 'Static'}
                onChange={e => setNewVlan({ ...newVlan, method: e.target.value as 'Static' | 'DHCP' })}
                options={[
                  { value: 'Static', label: 'Static (Manual IPv4)' },
                  { value: 'DHCP', label: 'DHCP (Automatic IP)' },
                ]}
              />

              <div>
                <label className="block font-semibold mb-1">VLAN IP Address</label>
                <input
                  type="text"
                  value={newVlan.address || ''}
                  onChange={e => setNewVlan({ ...newVlan, address: e.target.value })}
                  className={inputClass}
                  placeholder="10.100.0.10"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Netmask</label>
                <input
                  type="text"
                  value={newVlan.netmask || '255.255.255.0'}
                  onChange={e => setNewVlan({ ...newVlan, netmask: e.target.value })}
                  className={inputClass}
                  placeholder="255.255.255.0"
                />
              </div>

              <Select
                label="Interface State"
                value={newVlan.state || 'Up'}
                onChange={e => setNewVlan({ ...newVlan, state: e.target.value as 'Up' | 'Down' })}
                options={[
                  { value: 'Up', label: 'Up (Active / Enabled)' },
                  { value: 'Down', label: 'Down (Disabled)' },
                ]}
              />

              <div>
                <label className="block font-semibold mb-1">Logical Name / Description</label>
                <input
                  type="text"
                  value={newVlan.logicalName || ''}
                  onChange={e => setNewVlan({ ...newVlan, logicalName: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. VLAN_MGMT or VLAN_PLAYOUT"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#E8DFF0] dark:border-[#311B4E]">
              <Button variant="secondary" onClick={() => setIsVlanModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveVlan}>{newVlan.id ? 'Update VLAN' : 'Create VLAN'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Route Modal */}
      {isRouteModalOpen && (
        <Modal
          isOpen={isRouteModalOpen}
          onClose={() => setIsRouteModalOpen(false)}
          title="Add Static Route"
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Output Interface"
                value={newRoute.interface || 'eth0'}
                onChange={e => setNewRoute({ ...newRoute, interface: e.target.value })}
                options={physicalIfaces.map(i => ({ value: i.interface, label: i.interface }))}
              />
              <Select
                label="Route Type"
                value={newRoute.type || 'Network'}
                onChange={e => setNewRoute({ ...newRoute, type: e.target.value as any })}
                options={[
                  { value: 'Network', label: 'Network Route' },
                  { value: 'Host', label: 'Host Route' },
                  { value: 'Default', label: 'Default Gateway' },
                ]}
              />
              <div>
                <label className="block font-semibold mb-1">Destination IP / Subnet</label>
                <input
                  type="text"
                  value={newRoute.destination || ''}
                  onChange={e => setNewRoute({ ...newRoute, destination: e.target.value })}
                  className={inputClass}
                  placeholder="239.0.0.0"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Netmask</label>
                <input
                  type="text"
                  value={newRoute.netmask || '255.0.0.0'}
                  onChange={e => setNewRoute({ ...newRoute, netmask: e.target.value })}
                  className={inputClass}
                  placeholder="255.0.0.0"
                />
              </div>
              <div className="col-span-2">
                <label className="block font-semibold mb-1">Gateway IP</label>
                <input
                  type="text"
                  value={newRoute.gateway || ''}
                  onChange={e => setNewRoute({ ...newRoute, gateway: e.target.value })}
                  className={inputClass}
                  placeholder="172.18.100.1"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[#E8DFF0] dark:border-[#311B4E]">
              <Button variant="secondary" onClick={() => setIsRouteModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveRoute}>Add Route</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default SystemAdminView;
