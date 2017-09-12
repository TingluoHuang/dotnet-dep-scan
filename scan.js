var p = require('child_process');
var fs = require('fs');
var path = require('path');

var wellKnownDependencies = [
    /libc\.so\.\d/gi,
    /libm\.so\.\d/gi,
    /libstdc\+\+\.so\.\d/gi,
    /libpthread\.so\.\d/gi,
    /linux-vdso\.so\.\d/gi,
    /libgcc_s\.so\.\d/gi,
    /librt\.so\.\d/gi,
    /libdl\.so\.\d/gi,
    /ld-linux-x86-64.so\.\d/gi,
    /libcom_err\.so\.2/gi,
    /libcrypt\.so\.1/gi,
    /libgpg-error\.so\.0/gi,
    /liblzma\.so\.5/gi,
    /libuuid\.so\.1/gi
];

var rootDependencies = [
    'libcoreclr.so',
    'System.Globalization.Native.so',
    'System.IO.Compression.Native.so',
    'System.Net.Http.Native.so',
    'System.Security.Cryptography.Native.OpenSsl.so'
];

var dependencyScanQueue = [];
var currentIndex = 0;

var ldd = function (file) {
    var cl = `ldd "${file}"`;
    var output;
    try {
        output = p.execSync(cl);
    }
    catch (err) {
        throw new Error(`The following command line failed: '${cl}'`);
    }

    output = (output || '').toString().trim();

    var outputs = output.split("\n");
    var deps = [];
    for (var i = 0; i < outputs.length; i++) {
        var dep_path = outputs[i].replace("\t", "").replace(/\(0x[a-z0-9]+\)$/gi, "").trim();
        console.log(dep_path);
        var dep;
        var path;

        // linux-vdso.so.1 =>
        // libdl.so.2 => /lib64/libdl.so.2
        // /lib64/ld-linux-x86-64.so.2
        // libunwind-x86_64.so.8 => not found
        if (dep_path.indexOf('=>') != -1) {
            var splited = dep_path.split('=>', 2);
            if (splited[1].length == 0) {
                console.log('Skip kernel library: ' + dep_path);
            } else if (splited[1].toLowerCase().indexOf('not found') != -1) {
                throw new Error(`The following library is not found: '${splited[0]}'`);
            } else {
                dep = splited[0].trim();
                path = splited[1].trim();
            }
        } else {
            console.log('Skip hardcoded library: ' + dep_path);
        }

        if (dep) {
            if (!skip(dep)) {
                deps.push(path);
            } else {
                console.log(`Skip: '${dep}'`);
            }
        }
    }

    console.log(`Detected ${deps.length} dependencies from ${file}`);
    return deps;
}

var skip = function (file) {
    for (var i = 0; i < wellKnownDependencies.length; i++) {
        if (file.match(wellKnownDependencies[i])) {
            return true;
        }
    }
}


rootDependencies.forEach((dep) => {
    console.log('Scan dependencies for: ' + dep);
    dep = path.join(__dirname, dep);
    if (!fs.existsSync(dep)) {
        throw new Error('File does not exist: ' + dep);
    }

    var ret = ldd(dep);
    ret.forEach((d) => {
        dependencyScanQueue.push(d);
    });
})

while (currentIndex < dependencyScanQueue.length) {
    var candidate = dependencyScanQueue[currentIndex];
    console.log('Scan dependencies for: ' + candidate);

    var dependencies = ldd(candidate);
    dependencies.forEach((dep) => {
        if (dependencyScanQueue.indexOf(dep) == -1) {
            console.log('Add new dependency for: ' + dep);
            dependencyScanQueue.push(dep);
        }
    });

    currentIndex++;
}

console.log('-------------BEGIN DEPENDENCIES-------------');
for (var i = 0; i < dependencyScanQueue.length; i++) {
    console.log(dependencyScanQueue[i]);
}
console.log('-------------END DEPENDENCIES-------------');

var depsDir = path.join(__dirname, 'deps');
if (!fs.existsSync(depsDir)) {
    fs.mkdirSync(depsDir);
}

for (var i = 0; i < dependencyScanQueue.length; i++) {
    var src = dependencyScanQueue[i];
    var dest = path.join(depsDir, path.basename(dependencyScanQueue[i]));
    console.log('Copy ' + src + ' => ' + dest);
    fs.createReadStream(src).pipe(fs.createWriteStream(dest));
}
