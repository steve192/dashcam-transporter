#!/usr/bin/env node
import fs from 'fs'
import http from 'http'
import { DashcamDownloader } from './DashcamDownloader'
import { GlobalState } from './GlobalState'
import { HomeTransfer } from './HomeTransfer'
import { RaspiLED } from './RaspiLed'
import { Settings } from './Settings'
import { sleep } from './utils'
import { Wifi } from './WIFI'

const appStart = async () => {
  preventMultipleRuns()

  console.log('App started')

  RaspiLED.initialize()

  const downloadDirectory = await Settings.getDownloadDirectory()
  fs.mkdirSync(downloadDirectory, { recursive: true })
  fs.mkdirSync(downloadDirectory + '/locked', { recursive: true })

  await Wifi.enableWifi()

  while (true) {
    await sleep(5000)
    try {
      if (await Wifi.isConnectedToDashcamWifi() && !GlobalState.dashcamTransferDone) {
        await DashcamDownloader.downloadLockedVideosFromDashcam()
      } else if (await Wifi.isConnectedToHomeWifi() && !GlobalState.homeTransferDone) {
        await HomeTransfer.transferToHome()
      } else {
        try {
          if (!GlobalState.dashcamTransferDone) {
            await Wifi.tryToConnectToDashcamWifi()
            continue
          }
        } catch {
          console.log('Could not connect to dashcam wifi')
        }

        try {
          if (!GlobalState.homeTransferDone) {
            await Wifi.tryToConnectToHomeWifi()
            continue
          }
        } catch {
          console.log('Could not connect to home wifi')
        }
      }
    } catch (error) {
      console.error('Error in main loop', error)
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
appStart()

function preventMultipleRuns () {
  const server = http.createServer(function (req, res) {
  })
  // make sure this server doesn't keep the process running
  server.unref()

  server.on('error', function (e) {
    console.log("Application already running - can't run more than one instance")
    process.exit(1)
  })

  server.listen(32890, function () {
  })
}
