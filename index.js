const Core = require('cubic-core')
const API = require('../cubic-api')
const local = require('./config/local.js')
const WebpackServer = require('./controllers/webpack.js')
const endpoints = require('./override/endpoints.js')
const Cookies = require('cookies')
const NativeMiddleware = require('../cubic-api/middleware/native/express.js')
const request = require('request-promise')

class Ui {
  constructor (options) {
    this.config = {
      local: local,
      provided: options || {}
    }
  }

  /**
   * Hook node components for actual logic
   */
  async init () {
    await cubic.use(new API(cubic.config.ui.api))
    await cubic.use(new Core(cubic.config.ui.core))

    // Attach access token from cookie to req
    if (!cubic.config.ui.api.disable) {
      cubic.nodes.ui.api.server.http.app.use((req, res, next) => {
        const cookies = new Cookies(req, res)
        const accessToken = cookies.get(cubic.config.ui.client.accessTokenCookie)
        const refreshToken = cookies.get(cubic.config.ui.client.refreshTokenCookie)

        if (accessToken && !req.headers.authorization) {
          req.access_token = accessToken
          req.headers.authorization = `bearer ${accessToken}`
        }
        if (refreshToken) req.refresh_token = refreshToken

        return next()
      })

      // Move cookie middleware to the beginning of the stack
      const middlewareStack = cubic.nodes.ui.api.server.http.app._router.stack
      middlewareStack.unshift(middlewareStack.pop())

      // Construct new auth middleware
      const newNativeMiddleware = new NativeMiddleware(cubic.nodes.ui.api.server.config)
      newNativeMiddleware.rejectInvalidToken = (req, res, next, err) => {
        if (!req.refresh_token) {
          return res.status(400).json({
            error: 'Invalid Token',
            reason: err
          })
        }

        request({
          method: 'POST',
          uri: cubic.config.ui.core.authUrl + '/refresh',
          body: {
            refresh_token: req.refresh_token
          },
          json: true
        }).then((body) => {
          const accessToken = body.access_token
          console.log(accessToken)
          if (!accessToken) {
            return res.status(400).json({
              error: 'Invalid Token',
              reason: body
            })
          }

          delete req.refresh_token
          req.access_token = accessToken
          req.headers.authorization = `bearer ${accessToken}`

          return newNativeMiddleware.auth(req, res, next)
        })
      }

      // Replace old with new auth
      cubic.nodes.ui.api.server.http.app.use(newNativeMiddleware.auth.bind(newNativeMiddleware))
      let index = middlewareStack.findIndex((obj) => { return obj.name === 'bound auth' })
      middlewareStack.splice(index, 1, middlewareStack.pop())
    }

    // Build webpack bundles
    if (!cubic.config.ui.core.disable) {
      const controller = cubic.nodes.ui.core.client.endpointController
      endpoints.override(controller)
      endpoints.rebuild(controller)
      cubic.nodes.ui.core.webpackServer = new WebpackServer()
    }
  }
}

module.exports = Ui
