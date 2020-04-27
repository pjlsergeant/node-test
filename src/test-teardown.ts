import fs from 'fs'
import util from 'util'

const fsUnlink = util.promisify(fs.unlink)

module.exports = async () => {
  await fsUnlink('bin/run-wrapper.js').catch(() => {
    // TODO: validate that it's no entry we get
  })
}
