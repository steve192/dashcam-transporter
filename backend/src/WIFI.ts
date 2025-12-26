import wifi from 'node-wifi'
import { Logger } from './Logger'
import { Settings } from './Settings'

export class Wifi {
  private static lastDashcamConnected: boolean | null = null
  private static lastHomeConnected: boolean | null = null

  public static async enableWifi () {
    // Initialize wifi module
    wifi.init({
      iface: null // network interface, choose a random wifi interface if set to null
    })
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
    await wifi.disconnect()
  }

  public static async isConnectedToDashcamWifi () {
    const dashcamSSID = await Settings.getDashcamWifiSSID()
    try {
      const currentConnections = await wifi.getCurrentConnections()
      if (currentConnections.find(connection => connection.ssid === dashcamSSID) != null) {
        Wifi.logConnectionChange('dashcam', dashcamSSID, true)
        return true
      } else {
        Wifi.logConnectionChange('dashcam', dashcamSSID, false)
        return false
      }
    } catch (e) {
      throw e
    }
  }

  public static async isConnectedToHomeWifi () {
    const homeSSID = await Settings.getHomeWifiSSID()
    try {
      const currentConnections = await wifi.getCurrentConnections()
      if (currentConnections.find(connection => connection.ssid === homeSSID) != null) {
        Wifi.logConnectionChange('home', homeSSID, true)
        return true
      } else {
        Wifi.logConnectionChange('home', homeSSID, false)
        return false
      }
    } catch (e) {
      throw e
    }
  }

  private static async tryToConnectoToWifi (type: 'dashcam' | 'home', wifiSettings: { ssid: string, password: string }) {
    const networkFound = await Wifi.scanForNetwork(wifiSettings.ssid)
    if (!networkFound) {
      Logger.debug(`WiFi SSID not found in scan: ${wifiSettings.ssid}`)
      throw new Error(`WiFi SSID not found: ${wifiSettings.ssid}`)
    }

    Logger.debug('Sending wifi request', wifiSettings.ssid)
    try {
      await wifi.connect(wifiSettings)
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

  private static async scanForNetwork (ssid: string) {
    try {
      const networks = await wifi.scan()
      return networks.some((network) => network.ssid === ssid)
    } catch (error) {
      Logger.warn('WiFi scan failed', error)
      return true
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
}
