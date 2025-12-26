import SambaClient from 'samba-client'
import { Logger } from '../Logger'
import { Settings } from '../Settings'
import { type TransferFile, type TransferTarget } from './TransferTarget'

export class SMBTransferTarget implements TransferTarget {
  public name = 'SMB'
  private client: SambaClient
  private basePath: string
  private lockedPath: string
  private ready = false

  public constructor (settings: Awaited<ReturnType<typeof Settings.getSMBSettings>>) {
    const storagePath = settings.storagePath != null && settings.storagePath.trim() !== ''
      ? settings.storagePath
      : 'dashcam-transfer'
    const shareName = settings.share != null && settings.share.trim() !== '' ? settings.share : 'home'
    const normalizedBasePath = SMBTransferTarget.toSmbPath(storagePath)
    this.basePath = normalizedBasePath === '' ? 'dashcam-transfer' : normalizedBasePath
    this.lockedPath = this.basePath + '\\locked'

    Logger.info('Connecting to smb', settings.host, shareName, this.basePath)
    this.client = new SambaClient({
      address: `\\\\${settings.host}\\${shareName}`,
      username: settings.username,
      password: settings.password
    })
  }

  public async upload (file: TransferFile) {
    await this.ensureReady()
    const remotePath = this.lockedPath + '\\' + file.name
    Logger.debug('Uploading file to smb', file.name)
    await this.client.sendFile(file.path, remotePath)
    const exists = await this.client.fileExists(remotePath)
    if (!exists) {
      throw new Error(`SMB upload failed for ${file.name}`)
    }
  }

  private async ensureReady () {
    if (this.ready) {
      return
    }
    if (!await this.client.fileExists(this.basePath)) {
      await this.client.mkdir(this.basePath)
    }
    if (!await this.client.fileExists(this.lockedPath)) {
      await this.client.mkdir(this.lockedPath)
    }
    this.ready = true
  }

  private static toSmbPath (inputPath: string) {
    return inputPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '').replace(/\//g, '\\')
  }
}
