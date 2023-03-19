import wifi from 'node-wifi';
import { getDashcamWifiPassword, getDashcamWifiSSID, getHomeWifiPassword, getHomeWifiSSID } from './settings';


export const enableWifi =  () => {

      // Initialize wifi module
    wifi.init({
        iface: null // network interface, choose a random wifi interface if set to null
    });
}
export const tryToConnectToDashcamWifi = async () => {
    const wifiSettings = {
        ssid: await getDashcamWifiSSID(),
        password: await getDashcamWifiPassword()
    };

    //@ts-ignore
    return tryToConnectoToWifi(wifiSettings);
}
export const tryToConnectToHomeWifi = async () => {
    const wifiSettings = {
        ssid: await getHomeWifiSSID(),
        password: await getHomeWifiPassword()
    };

    //@ts-ignore
    return tryToConnectoToWifi(wifiSettings);
}

export const disconnectWifi = async () => {
    console.log("Disconnecting wifi");
    await wifi.disconnect();
}

export const isConnectedToDashcamWifi = async () => {
        console.log("Checking if wifi is connected");
        const dashcamSSID = await getDashcamWifiSSID();
        try {

            const currentConnections = await wifi.getCurrentConnections();
            if (currentConnections.find(connection => connection.ssid === dashcamSSID )) {
                console.log("Connected to wifi " + dashcamSSID);
                return true;
            } else {
                console.log("Not connected to " + dashcamSSID);
                return false;
            }
        } catch(e) {
            console.error("Error getting current wifi connections", e);
            throw e;
        }
}
export const isConnectedToHomeWifi = async () => {
    console.log("Checking if wifi is connected");
        const homeSSID = await getHomeWifiSSID();
        try {

            const currentConnections = await wifi.getCurrentConnections();
            if (currentConnections.find(connection => connection.ssid === homeSSID )) {
                console.log("Connected to wifi " + homeSSID);
                return true;
            } else {
                console.log("Not connected to " + homeSSID);
                return false;
            }
        } catch(e) {
            console.error("Error getting current wifi connections", e);
            throw e;
        }
}

const tryToConnectoToWifi = async (wifiSettings: { ssid: string; password: string; }) => {
        console.log("Sending wifi request");
        try {
            await wifi.connect(wifiSettings); 
        } catch(e) {
            console.log("Could not connect to wifi " + wifiSettings.ssid, e)
            throw e;
        }
        
        console.log("Connected to wifi", wifiSettings.ssid);
}


