import axios from 'axios'
import { XMLParser } from 'fast-xml-parser'
import Fs from 'fs'
import Path from 'path'
import { GlobalState } from '../GlobalState'
import { Settings } from '../Settings'
import { enoughSpaceAvailable } from '../utils'

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

export class VIOFO {
  // attr 32 = movie + parking
  // attr 33 = parking ro
  public static async downloadLockedVideosFromDashcam () {
    const downloadDirectory = await Settings.getDownloadDirectory()
    const response = await axios.get(protocolAndIp + '/?custom=1&cmd=3015')

    const parser = new XMLParser()
    const parsedResponse: FileListResponse = parser.parse(await response.data)

    for (const file of parsedResponse.LIST.ALLFile) {
      let downloadUrl = file.File.FPATH
      downloadUrl = downloadUrl.replace(/^A:/, '')
      downloadUrl = downloadUrl.replace(/\\/g, '/')
      downloadUrl = protocolAndIp + downloadUrl

      switch (file.File.ATTR) {
        case 33:
          await VIOFO.downloadVideo(file, downloadDirectory, downloadUrl)
          await VIOFO.deleteVideo(downloadUrl)
          break
        case 32:
          console.log('Video is not locked, ignoring', file.File.FPATH)
          break
      }
    }

    GlobalState.dashcamTransferDone = true
  }

  private static async deleteVideo (downloadUrl: string) {
    console.log('deleting video', downloadUrl)
    await axios.delete(downloadUrl)
  }

  private static async downloadVideo (file: { File: File }, downloadDirectory: string, downloadUrl: string) {
    if (!await enoughSpaceAvailable(file.File.SIZE)) {
      console.log('Not enough space available.')
      GlobalState.dashcamTransferDone = true
      throw new Error('Not enough space available')
    }
    return await new Promise((resolve, reject) => {
      console.log('Downloading locked video', file.File.FPATH)

      const path = Path.resolve(downloadDirectory, 'locked', file.File.NAME)
      const writer = Fs.createWriteStream(path)

      axios.get(downloadUrl, { responseType: 'stream' })
        .then(response => {
          response.data.on('error', reject)
          response.data.pipe(writer)
        })
        .catch(reject)

      writer.on('finish', resolve)
      writer.on('error', reject)
    })
  }
}
