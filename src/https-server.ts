import https from 'https'

import { HttpIncomingMessage, HttpRequestListener } from './http-common'
import { HttpServerBase } from './http-server-base'

const localhostCertificate = `-----BEGIN CERTIFICATE-----
MIIC/DCCAeQCCQCaq+pPRSkopTANBgkqhkiG9w0BAQsFADBAMQswCQYDVQQGEwJE
SzESMBAGA1UEAwwJbG9jYWxob3N0MR0wGwYJKoZIhvcNAQkBFg50ZXN0QGxvY2Fs
aG9zdDAeFw0xODAxMjEyMDU3MzJaFw0yODAxMTkyMDU3MzJaMEAxCzAJBgNVBAYT
AkRLMRIwEAYDVQQDDAlsb2NhbGhvc3QxHTAbBgkqhkiG9w0BCQEWDnRlc3RAbG9j
YWxob3N0MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApdWZLLnAr0jR
t7KGQKj51/GbBDjIN16I/O4ZlJHxrzOnkoxOrSm+mkh+hTLxEKwsCzPclP/MTg4S
pFsyyhiF8sBfopB/KMmQ1OoT65cG0mZTCv9cv49STvQ2bkEfCdvUWQNp9YX5HBNq
RUlgAQM/AW9uetjhX+aJK0Ot6C5Nnp2rOX7FlW5ruZ64cRjr4pAxVjWI1B0h/Sa1
RPXaOUrVoEaVrZ7I6HO6HVeQVeAgSe0y9b9gtrqx9YxQEdo2lQR8z90ttC7uATDO
WgH5pJ7GWt7utfJksZFcZ/EdTRp10kNqlALZnrEtSNRD47mRloybZ39aBfzIKdUl
i4CeDgnhoQIDAQABMA0GCSqGSIb3DQEBCwUAA4IBAQBsEY0g2JIBmsW6EYVyTqN9
IlBgG0eT//I17/wgvZ6X+8iHK/vk9uIn1qqu7MfBVw9ZHwpA0JA86YCyeEBsh8OD
UxlQA3+ovGpjv39iBfof+MbzQ3QjOvMPuykqbilm/dA9f0tXT6nKOQ7fS6uS6Q5v
EHtkHk+8t1IMAW2NpOfMphGMeAofko5jNTzqyGVMHK1ts6bmkq2iCv+BFJZip5EU
8SIxuHF5v/WAPaS1cl8DGsUxYDIWuIXhZVkmHYDux6TMyV9HtAEmvhm9Hh86ayi0
ZP60ZUsPY4r3yAn0b2PvY1wmYGOgeWnBdHx593/gsUthBYoMRVPv4OTqClJTqMGk
-----END CERTIFICATE-----`

const localhostKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCl1ZksucCvSNG3
soZAqPnX8ZsEOMg3Xoj87hmUkfGvM6eSjE6tKb6aSH6FMvEQrCwLM9yU/8xODhKk
WzLKGIXywF+ikH8oyZDU6hPrlwbSZlMK/1y/j1JO9DZuQR8J29RZA2n1hfkcE2pF
SWABAz8Bb2562OFf5okrQ63oLk2enas5fsWVbmu5nrhxGOvikDFWNYjUHSH9JrVE
9do5StWgRpWtnsjoc7odV5BV4CBJ7TL1v2C2urH1jFAR2jaVBHzP3S20Lu4BMM5a
AfmknsZa3u618mSxkVxn8R1NGnXSQ2qUAtmesS1I1EPjuZGWjJtnf1oF/Mgp1SWL
gJ4OCeGhAgMBAAECggEAKTXBUMoARg7Ufs/QaPUU0ULrAMuThZ7qb+BDXxY9dwph
FBvl2UZMZU6qkjMskLYYY9hJcoV2odcBbvJy1qHtd3uyyFUcJGiioyZgOOVY/qQK
8uqug7P8Aj7R3+gy7GJCjLQ6epcGZqG0gO9Q+i9yUsr8K28F4q0JXUT+THplM4sY
f8BRyuU5WiNESY2Z/wxdO+n2nbl1OAZ6vZZsxpSsPHdO71HT/evaOKXq6/pw8+gk
zSmSNXFUhSKJnlcz20w7vDCsBJug0GtW/Sbucyws757tX6oQ5tqpskn3lxzuYfdv
baZfd0z+GYwzEeb8hXAGkGjnPLu4mvsW/rfmX5bFoQKBgQDO+Goq8VTd/bVnNJl7
eftA+2aOh0zq20HNu5EQuCNuQPd7G2WycWNq+cI2PGXcCa1A6Uy2e3ppUCane5ri
6yUZwZNb2Dtjhno+RQ2OHWiNsVRM7niHpsknskRREJrnlICbWkbwYUCSAa3Q758j
4T1FezCJ+020saG2nIqzwH4gvQKBgQDNHoRnqS1C6+hWCJBcHuqyiwwNs8WTELvV
laLfHjogxqcr0h/ioLCsH/dBvJaT4MlhqiKiMuVVh0NI8EXk7k/TGCdMKhyjuS2Y
uDa6p/XdrwubSy3GRDnonVjkPO4hk8dAcsQJN7X/7x50ParZKCT9EoNyDDWUElCj
wJtbRJFstQKBgQDBmV7+EkZXbLXd9zbGaIDc9Qymr+sEGNpBznzQjd4eiMi2MBd9
xlC/xSakwvRo0ehtOo3WeEQ19JJjwdxM/LX0lLz5gZdz7lu0mbUnRV0ChWicmcjG
4v1wk3ER/x1XF/MA3n5S5jWXHdjwAuTylANTVfs+ZoL2Td49ycp4f8u7ZQKBgAsO
wxqHfz4lU5AXxBiDPinD3zF56IPGGiood/BJQ97ydp6hJEDmYr/UtVKg5QkxzAls
z5Mo5T4YHaN3+Hyf8EO0AKJVftfAqtmZzLGBTnrV7e1AP0Z59Rk6Kkmbk0bSHaK2
zSSmETSr4ltn26b7SAswjU9/ov/JgPli770a1DAlAoGAdWqRDR9bgy48FpiqV4CG
YGxOcQftDc/sgWncAqVPdm+LrV0hBKGLB+MZeLaPqmYXy16v7q5YWWwGwAabbFRg
tf3PO/1A+cD/vOd4Kcg98uIIgmMdVxCZaBjzsRb1wp9AKTWIMCvBEii9XmXGkXi2
eG8Nor88jMLTDJoCfYWy+So=
-----END PRIVATE KEY-----
`

// Make sure cert and key are not optional
export type HttpsServerOptions = https.ServerOptions

export class HttpsServer extends HttpServerBase<https.Server> {
  public cert: HttpsServerOptions['cert']
  public key: HttpsServerOptions['key']

  constructor(options: HttpsServerOptions, requestListener: HttpRequestListener) {
    options.cert
    options = { cert: localhostCertificate, key: localhostKey, ...options }
    super(
      'https://localhost',
      https.createServer(options, (req, res) => {
        this.handleRequest(req as HttpIncomingMessage, res, requestListener)
      })
    )
    this.cert = options.cert
    this.key = options.key
  }
}
