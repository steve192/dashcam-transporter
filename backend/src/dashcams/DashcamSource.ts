export interface DashcamFile {
  name: string
  remotePath: string
  size?: number
}

export interface DashcamSource {
  name: string
  listLockedFiles: () => Promise<DashcamFile[]>
  createDownloadStream: (file: DashcamFile) => Promise<NodeJS.ReadableStream>
  deleteRemoteFile: (file: DashcamFile) => Promise<void>
}
