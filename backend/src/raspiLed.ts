import fs from 'fs';




export class RaspiLED {
    // Operations
    // IDLE = Waiting for transfer of dashcam / home
    // DASHCAMTRANSFER = Transferring from dashcam
    // HOMETRANSFER = Transferring to home
    private static _operation: "IDLE" | "DASHCAMTRANSFER" | "HOMETRANSFER" = "IDLE";
    private static ledStatus = false;

    public static initialize() {
        fs.writeFileSync("/sys/class/leds/led0/trigger", "none");
        fs.writeFileSync("/sys/class/leds/led1/trigger", "none");
        console.log("LEDs setup");
        RaspiLED.updateStatus();
    }

    private static updateStatus() {
        if (RaspiLED.operation === "IDLE") {
            RaspiLED.ledStatus = !RaspiLED.ledStatus;
        } else if(RaspiLED.operation === "DASHCAMTRANSFER" || RaspiLED.operation === "HOMETRANSFER") {
            RaspiLED.ledStatus = true;
        }

        fs.writeFileSync('/sys/class/leds/led0/brightness', RaspiLED.ledStatus ? "1" : "0");
        fs.writeFileSync('/sys/class/leds/led1/brightness', RaspiLED.ledStatus ? "1" : "0");
        setTimeout(RaspiLED.updateStatus, 500);
    }

    public static get operation() {
        return RaspiLED._operation;
    }
    public static set operation(value) {
        RaspiLED._operation = value;
    }
}