import fs from 'fs'
import SambaClient from 'samba-client'
import { GlobalState } from '../GlobalState'
import { Settings } from '../Settings'

export class SMB {
  public static async smbTransferToHome () {
    const settings = await Settings.getSMBSettings()
    const storagePath = settings.storagePath != null && settings.storagePath.trim() !== ''
      ? settings.storagePath
      : 'dashcam-transfer'
    const normalizedBasePath = SMB.toSmbPath(storagePath)
    const basePath = normalizedBasePath === '' ? 'dashcam-transfer' : normalizedBasePath
    const lockedPath = basePath + '\\locked'

    // const client = new SMB2({
    //     share: '\\\\'+ settings.host +'\\home',
    //     domain: '',
    //     username: settings.username,
    //     password: settings.password,
    // });

    // let filelist = await client.readdir("");

    const lockedFilesDirectory = await Settings.getDownloadDirectory() + '/locked'
    if (!fs.existsSync(lockedFilesDirectory)) {
      GlobalState.homeTransferDone = true
      console.log('No locked files directory found, skipping transfer')
      return
    }
    const lockedFiles = fs.readdirSync(lockedFilesDirectory)
    if (lockedFiles.length === 0) {
      GlobalState.homeTransferDone = true
      console.log('No locked files found, skipping transfer')
      return
    }

    console.log('Connecting to smb', settings.host, basePath)
    const client = new SambaClient({
      address: `\\\\${settings.host}\\home`,
      username: settings.username,
      password: settings.password
    })
    if (!await client.fileExists(basePath)) {
      await client.mkdir(basePath)
      await client.mkdir(lockedPath)
    }

    for (const file of lockedFiles) {
      console.log('Uploading file to smb', file)
      await client.sendFile(lockedFilesDirectory + '/' + file, lockedPath + '\\' + file)
      console.log('File uploaded, deleting locally')
      fs.unlinkSync(lockedFilesDirectory + '/' + file)
    }

    GlobalState.homeTransferDone = true
    console.log('All files uploaded')
  }

  private static toSmbPath (inputPath: string) {
    return inputPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '').replace(/\//g, '\\')
  }
}
