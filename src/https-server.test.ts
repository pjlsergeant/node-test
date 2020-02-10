import axios from 'axios'
import https from 'https'

import { HttpsServer } from './https-server'

describe('HttpServer', () => {
  const httpsServer = new HttpsServer({}, (req, res) => {
    // Map the responses
    switch (req.url) {
      case '/': {
        return res.end('Hello world')
      }
      default: {
        res.statusCode = 404
        return res.end('Not found')
      }
    }
  })
  const httpsAgent = new https.Agent({
    ca: httpsServer.cert
  })

  beforeAll(async () => {
    await httpsServer.start()
  })

  afterAll(async () => {
    await httpsServer.stop()
  })

  afterEach(async () => {
    httpsServer.clearRequests()
  })

  it('Simple GET / with https', async () => {
    const response = await axios.get<string>(`${httpsServer.listenUrl}`, { httpsAgent })
    expect(response.data).toEqual('Hello world')
  })
})
