import childProcess from 'child_process'
import fs from 'fs'
import path from 'path'
import util from 'util'

const execAsync = util.promisify(childProcess.exec)
const fsSymlink = util.promisify(fs.symlink)
const fsUnlink = util.promisify(fs.unlink)

module.exports = async () => {
  // Make sure wrapper has been compiled
  await execAsync('npm run build:js')
  try {
    await fsUnlink('build/dist/bin/run-wrapper').catch(() => {
      // TODO: validate that it's no entry we get
    })
    await fsSymlink(path.resolve('build/dist/bin/run-wrapper.js'), 'build/dist/bin/run-wrapper')
  } catch (e) {
    // Ignore
  }
}
