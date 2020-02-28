import https from 'https'

import { HttpIncomingMessage, HttpJsonRequest, HttpRequest, HttpRequestListener, HttpTextRequest } from './http-common'
import { HttpServer, HttpServerOptions } from './http-server'
import { HttpsServer, HttpsServerOptions } from './https-server'

export type WebServerOptions = Omit<HttpsServerOptions, 'listenPort'> &
  Omit<HttpServerOptions, 'listenPort'> & {
    httpPort?: number
    httpsPort?: number
    requestIdGenerator?: (req: HttpIncomingMessage) => number
  }

export class WebServer {
  private httpServer: HttpServer
  private httpsServer: HttpsServer

  public httpListenUrl = ''
  public httpsListenUrl = ''
  private requestId = 1

  constructor(options: WebServerOptions, requestListener: HttpRequestListener) {
    const httpOption = {
      requestIdGenerator: () => {
        return this.requestId++
      },
      ...options,
      listenPort: options.httpPort
    }
    const httpsOption = {
      requestIdGenerator: () => {
        return this.requestId++
      },
      ...options,
      listenPort: options.httpsPort
    }
    this.httpServer = new HttpServer(httpOption, requestListener)
    this.httpsServer = new HttpsServer(httpsOption, requestListener)
  }

  public on(event: string, listener: (...args: any[]) => void): this {
    this.httpServer.on(event, listener)
    this.httpsServer.on(event, listener)
    return this
  }

  public async start(): Promise<void> {
    await this.httpServer.start()
    this.httpListenUrl = this.httpServer.listenUrl
    await this.httpsServer.start()
    this.httpsListenUrl = this.httpsServer.listenUrl
  }

  public async stop(): Promise<void> {
    await this.httpServer.stop()
    await this.httpsServer.stop()
  }

  public getCaAgent(): https.Agent {
    return this.httpsServer.getCaAgent()
  }

  public static getDefaultCertAgent(): https.Agent {
    return HttpsServer.getDefaultCertAgent()
  }

  public static getDefaultClientCerts(): Required<Pick<https.AgentOptions, 'ca' | 'key' | 'cert'>> {
    return HttpsServer.getDefaultClientCerts()
  }

  public getJsonRequests(): HttpJsonRequest[] {
    return [...this.httpServer.getJsonRequests(), ...this.httpsServer.getJsonRequests()].sort((a, b) => a.id - b.id)
  }

  public getTextRequests(): HttpTextRequest[] {
    return [...this.httpServer.getTextRequests(), ...this.httpsServer.getTextRequests()].sort((a, b) => a.id - b.id)
  }

  public getRequests(): HttpRequest[] {
    return [...this.httpServer.getRequests(), ...this.httpsServer.getRequests()].sort((a, b) => a.id - b.id)
  }

  public clearRequests(): void {
    this.httpServer.clearRequests()
    this.httpsServer.clearRequests()
  }

  public reset(): void {
    this.httpServer.reset()
    this.httpsServer.reset()
  }
}
