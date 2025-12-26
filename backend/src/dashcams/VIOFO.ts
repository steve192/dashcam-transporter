import axios from 'axios'
import { XMLParser } from 'fast-xml-parser'
import { Logger } from '../Logger'
import { type DashcamFile, type DashcamSource } from './DashcamSource'

const protocolAndIp = 'http://192.168.1.254'

interface File {
  NAME: string
  FPATH: string
  SIZE: number
  TIMECODE: number
  TIME: string
  ATTR: number
}

interface FileListResponse {
  LIST: { ALLFile: Array<{ File: File }> }
}

export class VIOFO implements DashcamSource {
  public name = 'VIOFO'

  // attr 32 = movie + parking
  // attr 33 = parking ro
  public async listLockedFiles (): Promise<DashcamFile[]> {
    const response = await axios.get(protocolAndIp + '/?custom=1&cmd=3015')
    const parser = new XMLParser()
    const parsedResponse: FileListResponse = parser.parse(await response.data)
    const results: DashcamFile[] = []
    const allFiles = parsedResponse?.LIST?.ALLFile
    if (allFiles == null) {
      return results
    }
    const fileLists = Array.isArray(allFiles)
      ? allFiles
      : [allFiles]

    for (const file of fileLists) {
      if (file.File.ATTR !== 33) {
        Logger.debug('Video is not locked, ignoring', file.File.FPATH)
        continue
      }
      let downloadUrl = file.File.FPATH
      downloadUrl = downloadUrl.replace(/^A:/, '')
      downloadUrl = downloadUrl.replace(/\\/g, '/')
      downloadUrl = protocolAndIp + downloadUrl
      results.push({
        name: file.File.NAME,
        remotePath: downloadUrl,
        size: Number(file.File.SIZE)
      })
    }

    return results
  }

  public async createDownloadStream (file: DashcamFile): Promise<NodeJS.ReadableStream> {
    const response = await axios.get(file.remotePath, { responseType: 'stream' })
    if (response.data == null || typeof response.data.pipe !== 'function') {
      throw new Error('Dashcam download did not return a stream')
    }
    return response.data as NodeJS.ReadableStream
  }

  public async deleteRemoteFile (file: DashcamFile): Promise<void> {
    Logger.debug('Deleting video', file.remotePath)
    await axios.delete(file.remotePath)
  }
}
