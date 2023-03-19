import fs from 'fs'
import SambaClient from 'samba-client'
import { GlobalState } from '../GlobalState'
import { Settings } from '../Settings'

export class SMB {
  public static async smbTransferToHome () {
    const settings = await Settings.getSMBSettings()

    console.log('Connecting to smb', settings.host, settings.storagePath)
    const client = new SambaClient({
      address: `\\\\${settings.host}\\home`,
      username: settings.username,
      password: settings.password
    })

    if (!await client.fileExists('dashcam-transfer')) {
      await client.mkdir('dashcam-transfer')
      await client.mkdir('dashcam-transfer\\locked')
    }
    // const client = new SMB2({
    //     share: '\\\\'+ settings.host +'\\home',
    //     domain: '',
    //     username: settings.username,
    //     password: settings.password,
    // });

    // let filelist = await client.readdir("");

    const lockedFilesDirectory = await Settings.getDownloadDirectory() + '/locked'
    const lockedFiles = fs.readdirSync(lockedFilesDirectory)

    for (const file of lockedFiles) {
      console.log('Uploading file to smb', file)
      await client.sendFile(lockedFilesDirectory + '/' + file, 'dashcam-transfer\\locked\\' + file)
      console.log('File uploaded, deleting locally')
      fs.unlinkSync(lockedFilesDirectory + '/' + file)
    }

    GlobalState.homeTransferDone = true
    console.log('All files uploaded')
  }
}
