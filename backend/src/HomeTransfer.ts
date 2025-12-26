import fs from 'fs'
import path from 'path'
import { GlobalState } from './GlobalState'
import { Logger } from './Logger'
import { NextcloudTransferTarget } from './hometransfer/Nextcloud'
import { SMBTransferTarget } from './hometransfer/SMB'
import { type TransferFile, type TransferTarget } from './hometransfer/TransferTarget'
import { RaspiLED } from './RaspiLed'
import { Settings } from './Settings'

export class HomeTransfer {
  public static async transferToHome () {
    GlobalState.dashcamTransferDone = false
    RaspiLED.operation = 'HOMETRANSFER'
    const targets = await HomeTransfer.createTargets()

    if (targets.length === 0) {
      GlobalState.homeTransferDone = true
      Logger.debug('No home transfer targets enabled, skipping transfer')
      return
    }

    const lockedFilesDirectory = await Settings.getDownloadDirectory() + '/locked'
    const lockedFiles = HomeTransfer.listLocalFiles(lockedFilesDirectory)
    if (lockedFiles.length === 0) {
      GlobalState.homeTransferDone = true
      Logger.debug('No locked files found, skipping transfer')
      return
    }

    const errors: Error[] = []
    for (const file of lockedFiles) {
      for (const target of targets) {
        try {
          await target.upload(file)
        } catch (error) {
          errors.push(error as Error)
          Logger.error(`${target.name} transfer failed`, error)
        }
      }

      if (errors.length > 0) {
        throw errors[0]
      }

      if (fs.existsSync(file.path)) {
        Logger.debug('Deleting locally uploaded file', file.name)
        fs.unlinkSync(file.path)
      }
    }

    GlobalState.homeTransferDone = true
  }

  public static async createTargets (): Promise<TransferTarget[]> {
    const targets: TransferTarget[] = []
    const smbSettings = await Settings.getSMBSettings()
    if (smbSettings.enabled) {
      targets.push(new SMBTransferTarget(smbSettings))
    }
    const nextcloudSettings = await Settings.getNextcloudSettings()
    if (nextcloudSettings.enabled) {
      targets.push(new NextcloudTransferTarget(nextcloudSettings))
    }
    return targets
  }

  public static listLocalFiles (lockedFilesDirectory: string): TransferFile[] {
    if (!fs.existsSync(lockedFilesDirectory)) {
      Logger.debug('No locked files directory found, skipping transfer')
      return []
    }

    const entries = fs.readdirSync(lockedFilesDirectory)
    return entries.reduce<TransferFile[]>((results, file) => {
      if (file.endsWith('.part')) {
        return results
      }
      const fullPath = path.join(lockedFilesDirectory, file)
      try {
        const stat = fs.statSync(fullPath)
        if (!stat.isFile()) {
          return results
        }
        results.push({
          name: file,
          path: fullPath,
          size: stat.size
        })
        return results
      } catch {
        return results
      }
    }, [])
  }
}
