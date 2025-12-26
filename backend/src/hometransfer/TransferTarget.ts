export interface TransferFile {
  name: string
  path: string
  size: number
}

export interface TransferTarget {
  name: string
  upload: (file: TransferFile) => Promise<void>
}
