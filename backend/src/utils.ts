import disk from 'diskusage';
import { getDownloadDirectory } from './settings';

export const sleep = (delayMs: number) => {
    return new Promise((resolve) => {
        setTimeout(resolve, delayMs);
    });
}

export const enoughSpaceAvailable = async (requestedBytes: number) => {
        const result = await disk.check(await getDownloadDirectory())
        const alwaysFreeSpace = 100 * 1024 * 1024; //100MB
        return ( result.free - requestedBytes - alwaysFreeSpace )> 0 ;
}