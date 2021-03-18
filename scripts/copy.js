const _ = require('lodash');
const copy = require('copy');
const path = require('path');

function cb(err, files) {
    if (err) throw err;
    if (_.isArray(files)) {
        console.log(`copied ${files.length} files`);
    }
}

copy(path.join(__dirname, '../node_modules/@streamlabs/obs-studio-node/**/*[!pdb]'), path.join(__dirname, '../bin/lib'), cb);
copy(path.join(__dirname, '../node_modules/@streamlabs/obs-studio-node/**/*.node'), path.join(__dirname, '../bin'), cb);
copy(path.join(__dirname, '../build/Release/**/*.node'), path.join(__dirname, '../bin'), cb);
copy(path.join(__dirname, '../tracker.png'), path.join(__dirname, '../bin'), cb);
copy(path.join(__dirname, '../package.json'), path.join(__dirname, '../bin'), cb);
copy(path.join(__dirname, '../LICENSE'), path.join(__dirname, '../bin'), cb);