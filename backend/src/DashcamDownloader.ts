import { downloadLockedVideosFromDashcam as VIOFOdownloadLockedVideosFromDashcam } from "./dashcams/viofio";
import { GlobalState } from "./GlobalState";
import { RaspiLED } from "./raspiLed";



export const downloadLockedVideosFromDashcam= async () => {
    GlobalState.homeTransferDone = false;
    RaspiLED.operation = "DASHCAMTRANSFER";
    await VIOFOdownloadLockedVideosFromDashcam();
}