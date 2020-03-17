import http from 'http'
import https from 'http'
import net from 'net'

import { Json } from '../common'
import {
  HttpIncomingMessage,
  HttpJsonRequest,
  HttpRequest,
  HttpRequestListener,
  HttpServerError,
  HttpTextRequest,
  readHttpMessageBody
} from './http-common'

export abstract class HttpServerBase<T extends http.Server | https.Server> {
  public listenPort: number
  public listenUrl = ''
  private baseUrl: string
  protected httpServer: T
  protected requests: HttpRequest[]

  // TODO: Move to options instead of adding more params
  constructor(baseUrl: string, httpServer: T, listenPort = 0, requests: HttpRequest[] = []) {
    this.httpServer = httpServer
    this.baseUrl = baseUrl
    this.listenPort = listenPort
    this.requests = requests
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

  public getJsonRequests<T = Json>(): HttpJsonRequest<T>[] {
    return this.requests.map<HttpJsonRequest<T>>(req => {
      return { ...req, body: req.body.length > 0 ? JSON.parse(req.body.toString('utf8')) : null }
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
    this.requests.length = 0
  }

  public reset(): void {
    this.clearRequests()
  }

  protected async saveRequest(req: HttpIncomingMessage): Promise<void> {
    // Make sure the host header is always stable
    const headers = { ...req.headers, host: 'localhost' }
    this.requests.push({
      method: req.method,
      url: req.url,
      headers: headers,
      body: await readHttpMessageBody(req)
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
