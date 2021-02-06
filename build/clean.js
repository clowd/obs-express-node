const fs = require('fs');
const path = require('path');

function deleteFolderRecursive(directoryPath) {
    if (fs.existsSync(directoryPath)) {
        fs.readdirSync(directoryPath).forEach((file, index) => {
            const curPath = path.join(directoryPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                // recurse
                deleteFolderRecursive(curPath);
            } else {
                // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(directoryPath);
    }
}

function del(d) {
    const p = path.join(__dirname, d);
    if (fs.existsSync(p)) {
        deleteFolderRecursive(p);
        console.log("Deleted: " + p);
    } else {
        console.log("Skipping: " + p);
    }
}

console.log("Cleaning runtime artifacts:")
del("../bin");
del("../obs-data");