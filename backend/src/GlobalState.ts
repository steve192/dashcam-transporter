import { RaspiLED } from './RaspiLed'

export class GlobalState {
  // Prevents from connecting to dashcam and downloading videos
  // Set if storage is full or all videos are downloaded
  // Unset if home transfer was started
  private static _dashcamTransferDone = false

  // Prevents from connecting to home network and transferring video
  // Set when all videos are transferred to home
  // Unset when dashcam transfer is started
  private static _homeTransferDone = false

  public static get homeTransferDone () {
    return GlobalState._homeTransferDone
  }

  public static set homeTransferDone (value) {
    if (value) RaspiLED.operation = 'IDLE'
    console.log('Home transfer done:', value)
    GlobalState._homeTransferDone = value
  }

  public static get dashcamTransferDone () {
    return GlobalState._dashcamTransferDone
  }

  public static set dashcamTransferDone (value) {
    console.log('Dashcam transfer done:', value)
    if (value) RaspiLED.operation = 'IDLE'
    GlobalState._dashcamTransferDone = value
  }
}
