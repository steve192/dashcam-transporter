type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50
}

export class Logger {
  private static levelName: LogLevel = Logger.parseLevel(process.env.DASHCAM_TRANSPORTER_LOG_LEVEL)
  private static levelValue: number = levelOrder[Logger.levelName]

  public static setLevel (level?: string) {
    const parsed = Logger.parseLevel(level)
    Logger.levelName = parsed
    Logger.levelValue = levelOrder[parsed]
  }

  public static getLevel () {
    return Logger.levelName
  }

  public static debug (...args: any[]) {
    Logger.write('debug', console.log, args)
  }

  public static info (...args: any[]) {
    Logger.write('info', console.log, args)
  }

  public static warn (...args: any[]) {
    Logger.write('warn', console.warn, args)
  }

  public static error (...args: any[]) {
    Logger.write('error', console.error, args)
  }

  private static write (level: LogLevel, writer: (...args: any[]) => void, args: any[]) {
    if (levelOrder[level] < Logger.levelValue) {
      return
    }
    const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`
    writer(prefix, ...args)
  }

  private static parseLevel (value?: string): LogLevel {
    if (value == null) {
      return 'info'
    }
    const normalized = value.trim().toLowerCase()
    if (normalized === 'debug') return 'debug'
    if (normalized === 'info') return 'info'
    if (normalized === 'warn' || normalized === 'warning') return 'warn'
    if (normalized === 'error') return 'error'
    if (normalized === 'silent' || normalized === 'none' || normalized === 'off') return 'silent'
    return 'info'
  }
}
