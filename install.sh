#!/usr/bin/env bash

echo "Installing dependencies"
sudo apt update && sudo apt install git nodejs npm

echo "Cloning repo"
git clone https://github.com/steve192/dashcam-transporter.git

cd dashcam-transporter/backend

echo "Installing and building"

npm i && npm run build

cd dist

echo "Run setup script"

sudo ./setup.sh

echo "Configuring..."

nano settings.ini

echo "Rebooting"
sudo reboot