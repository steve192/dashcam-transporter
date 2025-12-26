import fs from 'fs'
import path from 'path'
import axios, { type AxiosInstance } from 'axios'
import { Settings } from '../Settings'

export class Nextcloud {
  public static async nextcloudTransferToHome (lockedFilesDirectory: string, lockedFiles: string[]) {
    const settings = await Settings.getNextcloudSettings()
    if (!settings.enabled) {
      console.log('Nextcloud transfer disabled, skipping')
      return
    }
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
    const normalizedBasePath = Nextcloud.toWebDavPath(storagePath)
    const basePath = normalizedBasePath === '' ? 'dashcam-transfer' : normalizedBasePath
    const lockedPath = `${basePath}/locked`
    if (!fs.existsSync(lockedFilesDirectory)) {
      console.log('No locked files directory found, skipping Nextcloud transfer')
      return
    }
    if (lockedFiles.length === 0) {
      console.log('No locked files found, skipping Nextcloud transfer')
      return
    }

    console.log('Connecting to nextcloud', settings.url, basePath)
    const client = Nextcloud.createClient(settings.url, settings.username, settings.password)
    await Nextcloud.ensureDirectory(client, basePath)
    await Nextcloud.ensureDirectory(client, lockedPath)

    for (const file of lockedFiles) {
      console.log('Uploading file to nextcloud', file)
      const localPath = path.join(lockedFilesDirectory, file)
      await Nextcloud.uploadFile(client, localPath, `${lockedPath}/${file}`)
    }

    console.log('All files uploaded')
  }

  private static createClient (baseUrl: string, username: string, password: string) {
    return axios.create({
      baseURL: Nextcloud.normalizeBaseUrl(baseUrl),
      auth: { username, password },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    })
  }

  private static async uploadFile (client: AxiosInstance, localPath: string, remotePath: string) {
    const stat = fs.statSync(localPath)
    const stream = fs.createReadStream(localPath)
    await client.put(Nextcloud.toRequestPath(remotePath), stream, {
      headers: {
        'Content-Length': stat.size,
        'Content-Type': 'application/octet-stream'
      }
    })
  }

  private static async ensureDirectory (client: AxiosInstance, remotePath: string) {
    const segments = Nextcloud.toWebDavPath(remotePath).split('/').filter(Boolean)
    let current = ''
    for (const segment of segments) {
      current = current === '' ? segment : `${current}/${segment}`
      await Nextcloud.mkdir(client, current)
    }
  }

  private static async mkdir (client: AxiosInstance, remotePath: string) {
    try {
      await client.request({
        method: 'MKCOL',
        url: Nextcloud.toRequestPath(remotePath)
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
    const encoded = Nextcloud.toWebDavPath(remotePath)
      .split('/')
      .filter(Boolean)
      .map(segment => encodeURIComponent(segment))
      .join('/')
    return `/${encoded}`
  }
}
