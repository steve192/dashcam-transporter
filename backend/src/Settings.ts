import fs from 'fs'
import path from 'path'
import propertiesReader from 'properties-reader'

const defaultSettingsPath = '/etc/dashcam-transporter/settings.ini'
const localSettingsPath = path.join(__dirname, 'settings.ini')
const requiredSettings = [
  'home.ssid',
  'home.password',
  'dashcam.ssid',
  'dashcam.password',
  'dashcam.model'
]

const resolveSettingsPath = () => {
  const envSettingsPath = process.env.DASHCAM_TRANSPORTER_SETTINGS
  if (envSettingsPath != null && envSettingsPath.trim() !== '') {
    return envSettingsPath
  }
  if (fs.existsSync(localSettingsPath)) {
    return localSettingsPath
  }
  if (fs.existsSync(defaultSettingsPath)) {
    return defaultSettingsPath
  }
  return defaultSettingsPath
}

const loadProperties = (settingsPath: string) => {
  if (!fs.existsSync(settingsPath)) {
    return propertiesReader('')
  }
  try {
    return propertiesReader(settingsPath)
  } catch {
    return propertiesReader('')
  }
}

let activeSettingsPath = resolveSettingsPath()
let properties = loadProperties(activeSettingsPath)

export class Settings {
  public static reload () {
    activeSettingsPath = resolveSettingsPath()
    properties = loadProperties(activeSettingsPath)
  }

  public static getSettingsPath () {
    return activeSettingsPath
  }

  public static hasSettingsFile () {
    return fs.existsSync(activeSettingsPath)
  }

  public static getMissingRequiredSettings () {
    return requiredSettings.filter((key) => {
      const value = properties.getRaw(key)
      return value == null || value.trim() === ''
    })
  }

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
    const shareValue = properties.get('smb.share')
    const share = shareValue != null && String(shareValue).trim() !== '' ? String(shareValue) : 'home'
    return {
      enabled: String(enabledValue).toLowerCase() === 'true',
      host: properties.get('smb.host') as string,
      share,
      username: properties.get('smb.username') as string,
      password: properties.get('smb.password') as string,
      storagePath: properties.get('smb.storagepath') as string
    }
  }

  public static async getNextcloudSettings () {
    const enabledValue = properties.get('nextcloud.enabled')
    return {
      enabled: String(enabledValue).toLowerCase() === 'true',
      url: properties.get('nextcloud.url') as string,
      username: properties.get('nextcloud.username') as string,
      password: properties.get('nextcloud.password') as string,
      storagePath: properties.get('nextcloud.storagepath') as string
    }
  }

  public static async getLogLevel () {
    const envLevel = process.env.DASHCAM_TRANSPORTER_LOG_LEVEL
    if (envLevel != null && envLevel.trim() !== '') {
      return envLevel
    }
    const level = properties.get('logging.level') as string
    return level != null && level.trim() !== '' ? level : 'info'
  }
}
