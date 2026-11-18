// Loads an installed dashcam-transporter on the system's own Node.js: every runtime
// dependency, then every compiled module except the app.js entry point (which would
// start the service). Fails when a dependency no longer runs on the Node.js the OS
// ships, or when postinst did not rebuild a native module.
//
// Usage: node smoke-test.js [app directory, default /opt/dashcam-transporter]
const fs = require('fs')
const path = require('path')

const appDir = path.resolve(process.argv[2] || '/opt/dashcam-transporter')
const pkg = require(path.join(appDir, 'package.json'))

console.log(`Node.js ${process.version} on ${process.platform}/${process.arch}`)

for (const dep of Object.keys(pkg.dependencies || {})) {
  require(require.resolve(dep, { paths: [appDir] }))
  console.log(`ok - dependency ${dep}`)
}

const modules = []
const collect = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      collect(full)
    } else if (entry.isFile() && entry.name.endsWith('.js') && full !== path.join(appDir, 'app.js')) {
      modules.push(full)
    }
  }
}
collect(appDir)

for (const mod of modules.sort()) {
  require(mod)
  console.log(`ok - module ${path.relative(appDir, mod)}`)
}

console.log('Smoke test passed')
