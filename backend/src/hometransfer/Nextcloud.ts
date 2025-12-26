import fs from 'fs'
import axios, { type AxiosInstance } from 'axios'
import { Logger } from '../Logger'
import { Settings } from '../Settings'
import { type TransferFile, type TransferTarget } from './TransferTarget'

export class NextcloudTransferTarget implements TransferTarget {
  public name = 'Nextcloud'
  private client: AxiosInstance
  private basePath: string
  private lockedPath: string
  private ready = false

  public constructor (settings: Awaited<ReturnType<typeof Settings.getNextcloudSettings>>) {
    if (settings.url == null || settings.url.trim() === '') {
      throw new Error('Nextcloud URL not configured (nextcloud.url)')
    }
    if (settings.username == null || settings.username.trim() === '') {
      throw new Error('Nextcloud username not configured (nextcloud.username)')
    }
    if (settings.password == null || settings.password.trim() === '') {
      throw new Error('Nextcloud password not configured (nextcloud.password)')
    }

    const storagePath = settings.storagePath != null && settings.storagePath.trim() !== ''
      ? settings.storagePath
      : 'dashcam-transfer'
    const normalizedBasePath = NextcloudTransferTarget.toWebDavPath(storagePath)
    this.basePath = normalizedBasePath === '' ? 'dashcam-transfer' : normalizedBasePath
    this.lockedPath = `${this.basePath}/locked`

    Logger.info('Connecting to nextcloud', settings.url, this.basePath)
    this.client = NextcloudTransferTarget.createClient(settings.url, settings.username, settings.password)
  }

  public async upload (file: TransferFile) {
    await this.ensureReady()
    Logger.debug('Uploading file to nextcloud', file.name)
    await NextcloudTransferTarget.uploadFile(this.client, file.path, `${this.lockedPath}/${file.name}`)
    await NextcloudTransferTarget.verifyRemoteFileSize(this.client, `${this.lockedPath}/${file.name}`, file.size)
  }

  private async ensureReady () {
    if (this.ready) {
      return
    }
    await NextcloudTransferTarget.ensureDirectory(this.client, this.basePath)
    await NextcloudTransferTarget.ensureDirectory(this.client, this.lockedPath)
    this.ready = true
  }

  private static createClient (baseUrl: string, username: string, password: string) {
    return axios.create({
      baseURL: NextcloudTransferTarget.normalizeBaseUrl(baseUrl),
      auth: { username, password },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    })
  }

  private static async uploadFile (client: AxiosInstance, localPath: string, remotePath: string) {
    const stat = fs.statSync(localPath)
    const stream = fs.createReadStream(localPath)
    await client.put(NextcloudTransferTarget.toRequestPath(remotePath), stream, {
      headers: {
        'Content-Length': stat.size,
        'Content-Type': 'application/octet-stream'
      }
    })
  }

  private static async verifyRemoteFileSize (client: AxiosInstance, remotePath: string, expectedSize: number) {
    const requestPath = NextcloudTransferTarget.toRequestPath(remotePath)
    const response = await client.request({
      method: 'HEAD',
      url: requestPath
    })
    const lengthHeader = response.headers['content-length']
    if (lengthHeader == null) {
      throw new Error(`Nextcloud upload verification failed for ${remotePath}: missing content-length`)
    }
    const actualSize = Number(lengthHeader)
    if (!Number.isFinite(actualSize)) {
      throw new Error(`Nextcloud upload verification failed for ${remotePath}: invalid content-length`)
    }
    if (actualSize !== expectedSize) {
      throw new Error(`Nextcloud upload size mismatch for ${remotePath}: expected ${expectedSize}, got ${actualSize}`)
    }
  }

  private static async ensureDirectory (client: AxiosInstance, remotePath: string) {
    const segments = NextcloudTransferTarget.toWebDavPath(remotePath).split('/').filter(Boolean)
    let current = ''
    for (const segment of segments) {
      current = current === '' ? segment : `${current}/${segment}`
      await NextcloudTransferTarget.mkdir(client, current)
    }
  }

  private static async mkdir (client: AxiosInstance, remotePath: string) {
    try {
      await client.request({
        method: 'MKCOL',
        url: NextcloudTransferTarget.toRequestPath(remotePath)
      })
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status
      if (status === 405) {
        return
      }
      throw error
    }
  }

  private static normalizeBaseUrl (inputUrl: string) {
    return inputUrl.trim().replace(/\/+$/, '')
  }

  private static toWebDavPath (inputPath: string) {
    return inputPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  }

  private static toRequestPath (remotePath: string) {
    const encoded = NextcloudTransferTarget.toWebDavPath(remotePath)
      .split('/')
      .filter(Boolean)
      .map(segment => encodeURIComponent(segment))
      .join('/')
    return `/${encoded}`
  }
}
