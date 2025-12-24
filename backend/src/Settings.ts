import fs from 'fs'
import path from 'path'
import propertiesReader from 'properties-reader'

const defaultSettingsPath = process.env.DASHCAM_TRANSPORTER_SETTINGS ?? '/etc/dashcam-transporter/settings.ini'
const localSettingsPath = path.join(__dirname, 'settings.ini')
const settingsPath = fs.existsSync(defaultSettingsPath) ? defaultSettingsPath : localSettingsPath
const properties = propertiesReader(settingsPath)

export class Settings {
  public static async getDashcamWifiSSID () {
    return properties.get('dashcam.ssid') as string
  }

  public static async getDashcamWifiPassword () {
    return properties.get('dashcam.password') as string
  }

  public static async getDashcamModel () {
    let model = properties.get('dashcam.model') as string
    model = model ?? 'VIOFOA199MINI'
    return model
  }

  public static async getHomeWifiSSID () {
    return properties.get('home.ssid') as string
  }

  public static async getHomeWifiPassword () {
    return properties.get('home.password') as string
  }

  public static async getDownloadDirectory () {
    return '/opt/videodownload'
  }

  public static async getSMBSettings () {
    const enabledValue = properties.get('smb.enabled')
    return {
      enabled: String(enabledValue).toLowerCase() === 'true',
      host: properties.get('smb.host') as string,
      username: properties.get('smb.username') as string,
      password: properties.get('smb.password') as string,
      storagePath: properties.get('smb.storagepath') as string
    }
  }
}
