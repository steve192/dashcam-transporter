#!/usr/bin/env node
import fs from 'fs';
import { downloadLockedVideosFromDashcam } from "./DashcamDownloader";
import { GlobalState } from './GlobalState';
import { smbTransferToHome } from './hometransfert/smb';
import { getDownloadDirectory } from "./settings";
import { sleep } from "./utils";
import { enableWifi, isConnectedToDashcamWifi, isConnectedToHomeWifi, tryToConnectToDashcamWifi, tryToConnectToHomeWifi } from "./WIFI";



const appStart = async () => {

    console.log("App started");

    if (!fs.existsSync((await getDownloadDirectory()) + "/locked")){
        fs.mkdirSync((await getDownloadDirectory()));
        fs.mkdirSync((await getDownloadDirectory()) + "/locked");
    }

    enableWifi();

    while (true) {
        await sleep(5000);

        if (await isConnectedToDashcamWifi() && !GlobalState.dashcamTransferDone) {
            await downloadLockedVideosFromDashcam();
        } else if (await isConnectedToHomeWifi() && !GlobalState.homeTransferDone) {
            await smbTransferToHome();
        } else {
            try {
                if (!GlobalState.dashcamTransferDone) {
                    await tryToConnectToDashcamWifi();
                    continue;
                }
            } catch {
                console.log("Could not connect to dashcam wifi");
            }

            try {
                if (!GlobalState.homeTransferDone) {
                    await tryToConnectToHomeWifi();
                    continue;
                }
            } catch {
                console.log("Could not connect to home wifi");
            }
        }


    }
}

appStart();