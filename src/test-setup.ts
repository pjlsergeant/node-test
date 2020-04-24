import childProcess from 'child_process'
import fs from 'fs'
import path from 'path'
import util from 'util'

const execAsync = util.promisify(childProcess.exec)
const fsSymlink = util.promisify(fs.symlink)
const fsUnlink = util.promisify(fs.unlink)

async function symlink(target: string, file: string): Promise<void> {
  await fsUnlink(file).catch(() => {
    // TODO: validate that it's no entry we get
  })
  await fsSymlink(path.resolve(target), file)
}

module.exports = async () => {
  // Make sure wrapper has been compiled
  await execAsync('npm run build:js')
  await symlink('build/dist/bin/run-wrapper.js', 'build/dist/bin/run-wrapper')
  await symlink('build/dist/bin/local-mysql.js', 'build/dist/bin/local-mysql')
  await symlink('build/dist/bin/cache-migrations.js', 'build/dist/bin/cache-migrations')
  process.env.PATH = `build/dist/bin:${process.env.PATH}`
}
