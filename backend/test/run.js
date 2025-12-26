const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { PassThrough } = require('stream')
const { promisify } = require('util')
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

const mockNmcli = {
  commands: [],
  scanResults: [
    { ssid: 'dashcam-ssid', security: 'WPA2' },
    { ssid: 'home-ssid', security: 'WPA2' }
  ],
  activeSsids: [],
  devices: [
    { device: 'wlan0', type: 'wifi', state: 'connected' }
  ],
  failConnect: false,
  lastConnectArgs: null,
  lastUpConnection: null,
  lastModifyArgs: [],
  connectionNames: [],
  connectionMap: {},
  handle: function (args) {
    if (args.includes('dev') && args.includes('wifi') && args.includes('list')) {
      const lines = this.scanResults.map((entry) => `${entry.ssid}:${entry.security}`)
      return { stdout: lines.join('\n') + '\n' }
    }
    if (args.includes('-f') && args.includes('ACTIVE,SSID')) {
      const lines = this.activeSsids.map((ssid) => `yes:${ssid}`)
      return { stdout: lines.join('\n') + '\n' }
    }
    if (args.includes('-f') && args.includes('DEVICE,TYPE,STATE')) {
      const lines = this.devices.map((entry) => `${entry.device}:${entry.type}:${entry.state}`)
      return { stdout: lines.join('\n') + '\n' }
    }
    if (args.includes('connection') && args.includes('show') && args.includes('NAME')) {
      const lines = this.connectionNames
      return { stdout: lines.join('\n') + '\n' }
    }
    if (args.includes('connection') && args.includes('add')) {
      const nameIndex = args.indexOf('con-name') + 1
      const name = args[nameIndex]
      const ssidIndex = args.indexOf('ssid') + 1
      const ssid = args[ssidIndex]
      if (name) {
        this.connectionNames.push(name)
        if (ssid) {
          this.connectionMap[name] = ssid
        }
      }
      return { stdout: '' }
    }
    if (args.includes('connection') && args.includes('modify')) {
      this.lastModifyArgs.push(args.slice())
      return { stdout: '' }
    }
    if (args.includes('connection') && args.includes('up')) {
      const name = args[args.indexOf('up') + 1]
      this.lastUpConnection = name
      this.lastConnectArgs = args
      if (name) {
        const ssid = this.connectionMap[name] || name
        this.activeSsids = [ssid]
      }
      return { stdout: '' }
    }
    if (args.includes('dev') && args.includes('wifi') && args.includes('connect')) {
      this.lastConnectArgs = args
      if (this.failConnect) {
        return { error: 'connect failed', stderr: 'connect failed' }
      }
      const ssidIndex = args.indexOf('connect') + 1
      const ssid = args[ssidIndex]
      if (ssid) {
        this.activeSsids = [ssid]
      }
      return { stdout: '' }
    }
    if (args.includes('dev') && args.includes('disconnect')) {
      this.activeSsids = []
      return { stdout: '' }
    }
    if (args.includes('radio') && args.includes('wifi') && args.includes('on')) {
      return { stdout: '' }
    }
    return { stdout: '' }
  },
  reset: function () {
    this.commands = []
    this.scanResults = [
      { ssid: 'dashcam-ssid', security: 'WPA2' },
      { ssid: 'home-ssid', security: 'WPA2' }
    ]
    this.activeSsids = []
    this.failConnect = false
    this.lastConnectArgs = null
    this.lastUpConnection = null
    this.lastModifyArgs = []
    this.connectionNames = []
    this.connectionMap = {}
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
  child_process: {
    execFile: function (cmd, args, options, callback) {
      let cb = callback
      let opts = options
      if (typeof options === 'function') {
        cb = options
        opts = undefined
      }
      mockNmcli.commands.push({ cmd, args, options: opts })
      if (cmd !== 'nmcli') {
        const err = new Error('Unexpected command')
        cb(err)
        return
      }
      const result = mockNmcli.handle(args)
      if (result.error) {
        const err = new Error(result.error)
        err.stdout = result.stdout
        err.stderr = result.stderr
        cb(err, result.stdout || '', result.stderr || '')
        return
      }
      cb(null, result.stdout || '', result.stderr || '')
    }
  },
  axios: { __esModule: true, default: mockAxios },
  'samba-client': { __esModule: true, default: SambaClientMock },
  diskusage: { __esModule: true, default: mockDiskusage }
}

mockModules.child_process.execFile[promisify.custom] = function (cmd, args, options) {
  return new Promise((resolve, reject) => {
    mockModules.child_process.execFile(cmd, args, options, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout
        err.stderr = stderr
        reject(err)
        return
      }
      resolve({ stdout, stderr })
    })
  })
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
  mockNmcli.reset()
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
  assert.ok(mockNmcli.lastUpConnection)
  assert.strictEqual(mockNmcli.lastUpConnection.startsWith('dashcam-transporter-dashcam-'), true)
  const flattened = mockNmcli.lastModifyArgs.flat()
  assert.strictEqual(flattened.includes('802-11-wireless-security.key-mgmt'), true)
  assert.strictEqual(flattened.includes('wpa-psk'), true)
  assert.strictEqual(flattened.includes('802-11-wireless-security.psk'), true)
})

test('Wifi connection detection works', async () => {
  mockNmcli.activeSsids = ['dashcam-ssid']
  assert.strictEqual(await Wifi.isConnectedToDashcamWifi(), true)
  mockNmcli.activeSsids = ['other']
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
