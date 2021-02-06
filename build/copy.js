var copy = require('copy');
var _ = require('lodash');
const fs = require('fs');
const path = require('path');

function cb(err, files) {
    if (err) throw err;
    if (_.isArray(files)) {
        console.log(`copied ${files.length} files`);
    } else {
        throw new Error("Unknown error copying files")
    }
}

copy(path.join(__dirname, '../node_modules/obs-studio-node/**/*[!pdb]'), path.join(__dirname, '../bin/lib'), cb);
copy(path.join(__dirname, '../node_modules/obs-studio-node/**/*.node'), path.join(__dirname, '../bin'), cb);
copy(path.join(__dirname, '../node_modules/electron-screen/build/Release/**/*.node'), path.join(__dirname, '../bin'), cb);