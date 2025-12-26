import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream'
import { type DashcamFile, type DashcamSource } from './dashcams/DashcamSource'
import { VIOFO } from './dashcams/VIOFO'
import { GlobalState } from './GlobalState'
import { Logger } from './Logger'
import { RaspiLED } from './RaspiLed'
import { Settings } from './Settings'
import { enoughSpaceAvailable } from './utils'

export class DashcamDownloader {
  public static async downloadLockedVideosFromDashcam () {
    GlobalState.homeTransferDone = false
    RaspiLED.operation = 'DASHCAMTRANSFER'
    const source = await DashcamDownloader.createSource()
    const files = await source.listLockedFiles()
    if (files.length === 0) {
      Logger.debug('No locked files found on dashcam')
      GlobalState.dashcamTransferDone = true
      return
    }

    const downloadDirectory = await Settings.getDownloadDirectory()
    const lockedDirectory = path.join(downloadDirectory, 'locked')
    fs.mkdirSync(lockedDirectory, { recursive: true })

    for (const file of files) {
      await DashcamDownloader.ensureEnoughSpace(file)
      await DashcamDownloader.downloadFile(source, file, lockedDirectory)
    }

    GlobalState.dashcamTransferDone = true
  }

  public static async createSource (): Promise<DashcamSource> {
    const model = await Settings.getDashcamModel()
    switch (model) {
      case 'VIOFOA199MINI':
        return new VIOFO()
      case 'VIOFO':
        return new VIOFO()
      default:
        return new VIOFO()
    }
  }

  private static async ensureEnoughSpace (file: DashcamFile) {
    if (file.size == null) {
      return
    }
    const expectedSize = Number(file.size)
    if (!Number.isFinite(expectedSize) || expectedSize <= 0) {
      return
    }
    if (!await enoughSpaceAvailable(expectedSize)) {
      Logger.warn('Not enough space available.')
      GlobalState.dashcamTransferDone = true
      throw new Error('Not enough space available')
    }
  }

  private static async downloadFile (source: DashcamSource, file: DashcamFile, lockedDirectory: string) {
    const finalPath = path.join(lockedDirectory, file.name)
    const tempPath = `${finalPath}.part`
    DashcamDownloader.cleanupTempFile(tempPath)

    Logger.info('Downloading locked video', file.name)
    const stream = await source.createDownloadStream(file)
    await DashcamDownloader.writeStreamToFile(stream, tempPath)
    try {
      fs.renameSync(tempPath, finalPath)
    } catch (err) {
      DashcamDownloader.cleanupTempFile(tempPath)
      throw err
    }

    DashcamDownloader.verifyDownloadedFile(file, finalPath)
    await source.deleteRemoteFile(file)
  }

  private static async writeStreamToFile (stream: NodeJS.ReadableStream, destination: string) {
    await new Promise<void>((resolve, reject) => {
      const writer = fs.createWriteStream(destination)
      pipeline(stream, writer, (err) => {
        if (err) {
          DashcamDownloader.cleanupTempFile(destination)
          reject(err)
          return
        }
        resolve()
      })
    })
  }

  private static verifyDownloadedFile (file: DashcamFile, finalPath: string) {
    if (file.size == null) {
      return
    }
    const expectedSize = Number(file.size)
    if (!Number.isFinite(expectedSize) || expectedSize <= 0) {
      return
    }
    if (!fs.existsSync(finalPath)) {
      throw new Error(`Downloaded file missing: ${finalPath}`)
    }
    const actualSize = fs.statSync(finalPath).size
    if (actualSize !== expectedSize) {
      try {
        fs.unlinkSync(finalPath)
      } catch (err) {
        Logger.warn(`Failed to remove mismatched file ${finalPath}`)
      }
      throw new Error(`Downloaded file size mismatch for ${file.name}: expected ${expectedSize} bytes, got ${actualSize}`)
    }
  }

  private static cleanupTempFile (tempPath: string) {
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath)
      }
    } catch (err) {
      Logger.warn(`Failed to remove temp file ${tempPath}`)
    }
  }
}
