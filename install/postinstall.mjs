if (process.env.npm_config_global === "true") {
  try {
    const { completeGlobalInstall } = await import("../dist/install/postinstall.js")
    completeGlobalInstall()
  } catch (error) {
    process.stderr.write(`wcat installation incomplete: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
