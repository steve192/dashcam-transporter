const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { PassThrough } = require('stream')
const Module = require('module')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashcam-transporter-'))
const settingsPath = path.join(tmpDir, 'settings.ini')

fs.writeFileSync(
  settingsPath,
  [
    '[dashcam]',
    'ssid=dashcam-ssid',
    'password=secret',
    '[home]',
    'ssid=home-ssid',
    'password=home-secret',
    '[smb]',
    'enabled=true',
    'host=server.local',
    'share=dashcam',
    'username=user',
    'password=pass',
    'storagepath=/share/dashcam'
  ].join('\n') + '\n'
)

process.env.DASHCAM_TRANSPORTER_SETTINGS = settingsPath

const mockWifi = {
  lastInit: null,
  lastConnect: null,
  disconnected: false,
  currentConnections: [],
  init: function (opts) {
    this.lastInit = opts
  },
  connect: async function (opts) {
    this.lastConnect = opts
  },
  disconnect: async function () {
    this.disconnected = true
  },
  getCurrentConnections: async function () {
    return this.currentConnections
  }
}

const mockAxios = {
  deletes: [],
  downloads: [],
  failDownloads: false,
  get: async function (url, opts) {
    if (url.includes('cmd=3015')) {
      const xml = [
        '<LIST>',
        '  <ALLFile>',
        '    <File>',
        '      <NAME>LOCK1.MP4</NAME>',
        '      <FPATH>A:\\LOCKED\\LOCK1.MP4</FPATH>',
        '      <SIZE>4</SIZE>',
        '      <TIMECODE>0</TIMECODE>',
        '      <TIME>0</TIME>',
        '      <ATTR>33</ATTR>',
        '    </File>',
        '  </ALLFile>',
        '  <ALLFile>',
        '    <File>',
        '      <NAME>UNLOCKED.MP4</NAME>',
        '      <FPATH>A:\\LOCKED\\UNLOCKED.MP4</FPATH>',
        '      <SIZE>4</SIZE>',
        '      <TIMECODE>0</TIMECODE>',
        '      <TIME>0</TIME>',
        '      <ATTR>32</ATTR>',
        '    </File>',
        '  </ALLFile>',
        '</LIST>'
      ].join('\n')
      return { data: xml }
    }

    if (opts && opts.responseType === 'stream') {
      if (this.failDownloads) {
        throw new Error('Download failed')
      }
      this.downloads.push(url)
      const stream = new PassThrough()
      stream.end('data')
      return {
        data: stream
      }
    }

    throw new Error(`Unexpected axios.get call: ${url}`)
  },
  delete: async function (url) {
    this.deletes.push(url)
  }
}

class SambaClientMock {
  constructor (opts) {
    this.opts = opts
    this.mkdirCalls = []
    this.sendCalls = []
    this.existingPaths = new Set()
    SambaClientMock.lastInstance = this
  }

  async fileExists (pathToCheck) {
    return this.existingPaths.has(pathToCheck)
  }

  async mkdir (pathToMake) {
    this.mkdirCalls.push(pathToMake)
    this.existingPaths.add(pathToMake)
  }

  async sendFile (source, destination) {
    this.sendCalls.push({ source, destination })
    this.existingPaths.add(destination)
  }
}

const mockDiskusage = {
  free: 0,
  lastPath: null,
  check: async function (pathToCheck) {
    this.lastPath = pathToCheck
    return { free: this.free }
  }
}

const mockModules = {
  'node-wifi': { __esModule: true, default: mockWifi },
  axios: { __esModule: true, default: mockAxios },
  'samba-client': { __esModule: true, default: SambaClientMock },
  diskusage: { __esModule: true, default: mockDiskusage }
}

const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (mockModules[request]) {
    return mockModules[request]
  }
  return originalLoad.apply(this, arguments)
}

const { Settings } = require('../dist/Settings')
const { Wifi } = require('../dist/WIFI')
const { DashcamDownloader } = require('../dist/DashcamDownloader')
const { HomeTransfer } = require('../dist/HomeTransfer')
const { VIOFO } = require('../dist/dashcams/VIOFO')
const { GlobalState } = require('../dist/GlobalState')
const { RaspiLED } = require('../dist/RaspiLed')
const { enoughSpaceAvailable } = require('../dist/utils')
const { SMBTransferTarget } = require('../dist/hometransfer/SMB')

const tests = []
const test = (name, fn) => tests.push({ name, fn })

const resetMocks = () => {
  mockWifi.lastInit = null
  mockWifi.lastConnect = null
  mockWifi.disconnected = false
  mockWifi.currentConnections = []
  mockAxios.deletes = []
  mockAxios.downloads = []
  mockAxios.failDownloads = false
  SambaClientMock.lastInstance = null
  mockDiskusage.free = 0
  mockDiskusage.lastPath = null
}

test('Settings read expected values', async () => {
  const smb = await Settings.getSMBSettings()
  assert.strictEqual(await Settings.getDashcamWifiSSID(), 'dashcam-ssid')
  assert.strictEqual(await Settings.getDashcamWifiPassword(), 'secret')
  assert.strictEqual(await Settings.getHomeWifiSSID(), 'home-ssid')
  assert.strictEqual(await Settings.getHomeWifiPassword(), 'home-secret')
  assert.strictEqual(await Settings.getDashcamModel(), 'VIOFOA199MINI')
  assert.strictEqual(await Settings.getDownloadDirectory(), '/opt/videodownload')
  assert.strictEqual(smb.enabled, true)
  assert.strictEqual(smb.host, 'server.local')
  assert.strictEqual(smb.share, 'dashcam')
})

test('enoughSpaceAvailable respects buffer', async () => {
  mockDiskusage.free = 200 * 1024 * 1024
  assert.strictEqual(await enoughSpaceAvailable(50 * 1024 * 1024), true)
  assert.strictEqual(await enoughSpaceAvailable(150 * 1024 * 1024), false)
})

test('Wifi connects to dashcam credentials', async () => {
  await Wifi.enableWifi()
  await Wifi.tryToConnectToDashcamWifi()
  assert.deepStrictEqual(mockWifi.lastConnect, { ssid: 'dashcam-ssid', password: 'secret' })
})

test('Wifi connection detection works', async () => {
  mockWifi.currentConnections = [{ ssid: 'dashcam-ssid' }]
  assert.strictEqual(await Wifi.isConnectedToDashcamWifi(), true)
  mockWifi.currentConnections = [{ ssid: 'other' }]
  assert.strictEqual(await Wifi.isConnectedToDashcamWifi(), false)
})

test('DashcamDownloader downloads files and deletes remote', async () => {
  const downloadDir = fs.mkdtempSync(path.join(tmpDir, 'dashcam-'))
  const lockedDir = path.join(downloadDir, 'locked')
  fs.mkdirSync(lockedDir, { recursive: true })

  const originalDownloadDir = Settings.getDownloadDirectory
  const originalCreateSource = DashcamDownloader.createSource
  const deleted = []

  Settings.getDownloadDirectory = async () => downloadDir
  DashcamDownloader.createSource = async () => ({
    name: 'mock',
    listLockedFiles: async () => ([{ name: 'LOCK1.MP4', remotePath: 'http://dashcam/LOCK1.MP4', size: 4 }]),
    createDownloadStream: async () => {
      const stream = new PassThrough()
      stream.end('data')
      return stream
    },
    deleteRemoteFile: async (file) => { deleted.push(file.remotePath) }
  })

  mockDiskusage.free = 1024 * 1024 * 1024
  await DashcamDownloader.downloadLockedVideosFromDashcam()

  const downloadedPath = path.join(lockedDir, 'LOCK1.MP4')
  assert.strictEqual(fs.existsSync(downloadedPath), true)
  assert.strictEqual(fs.existsSync(downloadedPath + '.part'), false)
  assert.strictEqual(deleted.length, 1)
  assert.strictEqual(RaspiLED.operation, 'IDLE')

  Settings.getDownloadDirectory = originalDownloadDir
  DashcamDownloader.createSource = originalCreateSource
})

test('HomeTransfer uploads files and deletes them locally', async () => {
  const downloadDir = fs.mkdtempSync(path.join(tmpDir, 'home-transfer-'))
  const lockedDir = path.join(downloadDir, 'locked')
  fs.mkdirSync(lockedDir, { recursive: true })
  fs.writeFileSync(path.join(lockedDir, 'video.mp4'), 'data')

  const originalDownloadDir = Settings.getDownloadDirectory
  const originalCreateTargets = HomeTransfer.createTargets
  let called = 0

  Settings.getDownloadDirectory = async () => downloadDir
  HomeTransfer.createTargets = async () => ([{
    name: 'mock',
    upload: async () => { called += 1 }
  }])
  GlobalState.dashcamTransferDone = true

  await HomeTransfer.transferToHome()

  assert.strictEqual(called, 1)
  assert.strictEqual(RaspiLED.operation, 'IDLE')
  assert.strictEqual(GlobalState.dashcamTransferDone, false)
  assert.strictEqual(fs.existsSync(path.join(lockedDir, 'video.mp4')), false)

  Settings.getDownloadDirectory = originalDownloadDir
  HomeTransfer.createTargets = originalCreateTargets
})

test('VIOFO lists locked files', async () => {
  const viofo = new VIOFO()
  const files = await viofo.listLockedFiles()
  assert.strictEqual(files.length, 1)
  assert.strictEqual(files[0].name, 'LOCK1.MP4')
  assert.strictEqual(files[0].size, 4)
  assert.strictEqual(files[0].remotePath.includes('/LOCKED/LOCK1.MP4'), true)
})

test('DashcamDownloader propagates download errors', async () => {
  const downloadDir = fs.mkdtempSync(path.join(tmpDir, 'viofo-fail-'))
  fs.mkdirSync(path.join(downloadDir, 'locked'), { recursive: true })

  const originalDownloadDir = Settings.getDownloadDirectory
  const originalCreateSource = DashcamDownloader.createSource

  Settings.getDownloadDirectory = async () => downloadDir
  DashcamDownloader.createSource = async () => ({
    name: 'mock',
    listLockedFiles: async () => ([{ name: 'LOCK1.MP4', remotePath: 'http://dashcam/LOCK1.MP4', size: 4 }]),
    createDownloadStream: async () => { throw new Error('Download failed') },
    deleteRemoteFile: async () => {}
  })

  mockDiskusage.free = 1024 * 1024 * 1024
  let threw = false
  try {
    await DashcamDownloader.downloadLockedVideosFromDashcam()
  } catch (err) {
    threw = true
  }
  assert.strictEqual(threw, true)

  Settings.getDownloadDirectory = originalDownloadDir
  DashcamDownloader.createSource = originalCreateSource
})

test('SMB uploads and verifies remote file', async () => {
  const downloadDir = fs.mkdtempSync(path.join(tmpDir, 'smb-'))
  const lockedDir = path.join(downloadDir, 'locked')
  fs.mkdirSync(lockedDir, { recursive: true })

  const filePath = path.join(lockedDir, 'video.mp4')
  fs.writeFileSync(filePath, 'data')

  const target = new SMBTransferTarget({
    enabled: true,
    host: 'server.local',
    share: 'dashcam',
    username: 'user',
    password: 'pass',
    storagePath: '/share/dashcam'
  })

  await target.upload({ name: 'video.mp4', path: filePath, size: 4 })

  const instance = SambaClientMock.lastInstance
  assert.ok(instance)
  assert.strictEqual(instance.sendCalls.length, 1)
  assert.strictEqual(instance.sendCalls[0].destination, 'share\\dashcam\\locked\\video.mp4')
  assert.strictEqual(fs.existsSync(filePath), true)
})

async function run() {
  for (const { name, fn } of tests) {
    resetMocks()
    try {
      await fn()
      console.log(`ok - ${name}`)
    } catch (err) {
      console.error(`failed - ${name}`)
      throw err
    }
  }
  console.log('All tests passed')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
