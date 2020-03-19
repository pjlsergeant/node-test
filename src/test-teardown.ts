import fs from 'fs'
import util from 'util'

const fsUnlink = util.promisify(fs.unlink)

module.exports = async () => {
  await fsUnlink('build/dist/bin/run-wrapper').catch(() => {
    // TODO: validate that it's no entry we get
  })
}
