const isProd = blitz.config.local.environment !== "development"
const fs = require('fs')

// Plugins
const webpack = require('webpack')
const ExtractTextPlugin = require("extract-text-webpack-plugin")
const extractSass = new ExtractTextPlugin({
  filename: "[name].[contenthash].css",
  allChunks: true,
  disable: !isProd
})
const vueConfig = require('./vue.config.js')(extractSass)

// Dependencies need to be handled differently in debug (see webpack resolve)
let isDebug = false
try {
  fs.statSync(__dirname + '/../../../../node_modules')
} catch(err) {
  isDebug = true
}

// Actual config
module.exports = {

  // Output file which will be loaded by Vue (server & client side)
  output: {
    path: blitz.config.view.core.publicPath,
    publicPath: "/",
    filename: isProd ? "[name].bundle.[chunkhash].js" : "[name].bundle.js"
  },

  // Loaders which determine how file types are interpreted
  module: {
    rules: [
      // This is our main loader for vue files
      {
        test: /\.vue$/,
        loader: "vue-loader",
        options: vueConfig
      },
      // SCSS compiler with extract-text-webpack-plugin to generate one css file
      // from everything required for the current page
      {
        test: /\.s?[a|c]ss$/,
        use: isProd ? extractSass.extract({
          use: [{
            loader: "sass-loader"
          }],
          fallback: "style-loader"
        }) : "sass-loader"
      },
      // Transpile ES6/7 into older versions for better browser support
      {
        test: /\.js$/,
        loader: 'babel-loader',
        exclude: /node_modules/
      },
      // Minify images
      {
        test: /\.(jpe?g|png|gif|svg)$/i,
        loaders: [
          "file-loader?hash=sha512&digest=hex&name=[hash].[ext]",
          {
            loader: 'image-webpack-loader',
            query: {
              mozjpeg: {
                progressive: true,
                quality: 100
              },
              gifsicle: {
                interlaced: false
              },
              optipng: {
                optimizationLevel: 4
              },
              pngquant: {
                quality: 50 - 70,
                speed: 3
              },
              svgo: {}
            }
          }
        ]
      }
    ]
  },

  // Change how modules are resolved. (Places to look in, alias, etc)
  resolve: {
    // Resolve dependencies differently when in debug due to source code folder
    // being different from current working directory
    alias: Object.assign({
      src: blitz.config.view.core.sourcePath,
      public: blitz.config.view.core.publicPath,
    }, isDebug ? {
      // HMR will trigger a second vue instance without this
      vue: __dirname + "/../../node_modules/vue"
    } : {})
  },

  // Plugins for post-bundle operations
  plugins: (isProd ? [
    new webpack.EnvironmentPlugin('NODE_ENV'),
  ] : [])
  .concat([
    extractSass,
    new webpack.DefinePlugin({
      '$api_url': JSON.stringify(blitz.config.view.client.api),
      '$auth_url': JSON.stringify(blitz.config.view.client.auth)
    })
  ])
}
