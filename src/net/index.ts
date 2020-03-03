import net from 'net'

export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', error => {
      server.close()
      reject(error)
    })
    server.listen(0, () => {
      const port = (server.address() as net.AddressInfo).port
      server.close()
      if (!port) {
        reject(new Error("Unable to get the server's given port"))
      } else {
        resolve(port)
      }
    })
  })
}
