const dgram = require('dgram');
const ALARM_SECTION = 'snmp-alarms';

/**
 * Initializes DB tables for SNMP and Alarm settings.
 */
const initSnmpAlarmStorage = async (db) => {
    if (!db?.prisma?.systemConfiguration) {
        console.warn('[SnmpAlarmManager] Prisma SystemConfiguration model is unavailable – alarm persistence will use defaults');
        return;
    }
};

const getStoredConfig = async (db, key, defaultValue) => {
    try {
        const row = await db.prisma.systemConfiguration.findUnique({ where: { key } });
        if (row?.value) return JSON.parse(row.value);
    } catch (e) {
        console.warn(`[SnmpAlarmManager] Could not read ${key}:`, e.message);
    }
    return defaultValue;
};

const setStoredConfig = async (db, key, value) => {
    const serialized = JSON.stringify(value);
    await db.prisma.systemConfiguration.upsert({
        where: { key },
        update: { section: ALARM_SECTION, value: serialized },
        create: { key, section: ALARM_SECTION, value: serialized }
    });
};

/**
 * Get SNMP & Alarms configuration.
 */
const getSnmpAlarmSettings = async (db) => {
    const snmp = await getStoredConfig(db, 'snmp_config', {
        readCommunity: 'public',
        writeCommunity: 'private',
        enableTraps: true,
        trapReceivers: ['172.18.100.200:162', '', '']
    });

    const defaultAlarms = [
        { id: 'alarm_loss_of_signal', name: 'Loss of Input Signal', severity: 'Critical', snmpTrap: true, emailAlert: false, enabled: true },
        { id: 'alarm_high_cpu', name: 'High CPU Usage (>90%)', severity: 'Major', snmpTrap: true, emailAlert: false, enabled: true },
        { id: 'alarm_storage_full', name: 'Disk Storage Low (<10%)', severity: 'Major', snmpTrap: true, emailAlert: false, enabled: true },
        { id: 'alarm_pid_drop', name: 'MPEG-TS PID Continuity Error', severity: 'Minor', snmpTrap: true, emailAlert: false, enabled: true },
        { id: 'alarm_mux_overcapacity', name: 'MPTS MUX Overcapacity', severity: 'Critical', snmpTrap: true, emailAlert: false, enabled: true }
    ];

    const alarms = await getStoredConfig(db, 'alarm_rules', defaultAlarms);

    return { snmp, alarms };
};

/**
 * Save SNMP & Alarms configuration.
 */
const saveSnmpAlarmSettings = async (db, payload = {}) => {
    if (payload.snmp) {
        const snmp = {
            readCommunity: (payload.snmp.readCommunity || 'public').trim(),
            writeCommunity: (payload.snmp.writeCommunity || 'private').trim(),
            enableTraps: !!payload.snmp.enableTraps,
            trapReceivers: Array.isArray(payload.snmp.trapReceivers) ? payload.snmp.trapReceivers : ['', '', '']
        };
        await setStoredConfig(db, 'snmp_config', snmp);
    }

    if (Array.isArray(payload.alarms)) {
        await setStoredConfig(db, 'alarm_rules', payload.alarms);
    }

    return await getSnmpAlarmSettings(db);
};

/**
 * Send an SNMP Trap UDP packet if traps are enabled.
 */
const emitSnmpTrap = async (db, alarmEvent) => {
    try {
        const { snmp } = await getSnmpAlarmSettings(db);
        if (!snmp.enableTraps) return;

        const receivers = (snmp.trapReceivers || []).filter(r => r && r.trim());
        if (receivers.length === 0) return;

        const client = dgram.createSocket('udp4');
        const message = Buffer.from(JSON.stringify({
            snmpVersion: '2c',
            community: snmp.readCommunity || 'public',
            timestamp: new Date().toISOString(),
            enterpriseOid: '1.3.6.1.4.1.54321.1',
            trap: alarmEvent,
        }));

        receivers.forEach(host => {
            const [ip, portStr] = host.split(':');
            const port = Number(portStr) || 162;
            client.send(message, port, ip, (err) => {
                if (err) console.warn(`[SNMP Trap] Failed to send to ${host}:`, err.message);
            });
        });

        setTimeout(() => {
            try { client.close(); } catch (e) {}
        }, 1000).unref?.();

    } catch (e) {
        console.warn('[SNMP Trap] Emission error:', e.message);
    }
};

module.exports = {
    initSnmpAlarmStorage,
    getSnmpAlarmSettings,
    saveSnmpAlarmSettings,
    emitSnmpTrap,
};
