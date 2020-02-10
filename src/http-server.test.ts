import axios from 'axios'

import { HttpServer } from './http-server'

describe('HttpServer', () => {
  const httpServer = new HttpServer({}, (req, res) => {
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
    expect(httpServer.getStringRequests()).toMatchObject([
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
    expect(httpServer.getStringRequests()).toMatchObject([
      {
        body: 'Hello',
        method: 'POST',
        url: '/'
      }
    ])
  })
})
