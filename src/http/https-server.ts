import https from 'https'

import { HttpIncomingMessage, HttpRequest, HttpRequestListener } from './http-common'
import { HttpServerBase } from './http-server-base'
import {
  clientCaCertificate,
  clientCertificate,
  clientKey,
  localhostCertificate,
  localhostKey
} from './https-certificates'

export type HttpsServerOptions = https.ServerOptions & {
  listenPort?: number
  requests?: HttpRequest[]
}

export class HttpsServer extends HttpServerBase<https.Server> {
  public cert: HttpsServerOptions['cert']
  public key: HttpsServerOptions['key']

  constructor(options: HttpsServerOptions, requestListener: HttpRequestListener) {
    options = {
      cert: localhostCertificate,
      key: localhostKey,
      ca: clientCaCertificate,
      requestCert: true,
      rejectUnauthorized: false, // so we can do own error handling
      ...options
    }
    super(
      'https://localhost',
      https.createServer(options, (req, res) => {
        this.handleRequest(req as HttpIncomingMessage, res, requestListener)
      }),
      options.listenPort,
      options.requests
    )
    this.cert = options.cert
    this.key = options.key
  }

  public getCaAgent(): https.Agent {
    return new https.Agent({ ca: this.cert })
  }

  public static getDefaultCertAgent(): https.Agent {
    return new https.Agent(HttpsServer.getDefaultClientCerts())
  }

  public static getDefaultClientCerts(): Required<Pick<https.AgentOptions, 'ca' | 'key' | 'cert'>> {
    return {
      ca: localhostCertificate,
      key: clientKey,
      cert: clientCertificate
    }
  }
}
