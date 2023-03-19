import propertiesReader from 'properties-reader'

// eslint-disable-next-line n/no-path-concat
const properties = propertiesReader(__dirname + '/settings.ini')

export const getDashcamWifiSSID = async () => {
  return properties.get('dashcam.ssid') as string
}

export const getDashcamWifiPassword = async () => {
  return properties.get('dashcam.password') as string
}
export const getHomeWifiSSID = async () => {
  return properties.get('home.ssid') as string
}

export const getHomeWifiPassword = async () => {
  return properties.get('home.password') as string
}

export const getDownloadDirectory = async () => {
  return '/opt/videodownload'
}

export const getSMBSettings = async () => {
  return {
    enabled: properties.get('smb.enabled') === 'true',
    host: properties.get('smb.host') as string,
    username: properties.get('smb.username') as string,
    password: properties.get('smb.password') as string,
    storagePath: properties.get('smb.storagepath') as string
  }
}
