import fs from 'fs'

export class RaspiLED {
  // Operations
  // IDLE = Waiting for transfer of dashcam / home
  // DASHCAMTRANSFER = Transferring from dashcam
  // HOMETRANSFER = Transferring to home
  private static _operation: 'IDLE' | 'DASHCAMTRANSFER' | 'HOMETRANSFER' = 'IDLE'
  private static ledStatus = false

  private static isPiCached: undefined | boolean = undefined

  public static isRaspberryPi () {
    if (this.isPiCached !== undefined) {
      return this.isPiCached
    }

    const piModels = [
      // https://www.raspberrypi.org/documentation/hardware/raspberrypi/
      'BCM2708',
      'BCM2709',
      'BCM2710',
      'BCM2835', // Raspberry Pi 1 and Zero
      'BCM2836', // Raspberry Pi 2
      'BCM2837', // Raspberry Pi 3 (and later Raspberry Pi 2)
      'BCM2837B0', // Raspberry Pi 3B+ and 3A+
      'BCM2711' // Raspberry Pi 4B
    ]

    let cpuInfo: string
    try {
      cpuInfo = fs.readFileSync('/proc/cpuinfo', { encoding: 'utf8' })
    } catch (e) {
      // No file found, expect no pi
      return false
    }

    let isPi = false
    piModels.forEach(model => {
      if (cpuInfo.includes(model)) {
        isPi = true
      }
    })

    this.isPiCached = isPi
    return this.isPiCached
  }

  public static initialize () {
    if (this.isRaspberryPi()) {
      fs.writeFileSync('/sys/class/leds/led0/trigger', 'none')
      fs.writeFileSync('/sys/class/leds/led1/trigger', 'none')
    }
    console.log('LEDs setup')
    RaspiLED.updateStatus()
  }

  private static updateStatus () {
    if (RaspiLED.operation === 'IDLE') {
      RaspiLED.ledStatus = !RaspiLED.ledStatus
    } else if (RaspiLED.operation === 'DASHCAMTRANSFER' || RaspiLED.operation === 'HOMETRANSFER') {
      RaspiLED.ledStatus = true
    }

    if (this.isRaspberryPi()) {
      fs.writeFileSync('/sys/class/leds/led0/brightness', RaspiLED.ledStatus ? '1' : '0')
      fs.writeFileSync('/sys/class/leds/led1/brightness', RaspiLED.ledStatus ? '1' : '0')
    }
    setTimeout(RaspiLED.updateStatus, 500)
  }

  public static get operation () {
    return RaspiLED._operation
  }

  public static set operation (value) {
    RaspiLED._operation = value
  }
}
