#!/bin/sh

# Install node
curl -sL https://deb.nodesource.com/setup_16.x | sudo bash - && sudo apt install nodejs

sudo apt install network-manager smbclient -y

# Enable network-manager
systemctl -q disable "dhcpcd" 2>/dev/null
systemctl -q enable "NetworkManager"

systemctl -q stop "dhcpcd" 2>/dev/null
systemctl -q --no-block start "NetworkManager"

# Install dependencies
npm i

mkdir logs

# Startup automatically
sed -i -e '$i \sudo node '"$PWD"'/app.js | tee "'"$PWD"'/logs/transporter-$(date +%s).log" &\n' /etc/rc.local

echo "Make sure to edit settings.ini and reboot"
