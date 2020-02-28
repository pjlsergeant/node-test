import axios from 'axios'

import { HttpServer, HttpServerOptions } from './http-server'

export type TestHttpServerOptions = HttpServerOptions

class TestHttpServer extends HttpServer {
  constructor(options: TestHttpServerOptions = {}) {
    super(options, (req, res) => {
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
  }
}

describe('HttpServer', () => {
  const httpServer = new TestHttpServer()

  beforeAll(async () => {
    await httpServer.start()
  })

  afterAll(async () => {
    await httpServer.stop()
  })

  afterEach(async () => {
    httpServer.clearRequests()
  })

  it('Simple GET /', async () => {
    const response = await axios.get<string>(`${httpServer.listenUrl}`)
    expect(response.data).toEqual('Hello world')
    expect(httpServer.getTextRequests()).toMatchObject([
      {
        body: '',
        method: 'GET',
        url: '/'
      }
    ])
  })

  it('Simple POST /', async () => {
    const response = await axios.post<string>(`${httpServer.listenUrl}`, 'Hello')
    expect(response.data).toEqual('Hello world')
    expect(httpServer.getTextRequests()).toMatchObject([
      {
        body: 'Hello',
        method: 'POST',
        url: '/'
      }
    ])
  })
})
