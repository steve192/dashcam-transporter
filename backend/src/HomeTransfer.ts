import { GlobalState } from "./GlobalState";
import { smbTransferToHome } from "./hometransfert/smb";
import { RaspiLED } from "./raspiLed";

export class HomeTransfer {


    public static async transferToHome() {
        GlobalState.dashcamTransferDone = false;
        RaspiLED.operation = "HOMETRANSFER";
        await smbTransferToHome();
    }
}