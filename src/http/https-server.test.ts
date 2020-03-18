import axios from 'axios'
import tls from 'tls'

import { HttpsServer, HttpsServerOptions } from './https-server'

export type TestHttpsServerOptions = HttpsServerOptions

class TestHttpsServer extends HttpsServer {
  public constructor(options: TestHttpsServerOptions = {}) {

    super(options, (req, res) => {
      // Map the responses
      switch (req.url) {
        case '/': {
          return res.end('Hello world')
        }
        case '/cert': {
          const socket = res.socket as tls.TLSSocket
          if (!socket.authorized) {
            res.statusCode = 403
            return res.end('No client certificate provided or unknown ca')
          }
          const certificate = socket.getPeerCertificate(true)
          return res.end(`Success for client ${certificate.subject.CN}`)
        }
        default: {
          res.statusCode = 404
          return res.end('Not found')
        }
      }
    })
  }
}

describe('HttpServer', () => {
  const httpsServer = new TestHttpsServer()

  beforeAll(async () => {
    await httpsServer.start()
  })

  afterAll(async () => {
    await httpsServer.stop()
  })

  afterEach(async () => {
    httpsServer.reset()
  })

  it('Simple GET / with https', async () => {
    const response = await axios.get<string>(`${httpsServer.listenUrl}`, { httpsAgent: httpsServer.getCaAgent() })
    expect(response.data).toEqual('Hello world')
  })

  it('Simple GET / with https and client cert', async () => {
    const response = await axios.get<string>(`${httpsServer.listenUrl}/cert`, {
      httpsAgent: HttpsServer.getDefaultCertAgent()
    })
    expect(response.data).toEqual('Success for client localhost')
  })
})
