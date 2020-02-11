import https from 'https'

import { HttpIncomingMessage, HttpRequestListener } from './http-common'
import { HttpServerBase } from './http-server-base'
import {
  clientCaCertificate,
  clientCertificate,
  clientKey,
  localhostCertificate,
  localhostKey
} from './https-certificates'

export type HttpsServerOptions = https.ServerOptions

export class HttpsServer extends HttpServerBase<https.Server> {
  public cert: HttpsServerOptions['cert']
  public key: HttpsServerOptions['key']
  public caAgent: https.Agent
  public clientCertAgent: https.Agent

  constructor(options: HttpsServerOptions, requestListener: HttpRequestListener) {
    options.cert
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
      })
    )
    this.cert = options.cert
    this.key = options.key
    this.caAgent = new https.Agent({
      ca: options.cert
    })
    this.clientCertAgent = new https.Agent({
      ca: options.cert,
      key: clientKey,
      cert: clientCertificate
    })
  }
}
