const path = require('path')

module.exports = {
    mode: 'production',

    entry: {
        'files_ublcii_viewer-main': path.resolve(__dirname, 'src/main.js'),
    },

    output: {
        path: path.resolve(__dirname, 'js'),
        filename: '[name].js',
    },
}
