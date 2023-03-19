#!/usr/bin/env node
import fs from 'fs'
import http from 'http'
import { downloadLockedVideosFromDashcam } from './DashcamDownloader'
import { GlobalState } from './GlobalState'
import { HomeTransfer } from './HomeTransfer'
import { RaspiLED } from './raspiLed'
import { getDownloadDirectory } from './settings'
import { sleep } from './utils'
import { enableWifi, isConnectedToDashcamWifi, isConnectedToHomeWifi, tryToConnectToDashcamWifi, tryToConnectToHomeWifi } from './WIFI'

const appStart = async () => {
  preventMultipleRuns()

  console.log('App started')

  RaspiLED.initialize()

  if (!fs.existsSync((await getDownloadDirectory()) + '/locked')) {
    fs.mkdirSync((await getDownloadDirectory()))
    fs.mkdirSync((await getDownloadDirectory()) + '/locked')
  }

  enableWifi()

  while (true) {
    await sleep(5000)

    if (await isConnectedToDashcamWifi() && !GlobalState.dashcamTransferDone) {
      await downloadLockedVideosFromDashcam()
    } else if (await isConnectedToHomeWifi() && !GlobalState.homeTransferDone) {
      await HomeTransfer.transferToHome()
    } else {
      try {
        if (!GlobalState.dashcamTransferDone) {
          await tryToConnectToDashcamWifi()
          continue
        }
      } catch {
        console.log('Could not connect to dashcam wifi')
      }

      try {
        if (!GlobalState.homeTransferDone) {
          await tryToConnectToHomeWifi()
          continue
        }
      } catch {
        console.log('Could not connect to home wifi')
      }
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
