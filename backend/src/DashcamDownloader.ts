import { downloadLockedVideosFromDashcam as VIOFOdownloadLockedVideosFromDashcam } from "./dashcams/viofio";
import { GlobalState } from "./GlobalState";



export const downloadLockedVideosFromDashcam= async () => {
    GlobalState.homeTransferDone = false;
    await VIOFOdownloadLockedVideosFromDashcam();
}