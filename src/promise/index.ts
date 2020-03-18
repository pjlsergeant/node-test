export async function waitFor<T>(promise: Promise<T>, timeout: number): Promise<T | null> {
  let timeoutHandle!: NodeJS.Timeout
  const timeoutPromise = new Promise<null>(resolve => {
    timeoutHandle = setTimeout(() => {
      resolve(null)
    }, timeout)
  })
  try {
    return await Promise.race([timeoutPromise, promise])
  } finally {
    clearTimeout(timeoutHandle)
  }
}
