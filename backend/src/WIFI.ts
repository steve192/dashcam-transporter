import { execFile } from 'child_process'
import { promisify } from 'util'
import { Logger } from './Logger'
import { Settings } from './Settings'

const execFileAsync = promisify(execFile)

type ScanResult = {
  ssid: string
  security: string
}

export class Wifi {
  private static lastDashcamConnected: boolean | null = null
  private static lastHomeConnected: boolean | null = null

  public static async enableWifi () {
    try {
      await Wifi.runNmcli(['radio', 'wifi', 'on'])
    } catch (error) {
      Logger.warn('Failed to enable WiFi radio', error)
    }
  }

  public static async tryToConnectToDashcamWifi () {
    const wifiSettings = {
      ssid: await Settings.getDashcamWifiSSID(),
      password: await Settings.getDashcamWifiPassword()
    }

    await Wifi.tryToConnectoToWifi('dashcam', wifiSettings)
  }

  public static async tryToConnectToHomeWifi () {
    const wifiSettings = {
      ssid: await Settings.getHomeWifiSSID(),
      password: await Settings.getHomeWifiPassword()
    }

    await Wifi.tryToConnectoToWifi('home', wifiSettings)
  }

  public static async disconnectWifi () {
    Logger.debug('Disconnecting wifi')
    const devices = await Wifi.listWifiDevices()
    for (const device of devices) {
      if (device.state === 'connected' || device.state === 'connecting') {
        await Wifi.runNmcli(['dev', 'disconnect', device.device])
      }
    }
  }

  public static async isConnectedToDashcamWifi () {
    const dashcamSSID = await Settings.getDashcamWifiSSID()
    const connected = await Wifi.isConnectedToSsid(dashcamSSID)
    Wifi.logConnectionChange('dashcam', dashcamSSID, connected)
    return connected
  }

  public static async isConnectedToHomeWifi () {
    const homeSSID = await Settings.getHomeWifiSSID()
    const connected = await Wifi.isConnectedToSsid(homeSSID)
    Wifi.logConnectionChange('home', homeSSID, connected)
    return connected
  }

  private static async isConnectedToSsid (ssid: string) {
    const activeSsids = await Wifi.getActiveSsids()
    return activeSsids.includes(ssid)
  }

  private static async tryToConnectoToWifi (type: 'dashcam' | 'home', wifiSettings: { ssid: string, password: string }) {
    let networks: ScanResult[]
    try {
      networks = await Wifi.scanNetworks()
    } catch (error) {
      Logger.warn('WiFi scan failed', error)
      throw error
    }
    const match = networks.find((network) => network.ssid === wifiSettings.ssid)
    if (!match) {
      Logger.debug(`WiFi SSID not found in scan: ${wifiSettings.ssid}`)
      throw new Error(`WiFi SSID not found: ${wifiSettings.ssid}`)
    }

    const keyMgmt = Wifi.determineKeyMgmt(match.security, wifiSettings.password)
    const device = await Wifi.getPrimaryWifiDevice()
    const connectionName = Wifi.buildConnectionName(type, wifiSettings.ssid)

    Logger.debug('Sending wifi request', wifiSettings.ssid)
    try {
      await Wifi.ensureConnection(connectionName, wifiSettings.ssid, device)
      await Wifi.configureSecurity(connectionName, keyMgmt, wifiSettings.password)
      await Wifi.runNmcli(['connection', 'up', connectionName])
    } catch (e) {
      const message = Wifi.getErrorMessage(e)
      if (message.includes('No network with SSID') || message.includes('not found')) {
        Logger.debug(`Could not connect to wifi ${wifiSettings.ssid}: ${message}`)
      } else {
        Logger.warn(`Could not connect to wifi ${wifiSettings.ssid}: ${message}`)
      }
      throw e
    }
    Wifi.logConnectionChange(type, wifiSettings.ssid, true)
  }

  private static async scanNetworks (): Promise<ScanResult[]> {
    const output = await Wifi.runNmcli([
      '-t',
      '-f',
      'SSID,SECURITY',
      'dev',
      'wifi',
      'list',
      '--rescan',
      'yes'
    ])
    const results = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .map((line) => {
        const [ssid, security] = Wifi.parseFields(line, 2)
        return {
          ssid: ssid ?? '',
          security: security ?? ''
        }
      })
      .filter((entry) => entry.ssid !== '')
    Logger.debug(`WiFi scan found ${results.length} network(s)`)
    return results
  }

  private static determineKeyMgmt (security: string, password: string) {
    const cleaned = security.trim().toUpperCase()
    if (cleaned === '' || cleaned === '--' || cleaned === 'NONE' || cleaned === 'OPEN') {
      return 'none'
    }
    if (cleaned.includes('EAP') || cleaned.includes('802.1X')) {
      throw new Error(`Enterprise WiFi not supported for security ${security}`)
    }
    if (cleaned.includes('SAE')) {
      return 'sae'
    }
    if (cleaned.includes('OWE')) {
      return 'owe'
    }
    if (cleaned.includes('WEP')) {
      return 'wep'
    }
    if (cleaned.includes('WPA') || cleaned.includes('RSN')) {
      if (password == null || password === '') {
        throw new Error('WiFi password missing for secured network')
      }
      return 'wpa-psk'
    }
    return password != null && password !== '' ? 'wpa-psk' : 'none'
  }

  private static async getActiveSsids () {
    const output = await Wifi.runNmcli([
      '-t',
      '-f',
      'ACTIVE,SSID',
      'dev',
      'wifi'
    ])
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .map((line) => Wifi.parseFields(line, 2))
      .filter((parts) => parts[0] === 'yes' && parts[1] != null)
      .map((parts) => parts[1])
  }

  private static async listWifiDevices () {
    const output = await Wifi.runNmcli([
      '-t',
      '-f',
      'DEVICE,TYPE,STATE',
      'dev'
    ])
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .map((line) => {
        const [device, type, state] = Wifi.parseFields(line, 3)
        return {
          device: device ?? '',
          type: type ?? '',
          state: state ?? ''
        }
      })
      .filter((entry) => entry.device !== '' && entry.type === 'wifi')
  }

  private static async getPrimaryWifiDevice () {
    const devices = await Wifi.listWifiDevices()
    if (devices.length === 0) {
      throw new Error('No WiFi devices found')
    }
    return devices[0].device
  }

  private static buildConnectionName (type: 'dashcam' | 'home', ssid: string) {
    const cleaned = ssid.replace(/[^a-zA-Z0-9_-]/g, '_')
    const suffix = cleaned.length > 40 ? cleaned.slice(0, 40) : cleaned
    return `dashcam-transporter-${type}-${suffix}`
  }

  private static async listConnectionNames () {
    const output = await Wifi.runNmcli([
      '-t',
      '-f',
      'NAME',
      'connection',
      'show'
    ])
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '')
  }

  private static async ensureConnection (name: string, ssid: string, device: string) {
    const existing = await Wifi.listConnectionNames()
    if (!existing.includes(name)) {
      await Wifi.runNmcli(['connection', 'add', 'type', 'wifi', 'ifname', device, 'con-name', name, 'ssid', ssid])
    }
    await Wifi.runNmcli(['connection', 'modify', name, 'connection.autoconnect', 'no'])
    await Wifi.runNmcli(['connection', 'modify', name, '802-11-wireless.ssid', ssid])
  }

  private static async configureSecurity (name: string, keyMgmt: string, password: string) {
    if (keyMgmt === 'none') {
      await Wifi.runNmcli(['connection', 'modify', name, '802-11-wireless-security.key-mgmt', 'none'])
      await Wifi.runNmcli(['connection', 'modify', name, '802-11-wireless-security.psk', ''])
      return
    }

    if (keyMgmt === 'wep') {
      if (password == null || password === '') {
        throw new Error('WiFi password missing for WEP network')
      }
      await Wifi.runNmcli(['connection', 'modify', name, '802-11-wireless-security.key-mgmt', 'none'])
      await Wifi.runNmcli(['connection', 'modify', name, '802-11-wireless-security.wep-key-type', 'key'])
      await Wifi.runNmcli(['connection', 'modify', name, '802-11-wireless-security.wep-key0', password])
      return
    }

    if (password == null || password === '') {
      throw new Error('WiFi password missing for secured network')
    }
    await Wifi.runNmcli(['connection', 'modify', name, '802-11-wireless-security.key-mgmt', keyMgmt])
    await Wifi.runNmcli(['connection', 'modify', name, '802-11-wireless-security.psk', password])
  }

  private static async runNmcli (args: string[]) {
    Logger.debug(`nmcli ${args.join(' ')}`)
    try {
      const result = await execFileAsync('nmcli', args, { encoding: 'utf8' })
      const stdout = typeof result.stdout === 'string' ? result.stdout : ''
      if (stdout.trim() !== '') {
        Logger.debug(`nmcli output: ${stdout.trim()}`)
      }
      return stdout.trimEnd()
    } catch (error) {
      const err = error as { stdout?: string | Buffer, stderr?: string | Buffer, message?: string }
      const stdout = err.stdout ? String(err.stdout) : ''
      const stderr = err.stderr ? String(err.stderr) : ''
      const message = stderr.trim() || stdout.trim() || err.message || 'nmcli failed'
      Logger.debug(`nmcli error output: ${message}`)
      throw new Error(message)
    }
  }

  private static logConnectionChange (type: 'dashcam' | 'home', ssid: string, isConnected: boolean) {
    if (type === 'dashcam') {
      if (Wifi.lastDashcamConnected === isConnected) {
        return
      }
      Wifi.lastDashcamConnected = isConnected
    } else {
      if (Wifi.lastHomeConnected === isConnected) {
        return
      }
      Wifi.lastHomeConnected = isConnected
    }

    if (isConnected) {
      Logger.info(`Connected to wifi ${ssid}`)
    } else {
      Logger.info(`Disconnected from wifi ${ssid}`)
    }
  }

  private static getErrorMessage (error: unknown) {
    if (error instanceof Error && error.message != null) {
      return error.message
    }
    return String(error)
  }

  private static parseFields (line: string, expectedCount: number) {
    const fields: string[] = []
    let current = ''
    let escaping = false
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i]
      if (escaping) {
        current += char
        escaping = false
        continue
      }
      if (char === '\\') {
        escaping = true
        continue
      }
      if (char === ':' && fields.length < expectedCount - 1) {
        fields.push(current)
        current = ''
        continue
      }
      current += char
    }
    fields.push(current)
    return fields
  }
}
