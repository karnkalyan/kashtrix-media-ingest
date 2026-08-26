const os = require('os');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const si = require('systeminformation');

/**
 * Executes a shell command safely with a timeout.
 */
const runCommand = (cmd, timeout = 4000) => {
    return new Promise((resolve) => {
        exec(cmd, { timeout, windowsHide: true }, (error, stdout, stderr) => {
            resolve({
                success: !error,
                stdout: (stdout || '').trim(),
                stderr: (stderr || '').trim(),
                error: error ? error.message : null
            });
        });
    });
};

/**
 * Initializes database table for network persistence.
 */
const initNetworkStorage = (db) => {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS system_network_config (
                key TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
    } catch (e) {
        console.warn('[NetworkManager] DB Init warn:', e.message);
    }
};

const getStoredConfig = (db, key, defaultValue) => {
    try {
        if (db && db.prisma && db.prisma.kvStore) {
            const mem = db.data && db.data.kv ? db.data.kv.find(r => r.key === key) : null;
            if (mem && mem.value) return JSON.parse(mem.value);
        }
        const row = db.prepare('SELECT data FROM system_network_config WHERE key = ?').get(key);
        if (row && row.data) return JSON.parse(row.data);
    } catch (e) {}
    return defaultValue;
};

const setStoredConfig = (db, key, value) => {
    try {
        if (db && db.setKv) {
            db.setKv(key, value);
        }
        db.prepare(`
            INSERT INTO system_network_config (key, data, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP
        `).run(key, JSON.stringify(value));
    } catch (e) {
        try { if (db && db.setKv) db.setKv(key, value); } catch (_) {}
    }
};

/**
 * Get Physical Interfaces (Hardware NICs)
 */
const getPhysicalInterfaces = async (db) => {
    const storedOverrides = getStoredConfig(db, 'physical_interfaces_overrides', {});
    let interfaces = [];

    try {
        const netIfaces = await si.networkInterfaces();
        const netStats = await si.networkStats().catch(() => []);

        if (Array.isArray(netIfaces) && netIfaces.length > 0) {
            interfaces = netIfaces
                .filter(iface => iface && !iface.internal && iface.iface !== 'lo')
                .map((iface, idx) => {
                    const stats = (Array.isArray(netStats) ? netStats.find(s => s.iface === iface.iface) : null) || {};
                    const override = storedOverrides[iface.iface] || storedOverrides[iface.id] || {};

                    return {
                        id: iface.iface || `eth${idx}`,
                        name: iface.ifaceName || iface.iface || `eth${idx}`,
                        type: iface.type || (iface.virtual ? 'Virtual' : 'Physical'),
                        macAddress: iface.mac || '00:00:00:00:00:00',
                        state: iface.operstate === 'up' ? 'Up' : (iface.operstate === 'down' ? 'Down' : 'Unknown'),
                        linkSpeed: iface.speed ? `${iface.speed} Mbps` : '1000 Mbps',
                        mtu: override.mtu || iface.mtu || 1500,
                        duplex: iface.duplex || 'Full',
                        method: override.method || (iface.dhcp ? 'DHCP' : 'Static'),
                        address: override.address || iface.ip4 || '0.0.0.0',
                        netmask: override.netmask || iface.ip4subnet || '255.255.255.0',
                        gateway: override.gateway || iface.defaultGateway || '0.0.0.0',
                        rxBytes: Number(stats.rx_bytes || 0),
                        txBytes: Number(stats.tx_bytes || 0),
                        rxSpeed: Number(stats.rx_sec || 0),
                        txSpeed: Number(stats.tx_sec || 0)
                    };
                });
        }
    } catch (e) {
        console.warn('[NetworkManager] Error reading system network interfaces:', e.message);
    }

    if (interfaces.length === 0) {
        // Fallback to os.networkInterfaces()
        const osIfaces = os.networkInterfaces();
        let idx = 0;
        for (const [name, addrs] of Object.entries(osIfaces)) {
            const v4 = Array.isArray(addrs) ? addrs.find(a => a.family === 'IPv4' && !a.internal) : null;
            if (v4) {
                const override = storedOverrides[name] || {};
                interfaces.push({
                    id: name,
                    name,
                    type: 'Physical',
                    macAddress: v4.mac || '00:00:00:00:00:00',
                    state: 'Up',
                    linkSpeed: '1000 Mbps',
                    mtu: override.mtu || 1500,
                    duplex: 'Full',
                    method: override.method || 'Static',
                    address: override.address || v4.address || '192.168.1.100',
                    netmask: override.netmask || v4.netmask || '255.255.255.0',
                    gateway: override.gateway || '192.168.1.1',
                    rxBytes: 0,
                    txBytes: 0,
                    rxSpeed: 0,
                    txSpeed: 0
                });
                idx++;
            }
        }
    }

    if (interfaces.length === 0) {
        interfaces = [
            { id: 'eth0', name: 'eth0 (Management)', type: 'Physical', macAddress: '52:54:00:12:34:56', state: 'Up', linkSpeed: '10000 Mbps', mtu: 1500, duplex: 'Full', method: 'Static', address: '172.18.100.150', netmask: '255.255.255.0', gateway: '172.18.100.1', rxBytes: 0, txBytes: 0, rxSpeed: 0, txSpeed: 0 },
            { id: 'eth1', name: 'eth1 (Playout / TS)', type: 'Physical', macAddress: '52:54:00:12:34:57', state: 'Up', linkSpeed: '10000 Mbps', mtu: 1500, duplex: 'Full', method: 'Static', address: '172.18.100.151', netmask: '255.255.255.0', gateway: '172.18.100.1', rxBytes: 0, txBytes: 0, rxSpeed: 0, txSpeed: 0 }
        ];
    }

    return interfaces;
};

/**
 * Update Physical Interface Configuration
 */
const updatePhysicalInterface = async (db, ifaceData) => {
    if (!ifaceData || !ifaceData.id) throw new Error('Interface ID required');
    const overrides = getStoredConfig(db, 'physical_interfaces_overrides', {});
    overrides[ifaceData.id] = {
        method: ifaceData.method || 'Static',
        address: ifaceData.address,
        netmask: ifaceData.netmask,
        gateway: ifaceData.gateway,
        mtu: Number(ifaceData.mtu) || 1500
    };
    setStoredConfig(db, 'physical_interfaces_overrides', overrides);
    return { success: true, interface: ifaceData };
};

/**
 * NIC Bonds (Link Aggregation / LACP / Active-Backup)
 */
const getNicBonds = (db) => {
    return getStoredConfig(db, 'nic_bonds', [
        { id: 'bond0', bondName: 'bond0', slaves: ['eth0', 'eth1'], mode: '802.3ad (LACP)', state: 'Up', address: '172.18.100.160', netmask: '255.255.255.0', gateway: '172.18.100.1' }
    ]);
};

const saveNicBond = (db, bond) => {
    const bonds = getNicBonds(db);
    const id = bond.id || bond.bondName || `bond_${Date.now()}`;
    const newBond = { ...bond, id, state: bond.state || 'Up' };
    const idx = bonds.findIndex(b => b.id === id);
    if (idx >= 0) bonds[idx] = newBond;
    else bonds.push(newBond);
    setStoredConfig(db, 'nic_bonds', bonds);
    return newBond;
};

const deleteNicBond = (db, id) => {
    const bonds = getNicBonds(db);
    setStoredConfig(db, 'nic_bonds', bonds.filter(b => b.id !== id));
    return { ok: true };
};

/**
 * Get VLANs.
 */
const getVlans = (db) => {
    return getStoredConfig(db, 'virtual_lans', [
        { id: 'vlan_100', interface: 'eth0', vlanNumber: 100, igmp: 'V3', state: 'Up', method: 'Static', address: '10.100.0.10', netmask: '255.255.255.0', logicalName: 'VLAN_MGMT' }
    ]);
};

const saveVlan = (db, vlan) => {
    const vlans = getVlans(db);
    const id = vlan.id || `vlan_${Date.now()}`;
    const newVlan = { ...vlan, id, state: vlan.state || 'Up' };
    const idx = vlans.findIndex(v => v.id === id);
    if (idx >= 0) vlans[idx] = newVlan;
    else vlans.push(newVlan);
    setStoredConfig(db, 'virtual_lans', vlans);

    if (process.platform === 'linux' && vlan.interface && vlan.vlanNumber) {
        runCommand(`ip link add link ${vlan.interface} name ${vlan.interface}.${vlan.vlanNumber} type vlan id ${vlan.vlanNumber} 2>/dev/null; ip link set ${vlan.interface}.${vlan.vlanNumber} up`);
    }
    return newVlan;
};

const deleteVlan = (db, id) => {
    const vlans = getVlans(db);
    const target = vlans.find(v => v.id === id);
    if (target && process.platform === 'linux') {
        runCommand(`ip link delete ${target.interface}.${target.vlanNumber}`);
    }
    setStoredConfig(db, 'virtual_lans', vlans.filter(v => v.id !== id));
    return { ok: true };
};

/**
 * Routes.
 */
const getRoutes = (db) => {
    return getStoredConfig(db, 'network_routes', [
        { id: 'route_default', interface: 'eth0', type: 'Default', destination: '0.0.0.0', netmask: '0.0.0.0', gateway: '172.18.100.1' },
        { id: 'route_multicast', interface: 'eth1', type: 'Network', destination: '239.0.0.0', netmask: '255.0.0.0', gateway: '172.18.100.151' }
    ]);
};

const saveRoute = (db, route) => {
    const routes = getRoutes(db);
    const id = route.id || `route_${Date.now()}`;
    const newRoute = { ...route, id };
    const idx = routes.findIndex(r => r.id === id);
    if (idx >= 0) routes[idx] = newRoute;
    else routes.push(newRoute);
    setStoredConfig(db, 'network_routes', routes);

    if (process.platform === 'linux' && route.destination && route.gateway) {
        runCommand(`ip route add ${route.destination}/24 via ${route.gateway} dev ${route.interface || 'eth0'} 2>/dev/null`);
    }
    return newRoute;
};

const deleteRoute = (db, id) => {
    const routes = getRoutes(db);
    setStoredConfig(db, 'network_routes', routes.filter(r => r.id !== id));
    return { ok: true };
};

/**
 * DNS Configuration.
 */
const getDnsConfig = (db) => {
    return getStoredConfig(db, 'dns_configuration', {
        primaryDns: '8.8.8.8',
        secondaryDns: '1.1.1.1'
    });
};

const saveDnsConfig = (db, config) => {
    const current = {
        primaryDns: (config?.primaryDns || '8.8.8.8').trim(),
        secondaryDns: (config?.secondaryDns || '1.1.1.1').trim()
    };
    setStoredConfig(db, 'dns_configuration', current);
    return current;
};

/**
 * Statmux Configuration (Statistical Multiplexing).
 */
const getStatmuxConfig = (db) => {
    return getStoredConfig(db, 'statmux_configuration', {
        multicastAddress: '239.100.1.1',
        port: 1234,
        interface0: 'eth0',
        interface1: 'eth1',
        activateIgmpV3: true,
        interface0Source1: '0.0.0.0',
        interface0Source2: '0.0.0.0',
        interface1Source1: '0.0.0.0',
        interface1Source2: '0.0.0.0'
    });
};

const saveStatmuxConfig = (db, config) => {
    const current = {
        multicastAddress: config?.multicastAddress || '239.100.1.1',
        port: Number(config?.port) || 1234,
        interface0: config?.interface0 || 'eth0',
        interface1: config?.interface1 || 'eth1',
        activateIgmpV3: !!config?.activateIgmpV3,
        interface0Source1: config?.interface0Source1 || '0.0.0.0',
        interface0Source2: config?.interface0Source2 || '0.0.0.0',
        interface1Source1: config?.interface1Source1 || '0.0.0.0',
        interface1Source2: config?.interface1Source2 || '0.0.0.0'
    };
    setStoredConfig(db, 'statmux_configuration', current);
    return current;
};

module.exports = {
    initNetworkStorage,
    getPhysicalInterfaces,
    updatePhysicalInterface,
    getNicBonds,
    saveNicBond,
    deleteNicBond,
    getVlans,
    saveVlan,
    deleteVlan,
    getRoutes,
    saveRoute,
    deleteRoute,
    getDnsConfig,
    saveDnsConfig,
    getStatmuxConfig,
    saveStatmuxConfig
};
