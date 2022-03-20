const _ = require('lodash');
const copy = require('copy');
const path = require('path');
const fs = require('fs');

function cb(err, files) {
    if (err) throw err;
    if (_.isArray(files)) {
        console.log(`copied ${files.length} files`);
    }
}

function deleteRegex(p, regex)
{
    fs.readdirSync(p)
        .filter(f => regex.test(f))
        .map(f => path.join(p, f))
        .map(f => {fs.unlinkSync(f); console.log(`deleted '${f}'.`) });
}

function deleteFolder(dir)
{
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`deleted '${dir}'.`);
}

// copy all needed files into top level directory
copy(path.join(__dirname, '../node_modules/@streamlabs/obs-studio-node/**/*.node'), path.join(__dirname, '../bin'), cb);
copy(path.join(__dirname, '../build/Release/**/*.node'), path.join(__dirname, '../bin'), cb);
copy(path.join(__dirname, '../tracker.png'), path.join(__dirname, '../bin'), cb);
copy(path.join(__dirname, '../package.json'), path.join(__dirname, '../bin'), cb);
copy(path.join(__dirname, '../LICENSE'), path.join(__dirname, '../bin'), cb);

// copy obs-studio-node to /lib and remove the files we don't need
const obsLib = path.join(__dirname, '../bin/lib');
const obsPlugins = path.join(obsLib, 'obs-plugins/64bit');
const obsPluginsLocale = path.join(obsPlugins, 'locales');
copy(path.join(__dirname, '../node_modules/@streamlabs/obs-studio-node/**/*'), obsLib, (err, files) => {
    cb(err, files);
    deleteRegex(obsLib, /\.(pdb|js|ts|bak|json|lib)$/);
    deleteRegex(obsLib, /^crashpad/);
    deleteRegex(obsPlugins, /icudtl.dat/);
    deleteRegex(obsPlugins, /.*(cef|browser|v8|devtools|chrome|rtmp|text).*/);
    deleteRegex(obsPlugins, /\.(pdb|js|ts|bak|json|lib)$/);
    deleteRegex(obsPlugins, /^lib/);
    deleteRegex(obsPlugins, /bin$/);
    deleteRegex(obsPluginsLocale, /^[^e][^n]/);
    deleteFolder(path.join(obsLib, "include"));
    deleteFolder(path.join(obsLib, "lib"));
    deleteFolder(path.join(obsLib, "resources"));
    deleteFolder(path.join(obsLib, "data", "obs-plugins", "obs-browser"));
    deleteFolder(path.join(obsLib, "data", "obs-plugins", "obs-text"));
    deleteFolder(path.join(obsLib, "data", "obs-plugins", "rtmp-services"));
    deleteFolder(path.join(obsLib, "data", "obs-plugins", "text-freetype2"));
    deleteRegex(path.join(obsLib, "data", "obs-plugins", "obs-virtualoutput","obs-virtualsource_32bit"), /\.pdb$/);
});