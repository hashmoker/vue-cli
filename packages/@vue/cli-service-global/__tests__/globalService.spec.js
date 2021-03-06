jest.setTimeout(40000)

const fs = require('fs')
const path = require('path')
const portfinder = require('portfinder')
const { createServer } = require('http-server')
const mkdirp = require('mkdirp')
const execa = require('execa')
const serve = require('@vue/cli-test-utils/serveWithPuppeteer')
const launchPuppeteer = require('@vue/cli-test-utils/launchPuppeteer')

const cwd = path.resolve(__dirname, 'temp')
const binPath = require.resolve('@vue/cli/bin/vue')
const sleep = n => new Promise(resolve => setTimeout(resolve, n))
const write = (file, content) => fs.writeFileSync(path.join(cwd, file), content)

const entryVue = `
<template>
  <h1>{{ msg }}</h1>
</template>
<script>
  export default {
    data: () => ({ msg: 'hi' })
  }
</script>
<style>
h1 { color: red }
</style>
`.trim()

const entryJs = `
import Vue from 'vue'
import App from './Other.vue'

new Vue({ render: h => h(App) }).$mount('#app')
`.trim()

beforeAll(() => {
  mkdirp.sync(cwd)
  write('App.vue', entryVue)
  write('Other.vue', entryVue)
  write('foo.js', entryJs)
})

test('global serve', async () => {
  await serve(
    () => execa(binPath, ['serve'], { cwd }),
    async ({ nextUpdate, helpers }) => {
      expect(await helpers.getText('h1')).toMatch('hi')
      write('App.vue', entryVue.replace(`{{ msg }}`, 'Updated'))
      await nextUpdate() // wait for child stdout update signal
      await sleep(1000) // give the client time to update
      expect(await helpers.getText('h1')).toMatch(`Updated`)
    }
  )
})

let server, browser, page
test('global build', async () => {
  const { stdout } = await execa(binPath, ['build', 'foo.js'], { cwd })

  expect(stdout).toMatch('Build complete.')

  const distDir = path.join(cwd, 'dist')
  const hasFile = file => fs.existsSync(path.join(distDir, file))
  expect(hasFile('index.html')).toBe(true)
  expect(hasFile('js')).toBe(true)
  expect(hasFile('css')).toBe(true)

  const port = await portfinder.getPortPromise()
  server = createServer({ root: distDir })

  await new Promise((resolve, reject) => {
    server.listen(port, err => {
      if (err) return reject(err)
      resolve()
    })
  })

  const launched = await launchPuppeteer(`http://localhost:${port}/`)
  browser = launched.browser
  page = launched.page

  const h1Text = await page.evaluate(() => {
    return document.querySelector('h1').textContent
  })

  expect(h1Text).toMatch('hi')
})

afterAll(async () => {
  await browser.close()
  server.close()
})
