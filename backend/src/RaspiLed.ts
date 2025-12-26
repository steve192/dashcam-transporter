import fs from 'fs'
import { Logger } from './Logger'

export class RaspiLED {
  // Operations
  // IDLE = Waiting for transfer of dashcam / home
  // DASHCAMTRANSFER = Transferring from dashcam
  // HOMETRANSFER = Transferring to home
  private static _operation: 'IDLE' | 'DASHCAMTRANSFER' | 'HOMETRANSFER' = 'IDLE'
  private static ledStatus = false
  private static ledNames: string[] = []
  private static ledWriteDisabled = new Set<string>()
  private static readonly fastBlinkMs = 200
  private static readonly slowBlinkMs = 500
  private static readonly idleBlinkMs = 150
  private static readonly idlePauseMs = 1200
  private static idlePhase = 0

  private static isPiCached: undefined | boolean = undefined

  public static isRaspberryPi () {
    if (this.isPiCached !== undefined) {
      return this.isPiCached
    }

    const modelPaths = [
      '/proc/device-tree/model',
      '/sys/firmware/devicetree/base/model'
    ]

    for (const modelPath of modelPaths) {
      try {
        const model = fs.readFileSync(modelPath, { encoding: 'utf8' }).replace(/\0/g, '')
        if (model.includes('Raspberry Pi')) {
          this.isPiCached = true
          return true
        }
      } catch (e) {
        // ignore missing device-tree model path
      }
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
      'BCM2711', // Raspberry Pi 4B
      'BCM2712' // Raspberry Pi 5
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
      this.ledNames = this.detectLedNames()
      for (const ledName of this.ledNames) {
        try {
          fs.writeFileSync(`/sys/class/leds/${ledName}/trigger`, 'none')
        } catch (e) {
          RaspiLED.ledWriteDisabled.add(ledName)
        }
      }
    }
    Logger.info('LEDs setup')
    RaspiLED.updateStatus()
  }

  private static updateStatus () {
    let interval = RaspiLED.idlePauseMs

    if (RaspiLED.operation === 'DASHCAMTRANSFER') {
      RaspiLED.ledStatus = !RaspiLED.ledStatus
      interval = RaspiLED.fastBlinkMs
      RaspiLED.idlePhase = 0
    } else if (RaspiLED.operation === 'HOMETRANSFER') {
      RaspiLED.ledStatus = !RaspiLED.ledStatus
      interval = RaspiLED.slowBlinkMs
      RaspiLED.idlePhase = 0
    } else {
      const phase = RaspiLED.idlePhase
      RaspiLED.ledStatus = phase === 0 || phase === 2
      interval = phase === 4 ? RaspiLED.idlePauseMs : RaspiLED.idleBlinkMs
      RaspiLED.idlePhase = phase >= 4 ? 0 : phase + 1
    }

    if (RaspiLED.isRaspberryPi()) {
      for (const ledName of RaspiLED.ledNames) {
        if (RaspiLED.ledWriteDisabled.has(ledName)) {
          continue
        }
        try {
          fs.writeFileSync(`/sys/class/leds/${ledName}/brightness`, RaspiLED.ledStatus ? '1' : '0')
        } catch (e) {
          RaspiLED.ledWriteDisabled.add(ledName)
          const message = e instanceof Error ? e.message : 'unknown error'
          Logger.warn(`LED write failed for ${ledName}: ${message}`)
        }
      }
    }
    setTimeout(() => RaspiLED.updateStatus(), interval)
  }

  public static get operation () {
    return RaspiLED._operation
  }

  public static set operation (value) {
    if (RaspiLED._operation !== value && value === 'IDLE') {
      RaspiLED.idlePhase = 0
      RaspiLED.ledStatus = false
    }
    RaspiLED._operation = value
  }

  private static detectLedNames () {
    let available: string[]
    try {
      available = fs.readdirSync('/sys/class/leds')
    } catch (e) {
      return []
    }

    const availableSet = new Set(available)
    const legacy = ['led0', 'led1'].filter((name) => availableSet.has(name))
    if (legacy.length > 0) {
      return legacy
    }

    const named = ['ACT', 'PWR'].filter((name) => availableSet.has(name))
    if (named.length > 0) {
      return named
    }

    const namedLower = ['act', 'pwr'].filter((name) => availableSet.has(name))
    if (namedLower.length > 0) {
      return namedLower
    }

    return available.slice(0, 2)
  }
}
