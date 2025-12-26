import fs from 'fs'
import SambaClient from 'samba-client'
import { Settings } from '../Settings'

export class SMB {
  public static async smbTransferToHome (lockedFilesDirectory: string, lockedFiles: string[]) {
    const settings = await Settings.getSMBSettings()
    if (!settings.enabled) {
      console.log('SMB transfer disabled, skipping')
      return
    }
    if (!fs.existsSync(lockedFilesDirectory)) {
      console.log('No locked files directory found, skipping SMB transfer')
      return
    }
    if (lockedFiles.length === 0) {
      console.log('No locked files found, skipping SMB transfer')
      return
    }
    const storagePath = settings.storagePath != null && settings.storagePath.trim() !== ''
      ? settings.storagePath
      : 'dashcam-transfer'
    const shareName = settings.share != null && settings.share.trim() !== '' ? settings.share : 'home'
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

    console.log('Connecting to smb', settings.host, shareName, basePath)
    const client = new SambaClient({
      address: `\\\\${settings.host}\\${shareName}`,
      username: settings.username,
      password: settings.password
    })
    if (!await client.fileExists(basePath)) {
      await client.mkdir(basePath)
    }
    if (!await client.fileExists(lockedPath)) {
      await client.mkdir(lockedPath)
    }

    for (const file of lockedFiles) {
      console.log('Uploading file to smb', file)
      await client.sendFile(lockedFilesDirectory + '/' + file, lockedPath + '\\' + file)
    }

    console.log('All files uploaded')
  }

  private static toSmbPath (inputPath: string) {
    return inputPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '').replace(/\//g, '\\')
  }
}
