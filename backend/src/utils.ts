import disk from 'diskusage'
import { Settings } from './Settings'

export const sleep = async (delayMs: number) => {
  return await new Promise((resolve) => {
    setTimeout(resolve, delayMs)
  })
}

export const enoughSpaceAvailable = async (requestedBytes: number) => {
  const result = await disk.check(await Settings.getDownloadDirectory())
  const alwaysFreeSpace = 100 * 1024 * 1024 // 100MB
  return (result.free - requestedBytes - alwaysFreeSpace) > 0
}
