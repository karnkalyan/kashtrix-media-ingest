const dgram = require('dgram');

/**
 * Initializes DB tables for SNMP and Alarm settings.
 */
const initSnmpAlarmStorage = (db) => {
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS system_alarms_config (
                key TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
    } catch (e) {
        console.warn('[SnmpAlarmManager] DB Init warn:', e.message);
    }
};

const getStoredConfig = (db, key, defaultValue) => {
    try {
        if (db && db.prisma && db.prisma.kvStore) {
            const mem = db.data && db.data.kv ? db.data.kv.find(r => r.key === key) : null;
            if (mem && mem.value) return JSON.parse(mem.value);
        }
        const row = db.prepare('SELECT data FROM system_alarms_config WHERE key = ?').get(key);
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
            INSERT INTO system_alarms_config (key, data, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP
        `).run(key, JSON.stringify(value));
    } catch (e) {
        try { if (db && db.setKv) db.setKv(key, value); } catch (_) {}
    }
};

/**
 * Save SNMP & Alarms configuration.
 */
const saveSnmpAlarmSettings = (db, payload) => {
    if (payload.snmp) {
        const snmp = {
            readCommunity: (payload.snmp.readCommunity || 'public').trim(),
            writeCommunity: (payload.snmp.writeCommunity || 'private').trim(),
            enableTraps: !!payload.snmp.enableTraps,
            trapReceivers: Array.isArray(payload.snmp.trapReceivers) ? payload.snmp.trapReceivers : ['', '', '']
        };
        setStoredConfig(db, 'snmp_config', snmp);
    }

    if (Array.isArray(payload.alarms)) {
        setStoredConfig(db, 'alarm_rules', payload.alarms);
    }

    return getSnmpAlarmSettings(db);
};

/**
 * Send an SNMP Trap UDP packet if traps are enabled.
 */
const emitSnmpTrap = (db, alarmEvent) => {
    try {
        const { snmp } = getSnmpAlarmSettings(db);
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
