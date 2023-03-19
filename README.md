# dashcam-transporter
Application running on a raspberry pi, to transfer your dashcam video files to your preferred storage


Done by the setup script:
- install node 16
`curl -sL https://deb.nodesource.com/setup_16.x | sudo bash - && sudo apt install nodejs`
- install network-manager 
    - sudo apt install network-manager
    - raspi-config > advanced options > network > network-manager 
    - reboot
- `apt-get install smbclient`
- setup autostart and logs