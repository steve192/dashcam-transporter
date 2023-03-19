import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import Fs from 'fs';
import Path from 'path';
import { GlobalState } from "../GlobalState";
import { getDownloadDirectory } from "../settings";
import { enoughSpaceAvailable } from "../utils";

const protocolAndIp = "http://192.168.1.254";

interface File {
    NAME: string;
    FPATH: string;
    SIZE: number;
    TIMECODE: number;
    TIME: string;
    ATTR: number;
}

interface FileListResponse {
    LIST: {ALLFile: {File: File}[]}
}

// attr 32 = movie + parking
// attr 33 = parking ro
export const downloadLockedVideosFromDashcam = async () => {
    const downloadDirectory = await getDownloadDirectory();
    let response = await axios.get(protocolAndIp + "/?custom=1&cmd=3015");


    const parser = new XMLParser();
    const parsedResponse: FileListResponse = parser.parse(await response.data);

    for( let file of  parsedResponse.LIST.ALLFile) {
        let downloadUrl = file.File.FPATH;
        downloadUrl = downloadUrl.replace("A:", "");
        downloadUrl = downloadUrl.replace("\\","/");
        downloadUrl = protocolAndIp + downloadUrl;

        switch(file.File.ATTR) {
            case 33:
                await downloadVideo(file, downloadDirectory, downloadUrl);
                await deleteVideo(downloadUrl);
                break;
            case 32:
                console.log("Video is not locked, ignoring", file.File.FPATH );
            break;
        }
    }

    GlobalState.dashcamTransferDone = true;
}

const deleteVideo = async (downloadUrl: string) => {
    console.log("deleting video", downloadUrl);
    await axios.delete(downloadUrl);
}

const downloadVideo = async (file: { File: File; }, downloadDirectory: string, downloadUrl: string) => {
    if (!await enoughSpaceAvailable(file.File.SIZE)) {
        console.log("Not enough space available.");
        GlobalState.dashcamTransferDone = true;
        throw new Error("Not enough space available");
    }
    return new Promise((resolve, reject) => {

        console.log("Downloading locked video", file.File.FPATH);
        
        let path = Path.resolve(downloadDirectory, 'locked', file.File.NAME);
        let writer = Fs.createWriteStream(path);
        
        axios.get(downloadUrl, { responseType: "stream" }).then(stream => {
            stream.data.pipe(writer);
        });
        
        writer.on("finish", resolve);
        writer.on("error", reject);
    });
}

