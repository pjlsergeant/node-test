import axios from 'axios'

import { readHttpMessageBody } from './http-common'
import { HttpServer, HttpServerOptions } from './http-server'

export type TestHttpServerOptions = HttpServerOptions

class TestHttpServer extends HttpServer {
  constructor(options: TestHttpServerOptions = {}) {
    super(options, async (req, res) => {
      // Map the responses
      switch (req.url) {
        case '/': {
          return res.end('Hello world')
        }
        case '/json': {
          const body = await readHttpMessageBody(req)
          return res.end(body)
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
    httpServer.reset()
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
    // We have this to test that http requests are stable
    expect(httpServer.getTextRequests()).toMatchSnapshot()
  })

  it('should GET /json and return json requests', async () => {
    const response = await axios.post<string>(`${httpServer.listenUrl}/json`, { test: 'data' })
    expect(response.data).toMatchObject({ test: 'data' })
    expect(httpServer.getJsonRequests()).toMatchObject([
      {
        body: { test: 'data' },
        method: 'POST',
        url: '/json'
      }
    ])
    // We have this to test that http requests are stable
    expect(httpServer.getJsonRequests()).toMatchSnapshot()

    // Validate types
    expect(httpServer.getJsonRequests()[0].body).toMatchObject({ test: 'data' })
    expect(httpServer.getJsonRequests<{ test: string }>()[0].body?.test).toEqual('data')
  })
})
