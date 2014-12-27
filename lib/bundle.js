'use strict';

var _ = require('lodash');
var amd = require('./amd');
var crypto = require('crypto');

/**
 * Calculate a unique bundle name, given a list of main modules that depend on
 * its contents.
 */
function generateBundleName(mains) {
    // Join mains into a string.
    var joinedMains = mains.sort().join('-');

    // Create hash.
    var hash = crypto.createHash('md5').update(joinedMains).digest('hex');

    // Replace any special chars.
    joinedMains = joinedMains.replace(/\/|\\|\./g, '_');

    // Truncate and append hash.
    var bundleName = joinedMains.slice(0, 16) + '-' + hash.slice(0, 6);
    return bundleName;
}

/**
 * Converts a module path to the alias used - the reverse mapping of the
 * `paths:` setting in RequireJS configuration.
 *
 * This seems to be necessary because the RequireJS optimizer breaks when it
 * sees more than one kind of reference to a module.
 */
function convertToAlias(id) {
    // TODO: This should be read from the require-config module.
    var paths = {
        ejs: 'requirejs-plugins/requirejs-canjs-templates/ejs',
        mustache: 'requirejs-plugins/requirejs-canjs-templates/mustache',
        stache: 'requirejs-plugins/requirejs-canjs-templates/stache',
        text: 'requirejs-plugins/text/text'
    }
    var invertedPaths = _.invert(paths);
    if (invertedPaths[id]) {
        return invertedPaths[id];
    }
    else {
        return id;
    }
}

/**
 * Calculate bundles from list of main modules and duplicates.
 *
 * Modules should be same as modules: used in requirejs config options.
 *
 * Duplicates looks like:
 * {
 *      "jquery/jquery.js": ["pages/page1.js", "pages/page2.js"]
 * }
 *
 * The output should be:
 * {
 *      "bundles: {
 *          "bundle1": ["jquery"],
 *          "bundle2": ["lodash"]
 *      },
 *      "modules: [{
 *          "name": "bundle1",
 *          "include": ["jquery"]
 *      }, {
 *          "name": "bundle2",
 *          "include": ["lodash"]
 *      }, {
 *          "name": "pages/page1",
 *          "exclude": ["bundle1", "bundle2"]
 *      }, {
 *          "name": "pages/page2",
 *          "exclude": ["bundle1", "bundle2"]
 *      }]
 * }
 */
function calculateBundles(modules, duplicates) {

    // Remember all dependency IDs that we see.
    var allDependencies = [];

    // Each module that is duplicated, is a module shared by two or more mains.
    // So we group the duplicates into bundles, grouped by the set of mains that
    // share them.
    var bundles = {};
    _.forIn(duplicates, function(dependentMains, dependencyPath) {
        // If we don't convert to a module ID, the output bundles config
        // doesn't match anything when it comes to loading the shared modules...
        var dependencyId = amd.modulePathToId(dependencyPath);

        // This seems to be necessary because the RequireJS optimizer breaks
        // when it sees more than one kind of reference to a module.
        dependencyId = convertToAlias(dependencyId);

        // Bundle name must be unique for each set of dependent mains, that's
        // how we group them.
        var bundleName = generateBundleName(dependentMains);
        // If the bundle doesn't exist yet, create one.
        if (!bundles[bundleName]) {
            bundles[bundleName] = [];
        }
        // Add the dependency into to the bundle.
        bundles[bundleName].push(dependencyId);
        // Remember all dependencies.
        allDependencies.push(dependencyId);
    });

    // Get a list of all the bundleNames.
    var bundleNames = _.map(bundles, function(dependencies, bundleName) {
        return bundleName;
    });

    // Exclude contents of all bundles, from each of the mains. This prevents
    // including of the bundled shared modules into the mains.
    _.forEach(modules, function(module) {
        if (!module.exclude) {
            module.exclude = [];
        }
        module.exclude = module.exclude.concat(bundleNames);
    });

    // Register each of the bundles as a module. This tells the optimizer to
    // create each bundle, and to package the right shared modules into it.
    // To prevent shared modules being duplicated inbetween bundles, we
    // exclude all other dependencies not belonging to this bundle.
    _.forIn(bundles, function(dependencies, bundleName) {
        modules.unshift({
            create: true,
            name: bundleName,
            include: dependencies,
            excludeShallow: _.difference(allDependencies, dependencies)
        });
    });

    // And we're done.
    return {
        bundles: bundles,
        modules: modules
    }
}

module.exports = {
    calculateBundles: calculateBundles,
    generateBundleName: generateBundleName
}