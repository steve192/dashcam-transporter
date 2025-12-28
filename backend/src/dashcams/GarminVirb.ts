import axios from 'axios'
import { Logger } from '../Logger'
import { type DashcamFile, type DashcamSource } from './DashcamSource'

type MediaListRequest = {
  command: string
  path?: string
}

type MediaListItem = {
  Name?: string
  Url?: string
  FileSize?: number
  Fav?: string
  Type?: string
  name?: string
  url?: string
  fileSize?: number
  fav?: string
  type?: string
}

type MediaListResponse = {
  Result?: number
  Media?: MediaListItem[]
  result?: number
  media?: MediaListItem[]
}

type DeleteFileRequest = {
  command: string
  files: string[]
}

type DeleteFileResponse = {
  Result?: number
  result?: number
}

const defaultHost = process.env.DASHCAM_TRANSPORTER_VIRB_HOST ?? '10.1.0.180'

export class GarminVirb implements DashcamSource {
  public name = 'GarminVirb'

  public async listLockedFiles (): Promise<DashcamFile[]> {
    const response = await GarminVirb.sendCommand<MediaListResponse>(defaultHost, {
      command: 'mediaList'
    })
    const media = GarminVirb.unwrapMedia(response)
    const results: DashcamFile[] = []

    for (const item of media) {
      if (!GarminVirb.isFavorite(item)) {
        continue
      }
      if (!GarminVirb.isVideo(item)) {
        continue
      }
      const url = GarminVirb.normalizeUrl(item.Url ?? item.url ?? '')
      if (url === '') {
        continue
      }
      const name = GarminVirb.getFileName(item.Name ?? item.name ?? '', url)
      results.push({
        name,
        remotePath: url,
        size: GarminVirb.getFileSize(item)
      })
    }

    return results
  }

  public async createDownloadStream (file: DashcamFile): Promise<NodeJS.ReadableStream> {
    const downloadUrl = GarminVirb.buildDownloadUrl(defaultHost, file.remotePath)
    const response = await axios.get(downloadUrl, { responseType: 'stream' })
    if (response.data == null || typeof response.data.pipe !== 'function') {
      throw new Error('Dashcam download did not return a stream')
    }
    return response.data as NodeJS.ReadableStream
  }

  public async deleteRemoteFile (file: DashcamFile): Promise<void> {
    const deletePath = GarminVirb.urlToPath(file.remotePath)
    const payload: DeleteFileRequest = {
      command: 'deleteFileGroup',
      files: [deletePath]
    }
    const response = await GarminVirb.sendCommand<DeleteFileResponse>(defaultHost, payload)
    const result = response.Result ?? response.result
    if (result !== 1) {
      Logger.warn(`DeleteFileGroup failed for ${file.name}, retrying with deleteFile`)
      const fallbackPayload: DeleteFileRequest = {
        command: 'deleteFile',
        files: [deletePath]
      }
      const fallbackResponse = await GarminVirb.sendCommand<DeleteFileResponse>(defaultHost, fallbackPayload)
      const fallbackResult = fallbackResponse.Result ?? fallbackResponse.result
      if (fallbackResult !== 1) {
        throw new Error(`Garmin Virb delete failed for ${file.name}`)
      }
    }
  }

  private static unwrapMedia (response: MediaListResponse) {
    const media = response.Media ?? response.media ?? []
    if (Array.isArray(media)) {
      return media
    }
    return []
  }

  private static isFavorite (item: MediaListItem) {
    const value = String(item.Fav ?? item.fav ?? '').trim().toLowerCase()
    if (value === '') {
      return false
    }
    return value === '1' || value === 'true' || value === 'yes' || value === 'fav' || value === 'favorite'
  }

  private static isVideo (item: MediaListItem) {
    const typeValue = String(item.Type ?? item.type ?? '').trim().toLowerCase()
    if (typeValue.includes('video')) {
      return true
    }
    if (typeValue !== '') {
      return false
    }
    const name = GarminVirb.getFileName(item.Name ?? item.name ?? '', item.Url ?? item.url ?? '')
    return GarminVirb.hasVideoExtension(name)
  }

  private static hasVideoExtension (name: string) {
    const lower = name.toLowerCase()
    return lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.avi') || lower.endsWith('.mkv')
  }

  private static getFileName (name: string, url: string) {
    const trimmed = name.trim()
    if (trimmed !== '') {
      return trimmed
    }
    return GarminVirb.basenameFromUrl(url)
  }

  private static getFileSize (item: MediaListItem) {
    const size = item.FileSize ?? item.fileSize
    if (size == null) {
      return undefined
    }
    const numeric = Number(size)
    return Number.isFinite(numeric) ? numeric : undefined
  }

  private static normalizeUrl (input: string) {
    return input.trim()
  }

  private static buildDownloadUrl (host: string, pathOrUrl: string) {
    const trimmed = pathOrUrl.trim()
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed
    }
    if (trimmed.startsWith('/')) {
      return `http://${host}${trimmed}`
    }
    return `http://${host}/${trimmed}`
  }

  private static urlToPath (pathOrUrl: string) {
    const trimmed = pathOrUrl.trim()
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      try {
        const parsed = new URL(trimmed)
        return parsed.pathname
      } catch {
        return trimmed
      }
    }
    if (trimmed.startsWith('/')) {
      return trimmed
    }
    return `/${trimmed}`
  }

  private static basenameFromUrl (pathOrUrl: string) {
    const trimmed = pathOrUrl.trim()
    if (trimmed === '') {
      return 'unknown'
    }
    const path = GarminVirb.urlToPath(trimmed)
    const parts = path.split('/')
    return parts[parts.length - 1] || 'unknown'
  }

  private static async sendCommand<T> (host: string, payload: unknown): Promise<T> {
    const url = `http://${host}/virb`
    const response = await axios.post(url, JSON.stringify(payload), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })
    return response.data as T
  }
}
