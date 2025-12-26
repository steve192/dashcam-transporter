# dashcam-transporter
Application running on a raspberry pi (or other debian based platforms), to transfer and archive your dashcam video files to your preferred storage

![Transfer illustration](/docs/img/transfer_illustration.svg "Transfer illustration")

# How it works
- The application is searching for the WIfi of your dashcam
- If found it connects to it in searches for locked videos (those where something happened), downloads them and deletes them from the dashcam
- The application then searches for your home network, connects and uploads the videos and deletes them from the pi


# Currently supported dashcams
- ✅ Viofo A119 Mini (Probaply other viofo as well)

# Currently supported target storages
- ✅ Samba (SMB) Windows Share


# Installation
The supported installation method is the `.deb` package (install script or manual download). Source installs are for development only.

## Automated script
- Setup raspbian lite (or other debian based os, this is not tested though) and execute

`curl -o- https://raw.githubusercontent.com/steve192/dashcam-transporter/main/install.sh | bash`

This installs the latest `.deb` release, sets up a systemd service, and keeps configuration in `/etc/dashcam-transporter/settings.ini`.

## Update
- Update to the latest release with

`sudo dashcam-transporter update`

## Logs
- Logs are written to `/var/log/dashcam-transporter/app.log`
- View logs with `sudo dashcam-transporter logs`

## Uninstall
- Remove the package (keep config): `sudo apt remove dashcam-transporter`
- Remove everything including config: `sudo apt purge dashcam-transporter`

## Manual
- Download the `.deb` release for your architecture (armhf/arm64/amd64/i386)
- Install it: `sudo apt install ./dashcam-transporter_<version>_<arch>.deb`
- Edit the configuration: `sudo nano /etc/dashcam-transporter/settings.ini`
- Check service status: `sudo dashcam-transporter status`

## Network manager
- The installer enables NetworkManager and disables `dhcpcd` (required for node-wifi).
- To skip this step, create `/etc/dashcam-transporter/skip-networkmanager-setup` before installation.

# Test a branch on Raspberry Pi 
This runs the app from source on the Pi for development.
- If you installed the stable version: SSH into the Pi and stop the service so only one instance runs: `sudo systemctl stop dashcam-transporter`
- Clone the repo: `git clone https://github.com/steve192/dashcam-transporter.git`
- Fetch and checkout the branch: `git fetch origin && git checkout <branch>`
- Enter the directory: `cd dashcam-transporter`
- Install dependencies and build: `cd backend && npm ci && npm run build`
- Run the branch build: `node dist/app.js`
- When done, stop the process and restart the service: `sudo systemctl start dashcam-transporter`

Tip: Use a separate settings file by exporting `DASHCAM_TRANSPORTER_SETTINGS=/etc/dashcam-transporter/settings.test.ini` before running `node dist/app.js`.

# Meaning of leds
The script controls the raspberrys leds
- Blinking LEDs - Waiting for connections to dashcam of home network (Will also blink if there is nothing to transfer)
- LEDs on - Transfer is currently running
