import { GlobalState } from "./GlobalState";
import { smbTransferToHome } from "./hometransfert/smb";

export class HomeTransfer {


    public async transferToHome() {
        GlobalState.dashcamTransferDone = false;
        await smbTransferToHome();
    }
}