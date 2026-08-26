#!/usr/bin/env bash
# Kashtrix Statmux Multicast Ubuntu Installer
set -e
echo "=== Installing Kashtrix Multicast Engine on Ubuntu Linux ==="

echo "1. Applying Kernel sysctl optimization..."
cat << 'EOF' > /etc/sysctl.d/99-kashtrix-multicast.conf
# Kashtrix Broadcast Multicast & Statmux Kernel Optimization
net.ipv4.ip_forward = 1
net.ipv4.conf.all.mc_forwarding = 1
net.ipv4.conf.default.mc_forwarding = 1
net.ipv4.conf.all.force_igmp_version = 3
net.ipv4.conf.default.force_igmp_version = 3
net.ipv4.conf.all.rp_filter = 0
net.ipv4.conf.default.rp_filter = 0
net.core.rmem_max = 26214400
net.core.wmem_max = 26214400
net.core.rmem_default = 26214400
net.core.wmem_default = 26214400
EOF

sysctl -p /etc/sysctl.d/99-kashtrix-multicast.conf || sysctl --system

echo "2. Adding Kernel Multicast Routing Tables for eth0..."
ip route add 224.0.0.0/4 dev eth0 metric 10 2>/dev/null || ip route change 224.0.0.0/4 dev eth0 metric 10 2>/dev/null || true
ip route add 239.0.0.0/8 dev eth0 metric 5 2>/dev/null || ip route change 239.0.0.0/8 dev eth0 metric 5 2>/dev/null || true

echo "3. Creating systemd service..."
cat << 'EOF' > /etc/systemd/system/kashtrix-statmux.service
[Unit]
Description=Kashtrix Broadcast Statmux & Multicast Engine
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStartPre=/sbin/ip route add 224.0.0.0/4 dev eth0 metric 10 || true
ExecStart=/usr/bin/node C:\Users\karnk\Downloads\secure-license-manager-v2\kashtrix-streamops/backend/server.js
Restart=always
RestartSec=3
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable kashtrix-statmux.service
echo "=== Installation complete! Kashtrix Multicast Engine is active ==="
