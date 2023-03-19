import { GlobalState } from './GlobalState'
import { SMB } from './hometransfert/SMB'
import { RaspiLED } from './RaspiLed'

export class HomeTransfer {
  public static async transferToHome () {
    GlobalState.dashcamTransferDone = false
    RaspiLED.operation = 'HOMETRANSFER'
    await SMB.smbTransferToHome()
  }
}
