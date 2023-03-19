import wifi from 'node-wifi'
import { Settings } from './Settings'

export class Wifi {
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

    await Wifi.tryToConnectoToWifi(wifiSettings)
  }

  public static async tryToConnectToHomeWifi () {
    const wifiSettings = {
      ssid: await Settings.getHomeWifiSSID(),
      password: await Settings.getHomeWifiPassword()
    }

    await Wifi.tryToConnectoToWifi(wifiSettings)
  }

  public static async disconnectWifi () {
    console.log('Disconnecting wifi')
    await wifi.disconnect()
  }

  public static async isConnectedToDashcamWifi () {
    console.log('Checking if wifi is connected')
    const dashcamSSID = await Settings.getDashcamWifiSSID()
    try {
      const currentConnections = await wifi.getCurrentConnections()
      if (currentConnections.find(connection => connection.ssid === dashcamSSID) != null) {
        console.log('Connected to wifi ' + dashcamSSID)
        return true
      } else {
        console.log('Not connected to ' + dashcamSSID)
        return false
      }
    } catch (e) {
      console.error('Error getting current wifi connections', e)
      throw e
    }
  }

  public static async isConnectedToHomeWifi () {
    console.log('Checking if wifi is connected')
    const homeSSID = await Settings.getHomeWifiSSID()
    try {
      const currentConnections = await wifi.getCurrentConnections()
      if (currentConnections.find(connection => connection.ssid === homeSSID) != null) {
        console.log('Connected to wifi ' + homeSSID)
        return true
      } else {
        console.log('Not connected to ' + homeSSID)
        return false
      }
    } catch (e) {
      console.error('Error getting current wifi connections', e)
      throw e
    }
  }

  private static async tryToConnectoToWifi (wifiSettings: { ssid: string, password: string }) {
    console.log('Sending wifi request')
    try {
      await wifi.connect(wifiSettings)
    } catch (e) {
      console.log('Could not connect to wifi ' + wifiSettings.ssid, e)
      throw e
    }

    console.log('Connected to wifi', wifiSettings.ssid)
  }
}
