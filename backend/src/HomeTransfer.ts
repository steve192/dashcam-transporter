import fs from 'fs'
import path from 'path'
import { GlobalState } from './GlobalState'
import { SMB } from './hometransfer/SMB'
import { Nextcloud } from './hometransfer/Nextcloud'
import { RaspiLED } from './RaspiLed'
import { Settings } from './Settings'

export class HomeTransfer {
  public static async transferToHome () {
    GlobalState.dashcamTransferDone = false
    RaspiLED.operation = 'HOMETRANSFER'
    const smbSettings = await Settings.getSMBSettings()
    const nextcloudSettings = await Settings.getNextcloudSettings()
    const smbEnabled = smbSettings.enabled
    const nextcloudEnabled = nextcloudSettings.enabled

    if (!smbEnabled && !nextcloudEnabled) {
      GlobalState.homeTransferDone = true
      console.log('No home transfer targets enabled, skipping transfer')
      return
    }

    const lockedFilesDirectory = await Settings.getDownloadDirectory() + '/locked'
    if (!fs.existsSync(lockedFilesDirectory)) {
      GlobalState.homeTransferDone = true
      console.log('No locked files directory found, skipping transfer')
      return
    }
    const lockedFiles = fs.readdirSync(lockedFilesDirectory).filter((file) => {
      const fullPath = path.join(lockedFilesDirectory, file)
      try {
        return fs.statSync(fullPath).isFile()
      } catch {
        return false
      }
    })
    if (lockedFiles.length === 0) {
      GlobalState.homeTransferDone = true
      console.log('No locked files found, skipping transfer')
      return
    }

    const errors: Error[] = []
    if (smbEnabled) {
      try {
        await SMB.smbTransferToHome(lockedFilesDirectory, lockedFiles)
      } catch (error) {
        errors.push(error as Error)
        console.error('SMB transfer failed', error)
      }
    }
    if (nextcloudEnabled) {
      try {
        await Nextcloud.nextcloudTransferToHome(lockedFilesDirectory, lockedFiles)
      } catch (error) {
        errors.push(error as Error)
        console.error('Nextcloud transfer failed', error)
      }
    }

    if (errors.length > 0) {
      throw errors[0]
    }

    for (const file of lockedFiles) {
      const localPath = path.join(lockedFilesDirectory, file)
      if (fs.existsSync(localPath)) {
        console.log('Deleting locally uploaded file', file)
        fs.unlinkSync(localPath)
      }
    }

    GlobalState.homeTransferDone = true
  }
}
