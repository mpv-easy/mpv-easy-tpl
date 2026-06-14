import { decode, encode, Fmt, File } from "@easy-install/easy-archive"
import { name } from "../package.json"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, basename } from "node:path"

const oscUrl =
  "https://raw.githubusercontent.com/ahaoboy/mpv-easy-cdn/main/mpv-v3-windows.tar.xz"
const cacheDir = "./.cache"
const cachePath = join(cacheDir, basename(oscUrl))
const fileName = name.split("/").at(-1)!
const scriptPath = `portable_config/scripts/${fileName}.js`
const es5Path = `./es5/${fileName}.js`
const outputPath = `./${fileName}-osc.zip`

async function fetchOsc(): Promise<Uint8Array> {
  if (existsSync(cachePath)) {
    console.log(`Using cached OSC: ${cachePath}`)
    return new Uint8Array(await readFile(cachePath))
  }

  console.log(`Downloading OSC from ${oscUrl} ...`)
  const response = await fetch(oscUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch OSC: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const data = new Uint8Array(arrayBuffer)

  await mkdir(cacheDir, { recursive: true })
  await writeFile(cachePath, data)
  console.log(`OSC cached to ${cachePath}`)
  return data
}

async function main() {
  const oscData = await fetchOsc()
  const files = decode(Fmt.TarXz, oscData)
  if (!files) {
    throw new Error("Failed to decode OSC archive")
  }

  const jsBuffer = new Uint8Array(await readFile(es5Path))
  files.push(new File(scriptPath, jsBuffer, null, false, null))

  const content = encode(Fmt.Zip, files)
  if (!content) {
    throw new Error("Failed to encode output archive")
  }

  await writeFile(outputPath, content)
  console.log(`${fileName}-osc.zip created`)
}

main().catch((error) => {
  console.error("build-osc failed:", error)
  process.exit(1)
})
