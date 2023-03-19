import { VIOFO } from './dashcams/VIOFO'
import { GlobalState } from './GlobalState'
import { RaspiLED } from './RaspiLed'

export class DashcamDownloader {
  public static async downloadLockedVideosFromDashcam () {
    GlobalState.homeTransferDone = false
    RaspiLED.operation = 'DASHCAMTRANSFER'
    await VIOFO.downloadLockedVideosFromDashcam()
  }
}
