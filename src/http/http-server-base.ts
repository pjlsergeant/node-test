import http from 'http'
import https from 'http'
import net from 'net'

import {
  HttpIncomingMessage,
  HttpJsonRequest,
  HttpRequest,
  HttpRequestListener,
  HttpServerError,
  HttpTextRequest,
  readBody
} from './http-common'

export class HttpServerBase<T extends http.Server | https.Server> {
  public listenPort: number
  public listenUrl = ''
  private baseUrl: string
  protected httpServer: T
  protected requests: HttpRequest[] = []

  constructor(baseUrl: string, httpServer: T, listenPort = 0) {
    this.httpServer = httpServer
    this.baseUrl = baseUrl
    this.listenPort = listenPort
  }

  protected handleRequest(
    req: HttpIncomingMessage,
    res: http.ServerResponse,
    requestListener: HttpRequestListener
  ): void {
    try {
      Promise.all([this.saveRequest(req), Promise.resolve(requestListener(req, res))]).catch(e => {
        this.handleError(res, e)
      })
    } catch (e) {
      this.handleError(res, e)
    }
  }

  public on(event: string, listener: (...args: any[]) => void): this {
    this.httpServer.on(event, listener)
    return this
  }

  public async start(): Promise<void> {
    this.httpServer.on('listening', () => {
      const addressInfo = this.httpServer.address() as net.AddressInfo
      this.listenPort = addressInfo.port
      this.listenUrl = `${this.baseUrl}:${this.listenPort}`
    })
    return new Promise(resolve => {
      this.httpServer.listen(this.listenPort, () => {
        // TODO: Error handling, fx if the port is used
        resolve()
      })
    })
  }

  public async stop(): Promise<void> {
    return new Promise(resolve => {
      // TODO: Error handling
      this.httpServer.close(() => {
        resolve()
      })
    })
  }

  public getJsonRequests(): HttpJsonRequest[] {
    return this.requests.map(req => {
      return { ...req, body: JSON.parse(req.body.toString('utf8')) }
    })
  }

  public getTextRequests(): HttpTextRequest[] {
    return this.requests.map(req => {
      return { ...req, body: req.body.toString('utf8') }
    })
  }

  public getRequests(): HttpRequest[] {
    return this.requests
  }

  public clearRequests(): void {
    this.requests = []
  }

  protected async saveRequest(req: HttpIncomingMessage): Promise<void> {
    // Make sure the host header is always stable
    const headers = { ...req.headers, host: 'localhost' }
    this.requests.push({
      method: req.method,
      url: req.url,
      headers: headers,
      body: await readBody(req),
      receivedAt: new Date()
    })
  }

  protected handleError(res: http.ServerResponse, e: Error): void {
    if (e instanceof HttpServerError) {
      res.statusCode = e.statusCode
      res.end(e.message)
    } else {
      res.statusCode = 500
      res.end('Unknown error')
      this.httpServer.emit('error', e)
    }
  }
}
